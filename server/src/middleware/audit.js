// server/src/middleware/audit.js
const prisma = require('../config/db');

// Maps HTTP method + route pattern to a human-readable action
function deriveAction(method, path) {
  const m = method.toUpperCase();
  if (m === 'POST') return 'CREATE';
  if (m === 'PUT' || m === 'PATCH') return 'UPDATE';
  if (m === 'DELETE') return 'DELETE';
  return m;
}

// Extract table name from route path
function deriveTable(path) {
  const segments = path.replace('/api/', '').split('/');
  return segments[0]?.replace(/-/g, '_') || 'unknown';
}

// Fields we never want to persist in the audit log even when the route returns them.
const REDACTED_KEYS = new Set([
  'tempPassword', 'password', 'newPassword', 'currentPassword',
  'passwordHash', 'tempPasswordHash',
  'token', 'resetToken', 'jwt',
]);

function redact(value, depth = 0) {
  if (value == null || depth > 4) return value;
  if (Array.isArray(value)) return value.map(v => redact(v, depth + 1));
  if (typeof value !== 'object') return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (REDACTED_KEYS.has(k)) out[k] = '[REDACTED]';
    else out[k] = redact(v, depth + 1);
  }
  return out;
}

/**
 * Auto-audit middleware — wraps res.json to capture response and log
 * Only logs mutating operations (POST/PUT/PATCH/DELETE)
 */
function auditLog(req, res, next) {
  const method = req.method.toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return next();
  }

  // Skip auth routes from audit (login flood would pollute log)
  if (req.path.startsWith('/api/auth/login') || req.path.startsWith('/api/auth/logout')) {
    return next();
  }

  const originalJson = res.json.bind(res);

  res.json = function (data) {
    // Log asynchronously — don't delay response
    if (res.statusCode < 400 && req.user) {
      setImmediate(async () => {
        try {
          await prisma.auditLog.create({
            data: {
              actorId: req.user?.id || null,
              action: deriveAction(method, req.path),
              tableName: deriveTable(req.path),
              recordId: req.params?.id || data?.id || data?.data?.id || null,
              oldValue: req.oldValue || null, // set by route handler if needed
              newValue: data?.id ? redact(data) : null,
              ipAddress: req.ip || req.connection?.remoteAddress,
              userAgent: req.headers['user-agent'],
            }
          });
        } catch (_e) {
          // Audit log failure must never affect normal operation
        }
      });
    }
    return originalJson(data);
  };

  next();
}

/**
 * Manual audit helper for specific sensitive actions
 */
async function logAudit({ actorId, action, tableName, recordId, oldValue, newValue, ipAddress }) {
  try {
    await prisma.auditLog.create({
      data: { actorId, action, tableName, recordId, oldValue, newValue, ipAddress },
    });
  } catch (_e) {
    // Silent fail — audit is best-effort
  }
}

module.exports = { auditLog, logAudit };
