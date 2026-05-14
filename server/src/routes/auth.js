// server/src/routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');

// Reset tokens are sent to the user as a raw value but stored as a SHA-256 hash.
// A DB compromise then can't be used to mint password resets on live accounts.
function hashResetToken(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

const TOKEN_EXPIRY = process.env.JWT_EXPIRES_IN || '8h';
const SESSION_HOURS = 8;

function generateToken(user, mustChangePassword = false) {
  // iss/aud/sub claims so cross-service token use can be validated and a
  // hostile reuse of a leaked token from a different deployment is rejected.
  return jwt.sign(
    { userId: user.id, role: user.role, userIdDisplay: user.userIdDisplay, mustChangePassword },
    process.env.JWT_SECRET,
    {
      expiresIn: TOKEN_EXPIRY,
      issuer: 'hmc-portal',
      audience: 'hmc-portal-client',
      subject: user.id,
    }
  );
}

// Windowed lockout: after MAX_FAILED_ATTEMPTS bad logins, account is locked for
// LOCKOUT_MINUTES. The window auto-clears on next successful login or when the
// lockedUntil timestamp passes — admin doesn't need to manually unlock.
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Normalize: emails are case-insensitive identifiers.
    const normalizedEmail = String(email).trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { auth: true, studentProfile: true, facultyProfile: true },
    });

    if (!user || !user.auth) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check account lock (windowed)
    if (user.auth.lockedUntil && user.auth.lockedUntil > new Date()) {
      const minutes = Math.ceil((user.auth.lockedUntil - new Date()) / 60000);
      return res.status(423).json({ error: `Account temporarily locked. Try again in ${minutes} minute(s).` });
    }

    if (user.status === 'INACTIVE' || user.status === 'SUSPENDED') {
      return res.status(403).json({ error: `Account ${user.status.toLowerCase()}. Contact Admin.` });
    }

    // Check temp password first
    let isTempPassword = false;
    if (user.auth.tempPasswordHash && user.auth.tempPasswordExpires > new Date()) {
      const tempMatch = await bcrypt.compare(password, user.auth.tempPasswordHash);
      if (tempMatch) isTempPassword = true;
    }

    // Check main password
    const mainMatch = await bcrypt.compare(password, user.auth.passwordHash);

    if (!isTempPassword && !mainMatch) {
      // Atomic increment to avoid concurrent failed attempts losing increments
      // (and thereby letting an attacker exceed MAX_FAILED_ATTEMPTS by racing).
      const updated = await prisma.userAuth.update({
        where: { userId: user.id },
        data: { failedAttempts: { increment: 1 } },
        select: { failedAttempts: true },
      });
      if (updated.failedAttempts >= MAX_FAILED_ATTEMPTS) {
        await prisma.userAuth.update({
          where: { userId: user.id },
          data: { lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) },
        });
      }
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Reset failed attempts + clear any expired lock
    await prisma.userAuth.update({
      where: { userId: user.id },
      data: { failedAttempts: 0, lockedUntil: null, lastLogin: new Date() },
    });

    const token = generateToken(user, isTempPassword);

    // Create session
    await prisma.session.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000),
        device: req.headers['user-agent'] || 'unknown',
        ipAddress: req.ip,
      }
    });

    await logAudit({ actorId: user.id, action: 'LOGIN', tableName: 'users', recordId: user.id, ipAddress: req.ip });

    const profileName = user.studentProfile
      ? `${user.studentProfile.firstName} ${user.studentProfile.lastName}`
      : user.facultyProfile
        ? `${user.facultyProfile.firstName} ${user.facultyProfile.lastName}`
        : user.email;

    res.json({
      token,
      user: {
        id: user.id,
        userIdDisplay: user.userIdDisplay,
        role: user.role,
        email: user.email,
        name: profileName,
        status: user.status,
        studentType: user.studentProfile?.studentType,
        studyMode: user.studentProfile?.studyMode,
      },
      forcePasswordChange: isTempPassword,
      force_change_password: isTempPassword,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/change-password - auto-detects whether current pw is temp or main
// Reasonable complexity floor — generated temp passwords already meet this,
// so users won't be surprised by the rule on first password change.
function validatePasswordComplexity(pw) {
  if (!pw || pw.length < 8) return 'Password must be at least 8 characters';
  if (pw.length > 128) return 'Password is too long (max 128 characters)';
  const hasLower = /[a-z]/.test(pw);
  const hasUpper = /[A-Z]/.test(pw);
  const hasDigit = /\d/.test(pw);
  if (!hasLower || !hasUpper || !hasDigit) {
    return 'Password must contain at least one lowercase letter, one uppercase letter, and one digit';
  }
  return null;
}

router.post('/change-password', authenticate, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword) return res.status(400).json({ error: 'Current password is required' });
    const complexityErr = validatePasswordComplexity(newPassword);
    if (complexityErr) return res.status(400).json({ error: complexityErr });
    if (currentPassword === newPassword) {
      return res.status(400).json({ error: 'New password must differ from current' });
    }

    const auth = await prisma.userAuth.findUnique({ where: { userId: req.user.id } });
    if (!auth) return res.status(404).json({ error: 'User not found' });

    let tempMatch = false;
    if (auth.tempPasswordHash && auth.tempPasswordExpires && auth.tempPasswordExpires > new Date()) {
      tempMatch = await bcrypt.compare(currentPassword, auth.tempPasswordHash);
    }
    const mainMatch = await bcrypt.compare(currentPassword, auth.passwordHash);
    if (!tempMatch && !mainMatch) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await prisma.userAuth.update({
      where: { userId: req.user.id },
      data: {
        passwordHash: newHash,
        tempPasswordHash: null,
        tempPasswordExpires: null,
        failedAttempts: 0,
      },
    });

    // Invalidate sessions on other devices; the current session will be replaced by the new token below.
    await prisma.session.deleteMany({
      where: { userId: req.user.id, ...(req.sessionId && { NOT: { id: req.sessionId } }) },
    });

    // Issue fresh token without the mustChangePassword flag
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const newToken = generateToken(user, false);

    res.json({ message: 'Password changed successfully', token: newToken });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email, userIdDisplay } = req.body;

    // Must supply one identifier; without this guard `where: { userIdDisplay: undefined }`
    // matches the FIRST user in the DB and the route would trigger a reset against them.
    const normEmail = email ? String(email).trim().toLowerCase() : null;
    const normId = userIdDisplay ? String(userIdDisplay).trim() : null;
    if (!normEmail && !normId) {
      return res.status(400).json({ error: 'Provide an email or user ID.' });
    }

    const user = await prisma.user.findFirst({
      where: normEmail ? { email: normEmail } : { userIdDisplay: normId },
      include: { auth: true },
    });

    // Always return success to prevent user enumeration
    if (!user) {
      return res.json({ message: 'If that account exists, a reset link has been sent.' });
    }

    // Send the raw token to the user; persist only its hash.
    const rawResetToken = uuidv4();
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.userAuth.update({
      where: { userId: user.id },
      data: { resetToken: hashResetToken(rawResetToken), resetTokenExpires: expires },
    });

    // Send email via service
    try {
      const { sendPasswordResetEmail } = require('../services/email.service');
      const resetLink = `${process.env.CLIENT_URL}/reset-password/${rawResetToken}`;
      await sendPasswordResetEmail(user, resetLink);
    } catch (_e) {
      // Log but don't fail
    }

    res.json({ message: 'If that account exists, a reset link has been sent.' });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/reset-password/:token
router.post('/reset-password/:token', async (req, res, next) => {
  try {
    const { token } = req.params;
    const { newPassword } = req.body;

    const complexityErr = validatePasswordComplexity(newPassword);
    if (complexityErr) return res.status(400).json({ error: complexityErr });

    // The token in the URL is the raw value emailed to the user; the DB stores its hash.
    const auth = await prisma.userAuth.findFirst({
      where: {
        resetToken: hashResetToken(token),
        resetTokenExpires: { gt: new Date() },
      }
    });

    if (!auth) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await prisma.userAuth.update({
      where: { id: auth.id },
      data: {
        passwordHash: newHash,
        resetToken: null,
        resetTokenExpires: null,
        tempPasswordHash: null,
        tempPasswordExpires: null,
      }
    });

    // Invalidate all existing sessions for this user — any stolen token must be re-authenticated.
    await prisma.session.deleteMany({ where: { userId: auth.userId } });

    res.json({ message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', authenticate, async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (token) {
      await prisma.session.deleteMany({ where: { userId: req.user.id, token } });
    }

    await logAudit({ actorId: req.user.id, action: 'LOGOUT', tableName: 'users', recordId: req.user.id, ipAddress: req.ip });

    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        studentProfile: { include: { programme: true, batch: true } },
        facultyProfile: true,
      }
    });

    res.json({ user });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
