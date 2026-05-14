// server/src/routes/transcripts.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { adminOnly, requireRole } = require('../middleware/rbac');
const pdfService = require('../services/pdf.service');
const notif = require('../services/notification.service');

// GET /api/transcripts/unofficial/my — student downloads their own unofficial transcript
router.get('/unofficial/my', authenticate, requireRole('STUDENT'), async (req, res, next) => {
  try {
    const sp = await prisma.studentProfile.findFirst({ where: { userId: req.user.id }, select: { id: true } });
    if (!sp) return res.status(404).json({ error: 'Student profile not found' });
    const pdfBuffer = await pdfService.generateUnofficialTranscript(sp.id);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="HMC-Unofficial-Transcript.pdf"' });
    res.send(pdfBuffer);
  } catch (err) { next(err); }
});

router.post('/unofficial/:studentId', authenticate, async (req, res, next) => {
  try {
    if (req.user.role === 'STUDENT') {
      const sp = await prisma.studentProfile.findFirst({ where: { userId: req.user.id } });
      if (!sp || sp.id !== req.params.studentId) return res.status(403).json({ error: 'Forbidden' });
    } else if (!['FULL_ADMIN', 'TEACHER_ADMIN'].includes(req.user.role)) {
      // FACULTY / ADMISSIONS_OFFICER can't pull arbitrary students' transcripts.
      return res.status(403).json({ error: 'Forbidden' });
    }
    const pdfBuffer = await pdfService.generateUnofficialTranscript(req.params.studentId);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="HMC-Unofficial-Transcript.pdf"' });
    res.send(pdfBuffer);
  } catch (err) { next(err); }
});

router.post('/official/request', authenticate, requireRole('STUDENT'), async (req, res, next) => {
  try {
    const { purpose } = req.body;
    const sp = await prisma.studentProfile.findFirst({ where: { userId: req.user.id } });
    if (!sp) return res.status(404).json({ error: 'Student profile not found' });

    const feeCheck = await prisma.systemSetting.findUnique({ where: { key: 'transcript_fee' } });
    const feeAmount = feeCheck?.value?.amount || 0;

    if (feeAmount > 0) {
      const paid = await prisma.payment.findFirst({
        where: { studentId: sp.id, notes: { contains: 'official_transcript' } }
      });
      if (!paid) return res.status(402).json({ error: 'Transcript fee must be paid before requesting.', feeAmount });
    }

    const request = await prisma.officialTranscriptRequest.create({
      data: { studentId: sp.id, purpose, status: 'REQUESTED' },
    });
    res.status(201).json(request);
  } catch (err) { next(err); }
});

router.post('/official/generate/:requestId', authenticate, adminOnly, async (req, res, next) => {
  try {
    const request = await prisma.officialTranscriptRequest.findUnique({ where: { id: req.params.requestId } });
    if (!request) return res.status(404).json({ error: 'Request not found' });

    const { v4: uuidv4 } = require('uuid');
    const verificationUuid = uuidv4();

    const pdfBuffer = await pdfService.generateOfficialTranscript(request.studentId, req.params.requestId, verificationUuid);

    await prisma.officialTranscriptRequest.update({
      where: { id: req.params.requestId },
      data: { status: 'READY', verificationUuid, generatedById: req.user.id },
    });

    const sp = await prisma.studentProfile.findUnique({
      where: { id: request.studentId },
      include: { user: true }
    });
    if (sp?.user) {
      await notif.createNotification(sp.user.id, 'transcript_ready', 'Official Transcript Ready',
        'Your official transcript has been generated.', '/student/help');
    }

    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="HMC-Official-Transcript.pdf"' });
    res.send(pdfBuffer);
  } catch (err) { next(err); }
});

router.get('/official/requests', authenticate, adminOnly, async (req, res, next) => {
  try {
    const requests = await prisma.officialTranscriptRequest.findMany({
      include: { student: { select: { firstName: true, lastName: true, user: { select: { userIdDisplay: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(requests);
  } catch (err) { next(err); }
});

router.get('/official/my-requests', authenticate, async (req, res, next) => {
  try {
    const sp = await prisma.studentProfile.findFirst({ where: { userId: req.user.id } });
    if (!sp) return res.json([]);
    const requests = await prisma.officialTranscriptRequest.findMany({
      where: { studentId: sp.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json(requests);
  } catch (err) { next(err); }
});

router.get('/verify/:uuid', async (req, res, next) => {
  try {
    const request = await prisma.officialTranscriptRequest.findFirst({
      where: { verificationUuid: req.params.uuid, status: 'READY' },
      include: { student: { select: { firstName: true, lastName: true, user: { select: { userIdDisplay: true } } } } },
    });
    if (!request) return res.status(404).json({ valid: false, message: 'Transcript not found or invalid QR code.' });

    res.json({
      valid: true,
      student: {
        name: `${request.student?.firstName || ''} ${request.student?.lastName || ''}`.trim(),
        id: request.student?.user?.userIdDisplay,
      },
      issuedAt: request.updatedAt,
      purpose: request.purpose,
    });
  } catch (err) { next(err); }
});

module.exports = router;
