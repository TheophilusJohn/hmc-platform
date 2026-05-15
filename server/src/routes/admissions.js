// server/src/routes/admissions.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { createUserWithGeneratedId } = require('../utils/userId');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { Prisma } = require('@prisma/client');
const { istBusinessDate, nowInIST, istEndOfDayPlusDays } = require('../utils/dateUtils');

// Allowed forward transitions in the 7-stage admissions pipeline.
// Skipping (e.g. RECEIVED → ACCEPTED) is forbidden; admins use /reactivate
// to roll a row back to RECEIVED.
const STAGE_TRANSITIONS = {
  RECEIVED:            new Set(['DOCS_REVIEW', 'REJECTED']),
  DOCS_REVIEW:         new Set(['INTERVIEW_SCHEDULED', 'REJECTED']),
  INTERVIEW_SCHEDULED: new Set(['INTERVIEW_DONE', 'REJECTED']),
  INTERVIEW_DONE:      new Set(['WAITLISTED', 'ACCEPTED', 'REJECTED']),
  WAITLISTED:          new Set(['ACCEPTED', 'REJECTED']),
  ACCEPTED:            new Set(['ENROLLED', 'REJECTED']),
  REJECTED:            new Set([]),
  ENROLLED:            new Set([]),
};

// Returns null if refs satisfy the precondition; otherwise an error message.
// Requires at least one RECEIVED PASTORAL and one RECEIVED CHRISTIAN_LEADER.
function referencesSatisfied(references) {
  const received = (references || []).filter(r => r.status === 'RECEIVED');
  const hasPastoral = received.some(r => r.refType === 'PASTORAL');
  const hasChristian = received.some(r => r.refType === 'CHRISTIAN_LEADER');
  if (!hasPastoral || !hasChristian) {
    return 'At least one PASTORAL and one CHRISTIAN_LEADER reference must be RECEIVED.';
  }
  return null;
}

const admissionsAccess = requireRole('FULL_ADMIN', 'TEACHER_ADMIN', 'ADMISSIONS_OFFICER');

// Flatten formData onto applicant for frontend convenience
function flatten(a) {
  const fd = a.formData || {};
  return {
    ...a,
    firstName: fd.firstName || '',
    lastName: fd.lastName || '',
    email: fd.email || '',
    phone: fd.phone || '',
    dob: fd.dob || null,
    gender: fd.gender || '',
    nationality: fd.nationality || '',
    maritalStatus: fd.maritalStatus || '',
    studyMode: fd.studyMode || '',
    permanentAddress: fd.permanentAddress || '',
    presentAddress: fd.presentAddress || '',
    statementOfFaith: fd.statementOfFaith || '',
    academicBackground: fd.academicBackground || null,
    programmeName: a.programme?.name || '',
    programmeCode: a.programme?.code || '',
  };
}

