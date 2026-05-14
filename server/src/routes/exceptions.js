// server/src/routes/exceptions.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { adminOrTA } = require('../middleware/rbac');
const minioService = require('../services/minio.service');

async function flatten(e) {
  return {
    id: e.id,
    type: e.type,
    status: e.status,
    reason: e.reason,
    requestedValue: e.requestedValue,
    newValue: e.newValue,
    // If attachmentUrl is an object-path (new uploads), sign it; legacy http URLs pass through.
    attachmentUrl: await minioService.getReadUrl(e.attachmentUrl),
    decisionNotes: e.decisionNotes,
    decidedAt: e.decidedAt,
    createdAt: e.createdAt,
    studentId: e.studentId,
    studentName: e.student ? `${e.student.firstName} ${e.student.lastName}` : null,
    studentDisplayId: e.student?.user?.userIdDisplay,
    subjectId: e.subjectId,
    subjectName: e.subject?.name,
    subjectCode: e.subject?.code,
    semesterId: e.semesterId,
    semesterName: e.semester?.name,
    requestedByDisplayId: e.requestedBy?.userIdDisplay,
  };
}

router.get('/', authenticate, adminOrTA, async (req, res, next) => {
  try {
    const { status, type, page = 1, limit = 50 } = req.query;
    const where = {};
    if (status) where.status = status.toUpperCase();
    if (type) where.type = type.toUpperCase();
    const exceptions = await prisma.academicException.findMany({
      where,
      include: {
        student: { select: { id: true, firstName: true, lastName: true, user: { select: { userIdDisplay: true } } } },
        subject: { select: { code: true, name: true } },
        semester: { select: { name: true } },
        requestedBy: { select: { userIdDisplay: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit),
    });
    const total = await prisma.academicException.count({ where });
    const flat = await Promise.all(exceptions.map(flatten));
    res.json({ exceptions: flat, total });
  } catch (err) { next(err); }
});

router.get('/my', authenticate, async (req, res, next) => {
  try {
    const sp = await prisma.studentProfile.findUnique({ where: { userId: req.user.id } });
    if (!sp) return res.json({ exceptions: [] });
    const exceptions = await prisma.academicException.findMany({
      where: { studentId: sp.id },
      include: {
        student: { select: { firstName: true, lastName: true, user: { select: { userIdDisplay: true } } } },
        subject: { select: { code: true, name: true } },
        semester: { select: { name: true } },
        requestedBy: { select: { userIdDisplay: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const flat = await Promise.all(exceptions.map(flatten));
    res.json({ exceptions: flat });
  } catch (err) { next(err); }
});

router.post('/', authenticate, async (req, res, next) => {
  try {
    const { studentId: bodyStudentId, subjectId, semesterId, type, reason, requestedValue, attachmentUrl } = req.body;
    let studentId = bodyStudentId;
    if (req.user.role === 'STUDENT') {
      const sp = await prisma.studentProfile.findUnique({ where: { userId: req.user.id } });
      if (!sp) return res.status(400).json({ error: 'Student profile not found' });
      studentId = sp.id;
    }
    if (!studentId || !type || !reason) {
      return res.status(400).json({ error: 'studentId, type, reason required' });
    }
    const exc = await prisma.academicException.create({
      data: {
        studentId,
        subjectId: subjectId || null,
        semesterId: semesterId || null,
        type: type.toUpperCase(),
        reason,
        requestedValue: requestedValue || null,
        attachmentUrl: attachmentUrl || null,
        requestedById: req.user.id,
      },
    });
    res.status(201).json({ exception: exc });
  } catch (err) { next(err); }
});

router.put('/:id', authenticate, adminOrTA, async (req, res, next) => {
  try {
    const { status, newValue, decisionNotes } = req.body;
    if (!status) return res.status(400).json({ error: 'status required' });
    const normalized = status.toUpperCase();
    if (!['APPROVED', 'REJECTED', 'PENDING'].includes(normalized)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const exc = await prisma.academicException.update({
      where: { id: req.params.id },
      data: {
        status: normalized,
        newValue: newValue || null,
        decisionNotes: decisionNotes || null,
        decidedById: req.user.id,
        decidedAt: new Date(),
      },
    });
    res.json({ exception: exc });
  } catch (err) { next(err); }
});

module.exports = router;
