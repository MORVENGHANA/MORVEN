# MORVEN

MORVEN is a plain HTML, CSS, and JavaScript storefront built around the idea of building a legacy. The verification service lives in `server/` and uses Firebase Firestore when credentials are present, with a local demo code (`MVN24001`) for development.

## Storefront

```bash
npm run dev
```

Open `http://localhost:3000` locally, or `https://morven.onrender.com` when deployed. The storefront is served by the dependency-free `static-server.js` file.

## Verification API

```bash
cd server
npm install
copy .env.example .env
npm run dev
```

The API runs on `http://localhost:4000`. Test the local fallback with:

```bash
curl -X POST http://localhost:4000/api/verify -H "Content-Type: application/json" -d "{\"code\":\"MVN24001\"}"
```

### Paystack checkout

Add the Paystack secret key directly to `server/.env` and restart the API:

```env
PAYSTACK_SECRET_KEY=sk_test_your_secret_key_here
PAYSTACK_CALLBACK_URL=https://morven.onrender.com/payment-success.html
```

The cart sends validated items and the customer's receipt email to the API. The API initializes a GHS transaction in pesewas and redirects the customer to Paystack's hosted checkout. Never put `PAYSTACK_SECRET_KEY` in browser code or commit it to the repository.

For Render, set `STOREFRONT_ORIGIN` and `APP_URL` to `https://morven.onrender.com`. The backend API still needs its own Render Web Service URL unless the Render service is configured to proxy API requests.

### Admin

Create the administrator account in Firebase Authentication using the approved administrator email, then set the password there. Set `ADMIN_EMAIL` to that same email in `server/.env`. The admin signs in through `login.html` and is redirected to `admin.html`, where products, users, and orders are managed. Admin API access is enforced with Firebase ID tokens on the server; the password is never stored in this project.

For production, create a `verificationCodes` Firestore collection keyed by the printed code. Each document should include `product`, `status` (`active` or another review status), and optionally `scans`.
