// server/src/routes/messages.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { adminOrTA } = require('../middleware/rbac');
const emailService = require('../services/email.service');

function personalise(template, data) {
  return template
    .replace(/{student_name}/g, data.studentName || '')
    .replace(/{balance_due}/g, data.balanceDue || '')
    .replace(/{due_date}/g, data.dueDate || '')
    .replace(/{exam_date}/g, data.examDate || '')
    .replace(/{exam_name}/g, data.examName || '')
    .replace(/{subject_name}/g, data.subjectName || '')
    .replace(/{deadline}/g, data.deadline || '')
    .replace(/{programme}/g, data.programme || '');
}

router.get('/', authenticate, async (req, res, next) => {
  try {
    const messages = await prisma.message.findMany({
      where: req.user.role === 'FACULTY' ? { senderId: req.user.id } : undefined,
      include: {
        template: { select: { name: true } },
        sender: { include: { studentProfile: true, facultyProfile: true } },
      },
      orderBy: { sentAt: 'desc' },
    });
    res.json({ messages });
  } catch (err) { next(err); }
});

const MESSAGE_SUBJECT_MAX = 200;
const MESSAGE_BODY_MAX = 20 * 1024;

router.post('/', authenticate, adminOrTA, async (req, res, next) => {
  try {
    const { type, subject, body, channels, recipientScope, templateId } = req.body;
    if (subject && String(subject).length > MESSAGE_SUBJECT_MAX) {
      return res.status(400).json({ error: `Subject exceeds ${MESSAGE_SUBJECT_MAX} character limit` });
    }
    if (body && String(body).length > MESSAGE_BODY_MAX) {
      return res.status(400).json({ error: `Body exceeds ${MESSAGE_BODY_MAX} character limit` });
    }
    const settings = await prisma.systemSetting.findMany({ where: { key: { in: ['sendgrid', 'communication_phone'] } } });
    const settingsMap = Object.fromEntries(settings.map(s => [s.key, s.value]));

    let recipients = [];
    const scopeType = String(recipientScope?.type || 'all').toLowerCase();
    if (scopeType === 'all') {
      recipients = await prisma.user.findMany({
        where: { role: 'STUDENT', status: 'ACTIVE' },
        include: { studentProfile: true },
      });
    } else if (scopeType === 'offline' || scopeType === 'online') {
      recipients = await prisma.user.findMany({
        where: { role: 'STUDENT', status: 'ACTIVE', studentProfile: { studyMode: scopeType.toUpperCase() } },
        include: { studentProfile: true },
      });
    } else if (scopeType === 'programme') {
      recipients = await prisma.user.findMany({
        where: { role: 'STUDENT', status: 'ACTIVE', studentProfile: { programmeId: recipientScope.programmeId } },
        include: { studentProfile: true },
      });
    } else if (scopeType === 'batch') {
      recipients = await prisma.user.findMany({
        where: { role: 'STUDENT', status: 'ACTIVE', studentProfile: { batchId: recipientScope.batchId } },
        include: { studentProfile: true },
      });
    } else if (scopeType === 'individual') {
      recipients = await prisma.user.findMany({
        where: { id: { in: recipientScope.studentIds || [] }, role: 'STUDENT' },
        include: { studentProfile: true },
      });
    }

    // Tolerate channels being either array or object
    const channelArr = Array.isArray(channels) ? channels :
      (channels && typeof channels === 'object' ? Object.entries(channels).filter(([_, v]) => v).map(([k]) => k) : []);

    const message = await prisma.message.create({
      data: {
        senderId: req.user.id,
        type, subject, body, channels: channelArr, recipientScope,
        sentAt: new Date(),
        status: 'SENT',
        templateId: templateId || null,
      },
    });

    if (channelArr.includes('email') && settingsMap.sendgrid?.api_key) {
      await Promise.allSettled(recipients.map(r => {
        const name = `${r.studentProfile?.firstName || ''} ${r.studentProfile?.lastName || ''}`.trim();
        const personalised = personalise(body, { studentName: name });
        return emailService.sendGenericMessage(r.email, subject, personalised);
      }));
    }

    await Promise.all(recipients.map(r =>
      prisma.notification.create({
        data: {
          userId: r.id,
          type: 'message',
          title: subject,
          body: personalise(body.substring(0, 100), { studentName: r.studentProfile?.firstName || '' }),
          isRead: false,
        },
      })
    ));

    res.status(201).json(message);
  } catch (err) { next(err); }
});

router.post('/preview-recipients', authenticate, adminOrTA, async (req, res, next) => {
  try {
    const { recipientScope } = req.body;
    let recipients = [];
    const scopeType = String(recipientScope?.type || 'all').toLowerCase();
    const profileSel = { select: { firstName: true, lastName: true } };
    if (scopeType === 'all') {
      recipients = await prisma.user.findMany({
        where: { role: 'STUDENT', status: 'ACTIVE' },
        include: { studentProfile: profileSel },
      });
    } else if (scopeType === 'offline' || scopeType === 'online') {
      recipients = await prisma.user.findMany({
        where: { role: 'STUDENT', status: 'ACTIVE', studentProfile: { studyMode: scopeType.toUpperCase() } },
        include: { studentProfile: profileSel },
      });
    } else if (scopeType === 'programme') {
      recipients = await prisma.user.findMany({
        where: { role: 'STUDENT', status: 'ACTIVE', studentProfile: { programmeId: recipientScope.programmeId } },
        include: { studentProfile: profileSel },
      });
    } else if (scopeType === 'batch') {
      recipients = await prisma.user.findMany({
        where: { role: 'STUDENT', status: 'ACTIVE', studentProfile: { batchId: recipientScope.batchId } },
        include: { studentProfile: profileSel },
      });
    } else if (scopeType === 'individual') {
      recipients = await prisma.user.findMany({
        where: { id: { in: recipientScope.studentIds || [] } },
        include: { studentProfile: profileSel },
      });
    }
    res.json({
      count: recipients.length,
      recipients: recipients.map(r => ({
        id: r.id,
        name: `${r.studentProfile?.firstName || ''} ${r.studentProfile?.lastName || ''}`.trim(),
        userIdDisplay: r.userIdDisplay,
      })),
    });
  } catch (err) { next(err); }
});

router.get('/templates', authenticate, async (req, res, next) => {
  try {
    const templates = await prisma.messageTemplate.findMany({ orderBy: { name: 'asc' } });
    res.json(templates);
  } catch (err) { next(err); }
});

router.post('/templates', authenticate, adminOrTA, async (req, res, next) => {
  try {
    const t = await prisma.messageTemplate.create({ data: { ...req.body, createdById: req.user.id } });
    res.status(201).json(t);
  } catch (err) { next(err); }
});

module.exports = router;
