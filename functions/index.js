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

  let normalized = trimmed.replace(/[^\d+]/g, '');
  if (normalized.startsWith('00')) {
    normalized = `+${normalized.slice(2)}`;
  }

  if (normalized.startsWith('+')) {
    const e164 = `+${normalized.slice(1).replace(/\D/g, '')}`;
    return /^\+9725\d{8}$/.test(e164) ? e164 : null;
  }

  const digitsOnly = normalized.replace(/\D/g, '');
  if (/^05\d{8}$/.test(digitsOnly)) {
    return `+972${digitsOnly.slice(1)}`;
  }
  if (/^9725\d{8}$/.test(digitsOnly)) {
    return `+${digitsOnly}`;
  }

  return null;
}

function getOrderPhone(orderData) {
  if (typeof orderData?.customer?.phone === 'string') {
    return orderData.customer.phone;
  }
  if (typeof orderData?.phone === 'string') {
    return orderData.phone;
  }
  return '';
}

function sanitizeErrorMessage(error) {
  const message = typeof error?.message === 'string' ? error.message.trim() : 'unknown_error';
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

    try {
      const latestSnapshot = await orderRef.get();
      if (!latestSnapshot.exists) {
        logger.warn('Order document missing in onCreate trigger.', { orderId });
        return;
      }

      const orderData = latestSnapshot.data() || {};
      if (orderData.smsStatus === 'sent' || orderData.smsSentAt) {
        logger.info('SMS already marked as sent, skipping duplicate send.', { orderId });
        return;
      }

      const normalizedPhone = normalizeIsraeliPhone(getOrderPhone(orderData));
      if (!normalizedPhone) {
        await orderRef.set(
          {
            smsStatus: 'invalid_phone',
            smsError: 'invalid_phone_format',
            smsSentAt: FieldValue.delete(),
          },
          { merge: true },
        );
        logger.warn('Invalid order phone, SMS skipped.', {
          orderId,
          rawPhone: getOrderPhone(orderData),
        });
        return;
      }

      const twilioClient = twilio(
        TWILIO_ACCOUNT_SID.value(),
        TWILIO_AUTH_TOKEN.value(),
      );
      const fromNumber = TWILIO_FROM_NUMBER.value();

      await twilioClient.messages.create({
        to: normalizedPhone,
        from: fromNumber,
        body: SMS_TEXT,
      });

      await orderRef.set(
        {
          smsStatus: 'sent',
          smsError: FieldValue.delete(),
          smsSentAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      logger.info('Order SMS sent successfully.', { orderId, to: normalizedPhone });
    } catch (error) {
      const smsError = sanitizeErrorMessage(error);
      logger.error('Failed to send order SMS.', { orderId, smsError });
      await orderRef.set(
        {
          smsStatus: 'failed',
          smsError,
          smsSentAt: FieldValue.delete(),
        },
        { merge: true },
      );
    }
  },
);
