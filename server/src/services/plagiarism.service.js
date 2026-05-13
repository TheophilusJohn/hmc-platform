const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const notif = require('./notification.service');

/**
 * Compare submitted text against other student submissions for same exam
 */
async function compareStudentToStudent(text, examId) {
  if (!text || text.length < 50) return 0;

  const otherSubmissions = await prisma.submission.findMany({
    where: { exam_id: examId, status: { not: 'draft' } },
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
    // Login to Copyleaks
    const loginRes = await axios.post('https://id.copyleaks.com/v3/account/login/api', { email, key: apiKey });
    const accessToken = loginRes.data.access_token;

    // Submit scan
    const scanId = `hmc-${Date.now()}`;
    await axios.post(`https://api.copyleaks.com/v3/businesses/start/${scanId}`, {
      base64: Buffer.from(text).toString('base64'),
      filename: 'submission.txt',
      properties: { webhooks: { status: `${process.env.API_URL}/api/plagiarism/webhook/{STATUS}` } },
    }, { headers: { Authorization: `Bearer ${accessToken}` } });

    // For now return placeholder — webhook would update the record asynchronously
    return { scan_id: scanId, score: 0, sources: [], status: 'scanning' };
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
      include: { exam: { include: { settings: true, subject: true } } },
    });
    if (!submission?.exam.settings?.plagiarism_check) return;

    const threshold = submission.exam.settings.similarity_threshold || 30;

    const [studentScore, externalResult] = await Promise.all([
      compareStudentToStudent(text, submission.exam_id),
      checkExternalSources(text),
    ]);

    const maxScore = Math.max(studentScore, externalResult.score || 0);

    await prisma.plagiarismReport.create({
      data: {
        submission_id: submissionId,
        student_similarity_score: studentScore,
        external_similarity_score: externalResult.score || 0,
        matched_sources: externalResult.sources || [],
      },
    });

    if (maxScore > threshold) {
      await prisma.submission.update({
        where: { id: submissionId },
        data: { plagiarism_score: maxScore, flag_status: 'flagged' },
      });

      // Notify faculty
      const faculty = submission.exam.subject?.faculty_id;
      if (faculty) {
        await notif.createNotification(faculty, 'plagiarism_flagged', 'Submission Flagged', `A submission for "${submission.exam.subject?.name}" has been flagged for plagiarism (${Math.round(maxScore)}% similarity).`, `/faculty/exams`);
      }

      // Notify student — no score revealed
      await notif.createNotification(submission.student_id, 'submission_review', 'Submission Under Review', 'Your submission is being reviewed for academic integrity. You will be notified of the outcome.', '/student/exams');
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
    where: { submission_id: submissionId },
    include: { submission: { include: { student: { include: { student_profile: true } }, exam: true } } },
  });
  return report;
}

module.exports = { checkPlagiarism, compareStudentToStudent, checkExternalSources, generatePlagiarismReport };
