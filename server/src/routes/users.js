// server/src/routes/users.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const bcrypt = require('bcrypt');
const { authenticate } = require('../middleware/auth');
const { adminOnly, requireRole, anyRole } = require('../middleware/rbac');
const { createUserWithGeneratedId } = require('../utils/userId');

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
    const { role, email, phone, firstName, lastName } = req.body;
    const ALLOWED_ROLES = ['FULL_ADMIN', 'TEACHER_ADMIN', 'FACULTY', 'ADMISSIONS_OFFICER', 'STUDENT'];
    if (!ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ error: `Invalid role: ${role}` });
    }
    if (!email || !firstName || !lastName) {
      return res.status(400).json({ error: 'firstName, lastName and email are required' });
    }
    // Soft phone format check — allow common formats (+CC NNNNNNNNNN,
    // NNNNNNNNNN, hyphen/space separated). Pre-fix any string was accepted.
    if (phone !== undefined && phone !== null && phone !== '') {
      const cleaned = String(phone).replace(/[\s\-()]/g, '');
      if (!/^\+?\d{6,15}$/.test(cleaned)) {
        return res.status(400).json({ error: 'phone must be 6-15 digits, optionally prefixed with country code' });
      }
    }

    // Allowlist profile fields rather than spreading req.body into Prisma.
    const STUDENT_FIELDS = ['dob', 'gender', 'nationality', 'studentType', 'studyMode', 'batchId', 'programmeId', 'permanentAddress', 'presentAddress'];
    // Note: schema field is `qualifications` (plural); no `specialization` column.
    const FACULTY_FIELDS = ['designation', 'qualifications'];
    const studentData = {};
    const facultyData = {};
    for (const k of STUDENT_FIELDS) if (req.body[k] !== undefined) studentData[k] = req.body[k];
    for (const k of FACULTY_FIELDS) if (req.body[k] !== undefined) facultyData[k] = req.body[k];

    const tempPassword = require('crypto').randomBytes(8).toString('base64url').slice(0, 8) + 'A1!';
    const tempHash = await bcrypt.hash(tempPassword, 12);

    // Use the retry-aware creator so concurrent admin POSTs don't collide on userIdDisplay.
    const user = await prisma.$transaction(async (tx) => {
      const base = await createUserWithGeneratedId(role, {
        email: String(email).trim().toLowerCase(),
        phone,
        status: 'ACTIVE',
      }, tx);
      await tx.userAuth.create({
        data: {
          userId: base.id,
          passwordHash: await bcrypt.hash('placeholder', 12),
          tempPasswordHash: tempHash,
          tempPasswordExpires: new Date(Date.now() + 48 * 60 * 60 * 1000),
        },
      });
      if (role === 'STUDENT') {
        await tx.studentProfile.create({
          data: {
            userId: base.id,
            firstName,
            lastName,
            ...studentData,
            dob: new Date(studentData.dob || '2000-01-01'),
            gender: studentData.gender || 'Not specified',
            nationality: studentData.nationality || 'Indian',
            studyMode: String(studentData.studyMode || 'OFFLINE').toUpperCase(),
            studentType: String(studentData.studentType || 'DOMESTIC').toUpperCase(),
          },
        });
      }
      // Only roles that actually teach get a FacultyProfile. FULL_ADMIN /
      // ADMISSIONS_OFFICER don't need one — they aren't referenced from Subject.facultyId.
      if (['FACULTY', 'TEACHER_ADMIN'].includes(role)) {
        await tx.facultyProfile.create({
          data: { userId: base.id, firstName, lastName, ...facultyData },
        });
      }
      return base;
    });

    // Send welcome email
    try {
      const { sendWelcomeEmail } = require('../services/email.service');
      await sendWelcomeEmail({ ...user, firstName, lastName }, tempPassword);
    } catch (_e) {}

    res.status(201).json({ user, tempPassword });
  } catch (err) { next(err); }
});

// GET /api/users/:id — admins, TA, or the user themselves
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const role = req.user.role;
    const isStaff = ['FULL_ADMIN', 'TEACHER_ADMIN'].includes(role);
    if (!isStaff && req.params.id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
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

    // Decide allowed fields by permission level. Email is the LOGIN identity —
    // a student must not be able to silently rotate their own account email
    // to another address (would let them hijack any unused address). Only
    // admins can change email; self-service updates are restricted to phone.
    const userFields = isAdmin
      ? ['email', 'phone', 'status']
      : ['phone'];
    const studentFields = ['firstName', 'lastName', 'dob', 'gender', 'nationality', 'permanentAddress', 'presentAddress', 'batchId', 'programmeId', 'studentType', 'studyMode'];
    const facultyFields = ['firstName', 'lastName', 'designation', 'qualifications'];

    // Build User update payload
    const userData = {};
    for (const k of userFields) if (req.body[k] !== undefined) userData[k] = req.body[k];
    // Normalize email if admin is changing it.
    if (userData.email !== undefined) userData.email = String(userData.email).trim().toLowerCase();

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
    const crypto = require('crypto');
    const tempPassword = crypto.randomBytes(8).toString('base64url').slice(0, 8) + 'A1!';
    const tempHash = await bcrypt.hash(tempPassword, 12);

    await prisma.userAuth.update({
      where: { userId: req.params.id },
      data: {
        tempPasswordHash: tempHash,
        tempPasswordExpires: new Date(Date.now() + 48 * 60 * 60 * 1000),
      }
    });

    // Invalidate any active sessions so the old password (or stolen tokens) can't be used.
    await prisma.session.deleteMany({ where: { userId: req.params.id } });

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
    if (!password || String(password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
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
    // Invalidate existing sessions so the user is forced to log in with the new password.
    await prisma.session.deleteMany({ where: { userId: req.params.id } });
    res.json({ message: 'Password set successfully. User can now log in with this password.' });
  } catch (err) { console.error('set-password:', err); next(err); }
});

module.exports = router;
