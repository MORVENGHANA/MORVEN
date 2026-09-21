import crypto from "node:crypto";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import fs from "node:fs";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), ".env") });

const app = express();
const port = process.env.PORT || 4000;
const demoCodes = new Map([["MVN24001", { product: "Studio Overshirt", status: "active", scans: 0 }]]);
const products = new Map([
  ["Studio Overshirt", 148],
  ["Form Knit Polo", 118],
  ["Transit Trouser", 128],
]);
const adminEmail = (process.env.ADMIN_EMAIL || "fotsiemmanuel397@gmail.com").toLowerCase();
const pendingOrders = new Map();
const productImageUpload = multer({
  limits: { fileSize: 750 * 1024 },
  storage: multer.memoryStorage(),
  fileFilter: (_request, file, callback) => callback(null, ["image/jpeg", "image/png"].includes(file.mimetype)),
});
const parseProductImage = (request, response, next) => productImageUpload.single("image")(request, response, (error) => {
  if (error) return response.status(400).json({ message: error.code === "LIMIT_FILE_SIZE" ? "Product pictures must be 750 KB or smaller." : "Upload a JPEG, JPG, or PNG product picture." });
  return next();
});

app.use(cors({ origin: process.env.STOREFRONT_ORIGIN || "http://localhost:3000" }));
app.use(express.json({ verify: (request, _response, buffer) => { request.rawBody = buffer; } }));

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_FILE
  ? path.resolve(path.dirname(fileURLToPath(import.meta.url)), process.env.FIREBASE_SERVICE_ACCOUNT_FILE)
  : null;
let firebaseApp = null;
try {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
    : serviceAccountPath && fs.existsSync(serviceAccountPath)
      ? JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"))
      : null;
  if (serviceAccount) firebaseApp = getApps().length ? getApps()[0] : initializeApp({ credential: cert(serviceAccount) });
} catch {
  console.error("Firebase Admin credentials are invalid.");
}
const firestore = firebaseApp ? getFirestore(firebaseApp) : null;

