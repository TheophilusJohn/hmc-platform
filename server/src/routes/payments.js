// server/src/routes/payments.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { Prisma } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');
const { requireRole, adminOnly } = require('../middleware/rbac');

// Razorpay returns amounts in the smallest currency unit (paise for INR, cents for USD).
// Divide by 100 to get the major-unit value used in our ledger (Decimal rupees/dollars).
function minorToMajor(minorAmount) {
  return new Prisma.Decimal(minorAmount).div(100);
}

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

// GET /api/students/:id/payments — admin/TA/admissions, or the student themselves.
// FACULTY has no business reading another student's payment history.
router.get('/students/:id/payments', authenticate, async (req, res, next) => {
  try {
    const role = req.user.role;
    const isStaff = ['FULL_ADMIN', 'TEACHER_ADMIN', 'ADMISSIONS_OFFICER'].includes(role);
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
              // Reject overpayment inside the transaction (the pre-flight check
              // above can race against concurrent payments on the same ledger).
              const pre = await tx.studentFeeLedger.findUnique({
                where: { id: ledgerId }, select: { balance: true },
              });
              const remaining = new Prisma.Decimal(pre.balance);
              const amountDec = new Prisma.Decimal(amount);
              if (amountDec.gt(remaining)) {
                throw Object.assign(new Error(`Amount exceeds ledger balance (${remaining.toString()})`), { status: 400 });
              }
              const updated = await tx.studentFeeLedger.update({
                where: { id: ledgerId },
                data: { balance: { decrement: amount } },
                select: { balance: true },
              });
              // PAID when fully cleared, PARTIAL otherwise. UNPAID is reserved
              // for "balance > 0 AND no payments ever made" — a state that
              // can't arise from a successful payment.
              const newBalance = new Prisma.Decimal(updated.balance);
              await tx.studentFeeLedger.update({
                where: { id: ledgerId },
                data: { status: newBalance.lte(0) ? 'PAID' : 'PARTIAL' },
              });
            }
          : null
      );

      res.status(201).json({ payment, receiptNo });
    } catch (err) { next(err); }
  }
);

// Resolve the active StudentProfile for the requesting student user. Returns
// null if not a STUDENT or no profile exists.
async function resolveStudentProfile(userId) {
  return prisma.studentProfile.findFirst({
    where: { userId },
    select: { id: true, studentType: true, payInInrOverride: true },
  });
}

// Shared helper for the gateway-create endpoints: derives a server-side amount
// from the ledger (clamped to remaining balance), validates ownership/currency,
// and returns the Razorpay order plus authoritative metadata. Throws on errors
// the caller should surface as 400s.
async function buildLedgerOrder(req, { defaultCurrency = 'INR' } = {}) {
  const sp = await resolveStudentProfile(req.user.id);
  if (!sp) throw Object.assign(new Error('Student profile not found'), { status: 404 });

  const { ledgerId } = req.body;
  if (!ledgerId) throw Object.assign(new Error('ledgerId is required'), { status: 400 });

  const ledger = await prisma.studentFeeLedger.findUnique({
    where: { id: ledgerId },
    select: { studentId: true, balance: true, currency: true },
  });
  if (!ledger) throw Object.assign(new Error('Ledger entry not found'), { status: 404 });
  if (ledger.studentId !== sp.id) {
    throw Object.assign(new Error('Ledger does not belong to this student'), { status: 403 });
  }
  if (new Prisma.Decimal(ledger.balance).lte(0)) {
    throw Object.assign(new Error('Ledger has no outstanding balance'), { status: 400 });
  }

  // Server-derived amount: optional client value is allowed but ALWAYS clamped to
  // [1 minor unit, remaining balance]. Client-trusted amount was a known exploit.
  const balanceDec = new Prisma.Decimal(ledger.balance);
  let amountDec = balanceDec;
  if (req.body.amount !== undefined && req.body.amount !== null) {
    const requested = new Prisma.Decimal(String(req.body.amount));
    if (!requested.isFinite() || requested.lte(0)) {
      throw Object.assign(new Error('Amount must be a positive number'), { status: 400 });
    }
    if (requested.gt(balanceDec)) {
      throw Object.assign(new Error('Amount exceeds remaining balance'), { status: 400 });
    }
    amountDec = requested;
  }

  // Major-unit Decimal → minor-unit integer for Razorpay.
  const amountMinor = amountDec.mul(100).round().toNumber();
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw Object.assign(new Error('Invalid amount'), { status: 400 });
  }

  const currency = ledger.currency || defaultCurrency;

  const receiptNo = await getNextReceiptNumber();
  const razorpay = getRazorpay();
  const order = await razorpay.orders.create({
    amount: amountMinor,
    currency,
    receipt: receiptNo,
    // Notes are server-controlled metadata that verify and webhook handlers trust.
    notes: {
      ledgerId,
      studentProfileId: sp.id,
      studentUserId: req.user.id,
    },
  });
  return { order, amountDec, currency, receiptNo, ledger };
}

