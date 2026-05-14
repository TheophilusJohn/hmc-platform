// server/src/routes/directMessages.js
// STUB — the DirectMessage Prisma model is not in schema.prisma, so every
// route in this file throws a `prisma.directMessage is undefined` error at
// runtime. Disabled until the schema is added (see audit-fresh.md §4 Critical).
// Original implementation lives in git history (commit before this stub).
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

// Empty inbox so the FE renders nothing instead of erroring.
router.get('/inbox', authenticate, (_req, res) => res.json({ messages: [], unread: 0 }));
router.get('/sent', authenticate, (_req, res) => res.json({ messages: [] }));

router.all('*', authenticate, (_req, res) => {
  res.status(501).json({ error: 'Direct messages feature not yet enabled. Pending schema migration.' });
});

module.exports = router;
