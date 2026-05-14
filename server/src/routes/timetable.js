// server/src/routes/timetable.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { adminOrTA } = require('../middleware/rbac');

function flatten(s) {
  const fp = s.faculty?.facultyProfile;
  return {
    id: s.id,
    day: s.day,
    startTime: s.startTime,
    endTime: s.endTime,
    room: s.room,
    notes: s.notes,
    subjectId: s.subjectId,
    subjectCode: s.subject?.code,
    subjectName: s.subject?.name,
    facultyId: s.facultyId,
    facultyName: fp ? `${fp.firstName} ${fp.lastName}` : null,
    semesterId: s.semesterId,
    semesterName: s.semester?.name,
  };
}

router.get('/', authenticate, async (req, res, next) => {
  try {
    const { semesterId, subjectId, facultyId } = req.query;
    const where = {};
    if (semesterId) where.semesterId = semesterId;
    if (subjectId) where.subjectId = subjectId;
    if (facultyId) where.facultyId = facultyId;
    const slots = await prisma.timetableSlot.findMany({
      where,
      include: {
        subject: { select: { code: true, name: true } },
        faculty: { select: { facultyProfile: { select: { firstName: true, lastName: true } } } },
        semester: { select: { name: true } },
      },
      orderBy: [{ day: 'asc' }, { startTime: 'asc' }],
    });
    res.json({ slots: slots.map(flatten) });
  } catch (err) { next(err); }
});

router.get('/my', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;
    let slots = [];
    if (['FACULTY', 'TEACHER_ADMIN'].includes(req.user.role)) {
      slots = await prisma.timetableSlot.findMany({
        where: { facultyId: userId },
        include: {
          subject: { select: { code: true, name: true } },
          faculty: { select: { facultyProfile: { select: { firstName: true, lastName: true } } } },
          semester: { select: { name: true } },
        },
        orderBy: [{ day: 'asc' }, { startTime: 'asc' }],
      });
    } else if (req.user.role === 'STUDENT') {
      const sp = await prisma.studentProfile.findUnique({ where: { userId }, select: { batchId: true } });
      if (sp?.batchId) {
        slots = await prisma.timetableSlot.findMany({
          where: { subject: { batchId: sp.batchId } },
          include: {
            subject: { select: { code: true, name: true } },
            faculty: { select: { facultyProfile: { select: { firstName: true, lastName: true } } } },
            semester: { select: { name: true } },
          },
          orderBy: [{ day: 'asc' }, { startTime: 'asc' }],
        });
      }
    }
    res.json({ slots: slots.map(flatten) });
  } catch (err) { next(err); }
});

router.post('/', authenticate, adminOrTA, async (req, res, next) => {
  try {
    const { semesterId, subjectId, facultyId, day, startTime, endTime, room, notes } = req.body;
    if (!semesterId || !subjectId || !day || !startTime || !endTime) {
      return res.status(400).json({ error: 'semesterId, subjectId, day, startTime, endTime required' });
    }
    const slot = await prisma.timetableSlot.create({
      data: { semesterId, subjectId, facultyId: facultyId || null, day: day.toUpperCase(), startTime, endTime, room: room || null, notes: notes || null },
    });
    res.status(201).json({ slot });
  } catch (err) { next(err); }
});

router.put('/:id', authenticate, adminOrTA, async (req, res, next) => {
  try {
    const data = {};
    ['startTime', 'endTime', 'room', 'notes', 'facultyId', 'subjectId'].forEach(f => {
      if (req.body[f] !== undefined) data[f] = req.body[f];
    });
    if (req.body.day !== undefined) data.day = req.body.day.toUpperCase();
    const slot = await prisma.timetableSlot.update({ where: { id: req.params.id }, data });
    res.json({ slot });
  } catch (err) { next(err); }
});

router.delete('/:id', authenticate, adminOrTA, async (req, res, next) => {
  try {
    await prisma.timetableSlot.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