const firebaseAuth = firestore ? getAuth() : null;
const staticRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "build");
const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function cleanCode(value = "") {
  return value.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function productRecord(id, data) {
  return { id, ...data, price: Number(data.price), active: data.active !== false };
}

async function getProducts() {
  const defaults = [...products].map(([name, price], index) => productRecord(String(index + 1), { name, price, imageUrl: "", description: "MORVEN essential" }));
  if (!firestore) return defaults;
  try {
    const snapshot = await firestore.collection("products").where("active", "!=", false).get();
    return snapshot.empty ? defaults : snapshot.docs.map((doc) => productRecord(doc.id, doc.data()));
  } catch (error) {
    console.error("Product catalog unavailable.");
    return defaults;
  }
}

async function requireAdmin(request, response, next) {
  if (!firebaseAuth) return response.status(503).json({ message: "Admin services are not configured." });
  const token = request.headers.authorization?.startsWith("Bearer ") ? request.headers.authorization.slice(7) : "";
  if (!token) return response.status(401).json({ message: "Sign in as an administrator." });
  try {
    const decoded = await firebaseAuth.verifyIdToken(token);
    if (decoded.email?.toLowerCase() !== adminEmail) return response.status(403).json({ message: "Administrator access is required." });
    request.admin = decoded;
    return next();
  } catch {
    return response.status(401).json({ message: "Your session has expired. Sign in again." });
  }
}

async function requireUser(request, response, next) {
  if (!firebaseAuth) return response.status(503).json({ message: "User services are not configured." });
  const token = request.headers.authorization?.startsWith("Bearer ") ? request.headers.authorization.slice(7) : "";
  if (!token) return response.status(401).json({ message: "Sign in to view your orders." });
  try {
    request.user = await firebaseAuth.verifyIdToken(token);
    return next();
  } catch {
    return response.status(401).json({ message: "Your session has expired. Sign in again." });
  }
}

app.get("/health", (_request, response) => response.json({ service: "morven-verification", ok: true }));

app.post("/api/payments/paystack/webhook", async (request, response) => {
  if (!process.env.PAYSTACK_SECRET_KEY) return response.status(503).json({ message: "Payment webhook is not configured." });
  const signature = request.headers["x-paystack-signature"];
  const rawBody = request.rawBody || Buffer.from(JSON.stringify(request.body));
  const expectedSignature = crypto.createHmac("sha512", process.env.PAYSTACK_SECRET_KEY || "").update(rawBody).digest("hex");
  const receivedSignature = Buffer.from(String(signature || ""));
  const expectedSignatureBuffer = Buffer.from(expectedSignature);
  if (!signature || receivedSignature.length !== expectedSignatureBuffer.length || !crypto.timingSafeEqual(receivedSignature, expectedSignatureBuffer)) {
    return response.status(401).json({ message: "Invalid webhook signature." });
  }

  const event = request.body;
  const transaction = event?.data;
  if (event?.event === "charge.success" && transaction?.reference) {
    const orderReference = String(transaction.reference);
    const storedOrder = pendingOrders.get(orderReference);
    const orderRef = firestore?.collection("orders").doc(orderReference);
    const order = orderRef ? await orderRef.get() : null;
    const orderData = order?.exists ? order.data() : storedOrder;
    const expectedAmount = orderData ? Number(orderData.amount) * 100 : null;
    if (!orderData || Number(transaction.amount) !== expectedAmount || transaction.currency !== "GHS") {
      return response.status(400).json({ message: "Webhook amount does not match the order." });
    }
    const update = { status: "success", paidAt: new Date().toISOString(), paymentChannel: transaction.channel || null };
    pendingOrders.set(orderReference, { ...orderData, ...update });
    if (orderRef) await orderRef.set({ ...update, paidAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  return response.sendStatus(200);
});

app.get("/api/products", async (_request, response) => response.json({ products: await getProducts() }));

app.get("/api/orders", requireUser, async (request, response) => {
  if (!firestore) return response.json({ orders: [] });
  try {
    const snapshot = await firestore.collection("orders").where("userId", "==", request.user.uid).get();
    const orders = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
    return response.json({ orders });
  } catch {
    return response.status(503).json({ message: "Order history is temporarily unavailable." });
  }
});

app.get("/api/admin/products", requireAdmin, async (_request, response) => {
  if (!firestore) return response.json({ products: await getProducts() });
  try {
    const snapshot = await firestore.collection("products").orderBy("createdAt", "desc").get();
    return response.json({ products: snapshot.empty ? await getProducts() : snapshot.docs.map((doc) => productRecord(doc.id, doc.data())) });
  } catch (error) {
    console.error("Product database unavailable.");
    return response.status(503).json({ message: "Product management is temporarily unavailable. Enable Firestore to manage products." });
  }
});

app.post("/api/admin/products", requireAdmin, parseProductImage, async (request, response) => {
  const name = String(request.body?.name || "").trim();
  const price = Number(request.body?.price);
  const imageUrl = request.file ? `data:${request.file.mimetype};base64,${request.file.buffer.toString("base64")}` : "";
  const description = String(request.body?.description || "").trim();
  if (!name || !Number.isFinite(price) || price <= 0) return response.status(400).json({ message: "Product name and a positive price are required." });
  if (!request.file) return response.status(400).json({ message: "Upload a JPEG, JPG, or PNG product picture." });
  if (!firestore) return response.status(503).json({ message: "Product database is not configured." });
  const reference = await firestore.collection("products").add({ name, price, imageUrl, description, active: true, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  return response.status(201).json({ product: productRecord(reference.id, { name, price, imageUrl, description, active: true }) });
});

app.delete("/api/admin/products/:id", requireAdmin, async (request, response) => {
  if (!firestore) return response.status(503).json({ message: "Product database is not configured." });
  await firestore.collection("products").doc(request.params.id).update({ active: false, updatedAt: FieldValue.serverTimestamp() });
  return response.status(204).end();
});

app.get("/api/admin/users", requireAdmin, async (_request, response) => {
  if (!firebaseAuth) return response.status(503).json({ message: "User database is not configured." });
  const users = [];
  let page;
  do {
    page = await firebaseAuth.listUsers(1000, page?.pageToken);
    users.push(...page.users.map((user) => ({ id: user.uid, name: user.displayName || "", email: user.email || "", phone: user.phoneNumber || "", createdAt: user.metadata.creationTime || "" })));
  } while (page.pageToken);
  return response.json({ users });
});

app.get("/api/admin/orders", requireAdmin, async (_request, response) => {
  if (!firestore) return response.json({ orders: [] });
  try {
    const snapshot = await firestore.collection("orders").orderBy("createdAt", "desc").get();
    return response.json({ orders: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) });
  } catch (error) {
    console.error("Order database unavailable.");
    return response.status(503).json({ message: "Order management is temporarily unavailable. Enable Firestore to view orders." });
  }
});

app.post("/api/payments/paystack/initialize", requireUser, async (request, response) => {
  const email = String(request.body?.email || "").trim();
  const items = Array.isArray(request.body?.items) ? request.body.items : [];
  const delivery = request.body?.delivery || {};
  if (!/^\S+@\S+\.\S+$/.test(email) || !items.length) {
    return response.status(400).json({ message: "A valid email and at least one cart item are required." });
  }
  if (!process.env.PAYSTACK_SECRET_KEY) {
    return response.status(503).json({ message: "Paystack is not configured on the server yet." });
  }

  const catalog = await getProducts();
  const lineItems = items.map((item) => {
    const product = catalog.find((entry) => entry.name === String(item.product || ""));
    const quantity = Number.isInteger(Number(item.quantity)) && Number(item.quantity) > 0 ? Number(item.quantity) : 1;
    return product && Number(item.price) === product.price ? { product: product.name, price: product.price, quantity } : null;
  });
  if (lineItems.some((item) => !item)) {
    return response.status(400).json({ message: "One or more cart items are invalid." });
  }

  const amount = lineItems.reduce((total, item) => total + item.price * item.quantity, 0) * 100;
  const callbackUrl = process.env.PAYSTACK_CALLBACK_URL || `${request.protocol}://${request.get("host")}/payment-success.html`;
  const orderId = `MVN-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  try {
    const paystackResponse = await fetch("https://api.paystack.co/transaction/initialize", {
      body: JSON.stringify({
        amount,
        callback_url: callbackUrl,
        currency: "GHS",
        email,
        metadata: { delivery, items: lineItems },
      }),
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    const payload = await paystackResponse.json();
    if (!paystackResponse.ok || !payload.status) {
      return response.status(502).json({ message: payload.message || "Paystack could not start the payment." });
    }
    const orderData = {
      orderId,
      userId: request.user.uid,
      userEmail: request.user.email || email,
        email,
        delivery,
        items: lineItems,
        amount: amount / 100,
        currency: "GHS",
        status: "pending",
        reference: payload.data.reference,
      };
    pendingOrders.set(payload.data.reference, orderData);
    if (firestore) {
      await firestore.collection("orders").doc(payload.data.reference).set({ ...orderData, createdAt: FieldValue.serverTimestamp() });
    }
    return response.json({ accessCode: payload.data.access_code, authorizationUrl: payload.data.authorization_url, orderId, reference: payload.data.reference });
  } catch (error) {
    console.error("Paystack initialization failed", error);
    return response.status(502).json({ message: "Payment service is temporarily unavailable." });
  }
});

app.get("/api/payments/paystack/verify/:reference", async (request, response) => {
  if (!process.env.PAYSTACK_SECRET_KEY) return response.status(503).json({ message: "Paystack is not configured on the server yet." });
  try {
    const paystackResponse = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(request.params.reference)}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
    });
    const payload = await paystackResponse.json();
    if (!paystackResponse.ok || !payload.status) return response.status(502).json({ message: payload.message || "Unable to verify payment." });
    const storedOrder = pendingOrders.get(payload.data.reference);
    const order = firestore ? await firestore.collection("orders").doc(payload.data.reference).get() : null;
    const orderData = order?.exists ? order.data() : storedOrder;
    if (payload.data.status === "success" && (!orderData || Number(payload.data.amount) !== Number(orderData.amount) * 100 || payload.data.currency !== "GHS")) {
      return response.status(409).json({ message: "Payment amount could not be verified." });
    }
    const update = { status: payload.data.status, paidAt: payload.data.status === "success" ? new Date().toISOString() : null };
    pendingOrders.set(payload.data.reference, { ...(orderData || {}), ...update });
    if (firestore) await firestore.collection("orders").doc(payload.data.reference).set({ ...update, paidAt: payload.data.status === "success" ? FieldValue.serverTimestamp() : null }, { merge: true });
    return response.json({ status: payload.data.status, reference: payload.data.reference, amount: payload.data.amount, currency: payload.data.currency });
  } catch (error) {
    console.error("Paystack verification failed", error);
    return response.status(502).json({ message: "Payment verification is temporarily unavailable." });
  }
});

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

app.use(express.static(staticRoot));
app.use(express.static(sourceRoot));
app.get("/", (_request, response) => response.sendFile(path.join(staticRoot, "index.html")));
app.get("/admin", (_request, response) => response.sendFile(path.join(staticRoot, "admin.html")));

app.listen(port, () => console.log(`MORVEN verification API listening on ${port}`));
