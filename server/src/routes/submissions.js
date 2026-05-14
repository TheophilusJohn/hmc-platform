// server/src/routes/submissions.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { requireRole, facultyOrAbove } = require('../middleware/rbac');
const { canAccessSubject } = require('../middleware/subjectAccess');

// Normalize an MCQ answer (string OR array OR JSON string of array) into a
// sorted set of trimmed strings, then compare for set-equality. This handles
// both single-correct ("A") and multi-correct (["A","C"] or '["A","C"]') cases.
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

// Helper: verify the calling student owns the submission
async function studentOwnsSubmission(user, submissionId) {
  if (user.role !== 'STUDENT') return false;
  const sub = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: { student: { select: { userId: true } } },
  });
  return sub?.student?.userId === user.id;
}

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

    // Wrap the attempt-count + existing-draft check + create in a single
    // $transaction so two concurrent /start requests can't both pass the
    // checks and end up creating two DRAFTs for the same student/exam.
    const submission = await prisma.$transaction(async (tx) => {
      const existing = await tx.submission.findFirst({
        where: { examId, studentId: studentProfile.id, status: 'DRAFT' },
      });
      if (existing) return { row: existing, resumed: true };

      const attempts = await tx.submission.count({
        where: { examId, studentId: studentProfile.id, status: { not: 'DRAFT' } },
      });
      if (attempts >= exam.maxAttempts) {
        throw Object.assign(new Error('Maximum attempts reached'), { status: 400 });
      }
      const created = await tx.submission.create({
        data: {
          examId,
          studentId: studentProfile.id,
          attemptNumber: attempts + 1,
          status: 'DRAFT',
          answers: {},
        },
      });
      return { row: created, resumed: false };
    });
    if (submission.resumed) return res.json({ submission: submission.row, resumed: true });

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

    res.json({ submission: submission.row, exam, questions, startedAt: submission.row.startedAt });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// PUT /api/submissions/:id/autosave - only the owning student can autosave
router.put('/:id/autosave', authenticate, requireRole('STUDENT'), async (req, res, next) => {
  try {
    if (!(await studentOwnsSubmission(req.user, req.params.id))) {
      return res.status(403).json({ error: 'This submission is not yours' });
    }
    const { answers } = req.body;
    // Refuse autosave after submit — scoped updateMany so a concurrent submit
    // that flipped status won't be clobbered by a stale autosave.
    const result = await prisma.submission.updateMany({
      where: { id: req.params.id, status: 'DRAFT' },
      data: { answers, lastSavedAt: new Date() },
    });
    if (result.count === 0) {
      return res.status(409).json({ error: 'Submission has been finalized; autosave ignored.' });
    }
    res.json({ lastSavedAt: new Date() });
  } catch (err) { next(err); }
});

