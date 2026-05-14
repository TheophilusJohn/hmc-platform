const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { adminOnly } = require('../middleware/rbac');
const { Prisma } = require('@prisma/client');

router.get('/', authenticate, async (req, res, next) => {
  try {
    const fees = await prisma.feeType.findMany({ orderBy: { name: 'asc' } });
    res.json({ fees, feeTypes: fees });
  } catch (err) { next(err); }
});

// AutoApplyRule enum guard — pre-fix this just upper-cased the raw body value
// and let Prisma reject invalid strings with a runtime error.
const VALID_AUTO_APPLY = new Set(['ALL', 'OFFLINE_ONLY', 'ONLINE_ONLY', 'SPECIFIC_PROGRAMME', 'SPECIFIC_BATCH', 'MONTHLY', 'MANUAL']);
function normAutoApply(v) {
  const up = String(v || 'MANUAL').toUpperCase();
  if (!VALID_AUTO_APPLY.has(up)) {
    throw Object.assign(new Error(`autoApply must be one of: ${[...VALID_AUTO_APPLY].join(', ')}`), { status: 400 });
  }
  return up;
}

router.post('/', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { name, domesticAmount, internationalAmount, autoApply, description } = req.body;
    if (!name || domesticAmount === undefined || domesticAmount === '') {
      return res.status(400).json({ error: 'name and domesticAmount required' });
    }
    const dom = new Prisma.Decimal(String(domesticAmount));
    const intl = (internationalAmount === undefined || internationalAmount === '' || internationalAmount === null)
      ? dom
      : new Prisma.Decimal(String(internationalAmount));
    const feeType = await prisma.feeType.create({
      data: {
        name,
        domesticAmount: dom,
        internationalAmount: intl,
        autoApply: normAutoApply(autoApply),
        description: description || null,
        isActive: true,
      },
    });
    res.status(201).json({ feeType });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.put('/:id', authenticate, adminOnly, async (req, res, next) => {
  try {
    const data = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if (req.body.description !== undefined) data.description = req.body.description;
    if (req.body.domesticAmount !== undefined) data.domesticAmount = new Prisma.Decimal(String(req.body.domesticAmount));
    if (req.body.internationalAmount !== undefined) {
      const v = req.body.internationalAmount;
      data.internationalAmount = (v === '' || v === null) ? undefined : new Prisma.Decimal(String(v));
    }
    if (req.body.autoApply !== undefined) data.autoApply = normAutoApply(req.body.autoApply);
    if (req.body.isActive !== undefined) data.isActive = !!req.body.isActive;
    const feeType = await prisma.feeType.update({ where: { id: req.params.id }, data });
    res.json({ feeType });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.delete('/:id', authenticate, adminOnly, async (req, res, next) => {
  try {
    await prisma.feeType.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ success: true });
  } catch (err) { next(err); }
});


// POST /api/fee-types/:id/bulk-charge/preview
// Resolve a bulk-charge `scope` into a Prisma `where` filter on StudentProfile.
// Mirrors fees.js so both endpoints agree on what each scope means. Returns
// null on unrecognized scope.
function scopeToWhere(scope, programmeId, batchId) {
  const lc = String(scope || 'all').toLowerCase();
  const where = { user: { status: 'ACTIVE' } };
  if (lc === 'all') return where;
  if (lc === 'offline') { where.studyMode = 'OFFLINE'; return where; }
  if (lc === 'online') { where.studyMode = 'ONLINE'; return where; }
  if (lc === 'programme') {
    if (!programmeId) return null;
    where.programmeId = programmeId; return where;
  }
  if (lc === 'batch') {
    if (!batchId) return null;
    where.batchId = batchId; return where;
  }
  return null;
}

router.post('/:id/bulk-charge/preview', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { scope = 'all', programmeId, batchId } = req.body;
    const ft = await prisma.feeType.findUnique({ where: { id: req.params.id } });
    if (!ft) return res.status(404).json({ error: 'Fee type not found' });
    const where = scopeToWhere(scope, programmeId, batchId);
    if (!where) return res.status(400).json({ error: 'Invalid scope or missing programmeId/batchId' });
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
    const { scope = 'all', programmeId, batchId, semesterId } = req.body;
    const ft = await prisma.feeType.findUnique({ where: { id: req.params.id } });
    if (!ft) return res.status(404).json({ error: 'Fee type not found' });
    const where = scopeToWhere(scope, programmeId, batchId);
    if (!where) return res.status(400).json({ error: 'Invalid scope or missing programmeId/batchId' });
    const profiles = await prisma.studentProfile.findMany({ where });
    // All-or-nothing: a single failure rolls back the whole batch so we don't
    // leave half the students charged. Callers can retry after fixing input.
    const created = await prisma.$transaction(
      profiles.map(p => {
        const isIntl = p.studentType === 'INTERNATIONAL';
        // Keep amounts as Prisma.Decimal — Number coercion of Decimal(10,2)
        // loses precision (e.g. 37000.10 → 37000.099999...).
        const raw = isIntl ? (ft.internationalAmount || ft.domesticAmount) : ft.domesticAmount;
        const amount = new Prisma.Decimal(raw);
        return prisma.studentFeeLedger.create({
          data: {
            studentId: p.id,
            feeTypeId: ft.id,
            ...(semesterId && { semesterId }),
            amount, balance: amount, waivedAmount: new Prisma.Decimal(0),
            currency: isIntl ? 'USD' : 'INR',
            status: 'UNPAID',
            description: ft.name,
            addedById: req.user.id,
          },
        });
      })
    );
    res.json({ created: created.length });
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
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ error: 'Charge amount must be a positive number' });
    }
    const amtDec = new Prisma.Decimal(String(amt));
    const entry = await prisma.studentFeeLedger.create({
      data: {
        studentId,
        feeTypeId: ft.id,
        ...(semesterId && { semesterId }),
        amount: amtDec, balance: amtDec, waivedAmount: new Prisma.Decimal(0),
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
