// server/src/services/email.service.js
const sgMail = require('@sendgrid/mail');

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

const FROM = {
  email: process.env.SENDGRID_FROM_EMAIL || 'noreply@hmc.edu',
  name: process.env.SENDGRID_FROM_NAME || 'Harvest Mission College',
};

const HMC_FOOTER = `
<br><br>
<hr style="border:1px solid #DDE1E7">
<p style="font-size:12px;color:#7B8494">
  Harvest Mission College | Greater Noida, U.P., India<br>
  Accredited by Asia Theological Association (ATA)<br>
  <a href="mailto:info@hmc.edu">info@hmc.edu</a> | <a href="https://hmc.edu">hmc.edu</a>
</p>`;

async function sendEmail({ to, subject, html }) {
  if (!process.env.SENDGRID_API_KEY) {
    console.log(`[EMAIL] To: ${to} | Subject: ${subject}`);
    return;
  }
  await sgMail.send({ to, from: FROM, subject, html: html + HMC_FOOTER });
}

async function sendWelcomeEmail(user, tempPassword) {
  await sendEmail({
    to: user.email,
    subject: 'Welcome to Harvest Mission College — Your Account Credentials',
    html: `
      <h2 style="color:#0F2B4A;font-family:Georgia,serif">Welcome to Harvest Mission College</h2>
      <p>Dear ${user.firstName || 'Student'},</p>
      <p>Your student account has been created. Please log in using the credentials below:</p>
      <div style="background:#EEF4FA;padding:16px;border-radius:8px;margin:16px 0">
        <strong>Login:</strong> <a href="${process.env.CLIENT_URL}/login">${process.env.CLIENT_URL}/login</a><br>
        <strong>Email:</strong> ${user.email}<br>
        <strong>Temp Password:</strong> <code style="background:#FFF;padding:4px 8px;border-radius:4px">${tempPassword}</code>
      </div>
      <p>You will be asked to set a new password on first login. This temporary password expires in 48 hours.</p>
      <p>For support, email <a href="mailto:admissions@hmc.edu">admissions@hmc.edu</a></p>
    `,
  });
}

async function sendPasswordResetEmail(user, resetLink, tempPassword) {
  await sendEmail({
    to: user.email,
    subject: 'HMC — Password Reset',
    html: `
      <h2 style="color:#0F2B4A;font-family:Georgia,serif">Password Reset</h2>
      <p>Dear ${user.email},</p>
      ${resetLink
        ? `<p><a href="${resetLink}" style="background:#0F2B4A;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none">Reset Password</a></p><p>This link expires in 1 hour.</p>`
        : `<p>Your temporary password is: <strong>${tempPassword}</strong></p><p>Please log in and change it within 48 hours.</p>`
      }
    `,
  });
}

async function sendAcceptanceLetter(applicant, user, tempPassword, offerExpires) {
  const formData = applicant.formData || {};
  await sendEmail({
    to: formData.email || user.email,
    subject: `Congratulations — Acceptance to ${applicant.programme?.name || 'HMC'}`,
    html: `
      <h2 style="color:#0F2B4A;font-family:Georgia,serif">Acceptance Letter</h2>
      <p>Dear ${formData.firstName || 'Applicant'},</p>
      <p>We are delighted to inform you that your application to Harvest Mission College has been <strong>accepted</strong>.</p>
      <p><strong>Programme:</strong> ${applicant.programme?.name}<br>
      <strong>Application No.:</strong> ${applicant.applicationNo}</p>
      <p>Your student account credentials:</p>
      <div style="background:#EEF4FA;padding:16px;border-radius:8px">
        <strong>Email:</strong> ${user.email}<br>
        <strong>Temp Password:</strong> <code>${tempPassword}</code><br>
        <strong>Student ID:</strong> ${user.userIdDisplay}
      </div>
      <p>Please confirm your acceptance by ${offerExpires?.toLocaleDateString('en-IN') || 'the stated deadline'}.</p>
    `,
  });
}

async function sendRejectionEmail(applicant, reason) {
  const formData = applicant.formData || {};
  if (!formData.email) return;
  await sendEmail({
    to: formData.email,
    subject: 'HMC — Application Status Update',
    html: `
      <h2 style="color:#0F2B4A;font-family:Georgia,serif">Application Update</h2>
      <p>Dear ${formData.firstName || 'Applicant'},</p>
      <p>Thank you for your interest in Harvest Mission College. After careful consideration, we regret to inform you that we are unable to offer you admission at this time.</p>
      ${reason ? `<p>Feedback: ${reason}</p>` : ''}
      <p>We encourage you to reapply for a future intake. Please contact our admissions office if you have questions.</p>
    `,
  });
}

async function sendWaitlistedEmail(applicant, deadline) {
  const formData = applicant.formData || {};
  if (!formData.email) return;
  await sendEmail({
    to: formData.email,
    subject: 'HMC — Application Under Consideration',
    html: `
      <p>Dear ${formData.firstName || 'Applicant'},</p>
      <p>Your application to Harvest Mission College is currently under consideration.</p>
      ${deadline ? `<p>We will notify you of our decision by <strong>${deadline.toLocaleDateString('en-IN')}</strong>.</p>` : ''}
    `,
  });
}

module.exports = { sendWelcomeEmail, sendPasswordResetEmail, sendAcceptanceLetter, sendRejectionEmail, sendWaitlistedEmail };
