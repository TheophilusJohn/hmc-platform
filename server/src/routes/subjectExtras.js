const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { facultyOrAbove } = require('../middleware/rbac');
const minioService = require('../services/minio.service');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

async function canAccess(user, subjectId) {
  if (['FULL_ADMIN', 'TEACHER_ADMIN'].includes(user.role)) return true;
  if (user.role === 'FACULTY') {
    const subj = await prisma.subject.findUnique({ where: { id: subjectId }, select: { facultyId: true } });
    if (!subj) return false;
    const fp = await prisma.facultyProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
    return fp?.id === subj.facultyId;
  }
  if (user.role === 'STUDENT') {
    const sp = await prisma.studentProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
    const enr = await prisma.studentSubjectEnrollment.findFirst({ where: { studentId: sp?.id, subjectId } });
    return !!enr;
  }
  return false;
}

router.get('/:id/content', authenticate, async (req, res, next) => {
  try {
    if (!await canAccess(req.user, req.params.id)) return res.status(403).json({ error: 'Access denied' });
    const units = await prisma.courseUnit.findMany({
      where: { subjectId: req.params.id },
      include: { content: { orderBy: { orderIndex: 'asc' } } },
      orderBy: { orderIndex: 'asc' },
    });
    // Resolve every contentUrl in parallel instead of awaiting each one
    // sequentially — pre-fix this was N round-trips to MinIO per render.
    const flatRows = [];
    for (const u of units) {
      for (const c of u.content) {
        flatRows.push({ u, c });
      }
    }
    const fileUrls = await Promise.all(flatRows.map(({ c }) => minioService.getReadUrl(c.contentUrl)));
    const content = flatRows.map(({ u, c }, i) => ({
      id: c.id, unitId: u.id, week: u.orderIndex, unitTitle: u.title,
      title: c.title, type: c.type, description: c.description,
      fileUrl: fileUrls[i], url: fileUrls[i],
      deadline: c.deadline, visible: c.isPublished !== false,
      createdAt: c.createdAt,
    }));
    res.json({ content, units });
  } catch (err) { next(err); }
});

router.get('/:id/questions', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    if (!await canAccess(req.user, req.params.id)) return res.status(403).json({ error: 'Access denied' });
    const questions = await prisma.questionBankItem.findMany({
      where: { subjectId: req.params.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ questions });
  } catch (err) { next(err); }
});

router.post('/:id/questions', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    if (!await canAccess(req.user, req.params.id)) return res.status(403).json({ error: 'Access denied' });
    const fp = await prisma.facultyProfile.findUnique({ where: { userId: req.user.id } });
    const { question, type, options, answer, difficulty, explanation } = req.body;
    const item = await prisma.questionBankItem.create({
      data: {
        subjectId: req.params.id,
        facultyId: fp?.id || null,
        type: (type || 'MCQ').toUpperCase(),
        questionText: question,
        options: options || null,
        correctAnswer: typeof answer === 'string' ? answer : JSON.stringify(answer),
        // Schema declares difficulty as lowercase string (default 'medium',
        // valid values easy|medium|hard). Pre-fix the server up-cased the value
        // to 'MEDIUM' etc., which works at insert time but breaks any future
        // case-sensitive filter on lowercase.
        difficulty: String(difficulty || 'medium').toLowerCase(),
        explanation: explanation || null,
      },
    });
    res.status(201).json({ question: item });
  } catch (err) { next(err); }
});

