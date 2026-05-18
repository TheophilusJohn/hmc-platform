// server/src/routes/scholarships.js
//
// Admin-side scholarship review. Sub-stage 4 ships the read-only side:
//   GET  /api/admissions/scholarships          — list with status filter
//   GET  /api/admissions/scholarships/:id      — detail with full context
//
// Sub-stage 5 adds the PUT /:id decision endpoint, applicant-facing
// notification, and acceptance-time ledger integration.
//
// Auth: admissionsAccess = FULL_ADMIN + TEACHER_ADMIN + ADMISSIONS_OFFICER.
// Matches the existing admissions pattern so any officer who can view an
// applicant in the pipeline can also review their scholarship request.

const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

const admissionsAccess = requireRole('FULL_ADMIN', 'TEACHER_ADMIN', 'ADMISSIONS_OFFICER');

const ALLOWED_STATUSES = new Set(['PENDING', 'APPROVED', 'PARTIAL', 'DECLINED']);

// Decimal columns come back as Prisma.Decimal — stringify for JSON safety.
function decToStr(d) {
  return d == null ? null : d.toString();
}

// Shape the row for the list view. Pulls applicant name from formData
// (firstName + lastName) since those aren't columns on Applicant. Keeps
// the response narrow — the detail endpoint surfaces the long-form notes.
function listShape(row) {
  const fd = (row.applicant && row.applicant.formData) || {};
  const firstName = String(fd.firstName || '').trim();
  const lastName  = String(fd.lastName  || '').trim();
  return {
    id:             row.id,
    applicantId:    row.applicantId,
    applicationNo:  row.applicant?.applicationNo || null,
    applicantName:  [firstName, lastName].filter(Boolean).join(' '),
    applicantEmail: fd.email || null,
    programmeName:  row.applicant?.programme?.name || null,
    programmeCode:  row.applicant?.programme?.code || null,
    studyMode:      row.applicant?.studyMode || null,
    studentType:    row.applicant?.studentType || null,
    requestType:    row.requestType,
    // Short excerpt for the table row — workCommitment is a boolean we
    // surface as Yes/No client-side; applicantNote gets truncated to keep
    // the table row a sensible height.
    workCommitment: row.workCommitment,
    applicantNoteExcerpt: row.applicantNote
      ? (row.applicantNote.length > 80
          ? row.applicantNote.slice(0, 80).trimEnd() + '…'
          : row.applicantNote)
      : null,
    status:           row.status,
    approvedAmount:   decToStr(row.approvedAmount),
    approvedCurrency: row.approvedCurrency,
    submittedAt:      row.applicant?.submittedAt || null,
    decidedAt:        row.decidedAt,
    createdAt:        row.createdAt,
  };
}

// Canonical "displayable name for any User" — mirrors the fallback chain
// in server/src/routes/auth.js:120-124 (studentProfile → facultyProfile →
// email). FULL_ADMIN and ADMISSIONS_OFFICER have no profile rows, so they
// intentionally fall through to email. TEACHER_ADMIN and FACULTY have a
// facultyProfile. STUDENT (shouldn't decide scholarships, but covered for
// completeness) has a studentProfile. Sub-stage 5's PUT endpoint will use
// the same shape — if a third caller adopts this, factor to a helper.
function deciderDisplay(decider) {
  if (!decider) return null;
  const sp = decider.studentProfile;
  const fp = decider.facultyProfile;
  const name = sp
    ? `${sp.firstName || ''} ${sp.lastName || ''}`.trim()
    : fp
      ? `${fp.firstName || ''} ${fp.lastName || ''}`.trim()
      : '';
  return {
    id:            decider.id,
    name:          name || decider.email,
    email:         decider.email,
    userIdDisplay: decider.userIdDisplay,
    role:          decider.role,
  };
}

