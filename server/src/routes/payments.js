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

async function getNextReceiptNumber(tx = prisma) {
  const year = new Date().getFullYear();
  const prefix = `RCP-${year}-`;
  const last = await tx.payment.findFirst({
    where: { receiptNo: { startsWith: prefix } },
    orderBy: { receiptNo: 'desc' },
    select: { receiptNo: true },
  });
  const lastNum = last ? parseInt(last.receiptNo.replace(prefix, ''), 10) : 0;
  return `${prefix}${String(lastNum + 1).padStart(4, '0')}`;
}

// Wrap payment-create with retry on P2002 (receiptNo uniqueness) until a DB sequence is added.
async function createPaymentWithRetry(buildData, ledgerUpdate, maxRetries = 5) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const receiptNo = await getNextReceiptNumber(tx);
        const payment = await tx.payment.create({ data: buildData(receiptNo) });
        if (ledgerUpdate) await ledgerUpdate(tx);
        return { payment, receiptNo };
      });
    } catch (err) {
      if (err.code === 'P2002' && attempt < maxRetries - 1) continue;
      throw err;
    }
  }
}

// GET /api/students/:id/payments — admin/TA/admissions, or the student themselves
router.get('/students/:id/payments', authenticate, async (req, res, next) => {
  try {
    const role = req.user.role;
    const isStaff = ['FULL_ADMIN', 'TEACHER_ADMIN', 'ADMISSIONS_OFFICER', 'FACULTY'].includes(role);
    if (!isStaff) {
      if (role !== 'STUDENT') return res.status(403).json({ error: 'Forbidden' });
      const sp = await prisma.studentProfile.findFirst({ where: { userId: req.user.id }, select: { id: true } });
      if (!sp || sp.id !== req.params.id) return res.status(403).json({ error: 'Forbidden' });
    }
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
      const { studentId, ledgerId, mode, notes } = req.body;
      const amount = Number(req.body.amount);
      const exchangeRate = req.body.exchangeRate != null ? Number(req.body.exchangeRate) : null;
      const currency = req.body.currency || 'INR';

      if (!studentId) return res.status(400).json({ error: 'studentId is required' });
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: 'Amount must be a positive number' });
      }
      if (exchangeRate !== null && (!Number.isFinite(exchangeRate) || exchangeRate <= 0)) {
        return res.status(400).json({ error: 'Exchange rate must be a positive number' });
      }

      // Verify ledger belongs to studentId and amount fits
      if (ledgerId) {
        const ledger = await prisma.studentFeeLedger.findUnique({
          where: { id: ledgerId },
          select: { studentId: true, balance: true, currency: true },
        });
        if (!ledger) return res.status(404).json({ error: 'Ledger entry not found' });
        if (ledger.studentId !== studentId) {
          return res.status(400).json({ error: 'Ledger does not belong to this student' });
        }
        if (ledger.currency !== currency) {
          return res.status(400).json({ error: `Ledger is in ${ledger.currency}, not ${currency}` });
        }
        if (amount > Number(ledger.balance)) {
          return res.status(400).json({ error: `Amount exceeds ledger balance (${ledger.balance})` });
        }
      }

      const { payment, receiptNo } = await createPaymentWithRetry(
        (receiptNo) => ({
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
        }),
        ledgerId
          ? async (tx) => {
              // Atomic decrement guards against read-modify-write races
              const updated = await tx.studentFeeLedger.update({
                where: { id: ledgerId },
                data: { balance: { decrement: amount } },
                select: { balance: true },
              });
              const newBalance = Number(updated.balance);
              await tx.studentFeeLedger.update({
                where: { id: ledgerId },
                data: { status: newBalance <= 0 ? 'PAID' : 'PARTIAL' },
              });
            }
          : null
      );

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
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, ledgerId } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing Razorpay fields' });
    }

    // Timing-safe signature verification
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSig = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body).digest('hex');
    const sigBuf = Buffer.from(razorpay_signature, 'hex');
    const expBuf = Buffer.from(expectedSig, 'hex');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return res.status(400).json({ error: 'Payment verification failed' });
    }

    // Fetch the verified order from Razorpay — the body's `amount` is untrusted.
    let order;
    try {
      const razorpay = getRazorpay();
      order = await razorpay.orders.fetch(razorpay_order_id);
    } catch (e) {
      return res.status(400).json({ error: 'Could not fetch order from gateway' });
    }
    if (order.status !== 'paid') {
      return res.status(400).json({ error: `Order not paid (status: ${order.status})` });
    }
    // Confirm the order belongs to this student (we set studentId in notes when creating)
    const orderStudentUserId = order.notes?.studentId;
    if (orderStudentUserId && orderStudentUserId !== req.user.id) {
      return res.status(403).json({ error: 'Order does not belong to this user' });
    }

    const sp = await prisma.studentProfile.findFirst({ where: { userId: req.user.id } });
    if (!sp) return res.status(404).json({ error: 'Student not found' });

    // Trust the gateway, not the request body, for amount/currency.
    const amount = Number(order.amount) / 100; // paise → rupees
    const currency = order.currency || 'INR';

    // If a ledgerId is supplied, verify it belongs to this student
    if (ledgerId) {
      const ledger = await prisma.studentFeeLedger.findUnique({
        where: { id: ledgerId },
        select: { studentId: true, currency: true },
      });
      if (!ledger || ledger.studentId !== sp.id) {
        return res.status(400).json({ error: 'Ledger does not belong to this student' });
      }
      if (ledger.currency !== currency) {
        return res.status(400).json({ error: `Ledger is in ${ledger.currency}, not ${currency}` });
      }
    }

    const { payment, receiptNo } = await createPaymentWithRetry(
      (receiptNo) => ({
        studentId: sp.id,
        ledgerId,
        amount,
        currency,
        mode: 'CARD',
        receiptNo,
        gatewayRef: razorpay_payment_id,
        recordedById: req.user.id,
        status: 'confirmed',
      }),
      ledgerId
        ? async (tx) => {
            const updated = await tx.studentFeeLedger.update({
              where: { id: ledgerId },
              data: { balance: { decrement: amount } },
              select: { balance: true },
            });
            const newBalance = Number(updated.balance);
            await tx.studentFeeLedger.update({
              where: { id: ledgerId },
              data: { status: newBalance <= 0 ? 'PAID' : 'PARTIAL' },
            });
          }
        : null
    );

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
