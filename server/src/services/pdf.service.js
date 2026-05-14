const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const prisma = require('../config/db');

const NAVY = '#0F2B4A';
const GOLD = '#C9920A';
const GRAY = '#5A6272';
const CLIENT_URL = process.env.CLIENT_URL || 'https://portal.hmc.college';

function buildPdfBuffer(fn) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    fn(doc);
    doc.end();
  });
}

function addLetterhead(doc, title) {
  doc.fillColor(NAVY).rect(0, 0, doc.page.width, 80).fill();
  doc.fillColor('white').font('Helvetica-Bold').fontSize(20).text('HARVEST MISSION COLLEGE', 50, 20);
  doc.fillColor(GOLD).fontSize(10).text('Greater Noida, U.P., India | Accredited by ATA', 50, 45);
  doc.fillColor('white').fontSize(10).text(title, 50, 60);
  doc.moveDown(3);
}

function addFooter(doc) {
  const y = doc.page.height - 60;
  doc.fillColor(GRAY).fontSize(8).text('Harvest Mission College, Greater Noida, U.P. 201308, India', 50, y, { align: 'center' });
  doc.text('This document is issued by the Office of the Registrar', 50, y + 12, { align: 'center' });
}

// Helper: studentProfileId → { profile, enrollmentsBySemester }
async function loadStudentForTranscript(studentProfileId) {
  const profile = await prisma.studentProfile.findUnique({
    where: { id: studentProfileId },
    include: {
      user: { select: { userIdDisplay: true } },
      enrollments: {
        // Pull the enrollment's own Semester relation — NOT the subject's current
        // semester. If a subject is re-offered in a later semester, the subject
        // row's semesterId moves; the enrollment's semesterId stays pinned to
        // when the student actually took the course. Grouping by subject.semester
        // would silently place historical results in the wrong term.
        include: { subject: true, semester: true },
      },
    },
  });
  if (!profile) throw new Error('Student not found');

  const bySemester = {};
  for (const e of profile.enrollments || []) {
    const sem = e.semester;
    if (!sem) continue;
    if (!bySemester[sem.id]) bySemester[sem.id] = { semester: sem, subjects: [] };
    bySemester[sem.id].subjects.push(e);
  }
  // Order by academicYear
  const ordered = Object.values(bySemester).sort((a, b) =>
    (a.semester.academicYear || '').localeCompare(b.semester.academicYear || '')
  );
  return { profile, semesters: ordered };
}

async function generateUnofficialTranscript(studentProfileId) {
  const { profile, semesters } = await loadStudentForTranscript(studentProfileId);

  return buildPdfBuffer(doc => {
    addLetterhead(doc, 'UNOFFICIAL TRANSCRIPT');

    // Watermark
    doc.save().rotate(-45, { origin: [doc.page.width / 2, doc.page.height / 2] });
    doc.fillColor('#DDE1E7').fontSize(72).opacity(0.3).text('UNOFFICIAL', 100, doc.page.height / 2 - 50, { align: 'center' });
    doc.restore();

    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(12).text(`${profile.firstName} ${profile.lastName}`);
    doc.fillColor(GRAY).font('Helvetica').fontSize(10)
      .text(`Student ID: ${profile.user?.userIdDisplay || ''}`)
      .text(`Study Mode: ${(profile.studyMode || '').toUpperCase()}`);
    doc.moveDown();

    for (const { semester, subjects } of semesters) {
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11).text(`${semester.name} (${semester.academicYear || ''})`);
      doc.fillColor(GRAY).fontSize(9).text('Subject Code    Subject Name                     Credits  Marks    Grade   Status');
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke(GOLD);
      doc.moveDown(0.3);

      for (const e of subjects) {
        const total = (e.iaMarks ?? 0) + (e.eseMarks ?? 0);
        const line = `${(e.subject.code || '').padEnd(16)}${(e.subject.name || '').substring(0, 32).padEnd(33)}${String(e.subject.creditHours || '').padEnd(9)}${String(total || '-').padEnd(9)}${(e.grade || 'P').padEnd(8)}${e.enrollmentType === 'ARREAR' ? 'A' : (e.resultStatus || 'P')}`;
        doc.fillColor('#1A1D23').font('Helvetica').fontSize(9).text(line);
      }
      doc.moveDown();
    }
    addFooter(doc);
  });
}

