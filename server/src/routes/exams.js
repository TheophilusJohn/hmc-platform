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

const EXAM_TYPES = ['ESE', 'IA'];
const EXAM_MODES = ['ONLINE', 'OFFLINE'];
const ANSWER_FORMATS = ['MCQ', 'WRITTEN', 'FILE_UPLOAD', 'MIXED'];

router.post('/', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const { settings, ...examData } = req.body;
    if (!examData.subjectId) return res.status(400).json({ error: 'subjectId required' });
    if (!(await canAccessSubject(req.user, examData.subjectId))) {
      return res.status(403).json({ error: 'You do not teach this subject' });
    }

    // Enum validation
    const type = examData.type ? String(examData.type).toUpperCase() : null;
    const mode = examData.mode ? String(examData.mode).toUpperCase() : null;
    const answerFormat = examData.answerFormat ? String(examData.answerFormat).toUpperCase() : null;
    if (type && !EXAM_TYPES.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${EXAM_TYPES.join(', ')}` });
    }
    if (mode && !EXAM_MODES.includes(mode)) {
      return res.status(400).json({ error: `mode must be one of: ${EXAM_MODES.join(', ')}` });
    }
    if (answerFormat && !ANSWER_FORMATS.includes(answerFormat)) {
      return res.status(400).json({ error: `answerFormat must be one of: ${ANSWER_FORMATS.join(', ')}` });
    }

    // passMark ≤ totalMarks
    const totalMarks = examData.totalMarks !== undefined ? parseInt(examData.totalMarks, 10) : null;
    const passMark = examData.passMark !== undefined ? parseInt(examData.passMark, 10) : null;
    if (totalMarks !== null && passMark !== null && passMark > totalMarks) {
      return res.status(400).json({ error: 'passMark cannot exceed totalMarks' });
    }

    // startDatetime < endDatetime
    if (examData.startDatetime && examData.endDatetime) {
      const start = new Date(examData.startDatetime);
      const end = new Date(examData.endDatetime);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end <= start) {
        return res.status(400).json({ error: 'endDatetime must be after startDatetime' });
      }
    }

    // Marks consistency: exam totalMarks shouldn't exceed the subject component for its type
    if (type && totalMarks !== null) {
      const subj = await prisma.subject.findUnique({
        where: { id: examData.subjectId },
        select: { eseMarks: true, iaMarks: true },
      });
      if (subj && type === 'ESE' && totalMarks > subj.eseMarks) {
        return res.status(400).json({ error: `ESE exam total marks cannot exceed subject's ESE marks (${subj.eseMarks})` });
      }
      if (subj && type === 'IA' && totalMarks > subj.iaMarks) {
        return res.status(400).json({ error: `IA exam total marks cannot exceed subject's IA marks (${subj.iaMarks})` });
      }
    }

    // Whitelist Exam fields — never spread req.body. Pre-fix a faculty could
    // re-assign their exam to another subject (or set arbitrary timestamps, etc.)
    // simply by including the field in the create payload.
    const EXAM_CREATE_FIELDS = [
      'subjectId', 'title', 'totalMarks', 'passMark',
      'startDatetime', 'endDatetime', 'durationMins',
      'maxAttempts', 'attemptScoring', 'status',
    ];
    const safeData = {};
    for (const k of EXAM_CREATE_FIELDS) {
      if (examData[k] === undefined) continue;
      if (k === 'startDatetime' || k === 'endDatetime') safeData[k] = new Date(examData[k]);
      else if (k === 'totalMarks' || k === 'passMark' || k === 'durationMins' || k === 'maxAttempts') {
        safeData[k] = parseInt(examData[k], 10);
      } else safeData[k] = examData[k];
    }
    if (type) safeData.type = type;
    if (mode) safeData.mode = mode;
    if (answerFormat) safeData.answerFormat = answerFormat;
    const exam = await prisma.exam.create({
      data: {
        ...safeData,
        ...(settings && { settings: { create: settings } }),
      },
      include: { settings: true },
    });
    res.status(201).json({ exam });
  } catch (err) { next(err); }
});

const EXAM_UPDATE_FIELDS = [
  // subjectId intentionally NOT updatable — re-assigning an exam to a different
  // subject is a privilege escalation vector for FACULTY.
  'title', 'totalMarks', 'passMark',
  'startDatetime', 'endDatetime', 'durationMins',
  'maxAttempts', 'attemptScoring', 'status',
  'type', 'mode', 'answerFormat',
];

