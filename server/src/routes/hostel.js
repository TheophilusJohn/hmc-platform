const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authenticate } = require('../middleware/auth');
const { adminOnly } = require('../middleware/rbac');

// GET /api/hostel/students
router.get('/students', authenticate, adminOnly, async (req, res, next) => {
  try {
    const hostellers = await prisma.studentProfile.findMany({
      where: { hostel_status: 'hosteller' },
      include: {
        user: { select: { id: true, user_id_display: true, status: true } },
      },
    });
    res.json(hostellers);
  } catch (err) { next(err); }
});

// POST /api/hostel/monthly-charge — called by cron job
router.post('/monthly-charge', authenticate, adminOnly, async (req, res, next) => {
  try {
    const feeType = await prisma.feeType.findFirst({ where: { name: 'Hostel', is_active: true } });
    if (!feeType) return res.status(400).json({ error: 'Hostel fee type not found.' });

    const hostellers = await prisma.studentProfile.findMany({
      where: { hostel_status: 'hosteller', user: { status: 'active' } },
      include: { user: true },
    });

    const now = new Date();
    const created = await Promise.all(hostellers.map(h =>
      prisma.studentFeeLedger.create({
        data: {
          student_id: h.user_id, fee_type_id: feeType.id,
          amount: feeType.domestic_amount, currency: 'INR',
          balance: feeType.domestic_amount, status: 'unpaid',
          due_date: new Date(now.getFullYear(), now.getMonth(), 10),
        },
      }).catch(() => null) // Skip if already exists this month
    ));

    res.json({ charged: created.filter(Boolean).length });
  } catch (err) { next(err); }
});

// PUT /api/students/:id/hostel-status
router.put('/students/:id/hostel-status', authenticate, adminOnly, async (req, res, next) => {
  try {
    const profile = await prisma.studentProfile.update({
      where: { user_id: req.params.id },
      data: { hostel_status: req.body.hostel_status },
    });
    res.json(profile);
  } catch (err) { next(err); }
});

// POST /api/students/:id/hostel-scholarship
router.post('/students/:id/hostel-scholarship', authenticate, async (req, res, next) => {
  try {
    if (!['admin', 'admissions'].includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
    const { waiver_type, amount_or_percent, reason } = req.body;

    // Find all unpaid hostel ledger entries for student
    const hostelEntries = await prisma.studentFeeLedger.findMany({
      where: { student_id: req.params.id, status: { in: ['unpaid', 'partial'] }, fee_type: { name: 'Hostel' } },
    });

    const waivers = await Promise.all(hostelEntries.map(entry =>
      prisma.waiver.create({
        data: {
          student_id: req.params.id, ledger_id: entry.id,
          waiver_type, amount_or_percent, reason, custom_reason: 'Hostel scholarship',
          applied_by: req.user.id, applied_at: new Date(), notify_student: true,
        },
      })
    ));

    res.json({ waivers: waivers.length });
  } catch (err) { next(err); }
});

module.exports = router;
