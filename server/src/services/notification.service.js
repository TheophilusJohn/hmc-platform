// server/src/services/notification.service.js
const prisma = require('../config/db');

let io = null;

function setIo(socketIo) { io = socketIo; }

async function createNotification(userId, type, title, body, link = null) {
  const notification = await prisma.notification.create({
    data: { userId, type, title, body, link },
  });

  // Emit real-time via socket
  if (io) {
    io.to(`user:${userId}`).emit('new_notification', { id: notification.id, type, title, body, link });
  }

  return notification;
}

async function sendFeeReminder(studentUserId, feeDetails) {
  return createNotification(
    studentUserId,
    'fee_reminder',
    'Fee Payment Reminder',
    `You have an outstanding balance of ${feeDetails.currency === 'INR' ? '₹' : '$'}${feeDetails.amount}. Due: ${feeDetails.dueDate}.`,
    '/student/fees'
  );
}

async function sendGradeRelease(studentUserId, subjectName) {
  return createNotification(
    studentUserId,
    'grade_released',
    'Results Published',
    `Results for ${subjectName} are now available.`,
    '/student/marksheet'
  );
}

async function sendQueryResponse(studentUserId, queryId) {
  return createNotification(
    studentUserId,
    'query_response',
    'Query Responded',
    'Your query has been responded to.',
    `/student/help?query=${queryId}`
  );
}

module.exports = { setIo, createNotification, sendFeeReminder, sendGradeRelease, sendQueryResponse };
