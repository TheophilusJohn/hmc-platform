// server/src/app.js
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { logger } = require('./utils/logger');

// Routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const programmeRoutes = require('./routes/programmes');
const semesterRoutes = require('./routes/semesters');
const subjectRoutes = require('./routes/subjects');
const enrollmentRoutes = require('./routes/enrollments');
const contentRoutes = require('./routes/content');
const examRoutes = require('./routes/exams');
const submissionRoutes = require('./routes/submissions');
const questionBankRoutes = require('./routes/questionBank');
const attendanceRoutes = require('./routes/attendance');
const revaluationRoutes = require('./routes/revaluation');
const feeRoutes = require('./routes/fees');
const paymentRoutes = require('./routes/payments');
const hostelRoutes = require('./routes/hostel');
const admissionsRoutes = require('./routes/admissions');
const referenceRoutes = require('./routes/references');
const referralRoutes = require('./routes/referrals');
const messageRoutes = require('./routes/messages');
const notificationRoutes = require('./routes/notifications');
const queryRoutes = require('./routes/queries');
const reportRoutes = require('./routes/reports');
const transcriptRoutes = require('./routes/transcripts');
const settingsRoutes = require('./routes/settings');
const waiverRoutes = require('./routes/waivers');
const certificateRoutes = require('./routes/certificates');
const examSessionRoutes = require('./routes/examSession');

function createApp() {
  const app = express();
app.set('trust proxy', 1);

  // Security
  app.use(helmet({
    contentSecurityPolicy: false, // handled by nginx
    crossOriginEmbedderPolicy: false,
  }));

  // CORS
  app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Rate limiting
  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many authentication attempts, please try again later.' },
  });

  app.use('/api', generalLimiter);
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/forgot-password', authLimiter);

  // Request logging
  app.use((req, _res, next) => {
    logger.debug(`${req.method} ${req.path}`);
    next();
  });

  // Health check (no auth)
  app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

  // Public routes (no auth required)
  app.use('/api/auth', authRoutes);
  app.use('/api/references', referenceRoutes); // referee submission is public
  app.get('/api/transcripts/verify/:uuid', transcriptRoutes); // public verification

  // Protected routes
  app.use('/api/users', userRoutes);
  app.use('/api/programmes', programmeRoutes);
  app.use('/api/semesters', semesterRoutes);
  app.use('/api/subjects', subjectRoutes);
  app.use('/api/enrollments', enrollmentRoutes);
  app.use('/api/content', contentRoutes);
  app.use('/api/exams', examRoutes);
  app.use('/api/submissions', submissionRoutes);
  app.use('/api/question-bank', questionBankRoutes);
  app.use('/api/attendance', attendanceRoutes);
  app.use('/api/revaluation', revaluationRoutes);
  app.use('/api/fees', feeRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/hostel', hostelRoutes);
  app.use('/api/admissions', admissionsRoutes);
  app.use('/api/referrals', referralRoutes);
  app.use('/api/messages', messageRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/queries', queryRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/transcripts', transcriptRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/waivers', waiverRoutes);
  app.use('/api/certificates', certificateRoutes);
  app.use('/api/exam-session', examSessionRoutes);

  // 404
  app.use((_req, res) => {
    res.status(404).json({ error: 'Route not found' });
  });

  // Global error handler
  app.use((err, _req, res, _next) => {
    logger.error('Unhandled error:', err);
    const status = err.status || err.statusCode || 500;
    const message = process.env.NODE_ENV === 'production' && status === 500
      ? 'Internal server error'
      : err.message;
    res.status(status).json({ error: message, ...(err.errors && { errors: err.errors }) });
  });

  return app;
}

module.exports = { createApp };
