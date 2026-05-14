// server/src/routes/marksheet.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { calculateCGPA } = require('../utils/cgpa');

// UGC 10-point grading — must match server/src/utils/cgpa.js GRADE_POINTS table.
// (Previously had a stray 'P' grade at 40-49% that didn't exist anywhere else
// in the codebase. The canonical scale is C for 40-49%, F below 40%.)
function gradeFromPercent(p) {
  if (p >= 90) return { grade: 'O', point: 10 };
  if (p >= 80) return { grade: 'A+', point: 9 };
  if (p >= 70) return { grade: 'A', point: 8 };
  if (p >= 60) return { grade: 'B+', point: 7 };
  if (p >= 50) return { grade: 'B', point: 6 };
  if (p >= 40) return { grade: 'C', point: 5 };
  return { grade: 'F', point: 0 };
}

function standingFromCgpa(cgpa) {
  if (cgpa >= 9) return 'Distinction';
  if (cgpa >= 7.5) return 'First Class';
  if (cgpa >= 6) return 'Second Class';
  if (cgpa >= 4) return 'Pass';
  return 'Below Pass';
}

async function buildMarksheet(studentId, semesterId) {
  const where = { studentId };
  if (semesterId) where.semesterId = semesterId;
  const enrollments = await prisma.studentSubjectEnrollment.findMany({
    where,
    include: { subject: true, semester: true },
    orderBy: [{ semester: { startDate: 'asc' } }, { subject: { code: 'asc' } }],
  });

  const subjects = enrollments.map(e => {
    const ia = e.iaMarks ?? null;
    const ese = e.eseMarks ?? null;
    const total = (ia ?? 0) + (ese ?? 0);
    const maxTotal = e.subject.totalMarks;
    const hasMarks = ia !== null || ese !== null;
    const pct = maxTotal > 0 && hasMarks ? (total / maxTotal) * 100 : null;
    const isPublished = e.resultStatus === 'PASS' || e.resultStatus === 'FAIL';
    let g = { grade: null, point: null };
    if (isPublished && hasMarks && pct !== null) {
      g = total < e.subject.passMark ? { grade: 'F', point: 0 } : gradeFromPercent(pct);
    }
    return {
      subjectId: e.subjectId,
      subjectCode: e.subject.code,
      subjectName: e.subject.name,
      creditHours: e.subject.creditHours,
      iaMarks: ia,
      eseMarks: ese,
      maxIa: e.subject.iaMarks,
      maxEse: e.subject.eseMarks,
      maxTotal: e.subject.totalMarks,
      passmark: e.subject.passMark,
      totalMarks: hasMarks ? total : null,
      grade: g.grade,
      gradePoint: g.point,
      resultStatus: e.resultStatus,
      semesterId: e.semesterId,
      semesterName: e.semester.name,
    };
  });

  // CGPA (all-time) — uses the canonical calculateCGPA helper which:
  //  • excludes CREDIT_TRANSFER and EX grades from the average,
  //  • drops PENDING enrollments (no grade yet),
  //  • replaces a failed-arrear F with a passing retake when one exists.
  // Pre-compute each enrollment's letter grade locally so the helper can read
  // `.grade` directly (it's the same grader as gradeFromPercent above).
  const cgpaSource = await prisma.studentSubjectEnrollment.findMany({
    where: { studentId },
    include: { subject: { select: { totalMarks: true, passMark: true, creditHours: true } } },
  });
  const cgpaInput = cgpaSource.map(e => {
    let grade = e.grade;
    if (!grade && (e.resultStatus === 'PASS' || e.resultStatus === 'FAIL')) {
      const t = (e.iaMarks ?? 0) + (e.eseMarks ?? 0);
      const pct = e.subject.totalMarks > 0 ? (t / e.subject.totalMarks) * 100 : 0;
      grade = (t < e.subject.passMark) ? 'F' : gradeFromPercent(pct).grade;
    }
    return {
      subjectId: e.subjectId,
      grade,
      isArrear: e.isArrear,
      creditHours: e.subject.creditHours,
      enrollmentType: e.enrollmentType,
    };
  });
  const cgpaNum = calculateCGPA(cgpaInput);
  const cgpa = cgpaNum > 0 ? cgpaNum.toFixed(2) : (cgpaInput.some(x => x.grade) ? cgpaNum.toFixed(2) : null);
  // credits earned = sum of credits across passing rows + transfer credits
  const cgpaCredits = cgpaInput.reduce((sum, x) => {
    if (x.enrollmentType === 'CREDIT_TRANSFER') return sum + (x.creditHours || 0);
    if (x.grade && x.grade !== 'F') return sum + (x.creditHours || 0);
    return sum;
  }, 0);

  // Semester GPA
  let semesterGpa = null;
  if (semesterId) {
    const semGraded = subjects.filter(s => s.gradePoint !== null);
    const semC = semGraded.reduce((a, s) => a + s.creditHours, 0);
    const semW = semGraded.reduce((a, s) => a + s.gradePoint * s.creditHours, 0);
    semesterGpa = semC > 0 ? (semW / semC).toFixed(2) : null;
  }

  return {
    subjects,
    cgpaSummary: {
      cgpa,
      semesterGpa,
      creditsCompleted: cgpaCredits,
      standing: cgpa ? standingFromCgpa(parseFloat(cgpa)) : null,
    },
  };
}

router.get('/latest', authenticate, async (req, res, next) => {
  try {
    const sp = await prisma.studentProfile.findUnique({ where: { userId: req.user.id } });
    if (!sp) return res.status(403).json({ error: 'Student account required' });
    const latest = await prisma.studentSubjectEnrollment.findFirst({
      where: { studentId: sp.id },
      orderBy: { semester: { startDate: 'desc' } },
      include: { semester: true },
    });
    if (!latest) return res.json({ subjects: [], cgpaSummary: {} });
    const data = await buildMarksheet(sp.id, latest.semesterId);
    res.json(data);
  } catch (err) { next(err); }
});

router.get('/', authenticate, async (req, res, next) => {
  try {
    const sp = await prisma.studentProfile.findUnique({ where: { userId: req.user.id } });
    if (!sp) return res.status(403).json({ error: 'Student account required' });
    const data = await buildMarksheet(sp.id, req.query.semesterId || null);
    res.json(data);
  } catch (err) { next(err); }
});

module.exports = router;
