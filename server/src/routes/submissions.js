// server/src/routes/submissions.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { requireRole, facultyOrAbove } = require('../middleware/rbac');

// POST /api/exams/:id/start
router.post('/exams/:id/start', authenticate, requireRole('STUDENT'), async (req, res, next) => {
  try {
    const examId = req.params.id;
    const studentProfile = await prisma.studentProfile.findFirst({ where: { userId: req.user.id } });
    if (!studentProfile) return res.status(404).json({ error: 'Student profile not found' });

    const exam = await prisma.exam.findUnique({ where: { id: examId }, include: { settings: true } });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    // Check window
    const now = new Date();
    if (exam.startDatetime && now < exam.startDatetime) {
      return res.status(400).json({ error: 'Exam window has not opened yet' });
    }
    if (exam.endDatetime && now > exam.endDatetime) {
      return res.status(400).json({ error: 'Exam window has closed' });
    }

    // Check max attempts
    const attempts = await prisma.submission.count({
      where: { examId, studentId: studentProfile.id, status: { not: 'DRAFT' } }
    });
    if (attempts >= exam.maxAttempts) {
      return res.status(400).json({ error: 'Maximum attempts reached' });
    }

    // Check no active draft submission
    const existing = await prisma.submission.findFirst({
      where: { examId, studentId: studentProfile.id, status: 'DRAFT' }
    });
    if (existing) return res.json({ submission: existing, resumed: true });

    // Create draft
    const submission = await prisma.submission.create({
      data: {
        examId,
        studentId: studentProfile.id,
        attemptNumber: attempts + 1,
        status: 'DRAFT',
        answers: {},
      }
    });

    // Mark session as exam session (no timeout)
    if (req.sessionId) {
      await prisma.session.update({ where: { id: req.sessionId }, data: { isExamSession: true } });
    }

    // Fetch questions (shuffle if enabled)
    let questions = await prisma.question.findMany({
      where: { examId },
      orderBy: { orderIndex: 'asc' },
    });

    if (exam.settings?.shuffleQuestions) {
      questions = questions.sort(() => Math.random() - 0.5);
    }

    if (exam.settings?.shuffleOptions) {
      questions = questions.map(q => ({
        ...q,
        options: q.options ? (q.options).sort(() => Math.random() - 0.5) : null,
        correctAnswer: undefined, // Never send to student
        modelAnswer: undefined,
      }));
    }

    res.json({ submission, exam, questions, startedAt: submission.startedAt });
  } catch (err) { next(err); }
});

// PUT /api/submissions/:id/autosave
router.put('/:id/autosave', authenticate, async (req, res, next) => {
  try {
    const { answers } = req.body;
    const submission = await prisma.submission.update({
      where: { id: req.params.id },
      data: { answers, lastSavedAt: new Date() },
    });
    res.json({ lastSavedAt: submission.lastSavedAt });
  } catch (err) { next(err); }
});

// POST /api/submissions/:id/submit
router.post('/:id/submit', authenticate, async (req, res, next) => {
  try {
    const { answers, timePerQuestion } = req.body;
    const submissionId = req.params.id;

    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: { exam: { include: { settings: true, questions: true } } }
    });

    if (!submission) return res.status(404).json({ error: 'Submission not found' });
    if (submission.status !== 'DRAFT') return res.status(400).json({ error: 'Already submitted' });

    // Auto-grade MCQ
    let autoMarks = 0;
    const mcqQuestions = submission.exam.questions.filter(q => q.type === 'MCQ');
    for (const q of mcqQuestions) {
      const studentAnswer = answers?.[q.id];
      if (studentAnswer === q.correctAnswer) {
        autoMarks += q.marks;
      }
    }

    const hasWritten = submission.exam.questions.some(q => q.type !== 'MCQ');

    const updated = await prisma.submission.update({
      where: { id: submissionId },
      data: {
        answers,
        timePerQuestion,
        submittedAt: new Date(),
        marksObtained: hasWritten ? null : autoMarks,
        status: hasWritten ? 'SUBMITTED' : 'GRADED',
      }
    });

    // Clear exam session flag
    if (req.sessionId) {
      await prisma.session.update({ where: { id: req.sessionId }, data: { isExamSession: false } });
    }

    // Run plagiarism check async
    if (submission.exam.settings?.plagiarismCheck) {
      setImmediate(async () => {
        try {
          const { checkPlagiarism } = require('../services/plagiarism.service');
          await checkPlagiarism(submissionId, JSON.stringify(answers));
        } catch (_e) {}
      });
    }

    res.json({ submission: updated, autoGraded: !hasWritten, marks: hasWritten ? null : autoMarks });
  } catch (err) { next(err); }
});

// PUT /api/submissions/:id/grade
router.put('/:id/grade', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const { marksObtained, feedback } = req.body;

    const submission = await prisma.submission.findUnique({ where: { id: req.params.id } });
    if (submission?.flagStatus === 'FLAGGED') {
      return res.status(400).json({ error: 'Must resolve plagiarism flag before grading' });
    }

    const updated = await prisma.submission.update({
      where: { id: req.params.id },
      data: { marksObtained, feedback, status: 'GRADED' }
    });
    res.json({ submission: updated });
  } catch (err) { next(err); }
});

// PUT /api/submissions/:id/plagiarism-action
router.put('/:id/plagiarism-action', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const { action } = req.body; // grade_normally | mark_plagiarised | request_resubmission

    const data = { facultyAction: action };
    if (action === 'grade_normally') data.flagStatus = 'CLEARED';
    if (action === 'mark_plagiarised') { data.flagStatus = 'PLAGIARISED'; data.marksObtained = 0; data.status = 'GRADED'; }
    if (action === 'request_resubmission') data.flagStatus = 'CLEARED';

    const submission = await prisma.submission.update({ where: { id: req.params.id }, data });
    res.json({ submission });
  } catch (err) { next(err); }
});

// GET /api/exams/:id/submissions (faculty view)
router.get('/exams/:id/submissions', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const submissions = await prisma.submission.findMany({
      where: { examId: req.params.id },
      include: { student: { select: { firstName: true, lastName: true, user: { select: { userIdDisplay: true } } } } },
      orderBy: { submittedAt: 'asc' },
    });
    res.json({ submissions });
  } catch (err) { next(err); }
});

module.exports = router;
