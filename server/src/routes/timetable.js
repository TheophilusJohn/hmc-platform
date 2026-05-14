// server/src/routes/timetable.js
// STUB — the TimetableSlot Prisma model is not in schema.prisma, so every
// route in this file throws a `prisma.timetableSlot is undefined` error at
// runtime. Disabled until the schema is added (see audit-fresh.md §4 Critical).
// Original implementation lives in git history (commit before this stub).
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

// Return an empty list so the FE Timetable page renders an empty grid instead
// of erroring on parse. Other methods 501.
router.get('/my', authenticate, (_req, res) => res.json({ slots: [] }));
router.get('/', authenticate, (_req, res) => res.json({ slots: [] }));

router.all('*', authenticate, (_req, res) => {
  res.status(501).json({ error: 'Timetable feature not yet enabled. Pending schema migration.' });
});

module.exports = router;