router.delete('/:id/questions/:qid', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    if (!await canAccess(req.user, req.params.id)) return res.status(403).json({ error: 'Access denied' });
    await prisma.questionBankItem.delete({ where: { id: req.params.qid } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.get('/:id/gradebook', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    if (!await canAccess(req.user, req.params.id)) return res.status(403).json({ error: 'Access denied' });
    const subject = await prisma.subject.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, totalMarks: true, passMark: true, iaMarks: true, eseMarks: true },
    });
    const exams = await prisma.exam.findMany({
      where: { subjectId: req.params.id },
      select: { id: true, title: true, totalMarks: true },
      orderBy: { startDatetime: 'asc' },
    });
    const enrollments = await prisma.studentSubjectEnrollment.findMany({
      where: { subjectId: req.params.id },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, user: { select: { userIdDisplay: true } } } },
      },
    });

    // Submissions aren't a relation on StudentSubjectEnrollment — query them
    // separately and index by (examId, studentId).
    const examIds = exams.map(x => x.id);
    const studentIds = enrollments.map(e => e.student.id);
    const submissions = examIds.length && studentIds.length
      ? await prisma.submission.findMany({
          where: { examId: { in: examIds }, studentId: { in: studentIds } },
          select: { examId: true, studentId: true, marksObtained: true },
        })
      : [];
    const subMap = new Map();
    for (const s of submissions) {
      subMap.set(`${s.studentId}:${s.examId}`, s.marksObtained);
    }

    const studentRows = enrollments.map(e => {
      const marks = {};
      for (const x of exams) {
        const m = subMap.get(`${e.student.id}:${x.id}`);
        if (m !== undefined && m !== null) marks[x.id] = m;
      }
      const total = (e.iaMarks ?? 0) + (e.eseMarks ?? 0);
      const pct = subject.totalMarks > 0 ? (total / subject.totalMarks) * 100 : null;
      const isPub = ['PASS', 'FAIL'].includes(e.resultStatus);
      // If the subject is mis-configured with totalMarks=0, surface null
      // instead of forcing every student to 'D' (the bottom of the ladder).
      const grade = !isPub ? null
        : pct === null ? null
        : total < subject.passMark ? 'F'
        : pct >= 90 ? 'A+' : pct >= 80 ? 'A' : pct >= 70 ? 'B+' : pct >= 60 ? 'B' : pct >= 50 ? 'C' : 'D';
      return {
        id: e.student.id, firstName: e.student.firstName, lastName: e.student.lastName,
        userIdDisplay: e.student.user.userIdDisplay, marks, totalMarks: total, grade,
      };
    });
    res.json({ subject, exams: exams.map(e => ({ id: e.id, title: e.title, totalMarks: e.totalMarks, passmark: subject.passMark })), students: studentRows });
  } catch (err) { next(err); }
});

router.get('/:id/revaluation-requests', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    if (!await canAccess(req.user, req.params.id)) return res.status(403).json({ error: 'Access denied' });
    // Revaluation has no `subject` relation in schema, nor a `createdAt` field —
    // those are `subjectId` (string) + `requestedAt`. Resolve the subject manually.
    const subject = await prisma.subject.findUnique({
      where: { id: req.params.id },
      select: { name: true, totalMarks: true },
    });
    const requests = await prisma.revaluation.findMany({
      where: { subjectId: req.params.id, status: 'pending' },
      include: {
        student: { select: { firstName: true, lastName: true, user: { select: { userIdDisplay: true } } } },
      },
      orderBy: { requestedAt: 'desc' },
    });
    res.json({
      requests: requests.map(r => ({
        id: r.id, studentId: r.studentId,
        studentName: `${r.student.firstName} ${r.student.lastName}`,
        examTitle: subject?.name || '',
        // Revaluation schema field is `originalMarks` (not `currentMarks`) and
        // `notes` (not `reason`).
        currentMarks: r.originalMarks,
        newMarks: r.newMarks,
        totalMarks: subject?.totalMarks ?? null,
        reason: r.notes,
        status: r.status,
        requestedAt: r.requestedAt,
      })),
    });
  } catch (err) { next(err); }
});

router.get('/:id/enrolled-students', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    if (!await canAccess(req.user, req.params.id)) return res.status(403).json({ error: 'Access denied' });
    const enrollments = await prisma.studentSubjectEnrollment.findMany({
      where: { subjectId: req.params.id },
      include: {
        student: {
          select: {
            id: true, firstName: true, lastName: true,
            user: { select: { userIdDisplay: true } },
            attendance: { where: { subjectId: req.params.id }, select: { status: true } },
          },
        },
      },
      orderBy: { student: { firstName: 'asc' } },
    });
    res.json({
      students: enrollments.map(e => {
        const t = e.student.attendance.length;
        const p = e.student.attendance.filter(a => a.status === 'PRESENT').length;
        return {
          id: e.student.id, firstName: e.student.firstName, lastName: e.student.lastName,
          userIdDisplay: e.student.user.userIdDisplay,
          attendanceRate: t > 0 ? Math.round((p / t) * 100) : null,
        };
      }),
    });
  } catch (err) { next(err); }
});


// GET / — return subjects in {subjects: [...]} shape for frontend
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { search, semesterId, batchId, programmeId, mine } = req.query;
    const where = {};
    if (semesterId) where.semesterId = semesterId;
    if (batchId) where.batchId = batchId;
    if (programmeId) where.programmeId = programmeId;
    if (search) where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { code: { contains: search, mode: 'insensitive' } },
    ];
    // Faculty must only see their own subjects, regardless of `mine=true`.
    // When `mine=true` is requested by any role, also scope to caller's facultyId.
    if (req.user.role === 'FACULTY' || mine === 'true') {
      const fp = await prisma.facultyProfile.findFirst({ where: { userId: req.user.id }, select: { id: true } });
      if (!fp) return res.json({ subjects: [] });
      where.facultyId = fp.id;
    }
    const subjects = await prisma.subject.findMany({
      where,
      include: {
        programme: { select: { name: true, code: true } },
        batch: { select: { name: true } },
        semester: { select: { name: true } },
        faculty: { select: { firstName: true, lastName: true } },
      },
      orderBy: [{ code: 'asc' }],
    });
    const flat = subjects.map(s => ({
      ...s,
      batchName: s.batch?.name || '',
      programmeName: s.programme?.name || '',
      semesterName: s.semester?.name || '',
      facultyName: s.faculty ? `${s.faculty.firstName} ${s.faculty.lastName}`.trim() : null,
    }));
    res.json({ subjects: flat });
  } catch (err) { next(err); }
});

