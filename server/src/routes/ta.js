// server/src/routes/ta.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { adminOrTA } = require('../middleware/rbac');

async function computeBelowAttendance() {
  const students = await prisma.studentProfile.findMany({
    where: { user: { status: 'ACTIVE' } },
    select: { id: true, attendance: { select: { status: true } } },
  });
  let low = 0;
  for (const s of students) {
    if (s.attendance.length === 0) continue;
    const present = s.attendance.filter(a => a.status === 'PRESENT').length;
    const rate = (present / s.attendance.length) * 100;
    if (rate < 75) low++;
  }
  return low;
}

router.get('/stats', authenticate, adminOrTA, async (req, res, next) => {
  try {
    const [activeSubjects, exceptionsPending, marksOverdueSems] = await Promise.all([
      prisma.subject.count({ where: { status: 'active' } }),
      prisma.academicException.count({ where: { status: 'PENDING' } }),
      prisma.semester.findMany({
        where: { marksDeadline: { lt: new Date() }, status: 'ACTIVE' },
        select: { subjects: { select: { enrollments: { where: { resultStatus: 'PENDING' }, select: { id: true } } } } },
      }),
    ]);
    const marksOverdue = marksOverdueSems.reduce(
      (sum, sem) => sum + sem.subjects.reduce((a, sub) => a + sub.enrollments.length, 0),
      0
    );
    const belowAttendance = await computeBelowAttendance();
    res.json({ activeSubjects, marksOverdue, belowAttendance, exceptionsPending });
  } catch (err) { next(err); }
});

router.get('/pending-actions', authenticate, adminOrTA, async (req, res, next) => {
  try {
    const items = [];
    const excCount = await prisma.academicException.count({ where: { status: 'PENDING' } });
    if (excCount > 0) items.push({ type: 'exceptions', severity: 'high', description: `${excCount} academic exception${excCount === 1 ? '' : 's'} awaiting review`, link: '/ta/exceptions' });
    const unassigned = await prisma.subject.count({ where: { facultyId: null, status: 'active' } });
    if (unassigned > 0) items.push({ type: 'unassigned', severity: 'medium', description: `${unassigned} subject${unassigned === 1 ? '' : 's'} without faculty`, link: '/ta/assignments' });
    const revCount = await prisma.revaluation.count({ where: { status: 'pending' } });
    if (revCount > 0) items.push({ type: 'revaluation', severity: 'medium', description: `${revCount} revaluation request${revCount === 1 ? '' : 's'} pending`, link: '/ta/grades' });
    res.json({ items });
  } catch (err) { next(err); }
});

router.get('/grades', authenticate, adminOrTA, async (req, res, next) => {
  try {
    const { semesterId, batchId } = req.query;
    if (!semesterId) return res.status(400).json({ error: 'semesterId required' });
    const subjectsWhere = { semesterId };
    if (batchId) subjectsWhere.batchId = batchId;
    const subjects = await prisma.subject.findMany({
      where: subjectsWhere,
      select: { id: true, code: true, name: true, totalMarks: true, passMark: true, creditHours: true },
      orderBy: { code: 'asc' },
    });
    const subjectIds = subjects.map(s => s.id);
    const studentsWhere = batchId ? { batchId } : {};
    const students = await prisma.studentProfile.findMany({
      where: studentsWhere,
      select: {
        id: true, firstName: true, lastName: true,
        user: { select: { userIdDisplay: true } },
        enrollments: {
          where: { subjectId: { in: subjectIds } },
          select: { subjectId: true, iaMarks: true, eseMarks: true, resultStatus: true, subject: { select: { passMark: true, totalMarks: true, creditHours: true } } },
        },
      },
      orderBy: [{ firstName: 'asc' }],
    });

    // CGPA helper inline
    function gpaFromMarks(t, ps) {
      if (t < ps) return 0;
      const pct = (t / 100) * 100; // simplified
      if (pct >= 90) return 10;
      if (pct >= 80) return 9;
      if (pct >= 70) return 8;
      if (pct >= 60) return 7;
      if (pct >= 50) return 6;
      if (pct >= 45) return 5;
      return 4;
    }

    const studentRows = students.map(s => {
      const marks = {};
      let credits = 0, weighted = 0;
      for (const e of s.enrollments) {
        const t = (e.iaMarks ?? 0) + (e.eseMarks ?? 0);
        if (['PUBLISHED', 'PASS', 'FAIL'].includes(e.resultStatus)) {
          marks[e.subjectId] = t;
          credits += e.subject.creditHours;
          weighted += gpaFromMarks(t, e.subject.passMark) * e.subject.creditHours;
        }
      }
      const cgpa = credits > 0 ? (weighted / credits).toFixed(2) : null;
      return {
        id: s.id, firstName: s.firstName, lastName: s.lastName,
        userIdDisplay: s.user.userIdDisplay, marks, cgpa,
        cgpaGrade: cgpa >= 9 ? 'A+' : cgpa >= 8 ? 'A' : cgpa >= 7 ? 'B' : cgpa >= 5 ? 'C' : cgpa ? 'D' : null,
      };
    });

    res.json({
      subjects: subjects.map(s => ({ id: s.id, code: s.code, name: s.name, total: s.totalMarks, passmark: s.passMark })),
      students: studentRows,
    });
  } catch (err) { next(err); }
});

module.exports = router;
