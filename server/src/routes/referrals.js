// server/src/routes/referrals.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { adminOnly } = require('../middleware/rbac');
const notif = require('../services/notification.service');

router.get('/programmes', authenticate, async (req, res, next) => {
  try {
    const programmes = await prisma.referralProgramme.findMany({
      where: { isActive: true },
      orderBy: { validFrom: 'desc' },
    });
    res.json(programmes);
  } catch (err) { next(err); }
});

router.post('/programmes', authenticate, adminOnly, async (req, res, next) => {
  try {
    const rp = await prisma.referralProgramme.create({ data: req.body });
    res.status(201).json(rp);
  } catch (err) { next(err); }
});

router.put('/programmes/:id', authenticate, adminOnly, async (req, res, next) => {
  try {
    const rp = await prisma.referralProgramme.update({ where: { id: req.params.id }, data: req.body });
    res.json(rp);
  } catch (err) { next(err); }
});

router.get('/my', authenticate, async (req, res, next) => {
  try {
    const sp = await prisma.studentProfile.findFirst({
      where: { userId: req.user.id },
      include: { user: { select: { userIdDisplay: true } } },
    });
    if (!sp) return res.json({ referrals: [], total: 0, enrolled: 0, rewardsTotal: 0, referralCode: null });

    const referralCode = sp.referralCode || (sp.user?.userIdDisplay ? sp.user.userIdDisplay.replace('HMC-S-', 'HMC-') : null);

    const referrals = await prisma.referral.findMany({
      where: { referrerId: sp.id },
      include: {
        referredApplicant: {
          select: { applicationNo: true, formData: true, pipelineStage: true, createdAt: true,
                    programme: { select: { name: true } } },
        },
        programme: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const flat = referrals.map(r => {
      const fd = r.referredApplicant?.formData || {};
      const stage = String(r.referredApplicant?.pipelineStage || 'applied').toLowerCase();
      const isIntl = sp.studentType === 'INTERNATIONAL';
      let reward = 0;
      if (r.status === 'REWARDED' && r.programme) {
        reward = isIntl ? Number(r.programme.internationalIncentiveUsd || 0) : Number(r.programme.domesticIncentiveInr || 0);
      }
      return {
        id: r.id,
        refereeName: `${fd.firstName || ''} ${fd.lastName || ''}`.trim() || null,
        programmeName: r.referredApplicant?.programme?.name || '',
        appliedAt: r.referredApplicant?.createdAt || r.createdAt,
        stage, reward,
      };
    });

    const enrolled = flat.filter(r => r.stage === 'enrolled').length;
    const rewardsTotal = flat.reduce((s, r) => s + r.reward, 0);

    res.json({ referrals: flat, total: flat.length, enrolled, rewardsTotal, referralCode });
  } catch (err) { console.error('referrals/my:', err); next(err); }
});

router.get('/code/:studentId', authenticate, async (req, res, next) => {
  try {
    const sp = await prisma.studentProfile.findUnique({
      where: { id: req.params.studentId },
      include: { user: { select: { userIdDisplay: true } } },
    });
    if (!sp) return res.status(404).json({ error: 'Student not found' });

    const code = sp.referralCode || sp.user.userIdDisplay.replace('HMC-S-', 'HMC-');
    const link = `${process.env.CLIENT_URL}/apply?ref=${code}`;
    res.json({ code, link });
  } catch (err) { next(err); }
});

router.get('/', authenticate, adminOnly, async (req, res, next) => {
  try {
    const referrals = await prisma.referral.findMany({
      include: {
        referrer: { select: { firstName: true, lastName: true } },
        referredApplicant: { select: { applicationNo: true, formData: true, pipelineStage: true } },
        programme: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(referrals);
  } catch (err) { next(err); }
});

router.post('/trigger/:applicantId', authenticate, require('../middleware/rbac').requireRole('FULL_ADMIN', 'TEACHER_ADMIN', 'ADMISSIONS_OFFICER'), async (req, res, next) => {
  try {
    const applicant = await prisma.applicant.findUnique({ where: { id: req.params.applicantId } });
    if (!applicant?.referralCode) return res.json({ triggered: false, reason: 'No referral code' });

    const referrerProfile = await prisma.studentProfile.findFirst({
      where: { referralCode: applicant.referralCode },
      include: { user: true },
    });
    if (!referrerProfile) return res.json({ triggered: false, reason: 'Referrer not found' });

    const formData = applicant.formData || {};
    if (formData.email === referrerProfile.user.email) {
      return res.json({ triggered: false, reason: 'Self-referral prevented' });
    }

    const now = new Date();
    const rp = await prisma.referralProgramme.findFirst({
      where: { isActive: true, validFrom: { lte: now }, validUntil: { gte: now } },
    });
    if (!rp) return res.json({ triggered: false, reason: 'No active referral programme' });

    const existing = await prisma.referral.findFirst({
      where: { referrerId: referrerProfile.id, referredApplicantId: applicant.id },
    });

    const referral = existing
      ? await prisma.referral.update({ where: { id: existing.id }, data: { status: 'TRIGGERED' } })
      : await prisma.referral.create({
          data: {
            referrerId: referrerProfile.id,
            referredApplicantId: applicant.id,
            programmeId: rp.id,
            status: 'TRIGGERED',
          },
        });

    if (rp.incentiveType === 'WAIVER' || rp.incentiveType === 'BOTH') {
      const isIntl = referrerProfile.studentType === 'INTERNATIONAL';
      const amount = isIntl ? rp.internationalIncentiveUsd : rp.domesticIncentiveInr;

      await prisma.studentFeeLedger.create({
        data: {
          studentId: referrerProfile.id,
          amount: -amount,
          currency: isIntl ? 'USD' : 'INR',
          balance: -amount,
          status: 'WAIVED',
          description: `Referral reward — ${formData.firstName || ''} ${formData.lastName || ''}`.trim(),
        },
      });

      await prisma.referral.update({
        where: { id: referral.id },
        data: { status: 'REWARDED', rewardAppliedAt: new Date() },
      });
    }

    if (rp.incentiveType === 'CASH' || rp.incentiveType === 'BOTH') {
      const admins = await prisma.user.findMany({ where: { role: 'FULL_ADMIN', status: 'ACTIVE' } });
      for (const admin of admins) {
        await notif.createNotification(admin.id, 'referral_cash_reward', 'Cash Referral Reward Pending',
          `${referrerProfile.user.userIdDisplay} earned a cash referral. Please process.`, '/admin/finance');
      }
    }

    await notif.createNotification(referrerProfile.user.id, 'referral_reward', 'Referral Reward Applied',
      'Your referral reward has been applied.', '/student/referrals');

    res.json({ triggered: true, referral });
  } catch (err) { next(err); }
});

module.exports = router;
