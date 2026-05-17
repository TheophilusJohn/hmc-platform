// server/src/routes/public.js
// Unauthenticated read-only endpoints for the public marketing surface
// (Apply page, etc.) and the public application form (Phase 2).
// Mount BEFORE any router that applies `authenticate`.
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const geoip = require('geoip-lite');
const { Prisma } = require('@prisma/client');
const prisma = require('../config/db');
const minioService = require('../services/minio.service');
const { nowInIST } = require('../utils/dateUtils');

// In-memory multer; per-route file caps applied in the handler. The outer
// limit here is a coarse safety net (12 MB) since per-doctype rules diverge.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

// Tighter limiter for the destructive endpoints (start + submit) — 10/hour/IP.
// The broader /api/public 60/min limiter from app.js still applies on top.
const writeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many submissions from this address — please try again in an hour.' },
});

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DRAFT_CODE_RE = /^HMC-DRAFT-[A-Z0-9]{6}$/;

function isEmail(s) {
  return typeof s === 'string' && EMAIL_RE.test(s.trim()) && s.trim().length <= 254;
}
function normEmail(s) {
  return String(s || '').trim().toLowerCase();
}

// "HMC-DRAFT-XXXXXX" with 6 uppercase alphanumeric chars from a 32-char alphabet
// (no I/O/0/1 to avoid confusion when admissions reads it back over phone).
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
function generateDraftCode() {
  const bytes = crypto.randomBytes(6);
  let out = '';
  for (let i = 0; i < 6; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return `HMC-DRAFT-${out}`;
}

// Whitelisted formData keys. Anything else from req.body.formData is dropped —
// no `__proto__` / arbitrary keys make it into JSONB. Two specials:
//   - `documents` is the per-docType uploaded-file map managed by /documents handlers
//   - `educationEntries`/`languages` are arrays moved into their own tables on submit
const FORM_KEYS = new Set([
  // Personal
  'firstName', 'lastName', 'email', 'phone',
  'gender', 'dateOfBirth', 'placeOfBirth', 'nationality',
  'maritalStatus', 'spouseName', 'childrenInfo', 'motherTongue',
  // 'OFFLINE' | 'ONLINE'. Domestic-only in the form (international is implicit
  // ONLINE and set server-side at submit).
  'studyMode',
  // Addresses
  'presentAddressLine', 'presentAddressState', 'presentAddressCountry', 'presentAddressPin',
  'permanentAddressLine', 'permanentAddressState', 'permanentAddressCountry', 'permanentAddressPin',
  // Contact
  'mobile', 'whatsapp', 'emergencyContact',
  // International-only
  'passportNumber', 'passportCountryOfIssue', 'countryOfResidence', 'cityOfResidence',
  'currentVisaStatus', 'intendedIndianVisa', 'indiaEmergencyContact',
  // Background — original Phase 2a narrative slots
  'substanceHistory', 'criminalHistory', 'influenceForApplying',
  // Background — family fields collected on Step 3 of the public form.
  // These don't have dedicated columns on Applicant (no schema change this
  // stage); they live in formData JSON for later admin viewing via flatten.
  'fatherName', 'fatherOccupation', 'motherName', 'motherOccupation',
  'numberOfSiblings', 'familyChurchAffiliation', 'familyChristianBackground',
  // Education
  'technicalQualification', 'theologicalQualification',
  'currentlyEmployed', 'workExperience',
  'educationEntries', 'languages',
  // Spiritual — Phase 2a column-backed keys
  'receivedChrist', 'receivedChristWhen',
  'waterBaptism', 'waterBaptismWhen',
  'salvationTestimony',
  'churchDenomination', 'churchName', 'churchAddress',
  'pastorName', 'pastorAddress',
  'holySpiritInfilling', 'callForMinistry',
  // Spiritual — Step 4 fields without dedicated columns; formData-only.
  // baptismStatus is the tri-state 'Baptized' | 'Not yet baptized' | 'Prefer
  // not to say' from the radio; the submit handler also derives the existing
  // boolean waterBaptism + waterBaptismWhen columns from it.
  'baptismStatus', 'baptismDate', 'baptismLocation',
  'yearsAtCurrentChurch', 'previousChurches', 'spiritualGifts',
  'ministryInvolvement', 'whyHmc', 'futureMinistryPlans',
  // Financial
  'sponsoredByOrg', 'paymentMethod', 'commitTwoHoursDaily', 'feeResponsibility',
  'sponsorName', 'sponsorDetails', 'sponsorContact', 'sponsorEmail',
  'needsFinancialAid', 'financialAidNote',
  // Health
  'healthResponses',
  // Declarations
  'studentDeclarationAgreed', 'parentDeclarationAgreed',
  'commitmentStatementAgreed', 'feeDeclarationAgreed',
  'feeDeclarationSponsorName', 'feeDeclarationSponsorContact', 'feeDeclarationSponsorEmail',
  // Documents map — managed by /documents handlers, but allowed through PUT
  // so the FE can clear or reorder if needed.
  'documents',
]);

function pickForm(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const k of FORM_KEYS) if (raw[k] !== undefined) out[k] = raw[k];
  return out;
}

// Document vocabulary — 14 camelCase keys covering the full public-form
// document checklist (shared + domestic-only + international-only). Replaces
// the 6 uppercase placeholders from Phase 2a; the new keys match the FE
// DOCUMENT_SPECS map exactly so there is one vocabulary across FE + BE.
//
// Per-docType caps:
//   - photo                       — 5MB, JPEG/PNG only
//   - pastorReference, character* — 10MB, PDF only (signed letters)
//   - everything else             — 10MB, PDF/JPEG/PNG
// (Multer's outer cap is 12MB; per-docType rules narrow it below.)
const PDF_OR_IMAGE = ['application/pdf', 'image/jpeg', 'image/png'];
const PDF_ONLY     = ['application/pdf'];
const PHOTO_ONLY   = ['image/jpeg', 'image/png'];
const MB10 = 10 * 1024 * 1024;
const MB5  = 5  * 1024 * 1024;

