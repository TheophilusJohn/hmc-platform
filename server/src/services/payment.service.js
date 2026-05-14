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

async function getNextReceiptNumber(tx = prisma) {
  const year = new Date().getFullYear();
  const prefix = `RCP-${year}-`;
  const last = await tx.payment.findFirst({
    where: { receiptNo: { startsWith: prefix } },
    orderBy: { receiptNo: 'desc' },
    select: { receiptNo: true },
  });

  let seq = 1;
  if (last?.receiptNo) {
    const parts = last.receiptNo.split('-');
    seq = parseInt(parts[parts.length - 1], 10) + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

module.exports = { createRazorpayOrder, verifyRazorpaySignature, getNextReceiptNumber };
