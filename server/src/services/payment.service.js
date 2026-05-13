const Razorpay = require('razorpay');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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
  const expected = crypto.createHmac('sha256', key_secret).update(`${orderId}|${paymentId}`).digest('hex');
  return expected === signature;
}

async function getNextReceiptNumber() {
  const year = new Date().getFullYear();
  const last = await prisma.payment.findFirst({
    where: { receipt_no: { startsWith: `RCP-${year}-` } },
    orderBy: { receipt_no: 'desc' },
  });

  let seq = 1;
  if (last?.receipt_no) {
    const parts = last.receipt_no.split('-');
    seq = parseInt(parts[parts.length - 1]) + 1;
  }
  return `RCP-${year}-${String(seq).padStart(4, '0')}`;
}

module.exports = { createRazorpayOrder, verifyRazorpaySignature, getNextReceiptNumber };
