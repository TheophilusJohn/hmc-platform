const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { adminOnly } = require('../middleware/rbac');

router.get('/', authenticate, async (req, res, next) => {
  try {
    const fees = await prisma.feeType.findMany({ orderBy: { name: 'asc' } });
    res.json({ fees, feeTypes: fees });
  } catch (err) { next(err); }
});

router.post('/', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { name, domesticAmount, internationalAmount, autoApply, description } = req.body;
    if (!name || domesticAmount === undefined || domesticAmount === '') {
      return res.status(400).json({ error: 'name and domesticAmount required' });
    }
    const dom = parseFloat(domesticAmount);
    const intl = internationalAmount ? parseFloat(internationalAmount) : dom;
    const feeType = await prisma.feeType.create({
      data: {
        name,
        domesticAmount: dom,
        internationalAmount: intl,
        autoApply: (autoApply || 'MANUAL').toUpperCase(),
        description: description || null,
        isActive: true,
      },
    });
    res.status(201).json({ feeType });
  } catch (err) { next(err); }
});

router.put('/:id', authenticate, adminOnly, async (req, res, next) => {
  try {
    const data = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if (req.body.description !== undefined) data.description = req.body.description;
    if (req.body.domesticAmount !== undefined) data.domesticAmount = parseFloat(req.body.domesticAmount);
    if (req.body.internationalAmount !== undefined) data.internationalAmount = req.body.internationalAmount ? parseFloat(req.body.internationalAmount) : (req.body.domesticAmount ? parseFloat(req.body.domesticAmount) : undefined);
    if (req.body.autoApply !== undefined) data.autoApply = req.body.autoApply.toUpperCase();
    if (req.body.isActive !== undefined) data.isActive = !!req.body.isActive;
    const feeType = await prisma.feeType.update({ where: { id: req.params.id }, data });
    res.json({ feeType });
  } catch (err) { next(err); }
});

router.delete('/:id', authenticate, adminOnly, async (req, res, next) => {
  try {
    await prisma.feeType.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ success: true });
  } catch (err) { next(err); }
});


// POST /api/fee-types/:id/bulk-charge/preview
router.post('/:id/bulk-charge/preview', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { scope = 'all' } = req.body;
    const ft = await prisma.feeType.findUnique({ where: { id: req.params.id } });
    if (!ft) return res.status(404).json({ error: 'Fee type not found' });
    const where = { user: { status: 'ACTIVE' } };
    const lc = String(scope).toLowerCase();
    if (lc === 'offline') where.studyMode = 'OFFLINE';
    else if (lc === 'online') where.studyMode = 'ONLINE';
    const profiles = await prisma.studentProfile.findMany({
      where,
      select: { id: true, firstName: true, lastName: true, studentType: true, user: { select: { userIdDisplay: true } } },
    });
    let total = 0;
    for (const p of profiles) {
      const isIntl = p.studentType === 'INTERNATIONAL';
      total += Number(isIntl ? (ft.internationalAmount || ft.domesticAmount) : ft.domesticAmount);
    }
    res.json({ count: profiles.length, total, feeName: ft.name });
  } catch (err) { console.error('bulk-charge preview:', err); next(err); }
});

// POST /api/fee-types/:id/bulk-charge
router.post('/:id/bulk-charge', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { scope = 'all', semesterId } = req.body;
    const ft = await prisma.feeType.findUnique({ where: { id: req.params.id } });
    if (!ft) return res.status(404).json({ error: 'Fee type not found' });
    const where = { user: { status: 'ACTIVE' } };
    const lc = String(scope).toLowerCase();
    if (lc === 'offline') where.studyMode = 'OFFLINE';
    else if (lc === 'online') where.studyMode = 'ONLINE';
    const profiles = await prisma.studentProfile.findMany({ where });
    let created = 0;
    for (const p of profiles) {
      const isIntl = p.studentType === 'INTERNATIONAL';
      const amount = Number(isIntl ? (ft.internationalAmount || ft.domesticAmount) : ft.domesticAmount);
      try {
        await prisma.studentFeeLedger.create({
          data: {
            studentId: p.id,
            feeTypeId: ft.id,
            ...(semesterId && { semesterId }),
            amount, balance: amount, waivedAmount: 0,
            currency: isIntl ? 'USD' : 'INR',
            status: 'UNPAID',
            description: ft.name,
            addedById: req.user.id,
          }
        });
        created++;
      } catch (e) {
        console.warn('bulk-charge failed for student', p.id, e.message);
      }
    }
    res.json({ created });
  } catch (err) { console.error('bulk-charge:', err); next(err); }
});


router.post('/:id/charge-student', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { studentId, customAmount, semesterId, customDescription } = req.body;
    if (!studentId) return res.status(400).json({ error: 'studentId required' });
    const sp = await prisma.studentProfile.findUnique({ where: { id: studentId } });
    if (!sp) return res.status(404).json({ error: 'Student not found' });
    const ft = await prisma.feeType.findUnique({ where: { id: req.params.id } });
    if (!ft) return res.status(404).json({ error: 'Fee type not found' });
    const isIntl = sp.studentType === 'INTERNATIONAL';
    const defaultAmount = isIntl ? Number(ft.internationalAmount || ft.domesticAmount) : Number(ft.domesticAmount);
    const amt = (customAmount !== undefined && customAmount !== '' && !isNaN(Number(customAmount))) ? Number(customAmount) : defaultAmount;
    const entry = await prisma.studentFeeLedger.create({
      data: {
        studentId,
        feeTypeId: ft.id,
        ...(semesterId && { semesterId }),
        amount: amt, balance: amt, waivedAmount: 0,
        currency: isIntl ? 'USD' : 'INR',
        status: 'UNPAID',
        description: customDescription || ft.name,
        addedById: req.user.id,
      },
    });
    res.status(201).json({ ledger: entry });
  } catch (err) { console.error('charge-student:', err); next(err); }
});

module.exports = router;
