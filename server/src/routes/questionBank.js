const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authenticate } = require('../middleware/auth');
const { facultyOrAbove } = require('../middleware/rbac');

// GET /api/question-bank
router.get('/', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const { subjectId, topic, difficulty, type } = req.query;
    const where = { is_archived: false };
    if (req.user.role === 'faculty') where.faculty_id = req.user.id;
    if (subjectId) where.subject_id = subjectId;
    if (topic) where.topic = { contains: topic, mode: 'insensitive' };
    if (difficulty) where.difficulty = difficulty;
    if (type) where.type = type;

    const questions = await prisma.questionBankItem.findMany({
      where, orderBy: { created_at: 'desc' },
    });
    res.json(questions);
  } catch (err) { next(err); }
});

// POST /api/question-bank
router.post('/', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const question = await prisma.questionBankItem.create({
      data: { ...req.body, faculty_id: req.user.id, is_archived: false },
    });
    res.status(201).json(question);
  } catch (err) { next(err); }
});

// PUT /api/question-bank/:id
router.put('/:id', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const question = await prisma.questionBankItem.update({ where: { id: req.params.id }, data: req.body });
    res.json(question);
  } catch (err) { next(err); }
});

// DELETE /api/question-bank/:id (archives)
router.delete('/:id', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    await prisma.questionBankItem.update({ where: { id: req.params.id }, data: { is_archived: true } });
    res.json({ archived: true });
  } catch (err) { next(err); }
});

// POST /api/exams/:id/questions/from-bank
router.post('/exams/:id/questions/from-bank', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const { questionIds } = req.body;
    const exam = await prisma.exam.findUnique({ where: { id: req.params.id } });
    const bankItems = await prisma.questionBankItem.findMany({ where: { id: { in: questionIds } } });

    const questions = await Promise.all(bankItems.map((bq, idx) =>
      prisma.question.create({
        data: {
          exam_id: req.params.id, type: bq.type, question_text: bq.question_text,
          marks: bq.marks || 5, options: bq.options, correct_answer: bq.correct_answer,
          partial_marks_enabled: false, model_answer: bq.model_answer,
          order_index: idx + 1,
        },
      })
    ));
    res.json(questions);
  } catch (err) { next(err); }
});

// POST /api/exams/:id/questions/random-draw
router.post('/exams/:id/questions/random-draw', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const { subjectId, difficulty, topic, count } = req.body;
    const where = { subject_id: subjectId, is_archived: false };
    if (difficulty) where.difficulty = difficulty;
    if (topic) where.topic = { contains: topic, mode: 'insensitive' };

    const pool = await prisma.questionBankItem.findMany({ where });
    const shuffled = pool.sort(() => Math.random() - 0.5).slice(0, count || 10);

    const questions = await Promise.all(shuffled.map((bq, idx) =>
      prisma.question.create({
        data: {
          exam_id: req.params.id, type: bq.type, question_text: bq.question_text,
          marks: bq.marks || 5, options: bq.options, correct_answer: bq.correct_answer,
          partial_marks_enabled: false, model_answer: bq.model_answer, order_index: idx + 1,
        },
      })
    ));
    res.json(questions);
  } catch (err) { next(err); }
});

module.exports = router;
