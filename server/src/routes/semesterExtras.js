const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { adminOnly } = require('../middleware/rbac');

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
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        marksDeadline: marksDeadline ? new Date(marksDeadline) : null,
        batchId,
        status: normalizedStatus,
      },
    });
    res.status(201).json({ semester });
  } catch (err) { next(err); }
});

router.put('/:id', authenticate, adminOnly, async (req, res, next) => {
  try {
    const data = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if (req.body.type !== undefined) data.type = String(req.body.type).toUpperCase();
    if (req.body.academicYear !== undefined) data.academicYear = req.body.academicYear;
    if (req.body.startDate !== undefined) data.startDate = new Date(req.body.startDate);
    if (req.body.endDate !== undefined) data.endDate = new Date(req.body.endDate);
    if (req.body.marksDeadline !== undefined) data.marksDeadline = req.body.marksDeadline ? new Date(req.body.marksDeadline) : null;
    if (req.body.status !== undefined) data.status = String(req.body.status).toUpperCase();
    const semester = await prisma.semester.update({ where: { id: req.params.id }, data });
    res.json({ semester });
  } catch (err) { next(err); }
});

module.exports = router;
