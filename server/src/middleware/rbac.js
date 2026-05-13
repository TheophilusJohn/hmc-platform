// server/src/middleware/rbac.js

/**
 * Role-based access control middleware factory
 * Usage: requireRole('FULL_ADMIN', 'TEACHER_ADMIN')
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthenticated' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Access denied',
        required: roles,
        current: req.user.role,
      });
    }
    next();
  };
}

/**
 * Allow multiple roles OR the resource owner
 */
function requireRoleOrOwner(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });

    const isOwner = req.params.id === req.user.id ||
                    req.params.studentId === req.user.id;

    if (roles.includes(req.user.role) || isOwner) {
      return next();
    }
    return res.status(403).json({ error: 'Access denied' });
  };
}

/**
 * Teacher-Admin in admin view check (set by TA toggle)
 */
function requireAdminView(req, res, next) {
  if (req.user.role !== 'TEACHER_ADMIN' && req.user.role !== 'FULL_ADMIN') {
    return res.status(403).json({ error: 'Admin view required' });
  }
  // TA must have adminView flag in their session/token
  if (req.user.role === 'TEACHER_ADMIN' && !req.headers['x-admin-view']) {
    return res.status(403).json({ error: 'Switch to Admin view to access this feature' });
  }
  next();
}

/**
 * Admin-only shorthand
 */
const adminOnly = requireRole('FULL_ADMIN');

/**
 * Admin or Teacher-Admin shorthand
 */
const adminOrTA = requireRole('FULL_ADMIN', 'TEACHER_ADMIN');

/**
 * Faculty or higher
 */
const facultyOrAbove = requireRole('FULL_ADMIN', 'TEACHER_ADMIN', 'FACULTY');

/**
 * Any authenticated user
 */
function anyRole(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });
  next();
}

module.exports = {
  requireRole,
  requireRoleOrOwner,
  requireAdminView,
  adminOnly,
  adminOrTA,
  facultyOrAbove,
  anyRole,
};
