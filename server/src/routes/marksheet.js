// server/src/routes/marksheet.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');

// UGC 10-point grading
function gradeFromPercent(p) {
  if (p >= 90) return { grade: 'O', point: 10 };
  if (p >= 80) return { grade: 'A+', point: 9 };
  if (p >= 70) return { grade: 'A', point: 8 };
  if (p >= 60) return { grade: 'B+', point: 7 };
  if (p >= 50) return { grade: 'B', point: 6 };
  if (p >= 45) return { grade: 'C', point: 5 };
  if (p >= 40) return { grade: 'P', point: 4 };
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

  // CGPA (all-time)
  const allEnrollments = await prisma.studentSubjectEnrollment.findMany({
    where: { studentId, resultStatus: { in: ['PASS', 'FAIL'] } },
    include: { subject: { select: { totalMarks: true, passMark: true, creditHours: true } } },
  });
  let cgpaCredits = 0, cgpaWeighted = 0;
  for (const e of allEnrollments) {
    const t = (e.iaMarks ?? 0) + (e.eseMarks ?? 0);
    const pct = e.subject.totalMarks > 0 ? (t / e.subject.totalMarks) * 100 : 0;
    const g = t < e.subject.passMark ? { point: 0 } : gradeFromPercent(pct);
    cgpaCredits += e.subject.creditHours;
    cgpaWeighted += g.point * e.subject.creditHours;
  }
  const cgpa = cgpaCredits > 0 ? (cgpaWeighted / cgpaCredits).toFixed(2) : null;

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
