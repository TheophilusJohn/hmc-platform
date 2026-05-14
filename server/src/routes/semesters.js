// server/src/routes/semesters.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { adminOrTA, adminOnly } = require('../middleware/rbac');

router.get('/', authenticate, async (req, res, next) => {
  try {
    const { batchId, status } = req.query;
    const where = {};
    if (batchId) where.batchId = batchId;
    if (status) where.status = status;

    const semesters = await prisma.semester.findMany({
      where,
      include: {
        batch: { include: { programme: true } },
        subjects: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ academicYear: 'desc' }, { type: 'asc' }],
    });
    // Wrap per project convention (CLAUDE.md): lists as {semesters:[...]}.
    res.json({ semesters });
  } catch (err) { next(err); }
});

router.post('/', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { name, type, academicYear, startDate, endDate, marksDeadline, batchId } = req.body;
    const semester = await prisma.semester.create({
      data: {
        name, type, academicYear,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        marksDeadline: marksDeadline ? new Date(marksDeadline) : null,
        batchId,
        status: 'DRAFT',
      },
    });
    res.status(201).json(semester);
  } catch (err) { next(err); }
});

router.put('/:id', authenticate, adminOrTA, async (req, res, next) => {
  try {
    const { name, startDate, endDate, marksDeadline, status } = req.body;
    const semester = await prisma.semester.update({
      where: { id: req.params.id },
      data: {
        name,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        marksDeadline: marksDeadline ? new Date(marksDeadline) : undefined,
        status,
      },
    });
    res.json(semester);
  } catch (err) { next(err); }
});

router.post('/:id/activate', authenticate, adminOrTA, async (req, res, next) => {
  try {
    const semester = await prisma.semester.update({ where: { id: req.params.id }, data: { status: 'ACTIVE' } });
    res.json(semester);
  } catch (err) { next(err); }
});

router.post('/:id/archive', authenticate, adminOnly, async (req, res, next) => {
  try {
    const semester = await prisma.semester.update({ where: { id: req.params.id }, data: { status: 'ARCHIVED' } });
    res.json(semester);
  } catch (err) { next(err); }
});

router.post('/:id/copy-setup', authenticate, adminOrTA, async (req, res, next) => {
  try {
    const { sourceId } = req.body;
    const sourceSubjects = await prisma.subject.findMany({ where: { semesterId: sourceId } });

    const created = await Promise.all(sourceSubjects.map(s =>
      prisma.subject.create({
        data: {
          name: s.name, code: s.code, creditHours: s.creditHours, type: s.type,
          eseMarks: s.eseMarks, iaMarks: s.iaMarks, totalMarks: s.totalMarks,
          passMark: s.passMark, examMode: s.examMode,
          programmeId: s.programmeId, batchId: s.batchId,
          semesterId: req.params.id, status: 'active',
        },
      })
    ));
    res.json({ copied: created.length, subjects: created });
  } catch (err) { next(err); }
});


router.delete('/:id', authenticate, adminOnly, async (req, res, next) => {
  try {
    const sem = await prisma.semester.findUnique({ where: { id: req.params.id } });
    if (!sem) return res.status(404).json({ error: 'Semester not found' });
    if (sem.status === 'ACTIVE' || sem.status === 'EXAM') {
      return res.status(400).json({ error: 'Cannot delete an active/exam semester. Archive it first.' });
    }
    await prisma.semester.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'P2003' || err.code === 'P2014') {
      return res.status(400).json({ error: 'Cannot delete: semester has subjects, exams, or enrollments.' });
    }
    next(err);
  }
});

module.exports = router;
