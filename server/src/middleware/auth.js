// server/src/middleware/auth.js
const jwt = require('jsonwebtoken');
const prisma = require('../config/db');

async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired', code: 'token_expired' });
      }
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Check session exists and is valid
    const session = await prisma.session.findFirst({
      where: { userId: decoded.userId, token: token },
      select: { id: true, expiresAt: true, isExamSession: true },
    });

    if (!session) {
      return res.status(401).json({ error: 'Session not found', code: 'session_invalid' });
    }

    // Only enforce expiry for non-exam sessions
    if (!session.isExamSession && session.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Session expired', code: 'token_expired' });
    }

    // Get fresh user data
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, userIdDisplay: true, role: true, status: true, email: true },
    });

    if (!user || user.status !== 'ACTIVE') {
      return res.status(401).json({ error: 'Account inactive or not found' });
    }

    req.user = user;
    req.sessionId = session.id;
    req.isExamSession = session.isExamSession;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { authenticate };
