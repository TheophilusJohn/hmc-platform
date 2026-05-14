// server/src/routes/examSession.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const plagiarismService = require('../services/plagiarism.service');
const minioService = require('../services/minio.service');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// Verifies the calling student owns this submission.
async function requireSubmissionOwner(req, res, next) {
  try {
    if (req.user.role !== 'STUDENT') {
      return res.status(403).json({ error: 'Only students may modify exam submissions' });
    }
    const sp = await prisma.studentProfile.findFirst({
      where: { userId: req.user.id },
      select: { id: true },
    });
    if (!sp) return res.status(403).json({ error: 'Student profile not found' });
    const sub = await prisma.submission.findUnique({
      where: { id: req.params.id },
      select: { studentId: true, status: true, examId: true },
    });
    if (!sub) return res.status(404).json({ error: 'Submission not found' });
    if (sub.studentId !== sp.id) return res.status(403).json({ error: 'Not your submission' });
    req.submissionMeta = sub;
    next();
  } catch (err) { next(err); }
}

router.post('/:id/start', authenticate, requireRole('STUDENT'), async (req, res, next) => {
  try {
    const sp = await prisma.studentProfile.findFirst({ where: { userId: req.user.id } });
    if (!sp) return res.status(404).json({ error: 'Student profile not found' });

    const exam = await prisma.exam.findUnique({
      where: { id: req.params.id },
      include: { settings: true, questions: { orderBy: { orderIndex: 'asc' } } },
    });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    const now = new Date();
    if (exam.startDatetime && now < exam.startDatetime) return res.status(400).json({ error: 'Exam window has not opened yet.' });
    if (exam.endDatetime && now > exam.endDatetime) return res.status(400).json({ error: 'Exam window has closed.' });

    const existing = await prisma.submission.findMany({
      where: { examId: req.params.id, studentId: sp.id, status: { not: 'DRAFT' } },
    });
    if (existing.length >= (exam.maxAttempts || 1)) return res.status(400).json({ error: 'Maximum attempts reached.' });

    let draft = await prisma.submission.findFirst({
      where: { examId: req.params.id, studentId: sp.id, status: 'DRAFT' },
    });

    let questions = exam.questions;
    if (exam.settings?.shuffleQuestions) questions = [...questions].sort(() => Math.random() - 0.5);
    if (exam.settings?.shuffleOptions) {
      questions = questions.map(q => ({ ...q, options: q.options ? [...q.options].sort(() => Math.random() - 0.5) : q.options }));
    }

    if (!draft) {
      draft = await prisma.submission.create({
        data: {
          examId: req.params.id,
          studentId: sp.id,
          attemptNumber: existing.length + 1,
          answers: {},
          status: 'DRAFT',
          startedAt: now,
          tabSwitches: 0,
          timePerQuestion: {},
        },
      });

      if (req.sessionId) {
        await prisma.session.update({
          where: { id: req.sessionId },
          data: { isExamSession: true },
        });
      }
    }

    const safeQuestions = questions.map(q => ({ ...q, correctAnswer: undefined, modelAnswer: undefined }));
    res.json({ submission: draft, exam: { ...exam, questions: safeQuestions } });
  } catch (err) { next(err); }
});

router.put('/submissions/:id/autosave', authenticate, requireSubmissionOwner, async (req, res, next) => {
  try {
    const { answers, timePerQuestion } = req.body;
    const submission = await prisma.submission.update({
      where: { id: req.params.id },
      data: { answers, timePerQuestion, lastSavedAt: new Date() },
    });
    res.json({ saved: true, lastSavedAt: submission.lastSavedAt });
  } catch (err) { next(err); }
});

router.post('/submissions/:id/flag', authenticate, requireSubmissionOwner, async (req, res, next) => {
  try {
    const submission = await prisma.submission.findUnique({ where: { id: req.params.id } });
    const newSwitches = (submission.tabSwitches || 0) + 1;
    const data = { tabSwitches: newSwitches };
    if (newSwitches >= 3) data.flagStatus = 'FLAGGED';

    await prisma.submission.update({ where: { id: req.params.id }, data });
    res.json({ tabSwitches: newSwitches, flagged: newSwitches >= 3 });
  } catch (err) { next(err); }
});

router.post('/submissions/:id/similarity-check', authenticate, requireSubmissionOwner, async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text || text.length < 50) return res.json({ score: 0 });

    const submission = await prisma.submission.findUnique({ where: { id: req.params.id } });
    const score = await plagiarismService.compareStudentToStudent(text, submission.examId);
    res.json({ score: Math.round(score) });
  } catch (err) { next(err); }
});

router.post('/submissions/:id/submit', authenticate, requireSubmissionOwner, async (req, res, next) => {
  try {
    const { answers, timePerQuestion } = req.body;
    const submission = await prisma.submission.findUnique({
      where: { id: req.params.id },
      include: { exam: { include: { questions: true, settings: true } } },
    });

    if (!submission) return res.status(404).json({ error: 'Submission not found' });
    if (submission.status !== 'DRAFT') return res.status(400).json({ error: 'Submission already finalized.' });

    let autoMarks = 0;
    const mcqQuestions = submission.exam.questions.filter(q => q.type === 'MCQ');
    for (const q of mcqQuestions) {
      const studentAnswer = answers?.[q.id];
      if (studentAnswer === q.correctAnswer) autoMarks += q.marks;
    }

    const hasWritten = submission.exam.questions.some(q => q.type !== 'MCQ');
    const status = hasWritten ? 'SUBMITTED' : 'GRADED';

    await prisma.submission.update({
      where: { id: req.params.id },
      data: {
        answers,
        timePerQuestion,
        submittedAt: new Date(),
        marksObtained: hasWritten ? null : autoMarks,
        status,
      },
    });

    if (req.sessionId) {
      await prisma.session.update({
        where: { id: req.sessionId },
        data: { isExamSession: false },
      });
    }

    if (hasWritten && submission.exam.settings?.plagiarismCheck) {
      const writtenTexts = Object.entries(answers || {})
        .filter(([qId]) => submission.exam.questions.find(q => q.id === qId && q.type !== 'MCQ'))
        .map(([, text]) => text).join('\n\n');
      if (writtenTexts) {
        plagiarismService.checkPlagiarism(req.params.id, writtenTexts).catch(err => console.error('Plagiarism check failed:', err));
      }
    }

    res.json({ submitted: true, status, marks: hasWritten ? null : autoMarks });
  } catch (err) { next(err); }
});

// POST /api/exam-session/submissions/:id/upload — file-upload questions
router.post('/submissions/:id/upload', authenticate, requireSubmissionOwner, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });
    const subId = req.params.id;
    const safeName = req.file.originalname.replace(/[^\w.\-]/g, '_');
    let storedPath;
    try {
      storedPath = await minioService.uploadFile(
        req.file.buffer,
        process.env.MINIO_BUCKET || 'hmc-files',
        `exam-submissions/${subId}/${Date.now()}-${safeName}`,
        req.file.mimetype
      );
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
    const url = await minioService.getReadUrl(storedPath);
    res.json({ url, path: storedPath, filename: safeName });
  } catch (err) { next(err); }
});

module.exports = router;
