const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authenticate } = require('../middleware/auth');
const { facultyOrAbove, adminOrTA } = require('../middleware/rbac');

// GET /api/subjects/:id/attendance
router.get('/subjects/:id/attendance', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const { date, studentId } = req.query;
    const where = { subject_id: req.params.id };
    if (date) where.date = new Date(date);
    if (studentId) where.student_id = studentId;

    const records = await prisma.attendance.findMany({
      where,
      include: {
        student: { include: { student_profile: { select: { first_name: true, last_name: true } } } },
      },
      orderBy: [{ date: 'desc' }, { student: { student_profile: { last_name: 'asc' } } }],
    });
    res.json(records);
  } catch (err) { next(err); }
});

// POST /api/subjects/:id/attendance — bulk mark
router.post('/subjects/:id/attendance', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const { date, records, session_type = 'class' } = req.body;
    // Upsert each attendance record
    const result = await Promise.all(records.map(r =>
      prisma.attendance.upsert({
        where: { subject_id_student_id_date: { subject_id: req.params.id, student_id: r.student_id, date: new Date(date) } },
        create: { subject_id: req.params.id, student_id: r.student_id, date: new Date(date), status: r.status, marked_by: req.user.id, session_type },
        update: { status: r.status, marked_by: req.user.id },
      })
    ));
    res.json({ marked: result.length });
  } catch (err) { next(err); }
});

// PUT /api/attendance/:id
router.put('/:id', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const record = await prisma.attendance.update({ where: { id: req.params.id }, data: req.body });
    res.json(record);
  } catch (err) { next(err); }
});

// GET /api/subjects/:id/attendance/student/:studentId
router.get('/subjects/:id/attendance/student/:studentId', authenticate, async (req, res, next) => {
  try {
    if (req.user.role === 'student' && req.user.id !== req.params.studentId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const records = await prisma.attendance.findMany({
      where: { subject_id: req.params.id, student_id: req.params.studentId },
      orderBy: { date: 'asc' },
    });
    const total = records.length;
    const present = records.filter(r => r.status === 'present' || r.status === 'late').length;
    const percentage = total > 0 ? Math.round((present / total) * 100) : 0;
    res.json({ records, stats: { total, present, absent: total - present, percentage } });
  } catch (err) { next(err); }
});

// GET /api/attendance/chapel
router.get('/chapel', authenticate, adminOrTA, async (req, res, next) => {
  try {
    const { date, batchId } = req.query;
    const where = { session_type: 'chapel' };
    if (date) where.date = new Date(date);

    const records = await prisma.attendance.findMany({
      where,
      include: { student: { include: { student_profile: { select: { first_name: true, last_name: true } } } } },
      orderBy: { date: 'desc' },
    });
    res.json(records);
  } catch (err) { next(err); }
});

// POST /api/attendance/chapel/mark
router.post('/chapel/mark', authenticate, adminOrTA, async (req, res, next) => {
  try {
    const { date, records } = req.body;
    const result = await Promise.all(records.map(r =>
      prisma.attendance.upsert({
        where: { subject_id_student_id_date: { subject_id: 'chapel', student_id: r.student_id, date: new Date(date) } },
        create: { subject_id: 'chapel', student_id: r.student_id, date: new Date(date), status: r.status, marked_by: req.user.id, session_type: 'chapel' },
        update: { status: r.status },
      })
    ));
    res.json({ marked: result.length });
  } catch (err) { next(err); }
});

module.exports = router;
