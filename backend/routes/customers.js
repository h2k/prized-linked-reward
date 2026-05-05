/**
 * Customer ranking routes (DynamoDB).
 *
 * GET /api/customers  – list with optional filters
 */
'use strict';

const router       = require('express').Router();
const { getDynamo, TABLES } = require('../db');
const authenticate = require('../middleware/authenticate');

const VALID_TIERS    = ['Diamond', 'Platinum', 'Gold', 'Silver'];
const VALID_SEGMENTS = ['Mass Retail', 'Salary Customers', 'Youth & Students', 'Affluent', 'Credit Card Holders', 'Dormant Customers'];
const SORT_MAP = { name: 'name', segment: 'segment', quests: 'quests_done', xp: 'xp', completion: 'completion', impact: 'impact', tier: 'tier' };

router.get('/', authenticate, async (req, res) => {
  const { search, segment, tier, sort = 'xp', direction = 'desc' } = req.query;

  try {
    const db  = getDynamo();
    let items = await db.scan(TABLES.CUSTOMERS);

    // Filter in JS
    if (search) {
      const term = search.toLowerCase();
      items = items.filter(c =>
        c.name?.toLowerCase().includes(term) ||
        c.segment?.toLowerCase().includes(term)
      );
    }
    if (segment && VALID_SEGMENTS.includes(segment)) items = items.filter(c => c.segment === segment);
    if (tier    && VALID_TIERS.includes(tier))       items = items.filter(c => c.tier    === tier);

    // Sort in JS
    const sortKey = SORT_MAP[sort] || 'xp';
    items.sort((a, b) => {
      const va = a[sortKey] ?? 0;
      const vb = b[sortKey] ?? 0;
      const r  = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return direction === 'asc' ? r : -r;
    });

    res.json({ data: items.map((c, i) => ({ ...c, rank: i + 1 })) });
  } catch {
    res.status(500).json({ error: 'Failed to retrieve customers.' });
  }
});

module.exports = router;
