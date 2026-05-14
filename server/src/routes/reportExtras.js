const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { facultyOrAbove, adminOnly } = require('../middleware/rbac');

// 1. ACADEMIC
router.get('/academic', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const { semesterId, batchId, programmeId } = req.query;
    const where = {};
    if (semesterId) where.semesterId = semesterId;
    if (batchId) where.batchId = batchId;
    if (programmeId) where.programmeId = programmeId;
    const subjects = await prisma.subject.findMany({
      where,
      include: {
        semester: { select: { name: true } },
        programme: { select: { name: true } },
        batch: { select: { name: true } },
        enrollments: { include: { student: { select: { firstName: true, lastName: true, user: { select: { userIdDisplay: true } } } } } },
      },
    });
    const rows = [];
    let totalEnr = 0, totalPass = 0, marksSum = 0, marksCount = 0;
    for (const s of subjects) {
      for (const e of s.enrollments) {
        const total = (e.iaMarks ?? 0) + (e.eseMarks ?? 0);
        totalEnr++;
        if (['PASS'].includes(e.resultStatus)) totalPass++;
        if (e.iaMarks !== null || e.eseMarks !== null) { marksSum += total; marksCount++; }
        rows.push({
          student_id: e.student?.user?.userIdDisplay || '',
          student_name: e.student ? `${e.student.firstName} ${e.student.lastName}` : '',
          programme: s.programme?.name || '',
          batch: s.batch?.name || '',
          semester: s.semester?.name || '',
          subject: `${s.code} - ${s.name}`,
          ia: e.iaMarks ?? '-',
          ese: e.eseMarks ?? '-',
          total: total || '-',
          status: e.resultStatus,
        });
      }
    }
    res.json({
      summary: {
        subjects: subjects.length,
        enrollments: totalEnr,
        passed: totalPass,
        avg_total: marksCount > 0 ? Math.round(marksSum / marksCount) : 0,
      },
      rows,
      columns: ['student_id', 'student_name', 'programme', 'batch', 'semester', 'subject', 'ia', 'ese', 'total', 'status'],
    });
  } catch (err) { next(err); }
});