const DOC_RULES = {
  // shared across DOMESTIC + INTERNATIONAL
  photo:                            { maxBytes: MB5,  allowed: PHOTO_ONLY },
  birthCertificate:                 { maxBytes: MB10, allowed: PDF_OR_IMAGE },
  baptismCertificate:               { maxBytes: MB10, allowed: PDF_OR_IMAGE },
  pastorReference:                  { maxBytes: MB10, allowed: PDF_ONLY },
  characterReference1:              { maxBytes: MB10, allowed: PDF_ONLY },
  characterReference2:              { maxBytes: MB10, allowed: PDF_ONLY },
  // domestic-only
  tenthMarkSheet:                   { maxBytes: MB10, allowed: PDF_OR_IMAGE },
  twelfthMarkSheet:                 { maxBytes: MB10, allowed: PDF_OR_IMAGE },
  bachelorsMarkSheet:               { maxBytes: MB10, allowed: PDF_OR_IMAGE },
  idProof:                          { maxBytes: MB10, allowed: PDF_OR_IMAGE },
  // international-only
  highestQualificationTranscripts:  { maxBytes: MB10, allowed: PDF_OR_IMAGE },
  bachelorsTranscript:              { maxBytes: MB10, allowed: PDF_OR_IMAGE },
  passportCopy:                     { maxBytes: MB10, allowed: PDF_OR_IMAGE },
  englishProficiency:               { maxBytes: MB10, allowed: PDF_OR_IMAGE },
};
const DOC_TYPES = new Set(Object.keys(DOC_RULES));

// Filename sanitizer for MinIO object keys. The caller-supplied originalname
// can contain anything; we tame it before composing the object path. Rules:
//   1. strip control characters and other non-printable bytes
//   2. strip path separators (/, \)
//   3. strip ".." sequences (path-traversal token in filesystems)
//   4. collapse whitespace runs to a single underscore
//   5. anything left outside [A-Za-z0-9._-] → underscore
//   6. collapse repeated underscores
//   7. trim leading/trailing dots/underscores
//   8. preserve extension if present (≤8 chars after the last dot)
//   9. cap total length at ~100 chars
//  10. fallback to "file" if sanitization leaves nothing usable
function sanitizeFilename(input) {
  let s = (typeof input === 'string') ? input : '';
  s = s.replace(/[\x00-\x1F\x7F-\x9F]/g, '');     // control chars
  s = s.replace(/[\\\/]/g, '_');                  // path separators
  s = s.replace(/\.\./g, '_');                    // traversal token
  s = s.replace(/\s+/g, '_');                     // whitespace runs
  s = s.replace(/[^A-Za-z0-9._-]/g, '_');         // anything else
  s = s.replace(/_+/g, '_');                      // collapse repeats
  s = s.replace(/^[._]+|[._]+$/g, '');            // trim edges

  const dot = s.lastIndexOf('.');
  let base, ext;
  if (dot > 0 && dot < s.length - 1 && s.length - dot - 1 <= 8) {
    base = s.slice(0, dot);
    ext  = s.slice(dot);
  } else {
    base = s;
    ext  = '';
  }
  const MAX = 100;
  if (base.length + ext.length > MAX) base = base.slice(0, MAX - ext.length);

  if (!base && !ext) return 'file';
  if (!base)         return 'file' + ext;
  return base + ext;
}

// Day windows for the draft TTL. Bumped on every PUT.
const DRAFT_TTL_DAYS = 30;
function draftExpiresAt(from = new Date()) {
  return new Date(from.getTime() + DRAFT_TTL_DAYS * 24 * 60 * 60 * 1000);
}

