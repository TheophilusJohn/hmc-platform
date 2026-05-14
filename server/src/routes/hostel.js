// server/src/routes/hostel.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { adminOnly, requireRole } = require('../middleware/rbac');

// Construct an IST-anchored Date for (year, monthIndex, day) at IST midnight,
// matching utils/cron.js. Avoids server-local-TZ surprises when constructing
// dueDates on a UTC host.
function istBusinessDate(year, monthIndex, day) {
  return new Date(Date.UTC(year, monthIndex, day, -5, -30, 0));
}
function nowInIST() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).reduce((a, p) => (a[p.type] = p.value, a), {});
  return { year: Number(parts.year), monthIndex: Number(parts.month) - 1, day: Number(parts.day) };
}

router.get('/students', authenticate, adminOnly, async (req, res, next) => {
  try {
    const hostellers = await prisma.studentProfile.findMany({
      where: { hostelStatus: 'HOSTELLER' },
      include: { user: { select: { id: true, userIdDisplay: true, status: true } } },
    });
    res.json(hostellers);
  } catch (err) { next(err); }
});

router.post('/monthly-charge', authenticate, adminOnly, async (req, res, next) => {
  try {
    const feeType = await prisma.feeType.findFirst({ where: { name: 'Hostel', isActive: true } });
    if (!feeType) return res.status(400).json({ error: 'Hostel fee type not found.' });

    const hostellers = await prisma.studentProfile.findMany({
      where: { hostelStatus: 'HOSTELLER', user: { status: 'ACTIVE' } },
    });

    const today = nowInIST();
    // Wrap in a transaction so a partial failure (e.g., one bad ledger row)
    // doesn't leave some hostellers charged and others not for the same month.
    // International hostellers are billed in USD off internationalAmount unless
    // they opted into INR via payInInrOverride.
    const created = await prisma.$transaction(
      hostellers.map(h => {
        const isIntl = h.studentType === 'INTERNATIONAL' && !h.payInInrOverride;
        const amount = isIntl ? feeType.internationalAmount : feeType.domesticAmount;
        return prisma.studentFeeLedger.create({
          data: {
            studentId: h.id,
            feeTypeId: feeType.id,
            amount,
            currency: isIntl ? 'USD' : 'INR',
            balance: amount,
            status: 'UNPAID',
            dueDate: istBusinessDate(today.year, today.monthIndex, 10),
            addedById: req.user.id,
          },
        });
      })
    );

    res.json({ charged: created.length });
  } catch (err) { next(err); }
});

router.put('/students/:id/hostel-status', authenticate, adminOnly, async (req, res, next) => {
  try {
    const profile = await prisma.studentProfile.update({
      where: { id: req.params.id },
      data: { hostelStatus: req.body.hostelStatus },
    });
    res.json(profile);
  } catch (err) { next(err); }
});

router.post('/students/:id/hostel-scholarship', authenticate, requireRole('FULL_ADMIN', 'ADMISSIONS_OFFICER'), async (req, res, next) => {
  try {
    const { Prisma } = require('@prisma/client');
    const VALID_TYPES = new Set(['FULL', 'PARTIAL_AMOUNT', 'PARTIAL_PERCENT']);
    const VALID_REASONS = new Set([
      'SCHOLARSHIP', 'FINANCIAL_HARDSHIP', 'MERIT_AWARD',
      'STAFF_FACULTY_DEPENDENT', 'MINISTRY_WORK_SCHOLARSHIP', 'REFERRAL_REWARD', 'CUSTOM',
    ]);
    const waiverType = String(req.body.waiverType || '').toUpperCase();
    const reason = String(req.body.reason || '').toUpperCase();
    const amountOrPercent = waiverType === 'FULL' ? 0 : Number(req.body.amountOrPercent);
    if (!VALID_TYPES.has(waiverType)) return res.status(400).json({ error: `waiverType must be one of: ${[...VALID_TYPES].join(', ')}` });
    if (!VALID_REASONS.has(reason)) return res.status(400).json({ error: `reason must be one of: ${[...VALID_REASONS].join(', ')}` });
    if (waiverType !== 'FULL' && (!Number.isFinite(amountOrPercent) || amountOrPercent <= 0)) {
      return res.status(400).json({ error: 'amountOrPercent must be a positive number' });
    }
    if (waiverType === 'PARTIAL_PERCENT' && amountOrPercent > 100) {
      return res.status(400).json({ error: 'Percentage cannot exceed 100' });
    }

    const hostelEntries = await prisma.studentFeeLedger.findMany({
      where: {
        studentId: req.params.id,
        status: { in: ['UNPAID', 'PARTIAL'] },
        feeType: { name: 'Hostel' },
      },
    });

    // Apply each waiver INSIDE a transaction so the ledger balance, waivedAmount,
    // and status all stay consistent with the Waiver row — matching the canonical
    // waivers.js behaviour. Pre-fix, this route created dangling Waiver rows
    // that didn't actually reduce what the student owed.
    const waivers = [];
    for (const entry of hostelEntries) {
      try {
        const result = await prisma.$transaction(async (tx) => {
          const balance = new Prisma.Decimal(entry.balance);
          let actualWaived;
          if (waiverType === 'FULL') actualWaived = balance;
          else if (waiverType === 'PARTIAL_AMOUNT') {
            const requested = new Prisma.Decimal(amountOrPercent);
            actualWaived = requested.gt(balance) ? balance : requested;
          } else {
            actualWaived = balance.mul(amountOrPercent).div(100);
          }
          actualWaived = actualWaived.toDecimalPlaces(2);

          const waiver = await tx.waiver.create({
            data: {
              studentId: req.params.id,
              ledgerId: entry.id,
              waiverType,
              amountOrPercent,
              actualWaivedAmount: actualWaived,
              reason,
              customReason: 'Hostel scholarship',
              appliedById: req.user.id,
              notifyStudent: true,
            },
          });
          const newBalance = balance.sub(actualWaived);
          const newWaived = new Prisma.Decimal(entry.waivedAmount).add(actualWaived);
          await tx.studentFeeLedger.update({
            where: { id: entry.id },
            data: {
              waivedAmount: newWaived,
              balance: newBalance.isNegative() ? new Prisma.Decimal(0) : newBalance,
              status: newBalance.lte(0) ? 'WAIVED' : 'PARTIAL',
              waiverReason: reason,
            },
          });
          return waiver;
        });
        waivers.push(result);
      } catch (e) {
        console.error('hostel-scholarship per-row failed:', e);
      }
    }

    res.json({ waivers: waivers.length });
  } catch (err) { next(err); }
});

module.exports = router;
