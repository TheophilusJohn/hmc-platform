const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');

router.get('/profile', authenticate, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        studentProfile: {
          include: {
            programme: { select: { name: true, code: true, durationYears: true } },
            batch: { select: { name: true, currentYear: true, startYear: true, endYear: true } },
          },
        },
        facultyProfile: true,
      },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const sp = user.studentProfile;
    const fp = user.facultyProfile;
    const p = sp || fp || {};
    let emergencyContact = null, emergencyPhone = null;
    if (sp?.emergencyContact) {
      try { const ec = JSON.parse(sp.emergencyContact); emergencyContact = ec.name; emergencyPhone = ec.phone; }
      catch { emergencyContact = sp.emergencyContact; }
    }
    const profileResponse = {
      id: user.id, userIdDisplay: user.userIdDisplay, email: user.email, role: user.role,
      firstName: p.firstName, lastName: p.lastName, phone: user.phone,
      dob: p.dob, gender: p.gender, nationality: p.nationality, photoUrl: p.photoUrl,
      ...(sp && {
        studentType: sp.studentType, studyMode: sp.studyMode, hostelStatus: sp.hostelStatus,
        permanentAddress: sp.permanentAddress, presentAddress: sp.presentAddress,
        emergencyContact, emergencyPhone,
        programmeName: sp.programme?.name, programmeCode: sp.programme?.code,
        batchName: sp.batch?.name, currentYear: sp.batch?.currentYear,
      }),
    };
    // Academic summary for students
    if (sp) {
      try {
        const allEnr = await prisma.studentSubjectEnrollment.findMany({
          where: { studentId: sp.id, resultStatus: { in: ['PASS', 'FAIL'] } },
          include: { subject: { select: { creditHours: true, totalMarks: true, passMark: true } } },
        });
        let credits = 0, weighted = 0;
        for (const e of allEnr) {
          const t = (e.iaMarks ?? 0) + (e.eseMarks ?? 0);
          credits += e.subject.creditHours || 0;
          const pct = e.subject.totalMarks > 0 ? (t / e.subject.totalMarks) * 100 : 0;
          const gp = pct >= 90 ? 10 : pct >= 80 ? 9 : pct >= 70 ? 8 : pct >= 60 ? 7 : pct >= 50 ? 6 : pct >= 45 ? 5 : 0;
          if (t >= e.subject.passMark) weighted += gp * (e.subject.creditHours || 0);
        }
        profileResponse.cgpa = credits > 0 ? (weighted / credits).toFixed(2) : null;
        profileResponse.creditsEarned = credits;
        profileResponse.semestersCompleted = new Set(allEnr.map(e => e.semesterId)).size;
      } catch (_e) {}
    }
    res.json(profileResponse);
  } catch (err) { next(err); }
});

