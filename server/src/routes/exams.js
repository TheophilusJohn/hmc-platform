// server/src/routes/exams.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { facultyOrAbove, requireRole } = require('../middleware/rbac');
const { canAccessSubject } = require('../middleware/subjectAccess');

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
    if (!examData.subjectId) return res.status(400).json({ error: 'subjectId required' });
    if (!(await canAccessSubject(req.user, examData.subjectId))) {
      return res.status(403).json({ error: 'You do not teach this subject' });
    }
    // Marks consistency: exam totalMarks shouldn't exceed the subject component for its type
    if (examData.type && examData.totalMarks !== undefined) {
      const subj = await prisma.subject.findUnique({
        where: { id: examData.subjectId },
        select: { eseMarks: true, iaMarks: true },
      });
      const total = parseInt(examData.totalMarks);
      const t = String(examData.type).toUpperCase();
      if (subj && t === 'ESE' && total > subj.eseMarks) {
        return res.status(400).json({ error: `ESE exam total marks cannot exceed subject's ESE marks (${subj.eseMarks})` });
      }
      if (subj && t === 'IA' && total > subj.iaMarks) {
        return res.status(400).json({ error: `IA exam total marks cannot exceed subject's IA marks (${subj.iaMarks})` });
      }
    }
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
    const existing = await prisma.exam.findUnique({ where: { id: req.params.id }, select: { subjectId: true } });
    if (!existing) return res.status(404).json({ error: 'Exam not found' });
    if (!(await canAccessSubject(req.user, existing.subjectId))) {
      return res.status(403).json({ error: 'You do not teach this subject' });
    }
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
    const existing = await prisma.exam.findUnique({ where: { id: req.params.id }, select: { subjectId: true } });
    if (!existing) return res.status(404).json({ error: 'Exam not found' });
    if (!(await canAccessSubject(req.user, existing.subjectId))) {
      return res.status(403).json({ error: 'You do not teach this subject' });
    }
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
    const existing = await prisma.exam.findUnique({ where: { id: examId }, select: { subjectId: true } });
    if (!existing) return res.status(404).json({ error: 'Exam not found' });
    if (!(await canAccessSubject(req.user, existing.subjectId))) {
      return res.status(403).json({ error: 'You do not teach this subject' });
    }
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
    const existing = await prisma.exam.findUnique({ where: { id: req.params.id }, select: { subjectId: true } });
    if (!existing) return res.status(404).json({ error: 'Exam not found' });
    if (!(await canAccessSubject(req.user, existing.subjectId))) {
      return res.status(403).json({ error: 'You do not teach this subject' });
    }
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


// GET /api/exams/my-exams - student view with myStatus
router.get('/my-exams', authenticate, async (req, res, next) => {
  try {
    const { filter = 'upcoming' } = req.query;
    const sp = await prisma.studentProfile.findUnique({ where: { userId: req.user.id } });
    if (!sp) return res.json({ exams: [] });
    const enrollments = await prisma.studentSubjectEnrollment.findMany({
      where: { studentId: sp.id }, select: { subjectId: true }
    });
    const subjectIds = enrollments.map(e => e.subjectId);
    if (subjectIds.length === 0) return res.json({ exams: [] });
    const now = new Date();
    const where = { subjectId: { in: subjectIds } };
    const exams = await prisma.exam.findMany({
      where, orderBy: { startDatetime: 'asc' },
      include: {
        subject: { select: { name: true, code: true } },
        submissions: { where: { studentId: sp.id }, select: { id: true, marksObtained: true, status: true } },
      },
    });
    const flat = exams.map(e => {
      const sub = e.submissions[0];
      let myStatus = 'upcoming';
      if (sub && (sub.status === 'GRADED' || sub.status === 'RELEASED' || sub.status === 'SUBMITTED')) {
        myStatus = 'completed';
      } else if (e.endDatetime && now > e.endDatetime) {
        myStatus = sub ? 'completed' : 'missed';
      } else if (e.startDatetime && now >= e.startDatetime) {
        myStatus = 'active';
      }
      return {
        id: e.id, title: e.title,
        subjectName: e.subject?.name || '',
        duration: e.durationMins, totalMarks: e.totalMarks,
        startTime: e.startDatetime, endTime: e.endDatetime,
        passmark: e.passMark, myStatus,
        marksObtained: sub?.marksObtained ?? null,
        canStart: myStatus === 'active' && !sub,
        revaluationAllowed: myStatus === 'completed' && sub?.status === 'RELEASED',
      };
    }).filter(e => filter === 'all' ? true : e.myStatus === filter);
    res.json({ exams: flat });
  } catch (err) { console.error('my-exams:', err); next(err); }
});

// GET /api/exams/:id - single exam for taking screen
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const exam = await prisma.exam.findUnique({
      where: { id: req.params.id },
      include: {
        subject: { select: { name: true, code: true } },
        settings: true,
        _count: { select: { questions: true } },
      },
    });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    res.json({
      id: exam.id, title: exam.title,
      subjectName: exam.subject?.name || '',
      duration: exam.durationMins, totalMarks: exam.totalMarks,
      type: exam.type, answerFormat: exam.answerFormat, mode: exam.mode,
      questionCount: exam._count.questions,
      instructions: exam.settings ? null : null,
      showResultAfter: !!exam.settings?.showAnswersAfter,
    });
  } catch (err) { next(err); }
});

module.exports = router;
