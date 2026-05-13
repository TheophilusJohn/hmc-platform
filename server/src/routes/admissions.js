// server/src/routes/admissions.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { requireRole, adminOnly } = require('../middleware/rbac');
const { generateUserId } = require('../utils/userId');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

const admissionsAccess = requireRole('FULL_ADMIN', 'TEACHER_ADMIN', 'ADMISSIONS_OFFICER');

// GET /api/admissions
router.get('/', authenticate, admissionsAccess, async (req, res, next) => {
  try {
    const { stage, programmeId, intakeYear, search, page = 1, limit = 20 } = req.query;
    const where = {};
    if (stage) where.pipelineStage = stage;
    if (programmeId) where.programmeId = programmeId;
    if (intakeYear) where.intakeYear = parseInt(intakeYear);
    if (search) {
      where.OR = [
        { applicationNo: { contains: search, mode: 'insensitive' } },
        { formData: { path: ['firstName'], string_contains: search } },
      ];
    }

    const [applicants, total] = await Promise.all([
      prisma.applicant.findMany({
        where,
        include: { programme: { select: { name: true, code: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: parseInt(limit),
      }),
      prisma.applicant.count({ where }),
    ]);

    res.json({ applicants, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

// POST /api/admissions — create new applicant
router.post('/', authenticate, admissionsAccess, async (req, res, next) => {
  try {
    const year = new Date().getFullYear();
    const count = await prisma.applicant.count({ where: { intakeYear: year } });
    const applicationNo = `HMC-APP-${year}-${String(count + 1001).padStart(4, '0')}`;

    const applicant = await prisma.applicant.create({
      data: {
        ...req.body,
        applicationNo,
        intakeYear: year,
        pipelineStage: 'RECEIVED',
        status: 'active',
      }
    });

    res.status(201).json({ applicant });
  } catch (err) { next(err); }
});

// GET /api/admissions/stats
router.get('/stats', authenticate, admissionsAccess, async (req, res, next) => {
  try {
    const { intakeYear = new Date().getFullYear() } = req.query;

    const stages = ['RECEIVED', 'DOCS_REVIEW', 'INTERVIEW_SCHEDULED', 'INTERVIEW_DONE', 'WAITLISTED', 'ACCEPTED', 'REJECTED', 'ENROLLED'];
    const counts = await Promise.all(
      stages.map(stage =>
        prisma.applicant.count({ where: { pipelineStage: stage, intakeYear: parseInt(intakeYear) } })
          .then(count => ({ stage, count }))
      )
    );

    const total = counts.reduce((s, c) => s + c.count, 0);
    const enrolled = counts.find(c => c.stage === 'ENROLLED')?.count || 0;
    const accepted = counts.find(c => c.stage === 'ACCEPTED')?.count || 0;

    res.json({ counts, total, acceptanceRate: total ? ((accepted + enrolled) / total * 100).toFixed(1) : 0 });
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
      }
    });
    if (!applicant) return res.status(404).json({ error: 'Applicant not found' });
    res.json({ applicant });
  } catch (err) { next(err); }
});

// PUT /api/admissions/:id/stage — advance stage
router.put('/:id/stage', authenticate, admissionsAccess, async (req, res, next) => {
  try {
    const { stage } = req.body;
    const applicant = await prisma.applicant.findUnique({
      where: { id: req.params.id },
      include: { references: true }
    });

    if (!applicant) return res.status(404).json({ error: 'Applicant not found' });

    // Validate prerequisites
    if (stage === 'INTERVIEW_SCHEDULED' || stage === 'INTERVIEW_DONE') {
      const bothReceived = applicant.references.filter(r => r.status === 'RECEIVED').length >= 2;
      if (!bothReceived) {
        return res.status(400).json({ error: 'Both references must be received before advancing past Docs Review' });
      }
    }

    const updated = await prisma.applicant.update({
      where: { id: req.params.id },
      data: { pipelineStage: stage }
    });

    // Auto-notify for waitlisted
    if (stage === 'WAITLISTED') {
      try {
        const settings = await prisma.systemSetting.findUnique({ where: { key: 'admissions' } });
        const deadline = settings?.value?.acceptanceDeadlineDays
          ? new Date(Date.now() + settings.value.acceptanceDeadlineDays * 24 * 60 * 60 * 1000)
          : null;

        const { sendWaitlistedEmail } = require('../services/email.service');
        await sendWaitlistedEmail(applicant, deadline);
      } catch (_e) {}
    }

    res.json({ applicant: updated });
  } catch (err) { next(err); }
});

// POST /api/admissions/:id/interview
router.post('/:id/interview', authenticate, admissionsAccess, async (req, res, next) => {
  try {
    const { interviewScore, interviewNotes, recommendation } = req.body;

    const applicant = await prisma.applicant.update({
      where: { id: req.params.id },
      data: {
        interviewScore,
        interviewNotes,
        interviewerId: req.user.id,
        interviewedAt: new Date(),
        pipelineStage: 'INTERVIEW_DONE',
      }
    });

    res.json({ applicant });
  } catch (err) { next(err); }
});

// POST /api/admissions/:id/accept
router.post('/:id/accept', authenticate, admissionsAccess, async (req, res, next) => {
  try {
    const applicant = await prisma.applicant.findUnique({
      where: { id: req.params.id },
      include: { programme: true }
    });

    if (!applicant) return res.status(404).json({ error: 'Applicant not found' });

    // Check intake capacity (warn, don't block)
    const settings = await prisma.systemSetting.findUnique({ where: { key: 'admissions' } });
    const deadlineDays = settings?.value?.acceptanceDeadlineDays || 14;

    // Create student user account
    const userIdDisplay = await generateUserId('STUDENT');
    const tempPassword = Math.random().toString(36).slice(-10) + 'A1!';
    const tempHash = await bcrypt.hash(tempPassword, 12);

    const formData = applicant.formData || {};
    const email = formData.email || `${applicant.applicationNo}@student.hmc.edu`;

    const newUser = await prisma.user.create({
      data: {
        userIdDisplay,
        role: 'STUDENT',
        email,
        status: 'ACTIVE',
        auth: {
          create: {
            passwordHash: await bcrypt.hash(uuidv4(), 12), // placeholder
            tempPasswordHash: tempHash,
            tempPasswordExpires: new Date(Date.now() + 48 * 60 * 60 * 1000),
          }
        },
        studentProfile: {
          create: {
            firstName: formData.firstName || '',
            lastName: formData.lastName || '',
            dob: formData.dob ? new Date(formData.dob) : new Date('2000-01-01'),
            gender: formData.gender || 'Not specified',
            nationality: formData.nationality || 'Indian',
            studentType: applicant.studentType,
            studyMode: formData.studyMode || 'OFFLINE',
            programmeId: applicant.programmeId,
          }
        }
      }
    });

    // Update applicant
    const offerExpires = new Date(Date.now() + deadlineDays * 24 * 60 * 60 * 1000);
    await prisma.applicant.update({
      where: { id: req.params.id },
      data: {
        pipelineStage: 'ACCEPTED',
        decision: 'accept',
        decisionAt: new Date(),
        offerExpiresAt: offerExpires,
        convertedToUserId: newUser.id,
      }
    });

    // Send acceptance email with credentials
    try {
      const { sendAcceptanceLetter } = require('../services/email.service');
      await sendAcceptanceLetter(applicant, newUser, tempPassword, offerExpires);
    } catch (_e) {}

    res.json({ message: 'Applicant accepted. Student account created.', userId: newUser.id, userIdDisplay, tempPassword });
  } catch (err) { next(err); }
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
        decisionReason: reason,
        decisionAt: new Date(),
        status: 'archived',
      }
    });

    try {
      const { sendRejectionEmail } = require('../services/email.service');
      await sendRejectionEmail(applicant, reason);
    } catch (_e) {}

    res.json({ applicant });
  } catch (err) { next(err); }
});

// POST /api/admissions/:id/enroll — confirm enrollment
router.post('/:id/enroll', authenticate, admissionsAccess, async (req, res, next) => {
  try {
    const applicant = await prisma.applicant.update({
      where: { id: req.params.id },
      data: { pipelineStage: 'ENROLLED' }
    });
    res.json({ applicant });
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
      }
    });
    res.json({ applicant });
  } catch (err) { next(err); }
});

module.exports = router;
