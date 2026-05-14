// server/src/routes/programmes.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { adminOnly, adminOrTA } = require('../middleware/rbac');

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

router.post('/:id/batches', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { name, startYear, endYear, currentYear, maxIntake, status } = req.body;
    if (!name) return res.status(400).json({ error: 'Batch name is required' });
    const batch = await prisma.batch.create({
      data: {
        name,
        programmeId: req.params.id,
        startYear: toInt(startYear, new Date().getFullYear()),
        endYear: toInt(endYear, new Date().getFullYear() + 3),
        currentYear: toInt(currentYear, 1),
        maxIntake: toInt(maxIntake, null),
        status: status || 'ACTIVE',
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

    const results = students.map(s => {
      const failed = s.enrollments.filter(e => e.resultStatus === 'FAIL');
      const passed = failed.length === 0;
      return {
        studentId: s.id,
        name: `${s.firstName} ${s.lastName}`,
        passed,
        failedSubjects: failed.length,
        recommendation: passed ? 'PROGRESS' : 'REVIEW',
      };
    });

    const autoApproved = results.filter(r => r.passed);
    const flagged = results.filter(r => !r.passed);

    res.json({ autoApproved, flagged, total: results.length });
  } catch (err) { next(err); }
});


router.put('/:id', authenticate, adminOnly, async (req, res, next) => {
  try {
    const data = {};
    for (const k of ['name', 'code', 'durationYears', 'totalSemesters', 'feeINR', 'feeUSD', 'description', 'isActive']) {
      if (req.body[k] !== undefined) data[k] = req.body[k];
    }
    const programme = await prisma.programme.update({ where: { id: req.params.id }, data });
    res.json({ programme });
  } catch (err) { console.error('programme update:', err); next(err); }
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
