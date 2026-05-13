const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authenticate } = require('../middleware/auth');
const { adminOnly } = require('../middleware/rbac');
const pdfService = require('../services/pdf.service');
const notif = require('../services/notification.service');

// POST /api/transcripts/unofficial/:studentId
router.post('/unofficial/:studentId', authenticate, async (req, res, next) => {
  try {
    if (req.user.role === 'student' && req.user.id !== req.params.studentId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const pdfBuffer = await pdfService.generateUnofficialTranscript(req.params.studentId);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="HMC-Unofficial-Transcript.pdf"` });
    res.send(pdfBuffer);
  } catch (err) { next(err); }
});

// POST /api/transcripts/official/request
router.post('/official/request', authenticate, async (req, res, next) => {
  try {
    if (req.user.role !== 'student') return res.status(403).json({ error: 'Students only' });
    const { purpose } = req.body;

    const feeCheck = await prisma.systemSetting.findUnique({ where: { key: 'transcript_fee' } });
    const feeAmount = feeCheck?.value?.amount || 0;

    if (feeAmount > 0) {
      const paid = await prisma.payment.findFirst({ where: { student_id: req.user.id, notes: { contains: 'official_transcript' } } });
      if (!paid) return res.status(402).json({ error: 'Transcript fee must be paid before requesting.', fee_amount: feeAmount });
    }

    const request = await prisma.officialTranscriptRequest.create({
      data: { student_id: req.user.id, purpose, status: 'requested' },
    });
    res.status(201).json(request);
  } catch (err) { next(err); }
});

// POST /api/transcripts/official/generate/:requestId
router.post('/official/generate/:requestId', authenticate, adminOnly, async (req, res, next) => {
  try {
    const request = await prisma.officialTranscriptRequest.findUnique({ where: { id: req.params.requestId } });
    if (!request) return res.status(404).json({ error: 'Request not found' });

    const { v4: uuidv4 } = require('uuid');
    const verificationId = uuidv4();

    const pdfBuffer = await pdfService.generateOfficialTranscript(request.student_id, req.params.requestId, verificationId);

    await prisma.officialTranscriptRequest.update({
      where: { id: req.params.requestId },
      data: { status: 'ready', verification_id: verificationId, generated_at: new Date() },
    });

    await notif.createNotification(request.student_id, 'transcript_ready', 'Official Transcript Ready', 'Your official transcript has been generated and is ready for download.', '/student/help');

    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="HMC-Official-Transcript.pdf"` });
    res.send(pdfBuffer);
  } catch (err) { next(err); }
});

// GET /api/transcripts/official/requests
router.get('/official/requests', authenticate, adminOnly, async (req, res, next) => {
  try {
    const requests = await prisma.officialTranscriptRequest.findMany({
      include: { student: { include: { student_profile: { select: { first_name: true, last_name: true } } } } },
      orderBy: { created_at: 'desc' },
    });
    res.json(requests);
  } catch (err) { next(err); }
});

// GET /api/transcripts/official/my-requests
router.get('/official/my-requests', authenticate, async (req, res, next) => {
  try {
    const requests = await prisma.officialTranscriptRequest.findMany({
      where: { student_id: req.user.id },
      orderBy: { created_at: 'desc' },
    });
    res.json(requests);
  } catch (err) { next(err); }
});

// GET /api/transcripts/verify/:uuid — PUBLIC
router.get('/verify/:uuid', async (req, res, next) => {
  try {
    const request = await prisma.officialTranscriptRequest.findFirst({
      where: { verification_id: req.params.uuid, status: 'ready' },
      include: {
        student: { include: { student_profile: { select: { first_name: true, last_name: true } } } },
      },
    });
    if (!request) return res.status(404).json({ valid: false, message: 'Transcript not found or invalid QR code.' });

    res.json({
      valid: true,
      student: { name: `${request.student.student_profile?.first_name} ${request.student.student_profile?.last_name}`, id: request.student.user_id_display },
      issued_at: request.generated_at,
      purpose: request.purpose,
    });
  } catch (err) { next(err); }
});

module.exports = router;