// GET /api/admissions
router.get('/', authenticate, admissionsAccess, async (req, res, next) => {
  try {
    const { stage, programmeId, intakeYear, search, today, page: rawPage = 1, limit: rawLimit = 100 } = req.query;
    // Clamp pagination — pre-fix `?limit=1000000` issued an unbounded findMany.
    const page = Math.max(1, parseInt(rawPage, 10) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(rawLimit, 10) || 100));
    const where = {};
    if (stage) {
      if (Array.isArray(stage)) {
        where.pipelineStage = { in: stage.map(s => String(s).toUpperCase()) };
      } else {
        where.pipelineStage = String(stage).toUpperCase();
      }
    }
    if (programmeId) where.programmeId = programmeId;
    if (intakeYear) where.intakeYear = parseInt(intakeYear);
    if (today === 'true') {
      // Anchor "today" to the IST calendar — the server may run UTC.
      const ist = nowInIST();
      const todayStart = istBusinessDate(ist.year, ist.monthIndex, ist.day);
      const todayEnd = istBusinessDate(ist.year, ist.monthIndex, ist.day + 1);
      where.OR = [
        { interviewedAt: { gte: todayStart, lt: todayEnd } },
        { pipelineStage: { in: ['RECEIVED', 'DOCS_REVIEW'] } },
      ];
    }
    if (search) where.applicationNo = { contains: search, mode: 'insensitive' };

    const [applicants, total] = await Promise.all([
      prisma.applicant.findMany({
        where,
        include: { programme: { select: { name: true, code: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.applicant.count({ where }),
    ]);

    res.json({
      applicants: applicants.map(flatten),
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) { next(err); }
});

// POST /api/admissions
router.post('/', authenticate, admissionsAccess, async (req, res, next) => {
  try {
    // Extract Applicant model columns; rest goes into formData JSON
    const {
      programmeId, studentType, referralCode, pipelineStage,
      formData: bodyFormData,
      // Applicant fields we ignore from body:
      applicationNo, intakeYear, status, id, createdAt, updatedAt,
      ...rest
    } = req.body;

    if (!programmeId) return res.status(400).json({ error: 'programmeId required' });

    // Verify programme exists
    const prog = await prisma.programme.findUnique({ where: { id: programmeId } });
    if (!prog) return res.status(400).json({ error: 'Invalid programmeId' });

    // Whitelist the formData fields we accept — prevents `__proto__` and
    // other unexpected keys from landing in the JSONB column, and means a
    // schema audit can enumerate every persisted field.
    const APPLICANT_FORM_FIELDS = new Set([
      'firstName', 'lastName', 'email', 'phone',
      'dob', 'gender', 'nationality', 'maritalStatus',
      'studyMode', 'permanentAddress', 'presentAddress',
      'statementOfFaith', 'academicBackground',
      'churchAffiliation', 'pastoralReference', 'christianLeaderReference',
      'healthDeclaration', 'financialDeclaration',
      'languagePreference', 'preferredStartYear', 'previousProgrammes',
    ]);
    const rawForm = { ...rest, ...(bodyFormData || {}) };
    const formData = {};
    for (const k of APPLICANT_FORM_FIELDS) {
      if (rawForm[k] !== undefined) formData[k] = rawForm[k];
    }

    // Cap formData JSON size to prevent malicious 10MB+ submissions from being persisted.
    const FORM_DATA_MAX_BYTES = 64 * 1024;
    const formSize = Buffer.byteLength(JSON.stringify(formData), 'utf8');
    if (formSize > FORM_DATA_MAX_BYTES) {
      return res.status(413).json({ error: `Application form exceeds ${FORM_DATA_MAX_BYTES} byte limit` });
    }

    const year = new Date().getFullYear();
    // Count once outside the retry loop; on collision the loop increments the
    // local counter rather than re-counting (which under concurrent load could
    // re-read the same stale count for every retry and exhaust attempts).
    const baseCount = await prisma.applicant.count({ where: { intakeYear: year } });
    let applicant;
    let lastErr;
    for (let attempt = 0; attempt < 10; attempt++) {
      const appNo = `HMC-APP-${year}-${String(baseCount + 1001 + attempt).padStart(4, '0')}`;
      try {
        applicant = await prisma.applicant.create({
          data: {
            applicationNo: appNo,
            programmeId,
            studentType: String(studentType || 'DOMESTIC').toUpperCase(),
            pipelineStage: 'RECEIVED',
            formData,
            referralCode: referralCode || null,
            intakeYear: year,
            status: 'active',
          },
          include: { programme: { select: { name: true, code: true } } },
        });
        break;
      } catch (e) {
        if (e.code === 'P2002') { lastErr = e; continue; }
        throw e;
      }
    }
    if (!applicant) throw lastErr || new Error('Could not assign application number');

    res.status(201).json({ applicant: flatten(applicant) });
  } catch (err) { next(err); }
});

// GET /api/admissions/stats
router.get('/stats', authenticate, admissionsAccess, async (req, res, next) => {
  try {
    const { intakeYear = new Date().getFullYear() } = req.query;
    const parsedYear = parseInt(intakeYear, 10);
    // Fall back to current year on NaN so we don't silently return zero rows
    // and confuse the dashboard. Range-clamp to a sane window too.
    const currentYear = new Date().getFullYear();
    const year = (Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= currentYear + 5)
      ? parsedYear
      : currentYear;
    const stages = ['RECEIVED', 'DOCS_REVIEW', 'INTERVIEW_SCHEDULED', 'INTERVIEW_DONE', 'WAITLISTED', 'ACCEPTED', 'REJECTED', 'ENROLLED'];
    const pairs = await Promise.all(
      stages.map(s => prisma.applicant.count({ where: { pipelineStage: s, intakeYear: year } }).then(c => [s, c]))
    );
    const byStage = {};
    for (const [s, c] of pairs) byStage[s.toLowerCase()] = c;
    const total = pairs.reduce((acc, [, c]) => acc + c, 0);
    // Coerce each byStage member to 0 before summing — protects against NaN
    // when an enum value is missing (e.g. future schema additions).
    const inPipelineKeys = ['received', 'docs_review', 'interview_scheduled', 'interview_done', 'waitlisted'];
    const inPipeline = inPipelineKeys.reduce((acc, k) => acc + (byStage[k] || 0), 0);
    // IST-anchored day window — the server may run UTC.
    const istToday = nowInIST();
    const todayStart = istBusinessDate(istToday.year, istToday.monthIndex, istToday.day);
    const todayEnd = istBusinessDate(istToday.year, istToday.monthIndex, istToday.day + 1);
    const interviewsToday = await prisma.applicant.count({
      where: { interviewedAt: { gte: todayStart, lt: todayEnd } },
    });
    res.json({
      total,
      accepted: byStage.accepted,
      enrolled: byStage.enrolled,
      rejected: byStage.rejected,
      inPipeline,
      interviewsToday,
      byStage,
      acceptanceRate: total ? (((byStage.accepted + byStage.enrolled) / total) * 100).toFixed(1) : 0,
    });
  } catch (err) { next(err); }
});

// GET /api/admissions/:id
router.get('/:id', authenticate, admissionsAccess, async (req, res, next) => {
  try {
    const applicant = await prisma.applicant.findUnique({
      where: { id: req.params.id },
      include: {
        programme: true,
        documents: true,
        references: true,
        interviewer: { include: { facultyProfile: true } },
      },
    });
    if (!applicant) return res.status(404).json({ error: 'Applicant not found' });
    res.json({ applicant: flatten(applicant) });
  } catch (err) { next(err); }
});

// PUT /api/admissions/:id/stage
router.put('/:id/stage', authenticate, admissionsAccess, async (req, res, next) => {
  try {
    const { stage } = req.body;
    const normalized = String(stage || '').toUpperCase();
    const applicant = await prisma.applicant.findUnique({
      where: { id: req.params.id }, include: { references: true },
    });
    if (!applicant) return res.status(404).json({ error: 'Applicant not found' });

    // Enforce the forward-only state machine. Backward moves go through /reactivate.
    const allowed = STAGE_TRANSITIONS[applicant.pipelineStage];
    if (!allowed) {
      return res.status(400).json({ error: `Applicant is in terminal stage ${applicant.pipelineStage}.` });
    }
    if (!allowed.has(normalized)) {
      return res.status(400).json({ error: `Invalid stage transition ${applicant.pipelineStage} → ${normalized}.` });
    }

    // Reference-type precondition: PASTORAL + CHRISTIAN_LEADER required from interview onwards.
    if (['INTERVIEW_SCHEDULED', 'INTERVIEW_DONE', 'ACCEPTED'].includes(normalized)) {
      const refErr = referencesSatisfied(applicant.references);
      if (refErr) return res.status(400).json({ error: refErr });
    }

    const updateData = { pipelineStage: normalized };
    // Record decision attribution where applicable.
    if (['ACCEPTED', 'REJECTED', 'WAITLISTED'].includes(normalized)) {
      updateData.decisionMakerId = req.user.id;
      updateData.decisionAt = new Date();
    }
    const updated = await prisma.applicant.update({
      where: { id: req.params.id },
      data: updateData,
      include: { programme: { select: { name: true, code: true } } },
    });
    res.json({ applicant: flatten(updated) });
  } catch (err) { next(err); }
});

// POST /api/admissions/:id/interview
router.post('/:id/interview', authenticate, admissionsAccess, async (req, res, next) => {
  try {
    const { interviewScore, interviewNotes, recommendation } = req.body;
    const existing = await prisma.applicant.findUnique({
      where: { id: req.params.id }, select: { pipelineStage: true, interviewerId: true },
    });
    if (!existing) return res.status(404).json({ error: 'Applicant not found' });
    // Recording an interview only makes sense from INTERVIEW_SCHEDULED. Pre-fix
    // a single POST from DOCS_REVIEW (or any earlier stage) silently jumped
    // pipelineStage straight to INTERVIEW_DONE.
    if (existing.pipelineStage !== 'INTERVIEW_SCHEDULED' && existing.pipelineStage !== 'INTERVIEW_DONE') {
      return res.status(400).json({ error: `Cannot record interview from stage ${existing.pipelineStage}. Move to INTERVIEW_SCHEDULED first.` });
    }
    // Preserve the original interviewer if another AO already recorded the
    // interview — a second AO can still update notes/score but can't silently
    // claim the interview as their own. Admins can override by clearing the
    // applicant via /reactivate.
    if (existing.interviewerId && existing.interviewerId !== req.user.id && req.user.role !== 'FULL_ADMIN') {
      return res.status(403).json({ error: 'Interview was recorded by another officer. Ask them to update it, or have an admin reset the applicant.' });
    }
    // Map recommendation to pipeline stage
    let pipelineStage = 'INTERVIEW_DONE';
    const rec = String(recommendation || '').toLowerCase();
    if (rec === 'reject') pipelineStage = 'REJECTED';
    else if (rec === 'waitlist') pipelineStage = 'WAITLISTED';
    // 'accept' stays at INTERVIEW_DONE so admin can confirm via /accept

    // Clamp interview score to 0–10 (UI presents it as "score / 10").
    let parsedScore = null;
    if (interviewScore !== undefined && interviewScore !== null && interviewScore !== '') {
      const s = parseInt(interviewScore, 10);
      if (!Number.isInteger(s) || s < 0 || s > 10) {
        return res.status(400).json({ error: 'interviewScore must be an integer 0–10' });
      }
      parsedScore = s;
    }
    const data = {
      interviewScore: parsedScore,
      interviewNotes: interviewNotes || null,
      interviewerId: req.user.id,
      interviewedAt: new Date(),
      pipelineStage,
    };
    if (rec === 'reject') {
      data.decision = 'reject';
      data.decisionAt = new Date();
    }

    const applicant = await prisma.applicant.update({
      where: { id: req.params.id }, data,
      include: { programme: { select: { name: true, code: true } } },
    });
    res.json({ applicant: flatten(applicant) });
  } catch (err) { next(err); }
});

// POST /api/admissions/:id/accept
router.post('/:id/accept', authenticate, admissionsAccess, async (req, res, next) => {
  try {
    // Validate eligibility BEFORE allocating a user-id slot. Critical:
    //   (a) only applicants who finished an interview (or are on waitlist) can be accepted
    //   (b) PASTORAL + CHRISTIAN_LEADER references must already be RECEIVED
    //   (c) applicant must not already be converted
    const eligibility = await prisma.applicant.findUnique({
      where: { id: req.params.id },
      include: { references: true },
    });
    if (!eligibility) return res.status(404).json({ error: 'Applicant not found' });
    if (eligibility.convertedToUserId) {
      return res.status(400).json({ error: 'Applicant already converted to a student account' });
    }
    const acceptableFrom = new Set(['INTERVIEW_DONE', 'WAITLISTED']);
    if (!acceptableFrom.has(eligibility.pipelineStage)) {
      return res.status(400).json({
        error: `Applicant must be at INTERVIEW_DONE or WAITLISTED to accept (currently ${eligibility.pipelineStage}).`,
      });
    }
    const refErr = referencesSatisfied(eligibility.references);
    if (refErr) return res.status(400).json({ error: refErr });

    const settings = await prisma.systemSetting.findUnique({ where: { key: 'admissions' } });
    const deadlineDays = settings?.value?.acceptanceDeadlineDays || 14;

    const tempPassword = require('crypto').randomBytes(8).toString('base64url').slice(0, 10) + 'A1!';
    const tempHash = await bcrypt.hash(tempPassword, 12);
    // End-of-day IST so the offer is valid through the full last day, not 5h30m short of it.
    const offerExpires = istEndOfDayPlusDays(new Date(), deadlineDays);

    // Wrap the entire accept flow in a single transaction so:
    //  - the convertedToUserId check + write is atomic (prevents double-accept race)
    //  - on any failure, the student account and applicant update both roll back
    const result = await prisma.$transaction(async (tx) => {
      const applicant = await tx.applicant.findUnique({
        where: { id: req.params.id }, include: { programme: true },
      });
      if (!applicant) throw Object.assign(new Error('Applicant not found'), { status: 404 });
      if (applicant.convertedToUserId) {
        throw Object.assign(new Error('Applicant already converted to a student account'), { status: 400 });
      }
      // Re-check eligibility under the transaction (race-safe)
      if (!acceptableFrom.has(applicant.pipelineStage)) {
        throw Object.assign(new Error('Applicant stage changed; refusing to accept.'), { status: 409 });
      }
      // Require studentType to be set explicitly — legacy rows with null
      // studentType would default to DOMESTIC INR and silently mis-bill an
      // international student.
      if (!applicant.studentType) {
        throw Object.assign(new Error('Applicant has no studentType set (DOMESTIC/INTERNATIONAL). Update before accepting.'), { status: 400 });
      }

      const fd = applicant.formData || {};
      const email = fd.email || `${applicant.applicationNo}@student.hmc.college`;

      // studyMode is part of the applicant's profile decision — accept the form value
      // only as fallback. Normalize OFFLINE/ONLINE.
      const rawStudyMode = String(fd.studyMode || 'OFFLINE').toUpperCase();
      const studyMode = (rawStudyMode === 'ONLINE') ? 'ONLINE' : 'OFFLINE';

      // Create the user first with a retry-aware userIdDisplay generator.
      const baseUser = await createUserWithGeneratedId('STUDENT', {
        email: String(email).toLowerCase().trim(),
        status: 'ACTIVE',
        phone: fd.phone || null,
      }, tx);

      // Then attach auth + studentProfile (separate calls so the userIdDisplay retry
      // path doesn't have to recreate nested data on collision).
      await tx.userAuth.create({
        data: {
          userId: baseUser.id,
          passwordHash: await bcrypt.hash(uuidv4(), 12),
          tempPasswordHash: tempHash,
          tempPasswordExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
      const studentProfile = await tx.studentProfile.create({
        data: {
          userId: baseUser.id,
          firstName: fd.firstName || '',
          lastName: fd.lastName || '',
          // Coerce-then-validate so a malformed dob doesn't throw inside the
          // transaction and roll the entire accept back.
          dob: (() => {
            if (!fd.dob) return new Date('2000-01-01');
            const d = new Date(fd.dob);
            return isNaN(d.getTime()) ? new Date('2000-01-01') : d;
          })(),
          gender: fd.gender || 'unspecified',
          nationality: fd.nationality || 'Indian',
          studentType: applicant.studentType,
          studyMode,
          programmeId: applicant.programmeId,
          permanentAddress: fd.permanentAddress || null,
          presentAddress: fd.presentAddress || null,
        },
      });
      const newUser = { ...baseUser, studentProfile };

      await tx.applicant.update({
        where: { id: req.params.id },
        data: {
          pipelineStage: 'ACCEPTED',
          decision: 'accept',
          decisionAt: new Date(),
          decisionMakerId: req.user.id,
          offerExpiresAt: offerExpires,
          convertedToUserId: newUser.id,
        },
      });

      // Auto-apply fees inside the transaction. Match by BOTH studyMode and studentType.
      const isIntl = applicant.studentType === 'INTERNATIONAL';
      const applicableRules = ['ALL'];
      if (studyMode === 'OFFLINE') applicableRules.push('OFFLINE_ONLY');
      if (studyMode === 'ONLINE') applicableRules.push('ONLINE_ONLY');
      const autoFees = await tx.feeType.findMany({
        where: { isActive: true, autoApply: { in: applicableRules } },
      });
      for (const ft of autoFees) {
        // Pick the amount column matching studentType. `null` is treated as "skip";
        // a legitimate $0 fee is still applied. Use Prisma.Decimal so amounts are
        // never coerced through JS Number.
        const rawAmount = isIntl ? ft.internationalAmount : ft.domesticAmount;
        if (rawAmount === null || rawAmount === undefined) continue;
        const amount = new Prisma.Decimal(rawAmount);
        await tx.studentFeeLedger.create({
          data: {
            studentId: studentProfile.id,
            feeTypeId: ft.id,
            amount,
            balance: amount,
            waivedAmount: new Prisma.Decimal(0),
            currency: isIntl ? 'USD' : 'INR',
            status: 'UNPAID',
            description: ft.name,
            addedById: req.user.id,
          },
        });
      }

      return { applicant, newUser };
    });

    // Side effects outside the transaction
    try {
      const { sendAcceptanceLetter } = require('../services/email.service');
      await sendAcceptanceLetter(result.applicant, result.newUser, tempPassword, offerExpires);
    } catch (_e) {}

    res.json({
      message: 'Applicant accepted. Student account created.',
      userId: result.newUser.id,
      userIdDisplay,
      tempPassword,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (err.code === 'P2002') return res.status(400).json({ error: 'Email already in use by another account' });
    next(err);
  }
});

// POST /api/admissions/:id/reject
router.post('/:id/reject', authenticate, admissionsAccess, async (req, res, next) => {
  try {
    const { reason } = req.body;
    const applicant = await prisma.applicant.update({
      where: { id: req.params.id },
      data: {
        pipelineStage: 'REJECTED',
        decision: 'reject',
        decisionReason: reason || null,
        decisionAt: new Date(),
        status: 'archived',
      },
      include: { programme: { select: { name: true, code: true } } },
    });
    try {
      const { sendRejectionEmail } = require('../services/email.service');
      await sendRejectionEmail(applicant, reason);
    } catch (_e) {}
    res.json({ applicant: flatten(applicant) });
  } catch (err) { next(err); }
});

// POST /api/admissions/:id/enroll
router.post('/:id/enroll', authenticate, admissionsAccess, async (req, res, next) => {
  try {
    const existing = await prisma.applicant.findUnique({
      where: { id: req.params.id },
      select: { pipelineStage: true, offerExpiresAt: true },
    });
    if (!existing) return res.status(404).json({ error: 'Applicant not found' });
    if (existing.pipelineStage !== 'ACCEPTED') {
      return res.status(400).json({ error: 'Applicant must be in ACCEPTED stage before enrolling' });
    }
    if (existing.offerExpiresAt && new Date(existing.offerExpiresAt) < new Date()) {
      return res.status(400).json({ error: 'Offer has expired. Re-issue or extend the offer first.' });
    }
    const applicant = await prisma.applicant.update({
      where: { id: req.params.id },
      data: { pipelineStage: 'ENROLLED' },
      include: { programme: { select: { name: true, code: true } } },
    });
    res.json({ applicant: flatten(applicant) });
  } catch (err) { next(err); }
});

// POST /api/admissions/:id/reactivate
router.post('/:id/reactivate', authenticate, admissionsAccess, async (req, res, next) => {
  try {
    const { intakeYear } = req.body;
    // Block reactivate when there's already a converted student account —
    // otherwise stale interview/decision data carries over silently and a
    // re-accept would create a SECOND user with a parallel ledger while the
    // original account still exists. Admin must deactivate the existing user first.
    const existing = await prisma.applicant.findUnique({
      where: { id: req.params.id },
      select: { convertedToUserId: true },
    });
    if (!existing) return res.status(404).json({ error: 'Applicant not found' });
    if (existing.convertedToUserId) {
      return res.status(409).json({ error: 'Applicant has a converted student account. Deactivate that account first before reactivating the application.' });
    }
    const applicant = await prisma.applicant.update({
      where: { id: req.params.id },
      data: {
        status: 'active',
        pipelineStage: 'RECEIVED',
        intakeYear: intakeYear || new Date().getFullYear(),
        // Clear ALL stale state — pre-fix, interviewerId/interviewScore/
        // interviewNotes/decisionMakerId carried over so a reactivated applicant
        // looked half-interviewed.
        decision: null,
        decisionAt: null,
        decisionMakerId: null,
        decisionReason: null,
        offerExpiresAt: null,
        interviewerId: null,
        interviewedAt: null,
        interviewScore: null,
        interviewNotes: null,
      },
      include: { programme: { select: { name: true, code: true } } },
    });
    res.json({ applicant: flatten(applicant) });
  } catch (err) { next(err); }
});

module.exports = router;
