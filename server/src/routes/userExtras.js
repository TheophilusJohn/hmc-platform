const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { adminOnly } = require('../middleware/rbac');

router.get('/', authenticate, async (req, res, next) => {
  const { role } = req.query;
  if (!role) return next();
  try {
    const roles = role.split(',').map(r => r.trim()).filter(Boolean);
    const { search, status, page = 1, limit = 100 } = req.query;
    const where = { role: { in: roles } };
    if (status) where.status = status.toUpperCase();
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { userIdDisplay: { contains: search.toUpperCase() } },
      ];
    }
    const users = await prisma.user.findMany({
      where,
      include: { studentProfile: true, facultyProfile: true },
      orderBy: { createdAt: 'desc' },
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit),
    });
    const flat = users.map(u => ({
      id: u.id, userIdDisplay: u.userIdDisplay, email: u.email, role: u.role,
      status: u.status, createdAt: u.createdAt,
      firstName: u.studentProfile?.firstName || u.facultyProfile?.firstName,
      lastName: u.studentProfile?.lastName || u.facultyProfile?.lastName,
      studentProfileId: u.studentProfile?.id || null,
      facultyProfileId: u.facultyProfile?.id || null,
    }));
    const total = await prisma.user.count({ where });
    res.json({ users: flat, total });
  } catch (err) { next(err); }
});

router.post('/', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { firstName, lastName, email, role, studyMode, studentType, programmeId, phone } = req.body;
    if (!firstName || !lastName || !email || !role) {
      return res.status(400).json({ error: 'firstName, lastName, email, role required' });
    }
    const validRoles = ['FULL_ADMIN', 'TEACHER_ADMIN', 'FACULTY', 'ADMISSIONS_OFFICER', 'STUDENT'];
    if (!validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });

    const prefixMap = { FULL_ADMIN: 'HMC-AD-', TEACHER_ADMIN: 'HMC-TA-', FACULTY: 'HMC-F-', ADMISSIONS_OFFICER: 'HMC-AO-', STUDENT: 'HMC-S-' };
    const prefix = prefixMap[role];
    const padLen = role === 'STUDENT' || role === 'FACULTY' ? 4 : 3;
    const last = await prisma.user.findFirst({
      where: { userIdDisplay: { startsWith: prefix } },
      orderBy: { userIdDisplay: 'desc' },
      select: { userIdDisplay: true },
    });
    let nextNum = 1;
    if (last) {
      const m = last.userIdDisplay.match(/(\d+)$/);
      if (m) nextNum = parseInt(m[1]) + 1;
    }
    const userIdDisplay = `${prefix}${String(nextNum).padStart(padLen, '0')}`;

    const crypto = require('crypto');
    const tempPassword = crypto.randomBytes(8).toString('base64url').slice(0, 8) + 'A1!';
    const realPasswordHash = await bcrypt.hash(crypto.randomBytes(16).toString('base64url'), 12);
    const tempPasswordHash = await bcrypt.hash(tempPassword, 12);
    const tempPasswordExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const data = {
      userIdDisplay,
      email: email.toLowerCase().trim(),
      role,
      status: 'ACTIVE',
      phone: phone || null,
      auth: { create: { passwordHash: realPasswordHash, tempPasswordHash, tempPasswordExpires } },
    };

    if (role === 'STUDENT') {
      data.studentProfile = {
        create: {
          firstName, lastName,
          dob: new Date('2000-01-01'),
          gender: 'unspecified',
          nationality: studentType === 'INTERNATIONAL' ? 'Other' : 'Indian',
          studentType: (studentType || 'DOMESTIC').toUpperCase(),
          studyMode: (studyMode || 'OFFLINE').toUpperCase(),
          programmeId: programmeId || null,
        },
      };
    } else if (['FACULTY', 'TEACHER_ADMIN', 'FULL_ADMIN', 'ADMISSIONS_OFFICER'].includes(role)) {
      // FacultyProfile doubles as a generic staff profile for admins/admissions
      data.facultyProfile = { create: { firstName, lastName } };
    }

    const user = await prisma.user.create({ data });
    res.status(201).json({
      user: { id: user.id, userIdDisplay: user.userIdDisplay, email: user.email, role: user.role },
      tempPassword,
      message: `User created. Temporary password: ${tempPassword}`,
    });
  } catch (err) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'Email already in use' });
    next(err);
  }
});

module.exports = router;