// POST /api/payments/razorpay/create-order
router.post('/razorpay/create-order', authenticate, requireRole('STUDENT'), async (req, res, next) => {
  try {
    const { order, amountDec, currency, receiptNo } = await buildLedgerOrder(req);
    res.json({
      orderId: order.id,
      receiptNo,
      amount: amountDec.toString(),
      amountMinor: order.amount,
      currency,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// POST /api/payments/razorpay/verify
router.post('/razorpay/verify', authenticate, requireRole('STUDENT'), async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

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

    // Fetch the verified order from Razorpay — the body's `amount`/`ledgerId` are untrusted.
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

    const orderStudentUserId = order.notes?.studentUserId || order.notes?.studentId;
    // Unconditional match — empty notes are not OK; the order MUST have been created via our server.
    if (!orderStudentUserId || orderStudentUserId !== req.user.id) {
      return res.status(403).json({ error: 'Order does not belong to this user' });
    }

    const sp = await prisma.studentProfile.findFirst({ where: { userId: req.user.id } });
    if (!sp) return res.status(404).json({ error: 'Student not found' });

    // Trust the gateway notes, not the request body. The ledger was bound at create-order time.
    const ledgerId = order.notes?.ledgerId || null;

    // Idempotency: if a Payment row with this gatewayRef already exists (from
    // /verify retry or webhook arrival), don't double-credit the ledger.
    const existing = await prisma.payment.findFirst({ where: { gatewayRef: razorpay_payment_id }, select: { id: true, receiptNo: true } });
    if (existing) {
      return res.json({ payment: existing, receiptNo: existing.receiptNo, idempotent: true });
    }

    const currency = order.currency || 'INR';
    const amountDec = minorToMajor(order.amount); // gateway-authoritative amount

    if (ledgerId) {
      const ledger = await prisma.studentFeeLedger.findUnique({
        where: { id: ledgerId },
        select: { studentId: true, currency: true, balance: true },
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
        ...(ledgerId && { ledgerId }),
        amount: amountDec,
        currency,
        mode: 'CARD',
        receiptNo,
        gatewayRef: razorpay_payment_id,
        recordedById: req.user.id,
        status: 'confirmed',
      }),
      ledgerId
        ? async (tx) => {
            // Reject overpayment in-transaction (race-safe vs. concurrent verifies).
            const pre = await tx.studentFeeLedger.findUnique({
              where: { id: ledgerId }, select: { balance: true },
            });
            const remaining = new Prisma.Decimal(pre.balance);
            if (amountDec.gt(remaining)) {
              throw Object.assign(new Error(`Gateway amount exceeds remaining ledger balance (${remaining.toString()})`), { status: 400 });
            }
            const updated = await tx.studentFeeLedger.update({
              where: { id: ledgerId },
              data: { balance: { decrement: amountDec } },
              select: { balance: true },
            });
            const newBalance = new Prisma.Decimal(updated.balance);
            await tx.studentFeeLedger.update({
              where: { id: ledgerId },
              data: { status: newBalance.lte(0) ? 'PAID' : 'PARTIAL' },
            });
          }
        : null
    );

    // Notify
    try {
      const { createNotification } = require('../services/notification.service');
      await createNotification(req.user.id, 'payment_confirmed', 'Payment Confirmed', `Your payment of ${currency === 'INR' ? '₹' : '$'}${amountDec.toString()} (${receiptNo}) has been received.`);
    } catch (_e) {}

    res.json({ payment, receiptNo });
  } catch (err) { next(err); }
});


// POST /api/payments/create-order - alias used by Student Fees page (same contract as razorpay/create-order).
router.post('/create-order', authenticate, requireRole('STUDENT'), async (req, res, next) => {
  try {
    const { order, amountDec, currency, receiptNo } = await buildLedgerOrder(req);
    res.json({
      id: order.id,
      amount: order.amount,
      amountMajor: amountDec.toString(),
      currency,
      receiptNo,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('create-order:', err);
    next(err);
  }
});

// POST /api/payments/installment-order - Razorpay order for a specific installment.
// Body: { installmentId, installmentIndex } — InstallmentPlan.schedule is a JSON
// array of {dueDate, amount, status, paidAt} objects; we look up the index.
router.post('/installment-order', authenticate, requireRole('STUDENT'), async (req, res, next) => {
  try {
    const { installmentId, installmentIndex } = req.body;
    if (!installmentId) return res.status(400).json({ error: 'installmentId is required' });
    const idx = Number(installmentIndex);
    if (!Number.isInteger(idx) || idx < 0) return res.status(400).json({ error: 'installmentIndex must be a non-negative integer' });

    const plan = await prisma.installmentPlan.findUnique({ where: { id: installmentId } });
    if (!plan) return res.status(404).json({ error: 'Installment plan not found' });

    // Confirm ownership
    const sp = await resolveStudentProfile(req.user.id);
    if (!sp || sp.id !== plan.studentId) return res.status(403).json({ error: 'Forbidden' });

    const schedule = Array.isArray(plan.schedule) ? plan.schedule : [];
    const inst = schedule[idx];
    if (!inst || inst.status === 'paid') return res.status(400).json({ error: 'Installment not payable' });

    const amountDec = new Prisma.Decimal(String(inst.amount));
    if (!amountDec.isFinite() || amountDec.lte(0)) return res.status(400).json({ error: 'Installment amount invalid' });

    const amountMinor = amountDec.mul(100).round().toNumber();
    const receiptNo = await getNextReceiptNumber();
    const razorpay = getRazorpay();
    const order = await razorpay.orders.create({
      amount: amountMinor,
      currency: 'INR',
      receipt: receiptNo,
      notes: {
        installmentId,
        installmentIndex: String(idx),
        studentProfileId: sp.id,
        studentUserId: req.user.id,
      },
    });
    res.json({ id: order.id, amount: order.amount, amountMajor: amountDec.toString(), currency: 'INR', receiptNo });
  } catch (err) { console.error('installment-order:', err); next(err); }
});

// POST /api/payments/razorpay/webhook
// Razorpay's server-to-server fallback: if the client closes between gateway
// success and /verify, the webhook still posts the event. The webhook secret
// is configured separately in the Razorpay dashboard (RAZORPAY_WEBHOOK_SECRET).
// We accept payment.captured / order.paid and idempotently credit the ledger.
// IMPORTANT: this route must read the raw body for signature verification;
// it's wired below with express.raw() and parsed manually.
router.post('/razorpay/webhook', express.raw({ type: '*/*', limit: '1mb' }), async (req, res, next) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
      console.warn('[Razorpay webhook] RAZORPAY_WEBHOOK_SECRET not set — refusing');
      return res.status(503).json({ error: 'Webhook not configured' });
    }
    const signature = req.headers['x-razorpay-signature'];
    if (!signature) return res.status(400).json({ error: 'Missing signature' });

    const raw = req.body; // Buffer
    const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    const sigBuf = Buffer.from(String(signature), 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = JSON.parse(raw.toString('utf8'));
    const eventType = event.event;

    // We care primarily about payment.captured; order.paid arrives close in time
    // and is treated the same. Both carry the order entity in payload.
    const orderEntity = event.payload?.order?.entity || null;
    const paymentEntity = event.payload?.payment?.entity || null;
    if (!paymentEntity) {
      // Other event types (refunded, failed, etc.) — ack but no-op for now.
      return res.json({ received: true, ignored: eventType });
    }

    const gatewayRef = paymentEntity.id;
    const orderId = paymentEntity.order_id;

    // Idempotency: if we already recorded this gateway payment id, return early.
    const existing = await prisma.payment.findFirst({ where: { gatewayRef }, select: { id: true } });
    if (existing) return res.json({ received: true, idempotent: true });

    // Fetch the order to read our trusted notes (in case orderEntity isn't in the payload).
    let order = orderEntity;
    if (!order) {
      try {
        order = await getRazorpay().orders.fetch(orderId);
      } catch (e) {
        return res.status(400).json({ error: 'Could not fetch order from gateway' });
      }
    }
    if (order.status !== 'paid' && paymentEntity.status !== 'captured') {
      return res.json({ received: true, ignored: 'order not paid yet' });
    }

    const notes = order.notes || {};
    const studentUserId = notes.studentUserId || notes.studentId;
    const ledgerId = notes.ledgerId || null;
    if (!studentUserId) return res.json({ received: true, ignored: 'order has no studentUserId in notes' });

    const sp = await prisma.studentProfile.findFirst({ where: { userId: studentUserId }, select: { id: true } });
    if (!sp) return res.json({ received: true, ignored: 'student profile not found' });

    const currency = paymentEntity.currency || order.currency || 'INR';
    const amountDec = minorToMajor(paymentEntity.amount || order.amount);

    if (ledgerId) {
      const ledger = await prisma.studentFeeLedger.findUnique({
        where: { id: ledgerId }, select: { studentId: true, currency: true },
      });
      if (!ledger || ledger.studentId !== sp.id || ledger.currency !== currency) {
        return res.json({ received: true, ignored: 'ledger mismatch' });
      }
    }

    await createPaymentWithRetry(
      (receiptNo) => ({
        studentId: sp.id,
        ...(ledgerId && { ledgerId }),
        amount: amountDec,
        currency,
        mode: 'CARD',
        receiptNo,
        gatewayRef,
        recordedById: null,
        status: 'confirmed',
        notes: `webhook:${eventType}`,
      }),
      ledgerId
        ? async (tx) => {
            const updated = await tx.studentFeeLedger.update({
              where: { id: ledgerId },
              data: { balance: { decrement: amountDec } },
              select: { balance: true },
            });
            const newBalance = new Prisma.Decimal(updated.balance);
            await tx.studentFeeLedger.update({
              where: { id: ledgerId },
              data: { status: newBalance.lte(0) ? 'PAID' : 'PARTIAL' },
            });
          }
        : null
    );

    res.json({ received: true });
  } catch (err) {
    console.error('Razorpay webhook handler failed:', err);
    // Always 200 on processing failure so Razorpay doesn't retry forever, but log loudly.
    res.json({ received: true, error: err.message });
  }
});

module.exports = router;
