// server/src/routes/references.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const crypto = require('crypto');
const { authenticate } = require('../middleware/auth');
const emailService = require('../services/email.service');

router.get('/applicant/:id', authenticate, async (req, res, next) => {
  try {
    const refs = await prisma.applicantReference.findMany({ where: { applicantId: req.params.id } });
    res.json(refs);
  } catch (err) { next(err); }
});

router.post('/send', authenticate, async (req, res, next) => {
  try {
    const { applicantId, refType, refereeName, refereeEmail, refereePhone } = req.body;
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const existing = await prisma.applicantReference.findFirst({
      where: { applicantId, refType },
    });

    const ref = existing
      ? await prisma.applicantReference.update({
          where: { id: existing.id },
          data: { refereeName, refereeEmail, refereePhone, token, tokenExpiresAt: expires, status: 'PENDING' },
        })
      : await prisma.applicantReference.create({
          data: { applicantId, refType, refereeName, refereeEmail, refereePhone, token, tokenExpiresAt: expires, status: 'PENDING' },
        });

    const applicant = await prisma.applicant.findUnique({
      where: { id: applicantId },
      include: { programme: { select: { name: true } } },
    });
    const formData = applicant?.formData || {};
    const applicantName = `${formData.firstName || ''} ${formData.lastName || ''}`.trim();

    const referenceLink = `${process.env.CLIENT_URL}/references/${token}`;
    try {
      await emailService.sendReferenceRequest({
        refereeName, refereeEmail,
        applicantName, programme: applicant?.programme?.name,
        referenceLink, refType,
      });
    } catch (_e) {}

    res.json(ref);
  } catch (err) { next(err); }
});

router.put('/:token/submit', async (req, res, next) => {
  try {
    const ref = await prisma.applicantReference.findUnique({ where: { token: req.params.token } });
    if (!ref) return res.status(404).json({ error: 'Invalid reference link.' });
    if (ref.status === 'RECEIVED') return res.status(400).json({ error: 'Reference already submitted.' });
    if (ref.tokenExpiresAt < new Date()) return res.status(400).json({ error: 'This reference link has expired.' });

    await prisma.applicantReference.update({
      where: { token: req.params.token },
      data: { response: req.body, submittedAt: new Date(), status: 'RECEIVED' },
    });
    res.json({ success: true, message: 'Thank you for submitting your reference.' });
  } catch (err) { next(err); }
});

router.post('/:id/resend', authenticate, async (req, res, next) => {
  try {
    const ref = await prisma.applicantReference.findUnique({ where: { id: req.params.id } });
    if (!ref) return res.status(404).json({ error: 'Reference not found' });

    const newToken = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const updated = await prisma.applicantReference.update({
      where: { id: req.params.id },
      data: { token: newToken, tokenExpiresAt: expires, status: 'PENDING' },
    });

    const referenceLink = `${process.env.CLIENT_URL}/references/${newToken}`;
    try {
      await emailService.sendReferenceRequest({
        refereeName: ref.refereeName,
        refereeEmail: ref.refereeEmail,
        referenceLink,
        refType: ref.refType,
      });
    } catch (_e) {}

    res.json(updated);
  } catch (err) { next(err); }
});

router.get('/pending', authenticate, async (req, res, next) => {
  try {
    const pending = await prisma.applicantReference.findMany({
      where: { status: { in: ['PENDING', 'EXPIRED'] } },
      include: { applicant: { select: { applicationNo: true, formData: true } } },
      orderBy: { tokenExpiresAt: 'asc' },
    });
    const flat = pending.map(r => {
      const fd = r.applicant?.formData || {};
      const name = `${fd.firstName || ''} ${fd.lastName || ''}`.trim();
      return {
        id: r.id,
        applicantName: name || r.applicant?.applicationNo || '—',
        refereeName: r.refereeName,
        refereeEmail: r.refereeEmail,
        refereePhone: r.refereePhone,
        refType: String(r.refType || '').toLowerCase(),
        status: String(r.status || '').toLowerCase(),
        tokenExpiresAt: r.tokenExpiresAt,
      };
    });
    res.json({ references: flat });
  } catch (err) { next(err); }
});

router.get('/:token', async (req, res, next) => {
  try {
    const ref = await prisma.applicantReference.findUnique({ where: { token: req.params.token } });
    if (!ref) return res.status(404).json({ error: 'Invalid link.' });
    if (ref.tokenExpiresAt < new Date()) return res.status(400).json({ error: 'This link has expired.' });

    const applicant = await prisma.applicant.findUnique({
      where: { id: ref.applicantId },
      include: { programme: { select: { name: true } } },
    });
    const formData = applicant?.formData || {};

    res.json({
      ref: { id: ref.id, refType: ref.refType, status: ref.status },
      applicant: {
        firstName: formData.firstName,
        lastName: formData.lastName,
        programme: applicant?.programme,
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
