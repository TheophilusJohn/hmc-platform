// server/src/routes/questionBank.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { facultyOrAbove } = require('../middleware/rbac');

// Returns the FacultyProfile for a user, or throws 403.
async function requireFaculty(user) {
  if (user.role === 'FULL_ADMIN' || user.role === 'TEACHER_ADMIN') return null; // admin bypass
  const fp = await prisma.facultyProfile.findFirst({ where: { userId: user.id } });
  if (!fp) throw Object.assign(new Error('Faculty profile required'), { status: 403 });
  return fp;
}

// True if the user is allowed to touch a given exam's questions
// (the exam's subject must be one the user teaches, unless admin).
async function canEditExamQuestions(user, examId) {
  if (user.role === 'FULL_ADMIN' || user.role === 'TEACHER_ADMIN') return true;
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { subject: { select: { facultyId: true } } },
  });
  if (!exam?.subject?.facultyId) return false;
  const fp = await prisma.facultyProfile.findFirst({
    where: { userId: user.id }, select: { id: true },
  });
  return !!fp && exam.subject.facultyId === fp.id;
}

router.get('/', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const { subjectId, topic, difficulty, type } = req.query;
    const where = { isArchived: false };

    if (req.user.role === 'FACULTY') {
      const fp = await prisma.facultyProfile.findFirst({ where: { userId: req.user.id } });
      if (fp) where.facultyId = fp.id;
    }
    if (subjectId) where.subjectId = subjectId;
    if (topic) where.topic = { contains: topic, mode: 'insensitive' };
    if (difficulty) where.difficulty = difficulty;
    if (type) where.type = type;

    const questions = await prisma.questionBankItem.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    res.json(questions);
  } catch (err) { next(err); }
});

router.post('/', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const fp = await prisma.facultyProfile.findFirst({ where: { userId: req.user.id } });
    if (!fp) return res.status(403).json({ error: 'Faculty profile required' });

    const question = await prisma.questionBankItem.create({
      data: { ...req.body, facultyId: fp.id, isArchived: false },
    });
    res.status(201).json(question);
  } catch (err) { next(err); }
});

router.put('/:id', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const fp = await requireFaculty(req.user);
    // Faculty can only edit their OWN bank items. Admins can edit any.
    if (fp) {
      const existing = await prisma.questionBankItem.findUnique({
        where: { id: req.params.id }, select: { facultyId: true },
      });
      if (!existing) return res.status(404).json({ error: 'Bank item not found' });
      if (existing.facultyId !== fp.id) return res.status(403).json({ error: 'Cannot edit another faculty\'s bank item' });
    }
    // Whitelist editable fields — never re-assign facultyId/subjectId via mass-assignment.
    const { questionText, type, options, correctAnswer, modelAnswer, topic, difficulty, isArchived } = req.body;
    const question = await prisma.questionBankItem.update({
      where: { id: req.params.id },
      data: {
        ...(questionText !== undefined && { questionText }),
        ...(type !== undefined && { type }),
        ...(options !== undefined && { options }),
        ...(correctAnswer !== undefined && { correctAnswer }),
        ...(modelAnswer !== undefined && { modelAnswer }),
        ...(topic !== undefined && { topic }),
        ...(difficulty !== undefined && { difficulty }),
        ...(isArchived !== undefined && { isArchived: !!isArchived }),
      },
    });
    res.json(question);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.delete('/:id', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const fp = await requireFaculty(req.user);
    if (fp) {
      const existing = await prisma.questionBankItem.findUnique({
        where: { id: req.params.id }, select: { facultyId: true },
      });
      if (!existing) return res.status(404).json({ error: 'Bank item not found' });
      if (existing.facultyId !== fp.id) return res.status(403).json({ error: 'Cannot archive another faculty\'s bank item' });
    }
    await prisma.questionBankItem.update({
      where: { id: req.params.id },
      data: { isArchived: true },
    });
    res.json({ archived: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.post('/exams/:id/questions/from-bank', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    // Authorize: must own (or be admin over) the exam's subject.
    if (!(await canEditExamQuestions(req.user, req.params.id))) {
      return res.status(403).json({ error: 'Not assigned to this subject' });
    }
    const exam = await prisma.exam.findUnique({
      where: { id: req.params.id }, select: { subjectId: true },
    });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    const { questionIds } = req.body;
    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      return res.status(400).json({ error: 'questionIds must be a non-empty array' });
    }

    // Only pull bank items that belong to the same subject as the exam.
    const bankItems = await prisma.questionBankItem.findMany({
      where: { id: { in: questionIds }, subjectId: exam.subjectId, isArchived: false },
    });
    if (bankItems.length === 0) {
      return res.status(400).json({ error: 'No matching bank items for this subject' });
    }

    const questions = await Promise.all(bankItems.map((bq, idx) =>
      prisma.question.create({
        data: {
          examId: req.params.id,
          type: bq.type,
          questionText: bq.questionText,
          marks: 5,
          options: bq.options,
          correctAnswer: bq.correctAnswer,
          partialMarksEnabled: false,
          modelAnswer: bq.modelAnswer,
          orderIndex: idx + 1,
        },
      })
    ));
    res.json(questions);
  } catch (err) { next(err); }
});

router.post('/exams/:id/questions/random-draw', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    if (!(await canEditExamQuestions(req.user, req.params.id))) {
      return res.status(403).json({ error: 'Not assigned to this subject' });
    }
    const exam = await prisma.exam.findUnique({
      where: { id: req.params.id }, select: { subjectId: true },
    });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    // Force the draw to the exam's own subject regardless of body input.
    const { difficulty, topic, count } = req.body;
    const requestedCount = Math.max(1, Math.min(50, parseInt(count, 10) || 10));
    const where = { subjectId: exam.subjectId, isArchived: false };
    if (difficulty) where.difficulty = difficulty;
    if (topic) where.topic = { contains: topic, mode: 'insensitive' };

    const pool = await prisma.questionBankItem.findMany({ where });
    const shuffled = pool.sort(() => Math.random() - 0.5).slice(0, requestedCount);

    const questions = await Promise.all(shuffled.map((bq, idx) =>
      prisma.question.create({
        data: {
          examId: req.params.id,
          type: bq.type,
          questionText: bq.questionText,
          marks: 5,
          options: bq.options,
          correctAnswer: bq.correctAnswer,
          partialMarksEnabled: false,
          modelAnswer: bq.modelAnswer,
          orderIndex: idx + 1,
        },
      })
    ));
    res.json(questions);
  } catch (err) { next(err); }
});

module.exports = router;
