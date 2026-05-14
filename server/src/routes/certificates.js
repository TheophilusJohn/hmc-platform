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
      include: {
        user: true,
        programme: true,
        enrollments: { select: { resultStatus: true, isArrear: true } },
        degreeCertificate: { select: { id: true } },
      },
    });
    if (!sp) return res.status(404).json({ error: 'Student not found' });

    // Idempotency: refuse a second cert for the same student.
    if (sp.degreeCertificate) {
      return res.status(400).json({ error: 'A degree certificate already exists for this student' });
    }

    // Programme-completion check: every enrollment must be PASS (allow override
    // with ?force=true for admin discretion, since pre-existing data may be
    // partial). Refuses if any enrollment is pending or failed.
    const enrollments = sp.enrollments || [];
    const force = String(req.query.force || '').toLowerCase() === 'true';
    if (!force) {
      if (enrollments.length === 0) {
        return res.status(400).json({ error: 'Student has no enrollments — cannot certify graduation. Pass ?force=true to override.' });
      }
      const failedOrPending = enrollments.find(e => e.resultStatus !== 'PASS');
      if (failedOrPending) {
        return res.status(400).json({
          error: `Student has at least one enrollment not in PASS status (found ${failedOrPending.resultStatus}). Resolve or pass ?force=true to override.`,
        });
      }
    }

    const crypto = require('crypto');
    const certificateNumber = `HMC-CERT-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    // Atomic: create the cert row + flip GRADUATED together. If the PDF render
    // fails afterwards, the row still exists and the next request reads the
    // existing certificate (idempotent path above).
    const cert = await prisma.$transaction(async (tx) => {
      const created = await tx.degreeCertificate.create({
        data: {
          studentId: req.params.studentId,
          certificateNumber,
          verificationUuid: uuidv4(),
          graduationDate: req.body.graduationDate ? new Date(req.body.graduationDate) : new Date(),
          programmeName: req.body.programmeName || sp.programme?.name || '',
        },
      });
      await tx.user.update({ where: { id: sp.userId }, data: { status: 'GRADUATED' } });
      return created;
    });

    const pdfBuffer = await pdfService.generateDegreeCertificate(req.params.studentId, cert);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="HMC-Degree-Certificate-${certificateNumber}.pdf"`,
    });
    res.send(pdfBuffer);
  } catch (err) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'Certificate number collision — please retry.' });
    next(err);
  }
});

router.get('/verify/:uuid', async (req, res, next) => {
  try {
    const cert = await prisma.degreeCertificate.findFirst({
      where: { verificationUuid: req.params.uuid },
      include: {
        student: { select: { firstName: true, lastName: true } },
      },
    });
    if (!cert) return res.status(404).json({ valid: false });
    // Public endpoint: return only the fields a verifier needs to confirm the
    // certificate. userIdDisplay is the login identity and should not leak via
    // a QR-code lookup that anyone with the UUID can hit.
    res.json({
      valid: true,
      student: {
        name: `${cert.student?.firstName || ''} ${cert.student?.lastName || ''}`.trim(),
      },
      programme: cert.programmeName,
      graduationDate: cert.graduationDate,
      certNumber: cert.certificateNumber,
    });
  } catch (err) { next(err); }
});

module.exports = router;
