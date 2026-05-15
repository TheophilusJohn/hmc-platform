const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { facultyOrAbove } = require('../middleware/rbac');

const { canAccessSubject } = require('../middleware/subjectAccess');

router.post('/:id/override', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const { studentId, marks, reason } = req.body;
    if (!studentId || marks === undefined) return res.status(400).json({ error: 'studentId and marks required' });

    // Ownership + marks cap via the exam's subject
    const exam = await prisma.exam.findUnique({
      where: { id: req.params.id },
      select: { subjectId: true, totalMarks: true, passMark: true },
    });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    if (!(await canAccessSubject(req.user, exam.subjectId))) {
      return res.status(403).json({ error: 'You do not teach this subject' });
    }

    // Refuse override for a student who isn't enrolled in this subject — pre-fix
    // a faculty could create a Submission for an arbitrary StudentProfile.id,
    // including non-enrolled or non-existent students.
    const enrollment = await prisma.studentSubjectEnrollment.findFirst({
      where: { studentId, subjectId: exam.subjectId },
      select: { id: true },
    });
    if (!enrollment) {
      return res.status(400).json({ error: 'Student is not enrolled in this subject — cannot override marks.' });
    }

    const m = parseFloat(marks);
    if (isNaN(m) || m < 0) return res.status(400).json({ error: 'Marks must be a non-negative number' });
    if (m > exam.totalMarks) return res.status(400).json({ error: `Marks cannot exceed exam total (${exam.totalMarks})` });

    // Below-passmark override should be flagged on the enrollment too — pre-fix
    // an override below passMark set Submission.status=GRADED but never marked
    // the enrollment FAIL, so the marksheet still showed PENDING for it.
    // Wrap submission upsert + enrollment update in a single transaction.
    await prisma.$transaction(async (tx) => {
      const submission = await tx.submission.findFirst({
        where: { examId: req.params.id, studentId },
      });
      if (submission) {
        await tx.submission.update({
          where: { id: submission.id },
          data: { marksObtained: m, feedback: reason || null, status: 'GRADED' },
        });
      } else {
        await tx.submission.create({
          data: {
            examId: req.params.id, studentId,
            marksObtained: m, feedback: reason || null,
            status: 'GRADED', submittedAt: new Date(),
          },
        });
      }
      // Reflect on the enrollment so the marksheet reads correctly.
      const enrollmentRow = await tx.studentSubjectEnrollment.findFirst({
        where: { studentId, subjectId: exam.subjectId },
      });
      if (enrollmentRow) {
        const newEse = (enrollmentRow.iaMarks != null) ? Math.max(0, m - (enrollmentRow.iaMarks || 0)) : m;
        // Only set FAIL when below passMark — leave PENDING/PASS alone on a partial override.
        const passing = m >= (exam.passMark ?? 0);
        await tx.studentSubjectEnrollment.update({
          where: { id: enrollmentRow.id },
          data: {
            eseMarks: enrollmentRow.eseMarks ?? newEse,
            resultStatus: passing ? (enrollmentRow.resultStatus === 'PENDING' ? 'PENDING' : enrollmentRow.resultStatus) : 'FAIL',
          },
        });
      }
    });
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
