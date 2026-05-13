const axios = require('axios');
const twilio = require('twilio');

/**
 * Send SMS via MSG91 (India)
 */
async function sendSMSIndia(phone, message) {
  const apiKey = process.env.MSG91_API_KEY;
  if (!apiKey) throw new Error('MSG91 not configured');

  await axios.post('https://api.msg91.com/api/v5/flow/', {
    flow_id: process.env.MSG91_FLOW_ID,
    sender: process.env.MSG91_SENDER_ID || 'HMC',
    mobiles: phone.startsWith('+91') ? phone : `+91${phone}`,
    VAR1: message,
  }, {
    headers: { authkey: apiKey, 'Content-Type': 'application/json' },
  });
}

/**
 * Send SMS via Twilio (International)
 */
async function sendSMSInternational(phone, message) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) throw new Error('Twilio not configured');

  const client = twilio(accountSid, authToken);
  await client.messages.create({
    body: message,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: phone,
  });
}

/**
 * Send SMS — auto-routes by phone country
 */
async function sendSMS(phone, message) {
  if (!phone) return;
  if (phone.startsWith('+91') || (!phone.startsWith('+') && phone.length === 10)) {
    return sendSMSIndia(phone, message);
  }
  return sendSMSInternational(phone, message);
}

/**
 * Send WhatsApp message via WhatsApp Business API
 */
async function sendWhatsApp(phone, templateName, params = []) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const businessId = process.env.WHATSAPP_BUSINESS_ID;
  if (!token || !businessId) throw new Error('WhatsApp not configured');

  await axios.post(`https://graph.facebook.com/v18.0/${businessId}/messages`, {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'en' },
      components: params.length ? [{ type: 'body', parameters: params.map(p => ({ type: 'text', text: p })) }] : [],
    },
  }, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
}

/**
 * Send fee reminder SMS/WhatsApp
 */
async function sendFeeReminderSMS(phone, studentName, amount, dueDate, currency = 'INR') {
  const symbol = currency === 'USD' ? '$' : '₹';
  const msg = `Dear ${studentName}, your fee balance of ${symbol}${amount} is due on ${dueDate}. Please pay at your earliest. - HMC`;
  await sendSMS(phone, msg).catch(err => console.error('SMS failed:', err.message));
}

/**
 * Send exam reminder SMS
 */
async function sendExamReminderSMS(phone, studentName, examName, examDate) {
  const msg = `Dear ${studentName}, reminder: "${examName}" is scheduled on ${examDate}. - HMC`;
  await sendSMS(phone, msg).catch(err => console.error('SMS failed:', err.message));
}

module.exports = { sendSMS, sendWhatsApp, sendFeeReminderSMS, sendExamReminderSMS };
