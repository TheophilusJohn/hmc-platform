// server/src/routes/fees.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { adminOnly, adminOrTA, requireRole } = require('../middleware/rbac');

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

    // Students can only see their own ledger
    if (req.user.role === 'STUDENT') {
      const profile = await prisma.studentProfile.findFirst({ where: { userId: req.user.id } });
      if (profile?.id !== id) return res.status(403).json({ error: 'Access denied' });
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

    // Summary
    const summary = ledger.reduce((acc, entry) => {
      acc.totalCharged += Number(entry.amount);
      acc.totalWaived += Number(entry.waivedAmount);
      const paid = entry.payments.reduce((s, p) => s + Number(p.amount), 0);
      acc.totalPaid += paid;
      acc.totalOutstanding += Number(entry.balance);
      return acc;
    }, { totalCharged: 0, totalPaid: 0, totalWaived: 0, totalOutstanding: 0 });

    res.json({ ledger, summary });
  } catch (err) { next(err); }
});

// POST /api/students/:id/ledger/charge
router.post('/students/:id/ledger/charge', authenticate,
  requireRole('FULL_ADMIN', 'TEACHER_ADMIN', 'ADMISSIONS_OFFICER'),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { feeTypeId, description, amount, currency, semesterId, dueDate } = req.body;

      let chargeAmount = amount;
      let chargeCurrency = currency;

      if (feeTypeId) {
        const student = await prisma.studentProfile.findUnique({ where: { id } });
        const feeType = await prisma.feeType.findUnique({ where: { id: feeTypeId } });
        chargeAmount = student?.studentType === 'INTERNATIONAL'
          ? feeType.internationalAmount
          : feeType.domesticAmount;
        chargeCurrency = student?.studentType === 'INTERNATIONAL' ? 'USD' : 'INR';
      }

      const entry = await prisma.studentFeeLedger.create({
        data: {
          studentId: id,
          semesterId,
          feeTypeId,
          description,
          amount: chargeAmount,
          currency: chargeCurrency,
          waivedAmount: 0,
          balance: chargeAmount,
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

// POST /api/waivers
router.post('/waivers', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { studentId, ledgerId, waiverType, amountOrPercent, reason, customReason, validUntil } = req.body;

    const ledger = await prisma.studentFeeLedger.findUnique({ where: { id: ledgerId } });
    if (!ledger) return res.status(404).json({ error: 'Ledger entry not found' });

    let waivedAmount;
    if (waiverType === 'FULL') {
      waivedAmount = Number(ledger.balance);
    } else if (waiverType === 'PARTIAL_PERCENT') {
      waivedAmount = (Number(ledger.balance) * amountOrPercent) / 100;
    } else {
      waivedAmount = Math.min(amountOrPercent, Number(ledger.balance));
    }

    const waiver = await prisma.waiver.create({
      data: {
        studentId,
        ledgerId,
        waiverType,
        amountOrPercent,
        reason,
        customReason,
        validUntil: validUntil ? new Date(validUntil) : null,
        appliedById: req.user.id,
      }
    });

    // Update ledger
    const newBalance = Math.max(0, Number(ledger.balance) - waivedAmount);
    await prisma.studentFeeLedger.update({
      where: { id: ledgerId },
      data: {
        waivedAmount: Number(ledger.waivedAmount) + waivedAmount,
        balance: newBalance,
        status: newBalance === 0 ? 'WAIVED' : 'PARTIAL',
      }
    });

    // Notify student
    try {
      const { createNotification } = require('../services/notification.service');
      const student = await prisma.studentProfile.findUnique({ where: { id: studentId }, include: { user: true } });
      if (student?.user) {
        await createNotification(student.user.id, 'waiver_applied', 'Waiver Applied', `A waiver of ${ledger.currency === 'INR' ? '₹' : '$'}${waivedAmount.toFixed(2)} has been applied to your account.`);
      }
    } catch (_e) {}

    res.status(201).json({ waiver });
  } catch (err) { next(err); }
});

// PUT /api/waivers/:id/revoke
router.put('/waivers/:id/revoke', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { reason } = req.body;

    const waiver = await prisma.waiver.findUnique({
      where: { id: req.params.id },
      include: { ledger: true, student: { include: { user: true } } }
    });

    if (!waiver) return res.status(404).json({ error: 'Waiver not found' });

    // Revocation applies from next billing month only
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    nextMonth.setDate(1);

    await prisma.waiver.update({
      where: { id: req.params.id },
      data: { revokedAt: nextMonth, revokeReason: reason },
    });

    // Notify student
    if (waiver.student?.user) {
      try {
        const { createNotification } = require('../services/notification.service');
        await createNotification(
          waiver.student.user.id,
          'waiver_revoked',
          'Waiver Removed',
          `Your waiver has been removed effective ${nextMonth.toLocaleDateString('en-IN')}. Please check your account balance.`
        );
      } catch (_e) {}
    }

    res.json({ message: 'Waiver revocation scheduled', effectiveDate: nextMonth });
  } catch (err) { next(err); }
});

module.exports = router;
