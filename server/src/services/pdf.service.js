const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const NAVY = '#0F2B4A';
const GOLD = '#C9920A';
const GRAY = '#5A6272';
const CLIENT_URL = process.env.CLIENT_URL || 'https://hmc.edu';

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

async function generateUnofficialTranscript(studentId) {
  const student = await prisma.user.findUnique({
    where: { id: studentId },
    include: {
      student_profile: true,
      enrollments: {
        include: { subject: { include: { semester: true } } },
        orderBy: [{ subject: { semester: { academic_year: 'asc' } } }],
      },
    },
  });

  return buildPdfBuffer(doc => {
    addLetterhead(doc, 'UNOFFICIAL TRANSCRIPT');

    // Watermark
    doc.save().rotate(-45, { origin: [doc.page.width / 2, doc.page.height / 2] });
    doc.fillColor('#DDE1E7').fontSize(72).opacity(0.3).text('UNOFFICIAL', 100, doc.page.height / 2 - 50, { align: 'center' });
    doc.restore().opacity(1);

    // Student info
    const sp = student.student_profile;
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(12).text(`${sp?.first_name} ${sp?.last_name}`);
    doc.fillColor(GRAY).font('Helvetica').fontSize(10)
      .text(`Student ID: ${student.user_id_display}`)
      .text(`Study Mode: ${sp?.study_mode?.toUpperCase() || 'N/A'}`);
    doc.moveDown();

    // Group by semester
    const bySemester = {};
    for (const e of student.enrollments) {
      const key = e.subject.semester_id;
      if (!bySemester[key]) bySemester[key] = { semester: e.subject.semester, subjects: [] };
      bySemester[key].subjects.push(e);
    }

    for (const { semester, subjects } of Object.values(bySemester)) {
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11).text(`${semester.name} (${semester.academic_year})`);
      doc.fillColor(GRAY).fontSize(9).text('Subject Code    Subject Name                     Credits  Marks    Grade   Status');
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke(GOLD);
      doc.moveDown(0.3);

      for (const e of subjects) {
        const line = `${(e.subject.code || '').padEnd(16)}${(e.subject.name || '').substring(0, 32).padEnd(33)}${String(e.subject.credit_hours || '').padEnd(9)}${String(e.total_marks || '-').padEnd(9)}${(e.grade || 'P').padEnd(8)}${e.enrollment_type === 'arrear' ? 'A' : e.result_status || 'P'}`;
        doc.fillColor('#1A1D23').font('Helvetica').fontSize(9).text(line, { continued: false });
      }
      doc.moveDown();
    }
    addFooter(doc);
  });
}

async function generateOfficialTranscript(studentId, requestId, verificationId) {
  const student = await prisma.user.findUnique({
    where: { id: studentId },
    include: {
      student_profile: true,
      enrollments: { include: { subject: { include: { semester: true } } }, orderBy: [{ subject: { semester: { academic_year: 'asc' } } }] },
    },
  });

  const qrDataUrl = await QRCode.toDataURL(`${CLIENT_URL}/verify/${verificationId}`);
  const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');

  return buildPdfBuffer(doc => {
    addLetterhead(doc, 'OFFICIAL TRANSCRIPT OF ACADEMIC RECORDS');

    const sp = student.student_profile;
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(12).text(`${sp?.first_name} ${sp?.last_name}`);
    doc.fillColor(GRAY).font('Helvetica').fontSize(10)
      .text(`Student ID: ${student.user_id_display}`)
      .text(`Study Mode: ${sp?.study_mode?.toUpperCase() || 'N/A'}`)
      .text(`Date Issued: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}`);
    doc.moveDown();

    const bySemester = {};
    for (const e of student.enrollments) {
      const key = e.subject.semester_id;
      if (!bySemester[key]) bySemester[key] = { semester: e.subject.semester, subjects: [] };
      bySemester[key].subjects.push(e);
    }

    for (const { semester, subjects } of Object.values(bySemester)) {
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11).text(`${semester.name} (${semester.academic_year})`);
      doc.fillColor(GRAY).fontSize(9).text('Code            Name                             Credits  Marks    Grade');
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke(GOLD);
      doc.moveDown(0.3);
      for (const e of subjects) {
        const line = `${(e.subject.code || '').padEnd(16)}${(e.subject.name || '').substring(0, 32).padEnd(33)}${String(e.subject.credit_hours || '').padEnd(9)}${String(e.total_marks || '-').padEnd(9)}${e.grade || 'P'}`;
        doc.fillColor('#1A1D23').font('Helvetica').fontSize(9).text(line);
      }
      doc.moveDown();
    }

    // Registrar signature area
    doc.moveDown(2);
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10).text('Registrar, Harvest Mission College');
    doc.fillColor(GRAY).fontSize(8).text('Digitally signed and sealed');

    // QR code
    doc.image(qrBuffer, doc.page.width - 120, doc.page.height - 160, { width: 80, height: 80 });
    doc.fillColor(GRAY).fontSize(7).text(`Verify: ${CLIENT_URL}/verify/${verificationId}`, doc.page.width - 140, doc.page.height - 75, { width: 120 });

    addFooter(doc);
  });
}

