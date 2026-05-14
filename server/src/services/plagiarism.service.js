const axios = require('axios');
const prisma = require('../config/db');
const notif = require('./notification.service');

/**
 * Compare submitted text against other student submissions for same exam
 */
async function compareStudentToStudent(text, examId) {
  if (!text || text.length < 50) return 0;

  const otherSubmissions = await prisma.submission.findMany({
    where: { examId, status: { not: 'DRAFT' } },
    select: { answers: true },
  });

  let maxSimilarity = 0;
  const textWords = new Set(text.toLowerCase().split(/\s+/));

  for (const sub of otherSubmissions) {
    const answers = sub.answers || {};
    const allText = Object.values(answers).filter(v => typeof v === 'string').join(' ');
    if (!allText) continue;

    const otherWords = new Set(allText.toLowerCase().split(/\s+/));
    const intersection = [...textWords].filter(w => otherWords.has(w)).length;
    const union = new Set([...textWords, ...otherWords]).size;
    const similarity = union > 0 ? (intersection / union) * 100 : 0;
    if (similarity > maxSimilarity) maxSimilarity = similarity;
  }

  return maxSimilarity;
}

/**
 * Check external sources via Copyleaks API
 */
async function checkExternalSources(text) {
  const email = process.env.COPYLEAKS_EMAIL;
  const apiKey = process.env.COPYLEAKS_API_KEY;
  if (!email || !apiKey) return { score: 0, sources: [] };

  try {
    const loginRes = await axios.post('https://id.copyleaks.com/v3/account/login/api', { email, key: apiKey });
    const accessToken = loginRes.data.access_token;

    const scanId = `hmc-${Date.now()}`;
    await axios.post(`https://api.copyleaks.com/v3/businesses/start/${scanId}`, {
      base64: Buffer.from(text).toString('base64'),
      filename: 'submission.txt',
      properties: { webhooks: { status: `${process.env.API_URL}/api/plagiarism/webhook/{STATUS}` } },
    }, { headers: { Authorization: `Bearer ${accessToken}` } });

    return { scanId, score: 0, sources: [], status: 'scanning' };
  } catch (err) {
    console.error('Copyleaks error:', err.message);
    return { score: 0, sources: [], error: err.message };
  }
}

/**
 * Full plagiarism check — called async after submission
 */
async function checkPlagiarism(submissionId, text) {
  try {
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        exam: {
          include: {
            settings: true,
            subject: { include: { faculty: { include: { user: { select: { id: true } } } } } },
          },
        },
        student: { include: { user: { select: { id: true } } } },
      },
    });
    if (!submission?.exam.settings?.plagiarismCheck) return;

    const threshold = submission.exam.settings.similarityThreshold || 30;

    const [studentScore, externalResult] = await Promise.all([
      compareStudentToStudent(text, submission.examId),
      checkExternalSources(text),
    ]);

    const maxScore = Math.max(studentScore, externalResult.score || 0);

    await prisma.plagiarismReport.upsert({
      where: { submissionId },
      create: {
        submissionId,
        studentSimilarityScore: studentScore,
        externalSimilarityScore: externalResult.score || 0,
        matchedSources: externalResult.sources || [],
      },
      update: {
        studentSimilarityScore: studentScore,
        externalSimilarityScore: externalResult.score || 0,
        matchedSources: externalResult.sources || [],
      },
    });

    if (maxScore > threshold) {
      await prisma.submission.update({
        where: { id: submissionId },
        data: { plagiarismScore: maxScore, flagStatus: 'FLAGGED' },
      });

      // Notify faculty (Notification.userId FKs to User.id, not FacultyProfile.id)
      const facultyUserId = submission.exam.subject?.faculty?.user?.id;
      if (facultyUserId) {
        await notif.createNotification(
          facultyUserId, 'plagiarism_flagged', 'Submission Flagged',
          `A submission for "${submission.exam.subject?.name}" has been flagged for plagiarism (${Math.round(maxScore)}% similarity).`,
          '/faculty/exams'
        );
      }

      // Notify student — no score revealed (use User.id)
      const studentUserId = submission.student?.user?.id;
      if (studentUserId) {
        await notif.createNotification(
          studentUserId, 'submission_review', 'Submission Under Review',
          'Your submission is being reviewed for academic integrity. You will be notified of the outcome.',
          '/student/exams'
        );
      }
    }
  } catch (err) {
    console.error('Plagiarism check error:', err);
  }
}

/**
 * Generate plagiarism report data
 */
async function generatePlagiarismReport(submissionId) {
  const report = await prisma.plagiarismReport.findFirst({
    where: { submissionId },
    include: { submission: { include: { student: true, exam: true } } },
  });
  return report;
}

module.exports = { checkPlagiarism, compareStudentToStudent, checkExternalSources, generatePlagiarismReport };
