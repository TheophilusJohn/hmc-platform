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

// MCQ answer normalization — see submissions.js for rationale.
function normalizeMcqAnswer(raw) {
  if (raw === null || raw === undefined) return [];
  let value = raw;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('[')) {
      try { value = JSON.parse(trimmed); } catch (_e) { value = trimmed; }
    } else {
      value = trimmed;
    }
  }
  if (!Array.isArray(value)) value = [value];
  return value.map(v => String(v).trim()).filter(v => v.length).sort();
}
function mcqIsCorrect(studentAnswer, correctAnswer) {
  const a = normalizeMcqAnswer(studentAnswer);
  const b = normalizeMcqAnswer(correctAnswer);
  if (a.length !== b.length || a.length === 0) return false;
  return a.every((v, i) => v === b[i]);
}

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

    // Race-safe attempt-counting + draft creation: two concurrent /start
    // requests could otherwise both see "no draft" and create duplicates.
    const draft = await prisma.$transaction(async (tx) => {
      const existing = await tx.submission.findFirst({
        where: { examId: req.params.id, studentId: sp.id, status: 'DRAFT' },
      });
      if (existing) return existing;
      const completed = await tx.submission.count({
        where: { examId: req.params.id, studentId: sp.id, status: { not: 'DRAFT' } },
      });
      if (completed >= (exam.maxAttempts || 1)) {
        throw Object.assign(new Error('Maximum attempts reached.'), { status: 400 });
      }
      return tx.submission.create({
        data: {
          examId: req.params.id,
          studentId: sp.id,
          attemptNumber: completed + 1,
          answers: {},
          status: 'DRAFT',
          startedAt: now,
          tabSwitches: 0,
          timePerQuestion: {},
        },
      });
    });

    if (req.sessionId) {
      await prisma.session.update({
        where: { id: req.sessionId },
        data: { isExamSession: true },
      });
    }

    let questions = exam.questions;
    if (exam.settings?.shuffleQuestions) questions = [...questions].sort(() => Math.random() - 0.5);
    if (exam.settings?.shuffleOptions) {
      questions = questions.map(q => ({ ...q, options: q.options ? [...q.options].sort(() => Math.random() - 0.5) : q.options }));
    }

    const safeQuestions = questions.map(q => ({ ...q, correctAnswer: undefined, modelAnswer: undefined }));
    res.json({ submission: draft, exam: { ...exam, questions: safeQuestions } });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.put('/submissions/:id/autosave', authenticate, requireSubmissionOwner, async (req, res, next) => {
  try {
    const { answers, timePerQuestion } = req.body;
    // Refuse autosave after the submission has already been finalized — the
    // race window is real: a student could submit, then a stale autosave
    // interval still fires and overwrites the answers post-grade.
    const current = await prisma.submission.findUnique({
      where: { id: req.params.id }, select: { status: true },
    });
    if (!current) return res.status(404).json({ error: 'Submission not found' });
    if (current.status !== 'DRAFT') {
      return res.status(409).json({ error: 'Submission has been finalized; autosave ignored.' });
    }
    // updateMany scoped to status=DRAFT — if a concurrent submit flipped the
    // row while we were checking, this update affects zero rows instead of
    // clobbering finalized answers.
    const result = await prisma.submission.updateMany({
      where: { id: req.params.id, status: 'DRAFT' },
      data: { answers, timePerQuestion, lastSavedAt: new Date() },
    });
    if (result.count === 0) {
      return res.status(409).json({ error: 'Submission was finalized; autosave ignored.' });
    }
    res.json({ saved: true });
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

// Real-time similarity check, used during the exam by the client. The score
// is NOT returned — exposing it would let a student iteratively rewrite until
// the score dropped below the threshold (defeating the plagiarism check
// entirely). We compute the score so faculty can see it post-grading, and the
// client just gets an opaque "ok".
router.post('/submissions/:id/similarity-check', authenticate, requireSubmissionOwner, async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text || text.length < 50) return res.json({ ok: true });

    const submission = await prisma.submission.findUnique({ where: { id: req.params.id } });
    // Best-effort recording; surface result internally only.
    try {
      const score = await plagiarismService.compareStudentToStudent(text, submission.examId);
      // Persist on the submission row so faculty can inspect later. We only
      // ever overwrite an existing similarity score if the new one is higher,
      // so a student can't intentionally "wash out" an earlier high score.
      const existing = await prisma.submission.findUnique({
        where: { id: req.params.id }, select: { plagiarismScore: true },
      });
      if ((existing?.plagiarismScore ?? 0) < score) {
        await prisma.submission.update({
          where: { id: req.params.id },
          data: { plagiarismScore: score },
        });
      }
    } catch (_e) {}
    res.json({ ok: true });
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
      if (mcqIsCorrect(answers?.[q.id], q.correctAnswer)) autoMarks += q.marks;
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
