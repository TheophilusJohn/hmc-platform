// server/src/routes/admissions.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { generateUserId } = require('../utils/userId');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

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
    const { stage, programmeId, intakeYear, search, today, page = 1, limit = 100 } = req.query;
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
      const todayStart = new Date(); todayStart.setHours(0,0,0,0);
      const todayEnd = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1);
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
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.applicant.count({ where }),
    ]);

    res.json({
      applicants: applicants.map(flatten),
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
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

    const formData = { ...rest, ...(bodyFormData || {}) };

    const year = new Date().getFullYear();
    const count = await prisma.applicant.count({ where: { intakeYear: year } });
    const appNo = `HMC-APP-${year}-${String(count + 1001).padStart(4, '0')}`;

    const applicant = await prisma.applicant.create({
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

    res.status(201).json({ applicant: flatten(applicant) });
  } catch (err) { next(err); }
});

// GET /api/admissions/stats
router.get('/stats', authenticate, admissionsAccess, async (req, res, next) => {
  try {
    const { intakeYear = new Date().getFullYear() } = req.query;
    const year = parseInt(intakeYear);
    const stages = ['RECEIVED', 'DOCS_REVIEW', 'INTERVIEW_SCHEDULED', 'INTERVIEW_DONE', 'WAITLISTED', 'ACCEPTED', 'REJECTED', 'ENROLLED'];
    const pairs = await Promise.all(
      stages.map(s => prisma.applicant.count({ where: { pipelineStage: s, intakeYear: year } }).then(c => [s, c]))
    );
    const byStage = {};
    for (const [s, c] of pairs) byStage[s.toLowerCase()] = c;
    const total = pairs.reduce((acc, [, c]) => acc + c, 0);
    const inPipeline = byStage.received + byStage.docs_review + byStage.interview_scheduled + byStage.interview_done + byStage.waitlisted;
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const todayEnd = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1);
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
    const normalized = String(stage).toUpperCase();
    const applicant = await prisma.applicant.findUnique({
      where: { id: req.params.id }, include: { references: true },
    });
    if (!applicant) return res.status(404).json({ error: 'Applicant not found' });

    if (['INTERVIEW_SCHEDULED', 'INTERVIEW_DONE'].includes(normalized)) {
      const received = applicant.references.filter(r => r.status === 'RECEIVED').length >= 2;
      if (!received) return res.status(400).json({ error: 'Both references required before interview stage' });
    }
    const updated = await prisma.applicant.update({
      where: { id: req.params.id },
      data: { pipelineStage: normalized },
      include: { programme: { select: { name: true, code: true } } },
    });
    res.json({ applicant: flatten(updated) });
  } catch (err) { next(err); }
});

