// server/src/routes/references.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const crypto = require('crypto');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const emailService = require('../services/email.service');

const admissionsAccess = requireRole('FULL_ADMIN', 'TEACHER_ADMIN', 'ADMISSIONS_OFFICER');

// 5-minute clock-skew tolerance for token expiry checks (DB vs app server drift,
// and any short gap between referee receiving the link and submitting).
const TOKEN_SKEW_MS = 5 * 60 * 1000;
function isExpired(when) {
  return when && new Date(when).getTime() + TOKEN_SKEW_MS < Date.now();
}

router.get('/applicant/:id', authenticate, admissionsAccess, async (req, res, next) => {
  try {
    const refs = await prisma.applicantReference.findMany({ where: { applicantId: req.params.id } });
    res.json(refs);
  } catch (err) { next(err); }
});

const VALID_REF_TYPES = new Set(['PASTORAL', 'CHRISTIAN_LEADER']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/send', authenticate, admissionsAccess, async (req, res, next) => {
  try {
    const { applicantId, refereeName, refereePhone } = req.body;
    const refereeEmail = req.body.refereeEmail ? String(req.body.refereeEmail).trim().toLowerCase() : '';
    const refType = String(req.body.refType || '').toUpperCase();

    if (!applicantId) return res.status(400).json({ error: 'applicantId is required' });
    if (!VALID_REF_TYPES.has(refType)) {
      return res.status(400).json({ error: `refType must be one of: ${[...VALID_REF_TYPES].join(', ')}` });
    }
    if (!refereeName || String(refereeName).trim().length < 2) {
      return res.status(400).json({ error: 'refereeName is required' });
    }
    if (!EMAIL_RE.test(refereeEmail)) {
      return res.status(400).json({ error: 'refereeEmail is not a valid email address' });
    }

    const applicantExists = await prisma.applicant.findUnique({ where: { id: applicantId }, select: { id: true } });
    if (!applicantExists) return res.status(404).json({ error: 'Applicant not found' });

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

// Whitelisted fields the referee form may submit. Anything else is dropped
// before persistence so the JSONB column can't be turned into a dumping ground.
const REFERENCE_RESPONSE_FIELDS = new Set([
  'character', 'spiritualMaturity', 'ministry', 'leadership', 'concerns',
  'overallRecommendation', 'comments', 'relationship', 'knownForYears',
  'signature', 'signatureDate',
]);
const REFERENCE_RESPONSE_MAX_BYTES = 32 * 1024;

router.put('/:token/submit', async (req, res, next) => {
  try {
    const ref = await prisma.applicantReference.findUnique({ where: { token: req.params.token } });
    if (!ref) return res.status(404).json({ error: 'Invalid reference link.' });
    if (ref.status === 'RECEIVED') return res.status(400).json({ error: 'Reference already submitted.' });
    if (isExpired(ref.tokenExpiresAt)) return res.status(400).json({ error: 'This reference link has expired.' });

    // Pick allowlisted fields from the public, unauthenticated body.
    const response = {};
    for (const k of REFERENCE_RESPONSE_FIELDS) {
      if (req.body[k] !== undefined) response[k] = req.body[k];
    }
    // Hard size cap before persisting.
    const bytes = Buffer.byteLength(JSON.stringify(response), 'utf8');
    if (bytes > REFERENCE_RESPONSE_MAX_BYTES) {
      return res.status(413).json({ error: `Reference response exceeds ${REFERENCE_RESPONSE_MAX_BYTES} byte limit.` });
    }

    await prisma.applicantReference.update({
      where: { token: req.params.token },
      data: { response, submittedAt: new Date(), status: 'RECEIVED' },
    });
    res.json({ success: true, message: 'Thank you for submitting your reference.' });
  } catch (err) { next(err); }
});

router.post('/:id/resend', authenticate, admissionsAccess, async (req, res, next) => {
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

router.get('/pending', authenticate, admissionsAccess, async (req, res, next) => {
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
    if (isExpired(ref.tokenExpiresAt)) return res.status(400).json({ error: 'This link has expired.' });

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
