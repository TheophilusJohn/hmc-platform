// server/src/middleware/subjectAccess.js
const prisma = require('../config/db');

/**
 * Returns true if the user is allowed to act on the given subject.
 * FULL_ADMIN, TEACHER_ADMIN — always
 * FACULTY — only if they are the assigned facultyId
 * STUDENT — only if enrolled in the subject
 * Anyone else — false
 */
async function canAccessSubject(user, subjectId) {
  if (!user || !subjectId) return false;
  if (['FULL_ADMIN', 'TEACHER_ADMIN'].includes(user.role)) return true;

  // Single joined query — pre-fix this took 3 sequential round-trips on every
  // request to a subject-scoped endpoint. authenticate has already confirmed
  // user.status === 'ACTIVE' so we only need to verify the subject + profile link.
  if (user.role === 'FACULTY') {
    const subj = await prisma.subject.findFirst({
      where: {
        id: subjectId,
        status: 'active',
        faculty: { userId: user.id },
      },
      select: { id: true },
    });
    return !!subj;
  }
  if (user.role === 'STUDENT') {
    const enr = await prisma.studentSubjectEnrollment.findFirst({
      where: {
        subjectId,
        student: { userId: user.id },
        subject: { status: 'active' },
      },
      select: { id: true },
    });
    return !!enr;
  }
  return false;
}

/**
 * Express middleware that 403s if the caller can't act on req.params.id (a subjectId).
 */
function requireSubjectAccess(req, res, next) {
  canAccessSubject(req.user, req.params.id)
    .then(ok => ok ? next() : res.status(403).json({ error: 'You do not have access to this subject' }))
    .catch(next);
}

module.exports = { canAccessSubject, requireSubjectAccess };
