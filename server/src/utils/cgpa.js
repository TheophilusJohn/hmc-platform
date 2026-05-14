// server/src/utils/cgpa.js
// UGC 10-point grading system

const GRADE_POINTS = {
  'O': 10,   // Outstanding (90-100%)
  'A+': 9,   // (80-89%)
  'A': 8,    // (70-79%)
  'B+': 7,   // (60-69%)
  'B': 6,    // (50-59%)
  'C': 5,    // (40-49%)
  'F': 0,    // Fail (<40%)
  'EX': 0,   // Credit Transfer (excluded from CGPA calc but shown)
};

/**
 * Convert percentage to grade
 */
function percentToGrade(percent) {
  if (percent >= 90) return 'O';
  if (percent >= 80) return 'A+';
  if (percent >= 70) return 'A';
  if (percent >= 60) return 'B+';
  if (percent >= 50) return 'B';
  if (percent >= 40) return 'C';
  return 'F';
}

/**
 * Calculate SGPA for a set of subject results.
 * CREDIT_TRANSFER (and grade 'EX') rows are excluded from the CGPA average
 * but their credits ARE earned — `creditsEarned` includes them so the marksheet
 * shows the right semester credit load.
 * @param {Array} enrollments - [{ grade, creditHours, enrollmentType }]
 * @returns { sgpa, totalCredits, creditsEarned, transferCredits }
 */
function calculateSGPA(enrollments) {
  let totalWeightedPoints = 0;
  let totalCredits = 0;       // credits counting toward SGPA (non-CT)
  let creditsEarned = 0;      // credits the student has earned (incl. CT)
  let transferCredits = 0;    // credit-transfer credits, displayed separately

  for (const e of enrollments) {
    const credits = e.creditHours || 0;
    const isTransfer = e.enrollmentType === 'CREDIT_TRANSFER' || e.grade === 'EX';

    if (isTransfer) {
      transferCredits += credits;
      creditsEarned += credits;
      continue;
    }
    const points = GRADE_POINTS[e.grade] ?? 0;
    totalWeightedPoints += points * credits;
    totalCredits += credits;
    if (e.grade && e.grade !== 'F') creditsEarned += credits;
  }

  const sgpa = totalCredits > 0
    ? Math.round((totalWeightedPoints / totalCredits) * 100) / 100
    : 0;

  return { sgpa, totalCredits, creditsEarned, transferCredits };
}

/**
 * Calculate cumulative CGPA across multiple semesters.
 * Excludes CREDIT_TRANSFER rows AND any row with grade 'EX'.
 * Skips rows with no grade yet (PENDING enrollments).
 * For failed arrears: if there's a passing retake in the dataset for the same
 * subject, prefer the retake; otherwise include the F.
 */
function calculateCGPA(allEnrollments) {
  // Index passing retakes by subjectId so failed arrears can be replaced.
  const passingRetakeBySubject = new Map();
  for (const e of allEnrollments) {
    if (e.isArrear && e.grade && e.grade !== 'F' && e.enrollmentType !== 'CREDIT_TRANSFER') {
      passingRetakeBySubject.set(e.subjectId, e);
    }
  }

  let totalWeightedPoints = 0;
  let totalCredits = 0;

  for (const e of allEnrollments) {
    if (e.enrollmentType === 'CREDIT_TRANSFER') continue;
    if (e.grade === 'EX') continue;
    if (!e.grade) continue; // PENDING — don't count
    // If this is the original failed attempt and a passing retake exists, skip it.
    if (e.grade === 'F' && !e.isArrear && passingRetakeBySubject.has(e.subjectId)) continue;

    const points = GRADE_POINTS[e.grade] ?? 0;
    totalWeightedPoints += points * (e.creditHours || 0);
    totalCredits += (e.creditHours || 0);
  }

  return totalCredits > 0
    ? Math.round((totalWeightedPoints / totalCredits) * 100) / 100
    : 0;
}

/**
 * Generate full grade summary for a student
 */
function buildGradeSummary(enrollments) {
  const bySemester = {};

  for (const e of enrollments) {
    const semKey = e.semesterId;
    if (!bySemester[semKey]) {
      bySemester[semKey] = { enrollments: [], semesterName: e.semester?.name };
    }
    bySemester[semKey].enrollments.push(e);
  }

  const semesters = Object.entries(bySemester).map(([semId, data]) => {
    const { sgpa, totalCredits, earnedCredits } = calculateSGPA(data.enrollments);
    return { semesterId: semId, semesterName: data.semesterName, sgpa, totalCredits, earnedCredits, subjects: data.enrollments };
  });

  const cgpa = calculateCGPA(enrollments);

  return { semesters, cgpa };
}

module.exports = { percentToGrade, calculateSGPA, calculateCGPA, buildGradeSummary, GRADE_POINTS };
