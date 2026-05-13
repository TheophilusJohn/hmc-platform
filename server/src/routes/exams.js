// server/src/routes/exams.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { facultyOrAbove, requireRole } = require('../middleware/rbac');

router.get('/', authenticate, async (req, res, next) => {
  try {
    const { subjectId, status } = req.query;
    const where = {};
    if (subjectId) where.subjectId = subjectId;
    if (status) where.status = status;

    // Faculty sees own subjects only
    if (req.user.role === 'FACULTY') {
      const fp = await prisma.facultyProfile.findFirst({ where: { userId: req.user.id } });
      where.subject = { facultyId: fp?.id };
    }

    const exams = await prisma.exam.findMany({
      where,
      include: { subject: { select: { name: true, code: true } }, settings: true, _count: { select: { submissions: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ exams });
  } catch (err) { next(err); }
});

router.post('/', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const { settings, ...examData } = req.body;
    const exam = await prisma.exam.create({
      data: {
        ...examData,
        ...(settings && { settings: { create: settings } }),
      },
      include: { settings: true },
    });
    res.status(201).json({ exam });
  } catch (err) { next(err); }
});

router.put('/:id', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const { settings, ...examData } = req.body;
    const exam = await prisma.exam.update({
      where: { id: req.params.id },
      data: {
        ...examData,
        ...(settings && { settings: { upsert: { create: settings, update: settings } } }),
      },
    });
    res.json({ exam });
  } catch (err) { next(err); }
});

router.post('/:id/publish', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const exam = await prisma.exam.update({
      where: { id: req.params.id },
      data: { status: 'published' },
    });
    res.json({ exam });
  } catch (err) { next(err); }
});

router.post('/:id/release-results', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const examId = req.params.id;
    const submissions = await prisma.submission.findMany({
      where: { examId, status: 'GRADED' },
      include: { student: { include: { user: true } } },
    });

    // Update to released
    await prisma.submission.updateMany({ where: { examId, status: 'GRADED' }, data: { status: 'RELEASED' } });

    // Notify students
    const { createNotification } = require('../services/notification.service');
    const exam = await prisma.exam.findUnique({ where: { id: examId }, include: { subject: true } });

    for (const sub of submissions) {
      if (sub.student?.user) {
        await createNotification(sub.student.user.id, 'grade_released', 'Results Released', `Results for ${exam?.subject?.name} - ${exam?.title} are now available.`, '/student/marksheet');
      }
    }

    res.json({ released: submissions.length });
  } catch (err) { next(err); }
});

router.get('/:id/statistics', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const submissions = await prisma.submission.findMany({
      where: { examId: req.params.id, status: { in: ['GRADED', 'RELEASED'] } },
      select: { marksObtained: true },
    });

    const marks = submissions.map(s => s.marksObtained || 0);
    const avg = marks.length ? marks.reduce((a, b) => a + b, 0) / marks.length : 0;
    const max = marks.length ? Math.max(...marks) : 0;
    const min = marks.length ? Math.min(...marks) : 0;

    res.json({ count: marks.length, average: avg.toFixed(2), highest: max, lowest: min });
  } catch (err) { next(err); }
});

module.exports = router;
