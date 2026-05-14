// server/src/routes/waivers.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { adminOnly, requireRole } = require('../middleware/rbac');
const notif = require('../services/notification.service');

router.get('/', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { studentId } = req.query;
    const waivers = await prisma.waiver.findMany({
      where: studentId ? { studentId } : {},
      include: {
        student: { select: { firstName: true, lastName: true } },
        ledger: { include: { feeType: { select: { name: true } } } },
      },
      orderBy: { appliedAt: 'desc' },
    });
    res.json(waivers);
  } catch (err) { next(err); }
});

router.post('/', authenticate, requireRole('FULL_ADMIN', 'ADMISSIONS_OFFICER'), async (req, res, next) => {
  try {
    const { studentId, ledgerId, waiverType, reason, customReason, validUntil, notifyStudent = true } = req.body;
    const amountOrPercent = waiverType === 'FULL' ? 0 : Number(req.body.amountOrPercent);

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

      // Idempotency: refuse if an active (unrevoked) waiver already exists for this ledger
      const existing = await tx.waiver.findFirst({ where: { ledgerId, revokedAt: null } });
      if (existing) {
        throw Object.assign(new Error('A waiver is already active for this ledger entry. Revoke it first.'), { status: 409 });
      }

      let waivedAmount = 0;
      if (waiverType === 'FULL') waivedAmount = Number(ledger.balance);
      else if (waiverType === 'PARTIAL_AMOUNT') waivedAmount = Math.min(amountOrPercent, Number(ledger.balance));
      else if (waiverType === 'PARTIAL_PERCENT') waivedAmount = (Number(ledger.balance) * amountOrPercent) / 100;

      const waiver = await tx.waiver.create({
        data: {
          studentId, ledgerId, waiverType, amountOrPercent, reason, customReason,
          validUntil: validUntil ? new Date(validUntil) : null,
          appliedById: req.user.id,
          notifyStudent,
        },
      });

      const newBalance = Math.max(0, Number(ledger.balance) - waivedAmount);
      await tx.studentFeeLedger.update({
        where: { id: ledgerId },
        data: {
          waivedAmount: Number(ledger.waivedAmount) + waivedAmount,
          balance: newBalance,
          waiverReason: reason,
          status: newBalance === 0 ? 'WAIVED' : 'PARTIAL',
        },
      });

      return { waiver, waivedAmount };
    });

    if (notifyStudent) {
      try {
        const sp = await prisma.studentProfile.findUnique({ where: { id: studentId }, include: { user: true } });
        if (sp?.user) {
          await notif.createNotification(sp.user.id, 'waiver_applied', 'Fee Waiver Applied',
            `A ${waiverType} waiver has been applied to your account.`, '/student/fees');
        }
      } catch (_e) {}
    }

    res.status(201).json(result.waiver);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.put('/:id/revoke', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { revokeReason } = req.body;
    const result = await prisma.$transaction(async (tx) => {
      const waiver = await tx.waiver.findUnique({
        where: { id: req.params.id },
        include: { student: { include: { user: true } }, ledger: { include: { feeType: true } } },
      });
      if (!waiver) throw Object.assign(new Error('Waiver not found'), { status: 404 });
      if (waiver.revokedAt) throw Object.assign(new Error('Waiver is already revoked'), { status: 400 });

      const ledger = waiver.ledger;
      const baseAmount = Number(ledger.amount);
      let restored;
      if (waiver.waiverType === 'FULL') restored = Number(ledger.waivedAmount);
      else if (waiver.waiverType === 'PARTIAL_PERCENT') restored = (baseAmount * Number(waiver.amountOrPercent)) / 100;
      else restored = Math.min(Number(waiver.amountOrPercent), Number(ledger.waivedAmount));

      const newWaived = Math.max(0, Number(ledger.waivedAmount) - restored);
      const newBalance = Number(ledger.balance) + restored;
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
        data: { revokedAt: now, revokeReason },
      });

      return { waiver, restored, effectiveDate: now };
    });

    if (result.waiver.student?.user) {
      try {
        await notif.createNotification(result.waiver.student.user.id, 'waiver_revoked', 'Fee Waiver Removed',
          `Your ${result.waiver.ledger?.feeType?.name || 'fee'} waiver has been removed. ${result.restored.toFixed(2)} has been re-added to your balance.`, '/student/fees');
      } catch (_e) {}
    }

    res.json({ message: 'Waiver revoked', effectiveDate: result.effectiveDate, restored: result.restored });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

module.exports = router;
