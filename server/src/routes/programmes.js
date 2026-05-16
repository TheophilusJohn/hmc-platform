// server/src/routes/programmes.js
const express = require('express');
const router = express.Router();
const { Prisma } = require('@prisma/client');
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { adminOnly, adminOrTA } = require('../middleware/rbac');

// Coerce a money input to Prisma.Decimal. `null`/`''`/`undefined` → null (so
// admin can clear a value). Anything non-finite is rejected with a thrown 400.
function moneyOrNull(raw, field) {
  if (raw === undefined || raw === null || raw === '') return null;
  const dec = new Prisma.Decimal(String(raw));
  if (!dec.isFinite() || dec.lt(0)) {
    throw Object.assign(new Error(`${field} must be a non-negative number`), { status: 400 });
  }
  return dec;
}

// Helper: safe int parse
const toInt = (v, fallback = undefined) => {
  if (v === undefined || v === null || v === '') return fallback;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n;
};

router.get('/', authenticate, async (req, res, next) => {
  try {
    const programmes = await prisma.programme.findMany({
      include: { batches: true },
      orderBy: { name: 'asc' },
    });
    res.json({ programmes });
  } catch (err) { next(err); }
});

router.post('/', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { name, code, durationYears, medium, availableOffline, availableOnline } = req.body;
    if (!name || !code) return res.status(400).json({ error: 'name and code are required' });
    const programme = await prisma.programme.create({
      data: {
        name,
        code,
        durationYears: toInt(durationYears, 1),
        medium: medium || 'ENGLISH',
        availableOffline: availableOffline !== false,
        availableOnline: availableOnline !== false,
      },
    });
    res.status(201).json({ programme });
  } catch (err) { next(err); }
});

router.get('/:id/batches', authenticate, async (req, res, next) => {
  try {
    const batches = await prisma.batch.findMany({
      where: { programmeId: req.params.id },
      include: { _count: { select: { students: true } } },
      orderBy: { startYear: 'desc' },
    });
    res.json({ batches });
  } catch (err) { next(err); }
});

// GET /api/programmes/batches?status=active — list all batches (across programmes)
router.get('/batches', authenticate, async (req, res, next) => {
  try {
    const where = {};
    if (req.query.status) where.status = String(req.query.status).toUpperCase();
    const batches = await prisma.batch.findMany({
      where,
      include: {
        programme: { select: { name: true, durationYears: true } },
        _count: { select: { students: true } },
      },
      orderBy: [{ startYear: 'desc' }, { name: 'asc' }],
    });
    res.json({
      batches: batches.map(b => ({
        ...b,
        programmeName: b.programme?.name,
        durationYears: b.programme?.durationYears,
        studentCount: b._count?.students || 0,
      })),
    });
  } catch (err) { next(err); }
});

const BATCH_STATUSES = new Set(['ACTIVE', 'INACTIVE', 'COMPLETED']);

router.post('/:id/batches', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { name, startYear, endYear, currentYear, maxIntake, status } = req.body;
    if (!name) return res.status(400).json({ error: 'Batch name is required' });

    const sy = toInt(startYear, new Date().getFullYear());
    const ey = toInt(endYear, new Date().getFullYear() + 3);
    if (!Number.isInteger(sy) || sy < 1900 || sy > 2200) {
      return res.status(400).json({ error: 'startYear must be a valid year' });
    }
    if (!Number.isInteger(ey) || ey <= sy) {
      return res.status(400).json({ error: 'endYear must be greater than startYear' });
    }
    const cy = toInt(currentYear, 1);
    if (!Number.isInteger(cy) || cy < 1 || cy > (ey - sy + 1)) {
      return res.status(400).json({ error: 'currentYear must be between 1 and the batch duration' });
    }
    const normStatus = String(status || 'ACTIVE').toUpperCase();
    if (!BATCH_STATUSES.has(normStatus)) {
      return res.status(400).json({ error: `status must be one of: ${[...BATCH_STATUSES].join(', ')}` });
    }

    const batch = await prisma.batch.create({
      data: {
        name,
        programmeId: req.params.id,
        startYear: sy,
        endYear: ey,
        currentYear: cy,
        maxIntake: toInt(maxIntake, null),
        status: normStatus,
      },
    });
    res.status(201).json({ batch });
  } catch (err) { next(err); }
});

