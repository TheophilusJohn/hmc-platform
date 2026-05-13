const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authenticate } = require('../middleware/auth');
const { adminOrTA } = require('../middleware/rbac');

// GET /api/enrollments — student's own enrollments
router.get('/', authenticate, async (req, res, next) => {
  try {
    const studentId = req.user.role === 'student' ? req.user.id : req.query.studentId;
    const { semesterId } = req.query;
    const where = { student_id: studentId };
    if (semesterId) where.semester_id = semesterId;

    const enrollments = await prisma.studentSubjectEnrollment.findMany({
      where,
      include: {
        subject: {
          include: {
            programme: { select: { name: true } },
            batch: { select: { name: true } },
            semester: { select: { name: true, academic_year: true } },
            faculty: { include: { faculty_profile: { select: { first_name: true, last_name: true } } } },
          },
        },
      },
      orderBy: { subject: { code: 'asc' } },
    });
    res.json(enrollments);
  } catch (err) { next(err); }
});

// GET /api/enrollments/:id/arrears
router.get('/arrears', authenticate, async (req, res, next) => {
  try {
    const studentId = req.user.role === 'student' ? req.user.id : req.query.studentId;
    const arrears = await prisma.studentSubjectEnrollment.findMany({
      where: { student_id: studentId, enrollment_type: 'arrear', result_status: { in: ['fail', 'pending'] } },
      include: { subject: { include: { semester: true } } },
    });
    res.json(arrears);
  } catch (err) { next(err); }
});

// POST /api/enrollments/elective-preference
router.post('/elective-preference', authenticate, async (req, res, next) => {
  try {
    const { subjectId } = req.body;
    const subject = await prisma.subject.findUnique({ where: { id: subjectId } });
    if (subject.type !== 'elective') return res.status(400).json({ error: 'Subject is not an elective.' });

    // Check seat availability
    const confirmed = await prisma.studentSubjectEnrollment.count({
      where: { subject_id: subjectId, enrollment_type: 'regular', result_status: 'pending' },
    });

    const maxSeats = subject.max_seats || 30;
    const status = confirmed >= maxSeats ? 'waitlisted' : 'pending_confirmation';

    const pref = await prisma.studentSubjectEnrollment.create({
      data: {
        student_id: req.user.id, subject_id: subjectId,
        semester_id: subject.semester_id, enrollment_type: 'regular',
        result_status: status,
      },
    });
    res.json(pref);
  } catch (err) { next(err); }
});

// PUT /api/enrollments/:id/confirm-elective
router.put('/:id/confirm-elective', authenticate, adminOrTA, async (req, res, next) => {
  try {
    const enrollment = await prisma.studentSubjectEnrollment.update({
      where: { id: req.params.id },
      data: { result_status: 'pending' },
    });
    res.json(enrollment);
  } catch (err) { next(err); }
});

// POST /api/enrollments/assign-arrear
router.post('/assign-arrear', authenticate, adminOrTA, async (req, res, next) => {
  try {
    const { studentId, subjectId, semesterId } = req.body;
    const enrollment = await prisma.studentSubjectEnrollment.create({
      data: { student_id: studentId, subject_id: subjectId, semester_id: semesterId, enrollment_type: 'arrear', result_status: 'pending' },
    });
    res.status(201).json(enrollment);
  } catch (err) { next(err); }
});

module.exports = router;
