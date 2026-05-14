const Razorpay = require('razorpay');
const crypto = require('crypto');
const prisma = require('../config/db');

function getRazorpayInstance() {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) throw new Error('Razorpay not configured');
  return new Razorpay({ key_id, key_secret });
}

async function createRazorpayOrder(amountInPaise, currency = 'INR', receiptNo) {
  const razorpay = getRazorpayInstance();
  const order = await razorpay.orders.create({
    amount: Math.round(amountInPaise),
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
