const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { facultyOrAbove, requireRole } = require('../middleware/rbac');

function gradeFromCgpa(n) {
  if (n == null) return null;
  const v = parseFloat(n);
  if (v >= 9) return 'A+';
  if (v >= 8) return 'A';
  if (v >= 7) return 'B';
  if (v >= 6) return 'C';
  if (v >= 5) return 'D';
  return 'F';
}

function gpaFromMarks(t, ps, max) {
  if (t < ps) return 0;
  const pct = max > 0 ? (t / max) * 100 : 0;
  if (pct >= 90) return 10; if (pct >= 80) return 9; if (pct >= 70) return 8;
  if (pct >= 60) return 7; if (pct >= 50) return 6; if (pct >= 45) return 5; return 4;
}

router.get('/', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const { mine, search, batchId, studyMode } = req.query;
    const where = {};
    // FACULTY can ONLY see students they teach — the `mine` flag is mandatory
    // for that role. (Admin/TA can opt in with mine=true; otherwise see all.)
    const forceMine = req.user.role === 'FACULTY' || mine === 'true';
    if (forceMine) {
      const fp = await prisma.facultyProfile.findUnique({ where: { userId: req.user.id } });
      if (!fp) return res.json({ students: [] });
      where.enrollments = { some: { subject: { facultyId: fp.id } } };
    }
    if (batchId) where.batchId = batchId;
    if (studyMode) where.studyMode = studyMode.toUpperCase();
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { user: { userIdDisplay: { contains: search.toUpperCase() } } },
      ];
    }
    const students = await prisma.studentProfile.findMany({
      where,
      select: {
        id: true, firstName: true, lastName: true,
        user: { select: { id: true, userIdDisplay: true, email: true } },
        programme: { select: { name: true } },
        batch: { select: { name: true, currentYear: true } },
        attendance: { select: { status: true } },
        enrollments: {
          where: { resultStatus: { in: ['PASS', 'FAIL'] } },
          select: { iaMarks: true, eseMarks: true, subject: { select: { creditHours: true, totalMarks: true, passMark: true } } }
        },
      },
      orderBy: [{ firstName: 'asc' }],
      take: 200,
    });
    const flat = students.map(s => {
      const total = s.attendance.length;
      const present = s.attendance.filter(a => a.status === 'PRESENT' || a.status === 'LATE').length;
      let credits = 0, weighted = 0;
      for (const e of (s.enrollments || [])) {
        const t = (e.iaMarks ?? 0) + (e.eseMarks ?? 0);
        credits += e.subject.creditHours || 0;
        weighted += gpaFromMarks(t, e.subject.passMark, e.subject.totalMarks) * (e.subject.creditHours || 0);
      }
      const cgpa = credits > 0 ? (weighted / credits).toFixed(2) : null;
      return {
        id: s.id, firstName: s.firstName, lastName: s.lastName,
        userId: s.user.id, userIdDisplay: s.user.userIdDisplay, email: s.user.email,
        programmeName: s.programme?.name, batchName: s.batch?.name, currentYear: s.batch?.currentYear,
        attendanceRate: total > 0 ? Math.round((present / total) * 100) : null,
        cgpa, cgpaGrade: gradeFromCgpa(cgpa),
      };
    });
    res.json({ students: flat });
  } catch (err) { next(err); }
});

