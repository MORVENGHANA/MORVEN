import crypto from "node:crypto";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import fs from "node:fs";
import multer from "multer";
import path from "node:path";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
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
const firebaseProjectId = "morven-1420a";
const orderStatuses = ["Pending", "Accepted", "Order is being Prepared", "On its way to be Delivered", "Delivered"];

function normalizedOrderStatus(value) {
  return orderStatuses.includes(value) ? value : "Pending";
}
const pendingOrders = new Map();
const productImageUpload = multer({
  limits: { fileSize: 750 * 1024 },
  storage: multer.memoryStorage(),
  fileFilter: (_request, file, callback) => callback(null, ["image/jpeg", "image/png"].includes(file.mimetype)),
});
const parseProductImages = (request, response, next) => productImageUpload.fields([{ name: "image", maxCount: 1 }, { name: "imageBack", maxCount: 1 }])(request, response, (error) => {
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
  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  const encodedServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64?.trim();
  const serviceAccountText = rawServiceAccount
    || (encodedServiceAccount ? Buffer.from(encodedServiceAccount, "base64").toString("utf8") : null)
    || (serviceAccountPath && fs.existsSync(serviceAccountPath) ? fs.readFileSync(serviceAccountPath, "utf8") : null);
  if (!serviceAccountText) {
    console.error("Firebase Admin credentials are not configured.");
  } else {
    const serviceAccount = JSON.parse(serviceAccountText);
    if (serviceAccount.project_id !== firebaseProjectId) throw new Error(`service account belongs to ${serviceAccount.project_id}, expected ${firebaseProjectId}`);
    firebaseApp = getApps().length ? getApps()[0] : initializeApp({ credential: cert(serviceAccount) });
    console.log(`Firebase Admin connected to ${serviceAccount.project_id}.`);
  }
} catch (error) {
  console.error(`Firebase Admin credentials could not be loaded: ${error.message}`);
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

app.get("/health", (_request, response) => {
  response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  return response.json({ service: "morven-verification", ok: true, uptime: process.uptime() });
});

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
    const update = { paymentStatus: "success", paidAt: new Date().toISOString(), paymentChannel: transaction.channel || null };
    pendingOrders.set(orderReference, { ...orderData, ...update });
    if (orderRef) await orderRef.set({ ...update, paidAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  return response.sendStatus(200);
});

app.get("/api/products", async (_request, response) => response.json({ products: await getProducts() }));

app.post("/api/profile", requireUser, async (request, response) => {
  const phone = String(request.body?.phone || "").trim();
  if (!phone) return response.status(400).json({ message: "A phone number is required." });
  if (!firestore) return response.status(503).json({ message: "User database is not configured." });
  await firestore.collection("userProfiles").doc(request.user.uid).set({ phone, email: request.user.email || "", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return response.json({ phone });
});

app.get("/api/orders", requireUser, async (request, response) => {
  if (!firestore) return response.json({ orders: [] });
  try {
    const snapshot = await firestore.collection("orders").where("userId", "==", request.user.uid).get();
    const orders = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data(), status: normalizedOrderStatus(doc.data().status) }))
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
    if (!snapshot.empty) return response.json({ products: snapshot.docs.map((doc) => productRecord(doc.id, doc.data())) });
    const defaults = [...products].map(([name, price]) => ({ name, price, imageUrl: "", description: "MORVEN essential", active: true }));
    const batch = firestore.batch();
    const references = defaults.map((product) => firestore.collection("products").doc());
    defaults.forEach((product, index) => batch.set(references[index], { ...product, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }));
    await batch.commit();
    return response.json({ products: defaults.map((product, index) => productRecord(references[index].id, product)) });
  } catch (error) {
    console.error("Product database unavailable.");
    return response.status(503).json({ message: "Product management is temporarily unavailable. Enable Firestore to manage products." });
  }
});

app.post("/api/admin/products", requireAdmin, parseProductImages, async (request, response) => {
  const name = String(request.body?.name || "").trim();
  const price = Number(request.body?.price);
  const image = request.files?.image?.[0];
  const imageBack = request.files?.imageBack?.[0];
  const imageUrl = image ? `data:${image.mimetype};base64,${image.buffer.toString("base64")}` : "";
  const imageBackUrl = imageBack ? `data:${imageBack.mimetype};base64,${imageBack.buffer.toString("base64")}` : "";
  const description = String(request.body?.description || "").trim();
  if (!name || !Number.isFinite(price) || price <= 0) return response.status(400).json({ message: "Product name and a positive price are required." });
  if (!image || !imageBack) return response.status(400).json({ message: "Upload both Picture 1 and Picture 2 as JPEG, JPG, or PNG files." });
  if (!firestore) return response.status(503).json({ message: "Product database is not configured." });
  const reference = await firestore.collection("products").add({ name, price, imageUrl, imageBackUrl, description, active: true, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  return response.status(201).json({ product: productRecord(reference.id, { name, price, imageUrl, imageBackUrl, description, active: true }) });
});

app.put("/api/admin/products/:id", requireAdmin, parseProductImages, async (request, response) => {
  if (!firestore) return response.status(503).json({ message: "Product database is not configured." });
  const reference = firestore.collection("products").doc(request.params.id);
  const current = await reference.get();
  if (!current.exists) return response.status(404).json({ message: "Product not found." });
  const name = String(request.body?.name || "").trim();
  const price = Number(request.body?.price);
  const description = String(request.body?.description || "").trim();
  if (!name || !Number.isFinite(price) || price <= 0) return response.status(400).json({ message: "Product name and a positive price are required." });
  const update = { name, price, description, updatedAt: FieldValue.serverTimestamp() };
  const image = request.files?.image?.[0];
  const imageBack = request.files?.imageBack?.[0];
  if (image) update.imageUrl = `data:${image.mimetype};base64,${image.buffer.toString("base64")}`;
  if (imageBack) update.imageBackUrl = `data:${imageBack.mimetype};base64,${imageBack.buffer.toString("base64")}`;
  await reference.update(update);
  const currentData = current.data();
  return response.json({ product: productRecord(reference.id, { ...currentData, name, price, description, imageUrl: update.imageUrl || currentData.imageUrl, imageBackUrl: update.imageBackUrl || currentData.imageBackUrl }) });
});

app.delete("/api/admin/products/:id", requireAdmin, async (request, response) => {
  if (!firestore) return response.status(503).json({ message: "Product database is not configured." });
  await firestore.collection("products").doc(request.params.id).delete();
  return response.status(204).end();
});

app.get("/api/admin/users", requireAdmin, async (_request, response) => {
  if (!firebaseAuth) return response.status(503).json({ message: "User database is not configured." });
  const users = [];
  let page;
  do {
    page = await firebaseAuth.listUsers(1000, page?.pageToken);
    const listedUsers = await Promise.all(page.users.map(async (user) => {
      const profile = await firestore.collection("userProfiles").doc(user.uid).get();
      return { id: user.uid, name: user.displayName || "", email: user.email || "", phone: profile.exists ? profile.data().phone || "" : user.phoneNumber || "", createdAt: user.metadata.creationTime || "" };
    }));
    users.push(...listedUsers);
  } while (page.pageToken);
  return response.json({ users });
});

app.get("/api/admin/orders", requireAdmin, async (_request, response) => {
  if (!firestore) return response.json({ orders: [] });
  try {
    const snapshot = await firestore.collection("orders").orderBy("createdAt", "desc").get();
    return response.json({ orders: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data(), status: normalizedOrderStatus(doc.data().status) })) });
  } catch (error) {
    console.error("Order database unavailable.");
    return response.status(503).json({ message: "Order management is temporarily unavailable. Enable Firestore to view orders." });
  }
});

