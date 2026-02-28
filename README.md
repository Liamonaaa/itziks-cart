# Shawarma-Hezi

## Deploy SMS (Twilio)

This repo sends an SMS after a new order is created in Firestore collection `orders`.

Function name: `onOrderCreatedSendSms`
Message text: `הזמנתך התקבלה - חזי בצומת`
Project: `itziks-cart`

## CI Deploy (Service Account)

### 1) Create Firebase Service Account Key (one-time)

In Firebase Console:

1. Go to **Project settings**.
2. Open **Service accounts** tab.
3. Click **Generate new private key**.
4. Download the JSON file.

Copy the entire JSON content.

### 2) Add GitHub repository secret for CI auth

In GitHub -> **Settings** -> **Secrets and variables** -> **Actions**, add:

- `GOOGLE_APPLICATION_CREDENTIALS_JSON` = full service-account JSON content

### 3) Add Twilio GitHub secrets

In the same GitHub secrets screen, add:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`

### 4) Set Firebase Functions runtime secrets (one-time, local interactive)

Run locally while logged in to Firebase:

```bash
firebase functions:secrets:set TWILIO_ACCOUNT_SID --project itziks-cart
firebase functions:secrets:set TWILIO_AUTH_TOKEN --project itziks-cart
firebase functions:secrets:set TWILIO_FROM_NUMBER --project itziks-cart
```

### 5) Trigger deploy via GitHub Actions

- Open GitHub -> Actions -> `Deploy Firebase`
- Click `Run workflow`

The workflow deploys:

```bash
firebase deploy --project itziks-cart --only functions,firestore:rules --non-interactive
```

### 6) Verify deployment

- Firebase Console -> Build -> Functions: `onOrderCreatedSendSms` is active.
- Firebase Console -> Firestore -> `orders` collection exists.

### 7) Smoke test

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
