const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');

router.get('/my-balance', authenticate, async (req, res, next) => {
  try {
    const sp = await prisma.studentProfile.findUnique({ where: { userId: req.user.id } });
    if (!sp) return res.json({ outstanding: 0, locked: false });
    const entries = await prisma.studentFeeLedger.findMany({
      where: { studentId: sp.id },
      select: { balance: true },
    });
    const outstanding = entries.reduce((sum, e) => sum + Math.max(0, Number(e.balance || 0)), 0);
    const overdue = await prisma.installmentPlan.findFirst({
      where: { studentId: sp.id, status: 'OVERDUE' }, select: { id: true },
    });
    res.json({ outstanding, locked: !!overdue });
  } catch (err) { next(err); }
});


router.get('/my-summary', authenticate, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { studentProfile: true },
    });
    if (!user?.studentProfile) {
      return res.json({ semesters: [], summary: { total: 0, paid: 0, outstanding: 0, waived: 0 }, isInternational: false, installments: [], feeLocked: false });
    }
    const sp = user.studentProfile;
    const isInternational = sp.studentType === 'INTERNATIONAL';

    const entries = await prisma.studentFeeLedger.findMany({
      where: { studentId: sp.id }, orderBy: { createdAt: 'asc' },
    });

    const feeTypeIds = [...new Set(entries.map(e => e.feeTypeId).filter(Boolean))];
    const semIds = [...new Set(entries.map(e => e.semesterId).filter(Boolean))];
    const [feeTypes, sems] = await Promise.all([
      feeTypeIds.length ? prisma.feeType.findMany({ where: { id: { in: feeTypeIds } }, select: { id: true, name: true } }) : [],
      semIds.length ? prisma.semester.findMany({ where: { id: { in: semIds } }, select: { id: true, name: true } }) : [],
    ]);
    const feeTypeMap = Object.fromEntries(feeTypes.map(f => [f.id, f.name]));
    const semMap = Object.fromEntries(sems.map(s => [s.id, s.name]));

    const semesterGroups = {};
    let totalCharged = 0, totalPaid = 0, totalOutstanding = 0, totalWaived = 0;
    for (const e of entries) {
      const semKey = e.semesterId || 'general';
      const semName = semMap[e.semesterId] || 'General';
      if (!semesterGroups[semKey]) semesterGroups[semKey] = { id: semKey, name: semName, entries: [], balance: 0 };
      const amount = Number(e.amount || 0);
      const waived = Number(e.waivedAmount || 0);
      const balance = Number(e.balance || 0);
      const paid = Math.max(0, amount - balance - waived);
      const status = balance === 0 ? (waived > 0 && paid === 0 ? 'waived' : 'paid') : paid > 0 ? 'partial' : 'unpaid';
      semesterGroups[semKey].balance += balance;
      semesterGroups[semKey].entries.push({
        id: e.id,
        feeName: feeTypeMap[e.feeTypeId] || e.description || 'Fee',
        amount, waivedAmount: waived, paid, balance, status,
      });
      totalCharged += amount;
      totalPaid += paid;
      totalOutstanding += Math.max(0, balance);
      totalWaived += waived;
    }

    let installments = [], feeLocked = false;
    try {
      const inst = await prisma.installmentPlan.findMany({ where: { studentId: sp.id }, orderBy: { dueDate: 'asc' } });
      installments = inst.map(i => ({
        id: i.id, name: i.name || 'Installment',
        dueDate: i.dueDate, amount: Number(i.amount || 0),
        status: String(i.status || '').toLowerCase(),
        overdue: i.dueDate && new Date(i.dueDate) < new Date() && String(i.status).toUpperCase() !== 'PAID',
      }));
      feeLocked = !!inst.find(i => String(i.status).toUpperCase() === 'OVERDUE');
    } catch (_e) {}

    res.json({
      semesters: Object.values(semesterGroups),
      summary: {
        total: totalCharged, paid: totalPaid, outstanding: totalOutstanding, waived: totalWaived,
        ...(isInternational && { totalUSD: totalCharged, paidUSD: totalPaid, outstandingUSD: totalOutstanding }),
      },
      isInternational, installments, feeLocked,
      studentName: `${sp.firstName} ${sp.lastName}`,
      studentEmail: user.email,
      studentPhone: user.phone,
    });
  } catch (err) { console.error('my-summary:', err); next(err); }
});

module.exports = router;
