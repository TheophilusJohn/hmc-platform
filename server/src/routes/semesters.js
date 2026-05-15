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

// Parse a date input strictly: only accept ISO 8601 forms so "2025" alone
// doesn't silently become Jan 1, and `null` propagates explicitly when missing.
function parseStrictDate(input, field) {
  if (input === undefined || input === null || input === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}/.test(String(input))) {
    throw Object.assign(new Error(`${field} must be an ISO date (YYYY-MM-DD)`), { status: 400 });
  }
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) {
    throw Object.assign(new Error(`${field} is not a valid date`), { status: 400 });
  }
  return d;
}

router.post('/', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { name, type, academicYear, startDate, endDate, marksDeadline, batchId } = req.body;
    const start = parseStrictDate(startDate, 'startDate');
    const end = parseStrictDate(endDate, 'endDate');
    if (!start || !end) return res.status(400).json({ error: 'startDate and endDate are required' });
    const semester = await prisma.semester.create({
      data: {
        name, type, academicYear,
        startDate: start,
        endDate: end,
        marksDeadline: parseStrictDate(marksDeadline, 'marksDeadline'),
        batchId,
        status: 'DRAFT',
      },
    });
    res.status(201).json(semester);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.put('/:id', authenticate, adminOrTA, async (req, res, next) => {
  try {
    const { name, startDate, endDate, marksDeadline, status } = req.body;
    const semester = await prisma.semester.update({
      where: { id: req.params.id },
      data: {
        name,
        startDate: startDate ? parseStrictDate(startDate, 'startDate') : undefined,
        endDate: endDate ? parseStrictDate(endDate, 'endDate') : undefined,
        marksDeadline: marksDeadline ? parseStrictDate(marksDeadline, 'marksDeadline') : undefined,
        status,
      },
    });
    res.json(semester);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
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
    if (!sourceId) return res.status(400).json({ error: 'sourceId is required' });

    // Target and source must share the same batch (and therefore the same
    // programme). Otherwise copying carries the source's batchId/programmeId
    // into a target that belongs to a different batch — orphaning subjects.
    const [source, target] = await Promise.all([
      prisma.semester.findUnique({ where: { id: sourceId }, select: { batchId: true, batch: { select: { programmeId: true } } } }),
      prisma.semester.findUnique({ where: { id: req.params.id }, select: { batchId: true, batch: { select: { programmeId: true } } } }),
    ]);
    if (!source || !target) return res.status(404).json({ error: 'Source or target semester not found' });
    if (source.batchId !== target.batchId) {
      return res.status(400).json({ error: 'Cross-batch copy is not allowed — source and target semesters must belong to the same batch.' });
    }

    const sourceSubjects = await prisma.subject.findMany({ where: { semesterId: sourceId } });

    // Remap programmeId/batchId from the target to guarantee referential cohesion
    // even if source rows were created mismatched.
    const created = await prisma.$transaction(sourceSubjects.map(s =>
      prisma.subject.create({
        data: {
          name: s.name, code: s.code, creditHours: s.creditHours, type: s.type,
          eseMarks: s.eseMarks, iaMarks: s.iaMarks, totalMarks: s.totalMarks,
          passMark: s.passMark, examMode: s.examMode,
          programmeId: target.batch.programmeId,
          batchId: target.batchId,
          semesterId: req.params.id, status: 'active',
        },
      })
    ));
    res.json({ copied: created.length, subjects: created });
  } catch (err) { next(err); }
});


router.delete('/:id', authenticate, adminOnly, async (req, res, next) => {
  try {
    const sem = await prisma.semester.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { subjects: true, enrollments: true, ledgerEntries: true, installmentPlans: true } } },
    });
    if (!sem) return res.status(404).json({ error: 'Semester not found' });
    if (sem.status === 'ACTIVE' || sem.status === 'EXAM') {
      return res.status(400).json({ error: 'Cannot delete an active/exam semester. Archive it first.' });
    }
    // Pre-empt the FK error rather than relying on Prisma to bounce it.
    const c = sem._count || {};
    if ((c.subjects || 0) + (c.enrollments || 0) + (c.ledgerEntries || 0) + (c.installmentPlans || 0) > 0) {
      return res.status(400).json({
        error: `Cannot delete: semester still has ${c.subjects || 0} subject(s), ${c.enrollments || 0} enrollment(s), ${c.ledgerEntries || 0} ledger entry(ies), ${c.installmentPlans || 0} installment plan(s).`,
      });
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
