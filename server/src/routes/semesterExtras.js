const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { adminOnly } = require('../middleware/rbac');

// Strict ISO-date parse — `new Date("2025")` produces Jan 1 silently, which is
// almost never what the caller meant. Insist on YYYY-MM-DD.
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

// POST /api/semesters — intercept and normalize before falling through is not possible for POST.
// This handler fully owns Semester creation.
// GET / — return semesters in {semesters: [...]} shape for frontend
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { batchId, status, search } = req.query;
    const where = {};
    if (batchId) where.batchId = batchId;
    if (status) where.status = String(status).toUpperCase();
    if (search) where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { academicYear: { contains: search } },
    ];
    const semesters = await prisma.semester.findMany({
      where,
      include: { batch: { select: { name: true, programme: { select: { name: true } } } } },
      orderBy: [{ startDate: 'desc' }],
    });
    const flat = semesters.map(s => ({
      ...s,
      batchName: s.batch ? (s.batch.programme?.name ? `${s.batch.programme.name} – ${s.batch.name}` : s.batch.name) : '',
    }));
    res.json({ semesters: flat });
  } catch (err) { next(err); }
});

router.post('/', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { name, type, academicYear, startDate, endDate, marksDeadline, batchId, status } = req.body;
    if (!name || !type || !academicYear || !startDate || !endDate || !batchId) {
      return res.status(400).json({ error: 'name, type, academicYear, startDate, endDate, and batchId are required' });
    }
    const normalizedType = String(type).toUpperCase();
    if (!['ODD', 'EVEN'].includes(normalizedType)) {
      return res.status(400).json({ error: 'type must be ODD or EVEN' });
    }
    const normalizedStatus = String(status || 'DRAFT').toUpperCase();
    if (!['DRAFT', 'ACTIVE', 'EXAM', 'ARCHIVED'].includes(normalizedStatus)) {
      return res.status(400).json({ error: 'invalid status' });
    }
    const semester = await prisma.semester.create({
      data: {
        name,
        type: normalizedType,
        academicYear,
        startDate: parseStrictDate(startDate, 'startDate'),
        endDate: parseStrictDate(endDate, 'endDate'),
        marksDeadline: parseStrictDate(marksDeadline, 'marksDeadline'),
        batchId,
        status: normalizedStatus,
      },
    });
    res.status(201).json({ semester });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.put('/:id', authenticate, adminOnly, async (req, res, next) => {
  try {
    const data = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if (req.body.type !== undefined) data.type = String(req.body.type).toUpperCase();
    if (req.body.academicYear !== undefined) data.academicYear = req.body.academicYear;
    if (req.body.startDate !== undefined) data.startDate = parseStrictDate(req.body.startDate, 'startDate');
    if (req.body.endDate !== undefined) data.endDate = parseStrictDate(req.body.endDate, 'endDate');
    if (req.body.marksDeadline !== undefined) data.marksDeadline = req.body.marksDeadline ? parseStrictDate(req.body.marksDeadline, 'marksDeadline') : null;
    if (req.body.status !== undefined) data.status = String(req.body.status).toUpperCase();
    const semester = await prisma.semester.update({ where: { id: req.params.id }, data });
    res.json({ semester });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

module.exports = router;
