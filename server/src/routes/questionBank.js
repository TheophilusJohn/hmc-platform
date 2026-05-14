// server/src/routes/questionBank.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { facultyOrAbove } = require('../middleware/rbac');

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
    const question = await prisma.questionBankItem.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json(question);
  } catch (err) { next(err); }
});

router.delete('/:id', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    await prisma.questionBankItem.update({
      where: { id: req.params.id },
      data: { isArchived: true },
    });
    res.json({ archived: true });
  } catch (err) { next(err); }
});

router.post('/exams/:id/questions/from-bank', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const { questionIds } = req.body;
    const bankItems = await prisma.questionBankItem.findMany({ where: { id: { in: questionIds } } });

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
    const { subjectId, difficulty, topic, count } = req.body;
    const where = { subjectId, isArchived: false };
    if (difficulty) where.difficulty = difficulty;
    if (topic) where.topic = { contains: topic, mode: 'insensitive' };

    const pool = await prisma.questionBankItem.findMany({ where });
    const shuffled = pool.sort(() => Math.random() - 0.5).slice(0, count || 10);

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
