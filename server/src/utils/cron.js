// server/src/utils/cron.js
const cron = require('node-cron');
const prisma = require('../config/db');
const notif = require('../services/notification.service');

const TZ = 'Asia/Kolkata';

// Build a Date that represents `Y-M-D 00:00 in IST` — independent of the
// process TZ. We use Intl to anchor to IST and then construct a UTC Date for
// the IST midnight of the requested business day.
function istBusinessDate(year, monthIndex, day) {
  // toLocaleString with a fixed TZ produces an "ish" representation. Use Date.UTC
  // for explicit anchoring: midnight IST == 18:30 UTC of the previous calendar day.
  return new Date(Date.UTC(year, monthIndex, day, -5, -30, 0));
}

function nowInIST() {
  // Returns a "today" Y/M/D as observed in IST regardless of process TZ.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).reduce((a, p) => (a[p.type] = p.value, a), {});
  return { year: Number(parts.year), monthIndex: Number(parts.month) - 1, day: Number(parts.day) };
}

function initCronJobs() {
  // Monthly hostel charge on 1st of each month at 02:00 IST
  cron.schedule('0 2 1 * *', async () => {
    console.log('CRON: Generating monthly hostel charges');
    try {
      const feeType = await prisma.feeType.findFirst({ where: { name: 'Hostel', isActive: true } });
      if (!feeType) return;

      const hostellers = await prisma.studentProfile.findMany({
        where: { hostelStatus: 'HOSTELLER', user: { status: 'ACTIVE' } },
      });

      const today = nowInIST();
      const dueDate = istBusinessDate(today.year, today.monthIndex, 10);

      // Idempotency window: any ledger row for this fee + student created on/after
      // the 1st-of-month IST midnight counts as "already charged this month".
      const monthStart = istBusinessDate(today.year, today.monthIndex, 1);

      let charged = 0;
      let skipped = 0;
      for (const h of hostellers) {
        try {
          // Currency and amount follow the student type — international hostellers
          // are billed in USD off internationalAmount unless they opted into INR.
          const isIntl = h.studentType === 'INTERNATIONAL' && !h.payInInrOverride;
          const amount = isIntl ? feeType.internationalAmount : feeType.domesticAmount;
          const currency = isIntl ? 'USD' : 'INR';

          // Atomically check + insert: if a row for this student+feeType already
          // exists with createdAt >= monthStart, skip. This is the per-row
          // idempotency guard until a DB-level @@unique([studentId,feeTypeId,billingMonth])
          // is added.
          await prisma.$transaction(async (tx) => {
            const existing = await tx.studentFeeLedger.findFirst({
              where: {
                studentId: h.id,
                feeTypeId: feeType.id,
                createdAt: { gte: monthStart },
              },
              select: { id: true },
            });
            if (existing) { skipped++; return; }
            await tx.studentFeeLedger.create({
              data: {
                studentId: h.id,
                feeTypeId: feeType.id,
                amount,
                currency,
                balance: amount,
                status: 'UNPAID',
                dueDate,
              },
            });
            charged++;
          });
        } catch (e) { console.error('CRON hostel per-student failed:', e); }
      }
      console.log(`CRON: Hostel fees charged for ${charged} students (skipped ${skipped} already-charged)`);
    } catch (err) { console.error('CRON hostel charge failed:', err); }
  }, { timezone: TZ });

  // Daily at 08:00 IST: check overdue installments. Anchors "overdue" to the
  // end-of-day-IST of the installment's dueDate so a single global UTC `today`
  // doesn't roll a row over 5h30m early. Also transitions OVERDUE → ACTIVE
  // when no overdue rows remain (was previously a one-way flip).
  cron.schedule('0 8 * * *', async () => {
    console.log('CRON: Checking overdue installments');
    try {
      const plans = await prisma.installmentPlan.findMany({
        where: { status: { in: ['ACTIVE', 'OVERDUE'] } },
        include: { student: { include: { user: true } } },
      });

      // "Today" in IST as a UTC instant representing the IST end-of-day boundary.
      const today = nowInIST();
      const endOfTodayIST = istBusinessDate(today.year, today.monthIndex, today.day + 1); // midnight of next IST day

      for (const plan of plans) {
        const schedule = plan.schedule || [];
        let hasOverdue = false;
        for (const inst of schedule) {
          if (!inst.dueDate) continue;
          // Compare against IST end-of-day: an installment due 2025-05-14 IST is
          // not overdue until 2025-05-15 00:00 IST.
          const dueIST = new Date(inst.dueDate);
          if (dueIST < endOfTodayIST && String(inst.status).toLowerCase() !== 'paid') {
            // Only count as overdue once IST end-of-day has actually passed.
            if (dueIST.getTime() + (24 * 60 * 60 * 1000) <= endOfTodayIST.getTime()) {
              hasOverdue = true;
              break;
            }
          }
        }
        const desired = hasOverdue ? 'OVERDUE' : 'ACTIVE';
        if (plan.status !== desired) {
          await prisma.installmentPlan.update({ where: { id: plan.id }, data: { status: desired } });
        }
      }
    } catch (err) { console.error('CRON installment check failed:', err); }
  }, { timezone: TZ });

  // Daily at 09:00 IST: check attendance thresholds and flag at-risk students.
  // Single grouped query instead of N per-student round-trips.
  cron.schedule('0 9 * * *', async () => {
    console.log('CRON: Checking attendance thresholds');
    try {
      const threshold = 75;
      // ONE query: pct per (studentId, subjectId). Filter to below-threshold rows.
      const rows = await prisma.$queryRaw`
        SELECT "studentId",
          COUNT(*) FILTER (WHERE 1=1) AS total,
          COUNT(*) FILTER (WHERE status IN ('PRESENT','LATE')) AS present,
          "subjectId"
        FROM "Attendance"
        GROUP BY "studentId", "subjectId"
        HAVING COUNT(*) > 0
          AND (COUNT(*) FILTER (WHERE status IN ('PRESENT','LATE')))::float / COUNT(*) * 100 < ${threshold}
      `;

      // Build studentProfileId → count of below-threshold subjects.
      const bySp = new Map();
      for (const r of rows) {
        bySp.set(r.studentId, (bySp.get(r.studentId) || 0) + 1);
      }

      if (bySp.size === 0) return;
      // Resolve studentProfile.id → user.id in one query.
      const profiles = await prisma.studentProfile.findMany({
        where: { id: { in: [...bySp.keys()] } },
        select: { id: true, userId: true },
      });
      for (const p of profiles) {
        const count = bySp.get(p.id);
        if (!count) continue;
        try {
          await notif.createNotification(
            p.userId,
            'attendance_warning',
            'Attendance Warning',
            `Your attendance is below ${threshold}% in ${count} subject(s). Please attend classes regularly.`,
            '/student/timetable'
          );
        } catch (_e) {}
      }
    } catch (err) { console.error('CRON attendance check failed:', err); }
  }, { timezone: TZ });

  // Daily at 10:00 IST: send marks deadline reminders. Anchor the 3-day window
  // to IST calendar days (not a rolling 72h) so reminders fire at predictable
  // times relative to local end-of-day.
  cron.schedule('0 10 * * *', async () => {
    console.log('CRON: Sending marks deadline reminders');
    try {
      const today = nowInIST();
      const startIST = istBusinessDate(today.year, today.monthIndex, today.day);
      const threeDaysOutIST = istBusinessDate(today.year, today.monthIndex, today.day + 3);
      const upcomingDeadlines = await prisma.semester.findMany({
        where: {
          status: 'ACTIVE',
          marksDeadline: { gte: startIST, lte: threeDaysOutIST },
        },
        include: { subjects: { include: { faculty: { include: { user: true } } } } },
      });

      for (const sem of upcomingDeadlines) {
        for (const subject of sem.subjects) {
          if (subject.facultyId && subject.faculty?.user) {
            const pending = await prisma.submission.count({
              where: { exam: { subjectId: subject.id }, status: 'SUBMITTED' },
            });
            if (pending > 0) {
              await notif.createNotification(
                subject.faculty.user.id,
                'marks_deadline',
                'Marks Deadline Approaching',
                `Marks deadline for ${subject.name} is approaching (${sem.marksDeadline?.toLocaleDateString()}). You have ${pending} ungraded submission(s).`,
                '/faculty/exams'
              );
            }
          }
        }
      }
    } catch (err) { console.error('CRON marks deadline reminder failed:', err); }
  }, { timezone: TZ });

  console.log(`Cron jobs initialized (timezone: ${TZ})`);
}

module.exports = { initCronJobs };
