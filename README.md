# Shawarma-Hezi

## Deploy SMS (Twilio)

This repo sends an SMS after a new order is created in Firestore collection `orders`.

Function name: `onOrderCreatedSendSms`
Message text: `הזמנתך התקבלה - חזי בצומת`
Project: `itziks-cart`

### 1) Generate FIREBASE_TOKEN locally (interactive, one-time)

Run these on your own machine terminal (not CI):

```bash
npx firebase-tools login:ci
```

Copy the token printed in terminal.

### 2) Add GitHub repository secrets

In GitHub -> Settings -> Secrets and variables -> Actions, add:

- `FIREBASE_TOKEN`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`

Note: Twilio secrets are kept in GitHub for convenience, but Firebase Functions reads runtime secrets from Firebase Secret Manager.

### 3) Set Firebase Functions secrets (one-time, interactive)

Run locally while logged in to Firebase:

```bash
firebase functions:secrets:set TWILIO_ACCOUNT_SID --project itziks-cart
firebase functions:secrets:set TWILIO_AUTH_TOKEN --project itziks-cart
firebase functions:secrets:set TWILIO_FROM_NUMBER --project itziks-cart
```

### 4) Trigger deploy via GitHub Actions

- Open GitHub -> Actions -> `Deploy Firebase`
- Click `Run workflow`

The workflow deploys:

```bash
firebase deploy --only functions,firestore:rules --project itziks-cart --non-interactive
```

### 5) Verify deployment

- Firebase Console -> Build -> Functions: `onOrderCreatedSendSms` is active.
- Firebase Console -> Firestore -> `orders` collection exists.

### 6) Smoke test

1. Place a new order with phone `05xxxxxxxx`.
2. Confirm SMS was received.
3. Confirm Firestore order fields were updated:
   - `smsSent: true`
   - `smsSentAt: <timestamp>`
   - `smsError: null`

If phone is invalid, function skips send and writes:

- `smsSent: false`
- `smsSentAt: <timestamp>`
- `smsError: "invalid_phone"`

## Notes

- Function trigger path: `orders/{orderId}`
- Function uses Twilio secrets: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
- Phone keys checked in order doc: `phone`, `phoneNumber`, `customerPhone`, `customer.phone`