app.post("/api/admin/verification-codes/pdf", requireAdmin, async (request, response) => {
  if (!firestore) return response.status(503).json({ message: "Verification database is not configured." });
  const product = String(request.body?.product || "").trim();
  if (!product) return response.status(400).json({ message: "Product name is required." });
  const codes = Array.from({ length: 20 }, () => `MVN-${crypto.randomBytes(5).toString("hex").toUpperCase()}`);
  const batch = firestore.batch();
  codes.forEach((code) => batch.set(firestore.collection("verificationCodes").doc(cleanCode(code)), { code, product, status: "active", scans: 0, createdAt: FieldValue.serverTimestamp() }));
  await batch.commit();
  const origin = process.env.STOREFRONT_ORIGIN || `${request.protocol}://${request.get("host")}`;
  const document = new PDFDocument({ autoFirstPage: false, margin: 36, size: "A4" });
  response.setHeader("Content-Type", "application/pdf");
  response.setHeader("Content-Disposition", `attachment; filename="morven-verification-codes-${Date.now()}.pdf"`);
  document.pipe(response);
  for (let index = 0; index < codes.length; index += 1) {
    if (index % 20 === 0) document.addPage();
    const column = index % 2;
    const row = Math.floor((index % 20) / 2);
    const x = 45 + column * 270;
    const y = 32 + row * 75;
    const qr = await QRCode.toDataURL(`${origin}/verify.html?code=${encodeURIComponent(codes[index])}`, { margin: 1, width: 58 });
    document.roundedRect(x, y, 245, 68, 5).stroke("#d7dce5");
    document.image(qr, x + 5, y + 5, { width: 58, height: 58 });
    document.fontSize(10).fillColor("#081b43").text(codes[index], x + 72, y + 28, { align: "left", width: 165 });
  }
  document.end();
});

