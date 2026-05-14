const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { facultyOrAbove } = require('../middleware/rbac');

router.get('/active-students', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const students = await prisma.studentProfile.findMany({
      where: { user: { status: 'ACTIVE' }, studyMode: 'OFFLINE' },
      select: {
        id: true, firstName: true, lastName: true,
        user: { select: { userIdDisplay: true } },
        attendance: { select: { status: true } },
      },
      orderBy: [{ firstName: 'asc' }],
    });
    res.json({
      students: students.map(s => {
        const t = s.attendance.length;
        const p = s.attendance.filter(a => a.status === 'PRESENT').length;
        return {
          id: s.id, firstName: s.firstName, lastName: s.lastName,
          userIdDisplay: s.user.userIdDisplay,
          attendanceRate: t > 0 ? Math.round((p / t) * 100) : null,
        };
      }),
    });
  } catch (err) { next(err); }
});

router.get('/my-subjects', authenticate, async (req, res, next) => {
  try {
    if (req.user.role === 'STUDENT') {
      const sp = await prisma.studentProfile.findUnique({ where: { userId: req.user.id } });
      if (!sp) return res.json({ subjects: [] });
      const enrollments = await prisma.studentSubjectEnrollment.findMany({
        where: { studentId: sp.id },
        include: {
          subject: {
            include: {
              faculty: { select: { firstName: true, lastName: true } },
              units: { include: { contents: { select: { id: true } } } },
            },
          },
        },
      });
      const att = await prisma.attendance.groupBy({
        by: ['subjectId', 'status'], where: { studentId: sp.id }, _count: { _all: true },
      });
      const attMap = {};
      for (const a of att) {
        if (!attMap[a.subjectId]) attMap[a.subjectId] = { present: 0, total: 0 };
        attMap[a.subjectId].total += a._count._all;
        if (a.status === 'PRESENT') attMap[a.subjectId].present += a._count._all;
      }
      const subjects = enrollments.map(e => {
        const contentCount = e.subject.units.reduce((s, u) => s + u.contents.length, 0);
        const a = attMap[e.subject.id];
        return {
          id: e.subject.id, code: e.subject.code, name: e.subject.name,
          creditHours: e.subject.creditHours, examMode: e.subject.examMode,
          facultyName: e.subject.faculty ? `${e.subject.faculty.firstName} ${e.subject.faculty.lastName}` : null,
          contentCount,
          attendanceRate: a && a.total > 0 ? Math.round((a.present / a.total) * 100) : null,
        };
      });
      return res.json({ subjects });
    }
    res.json({ subjects: [] });
  } catch (err) { next(err); }
});

module.exports = router;