// POST /api/admissions/:id/interview
router.post('/:id/interview', authenticate, admissionsAccess, async (req, res, next) => {
  try {
    const { interviewScore, interviewNotes, recommendation } = req.body;
    // Map recommendation to pipeline stage
    let pipelineStage = 'INTERVIEW_DONE';
    const rec = String(recommendation || '').toLowerCase();
    if (rec === 'reject') pipelineStage = 'REJECTED';
    else if (rec === 'waitlist') pipelineStage = 'WAITLISTED';
    // 'accept' stays at INTERVIEW_DONE so admin can confirm via /accept

    const data = {
      interviewScore: interviewScore ? parseInt(interviewScore) : null,
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
    const applicant = await prisma.applicant.findUnique({
      where: { id: req.params.id }, include: { programme: true },
    });
    if (!applicant) return res.status(404).json({ error: 'Applicant not found' });
    if (applicant.convertedToUserId) {
      return res.status(400).json({ error: 'Applicant already converted to a student account' });
    }

    const settings = await prisma.systemSetting.findUnique({ where: { key: 'admissions' } });
    const deadlineDays = settings?.value?.acceptanceDeadlineDays || 14;

    const userIdDisplay = await generateUserId('STUDENT');
    const tempPassword = Math.random().toString(36).slice(-10) + 'A1!';
    const tempHash = await bcrypt.hash(tempPassword, 12);

    const fd = applicant.formData || {};
    const email = fd.email || `${applicant.applicationNo}@student.hmc.college`;

    const newUser = await prisma.user.create({
      data: {
        userIdDisplay,
        role: 'STUDENT',
        email: String(email).toLowerCase().trim(),
        status: 'ACTIVE',
        phone: fd.phone || null,
        auth: {
          create: {
            passwordHash: await bcrypt.hash(uuidv4(), 12),
            tempPasswordHash: tempHash,
            tempPasswordExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        },
        studentProfile: {
          create: {
            firstName: fd.firstName || '',
            lastName: fd.lastName || '',
            dob: fd.dob ? new Date(fd.dob) : new Date('2000-01-01'),
            gender: fd.gender || 'unspecified',
            nationality: fd.nationality || 'Indian',
            studentType: applicant.studentType,
            studyMode: String(fd.studyMode || 'OFFLINE').toUpperCase(),
            programmeId: applicant.programmeId,
            permanentAddress: fd.permanentAddress || null,
            presentAddress: fd.presentAddress || null,
          },
        },
      },
    });

    const offerExpires = new Date(Date.now() + deadlineDays * 24 * 60 * 60 * 1000);
    await prisma.applicant.update({
      where: { id: req.params.id },
      data: {
        pipelineStage: 'ACCEPTED',
        decision: 'accept',
        decisionAt: new Date(),
        offerExpiresAt: offerExpires,
        convertedToUserId: newUser.id,
      },
    });

    // Auto-apply fees matching the new student's study mode
    try {
      const studyMode = String(fd.studyMode || 'OFFLINE').toUpperCase();
      const applicableRules = ['ALL'];
      if (studyMode === 'OFFLINE') applicableRules.push('OFFLINE_ONLY');
      if (studyMode === 'ONLINE') applicableRules.push('ONLINE_ONLY');
      const autoFees = await prisma.feeType.findMany({
        where: { isActive: true, autoApply: { in: applicableRules } },
      });
      const isIntl = applicant.studentType === 'INTERNATIONAL';
      const sp = await prisma.studentProfile.findUnique({ where: { userId: newUser.id } });
      if (sp) {
        for (const ft of autoFees) {
          try {
            const amount = isIntl ? Number(ft.internationalAmount || ft.domesticAmount) : Number(ft.domesticAmount);
            await prisma.studentFeeLedger.create({
              data: {
                studentId: sp.id, feeTypeId: ft.id,
                amount, balance: amount, waivedAmount: 0,
                currency: isIntl ? 'USD' : 'INR',
                status: 'UNPAID',
                description: ft.name,
                addedById: req.user.id,
              },
            });
          } catch (e) { console.warn('Auto-fee skip:', ft.name, e.message); }
        }
      }
    } catch (e) { console.warn('Auto-fee application failed:', e.message); }

    try {
      const { sendAcceptanceLetter } = require('../services/email.service');
      await sendAcceptanceLetter(applicant, newUser, tempPassword, offerExpires);
    } catch (_e) {}

    res.json({
      message: 'Applicant accepted. Student account created.',
      userId: newUser.id,
      userIdDisplay,
      tempPassword,
    });
  } catch (err) {
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
    const applicant = await prisma.applicant.update({
      where: { id: req.params.id },
      data: {
        status: 'active',
        pipelineStage: 'RECEIVED',
        intakeYear: intakeYear || new Date().getFullYear(),
        decision: null,
        decisionAt: null,
        offerExpiresAt: null,
      },
      include: { programme: { select: { name: true, code: true } } },
    });
    res.json({ applicant: flatten(applicant) });
  } catch (err) { next(err); }
});

module.exports = router;
