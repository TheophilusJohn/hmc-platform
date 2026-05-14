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

// PUT /api/users/:id - comprehensive update (user + profile fields)
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const isSelf = req.params.id === req.user.id;
    const isAdmin = req.user.role === 'FULL_ADMIN';
    if (!isSelf && !isAdmin) return res.status(403).json({ error: 'Access denied' });

    // Self-protection: admins editing themselves cannot change own role/status
    if (isSelf) {
      if (req.body.role !== undefined) return res.status(400).json({ error: 'You cannot change your own role.' });
      if (req.body.status !== undefined) return res.status(400).json({ error: 'You cannot change your own status.' });
    }

    // Block last-admin role demotion
    if (isAdmin && req.body.role && req.body.role !== 'FULL_ADMIN') {
      const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { role: true } });
      if (target?.role === 'FULL_ADMIN') {
        const adminCount = await prisma.user.count({ where: { role: 'FULL_ADMIN', status: 'ACTIVE' } });
        if (adminCount <= 1) {
          return res.status(400).json({ error: 'Cannot demote the last Full Admin.' });
        }
      }
    }

    const userBefore = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { studentProfile: true, facultyProfile: true },
    });
    if (!userBefore) return res.status(404).json({ error: 'User not found' });

    // Decide allowed fields by permission level
    const userFields = isAdmin
      ? ['email', 'phone', 'status']
      : ['email', 'phone'];
    const studentFields = ['firstName', 'lastName', 'dob', 'gender', 'nationality', 'permanentAddress', 'presentAddress', 'batchId', 'programmeId', 'studentType', 'studyMode'];
    const facultyFields = ['firstName', 'lastName', 'designation', 'qualification'];

    // Build User update payload
    const userData = {};
    for (const k of userFields) if (req.body[k] !== undefined) userData[k] = req.body[k];

    if (Object.keys(userData).length) {
      await prisma.user.update({ where: { id: req.params.id }, data: userData });
    }

    // Profile updates (admin only)
    if (isAdmin) {
      if (userBefore.studentProfile) {
        const spData = {};
        for (const k of studentFields) if (req.body[k] !== undefined) spData[k] = req.body[k];
        if (spData.dob) spData.dob = new Date(spData.dob);
        if (spData.studyMode) spData.studyMode = String(spData.studyMode).toUpperCase();
        if (spData.studentType) spData.studentType = String(spData.studentType).toUpperCase();
        if (Object.keys(spData).length) {
          await prisma.studentProfile.update({ where: { userId: req.params.id }, data: spData });
        }
      } else if (userBefore.facultyProfile) {
        const fpData = {};
        for (const k of facultyFields) if (req.body[k] !== undefined) fpData[k] = req.body[k];
        if (Object.keys(fpData).length) {
          await prisma.facultyProfile.update({ where: { userId: req.params.id }, data: fpData });
        }
      }
    }

    const updated = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { studentProfile: { include: { programme: true, batch: true } }, facultyProfile: true },
    });
    res.json({ user: updated });
  } catch (err) { console.error('user update:', err); next(err); }
});

// DELETE /api/users/:id (deactivate)
router.delete('/:id', authenticate, adminOnly, async (req, res, next) => {
  try {
    // Block self-deactivation
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot deactivate your own account. Ask another admin.' });
    }

    // Block deactivating the last active Full Admin
    const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { role: true, status: true } });
    if (target?.role === 'FULL_ADMIN' && target?.status === 'ACTIVE') {
      const adminCount = await prisma.user.count({ where: { role: 'FULL_ADMIN', status: 'ACTIVE' } });
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot deactivate the last active Full Admin. Promote another user first.' });
      }
    }

    // Block if faculty has active subjects
    const faculty = await prisma.facultyProfile.findFirst({ where: { userId: req.params.id } });
    if (faculty) {
      const activeSubjects = await prisma.subject.count({ where: { facultyId: faculty.id, status: 'ACTIVE' } });
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


router.post('/:id/reactivate', authenticate, adminOnly, async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot reactivate your own account.' });
    }
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { status: 'ACTIVE' },
      select: { id: true, userIdDisplay: true, email: true, status: true, role: true },
    });
    res.json({ user });
  } catch (err) { console.error('user reactivate:', err); next(err); }
});


router.post('/:id/set-password', authenticate, adminOnly, async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'Use the Change Password page to change your own password.' });
    }
    const { password } = req.body;
    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const passwordHash = await bcrypt.hash(String(password), 12);
    await prisma.userAuth.update({
      where: { userId: req.params.id },
      data: {
        passwordHash,
        tempPasswordHash: null,
        tempPasswordExpires: null,
        failedAttempts: 0,
      },
    });
    res.json({ message: 'Password set successfully. User can now log in with this password.' });
  } catch (err) { console.error('set-password:', err); next(err); }
});

module.exports = router;
