// server/src/routes/programmes.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { adminOnly, adminOrTA } = require('../middleware/rbac');

router.get('/', authenticate, async (req, res, next) => {
  try {
    const programmes = await prisma.programme.findMany({ include: { batches: true } });
    res.json({ programmes });
  } catch (err) { next(err); }
});

router.post('/', authenticate, adminOnly, async (req, res, next) => {
  try {
    const programme = await prisma.programme.create({ data: req.body });
    res.status(201).json({ programme });
  } catch (err) { next(err); }
});

router.get('/:id/batches', authenticate, async (req, res, next) => {
  try {
    const batches = await prisma.batch.findMany({
      where: { programmeId: req.params.id },
      include: { _count: { select: { students: true } } },
    });
    res.json({ batches });
  } catch (err) { next(err); }
});

router.post('/:id/batches', authenticate, adminOnly, async (req, res, next) => {
  try {
    const batch = await prisma.batch.create({ data: { ...req.body, programmeId: req.params.id } });
    res.status(201).json({ batch });
  } catch (err) { next(err); }
});

router.put('/batches/:id', authenticate, adminOrTA, async (req, res, next) => {
  try {
    const batch = await prisma.batch.update({ where: { id: req.params.id }, data: req.body });
    res.json({ batch });
  } catch (err) { next(err); }
});

router.post('/batches/:id/progression', authenticate, adminOrTA, async (req, res, next) => {
  try {
    const batchId = req.params.id;
    
    // Check all results are published
    const pendingEnrollments = await prisma.studentSubjectEnrollment.count({
      where: { subject: { batchId }, resultStatus: 'PENDING' }
    });
    
    if (pendingEnrollments > 0) {
      return res.status(400).json({ error: `${pendingEnrollments} results still pending. Publish all results before progression.` });
    }

    const students = await prisma.studentProfile.findMany({
      where: { batchId },
      include: {
        enrollments: { include: { subject: true } }
      }
    });

    const results = students.map(s => {
      const failed = s.enrollments.filter(e => e.resultStatus === 'FAIL');
      const passed = failed.length === 0;
      return { studentId: s.id, name: `${s.firstName} ${s.lastName}`, passed, failedSubjects: failed.length, recommendation: passed ? 'PROGRESS' : 'REVIEW' };
    });

    const autoApproved = results.filter(r => r.passed);
    const flagged = results.filter(r => !r.passed);

    res.json({ autoApproved, flagged, total: results.length });
  } catch (err) { next(err); }
});

module.exports = router;
