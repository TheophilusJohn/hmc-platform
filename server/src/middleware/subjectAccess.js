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
    // Allow active OR archived subjects — pre-fix, an archived past-semester
    // subject 403'd the originally-assigned faculty, blocking legitimate
    // revaluation/grade-correction workflows. Draft subjects still 403.
    const subj = await prisma.subject.findFirst({
      where: {
        id: subjectId,
        status: { in: ['active', 'archived'] },
        faculty: { userId: user.id },
      },
      select: { id: true },
    });
    return !!subj;
  }
  if (user.role === 'STUDENT') {
    // Refuse access if the semester is DRAFT or ARCHIVED — pre-fix an enrollment
    // for a future/draft semester granted access immediately, letting students
    // peek at unreleased content.
    const enr = await prisma.studentSubjectEnrollment.findFirst({
      where: {
        subjectId,
        student: { userId: user.id },
        subject: { status: 'active' },
        semester: { status: { in: ['ACTIVE', 'EXAM', 'ARCHIVED'] } },
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
