const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authenticate } = require('../middleware/auth');
const { adminOrTA, adminOnly } = require('../middleware/rbac');

// GET /api/semesters
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { batchId, status, programmeId } = req.query;
    const where = {};
    if (batchId) where.batch_id = batchId;
    if (status) where.status = status;

    const semesters = await prisma.semester.findMany({
      where,
      include: {
        batch: { include: { programme: true } },
        subjects: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ academic_year: 'desc' }, { type: 'asc' }],
    });
    res.json(semesters);
  } catch (err) { next(err); }
});

// POST /api/semesters
router.post('/', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { name, type, academic_year, start_date, end_date, marks_deadline, batch_id } = req.body;
    const semester = await prisma.semester.create({
      data: { name, type, academic_year, start_date: new Date(start_date), end_date: new Date(end_date), marks_deadline: marks_deadline ? new Date(marks_deadline) : null, batch_id, status: 'draft' },
    });
    res.status(201).json(semester);
  } catch (err) { next(err); }
});

// PUT /api/semesters/:id
router.put('/:id', authenticate, adminOrTA, async (req, res, next) => {
  try {
    const { name, start_date, end_date, marks_deadline, status } = req.body;
    const semester = await prisma.semester.update({
      where: { id: req.params.id },
      data: { name, start_date: start_date ? new Date(start_date) : undefined, end_date: end_date ? new Date(end_date) : undefined, marks_deadline: marks_deadline ? new Date(marks_deadline) : undefined, status },
    });
    res.json(semester);
  } catch (err) { next(err); }
});

// POST /api/semesters/:id/activate
router.post('/:id/activate', authenticate, adminOrTA, async (req, res, next) => {
  try {
    const semester = await prisma.semester.update({ where: { id: req.params.id }, data: { status: 'active' } });
    res.json(semester);
  } catch (err) { next(err); }
});

// POST /api/semesters/:id/archive
router.post('/:id/archive', authenticate, adminOnly, async (req, res, next) => {
  try {
    const semester = await prisma.semester.update({ where: { id: req.params.id }, data: { status: 'archived' } });
    res.json(semester);
  } catch (err) { next(err); }
});

// POST /api/semesters/:id/copy-setup
router.post('/:id/copy-setup', authenticate, adminOrTA, async (req, res, next) => {
  try {
    const { sourceId } = req.body;
    const sourceSubjects = await prisma.subject.findMany({ where: { semester_id: sourceId } });
    const semester = await prisma.semester.findUnique({ where: { id: req.params.id } });

    const created = await Promise.all(sourceSubjects.map(s =>
      prisma.subject.create({
        data: {
          name: s.name, code: s.code, credit_hours: s.credit_hours, type: s.type,
          ese_marks: s.ese_marks, ia_marks: s.ia_marks, total_marks: s.total_marks,
          pass_mark: s.pass_mark, exam_mode: s.exam_mode,
          programme_id: s.programme_id, batch_id: s.batch_id,
          semester_id: req.params.id, status: 'draft',
        },
      })
    ));
    res.json({ copied: created.length, subjects: created });
  } catch (err) { next(err); }
});

module.exports = router;
