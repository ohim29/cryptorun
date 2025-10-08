// GEN2 Firebase Functions
const { onCall } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// РЕГИОН (Франкфурт)
setGlobalOptions({
  region: "europe-west3",
  timeoutSeconds: 60,
  memory: "256MiB",
});

// --- Константы
const USDT_BSC = "0x55d398326f99059fF775485246999027B3197955".toLowerCase();
const RECEIVER = "0xD2471faD1f058fD01591364651619Bb6D59d5405".toLowerCase();
const MIN_USDT = BigInt("5000000000000000000"); // 5 * 10^18
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// ---- createInvoice (callable)
exports.createInvoice = onCall(async (request) => {
  const auth = request.auth;
  if (!auth) throw new Error("unauthenticated");
  const uid = auth.uid;

  const invoice = {
    amount: 5,
    token: "USDT",
    chain: "BSC",
    to: RECEIVER,
    status: "awaiting_tx",
    txHash: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    confirms: 0,
  };
  const ref = await db.collection("users").doc(uid).collection("invoices").add(invoice);
  return { invoiceId: ref.id, to: RECEIVER, amount: 5 };
});

// ---- submitTx (callable)
exports.submitTx = onCall(async (request) => {
  const auth = request.auth;
  if (!auth) throw new Error("unauthenticated");
  const { invoiceId, txHash } = request.data || {};
  if (!invoiceId || !txHash) throw new Error("invoiceId/txHash required");

  const ref = db.collection("users").doc(auth.uid).collection("invoices").doc(invoiceId);
  await ref.update({ txHash, status: "checking", submittedAt: admin.firestore.FieldValue.serverTimestamp() });
  return { ok: true };
});

// ---- grantPermanent для smarttfon@gmail.com (callable)
exports.grantPermanent = onCall(async (request) => {
  const auth = request.auth;
  if (!auth) throw new Error("unauthenticated");
  const email = (auth.token.email || "").toLowerCase();
  if (email !== "smarttfon@gmail.com") throw new Error("permission-denied");
  const far = new Date("2099-01-01T00:00:00Z");
  await db.collection("users").doc(auth.uid).set({ activeUntil: far, perm: true }, { merge: true });
  return { ok: true, activeUntil: far.toISOString() };
});

// ---- verifyPayments (CRON раз в минуту, GEN2)
exports.verifyPayments = onSchedule("every 1 minutes", async () => {
  const key = (await require("firebase-functions").config())?.bscscan?.key;
  if (!key) { console.warn("BscScan key not set"); return null; }

  const latestHex = await callBscScan(`?module=proxy&action=eth_blockNumber&apikey=${key}`);
  const latest = parseInt(latestHex.result, 16);

  const snap = await db.collectionGroup("invoices").where("status", "in", ["checking"]).get();
  const batch = db.batch();

  for (const doc of snap.docs) {
    const inv = doc.data();
    if (!inv.txHash) continue;

    try {
      const rec = await callBscScan(`?module=proxy&action=eth_getTransactionReceipt&txhash=${inv.txHash}&apikey=${key}`);
      const r = rec.result;
      if (!r || !r.blockNumber) continue;

      const confirms = latest - parseInt(r.blockNumber, 16);
      batch.update(doc.ref, { confirms });

      const ok = r.status === "0x1";
      if (!ok) continue;

      const hit = (r.logs || []).some((l) => {
        try {
          const addr = (l.address || "").toLowerCase();
          if (addr !== USDT_BSC) return false;
          if ((l.topics || [])[0] !== TRANSFER_TOPIC) return false;
          const toTopic = (l.topics || [])[2] || "";
          const to = "0x" + toTopic.slice(26).toLowerCase();
          if (to !== RECEIVER) return false;
          const amount = BigInt(l.data);
          return amount >= MIN_USDT;
        } catch (_) {
          return false;
        }
      });

      if (hit && confirms >= 12) {
        const userRef = doc.ref.parent.parent;
        const activeUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        batch.update(doc.ref, { status: "confirmed" });
        batch.set(userRef, { activeUntil }, { merge: true });
      }
    } catch (e) {
      console.warn("verify error", inv.txHash, e.message);
    }
  }

  if (!snap.empty) await batch.commit();
  return null;
});

// ---- утилита
async function callBscScan(suffix) {
  const url = "https://api.bscscan.com/api" + suffix;
  const r = await fetch(url, { timeout: 15000 });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json();
  return j;
}
