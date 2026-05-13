const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authenticate } = require('../middleware/auth');
const { adminOnly } = require('../middleware/rbac');
const notif = require('../services/notification.service');

// GET /api/waivers
router.get('/', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { studentId } = req.query;
    const waivers = await prisma.waiver.findMany({
      where: studentId ? { student_id: studentId } : {},
      include: {
        student: { include: { student_profile: { select: { first_name: true, last_name: true } } } },
        ledger: { include: { fee_type: { select: { name: true } } } },
      },
      orderBy: { applied_at: 'desc' },
    });
    res.json(waivers);
  } catch (err) { next(err); }
});

// POST /api/waivers
router.post('/', authenticate, async (req, res, next) => {
  try {
    if (!['admin', 'admissions'].includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
    const { student_id, ledger_id, waiver_type, amount_or_percent, reason, custom_reason, notify_student } = req.body;

    const ledger = await prisma.studentFeeLedger.findUnique({ where: { id: ledger_id } });
    let waived_amount = 0;
    if (waiver_type === 'full') waived_amount = ledger.balance;
    else if (waiver_type === 'partial_amount') waived_amount = parseFloat(amount_or_percent);
    else if (waiver_type === 'partial_percent') waived_amount = (ledger.balance * parseFloat(amount_or_percent)) / 100;

    const waiver = await prisma.waiver.create({
      data: { student_id, ledger_id, waiver_type, amount_or_percent, reason, custom_reason, applied_by: req.user.id, applied_at: new Date(), notify_student },
    });

    // Update ledger
    await prisma.studentFeeLedger.update({
      where: { id: ledger_id },
      data: {
        waived_amount: { increment: waived_amount },
        balance: { decrement: waived_amount },
        waiver_reason: reason,
        status: (ledger.balance - waived_amount) <= 0 ? 'waived' : 'partial',
      },
    });

    if (notify_student) {
      await notif.createNotification(student_id, 'waiver_applied', 'Fee Waiver Applied', `A ${waiver_type} waiver has been applied to your account.`, '/student/fees');
    }

    res.status(201).json(waiver);
  } catch (err) { next(err); }
});

// PUT /api/waivers/:id/revoke
router.put('/:id/revoke', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { revoke_reason } = req.body;
    const waiver = await prisma.waiver.update({
      where: { id: req.params.id },
      data: { revoked_at: new Date(), revoke_reason },
      include: { student: true, ledger: { include: { fee_type: true } } },
    });

    // Revocation applies from next billing — restore balance going forward
    await prisma.studentFeeLedger.update({
      where: { id: waiver.ledger_id },
      data: {
        waived_amount: { decrement: waiver.amount_or_percent },
        balance: { increment: waiver.amount_or_percent },
        status: 'unpaid',
      },
    });

    // Always notify student
    const newBalance = waiver.ledger.balance + parseFloat(waiver.amount_or_percent);
    await notif.createNotification(waiver.student_id, 'waiver_revoked', 'Fee Waiver Removed',
      `Your ${waiver.ledger.fee_type?.name} waiver has been removed. New balance: ${waiver.ledger.currency === 'USD' ? '$' : '₹'}${newBalance.toLocaleString()}`,
      '/student/fees');

    res.json(waiver);
  } catch (err) { next(err); }
});

module.exports = router;