app.put("/api/admin/orders/:reference/status", requireAdmin, async (request, response) => {
  const status = String(request.body?.status || "").trim();
  if (!orderStatuses.includes(status)) return response.status(400).json({ message: "Invalid order status." });
  if (!firestore) return response.status(503).json({ message: "Order database is not configured." });
  const reference = firestore.collection("orders").doc(request.params.reference);
  const order = await reference.get();
  if (!order.exists) return response.status(404).json({ message: "Order not found." });
  await reference.update({ status, updatedAt: FieldValue.serverTimestamp() });
  return response.json({ order: { id: reference.id, ...order.data(), status } });
});

app.post("/api/payments/paystack/initialize", requireUser, async (request, response) => {
  const email = String(request.body?.email || "").trim();
  const items = Array.isArray(request.body?.items) ? request.body.items : [];
  const delivery = request.body?.delivery || {};
  const requiredDeliveryFields = ["name", "city", "streetAddress", "houseAddress", "phone"];
  if (requiredDeliveryFields.some((field) => !String(delivery[field] || "").trim())) {
    return response.status(400).json({ message: "Name, city, street address, house address, and phone number are required." });
  }
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
        status: "Pending",
        paymentStatus: "pending",
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
    const update = { paymentStatus: payload.data.status, paidAt: payload.data.status === "success" ? new Date().toISOString() : null };
    pendingOrders.set(payload.data.reference, { ...(orderData || {}), ...update });
    if (firestore) await firestore.collection("orders").doc(payload.data.reference).set({ ...update, paidAt: payload.data.status === "success" ? FieldValue.serverTimestamp() : null }, { merge: true });
    return response.json({ status: payload.data.status, orderId: orderData?.orderId || null, reference: payload.data.reference, amount: payload.data.amount, currency: payload.data.currency });
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
    if (item) {
      item.scans = Number(item.scans || 0) + 1;
      await snapshot.ref.update({ scans: FieldValue.increment(1), lastScannedAt: FieldValue.serverTimestamp() });
    }
  } else {
    item = demoCodes.get(code);
    if (item) item.scans += 1;
  }

  if (!item) return response.json({ status: "suspicious", message: "We could not confirm this product code." });
  if (item.status !== "active") return response.json({ status: "suspicious", message: "This code has been flagged for review." });

  return response.json({ status: "authentic", product: item.product, scans: item.scans, message: "Authentic MORVEN piece." });
});

app.get("/api/verify/:code", async (request, response) => {
  const code = cleanCode(request.params.code);
  if (!code) return response.status(400).json({ status: "invalid", message: "A product code is required." });
  if (!firestore) {
    const item = demoCodes.get(code);
    return item ? response.json({ status: "authentic", product: item.product, scans: item.scans }) : response.status(404).json({ status: "suspicious", message: "We could not confirm this code." });
  }
  const snapshot = await firestore.collection("verificationCodes").doc(code).get();
  if (!snapshot.exists) return response.status(404).json({ status: "suspicious", message: "We could not confirm this code." });
  const item = snapshot.data();
  return response.json({ status: item.status === "active" ? "authentic" : "suspicious", product: item.product, scans: item.scans || 0 });
});

app.use((error, request, response, _next) => {
  if (request.path.startsWith("/api/")) {
    console.error(`API request failed: ${error.message}`);
    return response.status(error.statusCode || 500).json({ message: error.message || "The server could not complete that request." });
  }
  return response.status(500).send("Internal server error.");
});

app.use("/api", (_request, response) => response.status(404).json({ message: "API endpoint not found." }));

app.use(express.static(staticRoot));
app.use(express.static(sourceRoot));
app.get("/", (_request, response) => response.sendFile(path.join(staticRoot, "index.html")));
app.get("/admin", (_request, response) => response.sendFile(path.join(staticRoot, "admin.html")));

app.listen(port, () => {
  console.log(`MORVEN verification API listening on ${port}`);
  const keepAliveEnabled = String(process.env.KEEP_ALIVE_ENABLED).toLowerCase() === "true";
  const keepAliveUrl = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL;
  const pingInterval = Math.max(60000, Number(process.env.PING_INTERVAL) || 300000);
  if (!keepAliveEnabled || !keepAliveUrl) return;

  const ping = async () => {
    try {
      const response = await fetch(`${keepAliveUrl.replace(/\/$/, "")}/health`, { headers: { "User-Agent": "MORVEN-keep-alive" } });
      console.log(`Keep-alive ping: ${response.status}`);
    } catch (error) {
      console.error(`Keep-alive ping failed: ${error.message}`);
    }
  };
  console.log(`Keep-alive enabled: ${keepAliveUrl}/health every ${pingInterval}ms.`);
  ping();
  setInterval(ping, pingInterval).unref();
});
