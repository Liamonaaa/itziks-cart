const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const twilio = require('twilio');

admin.initializeApp();

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

const SMS_TEXT = 'הזמנתך התקבלה - חזי בצומת';

const TWILIO_ACCOUNT_SID = defineSecret('TWILIO_ACCOUNT_SID');
const TWILIO_AUTH_TOKEN = defineSecret('TWILIO_AUTH_TOKEN');
const TWILIO_FROM_NUMBER = defineSecret('TWILIO_FROM_NUMBER');

function normalizeIsraeliPhone(rawPhone) {
  if (typeof rawPhone !== 'string') return null;

  const trimmed = rawPhone.trim();
  if (!trimmed) return null;

  let normalized = trimmed.replace(/[\s\-()]/g, '');
  if (normalized.startsWith('00')) {
    normalized = `+${normalized.slice(2)}`;
  }

  if (normalized.startsWith('+972')) {
    return /^\+972\d{9}$/.test(normalized) ? normalized : null;
  }

  if (/^0\d{9}$/.test(normalized)) {
    return `+972${normalized.slice(1)}`;
  }

  if (/^972\d{9}$/.test(normalized)) {
    return `+${normalized}`;
  }

  return null;
}

function getOrderPhone(orderData) {
  if (typeof orderData?.phone === 'string') return orderData.phone;
  if (typeof orderData?.customerPhone === 'string') return orderData.customerPhone;
  if (typeof orderData?.phoneNumber === 'string') return orderData.phoneNumber;
  if (typeof orderData?.customer?.phone === 'string') return orderData.customer.phone;
  return '';
}

function sanitizeErrorMessage(error) {
  const message =
    typeof error?.message === 'string' ? error.message.trim() : 'unknown_error';
  return message.slice(0, 500);
}

exports.onOrderCreatedSendSms = onDocumentCreated(
  {
    document: 'orders/{orderId}',
    region: 'europe-west1',
    secrets: [TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER],
  },
  async (event) => {
    const { orderId } = event.params;
    const orderRef = db.collection('orders').doc(orderId);
    let rawPhone = '';
    let normalizedPhone = null;

    try {
      const latestSnapshot = await orderRef.get();
      if (!latestSnapshot.exists) {
        logger.warn('Order doc missing in SMS trigger.', { orderId });
        return;
      }

      const orderData = latestSnapshot.data() || {};
      if (orderData.smsSent === true || orderData.smsSentAt) {
        logger.info('SMS already sent, skipping duplicate execution.', { orderId });
        return;
      }

      rawPhone = getOrderPhone(orderData);
      normalizedPhone = normalizeIsraeliPhone(rawPhone);
      if (!normalizedPhone) {
        logger.warn('Invalid phone; SMS skipped.', {
          orderId,
          rawPhone,
          normalizedPhone,
        });
        await orderRef.set(
          {
            smsSent: false,
            smsSentAt: FieldValue.serverTimestamp(),
            smsError: 'invalid_phone',
            smsStatus: 'invalid_phone',
            smsSid: null,
          },
          { merge: true },
        );
        return;
      }

      const client = twilio(
        TWILIO_ACCOUNT_SID.value(),
        TWILIO_AUTH_TOKEN.value(),
      );

      const twilioMessage = await client.messages.create({
        to: normalizedPhone,
        from: TWILIO_FROM_NUMBER.value(),
        body: SMS_TEXT,
      });

      await orderRef.set(
        {
          smsSent: true,
          smsSentAt: FieldValue.serverTimestamp(),
          smsError: null,
          smsStatus: 'sent',
          smsSid: twilioMessage.sid || null,
        },
        { merge: true },
      );

      logger.info('Order SMS sent.', {
        orderId,
        rawPhone,
        normalizedPhone,
        to: normalizedPhone,
        smsSid: twilioMessage.sid || null,
      });
    } catch (error) {
      const smsError = sanitizeErrorMessage(error);
      logger.error('Order SMS failed.', {
        orderId,
        rawPhone,
        normalizedPhone,
        smsError,
        twilioCode: error?.code || null,
        twilioStatus: error?.status || null,
        twilioMoreInfo: error?.moreInfo || null,
        errorStack: error?.stack || null,
      });
      await orderRef.set(
        {
          smsSent: false,
          smsSentAt: FieldValue.serverTimestamp(),
          smsError,
          smsStatus: 'failed',
          smsSid: null,
        },
        { merge: true },
      );
    }
  },
);
