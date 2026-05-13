const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const crypto = require('crypto');
const { authenticate } = require('../middleware/auth');
const emailService = require('../services/email.service');

// GET /api/references/applicant/:id
router.get('/applicant/:id', authenticate, async (req, res, next) => {
  try {
    const refs = await prisma.reference.findMany({ where: { applicant_id: req.params.id } });
    res.json(refs);
  } catch (err) { next(err); }
});

// POST /api/references/send
router.post('/send', authenticate, async (req, res, next) => {
  try {
    const { applicant_id, ref_type, referee_name, referee_email, referee_phone } = req.body;
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days

    const ref = await prisma.reference.upsert({
      where: { applicant_id_ref_type: { applicant_id, ref_type } },
      create: { applicant_id, ref_type, referee_name, referee_email, referee_phone, token, token_expires_at: expires, status: 'pending' },
      update: { referee_name, referee_email, referee_phone, token, token_expires_at: expires, status: 'pending' },
    });

    const applicant = await prisma.applicant.findUnique({
      where: { id: applicant_id }, select: { id: true, first_name: true, last_name: true, programme: { select: { name: true } } },
    });

    const referenceLink = `${process.env.CLIENT_URL}/references/${token}`;
    await emailService.sendReferenceRequest({ referee_name, referee_email, applicantName: `${applicant.first_name} ${applicant.last_name}`, programme: applicant.programme?.name, referenceLink, ref_type });

    res.json(ref);
  } catch (err) { next(err); }
});

// PUT /api/references/:token/submit — PUBLIC (no auth)
router.put('/:token/submit', async (req, res, next) => {
  try {
    const ref = await prisma.reference.findUnique({ where: { token: req.params.token } });
    if (!ref) return res.status(404).json({ error: 'Invalid reference link.' });
    if (ref.status === 'received') return res.status(400).json({ error: 'Reference already submitted.' });
    if (ref.token_expires_at < new Date()) return res.status(400).json({ error: 'This reference link has expired. Please ask the applicant to resend.' });

    const updated = await prisma.reference.update({
      where: { token: req.params.token },
      data: { response: req.body, submitted_at: new Date(), status: 'received' },
    });
    res.json({ success: true, message: 'Thank you for submitting your reference.' });
  } catch (err) { next(err); }
});

// POST /api/references/:id/resend
router.post('/:id/resend', authenticate, async (req, res, next) => {
  try {
    const ref = await prisma.reference.findUnique({ where: { id: req.params.id } });
    const newToken = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const updated = await prisma.reference.update({
      where: { id: req.params.id },
      data: { token: newToken, token_expires_at: expires, status: 'pending' },
    });

    const referenceLink = `${process.env.CLIENT_URL}/references/${newToken}`;
    await emailService.sendReferenceRequest({ referee_name: ref.referee_name, referee_email: ref.referee_email, referenceLink, ref_type: ref.ref_type });

    res.json(updated);
  } catch (err) { next(err); }
});

// GET /api/references/pending
router.get('/pending', authenticate, async (req, res, next) => {
  try {
    const pending = await prisma.reference.findMany({
      where: { status: { in: ['pending', 'expired'] } },
      include: { applicant: { select: { first_name: true, last_name: true, application_no: true } } },
      orderBy: { token_expires_at: 'asc' },
    });
    res.json(pending);
  } catch (err) { next(err); }
});

// GET /api/references/:token — public — get form details for referee
router.get('/:token', async (req, res, next) => {
  try {
    const ref = await prisma.reference.findUnique({ where: { token: req.params.token } });
    if (!ref) return res.status(404).json({ error: 'Invalid link.' });
    if (ref.token_expires_at < new Date()) return res.status(400).json({ error: 'This link has expired.' });

    const applicant = await prisma.applicant.findUnique({
      where: { id: ref.applicant_id },
      select: { first_name: true, last_name: true, programme: { select: { name: true } } },
    });
    res.json({ ref: { id: ref.id, ref_type: ref.ref_type, status: ref.status }, applicant });
  } catch (err) { next(err); }
});

module.exports = router;