// Centralized loader: look up by code, enforce email match, refuse if expired
// or already submitted. Returns { draft } on success or { error, status } on
// failure — callers translate to res.status().json().
async function loadDraftForAccess(code, emailFromCaller) {
  if (!code || !DRAFT_CODE_RE.test(code)) {
    return { error: 'Invalid draft code', status: 404 };
  }
  if (!isEmail(emailFromCaller)) {
    return { error: 'email is required for draft access', status: 400 };
  }
  const draft = await prisma.applicantDraft.findUnique({
    where: { code },
    include: { applicant: { select: { id: true } } },
  });
  if (!draft) return { error: 'Draft not found', status: 404 };
  if (draft.expiresAt < new Date()) return { error: 'Draft has expired', status: 404 };
  if (draft.applicant) return { error: 'Draft has already been submitted', status: 404 };
  if (normEmail(draft.email) !== normEmail(emailFromCaller)) {
    return { error: 'Email does not match this draft', status: 403 };
  }
  return { draft };
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/public/programmes?type=domestic|international  (existing — Phase 1)
// ──────────────────────────────────────────────────────────────────────────────
router.get('/programmes', async (req, res, next) => {
  try {
    const type = String(req.query.type || 'domestic').toLowerCase() === 'international'
      ? 'international'
      : 'domestic';

    const where = { status: 'active' };
    if (type === 'international') where.code = { not: 'CTH' };

    const rows = await prisma.programme.findMany({
      where,
      select: {
        id: true,
        code: true,
        name: true,
        durationYears: true,
        medium: true,
        availableOffline: true,
        availableOnline: true,
        totalCostDomestic: true,
        totalCostInternational: true,
        applicationFeeDomestic: true,
        applicationFeeInternational: true,
      },
      orderBy: { name: 'asc' },
    });

    const programmes = rows.map(p => {
      const cost = type === 'international' ? p.totalCostInternational : p.totalCostDomestic;
      const fee  = type === 'international' ? p.applicationFeeInternational : p.applicationFeeDomestic;
      const modes = [];
      if (type === 'international') {
        if (p.availableOnline) modes.push('online');
      } else {
        if (p.availableOffline) modes.push('offline');
        if (p.availableOnline)  modes.push('online');
      }
      return {
        id: p.id, code: p.code, name: p.name,
        durationYears: p.durationYears, medium: p.medium, modes,
        totalCost: cost != null ? cost.toString() : null,
        applicationFee: fee != null ? fee.toString() : null,
        currency: type === 'international' ? 'USD' : 'INR',
      };
    });

    res.json({ type, programmes });
  } catch (err) { next(err); }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/public/geo
// Returns { country, applicantType } based on the caller's IP via geoip-lite.
// nginx provides X-Forwarded-For; app.js has `trust proxy` set so req.ip
// already resolves to the client IP. On any lookup failure we default to
// INTERNATIONAL — the international form has fewer assumptions and a
// hard-to-pay domestic applicant is a worse failure mode than the reverse.
// ──────────────────────────────────────────────────────────────────────────────
router.get('/geo', (req, res) => {
  try {
    const ip = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim();
    if (!ip) return res.json({ country: null, applicantType: 'INTERNATIONAL' });
    const lookup = geoip.lookup(ip);
    if (!lookup || !lookup.country) {
      return res.json({ country: null, applicantType: 'INTERNATIONAL' });
    }
    res.json({
      country: lookup.country,
      applicantType: lookup.country === 'IN' ? 'DOMESTIC' : 'INTERNATIONAL',
    });
  } catch (_e) {
    res.json({ country: null, applicantType: 'INTERNATIONAL' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/public/applications/start  — 10/hr/IP
// Body: { email, phone?, studentType, programmeCode? }
// Returns: { code, expiresAt }
// ──────────────────────────────────────────────────────────────────────────────
router.post('/applications/start', writeLimiter, async (req, res, next) => {
  try {
    const { email, phone, studentType, programmeCode, force } = req.body || {};
    if (!isEmail(email)) return res.status(400).json({ error: 'A valid email is required' });
    const st = String(studentType || '').toLowerCase();
    if (st !== 'domestic' && st !== 'international') {
      return res.status(400).json({ error: 'studentType must be "domestic" or "international"' });
    }

    // ── Geo enforcement (leadership decision) ─────────────────────────────────
    // The FE no longer surfaces a domestic/international toggle — geo is the
    // single source of truth for the applicant type, both on the landing page
    // and at the start endpoint. A curl request claiming `studentType:domestic`
    // from a US IP must be refused, otherwise the boundary the FE removed is
    // still bypassable by anyone who reads the network tab.
    //
    // Misclassified applicants (VPN users, travelling Indians, NRI parents,
    // etc.) contact admissions@hmc.college — admissions handles those manually.
    const lookup = (() => { try { return geoip.lookup(req.ip); } catch (_e) { return null; } })();
    const serverGeoType = lookup?.country === 'IN' ? 'domestic' : 'international';
    if (st !== serverGeoType) {
      return res.status(400).json({
        error: 'Application type does not match your detected location. If you believe this is incorrect, please contact admissions@hmc.college.',
      });
    }

    // ── Multiple-applications-per-email choice point (leadership Option B) ────
    // Applicants ARE allowed to apply for multiple programmes, but the system
    // must surface the existing application(s) and make the user choose,
    // rather than silently create a duplicate draft on the same email.
    //
    // `force: true` in the body skips this check — that's the FE telling us
    // the user clicked "Start a NEW application" on the choice screen after
    // seeing their existing applications.
    if (force !== true) {
      const lowerEmail = normEmail(email);
      const [activeDrafts, candidateApplicants] = await Promise.all([
        prisma.applicantDraft.findMany({
          where: {
            email: lowerEmail,
            expiresAt: { gt: new Date() },
            // "Not yet submitted" = no Applicant row references this draft.
            applicant: { is: null },
          },
          select: {
            code: true, programmeCode: true, currentStep: true,
            updatedAt: true, expiresAt: true,
          },
          orderBy: { updatedAt: 'desc' },
        }),
        // formData.email is stored as-typed on Applicant (the draft.email
        // column is normalized at start, but the JSON snapshot is not). We
        // filter where the JSON key exists, then case-insensitive match in
        // JS — fine for HMC's applicant volume; a raw-SQL `LOWER()` query is
        // the upgrade path if volumes grow.
        prisma.applicant.findMany({
          where: { formData: { path: ['email'], not: null } },
          select: {
            applicationNo: true, programmeCode: true,
            pipelineStage: true, submittedAt: true, formData: true,
          },
        }),
      ]);
      const submittedApplications = candidateApplicants
        .filter(a => String(a.formData?.email || '').toLowerCase() === lowerEmail)
        .map(({ formData: _f, ...rest }) => rest);

      if (activeDrafts.length > 0 || submittedApplications.length > 0) {
        // Single Programme batch lookup so the FE can render human-readable names.
        const codes = new Set([
          ...activeDrafts.map(d => d.programmeCode).filter(Boolean),
          ...submittedApplications.map(a => a.programmeCode).filter(Boolean),
        ]);
        const progs = codes.size
          ? await prisma.programme.findMany({
              where: { code: { in: [...codes] } },
              select: { code: true, name: true },
            })
          : [];
        const nameByCode = Object.fromEntries(progs.map(p => [p.code, p.name]));

        return res.status(409).json({
          error: 'EXISTING_APPLICATIONS',
          message: 'This email has existing applications. Please choose how to proceed.',
          activeDrafts: activeDrafts.map(d => ({
            code: d.code,
            programmeCode: d.programmeCode,
            programmeName: d.programmeCode ? (nameByCode[d.programmeCode] || d.programmeCode) : null,
            currentStep: d.currentStep,
            updatedAt: d.updatedAt,
            expiresAt: d.expiresAt,
          })),
          submittedApplications: submittedApplications.map(a => ({
            applicationNo: a.applicationNo,
            programmeCode: a.programmeCode,
            programmeName: a.programmeCode ? (nameByCode[a.programmeCode] || a.programmeCode) : null,
            pipelineStage: a.pipelineStage,
            submittedAt: a.submittedAt,
          })),
        });
      }
    }
    if (phone !== undefined && phone !== null && phone !== '' && typeof phone !== 'string') {
      return res.status(400).json({ error: 'phone must be a string' });
    }
    if (programmeCode !== undefined && programmeCode !== null && programmeCode !== '' && typeof programmeCode !== 'string') {
      return res.status(400).json({ error: 'programmeCode must be a string' });
    }
    // If programmeCode is provided, verify it exists and is allowed for this
    // student type (mirrors the public /programmes endpoint).
    let pCode = null;
    if (programmeCode) {
      const code = String(programmeCode).trim().toUpperCase();
      const prog = await prisma.programme.findUnique({ where: { code }, select: { code: true, status: true } });
      if (!prog || prog.status !== 'active') return res.status(400).json({ error: 'Unknown programme code' });
      if (st === 'international' && code === 'CTH') {
        return res.status(400).json({ error: 'CTH is not available for international applicants' });
      }
      pCode = code;
    }

    const expiresAt = draftExpiresAt();
    // Retry on @unique collision for the generated code. With 32^6 ≈ 10^9 keys
    // collisions are astronomically rare but the retry keeps the API honest.
    let created = null, lastErr;
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateDraftCode();
      try {
        created = await prisma.applicantDraft.create({
          data: {
            code,
            email: normEmail(email),
            phone: phone ? String(phone).trim() : null,
            studentType: st,
            programmeCode: pCode,
            currentStep: 1,
            formData: {},
            expiresAt,
          },
          select: { code: true, expiresAt: true },
        });
        break;
      } catch (e) {
        if (e?.code === 'P2002') { lastErr = e; continue; }
        throw e;
      }
    }
    if (!created) throw lastErr || new Error('Could not allocate draft code');

    res.status(201).json(created);
  } catch (err) { next(err); }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/public/applications/draft/:code?email=...
// ──────────────────────────────────────────────────────────────────────────────
router.get('/applications/draft/:code', async (req, res, next) => {
  try {
    const { draft, error, status } = await loadDraftForAccess(req.params.code, req.query.email);
    if (error) return res.status(status).json({ error });
    res.json({
      code: draft.code,
      email: draft.email,
      phone: draft.phone,
      studentType: draft.studentType,
      programmeCode: draft.programmeCode,
      currentStep: draft.currentStep,
      formData: draft.formData,
      expiresAt: draft.expiresAt,
      updatedAt: draft.updatedAt,
    });
  } catch (err) { next(err); }
});

// ──────────────────────────────────────────────────────────────────────────────
// PUT /api/public/applications/draft/:code
// Body: { email, formData, currentStep, programmeCode?, studentType? }
// ──────────────────────────────────────────────────────────────────────────────
router.put('/applications/draft/:code', async (req, res, next) => {
  try {
    const { email, formData, currentStep, programmeCode, studentType } = req.body || {};
    const { draft, error, status } = await loadDraftForAccess(req.params.code, email);
    if (error) return res.status(status).json({ error });

    const data = { expiresAt: draftExpiresAt() }; // bump TTL on every save
    if (formData !== undefined) {
      if (formData === null || typeof formData !== 'object' || Array.isArray(formData)) {
        return res.status(400).json({ error: 'formData must be an object' });
      }
      // Preserve any documents map already stored — the FE shouldn't be writing
      // through it, but if it does, ensure we don't drop uploaded references.
      const incoming = pickForm(formData);
      const preserved = (draft.formData && draft.formData.documents) ? draft.formData.documents : undefined;
      data.formData = { ...incoming, ...(preserved !== undefined && incoming.documents === undefined ? { documents: preserved } : {}) };
    }
    if (currentStep !== undefined) {
      const n = parseInt(currentStep, 10);
      if (!Number.isInteger(n) || n < 1 || n > 10) {
        return res.status(400).json({ error: 'currentStep must be an integer 1..10' });
      }
      data.currentStep = n;
    }
    if (programmeCode !== undefined) {
      if (programmeCode === null || programmeCode === '') {
        data.programmeCode = null;
      } else {
        const code = String(programmeCode).trim().toUpperCase();
        const prog = await prisma.programme.findUnique({ where: { code }, select: { code: true, status: true } });
        if (!prog || prog.status !== 'active') return res.status(400).json({ error: 'Unknown programme code' });
        if (draft.studentType === 'international' && code === 'CTH') {
          return res.status(400).json({ error: 'CTH is not available for international applicants' });
        }
        data.programmeCode = code;
      }
    }
    if (studentType !== undefined) {
      const st = String(studentType).toLowerCase();
      if (st !== 'domestic' && st !== 'international') {
        return res.status(400).json({ error: 'studentType must be "domestic" or "international"' });
      }
      data.studentType = st;
    }

    const updated = await prisma.applicantDraft.update({
      where: { id: draft.id },
      data,
      select: { updatedAt: true, expiresAt: true, currentStep: true },
    });
    res.json({ success: true, ...updated });
  } catch (err) { next(err); }
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/public/applications/draft/:code/documents/:docType  (multipart)
// fields:  email
// file:    file
// Path-form mirrors the DELETE route so FE and BE share one URL shape per slot.
// ──────────────────────────────────────────────────────────────────────────────
router.post('/applications/draft/:code/documents/:docType', upload.single('file'), async (req, res, next) => {
  try {
    const { email } = req.body || {};
    const { draft, error, status } = await loadDraftForAccess(req.params.code, email);
    if (error) return res.status(status).json({ error });

    const dt = String(req.params.docType || '');
    if (!DOC_TYPES.has(dt)) {
      return res.status(400).json({ error: `docType must be one of: ${[...DOC_TYPES].join(', ')}` });
    }
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const rule = DOC_RULES[dt];
    if (req.file.size > rule.maxBytes) {
      return res.status(400).json({ error: `File exceeds ${Math.round(rule.maxBytes / (1024 * 1024))}MB cap for ${dt}` });
    }
    const mime = String(req.file.mimetype || '').toLowerCase().split(';')[0].trim();
    if (!rule.allowed.includes(mime)) {
      return res.status(400).json({ error: `${dt} accepts: ${rule.allowed.join(', ')}` });
    }

    // Safe object path: applicants/{code}/{docType}/{ts}-{sanitized-name}.
    // sanitizeFilename strips path separators, "..", control chars, collapses
    // whitespace, caps at ~100 chars, preserves the extension, and falls back
    // to "file" if nothing usable survives. sanitizeObjectPath inside
    // minio.service runs again as a defence-in-depth pass.
    const ts = Date.now();
    const safeName = sanitizeFilename(req.file.originalname);
    const objectPath = `applicants/${draft.code}/${dt}/${ts}-${safeName}`;

    // If a previous upload exists for this docType, delete it from MinIO before
    // overwriting the formData slot — keeps the bucket from accumulating orphans.
    const docs = (draft.formData && draft.formData.documents) || {};
    const previous = docs[dt];
    if (previous && previous.objectKey) {
      try { await minioService.deleteFile(previous.objectKey); } catch (_e) { /* best effort */ }
    }

    const storedKey = await minioService.uploadFile(
      req.file.buffer,
      process.env.MINIO_BUCKET || 'hmc-files',
      objectPath,
      mime,
    );

    const slot = {
      docType: dt,
      objectKey: storedKey,
      fileName: req.file.originalname || safeName,
      fileSize: req.file.size,
      mimeType: mime,
      uploadedAt: new Date().toISOString(),
    };
    const nextDocs = { ...docs, [dt]: slot };
    await prisma.applicantDraft.update({
      where: { id: draft.id },
      data: {
        expiresAt: draftExpiresAt(),
        formData: { ...(draft.formData || {}), documents: nextDocs },
      },
    });

    res.status(201).json({ document: slot });
  } catch (err) { next(err); }
});

// ──────────────────────────────────────────────────────────────────────────────
// DELETE /api/public/applications/draft/:code/documents/:docType
// Body: { email }
// ──────────────────────────────────────────────────────────────────────────────
router.delete('/applications/draft/:code/documents/:docType', async (req, res, next) => {
  try {
    const { email } = req.body || {};
    const { draft, error, status } = await loadDraftForAccess(req.params.code, email);
    if (error) return res.status(status).json({ error });
    const dt = String(req.params.docType || '');
    if (!DOC_TYPES.has(dt)) {
      return res.status(400).json({ error: `docType must be one of: ${[...DOC_TYPES].join(', ')}` });
    }
    const docs = (draft.formData && draft.formData.documents) || {};
    const slot = docs[dt];
    if (!slot) return res.status(404).json({ error: 'No document of that type on this draft' });

    if (slot.objectKey) {
      try { await minioService.deleteFile(slot.objectKey); } catch (_e) { /* best effort */ }
    }
    const nextDocs = { ...docs };
    delete nextDocs[dt];
    await prisma.applicantDraft.update({
      where: { id: draft.id },
      data: {
        expiresAt: draftExpiresAt(),
        formData: { ...(draft.formData || {}), documents: nextDocs },
      },
    });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ──────────────────────────────────────────────────────────────────────────────
// Submission validation
// ──────────────────────────────────────────────────────────────────────────────

function nonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}
function isBoolAnswered(v) {
  return v === true || v === false;
}
// Whole-years age from a YYYY-MM-DD string (or any parseable date). Returns
// null when the input is missing or unparseable — callers handle that by
// skipping the age-gated check, since dateOfBirth is already a required
// field elsewhere in validateSubmission.
function ageInYearsFrom(dobString) {
  if (!dobString) return null;
  const d = new Date(dobString);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

function validateSubmission(draft, fd) {
  const errors = [];

  // Universal — always required for either type
  if (!nonEmptyString(fd.firstName)) errors.push('firstName is required');
  if (!nonEmptyString(fd.lastName))  errors.push('lastName is required');
  if (!isEmail(fd.email))            errors.push('email must be a valid address');
  if (!nonEmptyString(fd.gender))    errors.push('gender is required');
  if (!nonEmptyString(fd.dateOfBirth) && !(fd.dateOfBirth instanceof Date)) errors.push('dateOfBirth is required');
  if (!nonEmptyString(fd.nationality)) errors.push('nationality is required');
  if (!nonEmptyString(fd.maritalStatus)) errors.push('maritalStatus is required');
  if (!nonEmptyString(fd.mobile))    errors.push('mobile is required');
  if (!nonEmptyString(fd.presentAddressLine)) errors.push('presentAddressLine is required');
  if (!nonEmptyString(fd.presentAddressState)) errors.push('presentAddressState is required');
  if (!nonEmptyString(fd.presentAddressCountry)) errors.push('presentAddressCountry is required');
  if (!nonEmptyString(fd.emergencyContact)) errors.push('emergencyContact is required');
  // receivedChrist (and receivedChristWhen) removed from the required set —
  // spiritual conversion is now captured via the salvationTestimony textarea
  // and the baptismStatus radio on Step 4. The binary "did you receive
  // Christ" was redundant. Column writes still tolerate either value.
  if (!isBoolAnswered(fd.waterBaptism))   errors.push('waterBaptism must be answered');
  if (!nonEmptyString(fd.churchName))    errors.push('churchName is required');
  if (!nonEmptyString(fd.pastorName))    errors.push('pastorName is required');
  // Declaration agreements collected on Application Summary screen (Stage 2b-3).
  if (fd.studentDeclarationAgreed   !== true) errors.push('studentDeclarationAgreed must be true');
  if (fd.commitmentStatementAgreed  !== true) errors.push('commitmentStatementAgreed must be true');
  if (fd.feeDeclarationAgreed       !== true) errors.push('feeDeclarationAgreed must be true');
  // Parent declaration: required only for applicants under 18. Adult
  // applicants (18+) sign as legally-responsible adults via
  // studentDeclarationAgreed and don't need parental sign-off.
  // Step 2 enforces age >= 16 client-side, so the genuine minor case here
  // is 16- and 17-year-olds. If DOB is missing/invalid this check is
  // skipped — DOB itself is already required earlier in this function, so
  // reaching here without it would fail the request anyway.
  const ageAtSubmit = ageInYearsFrom(fd.dateOfBirth);
  if (ageAtSubmit !== null && ageAtSubmit < 18) {
    if (fd.parentDeclarationAgreed !== true) {
      errors.push('parentDeclarationAgreed must be true for applicants under 18');
    }
  }
  if (!nonEmptyString(draft.programmeCode)) errors.push('programmeCode is required');

  // ── Financial fork (Stage 2b-2 expansion) ─────────────────────────────────
  // Three-way matrix:
  //   DOMESTIC + OFFLINE   → paymentMethod ∈ {fees, workScholarship}; if
  //                          scholarship then commitTwoHoursDaily=true; fee
  //                          responsibility required; needsFinancialAid IGNORED
  //                          (offline applicants pay at the university or via
  //                          campus work — no financial-aid path).
  //   DOMESTIC + ONLINE    → paymentMethod must be 'fees'; needsFinancialAid
  //                          required (NEW); feeResponsibility required.
  //   INTERNATIONAL        → paymentMethod must be 'fees'; needsFinancialAid
  //                          required; feeResponsibility IGNORED (no granularity
  //                          needed for the international cohort).
  // In every branch where needsFinancialAid is required and answered true,
  // financialAidNote is also required and capped at 1000 chars.
  let needsAidRelevant = false;
  if (draft.studentType === 'domestic') {
    const sm = String(fd.studyMode || '').toUpperCase();
    if (sm !== 'OFFLINE' && sm !== 'ONLINE') {
      errors.push('studyMode must be "OFFLINE" or "ONLINE" for domestic applicants');
    }
    const pm = String(fd.paymentMethod || '');
    if (sm === 'OFFLINE') {
      if (pm !== 'fees' && pm !== 'workScholarship') {
        errors.push('paymentMethod must be "fees" or "workScholarship" for domestic-offline');
      }
      if (pm === 'workScholarship' && fd.commitTwoHoursDaily !== true) {
        errors.push('commitTwoHoursDaily must be true when workScholarship is selected');
      }
      // needsFinancialAid intentionally NOT validated here — offline applicants
      // don't see the question and the column stays null.
    } else if (sm === 'ONLINE') {
      if (pm !== 'fees') {
        errors.push('paymentMethod must be "fees" for domestic-online (workScholarship is offline-only)');
      }
      if (!isBoolAnswered(fd.needsFinancialAid)) {
        errors.push('needsFinancialAid must be answered for domestic-online applicants');
      }
      needsAidRelevant = true;
    }
    if (!nonEmptyString(fd.feeResponsibility)) errors.push('feeResponsibility is required for domestic applicants');
  } else if (draft.studentType === 'international') {
    if (!isBoolAnswered(fd.needsFinancialAid)) errors.push('needsFinancialAid must be answered');
    needsAidRelevant = true;
    if (String(fd.paymentMethod || '') !== 'fees') {
      errors.push('paymentMethod must be "fees" for international applicants (workScholarship not allowed)');
    }
    if (!nonEmptyString(fd.passportNumber))         errors.push('passportNumber is required for international applicants');
    if (!nonEmptyString(fd.passportCountryOfIssue)) errors.push('passportCountryOfIssue is required for international applicants');
    if (!nonEmptyString(fd.countryOfResidence))     errors.push('countryOfResidence is required for international applicants');
    if (!nonEmptyString(fd.cityOfResidence))        errors.push('cityOfResidence is required for international applicants');
    // currentVisaStatus / intendedIndianVisa / indiaEmergencyContact dropped
    // per the earlier leadership decision: international students are online-
    // only and don't come to India. Columns remain in the schema but stay
    // null; the submit handler tolerates that.
  } else {
    errors.push('studentType on draft is invalid');
  }

  // financialAidNote required + length-capped when needsFinancialAid was both
  // relevant for this applicant type and answered true.
  if (needsAidRelevant && fd.needsFinancialAid === true) {
    if (!nonEmptyString(fd.financialAidNote)) {
      errors.push('financialAidNote is required when needsFinancialAid is true');
    } else if (String(fd.financialAidNote).length > 1000) {
      errors.push('financialAidNote exceeds 1000 character cap');
    }
  }

  return errors;
}

// Map a possibly-string date-only to a Date for an `@db.Date` column. Returns
// null on missing/invalid.
function toDateOrNull(v) {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/public/applications/draft/:code/submit  — 10/hr/IP
// Body: { email }
// Returns: { applicationNo, applicantId }
// ──────────────────────────────────────────────────────────────────────────────
router.post('/applications/draft/:code/submit', writeLimiter, async (req, res, next) => {
  try {
    const { email, declarations } = req.body || {};
    const { draft, error, status } = await loadDraftForAccess(req.params.code, email);
    if (error) return res.status(status).json({ error });

    // Declarations are captured on Step 7 (Review) and posted alongside the
    // /submit call — they're never persisted to the draft.formData on their
    // own. Merge them into the working `fd` so validateSubmission + the
    // Applicant.create downstream see them as ordinary boolean columns.
    const rawDecls = (declarations && typeof declarations === 'object') ? declarations : {};
    const fdBase = (draft.formData && typeof draft.formData === 'object') ? draft.formData : {};
    const fd = {
      ...fdBase,
      ...(rawDecls.studentDeclarationAgreed   === true ? { studentDeclarationAgreed:   true } : {}),
      ...(rawDecls.parentDeclarationAgreed    === true ? { parentDeclarationAgreed:    true } : {}),
      ...(rawDecls.commitmentStatementAgreed  === true ? { commitmentStatementAgreed:  true } : {}),
      ...(rawDecls.feeDeclarationAgreed       === true ? { feeDeclarationAgreed:       true } : {}),
    };
    const errors = validateSubmission(draft, fd);
    if (errors.length) return res.status(400).json({ error: 'Application is incomplete', details: errors });

    // Map draft studentType (lowercase) → existing StudentType enum (UPPERCASE).
    // Anything else was already rejected by validateSubmission above.
    const studentTypeEnum = draft.studentType === 'international' ? 'INTERNATIONAL' : 'DOMESTIC';
    // studyMode: domestic applicants picked one explicitly (validated). International
    // applicants don't see the field and are always ONLINE — set server-side here.
    const studyModeFinal = studentTypeEnum === 'INTERNATIONAL' ? 'ONLINE' : String(fd.studyMode).toUpperCase();

    // Resolve programme by code (validation ensured programmeCode is set).
    // Pull the per-type application fees so the submit response can return the
    // amount the applicant owes — saves the FE a round-trip on the way to the
    // payment-pending page.
    const programme = await prisma.programme.findUnique({
      where: { code: draft.programmeCode },
      select: {
        id: true, code: true, name: true, status: true,
        applicationFeeDomestic: true, applicationFeeInternational: true,
      },
    });
    if (!programme || programme.status !== 'active') {
      return res.status(400).json({ error: 'Programme is no longer available' });
    }
    // Application fee + currency are derived from studentType (which already
    // governs which Programme fee column is canonical for this applicant).
    // Decimal columns come back as Prisma.Decimal — toString() preserves them
    // exactly; FE renders via the same formatMoney() helper as Step 7.
    const applicationFeeDec = studentTypeEnum === 'INTERNATIONAL'
      ? programme.applicationFeeInternational
      : programme.applicationFeeDomestic;
    const paymentAmount   = applicationFeeDec != null ? applicationFeeDec.toString() : null;
    const paymentCurrency = studentTypeEnum === 'INTERNATIONAL' ? 'USD' : 'INR';

    // formData snapshot for back-compat with the existing flatten() readers in
    // admissions.js — Pipeline.jsx reads firstName/lastName/email/etc. through
    // that path. We also persist each field into its own column on Applicant.
    const flattenSnapshot = {
      firstName: fd.firstName || '',
      lastName: fd.lastName || '',
      email: fd.email || '',
      phone: fd.mobile || fd.phone || '',
      dob: typeof fd.dateOfBirth === 'string' ? fd.dateOfBirth : (fd.dateOfBirth || null),
      gender: fd.gender || '',
      nationality: fd.nationality || '',
      maritalStatus: fd.maritalStatus || '',
      // Use the server-resolved studyMode so the flatten snapshot agrees with
      // the Applicant.studyMode column (international is hardcoded ONLINE).
      studyMode: studyModeFinal,
      permanentAddress: [fd.permanentAddressLine, fd.permanentAddressState, fd.permanentAddressCountry, fd.permanentAddressPin]
        .filter(Boolean).join(', '),
      presentAddress: [fd.presentAddressLine, fd.presentAddressState, fd.presentAddressCountry, fd.presentAddressPin]
        .filter(Boolean).join(', '),
      statementOfFaith: fd.salvationTestimony || '',
      academicBackground: fd.theologicalQualification || fd.technicalQualification || null,
      // full structured snapshot preserved alongside the flatten() keys
      _public: {
        documents: fd.documents || {},
        educationEntries: Array.isArray(fd.educationEntries) ? fd.educationEntries : [],
        languages: Array.isArray(fd.languages) ? fd.languages : [],
        healthResponses: fd.healthResponses || null,
        // Echo every other narrative field so admissions can grep one place if needed.
        ...Object.fromEntries(
          Object.entries(fd).filter(([k]) => !['firstName','lastName','email','phone','dateOfBirth','gender','nationality','maritalStatus','studyMode','permanentAddressLine','permanentAddressState','permanentAddressCountry','permanentAddressPin','presentAddressLine','presentAddressState','presentAddressCountry','presentAddressPin','salvationTestimony','theologicalQualification','technicalQualification','documents','educationEntries','languages','healthResponses'].includes(k))
        ),
      },
    };

    // Cap formData size — defence in depth, identical convention to admissions.js POST.
    const FORM_DATA_MAX_BYTES = 256 * 1024;
    const sz = Buffer.byteLength(JSON.stringify(flattenSnapshot), 'utf8');
    if (sz > FORM_DATA_MAX_BYTES) {
      return res.status(413).json({ error: `Application JSON exceeds ${FORM_DATA_MAX_BYTES} byte limit` });
    }

    // applicationNo: HMC-APP-{istYear}-{NNNN}, matching the existing manual
    // flow's format and retry-from-1001 pattern.
    const istYear = nowInIST().year;
    const baseCount = await prisma.applicant.count({ where: { intakeYear: istYear } });

    // Build the individual-column data payload from formData.
    const submittedAt = new Date();
    const educationEntries = Array.isArray(fd.educationEntries) ? fd.educationEntries : [];
    const languages = Array.isArray(fd.languages) ? fd.languages : [];
    const documentsMap = (fd.documents && typeof fd.documents === 'object') ? fd.documents : {};

    let applicant = null;
    let lastErr = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      const appNo = `HMC-APP-${istYear}-${String(baseCount + 1001 + attempt).padStart(4, '0')}`;
      try {
        applicant = await prisma.$transaction(async (tx) => {
          const created = await tx.applicant.create({
            data: {
              applicationNo: appNo,
              programmeId: programme.id,
              programmeCode: programme.code,
              studentType: studentTypeEnum,
              studyMode: studyModeFinal,
              pipelineStage: 'RECEIVED',
              status: 'active',
              intakeYear: istYear,
              source: 'PUBLIC_FORM',
              submittedAt,
              draftId: draft.id,
              // Payment is orthogonal to admissions pipeline: applicant lands
              // in RECEIVED + PENDING. Admin / Razorpay webhook later flips
              // paymentStatus to PAID or WAIVED. The draftId binding lets the
              // payment-pending page (and any retry flow) reach back to the
              // draft if needed; submit handler does NOT delete the draft.
              paymentStatus: 'PENDING',
              paymentStatusUpdatedAt: submittedAt,
              formData: flattenSnapshot,
              // ── Individual columns mirrored from formData ─────────────────
              // Personal
              gender: fd.gender || null,
              dateOfBirth: toDateOrNull(fd.dateOfBirth),
              placeOfBirth: fd.placeOfBirth || null,
              nationality: fd.nationality || null,
              maritalStatus: fd.maritalStatus || null,
              spouseName: fd.spouseName || null,
              childrenInfo: fd.childrenInfo || null,
              motherTongue: fd.motherTongue || null,
              // Addresses
              presentAddressLine:    fd.presentAddressLine || null,
              presentAddressState:   fd.presentAddressState || null,
              presentAddressCountry: fd.presentAddressCountry || null,
              presentAddressPin:     fd.presentAddressPin || null,
              permanentAddressLine:    fd.permanentAddressLine || null,
              permanentAddressState:   fd.permanentAddressState || null,
              permanentAddressCountry: fd.permanentAddressCountry || null,
              permanentAddressPin:     fd.permanentAddressPin || null,
              // Contact
              mobile: fd.mobile || null,
              whatsapp: fd.whatsapp || null,
              emergencyContact: fd.emergencyContact || null,
              // International
              passportNumber: fd.passportNumber || null,
              passportCountryOfIssue: fd.passportCountryOfIssue || null,
              countryOfResidence: fd.countryOfResidence || null,
              cityOfResidence: fd.cityOfResidence || null,
              currentVisaStatus: fd.currentVisaStatus || null,
              intendedIndianVisa: fd.intendedIndianVisa || null,
              indiaEmergencyContact: fd.indiaEmergencyContact || null,
              // Background
              substanceHistory: fd.substanceHistory || null,
              criminalHistory: fd.criminalHistory || null,
              influenceForApplying: fd.influenceForApplying || null,
              // Education narrative
              technicalQualification: fd.technicalQualification || null,
              theologicalQualification: fd.theologicalQualification || null,
              currentlyEmployed: fd.currentlyEmployed || null,
              workExperience: fd.workExperience || null,
              // Spiritual
              receivedChrist: typeof fd.receivedChrist === 'boolean' ? fd.receivedChrist : null,
              receivedChristWhen: fd.receivedChristWhen || null,
              waterBaptism: typeof fd.waterBaptism === 'boolean' ? fd.waterBaptism : null,
              waterBaptismWhen: fd.waterBaptismWhen || null,
              salvationTestimony: fd.salvationTestimony || null,
              churchDenomination: fd.churchDenomination || null,
              churchName: fd.churchName || null,
              churchAddress: fd.churchAddress || null,
              pastorName: fd.pastorName || null,
              pastorAddress: fd.pastorAddress || null,
              holySpiritInfilling: fd.holySpiritInfilling || null,
              callForMinistry: fd.callForMinistry || null,
              // Financial
              sponsoredByOrg: fd.sponsoredByOrg || null,
              paymentMethod: fd.paymentMethod || null,
              commitTwoHoursDaily: typeof fd.commitTwoHoursDaily === 'boolean' ? fd.commitTwoHoursDaily : null,
              feeResponsibility: fd.feeResponsibility || null,
              sponsorName: fd.sponsorName || null,
              sponsorDetails: fd.sponsorDetails || null,
              sponsorContact: fd.sponsorContact || null,
              sponsorEmail: fd.sponsorEmail || null,
              needsFinancialAid: typeof fd.needsFinancialAid === 'boolean' ? fd.needsFinancialAid : null,
              financialAidNote: fd.financialAidNote || null,
              // Health responses (separate from legacy healthDeclaration)
              healthResponses: fd.healthResponses || null,
              // Declarations
              studentDeclarationAgreed:   fd.studentDeclarationAgreed   === true ? true : null,
              parentDeclarationAgreed:    fd.parentDeclarationAgreed    === true ? true : null,
              commitmentStatementAgreed:  fd.commitmentStatementAgreed  === true ? true : null,
              feeDeclarationAgreed:       fd.feeDeclarationAgreed       === true ? true : null,
              feeDeclarationSponsorName:    fd.feeDeclarationSponsorName    || null,
              feeDeclarationSponsorContact: fd.feeDeclarationSponsorContact || null,
              feeDeclarationSponsorEmail:   fd.feeDeclarationSponsorEmail   || null,
            },
          });

          // Education rows
          if (educationEntries.length > 0) {
            await tx.applicantEducation.createMany({
              data: educationEntries
                .filter(e => e && (nonEmptyString(e.qualification) || nonEmptyString(e.boardOrUniversity)))
                .map((e, i) => ({
                  applicantId: created.id,
                  qualification: String(e.qualification || '').slice(0, 200),
                  boardOrUniversity: String(e.boardOrUniversity || '').slice(0, 300),
                  yearOfCompletion: Number.isInteger(e.yearOfCompletion) ? e.yearOfCompletion
                    : (e.yearOfCompletion ? parseInt(e.yearOfCompletion, 10) || null : null),
                  sortOrder: i,
                })),
            });
          }

          // Language rows
          if (languages.length > 0) {
            await tx.applicantLanguage.createMany({
              data: languages
                .filter(l => l && nonEmptyString(l.language))
                .map(l => ({
                  applicantId: created.id,
                  language: String(l.language).slice(0, 80),
                  canSpeak: !!l.canSpeak,
                  canRead:  !!l.canRead,
                  canWrite: !!l.canWrite,
                })),
            });
          }

          // Document rows — for each docType slot we keep in draft.formData.
          // Dual-write fileUrl and objectKey with the same MinIO object path so
          // existing admin code that reads `fileUrl` keeps working.
          const docEntries = Object.entries(documentsMap).filter(([k, v]) => DOC_TYPES.has(k) && v && v.objectKey);
          if (docEntries.length > 0) {
            await tx.applicantDocument.createMany({
              data: docEntries.map(([dt, slot]) => ({
                applicantId: created.id,
                docType: dt,
                fileUrl: slot.objectKey,
                objectKey: slot.objectKey,
                fileName: slot.fileName || null,
                fileSize: typeof slot.fileSize === 'number' ? slot.fileSize : null,
                mimeType: slot.mimeType || null,
              })),
            });
          }

          return created;
        });
        break;
      } catch (e) {
        // Only retry on applicationNo uniqueness collisions; everything else fails the whole thing.
        if (e?.code === 'P2002' && Array.isArray(e?.meta?.target) && e.meta.target.includes('applicationNo')) {
          lastErr = e; continue;
        }
        throw e;
      }
    }
    if (!applicant) throw lastErr || new Error('Could not allocate application number');

    res.status(201).json({
      applicationNo: applicant.applicationNo,
      applicantId: applicant.id,
      paymentStatus: 'PENDING',
      paymentAmount,
      paymentCurrency,
      nextStep: 'PAYMENT',
    });
  } catch (err) { next(err); }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/public/applications/status?applicationNo=...&email=...
// ──────────────────────────────────────────────────────────────────────────────
router.get('/applications/status', async (req, res, next) => {
  try {
    const { applicationNo, email } = req.query;
    if (!applicationNo || typeof applicationNo !== 'string') {
      return res.status(400).json({ error: 'applicationNo is required' });
    }
    if (!isEmail(email)) return res.status(400).json({ error: 'email is required' });

    const a = await prisma.applicant.findUnique({
      where: { applicationNo: String(applicationNo).trim() },
      select: {
        id: true,
        applicationNo: true,
        pipelineStage: true,
        submittedAt: true,
        updatedAt: true,
        formData: true,
        programme: { select: { name: true, code: true } },
      },
    });
    // Don't differentiate "not found" vs "wrong email" — same response either
    // way to avoid an enumeration oracle.
    const failGeneric = () => res.status(404).json({ error: 'No application matching that number and email' });
    if (!a) return failGeneric();
    const storedEmail = normEmail(a.formData?.email);
    if (!storedEmail || storedEmail !== normEmail(email)) return failGeneric();

    res.json({
      applicationNo: a.applicationNo,
      programmeName: a.programme?.name || '',
      programmeCode: a.programme?.code || '',
      status: a.pipelineStage,
      submittedAt: a.submittedAt,
      lastUpdate: a.updatedAt,
    });
  } catch (err) { next(err); }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/public/applications/:applicationNo/payment-status?email=...
// Email-verified, same anti-enumeration pattern as /status: generic 404 on no
// match OR email mismatch so a caller can't probe whether an applicationNo
// exists. Returns the data the /apply/payment page needs to render — current
// payment state + amount + currency + applicant + programme labels.
// ──────────────────────────────────────────────────────────────────────────────
router.get('/applications/:applicationNo/payment-status', async (req, res, next) => {
  try {
    const { applicationNo } = req.params;
    const { email } = req.query;
    if (!applicationNo || typeof applicationNo !== 'string') {
      return res.status(400).json({ error: 'applicationNo is required' });
    }
    if (!isEmail(email)) return res.status(400).json({ error: 'email is required' });

    const a = await prisma.applicant.findUnique({
      where: { applicationNo: String(applicationNo).trim() },
      select: {
        id: true,
        applicationNo: true,
        studentType: true,
        paymentStatus: true,
        formData: true,
        programme: {
          select: {
            name: true, code: true,
            applicationFeeDomestic: true,
            applicationFeeInternational: true,
          },
        },
      },
    });
    const failGeneric = () => res.status(404).json({ error: 'Application not found' });
    if (!a) return failGeneric();
    const storedEmail = normEmail(a.formData?.email);
    if (!storedEmail || storedEmail !== normEmail(email)) return failGeneric();

    const isIntl = a.studentType === 'INTERNATIONAL';
    const feeDec = isIntl
      ? a.programme?.applicationFeeInternational
      : a.programme?.applicationFeeDomestic;
    const paymentAmount   = feeDec != null ? feeDec.toString() : null;
    const paymentCurrency = isIntl ? 'USD' : 'INR';

    const firstName = String(a.formData?.firstName || '').trim();
    const lastName  = String(a.formData?.lastName  || '').trim();
    const applicantName = [firstName, lastName].filter(Boolean).join(' ');

    res.json({
      applicationNo: a.applicationNo,
      applicantName,
      programmeName: a.programme?.name || '',
      paymentStatus: a.paymentStatus || 'PENDING',
      paymentAmount,
      paymentCurrency,
    });
  } catch (err) { next(err); }
});

module.exports = router;
