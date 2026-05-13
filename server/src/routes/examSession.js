const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authenticate } = require('../middleware/auth');
const plagiarismService = require('../services/plagiarism.service');

// POST /api/exams/:id/start
router.post('/:id/start', authenticate, async (req, res, next) => {
  try {
    if (req.user.role !== 'student') return res.status(403).json({ error: 'Students only' });

    const exam = await prisma.exam.findUnique({
      where: { id: req.params.id },
      include: { settings: true, questions: { orderBy: { order_index: 'asc' } } },
    });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    const now = new Date();
    if (exam.start_datetime && now < exam.start_datetime) return res.status(400).json({ error: 'Exam window has not opened yet.' });
    if (exam.end_datetime && now > exam.end_datetime) return res.status(400).json({ error: 'Exam window has closed.' });

    // Check attempts
    const existing = await prisma.submission.findMany({
      where: { exam_id: req.params.id, student_id: req.user.id, status: { not: 'draft' } },
    });
    if (existing.length >= (exam.max_attempts || 1)) return res.status(400).json({ error: 'Maximum attempts reached.' });

    // Check for existing draft
    let draft = await prisma.submission.findFirst({
      where: { exam_id: req.params.id, student_id: req.user.id, status: 'draft' },
    });

    if (!draft) {
      let questions = exam.questions;
      if (exam.settings?.shuffle_questions) questions = questions.sort(() => Math.random() - 0.5);
      if (exam.settings?.shuffle_options) {
        questions = questions.map(q => ({ ...q, options: q.options ? [...q.options].sort(() => Math.random() - 0.5) : q.options }));
      }

      draft = await prisma.submission.create({
        data: {
          exam_id: req.params.id, student_id: req.user.id,
          attempt_number: existing.length + 1,
          answers: {}, status: 'draft',
          started_at: now, tab_switches: 0,
          time_per_question: {},
          questions_snapshot: questions,
        },
      });

      // Set exam session flag
      await prisma.session.updateMany({
        where: { user_id: req.user.id, expires_at: { gt: now } },
        data: { is_exam_session: true },
      });
    }

    res.json({ submission: draft, exam: { ...exam, questions: draft.questions_snapshot || exam.questions } });
  } catch (err) { next(err); }
});

// PUT /api/submissions/:id/autosave
router.put('/:id/autosave', authenticate, async (req, res, next) => {
  try {
    const { answers, time_per_question } = req.body;
    const submission = await prisma.submission.update({
      where: { id: req.params.id },
      data: { answers, time_per_question, last_saved_at: new Date() },
    });
    res.json({ saved: true, last_saved_at: submission.last_saved_at });
  } catch (err) { next(err); }
});

// POST /api/submissions/:id/flag — tab switch or browser event
router.post('/:id/flag', authenticate, async (req, res, next) => {
  try {
    const { reason } = req.body;
    const submission = await prisma.submission.findUnique({ where: { id: req.params.id } });
    const newSwitches = (submission.tab_switches || 0) + 1;

    const data = { tab_switches: newSwitches };
    if (newSwitches >= 3) {
      data.flag_status = 'flagged';
    }

    await prisma.submission.update({ where: { id: req.params.id }, data });
    res.json({ tab_switches: newSwitches, flagged: newSwitches >= 3 });
  } catch (err) { next(err); }
});

// POST /api/submissions/:id/similarity-check — real-time check during typing
router.post('/:id/similarity-check', authenticate, async (req, res, next) => {
  try {
    const { text, question_id } = req.body;
    if (!text || text.length < 50) return res.json({ score: 0 });

    const submission = await prisma.submission.findUnique({ where: { id: req.params.id } });
    const score = await plagiarismService.compareStudentToStudent(text, submission.exam_id);
    res.json({ score: Math.round(score) });
  } catch (err) { next(err); }
});

// POST /api/submissions/:id/submit — final submission
router.post('/:id/submit', authenticate, async (req, res, next) => {
  try {
    const { answers } = req.body;
    const submission = await prisma.submission.findUnique({
      where: { id: req.params.id },
      include: { exam: { include: { questions: true, settings: true } } },
    });

    if (submission.status !== 'draft') return res.status(400).json({ error: 'Submission already finalized.' });

    // Auto-grade MCQ
    let totalMarks = 0;
    const gradedAnswers = { ...answers };
    for (const q of submission.exam.questions) {
      if (q.type === 'mcq') {
        const studentAnswer = answers[q.id];
        const correct = q.correct_answer;
        if (studentAnswer === correct) totalMarks += q.marks;
        else if (Array.isArray(correct) && Array.isArray(studentAnswer)) {
          if (q.partial_marks_enabled) {
            const hits = studentAnswer.filter(a => correct.includes(a)).length;
            totalMarks += (hits / correct.length) * q.marks;
          } else if (JSON.stringify(studentAnswer.sort()) === JSON.stringify(correct.sort())) {
            totalMarks += q.marks;
          }
        }
      }
    }

    const allMCQ = submission.exam.questions.every(q => q.type === 'mcq');
    const status = allMCQ ? 'graded' : 'submitted';

    await prisma.submission.update({
      where: { id: req.params.id },
      data: { answers: gradedAnswers, marks_obtained: allMCQ ? totalMarks : null, status, submitted_at: new Date() },
    });

    // Clear exam session
    await prisma.session.updateMany({
      where: { user_id: req.user.id },
      data: { is_exam_session: false },
    });

    // Async plagiarism check for written answers
    if (!allMCQ && submission.exam.settings?.plagiarism_check) {
      const writtenTexts = Object.entries(answers)
        .filter(([qId]) => submission.exam.questions.find(q => q.id === qId && q.type === 'written'))
        .map(([, text]) => text).join('\n\n');

      if (writtenTexts) {
        plagiarismService.checkPlagiarism(req.params.id, writtenTexts).catch(err => console.error('Plagiarism check failed:', err));
      }
    }

    res.json({ submitted: true, status, marks: allMCQ ? totalMarks : null });
  } catch (err) { next(err); }
});

module.exports = router;
