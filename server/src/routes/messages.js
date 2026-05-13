const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authenticate } = require('../middleware/auth');
const emailService = require('../services/email.service');

function personalise(template, data) {
  return template
    .replace(/{student_name}/g, data.student_name || '')
    .replace(/{balance_due}/g, data.balance_due || '')
    .replace(/{due_date}/g, data.due_date || '')
    .replace(/{exam_date}/g, data.exam_date || '')
    .replace(/{exam_name}/g, data.exam_name || '')
    .replace(/{subject_name}/g, data.subject_name || '')
    .replace(/{deadline}/g, data.deadline || '')
    .replace(/{programme}/g, data.programme || '');
}

// GET /api/messages
router.get('/', authenticate, async (req, res, next) => {
  try {
    const messages = await prisma.message.findMany({
      where: req.user.role === 'faculty' ? { sender_id: req.user.id } : undefined,
      include: { template: { select: { name: true } }, sender: { include: { student_profile: true, faculty_profile: true } } },
      orderBy: { sent_at: 'desc' },
    });
    res.json(messages);
  } catch (err) { next(err); }
});

// POST /api/messages
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { type, subject, body, channels, recipient_scope, template_id } = req.body;
    const settings = await prisma.systemSetting.findMany({ where: { key: { in: ['sendgrid', 'communication_phone'] } } });
    const settingsMap = Object.fromEntries(settings.map(s => [s.key, s.value]));

    // Build recipients
    let recipients = [];
    if (recipient_scope.type === 'all') {
      const students = await prisma.user.findMany({ where: { role: 'student', status: 'active' }, include: { student_profile: true } });
      recipients = students;
    } else if (recipient_scope.type === 'batch') {
      const students = await prisma.user.findMany({ where: { role: 'student', status: 'active', student_profile: { batch_id: recipient_scope.batch_id } }, include: { student_profile: true } });
      recipients = students;
    } else if (recipient_scope.type === 'individual') {
      const students = await prisma.user.findMany({ where: { id: { in: recipient_scope.student_ids }, role: 'student' }, include: { student_profile: true } });
      recipients = students;
    }

    const message = await prisma.message.create({
      data: { sender_id: req.user.id, type, subject, body, channels, recipient_scope, sent_at: new Date(), status: 'sent', template_id: template_id || null },
    });

    // Send emails if channel configured
    if (channels.includes('email') && settingsMap.sendgrid?.api_key) {
      await Promise.allSettled(recipients.map(r => {
        const name = `${r.student_profile?.first_name} ${r.student_profile?.last_name}`;
        const personalised = personalise(body, { student_name: name });
        return emailService.sendGenericMessage(r.email, subject, personalised);
      }));
    }

    // Create in-app notifications
    await Promise.all(recipients.map(r =>
      prisma.notification.create({
        data: { user_id: r.id, type: 'message', title: subject, body: personalise(body.substring(0, 100), { student_name: `${r.student_profile?.first_name}` }), is_read: false },
      })
    ));

    res.status(201).json(message);
  } catch (err) { next(err); }
});

// POST /api/messages/preview-recipients
router.post('/preview-recipients', authenticate, async (req, res, next) => {
  try {
    const { recipient_scope } = req.body;
    let recipients = [];
    if (recipient_scope.type === 'all') {
      recipients = await prisma.user.findMany({ where: { role: 'student', status: 'active' }, include: { student_profile: { select: { first_name: true, last_name: true } } } });
    } else if (recipient_scope.type === 'batch') {
      recipients = await prisma.user.findMany({ where: { role: 'student', status: 'active', student_profile: { batch_id: recipient_scope.batch_id } }, include: { student_profile: { select: { first_name: true, last_name: true } } } });
    } else if (recipient_scope.type === 'individual') {
      recipients = await prisma.user.findMany({ where: { id: { in: recipient_scope.student_ids } }, include: { student_profile: { select: { first_name: true, last_name: true } } } });
    }
    res.json({ count: recipients.length, recipients: recipients.map(r => ({ id: r.id, name: `${r.student_profile?.first_name} ${r.student_profile?.last_name}`, display_id: r.user_id_display })) });
  } catch (err) { next(err); }
});

// GET /api/messages/templates
router.get('/templates', authenticate, async (req, res, next) => {
  try {
    const templates = await prisma.messageTemplate.findMany({ orderBy: { name: 'asc' } });
    res.json(templates);
  } catch (err) { next(err); }
});

// POST /api/messages/templates
router.post('/templates', authenticate, async (req, res, next) => {
  try {
    const t = await prisma.messageTemplate.create({ data: { ...req.body, created_by: req.user.id } });
    res.status(201).json(t);
  } catch (err) { next(err); }
});

// GET /api/messages/inbox
router.get('/inbox', authenticate, async (req, res, next) => {
  try {
    // Faculty or student inbox
    const threads = await prisma.message.findMany({
      where: { OR: [{ sender_id: req.user.id }, { recipient_scope: { path: ['individual_ids'], array_contains: req.user.id } }] },
      orderBy: { sent_at: 'desc' },
    });
    res.json(threads);
  } catch (err) { next(err); }
});

// POST /api/messages/reply
router.post('/reply', authenticate, async (req, res, next) => {
  try {
    const { parent_id, body, recipient_id } = req.body;
    const reply = await prisma.message.create({
      data: { sender_id: req.user.id, type: 'general', subject: 'Re:', body, channels: ['in_app'], recipient_scope: { type: 'individual', individual_ids: [recipient_id] }, sent_at: new Date(), status: 'sent', parent_id },
    });
    await prisma.notification.create({
      data: { user_id: recipient_id, type: 'message_reply', title: 'New message reply', body: body.substring(0, 80), is_read: false },
    });
    res.status(201).json(reply);
  } catch (err) { next(err); }
});

module.exports = router;
