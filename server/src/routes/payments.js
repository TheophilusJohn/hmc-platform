// server/src/routes/payments.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { authenticate } = require('../middleware/auth');
const { requireRole, adminOnly } = require('../middleware/rbac');

function getRazorpay() {
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

async function getNextReceiptNumber() {
  const year = new Date().getFullYear();
  const prefix = `RCP-${year}-`;
  const last = await prisma.payment.findFirst({
    where: { receiptNo: { startsWith: prefix } },
    orderBy: { receiptNo: 'desc' },
    select: { receiptNo: true },
  });
  const lastNum = last ? parseInt(last.receiptNo.replace(prefix, '')) : 0;
  return `${prefix}${String(lastNum + 1).padStart(4, '0')}`;
}

// GET /api/students/:id/payments
router.get('/students/:id/payments', authenticate, async (req, res, next) => {
  try {
    const payments = await prisma.payment.findMany({
      where: { studentId: req.params.id },
      include: { ledger: { include: { feeType: true } }, recordedBy: { select: { userIdDisplay: true } } },
      orderBy: { paidAt: 'desc' },
    });
    res.json({ payments });
  } catch (err) { next(err); }
});

// POST /api/payments/offline
router.post('/offline', authenticate,
  requireRole('FULL_ADMIN', 'TEACHER_ADMIN', 'ADMISSIONS_OFFICER'),
  async (req, res, next) => {
    try {
      const { studentId, ledgerId, amount, mode, notes, exchangeRate } = req.body;
      const currency = req.body.currency || 'INR';

      const receiptNo = await getNextReceiptNumber();

      const payment = await prisma.payment.create({
        data: {
          studentId,
          ...(ledgerId && { ledgerId }),
          amount,
          currency,
          mode,
          receiptNo,
          exchangeRate,
          inrEquivalent: currency === 'USD' && exchangeRate ? amount * exchangeRate : null,
          recordedById: req.user.id,
          notes,
          status: 'confirmed',
        }
      });

      // Update ledger balance
      if (ledgerId) {
        const ledger = await prisma.studentFeeLedger.findUnique({ where: { id: ledgerId } });
        const newBalance = Math.max(0, Number(ledger.balance) - amount);
        await prisma.studentFeeLedger.update({
          where: { id: ledgerId },
          data: {
            balance: newBalance,
            status: newBalance === 0 ? 'PAID' : 'PARTIAL',
          }
        });
      }

      res.status(201).json({ payment, receiptNo });
    } catch (err) { next(err); }
  }
);

// POST /api/payments/razorpay/create-order
router.post('/razorpay/create-order', authenticate, requireRole('STUDENT'), async (req, res, next) => {
  try {
    const { amount, currency = 'INR', ledgerId } = req.body;
    const receiptNo = await getNextReceiptNumber();

    const razorpay = getRazorpay();
    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100), // paise
      currency,
      receipt: receiptNo,
      notes: { ledgerId, studentId: req.user.id },
    });

    res.json({ orderId: order.id, receiptNo, amount, currency });
  } catch (err) { next(err); }
});

// POST /api/payments/razorpay/verify
router.post('/razorpay/verify', authenticate, requireRole('STUDENT'), async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, ledgerId, amount, currency } = req.body;

    // Verify signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSig = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body).digest('hex');

    if (expectedSig !== razorpay_signature) {
      return res.status(400).json({ error: 'Payment verification failed' });
    }

    const sp = await prisma.studentProfile.findFirst({ where: { userId: req.user.id } });
    if (!sp) return res.status(404).json({ error: 'Student not found' });

    const receiptNo = await getNextReceiptNumber();

    const payment = await prisma.payment.create({
      data: {
        studentId: sp.id,
        ledgerId,
        amount,
        currency,
        mode: 'CARD',
        receiptNo,
        gatewayRef: razorpay_payment_id,
        recordedById: req.user.id,
        status: 'confirmed',
      }
    });

    // Update ledger
    if (ledgerId) {
      const ledger = await prisma.studentFeeLedger.findUnique({ where: { id: ledgerId } });
      const newBalance = Math.max(0, Number(ledger.balance) - amount);
      await prisma.studentFeeLedger.update({
        where: { id: ledgerId },
        data: { balance: newBalance, status: newBalance === 0 ? 'PAID' : 'PARTIAL' }
      });
    }

    // Notify
    try {
      const { createNotification } = require('../services/notification.service');
      await createNotification(req.user.id, 'payment_confirmed', 'Payment Confirmed', `Your payment of ${currency === 'INR' ? '₹' : '$'}${amount} (${receiptNo}) has been received.`);
    } catch (_e) {}

    res.json({ payment, receiptNo });
  } catch (err) { next(err); }
});


// POST /api/payments/create-order - alias used by Student Fees page
router.post('/create-order', authenticate, requireRole('STUDENT'), async (req, res, next) => {
  try {
    const { amount, currency = 'INR' } = req.body;
    const receiptNo = await getNextReceiptNumber();
    const razorpay = getRazorpay();
    const order = await razorpay.orders.create({
      amount: Math.round(Number(amount) * 100),
      currency,
      receipt: receiptNo,
      notes: { studentId: req.user.id },
    });
    res.json({ id: order.id, amount: order.amount, currency, receiptNo });
  } catch (err) { console.error('create-order:', err); next(err); }
});

// POST /api/payments/installment-order - Razorpay order for a specific installment
router.post('/installment-order', authenticate, requireRole('STUDENT'), async (req, res, next) => {
  try {
    const { installmentId } = req.body;
    const inst = await prisma.installmentPlan.findUnique({ where: { id: installmentId } });
    if (!inst) return res.status(404).json({ error: 'Installment not found' });
    const receiptNo = await getNextReceiptNumber();
    const razorpay = getRazorpay();
    const order = await razorpay.orders.create({
      amount: Math.round(Number(inst.amount) * 100),
      currency: 'INR',
      receipt: receiptNo,
      notes: { installmentId, studentId: req.user.id },
    });
    res.json({ id: order.id, amount: order.amount, currency: 'INR', receiptNo });
  } catch (err) { console.error('installment-order:', err); next(err); }
});

module.exports = router;
