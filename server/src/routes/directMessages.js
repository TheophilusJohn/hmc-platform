// server/src/routes/directMessages.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');

function displayName(user) {
  if (!user) return null;
  const p = user.studentProfile || user.facultyProfile;
  return p ? `${p.firstName} ${p.lastName}` : user.userIdDisplay;
}

const userSelect = {
  id: true,
  userIdDisplay: true,
  studentProfile: { select: { firstName: true, lastName: true } },
  facultyProfile: { select: { firstName: true, lastName: true } },
};

router.get('/', authenticate, async (req, res, next) => {
  try {
    const { box = 'inbox', page = 1, limit = 50 } = req.query;
    const where = box === 'sent' ? { senderId: req.user.id } : { recipientId: req.user.id };
    const messages = await prisma.directMessage.findMany({
      where,
      include: { sender: { select: userSelect }, recipient: { select: userSelect } },
      orderBy: { createdAt: 'desc' },
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit),
    });
    const flat = messages.map(m => ({
      id: m.id,
      subject: m.subject,
      body: m.body,
      isRead: m.isRead,
      readAt: m.readAt,
      createdAt: m.createdAt,
      senderId: m.senderId,
      senderName: displayName(m.sender),
      recipientId: m.recipientId,
      recipientName: displayName(m.recipient),
    }));
    const total = await prisma.directMessage.count({ where });
    const unread = box === 'inbox' ? await prisma.directMessage.count({ where: { recipientId: req.user.id, isRead: false } }) : 0;
    res.json({ messages: flat, total, unread });
  } catch (err) { next(err); }
});

router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const msg = await prisma.directMessage.findUnique({
      where: { id: req.params.id },
      include: { sender: { select: userSelect }, recipient: { select: userSelect } },
    });
    if (!msg) return res.status(404).json({ error: 'Not found' });
    if (msg.recipientId !== req.user.id && msg.senderId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (msg.recipientId === req.user.id && !msg.isRead) {
      await prisma.directMessage.update({ where: { id: msg.id }, data: { isRead: true, readAt: new Date() } });
      msg.isRead = true;
    }
    res.json({
      message: {
        id: msg.id, subject: msg.subject, body: msg.body, isRead: msg.isRead, createdAt: msg.createdAt,
        senderName: displayName(msg.sender), recipientName: displayName(msg.recipient),
        senderId: msg.senderId, recipientId: msg.recipientId,
      },
    });
  } catch (err) { next(err); }
});

const DM_SUBJECT_MAX = 200;
const DM_BODY_MAX = 10 * 1024;

router.post('/', authenticate, async (req, res, next) => {
  try {
    const { recipientId, subject, body } = req.body;
    if (!recipientId || !subject || !body) return res.status(400).json({ error: 'recipientId, subject, body required' });
    if (recipientId === req.user.id) return res.status(400).json({ error: 'Cannot message yourself' });
    if (String(subject).length > DM_SUBJECT_MAX) return res.status(400).json({ error: `Subject exceeds ${DM_SUBJECT_MAX} character limit` });
    if (String(body).length > DM_BODY_MAX) return res.status(400).json({ error: `Body exceeds ${DM_BODY_MAX} character limit` });
    const rec = await prisma.user.findUnique({ where: { id: recipientId }, select: { id: true } });
    if (!rec) return res.status(400).json({ error: 'Recipient not found' });
    const message = await prisma.directMessage.create({
      data: { senderId: req.user.id, recipientId, subject, body },
    });
    res.status(201).json({ message });
  } catch (err) { next(err); }
});

router.put('/:id/read', authenticate, async (req, res, next) => {
  try {
    const msg = await prisma.directMessage.findUnique({ where: { id: req.params.id } });
    if (!msg || msg.recipientId !== req.user.id) return res.status(403).json({ error: 'Access denied' });
    await prisma.directMessage.update({ where: { id: req.params.id }, data: { isRead: true, readAt: new Date() } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const msg = await prisma.directMessage.findUnique({ where: { id: req.params.id } });
    if (!msg || (msg.recipientId !== req.user.id && msg.senderId !== req.user.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    await prisma.directMessage.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
