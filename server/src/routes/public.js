// server/src/routes/public.js
// Unauthenticated read-only endpoints for the public marketing surface
// (Apply page, etc.). Mount BEFORE any router that applies `authenticate`.
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');

// GET /api/public/programmes?type=domestic|international
//
// Shape the response for the public /apply page:
// - returns id, code, name, durationYears, totalCost, applicationFee, medium, modes
// - international: hide CTH entirely and serve online-only mode list (international
//   students never do offline)
// - domestic: all active programmes, modes intact
// - null totalCost/applicationFee passed through as null so the FE can render
//   "TBD — contact admissions" rather than crash
router.get('/programmes', async (req, res, next) => {
  try {
    const type = String(req.query.type || 'domestic').toLowerCase() === 'international'
      ? 'international'
      : 'domestic';

    const where = { status: 'active' };
    if (type === 'international') {
      where.code = { not: 'CTH' };
    }

    const rows = await prisma.programme.findMany({
      where,
      select: {
        id: true,
        code: true,
        name: true,
        durationYears: true,
        medium: true,
        availableOffline: true,
        availableOnline: true,
        totalCostDomestic: true,
        totalCostInternational: true,
        applicationFeeDomestic: true,
        applicationFeeInternational: true,
      },
      orderBy: { name: 'asc' },
    });

    const programmes = rows.map(p => {
      // Convert Decimal → plain string so the response carries exact precision
      // without leaking Prisma internals to the public payload.
      const cost = type === 'international' ? p.totalCostInternational : p.totalCostDomestic;
      const fee = type === 'international' ? p.applicationFeeInternational : p.applicationFeeDomestic;

      // Modes: international gets online-only (campus is in India). Domestic
      // gets whatever the programme is configured for.
      const modes = [];
      if (type === 'international') {
        if (p.availableOnline) modes.push('online');
      } else {
        if (p.availableOffline) modes.push('offline');
        if (p.availableOnline) modes.push('online');
      }

      return {
        id: p.id,
        code: p.code,
        name: p.name,
        durationYears: p.durationYears,
        medium: p.medium,
        modes,
        totalCost: cost != null ? cost.toString() : null,
        applicationFee: fee != null ? fee.toString() : null,
        currency: type === 'international' ? 'USD' : 'INR',
      };
    });

    res.json({ type, programmes });
  } catch (err) { next(err); }
});

module.exports = router;
