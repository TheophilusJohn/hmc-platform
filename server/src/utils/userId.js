// server/src/utils/userId.js
const prisma = require('../config/db');

const prefixes = {
  FULL_ADMIN: 'HMC-AD',
  TEACHER_ADMIN: 'HMC-TA',
  FACULTY: 'HMC-F',
  ADMISSIONS_OFFICER: 'HMC-AO',
  STUDENT: 'HMC-S',
};

// Per CLAUDE.md: HMC-S-NNNN, HMC-F-NNNN (4 digits); HMC-AD-NNN, HMC-TA-NNN,
// HMC-AO-NNN (3 digits).
function padForRole(role) {
  return (role === 'STUDENT' || role === 'FACULTY') ? 4 : 3;
}

/**
 * Compute next sequential user ID for a given role, optionally offset.
 * `offset` is used by retry loops in `createUserWithGeneratedId` after P2002
 * collisions — caller passes 0, 1, 2, ...
 */
async function generateUserId(role, offset = 0) {
  const prefix = prefixes[role];
  if (!prefix) throw new Error(`Unknown role: ${role}`);

  const pad = padForRole(role);
  const last = await prisma.user.findFirst({
    where: { role, userIdDisplay: { startsWith: `${prefix}-` } },
    orderBy: { userIdDisplay: 'desc' },
    select: { userIdDisplay: true },
  });
  let next = 1;
  if (last?.userIdDisplay) {
    const seq = parseInt(last.userIdDisplay.split('-').pop(), 10);
    if (!isNaN(seq)) next = seq + 1;
  }
  return `${prefix}-${String(next + offset).padStart(pad, '0')}`;
}

/**
 * Create a User row with a freshly generated `userIdDisplay`, retrying on P2002.
 * Use this instead of calling generateUserId() then user.create() separately —
 * the two-step pattern races under concurrent inserts.
 *
 *   const user = await createUserWithGeneratedId(role, { email, role, ... }, tx);
 *
 * Pass an optional `tx` (the Prisma transaction client) to participate in an
 * outer $transaction.
 */
async function createUserWithGeneratedId(role, baseData, client = prisma, maxAttempts = 8) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const userIdDisplay = await generateUserId(role, attempt);
    try {
      return await client.user.create({ data: { ...baseData, role, userIdDisplay } });
    } catch (e) {
      // P2002 = unique constraint violation. If it's userIdDisplay, try next number.
      // Anything else (email collision, etc.) — surface to caller.
      if (e?.code !== 'P2002') throw e;
      const target = Array.isArray(e?.meta?.target) ? e.meta.target.join(',') : String(e?.meta?.target || '');
      if (!target.includes('userIdDisplay')) throw e;
    }
  }
  throw new Error(`Failed to allocate unique userIdDisplay for role ${role} after ${maxAttempts} attempts`);
}

module.exports = { generateUserId, createUserWithGeneratedId, padForRole };
