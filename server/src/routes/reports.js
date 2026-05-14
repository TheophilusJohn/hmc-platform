// server/src/routes/reports.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { adminOnly, facultyOrAbove } = require('../middleware/rbac');

// Helper: calculate CGPA from enrollments. Returns null (not 0) when the
// student has no graded enrollments yet — pre-fix 0 was indistinguishable
// from "actual CGPA of 0", which flagged every new student as at-risk.
function calculateCGPA(enrollments) {
  const graded = enrollments.filter(e =>
    e.cgpaPoints !== null && (e.resultStatus === 'PASS' || e.resultStatus === 'FAIL')
  );
  if (graded.length === 0) return null;
  let totalPoints = 0, totalCredits = 0;
  for (const e of graded) {
    const credits = e.subject?.creditHours || 1;
    totalPoints += (e.cgpaPoints || 0) * credits;
    totalCredits += credits;
  }
  return totalCredits > 0 ? +(totalPoints / totalCredits).toFixed(2) : null;
}

// GET /api/reports/academic/marksheet/:studentId
router.get('/academic/marksheet/:studentId', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const enrollments = await prisma.studentSubjectEnrollment.findMany({
      where: { studentId: req.params.studentId },
      include: { subject: { include: { semester: true, programme: true } } },
      orderBy: [{ subject: { semester: { academicYear: 'asc' } } }],
    });

    const bySemester = {};
    for (const e of enrollments) {
      const key = e.subject.semesterId;
      if (!bySemester[key]) bySemester[key] = { semester: e.subject.semester, subjects: [], sgpa: 0 };
      bySemester[key].subjects.push(e);
    }
    res.json(Object.values(bySemester));
  } catch (err) { next(err); }
});

// GET /api/reports/academic/batch/:batchId
router.get('/academic/batch/:batchId', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const { semesterId } = req.query;
    const subjects = await prisma.subject.findMany({
      where: { batchId: req.params.batchId, ...(semesterId ? { semesterId } : {}) },
      include: { enrollments: { select: { totalMarks: true, grade: true, resultStatus: true } } },
    });

    const report = subjects.map(s => {
      const marks = s.enrollments.map(e => e.totalMarks).filter(v => v !== null);
      const avg = marks.length ? marks.reduce((a, b) => a + b, 0) / marks.length : 0;
      const grades = s.enrollments.reduce((acc, e) => { if (e.grade) acc[e.grade] = (acc[e.grade] || 0) + 1; return acc; }, {});
      return {
        subject: { id: s.id, name: s.name, code: s.code },
        students: s.enrollments.length,
        average: Math.round(avg * 10) / 10,
        highest: marks.length ? Math.max(...marks) : 0,
        lowest: marks.length ? Math.min(...marks) : 0,
        passRate: s.enrollments.length ? Math.round((s.enrollments.filter(e => e.resultStatus === 'PASS').length / s.enrollments.length) * 100) : 0,
        gradeDistribution: grades,
      };
    });
    res.json(report);
  } catch (err) { next(err); }
});

// GET /api/reports/academic/programme-progress/:programmeId
router.get('/academic/programme-progress/:programmeId', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const students = await prisma.user.findMany({
      where: { role: 'STUDENT', status: 'ACTIVE', studentProfile: { programmeId: req.params.programmeId } },
      include: {
        studentProfile: {
          select: {
            id: true, firstName: true, lastName: true,
            enrollments: { include: { subject: { select: { creditHours: true } } } },
          }
        },
      },
    });

    const atRiskThreshold = 5.0;
    const studentData = students.map(s => {
      const cgpa = calculateCGPA(s.studentProfile?.enrollments || []);
      const arrears = (s.studentProfile?.enrollments || []).filter(e => e.resultStatus === 'FAIL').length;
      return {
        id: s.id, name: `${s.studentProfile?.firstName || ''} ${s.studentProfile?.lastName || ''}`.trim(),
        cgpa, arrears, status: cgpa >= atRiskThreshold ? 'on_track' : 'at_risk',
      };
    });

    res.json({
      total: students.length,
      onTrack: studentData.filter(s => s.status === 'on_track').length,
      atRisk: studentData.filter(s => s.status === 'at_risk').length,
      students: studentData,
    });
  } catch (err) { next(err); }
});

