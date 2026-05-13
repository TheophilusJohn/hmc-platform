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

  // Count existing users of this role to get next number
  const count = await prisma.user.count({ where: { role } });
  const next = count + 1;
  const isStudent = role === 'STUDENT';
  const padded = String(next).padStart(isStudent ? 4 : 3, '0');
  return `${prefix}-${padded}`;
}

module.exports = { generateUserId };


// server/src/utils/receiptNumber.js
// Usage: const { getNextReceiptNumber } = require('./receiptNumber');

async function getNextReceiptNumber() {
  const year = new Date().getFullYear();
  const prefix = `RCP-${year}-`;

  // Get last receipt for this year
  const last = await prisma.payment.findFirst({
    where: { receiptNo: { startsWith: prefix } },
    orderBy: { receiptNo: 'desc' },
    select: { receiptNo: true },
  });

  const lastNum = last ? parseInt(last.receiptNo.split('-')[2]) : 0;
  const next = String(lastNum + 1).padStart(4, '0');
  return `${prefix}${next}`;
}

module.exports = { getNextReceiptNumber };