async function generateDegreeCertificate(studentId, cert) {
  const student = await prisma.user.findUnique({
    where: { id: studentId }, include: { student_profile: true },
  });
  const sp = student.student_profile;
  const qrDataUrl = await QRCode.toDataURL(`${CLIENT_URL}/certificates/verify/${cert.verification_id}`);
  const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');

  return buildPdfBuffer(doc => {
    // Certificate border
    doc.rect(20, 20, doc.page.width - 40, doc.page.height - 40).strokeColor(GOLD).lineWidth(3).stroke();
    doc.rect(26, 26, doc.page.width - 52, doc.page.height - 52).strokeColor(NAVY).lineWidth(1).stroke();

    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(28).text('HARVEST MISSION COLLEGE', 0, 80, { align: 'center' });
    doc.fillColor(GOLD).fontSize(14).text('Greater Noida, U.P., India', 0, 115, { align: 'center' });
    doc.moveDown(2);

    doc.fillColor(GRAY).font('Helvetica').fontSize(14).text('This is to certify that', 0, 180, { align: 'center' });
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(24).text(`${sp?.first_name} ${sp?.last_name}`, 0, 210, { align: 'center' });
    doc.moveTo(doc.page.width / 2 - 100, 245).lineTo(doc.page.width / 2 + 100, 245).strokeColor(GOLD).stroke();
    doc.fillColor(GRAY).font('Helvetica').fontSize(14).text('has successfully completed the requirements for the degree of', 0, 260, { align: 'center' });
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(20).text(cert.programme_name || 'Bachelor of Theology', 0, 290, { align: 'center' });
    doc.fillColor(GRAY).fontSize(12).text(`Graduation Date: ${new Date(cert.graduation_date).toLocaleDateString('en-IN', { day: 'long', month: 'long', year: 'numeric' })}`, 0, 330, { align: 'center' });
    doc.text(`Certificate No: ${cert.cert_number}`, 0, 350, { align: 'center' });

    doc.image(qrBuffer, doc.page.width / 2 - 40, 400, { width: 80, height: 80 });
    doc.fillColor(GRAY).fontSize(8).text(`Verify: ${CLIENT_URL}/certificates/verify/${cert.verification_id}`, 0, 490, { align: 'center' });
  });
}

async function generateReceipt(paymentId) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { student: { include: { student_profile: true } }, ledger: { include: { fee_type: true } } },
  });

  return buildPdfBuffer(doc => {
    addLetterhead(doc, 'PAYMENT RECEIPT');
    const sp = payment.student.student_profile;
    const symbol = payment.currency === 'USD' ? '$' : '₹';

    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(12).text(`Receipt No: ${payment.receipt_no}`);
    doc.fillColor(GRAY).font('Helvetica').fontSize(10)
      .text(`Date: ${new Date(payment.paid_at).toLocaleDateString('en-IN')}`)
      .text(`Student: ${sp?.first_name} ${sp?.last_name} (${payment.student.user_id_display})`)
      .text(`Fee: ${payment.ledger?.fee_type?.name || 'Fee Payment'}`)
      .text(`Amount: ${symbol}${Number(payment.amount).toLocaleString()}`)
      .text(`Mode: ${payment.mode?.replace(/_/g, ' ').toUpperCase()}`);

    if (payment.gateway_ref) doc.text(`Reference: ${payment.gateway_ref}`);
    doc.moveDown(2);
    doc.fillColor(NAVY).font('Helvetica-Bold').text('This is a computer-generated receipt. No signature required.');
    addFooter(doc);
  });
}

async function generateMarksheet(studentId, semesterId) {
  const enrollments = await prisma.studentSubjectEnrollment.findMany({
    where: { student_id: studentId, semester_id: semesterId },
    include: { subject: { include: { semester: true } } },
  });
  const student = await prisma.user.findUnique({ where: { id: studentId }, include: { student_profile: true } });
  const sp = student.student_profile;

  return buildPdfBuffer(doc => {
    addLetterhead(doc, 'ACADEMIC MARKSHEET');
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(12).text(`${sp?.first_name} ${sp?.last_name} — ${student.user_id_display}`);
    doc.moveDown();

    doc.fillColor(GRAY).fontSize(9).text('Code            Subject                          Credits  ESE    IA     Total  Grade');
    for (const e of enrollments) {
      doc.font('Helvetica').text(`${(e.subject.code || '').padEnd(16)}${(e.subject.name || '').substring(0, 32).padEnd(33)}${String(e.subject.credit_hours || '').padEnd(9)}${String(e.ese_marks || '-').padEnd(7)}${String(e.ia_marks || '-').padEnd(7)}${String(e.total_marks || '-').padEnd(7)}${e.grade || '-'}`);
    }
    addFooter(doc);
  });
}

async function generateAcceptanceLetter(applicantId) {
  const applicant = await prisma.applicant.findUnique({ where: { id: applicantId }, include: { programme: true } });

  return buildPdfBuffer(doc => {
    addLetterhead(doc, 'LETTER OF ACCEPTANCE');
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(12).text(`Dear ${applicant.first_name} ${applicant.last_name},`);
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