// GET /api/reports/financial/summary
router.get('/financial/summary', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const dateFilter = {};
    if (dateFrom) dateFilter.gte = new Date(dateFrom);
    if (dateTo) dateFilter.lte = new Date(dateTo);

    const payments = await prisma.payment.findMany({
      where: { status: 'confirmed', ...(Object.keys(dateFilter).length ? { paidAt: dateFilter } : {}) },
    });

    // Treat missing/unrecognized currency as INR (schema default) rather than silently dropping the row.
    const isUSD = p => p.currency === 'USD';
    const totalUSD = payments.filter(isUSD).reduce((sum, p) => sum + Number(p.amount), 0);
    const totalINR = payments.filter(p => !isUSD(p)).reduce((sum, p) => sum + Number(p.amount), 0);

    const outstandingINR = await prisma.studentFeeLedger.aggregate({
      _sum: { balance: true },
      where: { status: { in: ['UNPAID', 'PARTIAL'] }, currency: 'INR' },
    });
    const outstandingUSD = await prisma.studentFeeLedger.aggregate({
      _sum: { balance: true },
      where: { status: { in: ['UNPAID', 'PARTIAL'] }, currency: 'USD' },
    });

    res.json({
      collected: { inr: totalINR, usd: totalUSD },
      outstanding: { inr: Number(outstandingINR._sum.balance || 0), usd: Number(outstandingUSD._sum.balance || 0) },
      paymentCount: payments.length,
    });
  } catch (err) { next(err); }
});

// GET /api/reports/financial/outstanding
router.get('/financial/outstanding', authenticate, adminOnly, async (req, res, next) => {
  try {
    const students = await prisma.studentFeeLedger.groupBy({
      by: ['studentId'],
      _sum: { balance: true },
      where: { status: { in: ['UNPAID', 'PARTIAL'] } },
      orderBy: { _sum: { balance: 'desc' } },
    });
    res.json(students);
  } catch (err) { next(err); }
});

// GET /api/reports/admissions/pipeline
router.get('/admissions/pipeline', authenticate, adminOnly, async (req, res, next) => {
  try {
    // Single groupBy instead of 8 sequential counts.
    const stages = ['RECEIVED', 'DOCS_REVIEW', 'INTERVIEW_SCHEDULED', 'INTERVIEW_DONE', 'WAITLISTED', 'ACCEPTED', 'ENROLLED', 'REJECTED'];
    const grouped = await prisma.applicant.groupBy({
      by: ['pipelineStage'],
      _count: { _all: true },
    });
    const map = Object.fromEntries(grouped.map(g => [g.pipelineStage, g._count._all]));
    const counts = stages.map(s => ({ stage: s, count: map[s] || 0 }));
    res.json(counts);
  } catch (err) { next(err); }
});

// GET /api/reports/attendance/below-threshold
router.get('/attendance/below-threshold', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const threshold = 75;
    const flagged = await prisma.$queryRaw`
      SELECT a."studentId", a."subjectId",
        COUNT(*)::int as total,
        SUM(CASE WHEN a.status IN ('PRESENT','LATE') THEN 1 ELSE 0 END)::int as present,
        ROUND(SUM(CASE WHEN a.status IN ('PRESENT','LATE') THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 1) as percentage
      FROM "Attendance" a
      GROUP BY a."studentId", a."subjectId"
      HAVING ROUND(SUM(CASE WHEN a.status IN ('PRESENT','LATE') THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 1) < ${threshold}
    `;
    res.json(flagged);
  } catch (err) { next(err); }
});

// GET /api/reports/at-risk
router.get('/at-risk', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const students = await prisma.user.findMany({
      where: { role: 'STUDENT', status: 'ACTIVE' },
      include: {
        studentProfile: {
          select: {
            firstName: true, lastName: true,
            enrollments: { include: { subject: { select: { creditHours: true } } } },
          }
        },
      },
    });

    const atRisk = students
      .map(s => {
        const cgpa = calculateCGPA(s.studentProfile?.enrollments || []);
        return {
          id: s.id, userIdDisplay: s.userIdDisplay,
          name: `${s.studentProfile?.firstName || ''} ${s.studentProfile?.lastName || ''}`.trim(),
          cgpa, flags: ['low_cgpa'],
        };
      })
      .filter(s => s.cgpa < 5.0);

    res.json(atRisk);
  } catch (err) { next(err); }
});

module.exports = router;
