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
      select: { subjectId: true, totalMarks: true },
    });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    if (!(await canAccessSubject(req.user, exam.subjectId))) {
      return res.status(403).json({ error: 'You do not teach this subject' });
    }
    const m = parseFloat(marks);
    if (isNaN(m) || m < 0) return res.status(400).json({ error: 'Marks must be a non-negative number' });
    if (m > exam.totalMarks) return res.status(400).json({ error: `Marks cannot exceed exam total (${exam.totalMarks})` });

    const submission = await prisma.submission.findFirst({
      where: { examId: req.params.id, studentId },
    });
    if (submission) {
      await prisma.submission.update({
        where: { id: submission.id },
        data: { marksObtained: parseFloat(marks), feedback: reason || null, status: 'GRADED' },
      });
    } else {
      await prisma.submission.create({
        data: {
          examId: req.params.id, studentId,
          marksObtained: parseFloat(marks), feedback: reason || null,
          status: 'GRADED', submittedAt: new Date(),
        },
      });
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
