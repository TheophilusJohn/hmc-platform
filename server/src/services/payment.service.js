const Razorpay = require('razorpay');
const crypto = require('crypto');
const prisma = require('../config/db');

function getRazorpayInstance() {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) throw new Error('Razorpay not configured');
  return new Razorpay({ key_id, key_secret });
}

const ALLOWED_CURRENCIES = new Set(['INR', 'USD']);

async function createRazorpayOrder(amountInPaise, currency = 'INR', receiptNo) {
  // Hard-validate: caller MUST pass integer minor units (paise/cents). Rupees-as-float
  // silently rounds in Razorpay and creates wrong-amount orders.
  if (!Number.isInteger(amountInPaise)) {
    throw new Error(`createRazorpayOrder: amount must be an integer in the smallest unit (paise/cents); got ${amountInPaise}`);
  }
  if (amountInPaise <= 0) {
    throw new Error(`createRazorpayOrder: amount must be > 0; got ${amountInPaise}`);
  }
  if (!ALLOWED_CURRENCIES.has(currency)) {
    throw new Error(`createRazorpayOrder: unsupported currency ${currency}`);
  }
  if (!receiptNo || typeof receiptNo !== 'string') {
    throw new Error('createRazorpayOrder: receiptNo is required');
  }
  const razorpay = getRazorpayInstance();
  const order = await razorpay.orders.create({
    amount: amountInPaise,
    currency,
    receipt: receiptNo,
    payment_capture: 1,
  });
  return order;
}

function verifyRazorpaySignature(orderId, paymentId, signature) {
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  const expected = crypto.createHmac('sha256', key_secret)
    .update(`${orderId}|${paymentId}`).digest('hex');
  const sigBuf = Buffer.from(signature, 'hex');
  const expBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

// getNextReceiptNumber lives in routes/payments.js (with retry-on-collision)
// to keep receipt minting next to the payment-creation transaction.

module.exports = { createRazorpayOrder, verifyRazorpaySignature };