router.get('/:id/academic-summary', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const fp = await prisma.facultyProfile.findUnique({ where: { userId: req.user.id } });
    // FACULTY must have a profile to scope the query. Without one, the previous
    // ternary fell through to `{}` and returned every enrollment for the student.
    if (req.user.role === 'FACULTY' && !fp) {
      return res.status(403).json({ error: 'Faculty profile not found' });
    }
    const student = await prisma.studentProfile.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { userIdDisplay: true } },
        programme: { select: { name: true } },
        batch: { select: { name: true, currentYear: true } },
        enrollments: {
          where: req.user.role === 'FACULTY' ? { subject: { facultyId: fp.id } } : {},
          include: { subject: { select: { id: true, code: true, name: true, totalMarks: true, passMark: true, creditHours: true } } },
        },
        attendance: { select: { status: true } },
      },
    });
    if (!student) return res.status(404).json({ error: 'Not found' });
    const allEnr = await prisma.studentSubjectEnrollment.findMany({
      where: { studentId: student.id, resultStatus: { in: ['PASS', 'FAIL'] } },
      include: { subject: { select: { creditHours: true, totalMarks: true, passMark: true } } },
    });
    let credits = 0, weighted = 0;
    for (const e of allEnr) {
      const t = (e.iaMarks ?? 0) + (e.eseMarks ?? 0);
      credits += e.subject.creditHours;
      weighted += gpaFromMarks(t, e.subject.passMark, e.subject.totalMarks) * e.subject.creditHours;
    }
    const cgpa = credits > 0 ? (weighted / credits).toFixed(2) : null;
    const t = student.attendance.length;
    const p = student.attendance.filter(a => a.status === 'PRESENT').length;
    res.json({
      id: student.id, firstName: student.firstName, lastName: student.lastName,
      userIdDisplay: student.user.userIdDisplay,
      programme: student.programme?.name, year: student.batch?.currentYear,
      studyMode: student.studyMode, cgpa,
      attendanceRate: t > 0 ? Math.round((p / t) * 100) : null,
      marks: student.enrollments.map(e => ({
        subjectId: e.subjectId, subjectName: e.subject.name, subjectCode: e.subject.code,
        marks: e.iaMarks !== null || e.eseMarks !== null ? (e.iaMarks ?? 0) + (e.eseMarks ?? 0) : null,
        totalMarks: e.subject.totalMarks, passmark: e.subject.passMark,
      })),
    });
  } catch (err) { next(err); }
});


// GET /api/students/:id/ledger - admin Finance view
// FACULTY has no business seeing fee ledgers; restrict to admin/TA/admissions.
router.get('/:id/ledger', authenticate, requireRole('FULL_ADMIN', 'TEACHER_ADMIN', 'ADMISSIONS_OFFICER'), async (req, res, next) => {
  try {
    const sp = await prisma.studentProfile.findUnique({ where: { id: req.params.id } });
    if (!sp) return res.status(404).json({ error: 'Student not found' });

    const entries = await prisma.studentFeeLedger.findMany({
      where: { studentId: sp.id }, orderBy: { createdAt: 'asc' },
    });
    const feeTypeIds = [...new Set(entries.map(e => e.feeTypeId).filter(Boolean))];
    const semIds = [...new Set(entries.map(e => e.semesterId).filter(Boolean))];
    const [feeTypes, sems] = await Promise.all([
      feeTypeIds.length ? prisma.feeType.findMany({ where: { id: { in: feeTypeIds } }, select: { id: true, name: true } }) : [],
      semIds.length ? prisma.semester.findMany({ where: { id: { in: semIds } }, select: { id: true, name: true } }) : [],
    ]);
    const feeTypeMap = Object.fromEntries(feeTypes.map(f => [f.id, f.name]));
    const semMap = Object.fromEntries(sems.map(s => [s.id, s.name]));

    const semesterGroups = {};
    for (const e of entries) {
      const semKey = e.semesterId || 'general';
      const semName = semMap[e.semesterId] || 'General';
      if (!semesterGroups[semKey]) semesterGroups[semKey] = { id: semKey, name: semName, entries: [], balance: 0 };
      const amount = Number(e.amount || 0);
      const waived = Number(e.waivedAmount || 0);
      const balance = Number(e.balance || 0);
      const paid = Math.max(0, amount - balance - waived);
      const status = balance === 0 ? (waived > 0 && paid === 0 ? 'waived' : 'paid') : paid > 0 ? 'partial' : 'unpaid';
      semesterGroups[semKey].balance += balance;
      semesterGroups[semKey].entries.push({
        id: e.id,
        feeName: feeTypeMap[e.feeTypeId] || e.description || 'Fee',
        amount, waivedAmount: waived, paid, balance, status,
      });
    }

    res.json({ semesters: Object.values(semesterGroups) });
  } catch (err) { next(err); }
});

module.exports = router;
