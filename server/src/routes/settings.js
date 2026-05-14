// server/src/routes/settings.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { adminOnly } = require('../middleware/rbac');

// GET /api/settings/public - safe-to-expose settings (no auth required).
// Returns feature-presence booleans (no secrets) so non-admin clients can drive
// conditional UI through useFeatures(). The admin endpoint at GET /api/settings
// returns the full keyed config and is admin-only.
router.get('/public', async (req, res, next) => {
  try {
    const settings = await prisma.systemSetting.findMany({
      where: {
        key: {
          in: ['razorpay', 'college_info', 'sendgrid', 'communication_phone', 'wise'],
        },
      },
    });
    const map = Object.fromEntries(settings.map(s => [s.key, s.value]));
    res.json({
      razorpay_key_id: map.razorpay?.key_id || null,
      collegeName: map.college_info?.name || 'Harvest Mission College',
      shortName: map.college_info?.short_name || 'HMC',
      features: {
        hasRazorpay: !!(map.razorpay?.key_id && map.razorpay?.key_secret),
        hasEmail: !!(map.sendgrid?.api_key),
        hasSMS: !!(map.communication_phone?.msg91_key || map.communication_phone?.twilio_account_sid),
        hasWhatsApp: !!(map.communication_phone?.whatsapp_business_id),
        hasWise: !!(map.wise?.api_key),
        hasPhone: !!(map.communication_phone?.phone_number),
      },
    });
  } catch (err) { next(err); }
});

const SETTING_SECTIONS = [
  'college_info', 'communication_phone', 'sendgrid', 'razorpay', 'wise',
  'admissions', 'academic', 'security', 'privacy', 'fee_lock', 'notifications',
];

router.get('/', authenticate, adminOnly, async (req, res, next) => {
  try {
    const settings = await prisma.systemSetting.findMany();
    const map = settings.reduce((acc, s) => { acc[s.key] = s.value; return acc; }, {});
    res.json({ settings: map });
  } catch (err) { next(err); }
});

router.put('/', authenticate, adminOnly, async (req, res, next) => {
  try {
    const updates = req.body; // { key: value, ... }
    await Promise.all(
      Object.entries(updates).map(([key, value]) =>
        prisma.systemSetting.upsert({
          where: { key },
          update: { value, updatedById: req.user.id },
          create: { key, value, updatedById: req.user.id },
        })
      )
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.put('/:key', authenticate, adminOnly, async (req, res, next) => {
  try {
    const setting = await prisma.systemSetting.upsert({
      where: { key: req.params.key },
      update: { value: req.body, updatedById: req.user.id },
      create: { key: req.params.key, value: req.body, updatedById: req.user.id },
    });
    res.json({ setting });
  } catch (err) { next(err); }
});

router.get('/completion', authenticate, adminOnly, async (req, res, next) => {
  try {
    const settings = await prisma.systemSetting.findMany({ select: { key: true } });
    const configured = settings.map(s => s.key);
    const sections = SETTING_SECTIONS.map(key => ({
      key,
      label: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      configured: configured.includes(key),
    }));
    const completed = sections.filter(s => s.configured).length;
    const incomplete = sections.filter(s => !s.configured).map(s => s.label);
    res.json({
      percent: Math.round((completed / sections.length) * 100),
      completed, total: sections.length, incomplete, sections,
    });
  } catch (err) { next(err); }
});

router.get('/audit-log', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { actor, action, table, from, to, page = 1, limit = 50 } = req.query;
    const where = {};
    if (actor) where.actorId = actor;
    if (action) where.action = action;
    if (table) where.tableName = table;
    if (from || to) where.timestamp = { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) };

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { actor: { select: { userIdDisplay: true, email: true } } },
        orderBy: { timestamp: 'desc' },
        skip: (page - 1) * limit,
        take: parseInt(limit),
      }),
      prisma.auditLog.count({ where }),
    ]);

    const flat = logs.map(l => ({
      id: l.id,
      actorName: l.actor?.userIdDisplay || '—',
      actorEmail: l.actor?.email || '',
      action: l.action,
      tableName: l.tableName,
      timestamp: l.timestamp,
      ipAddress: l.ipAddress,
    }));
    res.json({ logs: flat, total });
  } catch (err) { next(err); }
});

module.exports = router;
