// server/src/socket.js
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
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

  // Auth middleware for socket connections
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
    if (!token) return next(new Error('Unauthorized'));

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
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
