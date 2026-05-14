// server/src/routes/exceptions.js
// STUB — the AcademicException Prisma model is not in schema.prisma, so every
// route in this file throws a `prisma.academicException is undefined` error at
// runtime. Disabled until the schema is added (see audit-fresh.md §4 Critical).
// Original implementation lives in git history (commit before this stub).
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

router.all('*', authenticate, (_req, res) => {
  res.status(501).json({ error: 'Academic exceptions feature not yet enabled. Pending schema migration.' });
});

module.exports = router;
