// server/src/routes/ta.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { adminOrTA } = require('../middleware/rbac');

async function computeBelowAttendance() {
  const students = await prisma.studentProfile.findMany({
    where: { user: { status: 'ACTIVE' } },
    select: {
      id: true,
      batchId: true,
      attendance: { select: { status: true } },
    },
  });
  // Only count students whose batch has had any attendance recorded — a brand-new
  // batch shouldn't show every student as "below attendance" before any classes
  // happen. Conversely, a student in an active batch with zero personal records
  // means they've been absent every session that was marked.
  // Determine "active" batches: at least one student in the batch has attendance.
  const batchesWithAttendance = new Set();
  for (const s of students) {
    if (s.attendance.length > 0 && s.batchId) batchesWithAttendance.add(s.batchId);
  }
  let low = 0;
  for (const s of students) {
    // Skip if the student's batch has no recorded attendance at all (= no
    // classes happened yet) so a new batch doesn't flag everyone immediately.
    if (!s.batchId || !batchesWithAttendance.has(s.batchId)) continue;
    const present = s.attendance.filter(a => a.status === 'PRESENT' || a.status === 'LATE').length;
    const total = s.attendance.length;
    // A student with zero personal records in an active batch counts as 0%.
    const rate = total === 0 ? 0 : (present / total) * 100;
    if (rate < 75) low++;
  }
  return low;
}

router.get('/stats', authenticate, adminOrTA, async (req, res, next) => {
  try {
    // NOTE: AcademicException model is not yet in schema — pending feature.
    // See server/src/routes/exceptions.js stub. Report 0 to keep dashboard tile
    // alive instead of crashing the whole route.
    const [activeSubjects, marksOverdueSems] = await Promise.all([
      prisma.subject.count({ where: { status: 'active' } }),
      prisma.semester.findMany({
        where: { marksDeadline: { lt: new Date() }, status: 'ACTIVE' },
        select: { subjects: { select: { enrollments: { where: { resultStatus: 'PENDING' }, select: { id: true } } } } },
      }),
    ]);
    const exceptionsPending = 0;
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
    // AcademicException model not yet in schema — skip until enabled.
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

    // CGPA helper — scale marks to subject's own totalMarks, NOT a hard-coded 100.
    function gpaFromMarks(totalScored, totalMarks, passMark) {
      if (!totalMarks || totalMarks <= 0) return 0;
      if (totalScored < passMark) return 0;
      const pct = (totalScored / totalMarks) * 100;
      if (pct >= 90) return 10;
      if (pct >= 80) return 9;
      if (pct >= 70) return 8;
      if (pct >= 60) return 7;
      if (pct >= 50) return 6;
      if (pct >= 40) return 5;
      return 0;
    }

    const studentRows = students.map(s => {
      const marks = {};
      let credits = 0, weighted = 0;
      for (const e of s.enrollments) {
        const t = (e.iaMarks ?? 0) + (e.eseMarks ?? 0);
        // ResultStatus enum is PASS|FAIL|PENDING|WITHHELD — 'PUBLISHED' is not valid.
        if (['PASS', 'FAIL'].includes(e.resultStatus)) {
          marks[e.subjectId] = t;
          credits += e.subject.creditHours;
          weighted += gpaFromMarks(t, e.subject.totalMarks, e.subject.passMark) * e.subject.creditHours;
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