router.put('/batches/:id', authenticate, adminOrTA, async (req, res, next) => {
  try {
    const { name, startYear, endYear, currentYear, maxIntake, status } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (startYear !== undefined) data.startYear = toInt(startYear);
    if (endYear !== undefined) data.endYear = toInt(endYear);
    if (currentYear !== undefined) data.currentYear = toInt(currentYear);
    if (maxIntake !== undefined) data.maxIntake = toInt(maxIntake);
    if (status !== undefined) data.status = status;
    const batch = await prisma.batch.update({ where: { id: req.params.id }, data });
    res.json({ batch });
  } catch (err) { next(err); }
});

router.post('/batches/:id/progression', authenticate, adminOrTA, async (req, res, next) => {
  try {
    const batchId = req.params.id;

    const pendingEnrollments = await prisma.studentSubjectEnrollment.count({
      where: { subject: { batchId }, resultStatus: 'PENDING' },
    });

    if (pendingEnrollments > 0) {
      return res.status(400).json({
        error: `${pendingEnrollments} results still pending. Publish all results before progression.`,
      });
    }

    const students = await prisma.studentProfile.findMany({
      where: { batchId },
      include: { enrollments: { include: { subject: true } } },
    });

    // Refuse to "progress" a batch with no students — pre-fix this returned
    // total:0 with no warning, which silently advanced the empty batch's
    // currentYear via the caller's update.
    if (students.length === 0) {
      return res.status(400).json({ error: 'No students in this batch — refusing to run progression.' });
    }

    // Also refuse if every student has only PENDING enrollments — there's
    // nothing to evaluate, and auto-approving them is misleading.
    const haveAnyResolved = students.some(s => s.enrollments.some(e => e.resultStatus === 'PASS' || e.resultStatus === 'FAIL'));
    if (!haveAnyResolved) {
      return res.status(400).json({ error: 'No graded enrollments in this batch yet — progression cannot be evaluated.' });
    }

    const results = students.map(s => {
      const failed = s.enrollments.filter(e => e.resultStatus === 'FAIL');
      // Withheld results also need review — not auto-progressed alongside PASS.
      const withheld = s.enrollments.filter(e => e.resultStatus === 'WITHHELD' || e.resultStatus === 'PENDING');
      const needsReview = failed.length > 0 || withheld.length > 0;
      return {
        studentId: s.id,
        name: `${s.firstName} ${s.lastName}`,
        passed: !needsReview,
        failedSubjects: failed.length,
        withheldOrPending: withheld.length,
        recommendation: needsReview ? 'REVIEW' : 'PROGRESS',
      };
    });

    const autoApproved = results.filter(r => r.passed);
    const flagged = results.filter(r => !r.passed);

    res.json({ autoApproved, flagged, total: results.length });
  } catch (err) { next(err); }
});


router.put('/:id', authenticate, adminOnly, async (req, res, next) => {
  try {
    // Whitelist only fields that exist on the canonical Programme model.
    const data = {};
    for (const k of ['name', 'code', 'durationYears', 'medium', 'availableOffline', 'availableOnline', 'status']) {
      if (req.body[k] !== undefined) data[k] = req.body[k];
    }
    if (data.durationYears !== undefined) data.durationYears = parseInt(data.durationYears, 10);
    // Money columns — admin can set or clear (null) any of the four cost fields.
    for (const k of ['totalCostDomestic', 'totalCostInternational', 'applicationFeeDomestic', 'applicationFeeInternational']) {
      if (req.body[k] !== undefined) data[k] = moneyOrNull(req.body[k], k);
    }
    const programme = await prisma.programme.update({ where: { id: req.params.id }, data });
    res.json({ programme });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('programme update:', err);
    next(err);
  }
});


router.delete('/:id', authenticate, adminOnly, async (req, res, next) => {
  try {
    await prisma.programme.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'P2003' || err.code === 'P2014') {
      return res.status(400).json({ error: 'Cannot delete: programme has batches, students, or applicants. Deactivate it instead.' });
    }
    next(err);
  }
});


router.delete('/batches/:id', authenticate, adminOnly, async (req, res, next) => {
  try {
    await prisma.batch.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'P2003' || err.code === 'P2014') {
      return res.status(400).json({ error: 'Cannot delete: batch has students, semesters, or subjects.' });
    }
    next(err);
  }
});

module.exports = router;