// POST / — intercept subject creation with enum normalization + totalMarks calc
const { adminOrTA } = require('../middleware/rbac');
router.post('/', authenticate, adminOrTA, async (req, res, next) => {
  try {
    const { programmeId: bodyProgrammeId, semesterId, batchId, facultyId, name, code, creditHours, type, eseMarks, iaMarks, passmark, passMark, examMode, status } = req.body;
    const missing = [];
    if (!name) missing.push('name');
    if (!code) missing.push('code');
    if (!semesterId) missing.push('semester');
    if (!batchId) missing.push('batch');
    if (missing.length > 0) {
      return res.status(400).json({ error: 'Required fields missing: ' + missing.join(', ') });
    }
    // Derive programmeId from batch if not provided
    let programmeId = bodyProgrammeId;
    if (!programmeId) {
      const batch = await prisma.batch.findUnique({ where: { id: batchId }, select: { programmeId: true } });
      programmeId = batch?.programmeId;
    }
    if (!programmeId) {
      return res.status(400).json({ error: 'Could not determine programme for this batch' });
    }
    const ese = parseInt(eseMarks ?? 70);
    const ia = parseInt(iaMarks ?? 30);
    const pm = parseInt(passMark ?? passmark ?? 40);
    const ch = parseInt(creditHours ?? 3);
    // Frontend sends User.id; Subject.facultyId expects FacultyProfile.id — resolve it
    let resolvedFacultyId = null;
    if (facultyId && String(facultyId).trim()) {
      const fp = await prisma.facultyProfile.findUnique({
        where: { userId: facultyId },
        select: { id: true },
      });
      resolvedFacultyId = fp?.id || null;
    }
    const subject = await prisma.subject.create({
      data: {
        name, code,
        creditHours: ch,
        programmeId, semesterId, batchId,
        facultyId: resolvedFacultyId,
        type: String(type || 'CORE').toUpperCase(),
        eseMarks: ese, iaMarks: ia,
        totalMarks: ese + ia,
        passMark: pm,
        examMode: String(examMode || 'OFFLINE').toUpperCase(),
        status: status || 'active',
      },
    });
    res.status(201).json({ subject });
  } catch (err) { next(err); }
});


// POST /api/subjects/:id/content - one-step content upload (matches CourseContent.jsx)
router.post('/:id/content', authenticate, facultyOrAbove, upload.single('file'), async (req, res, next) => {
  try {
    if (!await canAccess(req.user, req.params.id)) return res.status(403).json({ error: 'Access denied' });
    const { title, type, description, week, url, visibleFrom, deadline } = req.body;
    const subjectId = req.params.id;
    let contentUrl = url || null;
    if (req.file) {
      try {
        const filePath = `content/${subjectId}/${Date.now()}-${req.file.originalname}`;
        contentUrl = await minioService.uploadFile(req.file.buffer, process.env.MINIO_BUCKET || 'hmc-files', filePath, req.file.mimetype);
      } catch (e) {
        return res.status(400).json({ error: e.message });
      }
    }
    const weekNum = parseInt(week) || 1;
    let unit = await prisma.courseUnit.findFirst({ where: { subjectId, orderIndex: weekNum } });
    if (!unit) {
      unit = await prisma.courseUnit.create({
        data: { subjectId, title: `Week ${weekNum}`, orderIndex: weekNum, status: 'published' }
      });
    }
    const count = await prisma.unitContent.count({ where: { unitId: unit.id } });
    const isPublished = !visibleFrom || new Date(visibleFrom) <= new Date();
    const content = await prisma.unitContent.create({
      data: {
        unitId: unit.id,
        title: title || null,
        type: type || 'notes',
        description: description || null,
        contentUrl,
        deadline: deadline ? new Date(deadline) : null,
        isPublished,
        orderIndex: count + 1,
      },
    });
    res.status(201).json({ content });
  } catch (err) { console.error('subject content upload:', err); next(err); }
});

// DELETE /api/subjects/:id/content/:contentId
router.delete('/:id/content/:contentId', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    if (!await canAccess(req.user, req.params.id)) return res.status(403).json({ error: 'Access denied' });
    await prisma.unitContent.delete({ where: { id: req.params.contentId } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
