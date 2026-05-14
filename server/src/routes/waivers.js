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
    const { studentId, ledgerId, waiverType, amountOrPercent, reason, customReason, validUntil, notifyStudent = true } = req.body;

    const ledger = await prisma.studentFeeLedger.findUnique({ where: { id: ledgerId } });
    if (!ledger) return res.status(404).json({ error: 'Ledger entry not found' });

    let waivedAmount = 0;
    if (waiverType === 'FULL') waivedAmount = Number(ledger.balance);
    else if (waiverType === 'PARTIAL_AMOUNT') waivedAmount = Math.min(parseFloat(amountOrPercent), Number(ledger.balance));
    else if (waiverType === 'PARTIAL_PERCENT') waivedAmount = (Number(ledger.balance) * parseFloat(amountOrPercent)) / 100;

    const waiver = await prisma.waiver.create({
      data: {
        studentId, ledgerId, waiverType, amountOrPercent, reason, customReason,
        validUntil: validUntil ? new Date(validUntil) : null,
        appliedById: req.user.id,
        notifyStudent,
      },
    });

    const newBalance = Math.max(0, Number(ledger.balance) - waivedAmount);
    await prisma.studentFeeLedger.update({
      where: { id: ledgerId },
      data: {
        waivedAmount: Number(ledger.waivedAmount) + waivedAmount,
        balance: newBalance,
        waiverReason: reason,
        status: newBalance === 0 ? 'WAIVED' : 'PARTIAL',
      },
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

    res.status(201).json(waiver);
  } catch (err) { next(err); }
});

router.put('/:id/revoke', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { revokeReason } = req.body;
    const waiver = await prisma.waiver.findUnique({
      where: { id: req.params.id },
      include: { student: { include: { user: true } }, ledger: { include: { feeType: true } } },
    });
    if (!waiver) return res.status(404).json({ error: 'Waiver not found' });

    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    nextMonth.setDate(1);

    await prisma.waiver.update({
      where: { id: req.params.id },
      data: { revokedAt: nextMonth, revokeReason },
    });

    if (waiver.student?.user) {
      try {
        await notif.createNotification(waiver.student.user.id, 'waiver_revoked', 'Fee Waiver Removed',
          `Your ${waiver.ledger?.feeType?.name || 'fee'} waiver has been removed effective ${nextMonth.toLocaleDateString('en-IN')}.`, '/student/fees');
      } catch (_e) {}
    }

    res.json({ message: 'Waiver revocation scheduled', effectiveDate: nextMonth });
  } catch (err) { next(err); }
});

module.exports = router;
