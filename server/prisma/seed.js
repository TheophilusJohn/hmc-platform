// prisma/seed.js — HMC Platform Demo Data
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding HMC Platform...');

  // ─── PROGRAMMES ─────────────────────────────────────────────────────────────
  const programmes = await Promise.all([
    prisma.programme.upsert({
      where: { code: 'CTH' },
      update: {},
      create: { name: 'Certificate in Theology (Hindi)', code: 'CTH', durationYears: 1, medium: 'HINDI', availableOffline: true, availableOnline: true },
    }),
    prisma.programme.upsert({
      where: { code: 'DIPTH' },
      update: {},
      create: { name: 'Diploma in Theology', code: 'DIPTH', durationYears: 2, medium: 'ENGLISH', availableOffline: true, availableOnline: true },
    }),
    prisma.programme.upsert({
      where: { code: 'BTH' },
      update: {},
      create: { name: 'Bachelor of Theology', code: 'BTH', durationYears: 3, medium: 'ENGLISH', availableOffline: true, availableOnline: true },
    }),
    prisma.programme.upsert({
      where: { code: 'MDIVU' },
      update: {},
      create: { name: 'Master of Divinity (Upgrader)', code: 'MDIVU', durationYears: 2, medium: 'ENGLISH', availableOffline: true, availableOnline: false },
    }),
    prisma.programme.upsert({
      where: { code: 'MDIV' },
      update: {},
      create: { name: 'Master of Divinity', code: 'MDIV', durationYears: 3, medium: 'ENGLISH', availableOffline: true, availableOnline: false },
    }),
  ]);
  console.log('✓ Programmes created');

  const [cth, dipth, bth, mdivu, mdiv] = programmes;

  // ─── BATCHES ────────────────────────────────────────────────────────────────
  const bthBatch2025 = await prisma.batch.upsert({
    where: { id: 'batch-bth-2025' },
    update: {},
    create: { id: 'batch-bth-2025', programmeId: bth.id, name: 'Batch 2025-28', startYear: 2025, endYear: 2028, currentYear: 1, status: 'ACTIVE', maxIntake: 30 },
  });
  const bthBatch2024 = await prisma.batch.upsert({
    where: { id: 'batch-bth-2024' },
    update: {},
    create: { id: 'batch-bth-2024', programmeId: bth.id, name: 'Batch 2024-27', startYear: 2024, endYear: 2027, currentYear: 2, status: 'ACTIVE', maxIntake: 30 },
  });
  const dipthBatch2025 = await prisma.batch.upsert({
    where: { id: 'batch-dipth-2025' },
    update: {},
    create: { id: 'batch-dipth-2025', programmeId: dipth.id, name: 'Batch 2025-27', startYear: 2025, endYear: 2027, currentYear: 1, status: 'ACTIVE', maxIntake: 20 },
  });
  const mdivBatch2024 = await prisma.batch.upsert({
    where: { id: 'batch-mdiv-2024' },
    update: {},
    create: { id: 'batch-mdiv-2024', programmeId: mdiv.id, name: 'Batch 2024-27', startYear: 2024, endYear: 2027, currentYear: 2, status: 'ACTIVE', maxIntake: 15 },
  });
  console.log('✓ Batches created');

  // ─── SEMESTER ───────────────────────────────────────────────────────────────
  const activeSemester = await prisma.semester.upsert({
    where: { id: 'sem-odd-2025-bth2025' },
    update: {},
    create: {
      id: 'sem-odd-2025-bth2025',
      name: 'Odd Semester 2025',
      type: 'ODD',
      academicYear: '2025-26',
      startDate: new Date('2025-06-01'),
      endDate: new Date('2025-11-30'),
      status: 'ACTIVE',
      marksDeadline: new Date('2025-11-20'),
      batchId: bthBatch2025.id,
    },
  });
  console.log('✓ Active semester created');

  // ─── STAFF USERS ────────────────────────────────────────────────────────────
  const adminHash = await bcrypt.hash('Admin@123', 12);
  const defaultHash = await bcrypt.hash('Welcome@123', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@hmc.edu' },
    update: {},
    create: {
      userIdDisplay: 'HMC-AD-001',
      role: 'FULL_ADMIN',
      email: 'admin@hmc.edu',
      phone: '+919876543210',
      status: 'ACTIVE',
      auth: { create: { passwordHash: adminHash, lastLogin: new Date() } },
    },
  });

  const teacherAdmin = await prisma.user.upsert({
    where: { email: 'ta@hmc.edu' },
    update: {},
    create: {
      userIdDisplay: 'HMC-TA-001',
      role: 'TEACHER_ADMIN',
      email: 'ta@hmc.edu',
      phone: '+919876543211',
      status: 'ACTIVE',
      auth: { create: { passwordHash: defaultHash } },
      facultyProfile: {
        create: { firstName: 'Samuel', lastName: 'Thomas', designation: 'Associate Professor', joiningDate: new Date('2020-06-01') }
      }
    },
  });

  const admissionsOfficer = await prisma.user.upsert({
    where: { email: 'admissions@hmc.edu' },
    update: {},
    create: {
      userIdDisplay: 'HMC-AO-001',
      role: 'ADMISSIONS_OFFICER',
      email: 'admissions@hmc.edu',
      phone: '+919876543212',
      status: 'ACTIVE',
      auth: { create: { passwordHash: defaultHash } },
    },
  });
  console.log('✓ Staff users created');

  // ─── FACULTY ────────────────────────────────────────────────────────────────
  const facultyUsers = [];
  const facultyData = [
    { email: 'dr.john@hmc.edu', id: 'HMC-F-0001', first: 'John', last: 'Matthew', desig: 'Professor of Biblical Studies' },
    { email: 'dr.priya@hmc.edu', id: 'HMC-F-0002', first: 'Priya', last: 'Abraham', desig: 'Assistant Professor of Theology' },
    { email: 'rev.george@hmc.edu', id: 'HMC-F-0003', first: 'George', last: 'Philip', desig: 'Lecturer in Church History' },
    { email: 'dr.sarah@hmc.edu', id: 'HMC-F-0004', first: 'Sarah', last: 'Williams', desig: 'Professor of Missiology' },
  ];

  for (const f of facultyData) {
    const user = await prisma.user.upsert({
      where: { email: f.email },
      update: {},
      create: {
        userIdDisplay: f.id,
        role: 'FACULTY',
        email: f.email,
        status: 'ACTIVE',
        auth: { create: { passwordHash: defaultHash } },
        facultyProfile: { create: { firstName: f.first, lastName: f.last, designation: f.desig, joiningDate: new Date('2022-06-01') } }
      },
    });
    facultyUsers.push(user);
  }
  console.log('✓ Faculty created');

  // ─── STUDENTS ───────────────────────────────────────────────────────────────
  const studentData = [
    { email: 'james.mensah@student.hmc.edu', id: 'HMC-S-0001', first: 'James', last: 'Mensah', type: 'INTERNATIONAL', region: 'West Africa', mode: 'OFFLINE', hostel: 'HOSTELLER', nationality: 'Ghanaian' },
    { email: 'priya.nair@student.hmc.edu', id: 'HMC-S-0002', first: 'Priya', last: 'Nair', type: 'DOMESTIC', mode: 'OFFLINE', hostel: 'DAY_SCHOLAR', nationality: 'Indian' },
    { email: 'rajan.kumar@student.hmc.edu', id: 'HMC-S-0003', first: 'Rajan', last: 'Kumar', type: 'DOMESTIC', mode: 'ONLINE', hostel: 'NA', nationality: 'Indian' },
    { email: 'grace.osei@student.hmc.edu', id: 'HMC-S-0004', first: 'Grace', last: 'Osei', type: 'INTERNATIONAL', region: 'East Africa', mode: 'ONLINE', hostel: 'NA', nationality: 'Kenyan', timezone: 'Africa/Nairobi' },
    { email: 'amit.sharma@student.hmc.edu', id: 'HMC-S-0005', first: 'Amit', last: 'Sharma', type: 'DOMESTIC', mode: 'OFFLINE', hostel: 'HOSTELLER', nationality: 'Indian' },
    { email: 'mary.joseph@student.hmc.edu', id: 'HMC-S-0006', first: 'Mary', last: 'Joseph', type: 'DOMESTIC', mode: 'OFFLINE', hostel: 'DAY_SCHOLAR', nationality: 'Indian' },
    { email: 'daniel.acheampong@student.hmc.edu', id: 'HMC-S-0007', first: 'Daniel', last: 'Acheampong', type: 'INTERNATIONAL', region: 'West Africa', mode: 'OFFLINE', hostel: 'HOSTELLER', nationality: 'Ghanaian' },
    { email: 'sunita.patel@student.hmc.edu', id: 'HMC-S-0008', first: 'Sunita', last: 'Patel', type: 'DOMESTIC', mode: 'ONLINE', hostel: 'NA', nationality: 'Indian' },
    { email: 'paul.kimani@student.hmc.edu', id: 'HMC-S-0009', first: 'Paul', last: 'Kimani', type: 'INTERNATIONAL', region: 'East Africa', mode: 'ONLINE', hostel: 'NA', nationality: 'Kenyan', timezone: 'Africa/Nairobi' },
    { email: 'ruth.singh@student.hmc.edu', id: 'HMC-S-0010', first: 'Ruth', last: 'Singh', type: 'DOMESTIC', mode: 'OFFLINE', hostel: 'HOSTELLER', nationality: 'Indian' },
  ];

  const createdStudents = [];
  for (const s of studentData) {
    const user = await prisma.user.upsert({
      where: { email: s.email },
      update: {},
      create: {
        userIdDisplay: s.id,
        role: 'STUDENT',
        email: s.email,
        status: 'ACTIVE',
        auth: { create: { passwordHash: defaultHash } },
        studentProfile: {
          create: {
            firstName: s.first,
            lastName: s.last,
            dob: new Date('1998-03-15'),
            gender: 'Male',
            nationality: s.nationality,
            studentType: s.type,
            region: s.region || 'India',
            studyMode: s.mode,
            hostelStatus: s.hostel || 'NA',
            timezone: s.timezone || 'Asia/Kolkata',
            batchId: bthBatch2025.id,
            programmeId: bth.id,
            referralCode: `HMC-${s.first.substring(0,2).toUpperCase()}${s.id.split('-')[2]}`,
          }
        }
      },
    });
    createdStudents.push(user);
  }
  console.log('✓ Students created');

  // ─── SUBJECTS ───────────────────────────────────────────────────────────────
  const faculty1 = await prisma.facultyProfile.findFirst({ where: { user: { email: 'dr.john@hmc.edu' } } });
  const faculty2 = await prisma.facultyProfile.findFirst({ where: { user: { email: 'dr.priya@hmc.edu' } } });
  const faculty3 = await prisma.facultyProfile.findFirst({ where: { user: { email: 'rev.george@hmc.edu' } } });

  const subjectsToCreate = [
    { code: 'BTH101', name: 'Old Testament Survey', credits: 4, ese: 70, ia: 30, pass: 40, facultyId: faculty1?.id, mode: 'OFFLINE' },
    { code: 'BTH102', name: 'New Testament Survey', credits: 4, ese: 70, ia: 30, pass: 40, facultyId: faculty1?.id, mode: 'OFFLINE' },
    { code: 'BTH103', name: 'Biblical Hermeneutics', credits: 3, ese: 70, ia: 30, pass: 40, facultyId: faculty2?.id, mode: 'OFFLINE' },
    { code: 'BTH104', name: 'Church History I', credits: 3, ese: 70, ia: 30, pass: 40, facultyId: faculty3?.id, mode: 'OFFLINE' },
    { code: 'BTH105', name: 'Christian Theology I', credits: 4, ese: 70, ia: 30, pass: 40, facultyId: faculty2?.id, mode: 'OFFLINE' },
  ];

  const createdSubjects = [];
  for (const sub of subjectsToCreate) {
    const subject = await prisma.subject.create({
      data: {
        programmeId: bth.id,
        semesterId: activeSemester.id,
        batchId: bthBatch2025.id,
        facultyId: sub.facultyId,
        code: sub.code,
        name: sub.name,
        creditHours: sub.credits,
        type: 'CORE',
        eseMarks: sub.ese,
        iaMarks: sub.ia,
        totalMarks: 100,
        passMark: sub.pass,
        examMode: sub.mode === 'ONLINE' ? 'ONLINE' : 'OFFLINE',
        status: 'active',
      }
    });
    createdSubjects.push(subject);
  }
  console.log('✓ Subjects created');

  // ─── FEE TYPES ──────────────────────────────────────────────────────────────
  const feeTypes = await Promise.all([
    prisma.feeType.create({ data: { name: 'Application Fee', domesticAmount: 100, internationalAmount: 5, currency: 'INR', autoApply: 'MANUAL' } }),
    prisma.feeType.create({ data: { name: 'Registration Fee', domesticAmount: 1500, internationalAmount: 20, currency: 'INR', autoApply: 'ALL' } }),
    prisma.feeType.create({ data: { name: 'Library Fee', domesticAmount: 500, internationalAmount: 0, currency: 'INR', autoApply: 'ALL' } }),
    prisma.feeType.create({ data: { name: 'Sports Fee', domesticAmount: 500, internationalAmount: 0, currency: 'INR', autoApply: 'OFFLINE_ONLY' } }),
    prisma.feeType.create({ data: { name: 'ID Card Fee', domesticAmount: 100, internationalAmount: 5, currency: 'INR', autoApply: 'MANUAL' } }),
    prisma.feeType.create({ data: { name: 'Hostel Fee', domesticAmount: 4000, internationalAmount: 50, currency: 'INR', autoApply: 'MONTHLY' } }),
    prisma.feeType.create({ data: { name: 'Transcript Fee', domesticAmount: 200, internationalAmount: 10, currency: 'INR', autoApply: 'MANUAL' } }),
    prisma.feeType.create({ data: { name: 'Revaluation Fee', domesticAmount: 100, internationalAmount: 5, currency: 'INR', autoApply: 'MANUAL' } }),
    prisma.feeType.create({ data: { name: 'Tuition Fee - B.Th.', domesticAmount: 30000, internationalAmount: 400, currency: 'INR', autoApply: 'SPECIFIC_PROGRAMME', appliesTo: { programmeCode: 'BTH' } } }),
  ]);
  console.log('✓ Fee types created');

  // ─── SAMPLE LEDGER ENTRIES ──────────────────────────────────────────────────
  const studentProfiles = await prisma.studentProfile.findMany({ take: 5 });
  for (const sp of studentProfiles) {
    const tuitionFeeType = feeTypes.find(f => f.name.includes('Tuition Fee'));
    if (tuitionFeeType) {
      await prisma.studentFeeLedger.create({
        data: {
          studentId: sp.id,
          semesterId: activeSemester.id,
          feeTypeId: tuitionFeeType.id,
          amount: sp.studentType === 'INTERNATIONAL' ? 400 : 30000,
          currency: sp.studentType === 'INTERNATIONAL' ? 'USD' : 'INR',
          waivedAmount: 0,
          balance: sp.studentType === 'INTERNATIONAL' ? 400 : 30000,
          status: 'UNPAID',
          dueDate: new Date('2025-07-15'),
        }
      });
    }
  }
  console.log('✓ Fee ledger entries created');

  // ─── ADMISSIONS PIPELINE ────────────────────────────────────────────────────
  const pipelineApplicants = [
    { stage: 'RECEIVED', name: 'Abraham Tetteh', type: 'INTERNATIONAL' },
    { stage: 'DOCS_REVIEW', name: 'Kavita Rao', type: 'DOMESTIC' },
    { stage: 'INTERVIEW_SCHEDULED', name: 'Emmanuel Asante', type: 'INTERNATIONAL' },
    { stage: 'INTERVIEW_DONE', name: 'Meena George', type: 'DOMESTIC' },
    { stage: 'WAITLISTED', name: 'Samuel Boateng', type: 'INTERNATIONAL' },
    { stage: 'ACCEPTED', name: 'Deepak Yadav', type: 'DOMESTIC' },
    { stage: 'REJECTED', name: 'Kofi Mensah', type: 'INTERNATIONAL' },
  ];

  let appNum = 1001;
  for (const a of pipelineApplicants) {
    await prisma.applicant.create({
      data: {
        applicationNo: `HMC-APP-2025-${appNum++}`,
        programmeId: bth.id,
        studentType: a.type,
        pipelineStage: a.stage,
        intakeYear: 2025,
        formData: {
          firstName: a.name.split(' ')[0],
          lastName: a.name.split(' ')[1] || '',
          email: `${a.name.toLowerCase().replace(' ', '.')}@email.com`,
          phone: '+911234567890',
        },
        status: a.stage === 'REJECTED' ? 'archived' : 'active',
      }
    });
  }
  console.log('✓ Admissions pipeline created');

  // ─── REFERRAL PROGRAMME ─────────────────────────────────────────────────────
  await prisma.referralProgramme.create({
    data: {
      name: 'Refer-a-Friend 2025',
      validFrom: new Date('2025-01-01'),
      validUntil: new Date('2025-12-31'),
      incentiveType: 'WAIVER',
      domesticIncentiveInr: 3000,
      internationalIncentiveUsd: 40,
      maxReferrals: 5,
      eligibility: 'ALL',
      isActive: true,
    }
  });
  console.log('✓ Referral programme created');

  // ─── SYSTEM SETTINGS ────────────────────────────────────────────────────────
  await prisma.systemSetting.upsert({
    where: { key: 'college_info' },
    update: {},
    create: {
      key: 'college_info',
      value: {
        name: 'Harvest Mission College',
        shortName: 'HMC',
        address: 'Plot No. 12, Sector 10',
        city: 'Greater Noida',
        state: 'Uttar Pradesh',
        pin: '201310',
        phone: '+911204567890',
        accreditation: 'Asia Theological Association (ATA)',
        website: 'https://hmc.edu',
        registrarEmail: 'registrar@hmc.edu',
      }
    }
  });

  await prisma.systemSetting.upsert({
    where: { key: 'academic' },
    update: {},
    create: {
      key: 'academic',
      value: {
        minAttendanceDefault: 75,
        cgpaAtRiskThreshold: 5.0,
        marksDeadlineReminderDays: 3,
        revaluationFee: 100,
        transcriptFee: 200,
      }
    }
  });

  await prisma.systemSetting.upsert({
    where: { key: 'security' },
    update: {},
    create: {
      key: 'security',
      value: {
        twoFaRequired: false,
        sessionTimeoutMins: 30,
        maxLoginAttempts: 5,
        passwordMinLength: 8,
        passwordRequireSpecial: true,
      }
    }
  });

  await prisma.systemSetting.upsert({
    where: { key: 'admissions' },
    update: {},
    create: {
      key: 'admissions',
      value: {
        acceptanceDeadlineDays: 14,
        refereeLinkExpiryDays: 14,
        intakeCapacityWarning: true,
      }
    }
  });

  console.log('✓ System settings created');
  console.log('\n✅ HMC Platform seeded successfully!');
  console.log('\nDemo credentials:');
  console.log('  Full Admin:       admin@hmc.edu        / Admin@123');
  console.log('  Teacher-Admin:    ta@hmc.edu           / Welcome@123');
  console.log('  Admissions:       admissions@hmc.edu   / Welcome@123');
  console.log('  Faculty:          dr.john@hmc.edu      / Welcome@123');
  console.log('  Student:          james.mensah@student.hmc.edu / Welcome@123');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
