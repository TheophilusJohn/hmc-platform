const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authenticate } = require('../middleware/auth');
const { adminOnly, facultyOrAbove } = require('../middleware/rbac');

const getFilters = (query) => {
  const { semesterId, batchId, programmeId, studentId, dateFrom, dateTo, studyMode } = query;
  return { semesterId, batchId, programmeId, studentId, dateFrom, dateTo, studyMode };
};

// GET /api/reports/academic/marksheet/:studentId
router.get('/academic/marksheet/:studentId', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const enrollments = await prisma.studentSubjectEnrollment.findMany({
      where: { student_id: req.params.studentId },
      include: {
        subject: { include: { semester: true, programme: true } },
      },
      orderBy: [{ subject: { semester: { academic_year: 'asc' } } }],
    });

    // Group by semester
    const bySemester = {};
    for (const e of enrollments) {
      const key = e.subject.semester_id;
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
      where: { batch_id: req.params.batchId, ...(semesterId ? { semester_id: semesterId } : {}) },
      include: {
        enrollments: { select: { total_marks: true, grade: true, result_status: true } },
      },
    });

    const report = subjects.map(s => {
      const marks = s.enrollments.map(e => e.total_marks).filter(Boolean);
      const avg = marks.length ? marks.reduce((a, b) => a + b, 0) / marks.length : 0;
      const grades = s.enrollments.reduce((acc, e) => { acc[e.grade] = (acc[e.grade] || 0) + 1; return acc; }, {});
      return {
        subject: { id: s.id, name: s.name, code: s.code },
        students: s.enrollments.length,
        average: Math.round(avg * 10) / 10,
        highest: Math.max(...marks, 0),
        lowest: Math.min(...marks, 0),
        pass_rate: s.enrollments.length ? Math.round((s.enrollments.filter(e => e.result_status === 'pass').length / s.enrollments.length) * 100) : 0,
        grade_distribution: grades,
      };
    });
    res.json(report);
  } catch (err) { next(err); }
});

// GET /api/reports/academic/programme-progress/:programmeId
router.get('/academic/programme-progress/:programmeId', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const students = await prisma.user.findMany({
      where: { role: 'student', status: 'active', student_profile: { programme_id: req.params.programmeId } },
      include: {
        student_profile: { select: { first_name: true, last_name: true, cgpa: true } },
        enrollments: { select: { result_status: true, grade: true } },
      },
    });

    const atRiskThreshold = 5.0;
    const onTrack = students.filter(s => (s.student_profile?.cgpa || 0) >= atRiskThreshold);
    const atRisk = students.filter(s => (s.student_profile?.cgpa || 0) < atRiskThreshold);

    res.json({ total: students.length, on_track: onTrack.length, at_risk: atRisk.length, students: students.map(s => ({
      id: s.id, name: `${s.student_profile?.first_name} ${s.student_profile?.last_name}`, cgpa: s.student_profile?.cgpa || 0,
      arrears: s.enrollments.filter(e => e.result_status === 'fail').length, status: (s.student_profile?.cgpa || 0) >= atRiskThreshold ? 'on_track' : 'at_risk',
    })) });
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
      where: { status: 'completed', ...(Object.keys(dateFilter).length ? { paid_at: dateFilter } : {}) },
    });

    const inr = payments.filter(p => p.currency === 'INR');
    const usd = payments.filter(p => p.currency === 'USD');
    const totalINR = inr.reduce((sum, p) => sum + Number(p.amount), 0);
    const totalUSD = usd.reduce((sum, p) => sum + Number(p.amount), 0);

    const outstanding = await prisma.studentFeeLedger.aggregate({
      _sum: { balance: true },
      where: { status: { in: ['unpaid', 'partial'] }, currency: 'INR' },
    });
    const outstandingUSD = await prisma.studentFeeLedger.aggregate({
      _sum: { balance: true },
      where: { status: { in: ['unpaid', 'partial'] }, currency: 'USD' },
    });

    res.json({
      collected: { inr: totalINR, usd: totalUSD },
      outstanding: { inr: outstanding._sum.balance || 0, usd: outstandingUSD._sum.balance || 0 },
      payment_count: payments.length,
    });
  } catch (err) { next(err); }
});

// GET /api/reports/financial/outstanding
router.get('/financial/outstanding', authenticate, adminOnly, async (req, res, next) => {
  try {
    const students = await prisma.studentFeeLedger.groupBy({
      by: ['student_id'],
      _sum: { balance: true },
      where: { status: { in: ['unpaid', 'partial'] } },
      orderBy: { _sum: { balance: 'desc' } },
    });
    res.json(students);
  } catch (err) { next(err); }
});

// GET /api/reports/admissions/pipeline
router.get('/admissions/pipeline', authenticate, adminOnly, async (req, res, next) => {
  try {
    const stages = ['received', 'docs_review', 'interview_scheduled', 'interview_done', 'waitlisted', 'accepted', 'enrolled', 'rejected'];
    const counts = await Promise.all(stages.map(async s => ({
      stage: s,
      count: await prisma.applicant.count({ where: { pipeline_stage: s } }),
    })));
    res.json(counts);
  } catch (err) { next(err); }
});

// GET /api/reports/attendance/below-threshold
router.get('/attendance/below-threshold', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const threshold = 75; // configurable
    // Get all student-subject pairs with < threshold attendance
    const flagged = await prisma.$queryRaw`
      SELECT a.student_id, a.subject_id,
        COUNT(*) as total,
        SUM(CASE WHEN a.status IN ('present','late') THEN 1 ELSE 0 END) as present,
        ROUND(SUM(CASE WHEN a.status IN ('present','late') THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 1) as percentage
      FROM attendance a
      GROUP BY a.student_id, a.subject_id
      HAVING ROUND(SUM(CASE WHEN a.status IN ('present','late') THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 1) < ${threshold}
    `;
    res.json(flagged);
  } catch (err) { next(err); }
});

// GET /api/reports/at-risk
router.get('/at-risk', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const students = await prisma.user.findMany({
      where: { role: 'student', status: 'active' },
      include: {
        student_profile: { select: { first_name: true, last_name: true, cgpa: true } },
      },
    });

    const atRisk = students.filter(s => (s.student_profile?.cgpa || 0) < 5.0);
    res.json(atRisk.map(s => ({
      id: s.id, user_id_display: s.user_id_display,
      name: `${s.student_profile?.first_name} ${s.student_profile?.last_name}`,
      cgpa: s.student_profile?.cgpa || 0,
      flags: ['low_cgpa'],
    })));
  } catch (err) { next(err); }
});

module.exports = router;
