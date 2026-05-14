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
      select: { balance: true, currency: true },
    });
    // Sum per-currency. Pre-fix this added INR and USD into the same number,
    // which is meaningless for international students with mixed-currency rows.
    const outstanding = { INR: 0, USD: 0 };
    for (const e of entries) {
      const cur = (e.currency || 'INR').toUpperCase();
      outstanding[cur] = (outstanding[cur] || 0) + Number(e.balance || 0);
    }
    const overdue = await prisma.installmentPlan.findFirst({
      where: { studentId: sp.id, status: 'OVERDUE' }, select: { id: true },
    });
    // Legacy `outstanding` (top-level number) preserved for callers that don't
    // yet split — it's the INR figure for domestic, USD for international.
    const legacyOutstanding = sp.studentType === 'INTERNATIONAL' && !sp.payInInrOverride
      ? outstanding.USD
      : outstanding.INR;
    res.json({ outstanding: legacyOutstanding, byCurrency: outstanding, locked: !!overdue });
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
    // Split totals by currency so the FE doesn't mirror an INR total under a
    // USD label for international students.
    const totals = {
      INR: { charged: 0, paid: 0, outstanding: 0, waived: 0 },
      USD: { charged: 0, paid: 0, outstanding: 0, waived: 0 },
    };
    for (const e of entries) {
      const semKey = e.semesterId || 'general';
      const semName = semMap[e.semesterId] || 'General';
      if (!semesterGroups[semKey]) semesterGroups[semKey] = { id: semKey, name: semName, entries: [], balance: 0 };
      const amount = Number(e.amount || 0);
      const waived = Number(e.waivedAmount || 0);
      const balance = Number(e.balance || 0);
      const currency = (e.currency || 'INR').toUpperCase();
      const isCredit = amount < 0;
      const paid = isCredit ? 0 : Math.max(0, amount - balance - waived);
      const status = balance === 0 ? (waived > 0 && paid === 0 ? 'waived' : 'paid')
                   : balance < 0 ? 'paid'
                   : paid > 0 ? 'partial' : 'unpaid';
      semesterGroups[semKey].balance += balance;
      semesterGroups[semKey].entries.push({
        id: e.id,
        feeName: feeTypeMap[e.feeTypeId] || e.description || 'Fee',
        amount, waivedAmount: waived, paid, balance, status,
        currency, isCredit,
      });
      const bucket = totals[currency] || (totals[currency] = { charged: 0, paid: 0, outstanding: 0, waived: 0 });
      bucket.charged += isCredit ? 0 : amount;
      bucket.paid += paid;
      bucket.outstanding += Math.max(0, balance);
      bucket.waived += waived;
    }
    // Legacy aliases — the FE still reads totalCharged/totalPaid/etc. and
    // separate ...USD aliases. For an international student we surface USD
    // sums as the headline numbers; INR override rows are summed separately
    // and exposed under the legacy `total` field.
    const totalCharged = totals.INR.charged + totals.USD.charged;
    const totalPaid = totals.INR.paid + totals.USD.paid;
    const totalOutstanding = totals.INR.outstanding + totals.USD.outstanding;
    const totalWaived = totals.INR.waived + totals.USD.waived;

    // InstallmentPlan model only has {id, studentId, semesterId, schedule (JSON), status}.
    // The actual installment rows live in `schedule: [{dueDate, amount, status, paidAt}, ...]`.
    // Flatten the schedule per plan so the FE can iterate a flat list.
    let installments = [], feeLocked = false;
    try {
      const plans = await prisma.installmentPlan.findMany({
        where: { studentId: sp.id },
        orderBy: { createdAt: 'asc' },
      });
      const now = new Date();
      for (const plan of plans) {
        const sched = Array.isArray(plan.schedule) ? plan.schedule : [];
        sched.forEach((slot, index) => {
          const due = slot.dueDate ? new Date(slot.dueDate) : null;
          const status = String(slot.status || 'pending').toLowerCase();
          installments.push({
            id: `${plan.id}:${index}`,
            planId: plan.id,
            index,
            name: slot.name || `Installment ${index + 1}`,
            dueDate: due,
            amount: Number(slot.amount || 0),
            status,
            overdue: !!(due && due < now && status !== 'paid'),
          });
        });
      }
      feeLocked = plans.some(p => String(p.status).toUpperCase() === 'OVERDUE');
    } catch (_e) {}

    res.json({
      semesters: Object.values(semesterGroups),
      summary: {
        // Totals across all currencies (legacy keys consumed by overview charts).
        total: totalCharged, paid: totalPaid, outstanding: totalOutstanding, waived: totalWaived,
        // Per-currency breakdown — actual sums per currency, not a mirror.
        inr: totals.INR,
        usd: totals.USD,
        // Legacy aliases the student page still reads. These now reflect the
        // genuine USD-currency rows only (not a duplicate of INR).
        ...(isInternational && {
          totalUSD: totals.USD.charged,
          paidUSD: totals.USD.paid,
          outstandingUSD: totals.USD.outstanding,
          waivedUSD: totals.USD.waived,
        }),
      },
      isInternational, installments, feeLocked,
      studentName: `${sp.firstName} ${sp.lastName}`,
      studentEmail: user.email,
      studentPhone: user.phone,
    });
  } catch (err) { console.error('my-summary:', err); next(err); }
});

module.exports = router;
