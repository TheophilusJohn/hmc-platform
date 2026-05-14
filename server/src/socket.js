// server/src/socket.js
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const prisma = require('./config/db');
const { setIo } = require('./services/notification.service');
const { logger } = require('./utils/logger');

function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
    }
  });

  // Auth middleware for socket connections. JWT alone isn't enough: a
  // deactivated user with a still-valid token would otherwise keep receiving
  // real-time events. Re-verify User.status against the DB on connect.
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
    if (!token) return next(new Error('Unauthorized'));

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET, {
        algorithms: ['HS256'],
        issuer: 'hmc-portal',
        audience: 'hmc-portal-client',
      });
      // Verify the user still exists, is ACTIVE, and the session is still valid.
      const [user, session] = await Promise.all([
        prisma.user.findUnique({ where: { id: decoded.userId }, select: { status: true } }),
        prisma.session.findFirst({ where: { userId: decoded.userId, token }, select: { id: true } }),
      ]);
      if (!user || user.status !== 'ACTIVE') return next(new Error('Account inactive'));
      if (!session) return next(new Error('Session revoked'));
      socket.userId = decoded.userId;
      socket.role = decoded.role;
      next();
    } catch (_e) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    logger.debug(`Socket connected: ${socket.userId}`);

    // Join personal room
    socket.join(`user:${socket.userId}`);

    // Role-based rooms
    socket.join(`role:${socket.role}`);

    socket.on('disconnect', () => {
      logger.debug(`Socket disconnected: ${socket.userId}`);
    });

    // Ping/pong for connection health
    socket.on('ping', () => socket.emit('pong'));
  });

  setIo(io);
  return io;
}

module.exports = { initSocket };