async function generateOfficialTranscript(studentProfileId, requestId, verificationUuid) {
  const { profile, semesters } = await loadStudentForTranscript(studentProfileId);

  const qrDataUrl = await QRCode.toDataURL(`${CLIENT_URL}/verify/${verificationUuid}`);
  const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');

  return buildPdfBuffer(doc => {
    addLetterhead(doc, 'OFFICIAL TRANSCRIPT OF ACADEMIC RECORDS');

    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(12).text(`${profile.firstName} ${profile.lastName}`);
    doc.fillColor(GRAY).font('Helvetica').fontSize(10)
      .text(`Student ID: ${profile.user?.userIdDisplay || ''}`)
      .text(`Study Mode: ${(profile.studyMode || '').toUpperCase()}`)
      .text(`Date Issued: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}`);
    doc.moveDown();

    for (const { semester, subjects } of semesters) {
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11).text(`${semester.name} (${semester.academicYear || ''})`);
      doc.fillColor(GRAY).fontSize(9).text('Code            Name                             Credits  Marks    Grade');
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke(GOLD);
      doc.moveDown(0.3);
      for (const e of subjects) {
        const total = (e.iaMarks ?? 0) + (e.eseMarks ?? 0);
        const line = `${(e.subject.code || '').padEnd(16)}${(e.subject.name || '').substring(0, 32).padEnd(33)}${String(e.subject.creditHours || '').padEnd(9)}${String(total || '-').padEnd(9)}${e.grade || 'P'}`;
        doc.fillColor('#1A1D23').font('Helvetica').fontSize(9).text(line);
      }
      doc.moveDown();
    }

    doc.moveDown(2);
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10).text('Registrar, Harvest Mission College');
    doc.fillColor(GRAY).fontSize(8).text('Digitally signed and sealed');

    doc.image(qrBuffer, doc.page.width - 120, doc.page.height - 160, { width: 80, height: 80 });
    doc.fillColor(GRAY).fontSize(7).text(`Verify: ${CLIENT_URL}/verify/${verificationUuid}`, doc.page.width - 140, doc.page.height - 75, { width: 120 });

    addFooter(doc);
  });
}

async function generateDegreeCertificate(studentProfileId, cert) {
  const profile = await prisma.studentProfile.findUnique({
    where: { id: studentProfileId },
    include: { user: { select: { userIdDisplay: true } } },
  });
  const qrDataUrl = await QRCode.toDataURL(`${CLIENT_URL}/certificates/verify/${cert.verificationUuid}`);
  const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');

  return buildPdfBuffer(doc => {
    doc.rect(20, 20, doc.page.width - 40, doc.page.height - 40).strokeColor(GOLD).lineWidth(3).stroke();
    doc.rect(26, 26, doc.page.width - 52, doc.page.height - 52).strokeColor(NAVY).lineWidth(1).stroke();

    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(28).text('HARVEST MISSION COLLEGE', 0, 80, { align: 'center' });
    doc.fillColor(GOLD).fontSize(14).text('Greater Noida, U.P., India', 0, 115, { align: 'center' });

    doc.fillColor(GRAY).font('Helvetica').fontSize(14).text('This is to certify that', 0, 180, { align: 'center' });
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(24).text(`${profile.firstName} ${profile.lastName}`, 0, 210, { align: 'center' });
    doc.moveTo(doc.page.width / 2 - 100, 245).lineTo(doc.page.width / 2 + 100, 245).strokeColor(GOLD).stroke();
    doc.fillColor(GRAY).font('Helvetica').fontSize(14).text('has successfully completed the requirements for the degree of', 0, 260, { align: 'center' });
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(20).text(cert.programmeName || 'Bachelor of Theology', 0, 290, { align: 'center' });
    doc.fillColor(GRAY).fontSize(12).text(`Graduation Date: ${new Date(cert.graduationDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`, 0, 330, { align: 'center' });
    doc.text(`Certificate No: ${cert.certificateNumber}`, 0, 350, { align: 'center' });

    doc.image(qrBuffer, doc.page.width / 2 - 40, 400, { width: 80, height: 80 });
    doc.fillColor(GRAY).fontSize(8).text(`Verify: ${CLIENT_URL}/certificates/verify/${cert.verificationUuid}`, 0, 490, { align: 'center' });
  });
}

