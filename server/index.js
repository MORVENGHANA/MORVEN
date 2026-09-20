import "dotenv/config";
import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const app = express();
const port = process.env.PORT || 4000;
const demoCodes = new Map([["MVN24001", { product: "Studio Overshirt", status: "active", scans: 0 }]]);

app.use(cors({ origin: process.env.STOREFRONT_ORIGIN || "http://localhost:3000" }));
app.use(express.json());

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_FILE
  ? path.resolve(path.dirname(fileURLToPath(import.meta.url)), process.env.FIREBASE_SERVICE_ACCOUNT_FILE)
  : null;
const firestore = serviceAccountPath && fs.existsSync(serviceAccountPath)
  ? getFirestore(getApps().length ? getApps()[0] : initializeApp({ credential: cert(JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"))) }))
  : null;

function cleanCode(value = "") {
  return value.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

app.get("/health", (_request, response) => response.json({ service: "morven-verification", ok: true }));

app.post("/api/verify", async (request, response) => {
  const code = cleanCode(request.body?.code);
  if (!code) return response.status(400).json({ status: "invalid", message: "A product code is required." });

  let item;
  if (firestore) {
    const snapshot = await firestore.collection("verificationCodes").doc(code).get();
    item = snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
    if (item) await snapshot.ref.update({ scans: FieldValue.increment(1), lastScannedAt: FieldValue.serverTimestamp() });
  } else {
    item = demoCodes.get(code);
    if (item) item.scans += 1;
  }

  if (!item) return response.json({ status: "suspicious", message: "We could not confirm this product code." });
  if (item.status !== "active") return response.json({ status: "suspicious", message: "This code has been flagged for review." });

  return response.json({ status: "authentic", product: item.product, scans: item.scans, message: "Authentic MORVEN piece." });
});

app.listen(port, () => console.log(`MORVEN verification API listening on ${port}`));
