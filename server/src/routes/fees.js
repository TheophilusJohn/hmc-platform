// server/src/routes/fees.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { adminOnly, adminOrTA, requireRole } = require('../middleware/rbac');
const { Prisma } = require('@prisma/client');

// GET /api/fee-types
router.get('/fee-types', authenticate, async (req, res, next) => {
  try {
    const feeTypes = await prisma.feeType.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    res.json({ feeTypes });
  } catch (err) { next(err); }
});

// POST /api/fee-types
router.post('/fee-types', authenticate, adminOnly, async (req, res, next) => {
  try {
    const feeType = await prisma.feeType.create({ data: req.body });
    res.status(201).json({ feeType });
  } catch (err) { next(err); }
});

// PUT /api/fee-types/:id
router.put('/fee-types/:id', authenticate, adminOnly, async (req, res, next) => {
  try {
    const feeType = await prisma.feeType.update({ where: { id: req.params.id }, data: req.body });
    res.json({ feeType });
  } catch (err) { next(err); }
});

// DELETE /api/fee-types/:id (deactivate)
router.delete('/fee-types/:id', authenticate, adminOnly, async (req, res, next) => {
  try {
    const feeType = await prisma.feeType.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ feeType });
  } catch (err) { next(err); }
});

// GET /api/students/:id/ledger
router.get('/students/:id/ledger', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const role = req.user.role;
    const staffRoles = ['FULL_ADMIN', 'TEACHER_ADMIN', 'ADMISSIONS_OFFICER', 'FACULTY'];

    if (role === 'STUDENT') {
      const profile = await prisma.studentProfile.findFirst({ where: { userId: req.user.id } });
      if (profile?.id !== id) return res.status(403).json({ error: 'Access denied' });
    } else if (!staffRoles.includes(role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const ledger = await prisma.studentFeeLedger.findMany({
      where: { studentId: id },
      include: {
        feeType: true,
        semester: true,
        payments: { orderBy: { paidAt: 'desc' } },
        waivers: true,
        carryForwardFrom: { include: { semester: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Per-currency summary — pre-fix mixed INR and USD entries into the same
    // bucket so totals were meaningless for international students with both
    // INR-override rows and USD rows.
    const blank = () => ({ totalCharged: 0, totalPaid: 0, totalWaived: 0, totalOutstanding: 0 });
    const byCurrency = { INR: blank(), USD: blank() };
    for (const entry of ledger) {
      const cur = (entry.currency || 'INR').toUpperCase();
      const bucket = byCurrency[cur] || (byCurrency[cur] = blank());
      bucket.totalCharged += Number(entry.amount);
      bucket.totalWaived += Number(entry.waivedAmount);
      const paid = entry.payments.reduce((s, p) => s + Number(p.amount), 0);
      bucket.totalPaid += paid;
      bucket.totalOutstanding += Number(entry.balance);
    }
    // Keep legacy summary keys (across-currency totals) for any caller that
    // doesn't yet split, but expose per-currency breakdown as the source of truth.
    const summary = {
      totalCharged: byCurrency.INR.totalCharged + byCurrency.USD.totalCharged,
      totalPaid: byCurrency.INR.totalPaid + byCurrency.USD.totalPaid,
      totalWaived: byCurrency.INR.totalWaived + byCurrency.USD.totalWaived,
      totalOutstanding: byCurrency.INR.totalOutstanding + byCurrency.USD.totalOutstanding,
      byCurrency,
    };

    res.json({ ledger, summary });
  } catch (err) { next(err); }
});

// POST /api/students/:id/ledger/charge
router.post('/students/:id/ledger/charge', authenticate,
  requireRole('FULL_ADMIN', 'TEACHER_ADMIN', 'ADMISSIONS_OFFICER'),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { feeTypeId, description, currency, semesterId, dueDate } = req.body;

      let chargeAmount = Number(req.body.amount);
      let chargeCurrency = currency;

      if (feeTypeId) {
        const student = await prisma.studentProfile.findUnique({ where: { id } });
        const feeType = await prisma.feeType.findUnique({ where: { id: feeTypeId } });
        // Guard against missing/inactive feeType — pre-fix this threw on
        // `feeType.internationalAmount` when feeType was null.
        if (!feeType) return res.status(400).json({ error: 'Invalid feeTypeId' });
        if (feeType.isActive === false) return res.status(400).json({ error: 'Fee type is not active' });
        chargeAmount = Number(student?.studentType === 'INTERNATIONAL'
          ? feeType.internationalAmount
          : feeType.domesticAmount);
        chargeCurrency = student?.studentType === 'INTERNATIONAL' ? 'USD' : 'INR';
      }

      if (!Number.isFinite(chargeAmount) || chargeAmount <= 0) {
        return res.status(400).json({ error: 'Charge amount must be a positive number' });
      }

      // Use Prisma.Decimal for Decimal(10,2) columns — Number coercion loses
      // precision for amounts like 37000.10 (binary float can't represent .10
      // exactly).
      const amountDec = new Prisma.Decimal(String(chargeAmount));
      const entry = await prisma.studentFeeLedger.create({
        data: {
          studentId: id,
          semesterId,
          feeTypeId,
          description,
          amount: amountDec,
          currency: chargeCurrency,
          waivedAmount: new Prisma.Decimal(0),
          balance: amountDec,
          status: 'UNPAID',
          dueDate: dueDate ? new Date(dueDate) : null,
          addedById: req.user.id,
        }
      });

      // Notify student
      try {
        const { createNotification } = require('../services/notification.service');
        const student = await prisma.studentProfile.findUnique({
          where: { id },
          include: { user: true }
        });
        if (student?.user) {
          await createNotification(
            student.user.id,
            'fee_charge',
            'New Charge Added',
            `A new charge of ${chargeCurrency === 'INR' ? '₹' : '$'}${chargeAmount} has been added to your account.`,
          );
        }
      } catch (_e) {}

      res.status(201).json({ entry });
    } catch (err) { next(err); }
  }
);

// POST /api/fee-types/:id/bulk-charge — preview
router.post('/fee-types/:id/bulk-charge/preview', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { scope, programmeId, batchId, studentIds } = req.body;
    const feeType = await prisma.feeType.findUnique({ where: { id: req.params.id } });

    // Always restrict to ACTIVE users — pre-fix the preview total included
    // INACTIVE/GRADUATED/SUSPENDED students, wildly inflating the figure.
    let where = { user: { status: 'ACTIVE' } };
    if (scope === 'all') { /* no extra filter */ }
    else if (scope === 'programme') where.programmeId = programmeId;
    else if (scope === 'batch') where.batchId = batchId;
    else if (scope === 'individual') where.id = { in: studentIds || [] };

    const students = await prisma.studentProfile.findMany({
      where,
      include: { user: { select: { userIdDisplay: true } } },
    });

    const total = students.reduce((sum, s) => {
      return sum + Number(s.studentType === 'INTERNATIONAL' ? feeType.internationalAmount : feeType.domesticAmount);
    }, 0);

    res.json({ count: students.length, total, students: students.map(s => ({ id: s.id, name: `${s.firstName} ${s.lastName}`, userIdDisplay: s.user?.userIdDisplay })) });
  } catch (err) { next(err); }
});

// POST /api/fee-types/:id/bulk-charge — apply
router.post('/fee-types/:id/bulk-charge/apply', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { scope, programmeId, batchId, studentIds, semesterId, dueDate } = req.body;
    const feeType = await prisma.feeType.findUnique({ where: { id: req.params.id } });

    let where = {};
    if (scope === 'programme') where = { programmeId };
    else if (scope === 'batch') where = { batchId };
    else if (scope === 'individual') where = { id: { in: studentIds } };

    const students = await prisma.studentProfile.findMany({ where });

    const entries = await Promise.all(students.map(s => {
      const amount = s.studentType === 'INTERNATIONAL' ? feeType.internationalAmount : feeType.domesticAmount;
      const currency = s.studentType === 'INTERNATIONAL' ? 'USD' : 'INR';
      return prisma.studentFeeLedger.create({
        data: {
          studentId: s.id,
          feeTypeId: feeType.id,
          semesterId,
          amount, currency,
          waivedAmount: 0,
          balance: amount,
          status: 'UNPAID',
          dueDate: dueDate ? new Date(dueDate) : null,
          addedById: req.user.id,
        }
      });
    }));

    res.json({ applied: entries.length });
  } catch (err) { next(err); }
});

// Legacy /api/fees/waivers routes were removed — apply/revoke math diverged
// from the canonical waivers.js routes (mounted at /api/waivers). The FE has
// always called the canonical /api/waivers path; nothing in the codebase
// references /api/fees/waivers any more.

module.exports = router;
