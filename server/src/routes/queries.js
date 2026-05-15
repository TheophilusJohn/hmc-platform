// server/src/routes/queries.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { adminOnly, requireRole } = require('../middleware/rbac');
const notif = require('../services/notification.service');

router.get('/', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { status, category } = req.query;
    const where = {};
    if (status) where.status = status;
    if (category) where.category = category;

    const queries = await prisma.studentQuery.findMany({
      where,
      include: { student: { include: { studentProfile: { select: { firstName: true, lastName: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ queries, total: queries.length });
  } catch (err) { next(err); }
});

const QUERY_CATEGORIES = new Set(['FEES', 'ACADEMIC', 'PROFILE', 'OTHER']);
const QUERY_SUBJECT_MAX = 200;
const QUERY_BODY_MAX = 5 * 1024;

router.post('/', authenticate, requireRole('STUDENT'), async (req, res, next) => {
  try {
    const { subject, body } = req.body;
    const category = String(req.body.category || '').toUpperCase();
    if (!QUERY_CATEGORIES.has(category)) {
      return res.status(400).json({ error: `category must be one of: ${[...QUERY_CATEGORIES].join(', ')}` });
    }
    if (!subject || !String(subject).trim()) return res.status(400).json({ error: 'subject is required' });
    if (!body || !String(body).trim()) return res.status(400).json({ error: 'body is required' });
    if (String(subject).length > QUERY_SUBJECT_MAX) return res.status(400).json({ error: `subject exceeds ${QUERY_SUBJECT_MAX} character limit` });
    if (String(body).length > QUERY_BODY_MAX) return res.status(400).json({ error: `body exceeds ${QUERY_BODY_MAX} character limit` });

    const slaSetting = await prisma.systemSetting.findUnique({ where: { key: 'query_sla_hours' } });
    const slaHours = slaSetting?.value?.hours || 48;
    const slaDeadline = new Date(Date.now() + slaHours * 60 * 60 * 1000);

    const query = await prisma.studentQuery.create({
      data: { studentId: req.user.id, category, subject, body, status: 'OPEN', slaDeadline },
    });
    res.status(201).json(query);
  } catch (err) { next(err); }
});

router.get('/my', authenticate, async (req, res, next) => {
  try {
    const queries = await prisma.studentQuery.findMany({
      where: { studentId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ queries });
  } catch (err) { next(err); }
});

router.get('/overdue', authenticate, adminOnly, async (req, res, next) => {
  try {
    const overdue = await prisma.studentQuery.findMany({
      where: { status: { not: 'RESOLVED' }, slaDeadline: { lt: new Date() } },
      include: { student: { include: { studentProfile: { select: { firstName: true, lastName: true } } } } },
      orderBy: { slaDeadline: 'asc' },
    });
    res.json(overdue);
  } catch (err) { next(err); }
});

router.put('/:id/respond', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { response, status } = req.body;
    const finalStatus = String(status || 'IN_PROGRESS').toUpperCase();
    const data = { response, status: finalStatus, assigneeId: req.user.id };
    if (finalStatus === 'RESOLVED') data.resolvedAt = new Date();
    const query = await prisma.studentQuery.update({
      where: { id: req.params.id }, data,
    });
    await notif.createNotification(query.studentId, 'query_response', 'Query Response',
      `Your query "${query.subject}" has received a response.`, '/student/help');
    res.json(query);
  } catch (err) { next(err); }
});

router.put('/:id/status', authenticate, adminOnly, async (req, res, next) => {
  try {
    const data = { status: req.body.status };
    if (req.body.status === 'RESOLVED') data.resolvedAt = new Date();
    const query = await prisma.studentQuery.update({ where: { id: req.params.id }, data });
    res.json(query);
  } catch (err) { next(err); }
});

module.exports = router;
