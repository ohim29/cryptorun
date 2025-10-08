
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();
const db = admin.firestore();

const MERCHANT = "0xD2471fAD1f058fD01591364651619Bb6D59d5405".toLowerCase();
const USDT_BSC = "0x55d398326f99059fF775485246999027B3197955".toLowerCase(); // 18 decimals
const REQUIRED_AMOUNT_WEI = "5000000000000000000"; // 5 * 10^18
const REQUIRED_CONFIRMATIONS = 12;

function getBscScanKey() {
  return (process.env.BSCSCAN_API_KEY) || ((functions.config().bscscan && functions.config().bscscan.key) ? functions.config().bscscan.key : null);
}

exports.createInvoice = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Login required");
  const uid = context.auth.uid;

  const invoiceRef = db.collection("users").doc(uid).collection("invoices").doc();
  const invoice = {
    amount: 5,
    token: "USDT",
    chain: "bsc",
    to: MERCHANT,
    status: "pending",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await invoiceRef.set(invoice);
  return { invoiceId: invoiceRef.id, to: MERCHANT, amount: 5 };
});

exports.submitTx = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Login required");
  const { invoiceId, txHash } = data || {};
  if (!invoiceId || !txHash) throw new functions.https.HttpsError("invalid-argument", "invoiceId and txHash required");

  const uid = context.auth.uid;
  const ref = db.collection("users").doc(uid).collection("invoices").doc(invoiceId);
  const snap = await ref.get();
  if (!snap.exists) throw new functions.https.HttpsError("not-found", "Invoice not found");

  const inv = snap.data();
  if (inv.status === "confirmed") return { ok: true, status: "confirmed" };

  await ref.set({ txHash, status: "confirming", updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true, status: "confirming" };
});

exports.grantPermanent = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Login required");
  const uid = context.auth.uid;
  const user = await admin.auth().getUser(uid);
  const email = (user.email || "").toLowerCase();
  if (email !== "smarttfon@gmail.com") throw new functions.https.HttpsError("permission-denied", "Not allowed");

  const activeUntil = admin.firestore.Timestamp.fromDate(new Date("2099-01-01"));
  await db.collection("users").doc(uid).set({
    email,
    permanent: true,
    activeUntil,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return { ok: true, activeUntil: activeUntil.toMillis() };
});

exports.verifyPayments = functions.pubsub.schedule("every 1 minutes").onRun(async () => {
  const key = getBscScanKey();
  if (!key) {
    console.warn("BSCScan API key not configured");
    return null;
  }

  const users = await db.collection("users").get();
  for (const userDoc of users.docs) {
    const uid = userDoc.id;
    const invs = await db.collection("users").doc(uid).collection("invoices")
      .where("status", "in", ["pending", "confirming"]).get();
    for (const invDoc of invs.docs) {
      const inv = invDoc.data();
      if (!inv.txHash) continue;

      const rec = await getReceipt(inv.txHash, key).catch(() => null);
      if (!rec || !rec.status || !rec.blockNumber) continue;

      const confirmations = await getConfirmations(rec.blockNumber, key).catch(() => 0);
      const ok = hasUsdtTransferTo(rec, USDT_BSC, MERCHANT, REQUIRED_AMOUNT_WEI);

      if (ok && confirmations >= REQUIRED_CONFIRMATIONS) {
        const now = admin.firestore.Timestamp.now();
        const activeUntil = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 30*24*60*60*1000));
        await db.runTransaction(async (tx) => {
          tx.update(invDoc.ref, { status: "confirmed", confirmedAt: now, confirmations, updatedAt: now });
          tx.set(db.collection("users").doc(uid), {
            activeUntil,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
        });
      } else {
        await invDoc.ref.set({
          status: "confirming",
          confirmations: confirmations || 0,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }
    }
  }
  return null;
});

async function getReceipt(txHash, apiKey) {
  const url = `https://api.bscscan.com/api?module=proxy&action=eth_getTransactionReceipt&txhash=${txHash}&apikey=${apiKey}`;
  const { data } = await axios.get(url, { timeout: 10000 });
  return data && data.result;
}

async function getConfirmations(blockNumberHex, apiKey) {
  if (!blockNumberHex) return 0;
  const { data } = await axios.get(`https://api.bscscan.com/api?module=proxy&action=eth_blockNumber&apikey=${apiKey}`, { timeout: 10000 });
  const tipHex = data && data.result;
  if (!tipHex) return 0;
  const tip = parseInt(tipHex, 16);
  const blk = parseInt(blockNumberHex, 16);
  return Math.max(0, tip - blk);
}

function hasUsdtTransferTo(receipt, tokenAddrLower, toAddrLower, minValueWeiStr) {
  const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  if (!receipt.logs || !Array.isArray(receipt.logs)) return false;
  const min = BigInt(minValueWeiStr);
  for (const log of receipt.logs) {
    if (!log || (log.address||"").toLowerCase() !== tokenAddrLower) continue;
    if (!log.topics || log.topics[0] !== TRANSFER_TOPIC) continue;
    const to = "0x" + log.topics[2].slice(26).toLowerCase();
    if (to !== toAddrLower) continue;
    const value = BigInt(log.data);
    if (value >= min) return true;
  }
  return false;
}
