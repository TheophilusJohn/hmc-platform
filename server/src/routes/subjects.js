// server/src/routes/subjects.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { adminOnly, adminOrTA, facultyOrAbove } = require('../middleware/rbac');

router.get('/', authenticate, async (req, res, next) => {
  try {
    const { semesterId, batchId, facultyId, programmeId } = req.query;
    const where = {};
    if (semesterId) where.semesterId = semesterId;
    if (batchId) where.batchId = batchId;
    if (facultyId) where.facultyId = facultyId;
    if (programmeId) where.programmeId = programmeId;

    if (req.user.role === 'FACULTY') {
      const fp = await prisma.facultyProfile.findFirst({ where: { userId: req.user.id } });
      if (fp) where.facultyId = fp.id;
    }

    const subjects = await prisma.subject.findMany({
      where,
      include: {
        programme: { select: { name: true, code: true } },
        batch: { select: { name: true } },
        semester: { select: { name: true, academicYear: true } },
        faculty: { select: { firstName: true, lastName: true } },
        _count: { select: { enrollments: true } },
      },
      orderBy: { code: 'asc' },
    });
    res.json(subjects);
  } catch (err) { next(err); }
});

router.post('/', authenticate, adminOrTA, async (req, res, next) => {
  try {
    const subject = await prisma.subject.create({ data: { ...req.body, status: 'active' } });
    res.status(201).json(subject);
  } catch (err) { next(err); }
});

router.put('/:id', authenticate, adminOrTA, async (req, res, next) => {
  try {
    const subject = await prisma.subject.update({ where: { id: req.params.id }, data: req.body });
    res.json(subject);
  } catch (err) { next(err); }
});

router.post('/:id/archive', authenticate, adminOnly, async (req, res, next) => {
  try {
    const subject = await prisma.subject.update({ where: { id: req.params.id }, data: { status: 'archived' } });
    res.json(subject);
  } catch (err) { next(err); }
});

router.get('/:id/students', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const enrollments = await prisma.studentSubjectEnrollment.findMany({
      where: { subjectId: req.params.id },
      include: {
        student: { select: { firstName: true, lastName: true, photoUrl: true, user: { select: { userIdDisplay: true } } } },
      },
    });
    res.json(enrollments);
  } catch (err) { next(err); }
});

router.post('/:id/enroll', authenticate, adminOrTA, async (req, res, next) => {
  try {
    const { studentIds, semesterId } = req.body;
    const records = await Promise.all(studentIds.map(sid =>
      prisma.studentSubjectEnrollment.upsert({
        where: { studentId_subjectId_semesterId: { studentId: sid, subjectId: req.params.id, semesterId } },
        create: { studentId: sid, subjectId: req.params.id, semesterId, enrollmentType: 'REGULAR' },
        update: {},
      })
    ));
    res.json({ enrolled: records.length });
  } catch (err) { next(err); }
});

router.get('/:id/conflict-check', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const subject = await prisma.subject.findUnique({ where: { id: req.params.id } });
    const exams = await prisma.exam.findMany({
      where: { subjectId: req.params.id, type: 'ESE', status: { not: 'archived' } },
    });
    const conflicts = [];
    for (const exam of exams) {
      if (!exam.startDatetime) continue;
      const overlapping = await prisma.exam.findMany({
        where: {
          id: { not: exam.id },
          type: 'ESE',
          subject: { batchId: subject.batchId },
          startDatetime: { lte: exam.endDatetime },
          endDatetime: { gte: exam.startDatetime },
        },
        include: { subject: { select: { name: true, code: true } } },
      });
      if (overlapping.length > 0) conflicts.push({ exam, conflicts: overlapping });
    }
    res.json({ hasConflicts: conflicts.length > 0, conflicts });
  } catch (err) { next(err); }
});


router.delete('/:id', authenticate, adminOnly, async (req, res, next) => {
  try {
    await prisma.subject.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'P2003' || err.code === 'P2014') {
      return res.status(400).json({ error: 'Cannot delete: subject has exams, content, or enrollments. Archive it instead.' });
    }
    next(err);
  }
});

module.exports = router;
