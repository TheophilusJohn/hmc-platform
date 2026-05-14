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
 * Allow multiple roles OR the resource owner.
 * IMPORTANT: only compares params named `userId` to req.user.id.
 * Do NOT use `:id` for ownership — `:id` is ambiguous (StudentProfile.id, FacultyProfile.id, etc.)
 * and silently fails. For ownership of profile-keyed resources, do the check inside the handler.
 */
function requireRoleOrOwner(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });

    const isOwner = req.params.userId && req.params.userId === req.user.id;

    if (roles.includes(req.user.role) || isOwner) {
      return next();
    }
    return res.status(403).json({ error: 'Access denied' });
  };
}

/**
 * Teacher-Admin in admin view check.
 * Admin view is a UI concept, not a security boundary; the only thing that
 * matters is the role. Do NOT trust a client-supplied header.
 */
function requireAdminView(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });
  if (req.user.role !== 'TEACHER_ADMIN' && req.user.role !== 'FULL_ADMIN') {
    return res.status(403).json({ error: 'Admin view required' });
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
