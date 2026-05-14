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
      let charged = 0;
      for (const h of hostellers) {
        try {
          await prisma.studentFeeLedger.create({
            data: {
              studentId: h.id,
              feeTypeId: feeType.id,
              amount: feeType.domesticAmount,
              currency: 'INR',
              balance: feeType.domesticAmount,
              status: 'UNPAID',
              dueDate,
            },
          });
          charged++;
        } catch (e) { /* skip duplicates */ }
      }
      console.log(`CRON: Hostel fees charged for ${charged} students`);
    } catch (err) { console.error('CRON hostel charge failed:', err); }
  }, { timezone: TZ });

  // Daily at 08:00 IST: check overdue installments
  cron.schedule('0 8 * * *', async () => {
    console.log('CRON: Checking overdue installments');
    try {
      const plans = await prisma.installmentPlan.findMany({
        where: { status: 'ACTIVE' },
        include: { student: { include: { user: true } } },
      });

      for (const plan of plans) {
        const schedule = plan.schedule || [];
        const today = new Date();
        let hasOverdue = false;
        for (const inst of schedule) {
          if (new Date(inst.dueDate) < today && inst.status !== 'paid') {
            hasOverdue = true;
            break;
          }
        }
        if (hasOverdue && plan.status !== 'OVERDUE') {
          await prisma.installmentPlan.update({ where: { id: plan.id }, data: { status: 'OVERDUE' } });
        }
      }
    } catch (err) { console.error('CRON installment check failed:', err); }
  }, { timezone: TZ });

  // Daily at 09:00 IST: check attendance thresholds and flag at-risk students
  cron.schedule('0 9 * * *', async () => {
    console.log('CRON: Checking attendance thresholds');
    try {
      const threshold = 75;
      const students = await prisma.user.findMany({
        where: { role: 'STUDENT', status: 'ACTIVE' },
        include: { studentProfile: true },
      });

      for (const student of students) {
        if (!student.studentProfile) continue;
        const subjectAttendance = await prisma.$queryRaw`
          SELECT "subjectId",
            ROUND(SUM(CASE WHEN status IN ('PRESENT','LATE') THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 1) as pct
          FROM "Attendance"
          WHERE "studentId" = ${student.studentProfile.id}
          GROUP BY "subjectId"
          HAVING ROUND(SUM(CASE WHEN status IN ('PRESENT','LATE') THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 1) < ${threshold}
        `;

        if (subjectAttendance.length > 0) {
          await notif.createNotification(
            student.id,
            'attendance_warning',
            'Attendance Warning',
            `Your attendance is below ${threshold}% in ${subjectAttendance.length} subject(s). Please attend classes regularly.`,
            '/student/timetable'
          );
        }
      }
    } catch (err) { console.error('CRON attendance check failed:', err); }
  }, { timezone: TZ });

  // Daily at 10:00 IST: send marks deadline reminders
  cron.schedule('0 10 * * *', async () => {
    console.log('CRON: Sending marks deadline reminders');
    try {
      const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      const upcomingDeadlines = await prisma.semester.findMany({
        where: {
          status: 'ACTIVE',
          marksDeadline: { gte: new Date(), lte: threeDaysFromNow },
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
