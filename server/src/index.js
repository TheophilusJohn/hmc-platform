// server/src/index.js
require('dotenv').config();
const { createApp } = require('./app');
const { createServer } = require('http');
const { initSocket } = require('./socket');
const { initCronJobs } = require('./utils/cron');
const { initMinio } = require('./config/minio');
const { logger } = require('./utils/logger');
const prisma = require('./config/db');

const PORT = process.env.PORT || 4000;

async function bootstrap() {
  try {
    // Test DB connection
    await prisma.$connect();
    logger.info('✓ Database connected');

    // Init MinIO buckets
    await initMinio();
    logger.info('✓ MinIO initialized');

    // Create Express app
    const app = createApp();
    const httpServer = createServer(app);

    // Attach Socket.io
    initSocket(httpServer);
    logger.info('✓ Socket.io attached');

    // Start cron jobs
    initCronJobs();
    logger.info('✓ Cron jobs started');

    httpServer.listen(PORT, () => {
      logger.info(`✓ HMC Server running on port ${PORT} [${process.env.NODE_ENV}]`);
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`${signal} received — shutting down gracefully`);
      httpServer.close(async () => {
        await prisma.$disconnect();
        logger.info('Database disconnected. Bye.');
        process.exit(0);
      });
      setTimeout(() => {
        logger.error('Forced shutdown after 10s');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (err) {
    logger.error('Bootstrap failed:', err);
    process.exit(1);
  }
}

bootstrap();
