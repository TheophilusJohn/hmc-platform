// server/src/routes/content.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { facultyOrAbove } = require('../middleware/rbac');
const minioService = require('../services/minio.service');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.get('/subjects/:id/units', authenticate, async (req, res, next) => {
  try {
    const units = await prisma.courseUnit.findMany({
      where: {
        subjectId: req.params.id,
        ...(req.user.role === 'STUDENT' ? { status: 'published' } : {}),
      },
      include: { content: { orderBy: { orderIndex: 'asc' } } },
      orderBy: { orderIndex: 'asc' },
    });
    res.json(units);
  } catch (err) { next(err); }
});

router.post('/subjects/:id/units', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const count = await prisma.courseUnit.count({ where: { subjectId: req.params.id } });
    const unit = await prisma.courseUnit.create({
      data: {
        subjectId: req.params.id,
        title: req.body.title,
        orderIndex: req.body.orderIndex ?? count + 1,
        status: 'draft',
      },
    });
    res.status(201).json(unit);
  } catch (err) { next(err); }
});

router.put('/units/:id', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const unit = await prisma.courseUnit.update({ where: { id: req.params.id }, data: req.body });
    res.json(unit);
  } catch (err) { next(err); }
});

router.delete('/units/:id', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    await prisma.unitContent.deleteMany({ where: { unitId: req.params.id } });
    await prisma.courseUnit.delete({ where: { id: req.params.id } });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

router.post('/units/:id/content', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const count = await prisma.unitContent.count({ where: { unitId: req.params.id } });
    const content = await prisma.unitContent.create({
      data: {
        unitId: req.params.id,
        type: req.body.type,
        contentUrl: req.body.contentUrl,
        contentText: req.body.contentText,
        orderIndex: req.body.orderIndex ?? count + 1,
      },
    });
    res.status(201).json(content);
  } catch (err) { next(err); }
});

router.put('/content/:id', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const content = await prisma.unitContent.update({ where: { id: req.params.id }, data: req.body });
    res.json(content);
  } catch (err) { next(err); }
});

router.delete('/content/:id', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    await prisma.unitContent.delete({ where: { id: req.params.id } });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

router.post('/units/:id/publish', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const unit = await prisma.courseUnit.update({ where: { id: req.params.id }, data: { status: 'published' } });
    res.json(unit);
  } catch (err) { next(err); }
});

router.post('/units/:id/draft', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const unit = await prisma.courseUnit.update({ where: { id: req.params.id }, data: { status: 'draft' } });
    res.json(unit);
  } catch (err) { next(err); }
});

router.post('/content/upload', authenticate, facultyOrAbove, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });
    const path = `content/${Date.now()}-${req.file.originalname}`;
    const url = await minioService.uploadFile(req.file.buffer, process.env.MINIO_BUCKET || 'hmc-files', path, req.file.mimetype);
    res.json({ url, filename: req.file.originalname, size: req.file.size, mimetype: req.file.mimetype });
  } catch (err) { next(err); }
});


// POST /api/subjects/:id/content - one-step content upload (frontend CourseContent.jsx)
router.post('/subjects/:id/content', authenticate, facultyOrAbove, upload.single('file'), async (req, res, next) => {
  try {
    const { title, type, description, week, url, visibleFrom, deadline } = req.body;
    const subjectId = req.params.id;
    let contentUrl = url || null;
    if (req.file) {
      const filePath = `content/${subjectId}/${Date.now()}-${req.file.originalname}`;
      contentUrl = await minioService.uploadFile(req.file.buffer, process.env.MINIO_BUCKET || 'hmc-files', filePath, req.file.mimetype);
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
  } catch (err) { console.error('content upload error:', err); next(err); }
});

module.exports = router;