// POST /api/submissions/:id/submit - only the owning student can submit
router.post('/:id/submit', authenticate, requireRole('STUDENT'), async (req, res, next) => {
  try {
    if (!(await studentOwnsSubmission(req.user, req.params.id))) {
      return res.status(403).json({ error: 'This submission is not yours' });
    }
    const { answers, timePerQuestion } = req.body;
    const submissionId = req.params.id;

    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: { exam: { include: { settings: true, questions: true } } }
    });

    if (!submission) return res.status(404).json({ error: 'Submission not found' });
    if (submission.status !== 'DRAFT') return res.status(400).json({ error: 'Already submitted' });

    // Auto-grade MCQ. `correctAnswer` may be a string (single-correct) or a JSON
    // array (multi-correct); `studentAnswer` may also be a string or array.
    // Normalize both sides to a sorted set of strings and compare set-equality.
    let autoMarks = 0;
    const mcqQuestions = submission.exam.questions.filter(q => q.type === 'MCQ');
    for (const q of mcqQuestions) {
      if (mcqIsCorrect(answers?.[q.id], q.correctAnswer)) {
        autoMarks += q.marks;
      }
    }

    const hasWritten = submission.exam.questions.some(q => q.type !== 'MCQ');

    // Scoped update: only transition from DRAFT. If a concurrent submit raced
    // ahead, this updateMany affects zero rows and we surface a 409 instead
    // of double-flipping status/marks.
    const txResult = await prisma.submission.updateMany({
      where: { id: submissionId, status: 'DRAFT' },
      data: {
        answers,
        timePerQuestion,
        submittedAt: new Date(),
        marksObtained: hasWritten ? null : autoMarks,
        status: hasWritten ? 'SUBMITTED' : 'GRADED',
      }
    });
    if (txResult.count === 0) {
      return res.status(409).json({ error: 'Submission was already submitted by another request.' });
    }
    const updated = await prisma.submission.findUnique({ where: { id: submissionId } });

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

// PUT /api/submissions/:id/grade - faculty must teach the subject, marks must be in range
router.put('/:id/grade', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const { marksObtained, feedback } = req.body;

    const submission = await prisma.submission.findUnique({
      where: { id: req.params.id },
      include: { exam: { select: { totalMarks: true, subjectId: true } } },
    });
    if (!submission) return res.status(404).json({ error: 'Submission not found' });
    if (!(await canAccessSubject(req.user, submission.exam.subjectId))) {
      return res.status(403).json({ error: 'You do not teach this subject' });
    }
    if (submission.flagStatus === 'FLAGGED') {
      return res.status(400).json({ error: 'Must resolve plagiarism flag before grading' });
    }
    // Parse once and pass the validated value through — pre-fix the write used
    // `parseFloat(marksObtained)` on the raw body again, so a null/undefined
    // input would write NaN to the column.
    let marksValue = null;
    if (marksObtained !== null && marksObtained !== undefined) {
      const m = parseFloat(marksObtained);
      if (isNaN(m) || m < 0) return res.status(400).json({ error: 'Marks must be a non-negative number' });
      if (m > submission.exam.totalMarks) {
        return res.status(400).json({ error: `Marks cannot exceed exam total (${submission.exam.totalMarks})` });
      }
      marksValue = m;
    }

    const updated = await prisma.submission.update({
      where: { id: req.params.id },
      data: { marksObtained: marksValue, feedback, status: 'GRADED' },
    });
    res.json({ submission: updated });
  } catch (err) { next(err); }
});

// PUT /api/submissions/:id/plagiarism-action - only the teaching faculty
router.put('/:id/plagiarism-action', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const sub = await prisma.submission.findUnique({
      where: { id: req.params.id },
      include: { exam: { select: { subjectId: true } } },
    });
    if (!sub) return res.status(404).json({ error: 'Submission not found' });
    if (!(await canAccessSubject(req.user, sub.exam.subjectId))) {
      return res.status(403).json({ error: 'You do not teach this subject' });
    }

    const { action } = req.body; // grade_normally | mark_plagiarised | request_resubmission

    const data = { facultyAction: action };
    if (action === 'grade_normally') data.flagStatus = 'CLEARED';
    if (action === 'mark_plagiarised') { data.flagStatus = 'PLAGIARISED'; data.marksObtained = 0; data.status = 'GRADED'; }
    if (action === 'request_resubmission') data.flagStatus = 'CLEARED';

    const submission = await prisma.submission.update({ where: { id: req.params.id }, data });
    res.json({ submission });
  } catch (err) { next(err); }
});

// GET /api/exams/:id/submissions (faculty view) - only the teaching faculty
router.get('/exams/:id/submissions', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const exam = await prisma.exam.findUnique({ where: { id: req.params.id }, select: { subjectId: true } });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    if (!(await canAccessSubject(req.user, exam.subjectId))) {
      return res.status(403).json({ error: 'You do not teach this subject' });
    }
    const submissions = await prisma.submission.findMany({
      where: { examId: req.params.id },
      include: { student: { select: { firstName: true, lastName: true, user: { select: { userIdDisplay: true } } } } },
      orderBy: { submittedAt: 'asc' },
    });
    res.json({ submissions });
  } catch (err) { next(err); }
});

module.exports = router;