router.put('/profile', authenticate, async (req, res, next) => {
  try {
    const { phone, permanentAddress, presentAddress, emergencyContact, emergencyPhone } = req.body;
    if (phone !== undefined) await prisma.user.update({ where: { id: req.user.id }, data: { phone } });
    if (req.user.role === 'STUDENT') {
      const sp = await prisma.studentProfile.findUnique({ where: { userId: req.user.id } });
      if (sp) {
        const data = {};
        if (permanentAddress !== undefined) data.permanentAddress = permanentAddress;
        if (presentAddress !== undefined) data.presentAddress = presentAddress;
        if (emergencyContact !== undefined || emergencyPhone !== undefined) {
          let existing = {};
          if (sp.emergencyContact) { try { existing = JSON.parse(sp.emergencyContact); } catch {} }
          data.emergencyContact = JSON.stringify({
            ...existing,
            ...(emergencyContact !== undefined && { name: emergencyContact }),
            ...(emergencyPhone !== undefined && { phone: emergencyPhone }),
          });
        }
        if (Object.keys(data).length) await prisma.studentProfile.update({ where: { id: sp.id }, data });
      }
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

function gpaFromMarks(t, ps, max) {
  if (t < ps) return 0;
  const pct = max > 0 ? (t / max) * 100 : 0;
  if (pct >= 90) return 10; if (pct >= 80) return 9; if (pct >= 70) return 8;
  if (pct >= 60) return 7; if (pct >= 50) return 6; if (pct >= 45) return 5; return 4;
}

router.get('/stats', authenticate, async (req, res, next) => {
  try {
    if (req.user.role === 'STUDENT') {
      const sp = await prisma.studentProfile.findUnique({ where: { userId: req.user.id } });
      if (!sp) return res.json({});
      const enrollments = await prisma.studentSubjectEnrollment.findMany({
        where: { studentId: sp.id },
        include: { subject: { select: { id: true, code: true, name: true, creditHours: true, totalMarks: true, passMark: true } } },
      });
      let credits = 0, weighted = 0;
      for (const e of enrollments) {
        if (!['PASS'].includes(e.resultStatus)) continue;
        const t = (e.iaMarks ?? 0) + (e.eseMarks ?? 0);
        credits += e.subject.creditHours;
        weighted += gpaFromMarks(t, e.subject.passMark, e.subject.totalMarks) * e.subject.creditHours;
      }
      const cgpa = credits > 0 ? (weighted / credits).toFixed(2) : null;
      const att = await prisma.attendance.groupBy({
        by: ['subjectId', 'status'], where: { studentId: sp.id }, _count: { _all: true },
      });
      const subjMap = {};
      for (const a of att) {
        if (!subjMap[a.subjectId]) subjMap[a.subjectId] = { present: 0, total: 0 };
        subjMap[a.subjectId].total += a._count._all;
        if (a.status === 'PRESENT') subjMap[a.subjectId].present += a._count._all;
      }
      const subjectAttendance = enrollments.filter(e => subjMap[e.subjectId]).map(e => ({
        subjectId: e.subjectId, subjectCode: e.subject.code,
        rate: subjMap[e.subjectId].total > 0 ? Math.round((subjMap[e.subjectId].present / subjMap[e.subjectId].total) * 100) : 0,
      }));
      const totT = Object.values(subjMap).reduce((a, s) => a + s.total, 0);
      const totP = Object.values(subjMap).reduce((a, s) => a + s.present, 0);
      const attendance = totT > 0 ? Math.round((totP / totT) * 100) : 0;
      return res.json({ subjects: enrollments.length, cgpa, attendance, subjectAttendance });
    }
    if (['FACULTY', 'TEACHER_ADMIN'].includes(req.user.role)) {
      const fp = await prisma.facultyProfile.findUnique({ where: { userId: req.user.id } });
      if (!fp) return res.json({});
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
      const [subjects, pendingGrading, students, dueToday] = await Promise.all([
        prisma.subject.count({ where: { facultyId: fp.id, status: 'active' } }),
        prisma.submission.count({ where: { status: 'SUBMITTED', exam: { subject: { facultyId: fp.id } } } }),
        prisma.studentSubjectEnrollment.findMany({
          where: { subject: { facultyId: fp.id } }, distinct: ['studentId'], select: { studentId: true },
        }),
        prisma.exam.count({ where: { subject: { facultyId: fp.id }, endDatetime: { gte: today, lt: tomorrow } } }),
      ]);
      // Pending exams to grade (top 5 by submission count)
      const examGroups = await prisma.submission.groupBy({
        by: ['examId'],
        where: { status: 'SUBMITTED', exam: { subject: { facultyId: fp.id } } },
        _count: { _all: true },
      });
      let pendingExams = [];
      if (examGroups.length > 0) {
        const top5 = [...examGroups].sort((a, b) => b._count._all - a._count._all).slice(0, 5);
        const examIds = top5.map(g => g.examId);
        const exams = await prisma.exam.findMany({
          where: { id: { in: examIds } },
          include: { subject: { select: { name: true } } },
        });
        const examMap = Object.fromEntries(exams.map(e => [e.id, e]));
        pendingExams = top5.map(g => ({
          examId: g.examId,
          examTitle: examMap[g.examId]?.title || '',
          subjectName: examMap[g.examId]?.subject?.name || '',
          submittedCount: g._count._all,
        }));
      }
      return res.json({ subjects, pendingGrading, students: students.length, dueToday, pendingExams });
    }
    res.json({});
  } catch (err) { next(err); }
});

module.exports = router;
