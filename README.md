# Shawarma-Hezi

## Production SMS Flow

Customer orders are written by the GitHub Pages frontend into Firestore collection `orders`.
A Firebase Cloud Function (`onOrderCreatedSendSms`) listens to `orders/{orderId}` and sends SMS through Twilio.

SMS text:
`הזמנתך התקבלה - חזי בצומת`

Project ID:
`itziks-cart`

## CI Deploy (Service Account)

GitHub Actions deploy file:
- `.github/workflows/firebase-deploy.yml`

### Required GitHub Secrets

Add these in:
GitHub -> Settings -> Secrets and variables -> Actions

- `FIREBASE_SERVICE_ACCOUNT_JSON_B64`
- OR `GOOGLE_APPLICATION_CREDENTIALS_JSON` (raw JSON)
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`

### Create FIREBASE_SERVICE_ACCOUNT_JSON_B64

1. Firebase Console -> Project settings -> Service accounts
2. Click "Generate new private key"
3. Save the JSON file locally
4. Base64-encode the full JSON and store the result in `FIREBASE_SERVICE_ACCOUNT_JSON_B64`

PowerShell example:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('C:\path\to\service-account.json'))
```

macOS/Linux example:

```bash
base64 -w 0 /path/to/service-account.json
```

## Twilio Firebase Functions Secrets

The workflow updates Firebase Functions runtime secrets on each deploy (before deploy command):

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`

No Twilio secret is stored in source code.

## Deploy

Manual:
1. GitHub -> Actions -> `Firebase Deploy`
2. Click `Run workflow`

Automatic:
- Push to `main` with changes under:
  - `functions/**`
  - `firestore.rules`
  - `.firebaserc`
  - `firebase.json`

Deploy command used by workflow:

```bash
firebase deploy --only functions,firestore:rules --project itziks-cart --non-interactive
```

## Verification Checklist

1. Firebase Console -> Build -> Functions: `onOrderCreatedSendSms` is active.
2. Place a test order from production site with valid phone (`05xxxxxxxx`).
3. Confirm SMS was received.
4. In Firestore order doc verify fields:
   - `smsSent`
   - `smsStatus`
   - `smsSid`
   - `smsSentAt`
   - `smsError`

## Notes

- Frontend project config is in `src/firebase.js` and points to `itziks-cart`.
- Order payload is written to collection `orders` and includes phone keys compatible with SMS function:
  - `phone`
  - `customerPhone`
  - `customer.phone`
