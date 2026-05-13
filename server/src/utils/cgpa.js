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
 * Calculate SGPA for a set of subject results
 * @param {Array} enrollments - [{ grade, creditHours, enrollmentType }]
 * @returns { sgpa, totalCredits, earnedCredits }
 */
function calculateSGPA(enrollments) {
  let totalWeightedPoints = 0;
  let totalCredits = 0;
  let earnedCredits = 0;

  for (const e of enrollments) {
    if (e.enrollmentType === 'CREDIT_TRANSFER') continue; // EX not in CGPA
    const points = GRADE_POINTS[e.grade] ?? 0;
    totalWeightedPoints += points * e.creditHours;
    totalCredits += e.creditHours;
    if (e.grade !== 'F') earnedCredits += e.creditHours;
  }

  const sgpa = totalCredits > 0
    ? Math.round((totalWeightedPoints / totalCredits) * 100) / 100
    : 0;

  return { sgpa, totalCredits, earnedCredits };
}

/**
 * Calculate cumulative CGPA across multiple semesters
 * @param {Array} allEnrollments - all enrollments across all semesters
 */
function calculateCGPA(allEnrollments) {
  let totalWeightedPoints = 0;
  let totalCredits = 0;

  for (const e of allEnrollments) {
    if (e.enrollmentType === 'CREDIT_TRANSFER') continue;
    if (!e.grade || e.grade === 'F' && e.isArrear) {
      // For arrear: use best grade or retake grade per admin config
      continue;
    }
    const points = GRADE_POINTS[e.grade] ?? 0;
    totalWeightedPoints += points * e.creditHours;
    totalCredits += e.creditHours;
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
