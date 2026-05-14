// server/src/routes/revaluation.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { adminOrTA, requireRole } = require('../middleware/rbac');
const notif = require('../services/notification.service');

router.post('/request', authenticate, requireRole('STUDENT'), async (req, res, next) => {
  try {
    const { subjectId, semesterId, reason, originalMarks } = req.body;
    const sp = await prisma.studentProfile.findFirst({ where: { userId: req.user.id } });
    if (!sp) return res.status(404).json({ error: 'Student profile not found' });

    const feeSetting = await prisma.systemSetting.findUnique({ where: { key: 'revaluation_fee' } });
    const feeAmount = feeSetting?.value?.amount || 0;

    if (feeAmount > 0) {
      const paid = await prisma.payment.findFirst({
        where: { studentId: sp.id, notes: { contains: `revaluation:${subjectId}` } },
      });
      if (!paid) return res.status(402).json({ error: 'Revaluation fee must be paid before submitting request.' });
    }

    const subject = await prisma.subject.findUnique({ where: { id: subjectId } });

    const rev = await prisma.revaluation.create({
      data: {
        studentId: sp.id,
        subjectId,
        semesterId,
        notes: reason,
        originalMarks,
        status: 'pending',
      },
    });

    const admins = await prisma.user.findMany({ where: { role: { in: ['FULL_ADMIN', 'TEACHER_ADMIN'] }, status: 'ACTIVE' } });
    for (const admin of admins) {
      await notif.createNotification(admin.id, 'revaluation_request', 'Revaluation Request',
        `Student ${req.user.userIdDisplay} requested revaluation for ${subject?.name || 'a subject'}`, '/ta/exceptions');
    }
    res.status(201).json(rev);
  } catch (err) { next(err); }
});

router.get('/', authenticate, adminOrTA, async (req, res, next) => {
  try {
    const revs = await prisma.revaluation.findMany({
      include: {
        student: { select: { firstName: true, lastName: true, user: { select: { userIdDisplay: true } } } },
      },
      orderBy: { requestedAt: 'desc' },
    });

    const enriched = await Promise.all(revs.map(async r => {
      const subject = await prisma.subject.findUnique({ where: { id: r.subjectId }, select: { name: true, code: true } });
      return { ...r, subject };
    }));

    res.json(enriched);
  } catch (err) { next(err); }
});

router.put('/:id/approve', authenticate, adminOrTA, async (req, res, next) => {
  try {
    const rev = await prisma.revaluation.update({
      where: { id: req.params.id },
      data: { status: 'approved', taApprovedBy: req.user.id, taApprovedAt: new Date() },
    });

    const subject = await prisma.subject.findUnique({ where: { id: rev.subjectId }, select: { facultyId: true, name: true } });
    if (subject?.facultyId) {
      const fp = await prisma.facultyProfile.findUnique({ where: { id: subject.facultyId }, include: { user: true } });
      if (fp?.user) {
        await notif.createNotification(fp.user.id, 'revaluation_assigned', 'Revaluation Assigned',
          `Please re-grade revaluation for ${subject.name}`, '/faculty/exams');
      }
    }
    res.json(rev);
  } catch (err) { next(err); }
});

router.put('/:id/faculty-grade', authenticate, requireRole('FACULTY', 'TEACHER_ADMIN', 'FULL_ADMIN'), async (req, res, next) => {
  try {
    const newMarks = Number(req.body.newMarks);
    const { notes } = req.body;
    if (!Number.isFinite(newMarks) || newMarks < 0) {
      return res.status(400).json({ error: 'newMarks must be a non-negative number' });
    }

    // If the caller is FACULTY, restrict to subjects they teach
    if (req.user.role === 'FACULTY') {
      const rev = await prisma.revaluation.findUnique({
        where: { id: req.params.id },
        select: { subjectId: true },
      });
      if (!rev) return res.status(404).json({ error: 'Revaluation not found' });
      const fp = await prisma.facultyProfile.findUnique({
        where: { userId: req.user.id },
        select: { id: true },
      });
      const subj = await prisma.subject.findUnique({
        where: { id: rev.subjectId },
        select: { facultyId: true },
      });
      if (!fp || subj?.facultyId !== fp.id) {
        return res.status(403).json({ error: 'You do not teach this subject' });
      }
    }

    const rev = await prisma.revaluation.update({
      where: { id: req.params.id },
      data: { newMarks, notes, status: 'faculty_grading', facultyGradedAt: new Date() },
    });
    res.json(rev);
  } catch (err) { next(err); }
});

router.put('/:id/reject', authenticate, requireRole('FACULTY', 'TEACHER_ADMIN', 'FULL_ADMIN'), async (req, res, next) => {
  try {
    const { notes } = req.body;
    const rev = await prisma.revaluation.update({
      where: { id: req.params.id },
      data: { status: 'rejected', notes: notes || null },
      include: { student: { include: { user: true } }, subject: { select: { name: true } } },
    });
    if (rev.student?.user) {
      try {
        await notif.createNotification(
          rev.student.user.id, 'revaluation_result', 'Revaluation Declined',
          `Your revaluation request for ${rev.subject?.name || 'a subject'} was declined.`,
          '/student/marksheet'
        );
      } catch (_e) {}
    }
    res.json(rev);
  } catch (err) { next(err); }
});

router.put('/:id/confirm', authenticate, adminOrTA, async (req, res, next) => {
  try {
    const rev = await prisma.revaluation.update({
      where: { id: req.params.id },
      data: { status: 'confirmed', confirmedBy: req.user.id, confirmedAt: new Date() },
      include: { student: { include: { user: true } } },
    });

    if (rev.newMarks !== null && rev.newMarks !== undefined) {
      const enrollment = await prisma.studentSubjectEnrollment.findFirst({
        where: { studentId: rev.studentId, subjectId: rev.subjectId, semesterId: rev.semesterId },
      });
      if (enrollment) {
        const subject = await prisma.subject.findUnique({ where: { id: rev.subjectId } });
        const pct = (rev.newMarks / (subject?.totalMarks || 100)) * 100;
        const { percentToGrade } = require('../utils/cgpa');
        const grade = percentToGrade(pct);

        await prisma.studentSubjectEnrollment.update({
          where: { id: enrollment.id },
          data: {
            totalMarks: rev.newMarks,
            grade,
            resultStatus: grade === 'F' ? 'FAIL' : 'PASS',
          },
        });
      }
    }

    const subject = await prisma.subject.findUnique({ where: { id: rev.subjectId }, select: { name: true } });
    if (rev.student?.user) {
      await notif.createNotification(rev.student.user.id, 'revaluation_result', 'Revaluation Complete',
        `Your revaluation for ${subject?.name || 'a subject'} has been processed.`, '/student/marksheet');
    }
    res.json(rev);
  } catch (err) { next(err); }
});

module.exports = router;
