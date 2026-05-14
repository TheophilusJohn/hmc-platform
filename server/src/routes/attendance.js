// server/src/routes/attendance.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { facultyOrAbove, adminOrTA } = require('../middleware/rbac');
const { canAccessSubject } = require('../middleware/subjectAccess');

// Normalize a YYYY-MM-DD input into an IST-anchored UTC Date that lands on
// the correct calendar day in IST. Attendance.date is `@db.Date` (date-only),
// so passing a JS Date that resolves to a different UTC calendar date than
// the intended IST day silently shifts the record.
function toAttendanceDate(input) {
  if (!input) return null;
  // Accept YYYY-MM-DD literally (treat as IST date) or ISO. Strip time and TZ
  // by extracting Y/M/D in IST, then anchor to IST midnight in UTC space.
  let y, m, d;
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    [y, m, d] = input.split('-').map(Number);
  } else {
    const dt = new Date(input);
    if (isNaN(dt.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(dt).reduce((a, p) => (a[p.type] = p.value, a), {});
    y = Number(parts.year); m = Number(parts.month); d = Number(parts.day);
  }
  return new Date(Date.UTC(y, m - 1, d, -5, -30, 0));
}

// Reject attendance dates in the future (1-minute clock skew tolerance).
// "Future" is judged against IST end-of-day so a faculty marking class on the
// same IST calendar day doesn't get rejected for crossing a UTC midnight.
function rejectFutureDate(dateInput) {
  if (!dateInput) return null;
  const d = toAttendanceDate(dateInput);
  if (!d) return 'Invalid date';
  // End of the IST day that 'today' falls in:
  const nowParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).reduce((a, p) => (a[p.type] = p.value, a), {});
  const endOfTodayIst = new Date(Date.UTC(Number(nowParts.year), Number(nowParts.month) - 1, Number(nowParts.day) + 1, -5, -30, 0));
  if (d.getTime() > endOfTodayIst.getTime() + 60 * 1000) return 'Attendance cannot be marked for a future date';
  return null;
}

router.get('/subjects/:id/attendance', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    if (!(await canAccessSubject(req.user, req.params.id))) {
      return res.status(403).json({ error: 'You do not teach this subject' });
    }
    const { date, studentId } = req.query;
    const where = { subjectId: req.params.id };
    if (date) where.date = toAttendanceDate(date);
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

    // Wrap the whole class's upserts in a transaction so a single bad row
    // doesn't leave half the class marked and half not. Also avoids saturating
    // the connection pool with parallel upserts.
    const result = await prisma.$transaction(
      records.map(r =>
        prisma.attendance.upsert({
          where: {
            subjectId_studentId_date_sessionType: {
              subjectId: req.params.id,
              studentId: r.studentId,
              date: toAttendanceDate(date),
              sessionType,
            }
          },
          create: {
            subjectId: req.params.id,
            studentId: r.studentId,
            date: toAttendanceDate(date),
            status: r.status,
            markedById: fp?.id,
            sessionType,
          },
          update: { status: r.status, markedById: fp?.id },
        })
      )
    );
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
    if (date) where.date = toAttendanceDate(date);

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
    // All-or-nothing transaction — pre-fix the sequential `await` loop ate
    // failures (silently skipping students) and was N round-trips for an N-student class.
    const ops = (records || []).map(r => prisma.attendance.upsert({
      where: {
        subjectId_studentId_date_sessionType: {
          subjectId, studentId: r.studentId,
          date: toAttendanceDate(date), sessionType: 'CLASS',
        }
      },
      create: {
        subjectId, studentId: r.studentId, date: toAttendanceDate(date),
        status: normalize(r.status), sessionType: 'CLASS', markedById: fp?.id,
      },
      update: { status: normalize(r.status), markedById: fp?.id },
    }));
    const result = await prisma.$transaction(ops);
    res.json({ marked: result.length });
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
    // Chapel attendance has subjectId NULL, so we can't use the @@unique
    // composite (Postgres treats NULL as distinct). Build a 2-query upsert
    // per row, but batch as a transaction so the whole class succeeds or fails.
    const records2 = records || [];
    const existing = await prisma.attendance.findMany({
      where: {
        studentId: { in: records2.map(r => r.studentId) },
        date: toAttendanceDate(date),
        sessionType: 'CHAPEL',
      },
      select: { id: true, studentId: true },
    });
    const existingByStudent = new Map(existing.map(e => [e.studentId, e.id]));
    const ops = records2.map(r => {
      const id = existingByStudent.get(r.studentId);
      return id
        ? prisma.attendance.update({
            where: { id },
            data: { status: normalize(r.status), markedById: fp?.id },
          })
        : prisma.attendance.create({
            data: {
              studentId: r.studentId, date: toAttendanceDate(date),
              status: normalize(r.status), sessionType: 'CHAPEL', markedById: fp?.id,
            },
          });
    });
    const result = await prisma.$transaction(ops);
    res.json({ marked: result.length });
  } catch (err) { next(err); }
});

module.exports = router;
