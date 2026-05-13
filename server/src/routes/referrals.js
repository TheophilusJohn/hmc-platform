const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authenticate } = require('../middleware/auth');
const { adminOnly } = require('../middleware/rbac');
const notif = require('../services/notification.service');

// GET /api/referral-programmes
router.get('/programmes', authenticate, async (req, res, next) => {
  try {
    const programmes = await prisma.referralProgramme.findMany({
      where: { is_active: true },
      orderBy: { valid_from: 'desc' },
    });
    res.json(programmes);
  } catch (err) { next(err); }
});

// POST /api/referral-programmes
router.post('/programmes', authenticate, adminOnly, async (req, res, next) => {
  try {
    const rp = await prisma.referralProgramme.create({ data: req.body });
    res.status(201).json(rp);
  } catch (err) { next(err); }
});

// PUT /api/referral-programmes/:id
router.put('/programmes/:id', authenticate, adminOnly, async (req, res, next) => {
  try {
    const rp = await prisma.referralProgramme.update({ where: { id: req.params.id }, data: req.body });
    res.json(rp);
  } catch (err) { next(err); }
});

// GET /api/referrals/my
router.get('/my', authenticate, async (req, res, next) => {
  try {
    const referrals = await prisma.referral.findMany({
      where: { referrer_id: req.user.id },
      include: {
        referred_applicant: { select: { first_name: true, last_name: true, pipeline_stage: true, programme: { select: { name: true } } } },
        programme: true,
      },
      orderBy: { created_at: 'desc' },
    });

    const stats = {
      total_referred: referrals.length,
      in_pipeline: referrals.filter(r => !['enrolled', 'rejected'].includes(r.referred_applicant?.pipeline_stage)).length,
      enrolled: referrals.filter(r => r.referred_applicant?.pipeline_stage === 'enrolled').length,
      rewards_earned: referrals.filter(r => r.status === 'rewarded').length,
    };

    res.json({ referrals, stats });
  } catch (err) { next(err); }
});

// GET /api/referrals/code/:studentId
router.get('/code/:studentId', authenticate, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.studentId },
      select: { user_id_display: true, referral_code: true },
    });
    const code = user.referral_code || user.user_id_display.replace('HMC-S-', 'HMC-').replace('HMC-', '');
    const link = `${process.env.CLIENT_URL}/apply?ref=${code}`;
    res.json({ code, link });
  } catch (err) { next(err); }
});

// GET /api/referrals — all (Admin)
router.get('/', authenticate, adminOnly, async (req, res, next) => {
  try {
    const referrals = await prisma.referral.findMany({
      include: {
        referrer: { include: { student_profile: { select: { first_name: true, last_name: true } } } },
        referred_applicant: { select: { first_name: true, last_name: true, pipeline_stage: true } },
        programme: { select: { name: true } },
      },
      orderBy: { created_at: 'desc' },
    });
    res.json(referrals);
  } catch (err) { next(err); }
});

// POST /api/referrals/trigger/:applicantId
router.post('/trigger/:applicantId', authenticate, async (req, res, next) => {
  try {
    const applicant = await prisma.applicant.findUnique({ where: { id: req.params.applicantId } });
    if (!applicant?.referral_code) return res.json({ triggered: false, reason: 'No referral code' });

    // Find referrer
    const referrer = await prisma.user.findFirst({ where: { referral_code: applicant.referral_code } });
    if (!referrer) return res.json({ triggered: false, reason: 'Referrer not found' });

    // Self-referral check
    const referrerProfile = await prisma.studentProfile.findUnique({ where: { user_id: referrer.id } });
    if (referrerProfile && (applicant.email === referrer.email || applicant.phone === referrerProfile.phone)) {
      return res.json({ triggered: false, reason: 'Self-referral prevented' });
    }

    // Find active programme
    const now = new Date();
    const rp = await prisma.referralProgramme.findFirst({
      where: { is_active: true, valid_from: { lte: now }, valid_until: { gte: now } },
    });
    if (!rp) return res.json({ triggered: false, reason: 'No active referral programme' });

    // Create or update referral
    const referral = await prisma.referral.upsert({
      where: { referrer_id_referred_applicant_id: { referrer_id: referrer.id, referred_applicant_id: applicant.id } },
      create: { referrer_id: referrer.id, referred_applicant_id: applicant.id, programme_id: rp.id, status: 'triggered' },
      update: { status: 'triggered' },
    });

    // Apply reward
    if (rp.incentive_type === 'waiver' || rp.incentive_type === 'both') {
      const isIntl = referrerProfile?.student_type === 'international';
      const amount = isIntl ? rp.international_incentive_usd : rp.domestic_incentive_inr;

      await prisma.studentFeeLedger.create({
        data: {
          student_id: referrer.id, amount: -amount, currency: isIntl ? 'USD' : 'INR',
          balance: -amount, status: 'waived',
          notes: `Referral reward — ${applicant.first_name} ${applicant.last_name}`,
        },
      });
      await prisma.referral.update({ where: { id: referral.id }, data: { status: 'rewarded', reward_applied_at: new Date() } });
    }

    if (rp.incentive_type === 'cash' || rp.incentive_type === 'both') {
      // Notify Admin for cash processing
      await notif.createNotification(null, 'referral_cash_reward', 'Cash Referral Reward Pending', `${referrer.user_id_display} earned a cash referral reward for ${applicant.first_name} ${applicant.last_name}. Please process.`, '/admin/finance');
    }

    await notif.createNotification(referrer.id, 'referral_reward', 'Referral Reward Applied', 'Your referral reward has been applied to your account.', '/student/referrals');

    res.json({ triggered: true, referral });
  } catch (err) { next(err); }
});

module.exports = router;
