const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authenticate } = require('../middleware/auth');
const { adminOnly, adminOrTA, facultyOrAbove } = require('../middleware/rbac');

// GET /api/subjects
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { semesterId, batchId, facultyId, programmeId } = req.query;
    const where = {};
    if (semesterId) where.semester_id = semesterId;
    if (batchId) where.batch_id = batchId;
    if (facultyId) where.faculty_id = facultyId;
    if (programmeId) where.programme_id = programmeId;

    // Faculty: only own subjects
    if (req.user.role === 'faculty') where.faculty_id = req.user.id;

    const subjects = await prisma.subject.findMany({
      where,
      include: {
        programme: { select: { name: true, code: true } },
        batch: { select: { name: true } },
        semester: { select: { name: true, academic_year: true } },
        faculty: { include: { faculty_profile: { select: { first_name: true, last_name: true } } } },
        _count: { select: { enrollments: true } },
      },
      orderBy: { code: 'asc' },
    });
    res.json(subjects);
  } catch (err) { next(err); }
});

// POST /api/subjects
router.post('/', authenticate, adminOrTA, async (req, res, next) => {
  try {
    const subject = await prisma.subject.create({ data: { ...req.body, status: 'draft' } });
    res.status(201).json(subject);
  } catch (err) { next(err); }
});

// PUT /api/subjects/:id
router.put('/:id', authenticate, adminOrTA, async (req, res, next) => {
  try {
    const subject = await prisma.subject.update({ where: { id: req.params.id }, data: req.body });
    res.json(subject);
  } catch (err) { next(err); }
});

// POST /api/subjects/:id/archive
router.post('/:id/archive', authenticate, adminOnly, async (req, res, next) => {
  try {
    const subject = await prisma.subject.update({ where: { id: req.params.id }, data: { status: 'archived' } });
    res.json(subject);
  } catch (err) { next(err); }
});

// GET /api/subjects/:id/students
router.get('/:id/students', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const enrollments = await prisma.studentSubjectEnrollment.findMany({
      where: { subject_id: req.params.id },
      include: {
        student: {
          include: { student_profile: { select: { first_name: true, last_name: true, photo_url: true } } },
        },
      },
    });
    res.json(enrollments);
  } catch (err) { next(err); }
});

// POST /api/subjects/:id/enroll
router.post('/:id/enroll', authenticate, adminOrTA, async (req, res, next) => {
  try {
    const { studentIds, semesterId } = req.body;
    const records = await Promise.all(studentIds.map(sid =>
      prisma.studentSubjectEnrollment.upsert({
        where: { student_id_subject_id: { student_id: sid, subject_id: req.params.id } },
        create: { student_id: sid, subject_id: req.params.id, semester_id: semesterId, enrollment_type: 'regular' },
        update: {},
      })
    ));
    res.json({ enrolled: records.length });
  } catch (err) { next(err); }
});

// GET /api/subjects/:id/conflict-check
router.get('/:id/conflict-check', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const subject = await prisma.subject.findUnique({ where: { id: req.params.id } });
    const exams = await prisma.exam.findMany({
      where: { subject_id: req.params.id, type: 'ese', status: { not: 'archived' } },
    });
    const conflicts = [];
    for (const exam of exams) {
      if (!exam.start_datetime) continue;
      const overlapping = await prisma.exam.findMany({
        where: {
          id: { not: exam.id },
          type: 'ese',
          subject: { batch_id: subject.batch_id },
          start_datetime: { lte: exam.end_datetime },
          end_datetime: { gte: exam.start_datetime },
        },
        include: { subject: { select: { name: true, code: true } } },
      });
      if (overlapping.length > 0) conflicts.push({ exam, conflicts: overlapping });
    }
    res.json({ hasConflicts: conflicts.length > 0, conflicts });
  } catch (err) { next(err); }
});

module.exports = router;