router.put('/:id', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const { settings, ...examData } = req.body;
    const existing = await prisma.exam.findUnique({ where: { id: req.params.id }, select: { subjectId: true } });
    if (!existing) return res.status(404).json({ error: 'Exam not found' });
    if (!(await canAccessSubject(req.user, existing.subjectId))) {
      return res.status(403).json({ error: 'You do not teach this subject' });
    }
    const safeUpdate = {};
    for (const k of EXAM_UPDATE_FIELDS) {
      if (examData[k] === undefined) continue;
      if (k === 'startDatetime' || k === 'endDatetime') safeUpdate[k] = new Date(examData[k]);
      else if (k === 'totalMarks' || k === 'passMark' || k === 'durationMins' || k === 'maxAttempts') {
        safeUpdate[k] = parseInt(examData[k], 10);
      } else if (['type', 'mode', 'answerFormat'].includes(k)) {
        safeUpdate[k] = String(examData[k]).toUpperCase();
      } else safeUpdate[k] = examData[k];
    }
    const exam = await prisma.exam.update({
      where: { id: req.params.id },
      data: {
        ...safeUpdate,
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
    const existing = await prisma.exam.findUnique({ where: { id: examId }, select: { subjectId: true, totalMarks: true, passMark: true } });
    if (!existing) return res.status(404).json({ error: 'Exam not found' });
    if (!(await canAccessSubject(req.user, existing.subjectId))) {
      return res.status(403).json({ error: 'You do not teach this subject' });
    }

    const subject = await prisma.subject.findUnique({
      where: { id: existing.subjectId },
      select: { totalMarks: true, passMark: true, semesterId: true },
    });
    const { percentToGrade } = require('../utils/cgpa');

    // Release inside a transaction so submission flip + enrollment update
    // either both land or both roll back. Previously only Submission.status was
    // updated → marksheets never reflected released results.
    const submissions = await prisma.submission.findMany({
      where: { examId, status: 'GRADED' },
      include: { student: { include: { user: true } } },
    });

    await prisma.$transaction(async (tx) => {
      await tx.submission.updateMany({ where: { examId, status: 'GRADED' }, data: { status: 'RELEASED' } });
      // Move the exam itself to `closed` so the FE state machine knows it's
      // no longer accepting submissions / re-grades.
      await tx.exam.update({ where: { id: examId }, data: { status: 'closed' } });

      // For each released submission, also flip the matching enrollment row
      // so the marksheet/CGPA see the result. We only have one Exam per Subject
      // path here; map submission.marksObtained → grade + resultStatus on
      // StudentSubjectEnrollment for (studentId, subjectId, semesterId).
      for (const sub of submissions) {
        if (sub.marksObtained == null || !subject) continue;
        const enrollment = await tx.studentSubjectEnrollment.findFirst({
          where: { studentId: sub.studentId, subjectId: existing.subjectId, semesterId: subject.semesterId },
        });
        if (!enrollment) continue;
        // Total = IA already in enrollment + ESE just released. Don't overwrite
        // an enrollment that already has totalMarks (e.g. manually entered) —
        // only set if it's null.
        const ia = enrollment.iaMarks ?? 0;
        const ese = sub.marksObtained;
        const total = ia + ese;
        const pct = subject.totalMarks > 0 ? (total / subject.totalMarks) * 100 : 0;
        const grade = (total < subject.passMark) ? 'F' : percentToGrade(pct);
        await tx.studentSubjectEnrollment.update({
          where: { id: enrollment.id },
          data: {
            eseMarks: enrollment.eseMarks ?? ese,
            totalMarks: total,
            grade,
            resultStatus: grade === 'F' ? 'FAIL' : 'PASS',
          },
        });
      }
    });

    // Notify students
    const { createNotification } = require('../services/notification.service');
    const exam = await prisma.exam.findUnique({ where: { id: examId }, include: { subject: true } });
    for (const sub of submissions) {
      if (sub.student?.user) {
        try {
          await createNotification(sub.student.user.id, 'grade_released', 'Results Released', `Results for ${exam?.subject?.name} - ${exam?.title} are now available.`, '/student/marksheet');
        } catch (_e) {}
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
    // Students only see published exams (or closed ones for history). Draft
    // exams would otherwise leak the title and question count before release.
    const where = { subjectId: { in: subjectIds }, status: { in: ['published', 'closed'] } };
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
        // A DRAFT past the deadline is an abandoned attempt — should NOT
        // present as 'completed' to the student. Treat as missed.
        myStatus = (sub && sub.status !== 'DRAFT') ? 'completed' : 'missed';
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
