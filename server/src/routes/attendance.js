// server/src/routes/attendance.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { facultyOrAbove, adminOrTA } = require('../middleware/rbac');
const { canAccessSubject } = require('../middleware/subjectAccess');

// Reject attendance dates in the future (1-minute clock skew tolerance)
function rejectFutureDate(dateInput) {
  if (!dateInput) return null;
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return 'Invalid date';
  if (d.getTime() > Date.now() + 60 * 1000) return 'Attendance cannot be marked for a future date';
  return null;
}

router.get('/subjects/:id/attendance', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    if (!(await canAccessSubject(req.user, req.params.id))) {
      return res.status(403).json({ error: 'You do not teach this subject' });
    }
    const { date, studentId } = req.query;
    const where = { subjectId: req.params.id };
    if (date) where.date = new Date(date);
    if (studentId) where.studentId = studentId;

    const records = await prisma.attendance.findMany({
      where,
      include: { student: { select: { firstName: true, lastName: true } } },
      orderBy: [{ date: 'desc' }],
    });
    res.json(records);
  } catch (err) { next(err); }
});

router.post('/subjects/:id/attendance', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const { date, records, sessionType = 'CLASS' } = req.body;
    const dateErr = rejectFutureDate(date);
    if (dateErr) return res.status(400).json({ error: dateErr });
    if (!(await canAccessSubject(req.user, req.params.id))) {
      return res.status(403).json({ error: 'You do not teach this subject' });
    }
    const fp = await prisma.facultyProfile.findFirst({ where: { userId: req.user.id } });

    const result = await Promise.all(records.map(r =>
      prisma.attendance.upsert({
        where: {
          subjectId_studentId_date_sessionType: {
            subjectId: req.params.id,
            studentId: r.studentId,
            date: new Date(date),
            sessionType,
          }
        },
        create: {
          subjectId: req.params.id,
          studentId: r.studentId,
          date: new Date(date),
          status: r.status,
          markedById: fp?.id,
          sessionType,
        },
        update: { status: r.status, markedById: fp?.id },
      })
    ));
    res.json({ marked: result.length });
  } catch (err) { next(err); }
});

router.put('/:id', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const existing = await prisma.attendance.findUnique({
      where: { id: req.params.id }, select: { subjectId: true },
    });
    if (!existing) return res.status(404).json({ error: 'Attendance record not found' });
    // For class attendance (subjectId present), require the actor to teach the subject.
    // For chapel (subjectId null), only admin/TA may edit.
    if (existing.subjectId) {
      if (!await canAccessSubject(req.user, existing.subjectId)) {
        return res.status(403).json({ error: 'Not assigned to this subject' });
      }
    } else if (!['FULL_ADMIN', 'TEACHER_ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only admin/TA can edit chapel attendance' });
    }
    // Whitelist editable fields — never let the caller rewrite subjectId/studentId/date.
    const { status, sessionType, notes } = req.body;
    const data = {};
    if (status !== undefined) data.status = String(status).toUpperCase();
    if (sessionType !== undefined) data.sessionType = String(sessionType).toUpperCase();
    if (notes !== undefined) data.notes = notes;
    const record = await prisma.attendance.update({ where: { id: req.params.id }, data });
    res.json(record);
  } catch (err) { next(err); }
});

router.get('/subjects/:id/attendance/student/:studentId', authenticate, async (req, res, next) => {
  try {
    if (req.user.role === 'STUDENT') {
      const sp = await prisma.studentProfile.findFirst({ where: { userId: req.user.id } });
      if (!sp || sp.id !== req.params.studentId) return res.status(403).json({ error: 'Forbidden' });
    }
    const records = await prisma.attendance.findMany({
      where: { subjectId: req.params.id, studentId: req.params.studentId },
      orderBy: { date: 'asc' },
    });
    const total = records.length;
    const present = records.filter(r => r.status === 'PRESENT' || r.status === 'LATE').length;
    const percentage = total > 0 ? Math.round((present / total) * 100) : 0;
    res.json({ records, stats: { total, present, absent: total - present, percentage } });
  } catch (err) { next(err); }
});

router.get('/chapel', authenticate, adminOrTA, async (req, res, next) => {
  try {
    const { date } = req.query;
    const where = { sessionType: 'CHAPEL' };
    if (date) where.date = new Date(date);

    const records = await prisma.attendance.findMany({
      where,
      include: { student: { select: { firstName: true, lastName: true } } },
      orderBy: { date: 'desc' },
    });
    res.json(records);
  } catch (err) { next(err); }
});


// POST /api/attendance/class - bulk mark class attendance (matches frontend)
router.post('/class', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const { subjectId, date, records } = req.body;
    if (!subjectId) return res.status(400).json({ error: 'subjectId required' });
    if (!date) return res.status(400).json({ error: 'date required' });
    const dateErr = rejectFutureDate(date);
    if (dateErr) return res.status(400).json({ error: dateErr });
    if (!(await canAccessSubject(req.user, subjectId))) {
      return res.status(403).json({ error: 'You do not teach this subject' });
    }
    const fp = await prisma.facultyProfile.findFirst({ where: { userId: req.user.id } });
    const normalize = (s) => {
      const u = String(s || '').toUpperCase();
      if (u === 'HOLIDAY') return 'EXCUSED';
      return ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'].includes(u) ? u : 'ABSENT';
    };
    let marked = 0;
    for (const r of (records || [])) {
      try {
        await prisma.attendance.upsert({
          where: {
            subjectId_studentId_date_sessionType: {
              subjectId, studentId: r.studentId,
              date: new Date(date), sessionType: 'CLASS',
            }
          },
          create: {
            subjectId, studentId: r.studentId, date: new Date(date),
            status: normalize(r.status), sessionType: 'CLASS', markedById: fp?.id,
          },
          update: { status: normalize(r.status), markedById: fp?.id },
        });
        marked++;
      } catch (e) {
        console.warn('attendance upsert failed for', r.studentId, e.message);
      }
    }
    res.json({ marked });
  } catch (err) { next(err); }
});

// POST /api/attendance/chapel - bulk mark chapel attendance
router.post('/chapel', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const { date, records } = req.body;
    if (!date) return res.status(400).json({ error: 'date required' });
    const dateErr = rejectFutureDate(date);
    if (dateErr) return res.status(400).json({ error: dateErr });
    const fp = await prisma.facultyProfile.findFirst({ where: { userId: req.user.id } });
    const normalize = (s) => {
      const u = String(s || '').toUpperCase();
      if (u === 'HOLIDAY') return 'EXCUSED';
      return ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'].includes(u) ? u : 'ABSENT';
    };
    let marked = 0;
    for (const r of (records || [])) {
      try {
        const existing = await prisma.attendance.findFirst({
          where: { studentId: r.studentId, date: new Date(date), sessionType: 'CHAPEL' }
        });
        if (existing) {
          await prisma.attendance.update({
            where: { id: existing.id },
            data: { status: normalize(r.status), markedById: fp?.id }
          });
        } else {
          await prisma.attendance.create({
            data: {
              studentId: r.studentId, date: new Date(date),
              status: normalize(r.status), sessionType: 'CHAPEL', markedById: fp?.id,
            }
          });
        }
        marked++;
      } catch (e) {
        console.warn('chapel attendance failed for', r.studentId, e.message);
      }
    }
    res.json({ marked });
  } catch (err) { next(err); }
});

module.exports = router;
