const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authenticate } = require('../middleware/auth');
const { facultyOrAbove } = require('../middleware/rbac');
const minioService = require('../services/minio.service');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// GET /api/subjects/:id/units
router.get('/subjects/:id/units', authenticate, async (req, res, next) => {
  try {
    const units = await prisma.courseUnit.findMany({
      where: {
        subject_id: req.params.id,
        ...(req.user.role === 'student' ? { status: 'published' } : {}),
      },
      include: {
        content: { orderBy: { order_index: 'asc' } },
      },
      orderBy: { order_index: 'asc' },
    });
    res.json(units);
  } catch (err) { next(err); }
});

// POST /api/subjects/:id/units
router.post('/subjects/:id/units', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const count = await prisma.courseUnit.count({ where: { subject_id: req.params.id } });
    const unit = await prisma.courseUnit.create({
      data: { subject_id: req.params.id, title: req.body.title, order_index: req.body.order_index ?? count + 1, status: 'draft' },
    });
    res.status(201).json(unit);
  } catch (err) { next(err); }
});

// PUT /api/units/:id
router.put('/units/:id', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const unit = await prisma.courseUnit.update({ where: { id: req.params.id }, data: req.body });
    res.json(unit);
  } catch (err) { next(err); }
});

// DELETE /api/units/:id
router.delete('/units/:id', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    await prisma.unitContent.deleteMany({ where: { unit_id: req.params.id } });
    await prisma.courseUnit.delete({ where: { id: req.params.id } });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

// POST /api/units/:id/content
router.post('/units/:id/content', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const count = await prisma.unitContent.count({ where: { unit_id: req.params.id } });
    const content = await prisma.unitContent.create({
      data: { unit_id: req.params.id, ...req.body, order_index: req.body.order_index ?? count + 1 },
    });
    res.status(201).json(content);
  } catch (err) { next(err); }
});

// PUT /api/content/:id
router.put('/content/:id', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const content = await prisma.unitContent.update({ where: { id: req.params.id }, data: req.body });
    res.json(content);
  } catch (err) { next(err); }
});

// DELETE /api/content/:id
router.delete('/content/:id', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    await prisma.unitContent.delete({ where: { id: req.params.id } });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

// POST /api/units/:id/publish
router.post('/units/:id/publish', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const unit = await prisma.courseUnit.update({ where: { id: req.params.id }, data: { status: 'published' } });
    res.json(unit);
  } catch (err) { next(err); }
});

// POST /api/units/:id/draft
router.post('/units/:id/draft', authenticate, facultyOrAbove, async (req, res, next) => {
  try {
    const unit = await prisma.courseUnit.update({ where: { id: req.params.id }, data: { status: 'draft' } });
    res.json(unit);
  } catch (err) { next(err); }
});

// POST /api/content/upload
router.post('/content/upload', authenticate, facultyOrAbove, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });
    const path = `content/${Date.now()}-${req.file.originalname}`;
    const url = await minioService.uploadFile(req.file.buffer, process.env.MINIO_BUCKET || 'hmc-files', path, req.file.mimetype);
    res.json({ url, filename: req.file.originalname, size: req.file.size, mimetype: req.file.mimetype });
  } catch (err) { next(err); }
});

module.exports = router;
