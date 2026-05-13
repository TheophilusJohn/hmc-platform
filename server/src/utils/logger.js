// Simple logger — replace with winston in production
const logger = {
  info: (...args) => console.log('[INFO]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  debug: (...args) => process.env.NODE_ENV === 'development' && console.log('[DEBUG]', ...args),
};

module.exports = { logger };