async function generateReceipt(paymentId) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      student: { include: { user: { select: { userIdDisplay: true } } } },
      ledger: { include: { feeType: true } },
    },
  });

  return buildPdfBuffer(doc => {
    addLetterhead(doc, 'PAYMENT RECEIPT');
    const sp = payment.student;
    const symbol = payment.currency === 'USD' ? '$' : '₹';

    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(12).text(`Receipt No: ${payment.receiptNo}`);
    doc.fillColor(GRAY).font('Helvetica').fontSize(10)
      .text(`Date: ${new Date(payment.paidAt).toLocaleDateString('en-IN')}`)
      .text(`Student: ${sp?.firstName || ''} ${sp?.lastName || ''} (${sp?.user?.userIdDisplay || ''})`)
      .text(`Fee: ${payment.ledger?.feeType?.name || 'Fee Payment'}`)
      .text(`Amount: ${symbol}${Number(payment.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
      .text(`Mode: ${(payment.mode || '').replace(/_/g, ' ').toUpperCase()}`);

    if (payment.gatewayRef) doc.text(`Reference: ${payment.gatewayRef}`);
    doc.moveDown(2);
    doc.fillColor(NAVY).font('Helvetica-Bold').text('This is a computer-generated receipt. No signature required.');
    addFooter(doc);
  });
}

async function generateMarksheet(studentProfileId, semesterId) {
  const enrollments = await prisma.studentSubjectEnrollment.findMany({
    where: { studentId: studentProfileId, semesterId },
    include: { subject: { include: { semester: true } } },
  });
  const profile = await prisma.studentProfile.findUnique({
    where: { id: studentProfileId },
    include: { user: { select: { userIdDisplay: true } } },
  });

  return buildPdfBuffer(doc => {
    addLetterhead(doc, 'ACADEMIC MARKSHEET');
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(12).text(`${profile.firstName} ${profile.lastName} — ${profile.user?.userIdDisplay || ''}`);
    doc.moveDown();

    doc.fillColor(GRAY).fontSize(9).text('Code            Subject                          Credits  ESE    IA     Total  Grade');
    for (const e of enrollments) {
      const total = (e.iaMarks ?? 0) + (e.eseMarks ?? 0);
      doc.font('Helvetica').text(`${(e.subject.code || '').padEnd(16)}${(e.subject.name || '').substring(0, 32).padEnd(33)}${String(e.subject.creditHours || '').padEnd(9)}${String(e.eseMarks ?? '-').padEnd(7)}${String(e.iaMarks ?? '-').padEnd(7)}${String(total || '-').padEnd(7)}${e.grade || '-'}`);
    }
    addFooter(doc);
  });
}

async function generateAcceptanceLetter(applicantId) {
  const applicant = await prisma.applicant.findUnique({
    where: { id: applicantId },
    include: { programme: true },
  });
  const fd = applicant?.formData || {};

  return buildPdfBuffer(doc => {
    addLetterhead(doc, 'LETTER OF ACCEPTANCE');
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(12).text(`Dear ${fd.firstName || ''} ${fd.lastName || ''},`);
    doc.moveDown();
    doc.fillColor('#1A1D23').font('Helvetica').fontSize(11)
      .text(`We are delighted to inform you that your application to Harvest Mission College has been accepted for the ${applicant.programme?.name} programme.`)
      .moveDown()
      .text('Please confirm your acceptance by logging in to the student portal within the stipulated deadline.')
      .moveDown()
      .text('On behalf of the entire HMC community, we welcome you and look forward to your journey with us.')
      .moveDown(2);
    doc.fillColor(NAVY).font('Helvetica-Bold').text('Admissions Office');
    doc.text('Harvest Mission College');
    addFooter(doc);
  });
}

module.exports = { generateUnofficialTranscript, generateOfficialTranscript, generateDegreeCertificate, generateReceipt, generateMarksheet, generateAcceptanceLetter };