// Full detail shape — includes everything the review modal needs to
// surface relevant context for a decision: family info, fee responsibility,
// the full applicantNote (not truncated), decision audit trail.
function detailShape(row) {
  const a = row.applicant || {};
  const fd = a.formData || {};
  const firstName = String(fd.firstName || '').trim();
  const lastName  = String(fd.lastName  || '').trim();
  return {
    id:               row.id,
    applicantId:      row.applicantId,
    requestType:      row.requestType,
    workCommitment:   row.workCommitment,
    applicantNote:    row.applicantNote,
    status:           row.status,
    requestedAmount:  decToStr(row.requestedAmount),
    approvedAmount:   decToStr(row.approvedAmount),
    approvedCurrency: row.approvedCurrency,
    decidedBy:        row.decidedBy,
    decidedAt:        row.decidedAt,
    decisionNotes:    row.decisionNotes,
    createdAt:        row.createdAt,
    updatedAt:        row.updatedAt,
    decider: deciderDisplay(row.decider),
    applicant: {
      id:               a.id,
      applicationNo:    a.applicationNo,
      pipelineStage:    a.pipelineStage,
      submittedAt:      a.submittedAt,
      studentType:      a.studentType,
      studyMode:        a.studyMode,
      paymentStatus:    a.paymentStatus,
      programmeName:    a.programme?.name || null,
      programmeCode:    a.programme?.code || null,
      // Selected applicant context that an officer needs to make a decision.
      // Names come from formData (no first-class columns); the rest mirror
      // Step 2/3/5 fields. Family fields live in formData under the same
      // keys the public form writes (no _public unwrap needed — pickForm
      // keeps them top-level in formData).
      firstName,
      lastName,
      email:            fd.email || null,
      mobile:           a.mobile || fd.mobile || null,
      maritalStatus:    a.maritalStatus || fd.maritalStatus || null,
      // Family + financial context (admin uses these to evaluate the request)
      fatherName:           fd.fatherName       || null,
      fatherOccupation:     fd.fatherOccupation || null,
      motherName:           fd.motherName       || null,
      motherOccupation:     fd.motherOccupation || null,
      numberOfSiblings:     fd.numberOfSiblings ?? null,
      familyChristianBackground: fd.familyChristianBackground || null,
      feeResponsibility:    a.feeResponsibility    || fd.feeResponsibility    || null,
      needsFinancialAid:    typeof a.needsFinancialAid === 'boolean' ? a.needsFinancialAid
                          : (typeof fd.needsFinancialAid === 'boolean' ? fd.needsFinancialAid : null),
      sponsoredByOrg:       a.sponsoredByOrg    || fd.sponsoredByOrg    || null,
      sponsorName:          a.sponsorName       || fd.sponsorName       || null,
      sponsorDetails:       a.sponsorDetails    || fd.sponsorDetails    || null,
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/admissions/scholarships
// Query params:
//   ?status=PENDING|APPROVED|PARTIAL|DECLINED  (optional; omit for all)
// ──────────────────────────────────────────────────────────────────────────────
router.get('/', authenticate, admissionsAccess, async (req, res, next) => {
  try {
    const where = {};
    if (req.query.status) {
      const s = String(req.query.status).toUpperCase();
      if (!ALLOWED_STATUSES.has(s)) {
        return res.status(400).json({ error: `status must be one of: ${[...ALLOWED_STATUSES].join(', ')}` });
      }
      where.status = s;
    }
    const rows = await prisma.scholarshipApplication.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: {
        applicant: {
          select: {
            id: true,
            applicationNo: true,
            submittedAt: true,
            studyMode: true,
            studentType: true,
            formData: true,
            programme: { select: { name: true, code: true } },
          },
        },
      },
    });
    // Counts by status — for the filter-tab badges. One query for the whole
    // population (no status filter applied) so tabs show absolute counts.
    const counts = await prisma.scholarshipApplication.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const byStatus = { PENDING: 0, APPROVED: 0, PARTIAL: 0, DECLINED: 0 };
    for (const c of counts) {
      if (byStatus[c.status] !== undefined) byStatus[c.status] = c._count._all;
    }
    res.json({
      scholarships: rows.map(listShape),
      counts: { all: rows.length, byStatus },
    });
  } catch (err) { next(err); }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/admissions/scholarships/:id
// Full detail for the review modal — joined applicant + programme + decider.
// ──────────────────────────────────────────────────────────────────────────────
router.get('/:id', authenticate, admissionsAccess, async (req, res, next) => {
  try {
    const row = await prisma.scholarshipApplication.findUnique({
      where: { id: req.params.id },
      include: {
        applicant: {
          include: {
            programme: { select: { name: true, code: true } },
          },
        },
        decider: {
          // User itself has no firstName/lastName columns — names live on
          // the profile rows. deciderDisplay() canonicalizes the lookup.
          select: {
            id: true, email: true, userIdDisplay: true, role: true,
            studentProfile: { select: { firstName: true, lastName: true } },
            facultyProfile: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!row) return res.status(404).json({ error: 'Scholarship application not found' });
    res.json({ scholarship: detailShape(row) });
  } catch (err) { next(err); }
});

module.exports = router;
