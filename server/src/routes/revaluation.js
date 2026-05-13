const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authenticate } = require('../middleware/auth');
const { adminOrTA } = require('../middleware/rbac');
const notif = require('../services/notification.service');

// POST /api/revaluation/request
router.post('/request', authenticate, async (req, res, next) => {
  try {
    const { enrollment_id, reason } = req.body;
    if (req.user.role !== 'student') return res.status(403).json({ error: 'Students only' });

    // Check revaluation fee paid (look up setting)
    const feeSetting = await prisma.systemSetting.findUnique({ where: { key: 'revaluation_fee' } });
    const feeAmount = feeSetting?.value?.amount || 0;

    if (feeAmount > 0) {
      // Check payment exists
      const paid = await prisma.payment.findFirst({
        where: { student_id: req.user.id, notes: { contains: `revaluation:${enrollment_id}` } },
      });
      if (!paid) return res.status(402).json({ error: 'Revaluation fee must be paid before submitting request.' });
    }

    const enrollment = await prisma.studentSubjectEnrollment.findUnique({
      where: { id: enrollment_id }, include: { subject: true },
    });

    const rev = await prisma.revaluation.create({
      data: { enrollment_id, student_id: req.user.id, subject_id: enrollment.subject_id, reason, status: 'pending' },
    });

    // Notify TA/Admin
    await notif.createNotification(null, 'revaluation_request', 'Revaluation Request', `Student ${req.user.user_id_display} requested revaluation for ${enrollment.subject.name}`, `/ta/exceptions`);
    res.status(201).json(rev);
  } catch (err) { next(err); }
});

// GET /api/revaluation — TA/Admin views pending
router.get('/', authenticate, adminOrTA, async (req, res, next) => {
  try {
    const revs = await prisma.revaluation.findMany({
      include: {
        student: { include: { student_profile: { select: { first_name: true, last_name: true } } } },
        subject: { select: { name: true, code: true } },
        enrollment: { select: { ese_marks: true, ia_marks: true, total_marks: true, grade: true } },
      },
      orderBy: { created_at: 'desc' },
    });
    res.json(revs);
  } catch (err) { next(err); }
});

// PUT /api/revaluation/:id/approve
router.put('/:id/approve', authenticate, adminOrTA, async (req, res, next) => {
  try {
    const rev = await prisma.revaluation.update({
      where: { id: req.params.id },
      data: { status: 'approved', approved_by: req.user.id, approved_at: new Date() },
      include: { subject: true },
    });
    // Notify faculty
    const faculty = await prisma.subject.findUnique({ where: { id: rev.subject_id }, select: { faculty_id: true } });
    if (faculty?.faculty_id) {
      await notif.createNotification(faculty.faculty_id, 'revaluation_assigned', 'Revaluation Assigned', `Please re-grade revaluation for subject ${rev.subject.name}`, `/faculty/exams`);
    }
    res.json(rev);
  } catch (err) { next(err); }
});

// PUT /api/revaluation/:id/faculty-grade
router.put('/:id/faculty-grade', authenticate, async (req, res, next) => {
  try {
    const { new_ese_marks, new_ia_marks, faculty_remarks } = req.body;
    const rev = await prisma.revaluation.update({
      where: { id: req.params.id },
      data: { new_ese_marks, new_ia_marks, faculty_remarks, status: 'faculty_graded', graded_at: new Date() },
    });
    res.json(rev);
  } catch (err) { next(err); }
});

// PUT /api/revaluation/:id/confirm
router.put('/:id/confirm', authenticate, adminOrTA, async (req, res, next) => {
  try {
    const rev = await prisma.revaluation.update({
      where: { id: req.params.id },
      data: { status: 'confirmed', confirmed_by: req.user.id, confirmed_at: new Date() },
      include: { enrollment: true, student: true, subject: true },
    });

    // Update enrollment
    if (rev.new_ese_marks !== null || rev.new_ia_marks !== null) {
      const ese = rev.new_ese_marks ?? rev.enrollment.ese_marks;
      const ia = rev.new_ia_marks ?? rev.enrollment.ia_marks;
      const total = ese + ia;
      const { percentToGrade, cgpaPoints } = require('../utils/cgpa');
      const subject = await prisma.subject.findUnique({ where: { id: rev.subject_id } });
      const pct = (total / subject.total_marks) * 100;
      const grade = percentToGrade(pct);

      await prisma.studentSubjectEnrollment.update({
        where: { id: rev.enrollment_id },
        data: { ese_marks: ese, ia_marks: ia, total_marks: total, grade, result_status: grade === 'F' ? 'fail' : 'pass' },
      });
    }

    await notif.createNotification(rev.student_id, 'revaluation_result', 'Revaluation Complete', `Your revaluation for ${rev.subject.name} has been processed.`, `/student/marksheet`);
    res.json(rev);
  } catch (err) { next(err); }
});

module.exports = router;
