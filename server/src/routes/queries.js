const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authenticate } = require('../middleware/auth');
const { adminOnly } = require('../middleware/rbac');
const notif = require('../services/notification.service');

// GET /api/queries — Admin views all
router.get('/', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { status, category } = req.query;
    const where = {};
    if (status) where.status = status;
    if (category) where.category = category;

    const queries = await prisma.studentQuery.findMany({
      where,
      include: { student: { include: { student_profile: { select: { first_name: true, last_name: true } } } } },
      orderBy: { created_at: 'desc' },
    });
    res.json(queries);
  } catch (err) { next(err); }
});

// POST /api/queries — student submits
router.post('/', authenticate, async (req, res, next) => {
  try {
    if (req.user.role !== 'student') return res.status(403).json({ error: 'Students only' });
    const { category, subject, body } = req.body;

    const slaSetting = await prisma.systemSetting.findUnique({ where: { key: 'query_sla_hours' } });
    const slaHours = slaSetting?.value?.hours || 48;
    const sla_deadline = new Date(Date.now() + slaHours * 60 * 60 * 1000);

    const query = await prisma.studentQuery.create({
      data: { student_id: req.user.id, category, subject, body, status: 'open', sla_deadline },
    });
    res.status(201).json(query);
  } catch (err) { next(err); }
});

// GET /api/queries/my — student's own
router.get('/my', authenticate, async (req, res, next) => {
  try {
    const queries = await prisma.studentQuery.findMany({
      where: { student_id: req.user.id },
      orderBy: { created_at: 'desc' },
    });
    res.json(queries);
  } catch (err) { next(err); }
});

// GET /api/queries/overdue
router.get('/overdue', authenticate, adminOnly, async (req, res, next) => {
  try {
    const overdue = await prisma.studentQuery.findMany({
      where: { status: { not: 'resolved' }, sla_deadline: { lt: new Date() } },
      include: { student: { include: { student_profile: { select: { first_name: true, last_name: true } } } } },
      orderBy: { sla_deadline: 'asc' },
    });
    res.json(overdue);
  } catch (err) { next(err); }
});

// PUT /api/queries/:id/respond
router.put('/:id/respond', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { response } = req.body;
    const query = await prisma.studentQuery.update({
      where: { id: req.params.id },
      data: { response, status: 'in_progress', assigned_to: req.user.id },
    });
    await notif.createNotification(query.student_id, 'query_response', 'Query Response', `Your query "${query.subject}" has received a response.`, '/student/help');
    res.json(query);
  } catch (err) { next(err); }
});

// PUT /api/queries/:id/status
router.put('/:id/status', authenticate, adminOnly, async (req, res, next) => {
  try {
    const data = { status: req.body.status };
    if (req.body.status === 'resolved') data.resolved_at = new Date();
    const query = await prisma.studentQuery.update({ where: { id: req.params.id }, data });
    res.json(query);
  } catch (err) { next(err); }
});

module.exports = router;
