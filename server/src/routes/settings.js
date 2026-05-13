// server/src/routes/settings.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { adminOnly } = require('../middleware/rbac');

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
    const complete = sections.filter(s => s.configured).length;
    res.json({ percentage: Math.round((complete / sections.length) * 100), sections });
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

    res.json({ logs, total });
  } catch (err) { next(err); }
});

module.exports = router;
