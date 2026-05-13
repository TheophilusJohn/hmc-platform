const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authenticate } = require('../middleware/auth');
const { adminOnly } = require('../middleware/rbac');
const pdfService = require('../services/pdf.service');

// POST /api/certificates/generate/:studentId
router.post('/generate/:studentId', authenticate, adminOnly, async (req, res, next) => {
  try {
    const student = await prisma.user.findUnique({
      where: { id: req.params.studentId },
      include: { student_profile: true },
    });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    // Mark as graduated
    await prisma.user.update({ where: { id: req.params.studentId }, data: { status: 'graduated' } });

    const { v4: uuidv4 } = require('uuid');
    const certNumber = `HMC-CERT-${new Date().getFullYear()}-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;

    const cert = await prisma.degreeCertificate.create({
      data: {
        student_id: req.params.studentId,
        cert_number: certNumber,
        verification_id: uuidv4(),
        graduation_date: req.body.graduation_date ? new Date(req.body.graduation_date) : new Date(),
        programme_name: req.body.programme_name,
      },
    });

    const pdfBuffer = await pdfService.generateDegreeCertificate(req.params.studentId, cert);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="HMC-Degree-Certificate-${certNumber}.pdf"` });
    res.send(pdfBuffer);
  } catch (err) { next(err); }
});

// GET /api/certificates/verify/:uuid — PUBLIC
router.get('/verify/:uuid', async (req, res, next) => {
  try {
    const cert = await prisma.degreeCertificate.findFirst({
      where: { verification_id: req.params.uuid },
      include: { student: { include: { student_profile: { select: { first_name: true, last_name: true } } } } },
    });
    if (!cert) return res.status(404).json({ valid: false });
    res.json({
      valid: true,
      student: { name: `${cert.student.student_profile?.first_name} ${cert.student.student_profile?.last_name}`, id: cert.student.user_id_display },
      programme: cert.programme_name,
      graduation_date: cert.graduation_date,
      cert_number: cert.cert_number,
    });
  } catch (err) { next(err); }
});

module.exports = router;
