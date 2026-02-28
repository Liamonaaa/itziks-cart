# Shawarma-Hezi Firebase SMS Setup

This project uses Firebase Cloud Functions to send an SMS when a new order is created in Firestore.

## What was added

- Function: `onOrderCreatedSendSms`
- Trigger: Firestore `orders/{orderId}` on create
- Provider: Twilio
- SMS text: `הזמנתך התקבלה - חזי בצומת`
- Order status fields written by server:
  - `smsStatus`: `sent | failed | invalid_phone`
  - `smsError`: string (on failure/invalid)
  - `smsSentAt`: server timestamp (when sent)

## Phone normalization

The function accepts:

- `05xxxxxxxx` -> converted to `+9725xxxxxxx`
- `+9725xxxxxxx` -> kept as-is
- `9725xxxxxxx` -> converted to `+9725xxxxxxx`

Invalid values are not sent and are marked with `smsStatus="invalid_phone"`.

## Setup Twilio secrets

Run from project root:

```bash
firebase functions:secrets:set TWILIO_ACCOUNT_SID
firebase functions:secrets:set TWILIO_AUTH_TOKEN
firebase functions:secrets:set TWILIO_FROM_NUMBER
```

Notes:

- `TWILIO_FROM_NUMBER` must be a Twilio SMS-capable number in E.164 format (example: `+12025550123`).
- Never commit secret values to git.

## Install and deploy

```bash
cd functions
npm install
cd ..
firebase deploy --only functions:onOrderCreatedSendSms,firestore:rules
```

## Smoke test checklist

1. Place a new order with phone `05xxxxxxxx`.
2. Confirm SMS is received: `הזמנתך התקבלה - חזי בצומת`.
3. Confirm Firestore order doc has:
   - `smsStatus: "sent"`
   - `smsSentAt` timestamp
4. Try an invalid phone and confirm:
   - `smsStatus: "invalid_phone"`
   - `smsError: "invalid_phone_format"`
