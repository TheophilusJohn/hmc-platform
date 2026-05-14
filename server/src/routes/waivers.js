// server/src/routes/waivers.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { Prisma } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');
const { adminOnly, requireRole } = require('../middleware/rbac');
const notif = require('../services/notification.service');

const D0 = new Prisma.Decimal(0);

// Decide a ledger's status after a balance/waiver change. Considers actual
// payments so revoke doesn't incorrectly flip a paid-then-waived row.
async function deriveLedgerStatus(tx, ledgerId, { balance, waived }) {
  if (balance.lte(0)) {
    // Fully cleared: WAIVED if no payments, PAID otherwise (or if waived==0).
    const paymentAgg = await tx.payment.aggregate({
      where: { ledgerId, status: 'confirmed' },
      _sum: { amount: true },
    });
    const totalPaid = paymentAgg._sum.amount ? new Prisma.Decimal(paymentAgg._sum.amount) : D0;
    if (totalPaid.gt(0)) return 'PAID';
    return waived.gt(0) ? 'WAIVED' : 'PAID';
  }
  return 'PARTIAL';
}

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

      // Compute the actual waived amount as a Decimal; persist it on the Waiver row
      // so revoke can restore exactly what was deducted (without re-deriving from
      // stale balance / stale percent base).
      const balance = new Prisma.Decimal(ledger.balance);
      let actualWaived;
      if (waiverType === 'FULL') {
        actualWaived = balance;
      } else if (waiverType === 'PARTIAL_AMOUNT') {
        const requested = new Prisma.Decimal(amountOrPercent);
        actualWaived = requested.gt(balance) ? balance : requested;
      } else if (waiverType === 'PARTIAL_PERCENT') {
        actualWaived = balance.mul(amountOrPercent).div(100);
      } else {
        throw Object.assign(new Error('Invalid waiverType'), { status: 400 });
      }
      // Round to 2dp (currency precision)
      actualWaived = actualWaived.toDecimalPlaces(2);

      const waiver = await tx.waiver.create({
        data: {
          studentId, ledgerId, waiverType, amountOrPercent,
          actualWaivedAmount: actualWaived,
          reason, customReason,
          validUntil: validUntil ? new Date(validUntil) : null,
          appliedById: req.user.id,
          notifyStudent,
        },
      });

      const newBalance = balance.sub(actualWaived);
      const newWaivedTotal = new Prisma.Decimal(ledger.waivedAmount).add(actualWaived);
      const newStatus = await deriveLedgerStatus(tx, ledgerId, { balance: newBalance, waived: newWaivedTotal });
      await tx.studentFeeLedger.update({
        where: { id: ledgerId },
        data: {
          waivedAmount: newWaivedTotal,
          balance: newBalance.isNegative() ? D0 : newBalance,
          waiverReason: reason,
          status: newStatus,
        },
      });

      return { waiver, waivedAmount: actualWaived };
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
      // Prefer the persisted actual amount; fall back to recomputation for legacy rows.
      let restored;
      if (waiver.actualWaivedAmount != null) {
        restored = new Prisma.Decimal(waiver.actualWaivedAmount);
      } else {
        const baseAmount = new Prisma.Decimal(ledger.amount);
        if (waiver.waiverType === 'FULL') restored = new Prisma.Decimal(ledger.waivedAmount);
        else if (waiver.waiverType === 'PARTIAL_PERCENT') restored = baseAmount.mul(waiver.amountOrPercent).div(100);
        else {
          const ap = new Prisma.Decimal(waiver.amountOrPercent);
          const w = new Prisma.Decimal(ledger.waivedAmount);
          restored = ap.gt(w) ? w : ap;
        }
        restored = restored.toDecimalPlaces(2);
      }

      const curWaived = new Prisma.Decimal(ledger.waivedAmount);
      const newWaived = curWaived.sub(restored);
      const newBalance = new Prisma.Decimal(ledger.balance).add(restored);
      const newStatus = await deriveLedgerStatus(tx, ledger.id, {
        balance: newBalance,
        waived: newWaived.isNegative() ? D0 : newWaived,
      });
      // If balance > 0 and there are no payments and no remaining waiver, status is UNPAID.
      // deriveLedgerStatus handles the balance > 0 → PARTIAL case; explicit UNPAID guard:
      let resolvedStatus = newStatus;
      if (newBalance.gt(0) && newWaived.lte(0)) {
        const paymentAgg = await tx.payment.aggregate({
          where: { ledgerId: ledger.id, status: 'confirmed' },
          _sum: { amount: true },
        });
        const totalPaid = paymentAgg._sum.amount ? new Prisma.Decimal(paymentAgg._sum.amount) : D0;
        resolvedStatus = totalPaid.gt(0) ? 'PARTIAL' : 'UNPAID';
      }

      await tx.studentFeeLedger.update({
        where: { id: ledger.id },
        data: {
          waivedAmount: newWaived.isNegative() ? D0 : newWaived,
          balance: newBalance,
          status: resolvedStatus,
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
