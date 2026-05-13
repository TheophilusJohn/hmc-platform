// server/src/routes/users.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const bcrypt = require('bcrypt');
const { authenticate } = require('../middleware/auth');
const { adminOnly, requireRole, anyRole } = require('../middleware/rbac');
const { generateUserId } = require('../utils/userId');

// GET /api/users
router.get('/', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { role, status, search, programme, batch, page = 1, limit = 20 } = req.query;
    const where = {};
    if (role) where.role = role;
    if (status) where.status = status;
    if (search) where.OR = [
      { email: { contains: search, mode: 'insensitive' } },
      { userIdDisplay: { contains: search, mode: 'insensitive' } },
    ];

    const users = await prisma.user.findMany({
      where,
      include: {
        studentProfile: { include: { programme: { select: { name: true } }, batch: { select: { name: true } } } },
        facultyProfile: true,
      },
      skip: (page - 1) * limit,
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' },
    });

    const total = await prisma.user.count({ where });
    res.json({ users, total });
  } catch (err) { next(err); }
});

// POST /api/users
router.post('/', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { role, email, phone, firstName, lastName, ...profileData } = req.body;
    const userIdDisplay = await generateUserId(role);
    const tempPassword = Math.random().toString(36).slice(-8) + 'A1!';
    const tempHash = await bcrypt.hash(tempPassword, 12);

    const user = await prisma.user.create({
      data: {
        userIdDisplay,
        role,
        email,
        phone,
        status: 'ACTIVE',
        auth: {
          create: {
            passwordHash: await bcrypt.hash('placeholder', 12),
            tempPasswordHash: tempHash,
            tempPasswordExpires: new Date(Date.now() + 48 * 60 * 60 * 1000),
          }
        },
        ...(role === 'STUDENT' && {
          studentProfile: { create: { firstName, lastName, ...profileData, dob: new Date(profileData.dob || '2000-01-01'), gender: profileData.gender || 'Not specified', nationality: profileData.nationality || 'Indian', studyMode: profileData.studyMode || 'OFFLINE', studentType: profileData.studentType || 'DOMESTIC' } }
        }),
        ...((['FACULTY', 'TEACHER_ADMIN'].includes(role)) && {
          facultyProfile: { create: { firstName, lastName, designation: profileData.designation } }
        }),
      }
    });

    // Send welcome email
    try {
      const { sendWelcomeEmail } = require('../services/email.service');
      await sendWelcomeEmail({ ...user, firstName, lastName }, tempPassword);
    } catch (_e) {}

    res.status(201).json({ user, tempPassword });
  } catch (err) { next(err); }
});

// GET /api/users/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { studentProfile: { include: { programme: true, batch: true } }, facultyProfile: true }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) { next(err); }
});

// PUT /api/users/:id
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const isSelf = req.params.id === req.user.id;
    const isAdmin = req.user.role === 'FULL_ADMIN';
    if (!isSelf && !isAdmin) return res.status(403).json({ error: 'Access denied' });

    const allowedSelfFields = ['phone', 'email'];
    const data = isAdmin ? req.body : Object.fromEntries(
      Object.entries(req.body).filter(([k]) => allowedSelfFields.includes(k))
    );

    const user = await prisma.user.update({ where: { id: req.params.id }, data });
    res.json({ user });
  } catch (err) { next(err); }
});

// DELETE /api/users/:id (deactivate)
router.delete('/:id', authenticate, adminOnly, async (req, res, next) => {
  try {
    // Block if faculty has active subjects
    const faculty = await prisma.facultyProfile.findFirst({ where: { userId: req.params.id } });
    if (faculty) {
      const activeSubjects = await prisma.subject.count({ where: { facultyId: faculty.id, status: 'active' } });
      if (activeSubjects > 0) {
        return res.status(400).json({ error: 'Cannot deactivate faculty with active subjects. Reassign subjects first.' });
      }
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { status: 'INACTIVE' },
    });
    res.json({ user });
  } catch (err) { next(err); }
});

// POST /api/users/:id/reset-password
router.post('/:id/reset-password', authenticate, adminOnly, async (req, res, next) => {
  try {
    const tempPassword = Math.random().toString(36).slice(-8) + 'A1!';
    const tempHash = await bcrypt.hash(tempPassword, 12);

    await prisma.userAuth.update({
      where: { userId: req.params.id },
      data: {
        tempPasswordHash: tempHash,
        tempPasswordExpires: new Date(Date.now() + 48 * 60 * 60 * 1000),
      }
    });

    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    try {
      const { sendPasswordResetEmail } = require('../services/email.service');
      await sendPasswordResetEmail(user, null, tempPassword);
    } catch (_e) {}

    res.json({ message: 'Password reset. Temporary password sent to user.', tempPassword });
  } catch (err) { next(err); }
});

module.exports = router;
