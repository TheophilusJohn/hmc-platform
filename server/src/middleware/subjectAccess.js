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

  const subj = await prisma.subject.findUnique({
    where: { id: subjectId },
    select: { facultyId: true, status: true },
  });
  if (!subj || String(subj.status || 'active').toLowerCase() !== 'active') return false;

  if (user.role === 'FACULTY') {
    const fp = await prisma.facultyProfile.findUnique({
      where: { userId: user.id },
      select: { id: true, user: { select: { status: true } } },
    });
    if (!fp || fp.user?.status !== 'ACTIVE') return false;
    return fp.id === subj.facultyId;
  }
  if (user.role === 'STUDENT') {
    const sp = await prisma.studentProfile.findUnique({
      where: { userId: user.id },
      select: { id: true, user: { select: { status: true } } },
    });
    if (!sp || sp.user?.status !== 'ACTIVE') return false;
    const enr = await prisma.studentSubjectEnrollment.findFirst({
      where: { studentId: sp.id, subjectId },
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
