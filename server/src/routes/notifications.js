// server/src/routes/notifications.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: parseInt(limit),
    });
    const total = await prisma.notification.count({ where: { userId: req.user.id } });
    res.json({ notifications, total });
  } catch (err) { next(err); }
});

router.get('/unread-count', authenticate, async (req, res, next) => {
  try {
    const count = await prisma.notification.count({ where: { userId: req.user.id, isRead: false } });
    res.json({ count });
  } catch (err) { next(err); }
});

router.put('/:id/read', authenticate, async (req, res, next) => {
  try {
    await prisma.notification.update({ where: { id: req.params.id }, data: { isRead: true } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.put('/read-all', authenticate, async (req, res, next) => {
  try {
    await prisma.notification.updateMany({ where: { userId: req.user.id }, data: { isRead: true } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
