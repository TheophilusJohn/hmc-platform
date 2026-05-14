// server/src/utils/userId.js
const prisma = require('../config/db');

const prefixes = {
  FULL_ADMIN: 'HMC-AD',
  TEACHER_ADMIN: 'HMC-TA',
  FACULTY: 'HMC-F',
  ADMISSIONS_OFFICER: 'HMC-AO',
  STUDENT: 'HMC-S',
};

/**
 * Generate next sequential user ID for a given role
 * Students: HMC-S-0001 (4 digits)
 * Others: HMC-XX-001 (3 digits)
 */
async function generateUserId(role) {
  const prefix = prefixes[role];
  if (!prefix) throw new Error(`Unknown role: ${role}`);

  // Look up the highest existing display ID for this role, not just the count.
  // (count breaks if any user is hard-deleted; max-id works either way.)
  // We still retry on collision because two concurrent admissions accepts can
  // both compute the same next number before either has been inserted.
  const isStudent = role === 'STUDENT';
  const pad = isStudent ? 4 : 3;
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
  return `${prefix}-${String(next).padStart(pad, '0')}`;
}

async function getNextReceiptNumber() {
  const year = new Date().getFullYear();
  const prefix = `RCP-${year}-`;

  const last = await prisma.payment.findFirst({
    where: { receiptNo: { startsWith: prefix } },
    orderBy: { receiptNo: 'desc' },
    select: { receiptNo: true },
  });

  const lastNum = last ? parseInt(last.receiptNo.split('-')[2], 10) : 0;
  const next = String(lastNum + 1).padStart(4, '0');
  return `${prefix}${next}`;
}

module.exports = { generateUserId, getNextReceiptNumber };
