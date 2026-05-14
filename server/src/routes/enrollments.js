// server/src/routes/enrollments.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { adminOrTA } = require('../middleware/rbac');

router.get('/', authenticate, async (req, res, next) => {
  try {
    let studentId;
    if (req.user.role === 'STUDENT') {
      const sp = await prisma.studentProfile.findFirst({ where: { userId: req.user.id } });
      studentId = sp?.id;
    } else {
      studentId = req.query.studentId;
    }
    // Without studentId, Prisma treats `where.studentId: undefined` as "no filter"
    // and returns every enrollment in the database. Refuse.
    if (!studentId) return res.status(400).json({ error: 'studentId is required' });

    const { semesterId } = req.query;
    const where = { studentId };
    if (semesterId) where.semesterId = semesterId;

    const enrollments = await prisma.studentSubjectEnrollment.findMany({
      where,
      include: {
        subject: {
          include: {
            programme: { select: { name: true } },
            batch: { select: { name: true } },
            semester: { select: { name: true, academicYear: true } },
            faculty: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { subject: { code: 'asc' } },
    });
    res.json({ enrollments });
  } catch (err) { next(err); }
});

router.get('/arrears', authenticate, async (req, res, next) => {
  try {
    let studentId;
    if (req.user.role === 'STUDENT') {
      const sp = await prisma.studentProfile.findFirst({ where: { userId: req.user.id } });
      studentId = sp?.id;
    } else {
      studentId = req.query.studentId;
    }
    if (!studentId) return res.status(400).json({ error: 'studentId is required' });

    const arrears = await prisma.studentSubjectEnrollment.findMany({
      where: { studentId, isArrear: true, resultStatus: { in: ['FAIL', 'PENDING'] } },
      include: { subject: { include: { semester: true } } },
    });
    res.json({ arrears });
  } catch (err) { next(err); }
});

router.post('/assign-arrear', authenticate, adminOrTA, async (req, res, next) => {
  try {
    const { studentId, subjectId, semesterId } = req.body;
    if (!studentId || !subjectId) return res.status(400).json({ error: 'studentId and subjectId required' });

    // Validate that student and subject belong to the same programme
    const [student, subject] = await Promise.all([
      prisma.studentProfile.findUnique({ where: { id: studentId }, select: { programmeId: true } }),
      prisma.subject.findUnique({ where: { id: subjectId }, select: { programmeId: true, name: true } }),
    ]);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    if (!subject) return res.status(404).json({ error: 'Subject not found' });
    if (student.programmeId !== subject.programmeId) {
      return res.status(400).json({ error: 'Student is not in the same programme as this subject' });
    }

    // Avoid duplicate arrear for same student+subject
    const dup = await prisma.studentSubjectEnrollment.findFirst({
      where: { studentId, subjectId, isArrear: true, resultStatus: { in: ['PENDING', 'FAIL'] } },
    });
    if (dup) return res.status(400).json({ error: 'Active arrear already exists for this student/subject' });

    const enrollment = await prisma.studentSubjectEnrollment.create({
      data: { studentId, subjectId, semesterId, enrollmentType: 'ARREAR', resultStatus: 'PENDING', isArrear: true, arrearNotation: 'A' },
    });
    res.status(201).json(enrollment);
  } catch (err) { next(err); }
});

module.exports = router;
