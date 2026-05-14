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

    let where = {};
    if (scope === 'all') where = {};
    else if (scope === 'programme') where = { programmeId };
    else if (scope === 'batch') where = { batchId };
    else if (scope === 'individual') where = { id: { in: studentIds } };

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

// POST /api/waivers — delegated to canonical waivers.js routes; keep route mounted for legacy callers
router.post('/waivers', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { studentId, ledgerId, waiverType, reason, customReason, validUntil } = req.body;
    const amountOrPercent = Number(req.body.amountOrPercent);

    if (!ledgerId || !studentId) return res.status(400).json({ error: 'studentId and ledgerId are required' });
    if (waiverType !== 'FULL' && (!Number.isFinite(amountOrPercent) || amountOrPercent <= 0)) {
      return res.status(400).json({ error: 'amountOrPercent must be a positive number' });
    }
    if (waiverType === 'PARTIAL_PERCENT' && amountOrPercent > 100) {
      return res.status(400).json({ error: 'Percentage cannot exceed 100' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const ledger = await tx.studentFeeLedger.findUnique({ where: { id: ledgerId } });
      if (!ledger) throw Object.assign(new Error('Ledger entry not found'), { status: 404 });
      if (ledger.studentId !== studentId) {
        throw Object.assign(new Error('Ledger does not belong to this student'), { status: 400 });
      }

      // Idempotency: refuse if an unrevoked waiver already exists for this ledger
      const existing = await tx.waiver.findFirst({
        where: { ledgerId, revokedAt: null },
      });
      if (existing) {
        throw Object.assign(new Error('A waiver is already active for this ledger entry. Revoke it first.'), { status: 409 });
      }

      let waivedAmount;
      if (waiverType === 'FULL') waivedAmount = Number(ledger.balance);
      else if (waiverType === 'PARTIAL_PERCENT') waivedAmount = (Number(ledger.balance) * amountOrPercent) / 100;
      else waivedAmount = Math.min(amountOrPercent, Number(ledger.balance));

      const waiver = await tx.waiver.create({
        data: {
          studentId, ledgerId, waiverType, amountOrPercent,
          reason, customReason,
          validUntil: validUntil ? new Date(validUntil) : null,
          appliedById: req.user.id,
        },
      });

      const newBalance = Math.max(0, Number(ledger.balance) - waivedAmount);
      await tx.studentFeeLedger.update({
        where: { id: ledgerId },
        data: {
          waivedAmount: Number(ledger.waivedAmount) + waivedAmount,
          balance: newBalance,
          status: newBalance === 0 ? 'WAIVED' : 'PARTIAL',
        },
      });

      return { waiver, waivedAmount, ledger };
    });

    try {
      const { createNotification } = require('../services/notification.service');
      const student = await prisma.studentProfile.findUnique({ where: { id: studentId }, include: { user: true } });
      if (student?.user) {
        await createNotification(
          student.user.id, 'waiver_applied', 'Waiver Applied',
          `A waiver of ${result.ledger.currency === 'INR' ? '₹' : '$'}${result.waivedAmount.toFixed(2)} has been applied to your account.`
        );
      }
    } catch (_e) {}

    res.status(201).json({ waiver: result.waiver });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// PUT /api/waivers/:id/revoke — restore ledger balance immediately
router.put('/waivers/:id/revoke', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { reason } = req.body;
    const result = await prisma.$transaction(async (tx) => {
      const waiver = await tx.waiver.findUnique({
        where: { id: req.params.id },
        include: { ledger: true, student: { include: { user: true } } },
      });
      if (!waiver) throw Object.assign(new Error('Waiver not found'), { status: 404 });
      if (waiver.revokedAt) throw Object.assign(new Error('Waiver is already revoked'), { status: 400 });

      // Compute the amount this waiver actually deducted
      let originalWaived;
      const ledger = waiver.ledger;
      const baseAmount = Number(ledger.amount);
      if (waiver.waiverType === 'FULL') originalWaived = Number(ledger.waivedAmount);
      else if (waiver.waiverType === 'PARTIAL_PERCENT') originalWaived = (baseAmount * Number(waiver.amountOrPercent)) / 100;
      else originalWaived = Math.min(Number(waiver.amountOrPercent), Number(ledger.waivedAmount));

      const newWaived = Math.max(0, Number(ledger.waivedAmount) - originalWaived);
      const newBalance = Number(ledger.balance) + originalWaived;
      await tx.studentFeeLedger.update({
        where: { id: ledger.id },
        data: {
          waivedAmount: newWaived,
          balance: newBalance,
          status: newWaived > 0 ? 'PARTIAL' : (newBalance > 0 ? 'UNPAID' : 'PAID'),
        },
      });

      const now = new Date();
      await tx.waiver.update({
        where: { id: req.params.id },
        data: { revokedAt: now, revokeReason: reason },
      });

      return { waiver, restored: originalWaived, effectiveDate: now };
    });

    if (result.waiver.student?.user) {
      try {
        const { createNotification } = require('../services/notification.service');
        await createNotification(
          result.waiver.student.user.id, 'waiver_revoked', 'Waiver Removed',
          `Your waiver has been removed. ${result.restored.toFixed(2)} has been re-added to your balance.`
        );
      } catch (_e) {}
    }

    res.json({ message: 'Waiver revoked', effectiveDate: result.effectiveDate, restored: result.restored });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

module.exports = router;
