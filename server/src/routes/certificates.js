// server/src/routes/certificates.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { adminOnly } = require('../middleware/rbac');
const pdfService = require('../services/pdf.service');
const { v4: uuidv4 } = require('uuid');

router.post('/generate/:studentId', authenticate, adminOnly, async (req, res, next) => {
  try {
    const sp = await prisma.studentProfile.findUnique({
      where: { id: req.params.studentId },
      include: { user: true, programme: true },
    });
    if (!sp) return res.status(404).json({ error: 'Student not found' });

    await prisma.user.update({ where: { id: sp.userId }, data: { status: 'GRADUATED' } });

    const certificateNumber = `HMC-CERT-${new Date().getFullYear()}-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;

    const cert = await prisma.degreeCertificate.create({
      data: {
        studentId: req.params.studentId,
        certificateNumber,
        verificationUuid: uuidv4(),
        graduationDate: req.body.graduationDate ? new Date(req.body.graduationDate) : new Date(),
        programmeName: req.body.programmeName || sp.programme?.name || '',
      },
    });

    const pdfBuffer = await pdfService.generateDegreeCertificate(req.params.studentId, cert);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="HMC-Degree-Certificate-${certificateNumber}.pdf"`,
    });
    res.send(pdfBuffer);
  } catch (err) { next(err); }
});

router.get('/verify/:uuid', async (req, res, next) => {
  try {
    const cert = await prisma.degreeCertificate.findFirst({
      where: { verificationUuid: req.params.uuid },
      include: {
        student: { select: { firstName: true, lastName: true, user: { select: { userIdDisplay: true } } } },
      },
    });
    if (!cert) return res.status(404).json({ valid: false });
    res.json({
      valid: true,
      student: {
        name: `${cert.student?.firstName || ''} ${cert.student?.lastName || ''}`.trim(),
        id: cert.student?.user?.userIdDisplay,
      },
      programme: cert.programmeName,
      graduationDate: cert.graduationDate,
      certNumber: cert.certificateNumber,
    });
  } catch (err) { next(err); }
});

module.exports = router;
