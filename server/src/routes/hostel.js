// server/src/routes/hostel.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { adminOnly, requireRole } = require('../middleware/rbac');

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

    const now = new Date();
    // Wrap in a transaction so a partial failure (e.g., one bad ledger row)
    // doesn't leave some hostellers charged and others not for the same month.
    const created = await prisma.$transaction(
      hostellers.map(h => prisma.studentFeeLedger.create({
        data: {
          studentId: h.id,
          feeTypeId: feeType.id,
          amount: feeType.domesticAmount,
          currency: 'INR',
          balance: feeType.domesticAmount,
          status: 'UNPAID',
          dueDate: new Date(now.getFullYear(), now.getMonth(), 10),
        },
      }))
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
    const { waiverType, amountOrPercent, reason } = req.body;

    const hostelEntries = await prisma.studentFeeLedger.findMany({
      where: {
        studentId: req.params.id,
        status: { in: ['UNPAID', 'PARTIAL'] },
        feeType: { name: 'Hostel' },
      },
    });

    const waivers = await Promise.all(hostelEntries.map(entry =>
      prisma.waiver.create({
        data: {
          studentId: req.params.id,
          ledgerId: entry.id,
          waiverType,
          amountOrPercent,
          reason,
          customReason: 'Hostel scholarship',
          appliedById: req.user.id,
          notifyStudent: true,
        },
      })
    ));

    res.json({ waivers: waivers.length });
  } catch (err) { next(err); }
});

module.exports = router;