// 2. FINANCIAL
router.get('/financial', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { batchId, programmeId } = req.query;
    const sw = {};
    if (batchId) sw.batchId = batchId;
    if (programmeId) sw.programmeId = programmeId;
    const where = (batchId || programmeId) ? { student: sw } : {};
    const entries = await prisma.studentFeeLedger.findMany({
      where,
      include: {
        student: { select: { firstName: true, lastName: true, user: { select: { userIdDisplay: true } }, programme: { select: { name: true } }, batch: { select: { name: true } } } },
        feeType: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const rows = entries.map(e => {
      const amt = Number(e.amount || 0);
      const waived = Number(e.waivedAmount || 0);
      const balance = Math.max(0, Number(e.balance || 0));
      const paid = Math.max(0, amt - waived - balance);
      return {
        student_id: e.student?.user?.userIdDisplay || '',
        student_name: e.student ? `${e.student.firstName} ${e.student.lastName}` : '',
        programme: e.student?.programme?.name || '',
        batch: e.student?.batch?.name || '',
        fee_type: e.feeType?.name || e.description || '',
        amount: amt, paid, waived, balance,
        status: e.status,
      };
    });
    res.json({
      summary: {
        charged: rows.reduce((s, r) => s + r.amount, 0),
        collected: rows.reduce((s, r) => s + r.paid, 0),
        waived: rows.reduce((s, r) => s + r.waived, 0),
        outstanding: rows.reduce((s, r) => s + r.balance, 0),
      },
      rows,
      columns: ['student_id', 'student_name', 'programme', 'batch', 'fee_type', 'amount', 'paid', 'waived', 'balance', 'status'],
    });
  } catch (err) { next(err); }
});

// 3. ADMISSIONS
router.get('/admissions', authenticate, adminOnly, async (req, res, next) => {
  try {
    const applicants = await prisma.applicant.findMany({
      include: { programme: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const byStage = {};
    for (const a of applicants) byStage[a.pipelineStage] = (byStage[a.pipelineStage] || 0) + 1;
    const rows = applicants.map(a => {
      const fd = a.formData || {};
      return {
        application_no: a.applicationNo || a.id.slice(0, 8),
        name: fd.firstName ? `${fd.firstName} ${fd.lastName || ''}`.trim() : (fd.fullName || ''),
        email: fd.email || '',
        programme: a.programme?.name || '',
        stage: a.pipelineStage,
        type: fd.studentType || a.studentType || '',
        applied: a.createdAt,
      };
    });
    res.json({
      summary: {
        total: applicants.length,
        received: byStage['RECEIVED'] || 0,
        accepted: (byStage['ACCEPTED'] || 0) + (byStage['ENROLLED'] || 0),
        rejected: byStage['REJECTED'] || 0,
      },
      rows,
      columns: ['application_no', 'name', 'email', 'programme', 'stage', 'type', 'applied'],
    });
  } catch (err) { next(err); }
});

// 4. ATTENDANCE
router.get('/attendance', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const { batchId, programmeId } = req.query;
    const where = {};
    if (batchId) where.batchId = batchId;
    if (programmeId) where.programmeId = programmeId;
    const students = await prisma.studentProfile.findMany({
      where,
      select: {
        id: true, firstName: true, lastName: true,
        user: { select: { userIdDisplay: true } },
        programme: { select: { name: true } },
        batch: { select: { name: true } },
        attendance: { select: { status: true } },
      },
      orderBy: [{ firstName: 'asc' }],
    });
    let totalSess = 0, totalPres = 0, below = 0;
    const rows = students.map(s => {
      const t = s.attendance.length;
      const p = s.attendance.filter(a => a.status === 'PRESENT').length;
      const r = t > 0 ? Math.round((p / t) * 100) : 0;
      totalSess += t; totalPres += p;
      if (r < 75 && t > 0) below++;
      return {
        student_id: s.user?.userIdDisplay || '',
        student_name: `${s.firstName} ${s.lastName}`,
        programme: s.programme?.name || '',
        batch: s.batch?.name || '',
        present: p, total: t,
        rate: t > 0 ? `${r}%` : '-',
        status: r < 75 && t > 0 ? 'AT RISK' : 'OK',
      };
    });
    res.json({
      summary: {
        students: students.length,
        avg_rate: totalSess > 0 ? `${Math.round((totalPres / totalSess) * 100)}%` : '0%',
        below_75: below,
      },
      rows,
      columns: ['student_id', 'student_name', 'programme', 'batch', 'present', 'total', 'rate', 'status'],
    });
  } catch (err) { next(err); }
});

// 5. REFERRALS
router.get('/referrals', authenticate, adminOnly, async (req, res, next) => {
  try {
    const referrals = await prisma.referral.findMany({
      include: {
        referrer: { select: { firstName: true, lastName: true, studentType: true, user: { select: { userIdDisplay: true } } } },
        referredApplicant: { select: { formData: true } },
        programme: { select: { domesticIncentiveInr: true, internationalIncentiveUsd: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const rows = referrals.map(r => {
      const fd = r.referredApplicant?.formData || {};
      const isIntl = r.referrer?.studentType === 'INTERNATIONAL';
      const reward = r.status === 'REWARDED'
        ? Number(isIntl ? r.programme?.internationalIncentiveUsd : r.programme?.domesticIncentiveInr) || 0
        : 0;
      return {
        referrer: r.referrer ? `${r.referrer.firstName} ${r.referrer.lastName}` : '',
        referrer_id: r.referrer?.user?.userIdDisplay || '',
        referee_email: fd.email || '',
        status: r.status,
        reward,
        created: r.createdAt,
      };
    });
    res.json({
      summary: {
        total: referrals.length,
        rewarded: referrals.filter(r => r.status === 'REWARDED').length,
        pending: referrals.filter(r => r.status === 'PENDING').length,
        total_rewards: rows.reduce((s, r) => s + r.reward, 0),
      },
      rows,
      columns: ['referrer', 'referrer_id', 'referee_email', 'status', 'reward', 'created'],
    });
  } catch (err) { next(err); }
});

// 6. AT-RISK (handle both /at/risk and /at-risk URL shapes)
async function atRiskHandler(req, res, next) {
  try {
    // Filter inactive at the DB level + cap memory for very large datasets.
    // Pre-fix this loaded every StudentProfile with attendance + enrollments +
    // ledger in one query, with no upper bound — could OOM the server.
    const students = await prisma.studentProfile.findMany({
      where: { user: { status: 'ACTIVE' } },
      take: 5000,
      include: {
        user: { select: { userIdDisplay: true, status: true } },
        programme: { select: { name: true } },
        batch: { select: { name: true } },
        attendance: { select: { status: true } },
        feeledger: { select: { balance: true } },
        enrollments: {
          where: { resultStatus: { in: ['PASS', 'FAIL'] } },
          include: { subject: { select: { totalMarks: true, passMark: true, creditHours: true } } },
        },
      },
    });
    const flagged = [];
    let lowAtt = 0, owed = 0, lowCgpa = 0;
    for (const s of students) {
      if (s.user?.status !== 'ACTIVE') continue;
      const t = s.attendance.length;
      const p = s.attendance.filter(a => a.status === 'PRESENT').length;
      const attRate = t > 0 ? (p / t) * 100 : 100;
      const outstanding = s.feeledger.reduce((sum, e) => sum + Math.max(0, Number(e.balance || 0)), 0);
      let credits = 0, weighted = 0;
      for (const e of s.enrollments) {
        const tm = (e.iaMarks ?? 0) + (e.eseMarks ?? 0);
        const pct = e.subject.totalMarks > 0 ? (tm / e.subject.totalMarks) * 100 : 0;
        const pt = tm < e.subject.passMark ? 0 : pct >= 90 ? 10 : pct >= 80 ? 9 : pct >= 70 ? 8 : pct >= 60 ? 7 : pct >= 50 ? 6 : pct >= 45 ? 5 : 4;
        credits += e.subject.creditHours;
        weighted += pt * e.subject.creditHours;
      }
      const cgpa = credits > 0 ? (weighted / credits) : null;
      const reasons = [];
      if (attRate < 75 && t > 0) { reasons.push('Low attendance'); lowAtt++; }
      if (outstanding > 0) { reasons.push('Outstanding fees'); owed++; }
      if (cgpa !== null && cgpa < 5) { reasons.push('Low CGPA'); lowCgpa++; }
      if (reasons.length > 0) {
        flagged.push({
          student_id: s.user.userIdDisplay,
          student_name: `${s.firstName} ${s.lastName}`,
          programme: s.programme?.name || '',
          batch: s.batch?.name || '',
          attendance: t > 0 ? `${Math.round(attRate)}%` : '-',
          outstanding,
          cgpa: cgpa !== null ? cgpa.toFixed(2) : '-',
          reasons: reasons.join(', '),
        });
      }
    }
    res.json({
      summary: { flagged: flagged.length, low_attendance: lowAtt, owed_fees: owed, low_cgpa: lowCgpa },
      rows: flagged,
      columns: ['student_id', 'student_name', 'programme', 'batch', 'attendance', 'outstanding', 'cgpa', 'reasons'],
    });
  } catch (err) { next(err); }
}
router.get('/at/risk', authenticate, facultyOrAbove, atRiskHandler);
router.get('/at-risk', authenticate, facultyOrAbove, atRiskHandler);


// GET /api/reports/financial/summary - aggregated totals
router.get('/financial/summary', authenticate, adminOnly, async (req, res, next) => {
  try {
    const [payments, ledgers] = await Promise.all([
      prisma.payment.findMany({ select: { amount: true, currency: true } }),
      prisma.studentFeeLedger.findMany({ select: { balance: true, waivedAmount: true } }),
    ]);
    let collectedINR = 0, collectedUSD = 0;
    for (const p of payments) {
      const amt = Number(p.amount || 0);
      if (p.currency === 'USD') collectedUSD += amt;
      else collectedINR += amt;
    }
    const outstanding = ledgers.reduce((s, l) => s + Math.max(0, Number(l.balance || 0)), 0);
    const waivers = ledgers.reduce((s, l) => s + Number(l.waivedAmount || 0), 0);
    res.json({ collectedINR, collectedUSD, outstanding, waivers });
  } catch (err) { console.error('financial/summary:', err); next(err); }
});

// GET /api/reports/financial/outstanding - students with outstanding dues
router.get('/financial/outstanding', authenticate, adminOnly, async (req, res, next) => {
  try {
    const entries = await prisma.studentFeeLedger.findMany({
      where: { balance: { gt: 0 } },
      include: {
        student: {
          include: {
            user: { select: { userIdDisplay: true, status: true } },
            programme: { select: { name: true } },
          },
        },
      },
    });
    const studentMap = {};
    for (const e of entries) {
      if (!e.student) continue;
      if (e.student.user?.status !== 'ACTIVE') continue;
      const sid = e.studentId;
      if (!studentMap[sid]) {
        studentMap[sid] = {
          id: sid,
          name: `${e.student.firstName} ${e.student.lastName}`,
          userIdDisplay: e.student.user?.userIdDisplay || '',
          programme: e.student.programme?.name || '',
          outstanding: 0,
          lastPaid: null,
        };
      }
      studentMap[sid].outstanding += Math.max(0, Number(e.balance || 0));
    }
    const studentIds = Object.keys(studentMap);
    if (studentIds.length > 0) {
      try {
        const lastPayments = await prisma.payment.findMany({
          where: { studentId: { in: studentIds } },
          orderBy: { paidAt: 'desc' },
          select: { studentId: true, paidAt: true },
        });
        const seen = new Set();
        for (const p of lastPayments) {
          if (seen.has(p.studentId)) continue;
          seen.add(p.studentId);
          if (studentMap[p.studentId]) studentMap[p.studentId].lastPaid = p.paidAt;
        }
      } catch (_e) {}
    }
    res.json({ students: Object.values(studentMap) });
  } catch (err) { console.error('financial/outstanding:', err); next(err); }
});

module.exports = router;
