# MORVEN

MORVEN is a plain HTML, CSS, and JavaScript storefront built around the idea of building a legacy. The verification service lives in `server/` and uses Firebase Firestore when credentials are present, with a local demo code (`MVN24001`) for development.

## Storefront

```bash
npm run dev
```

Open `http://localhost:3000`. The storefront is served by the dependency-free `static-server.js` file.

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

For production, create a `verificationCodes` Firestore collection keyed by the printed code. Each document should include `product`, `status` (`active` or another review status), and optionally `scans`.
