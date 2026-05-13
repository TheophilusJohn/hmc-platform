const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const notif = require('../services/notification.service');
const logger = require('./logger');

function initCronJobs() {
  // 1st of every month at 00:05: auto-charge hostel fees
  cron.schedule('5 0 1 * *', async () => {
    console.log('CRON: Running monthly hostel charges');
    try {
      const feeType = await prisma.feeType.findFirst({ where: { name: 'Hostel', is_active: true } });
      if (!feeType) return;

      const hostellers = await prisma.studentProfile.findMany({
        where: { hostel_status: 'hosteller', user: { status: 'active' } },
        include: { user: true },
      });

      const now = new Date();
      let charged = 0;
      for (const h of hostellers) {
        try {
          await prisma.studentFeeLedger.create({
            data: {
              student_id: h.user_id, fee_type_id: feeType.id,
              amount: feeType.domestic_amount, currency: 'INR',
              balance: feeType.domestic_amount, status: 'unpaid',
              due_date: new Date(now.getFullYear(), now.getMonth(), 10),
            },
          });
          charged++;
        } catch (e) { /* Skip duplicates */ }
      }
      console.log(`CRON: Hostel fees charged for ${charged} students`);
    } catch (err) { console.error('CRON hostel charge failed:', err); }
  });

  // Daily at 08:00: check overdue installments
  cron.schedule('0 8 * * *', async () => {
    console.log('CRON: Checking overdue installments');
    try {
      const plans = await prisma.installmentPlan.findMany({
        where: { status: 'active' },
        include: { student: { include: { student_profile: true } } },
      });

      for (const plan of plans) {
        const schedule = plan.schedule || [];
        const today = new Date();
        let hasOverdue = false;
        for (const inst of schedule) {
          if (new Date(inst.due_date) < today && inst.status !== 'paid') {
            hasOverdue = true;
            break;
          }
        }
        if (hasOverdue && plan.status !== 'overdue') {
          await prisma.installmentPlan.update({ where: { id: plan.id }, data: { status: 'overdue' } });
        }
      }
    } catch (err) { console.error('CRON installment check failed:', err); }
  });

  // Daily at 09:00: check attendance thresholds and flag at-risk students
  cron.schedule('0 9 * * *', async () => {
    console.log('CRON: Checking attendance thresholds');
    try {
      const threshold = 75;
      const students = await prisma.user.findMany({ where: { role: 'student', status: 'active' } });

      for (const student of students) {
        const subjectAttendance = await prisma.$queryRaw`
          SELECT subject_id,
            ROUND(SUM(CASE WHEN status IN ('present','late') THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 1) as pct
          FROM attendance
          WHERE student_id = ${student.id}
          GROUP BY subject_id
          HAVING ROUND(SUM(CASE WHEN status IN ('present','late') THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 1) < ${threshold}
        `;

        if (subjectAttendance.length > 0) {
          await notif.createNotification(student.id, 'attendance_warning', 'Attendance Warning', `Your attendance is below ${threshold}% in ${subjectAttendance.length} subject(s). Please attend classes regularly.`, '/student/timetable');
        }
      }
    } catch (err) { console.error('CRON attendance check failed:', err); }
  });

  // 3 days before marks deadline: remind faculty
  cron.schedule('0 10 * * *', async () => {
    try {
      const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      const upcomingDeadlines = await prisma.semester.findMany({
        where: {
          status: 'active',
          marks_deadline: { gte: new Date(), lte: threeDaysFromNow },
        },
        include: { subjects: { include: { faculty: true } } },
      });

      for (const sem of upcomingDeadlines) {
        for (const subject of sem.subjects) {
          if (subject.faculty_id) {
            // Check if there are ungraded submissions
            const pending = await prisma.submission.count({
              where: { exam: { subject_id: subject.id }, status: 'submitted' },
            });
            if (pending > 0) {
              await notif.createNotification(subject.faculty_id, 'marks_deadline', 'Marks Deadline Approaching', `Marks deadline for ${subject.name} is approaching (${sem.marks_deadline?.toLocaleDateString()}). You have ${pending} ungraded submission(s).`, '/faculty/exams');
            }
          }
        }
      }
    } catch (err) { console.error('CRON marks deadline reminder failed:', err); }
  });

  console.log('Cron jobs initialized');
}

module.exports = { initCronJobs };
