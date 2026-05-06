/**
 * Loyalty Engine routes (DynamoDB).
 *
 * GET  /api/loyalty/summary         – engine overview KPIs + tier breakdown
 * GET  /api/loyalty/rewards         – list all rewards
 * POST /api/loyalty/rewards         – create reward
 * PUT  /api/loyalty/rewards/:id     – update reward
 * DEL  /api/loyalty/rewards/:id     – delete reward
 * GET  /api/loyalty/tiers           – tier config
 * PUT  /api/loyalty/tiers/:tier     – update tier thresholds/benefits
 * GET  /api/loyalty/badges          – list all badges (with award counts)
 * POST /api/loyalty/badges          – create badge
 * DEL  /api/loyalty/badges/:id      – delete badge (+ its awards)
 */
'use strict';

const router       = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { getDynamo, TABLES } = require('../db');
const authenticate = require('../middleware/authenticate');

const VALID_REWARD_TYPES    = ['Cashback', 'Free Transaction', 'Travel Miles', 'Gift Voucher', 'Rate Discount', 'Prize Draw'];
const VALID_REWARD_STATUSES = ['Active', 'Inactive', 'Expired'];
const VALID_TIERS           = ['Silver', 'Gold', 'Platinum', 'Diamond'];

// ── Summary ───────────────────────────────────────────────────────────────────
router.get('/summary', authenticate, async (_req, res) => {
  try {
    const db = getDynamo();
    const [customers, rewards, badges, customerBadges, tierConfig] = await Promise.all([
      db.scan(TABLES.CUSTOMERS),
      db.scan(TABLES.REWARDS),
      db.scan(TABLES.BADGES),
      db.scan(TABLES.CUSTOMER_BADGES),
      db.scan(TABLES.TIER_CONFIG)
    ]);

    const totalEnrolled = customers.length;
    const avgXp = totalEnrolled
      ? Math.round(customers.reduce((s, c) => s + (c.xp || 0), 0) / totalEnrolled)
      : 0;
    const activeRewards = rewards.filter(r => r.status === 'Active').length;

    const sortedTiers = tierConfig.slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const tierBreakdown = sortedTiers.map(tc => {
      const count = customers.filter(c => c.tier === tc.tier).length;
      return { ...tc, count, percentage: totalEnrolled ? Math.round(count / totalEnrolled * 100) : 0 };
    });

    res.json({ totalEnrolled, avgXp, activeRewards, totalBadges: badges.length, totalBadgesAwarded: customerBadges.length, tierBreakdown });
  } catch {
    res.status(500).json({ error: 'Failed to fetch loyalty summary.' });
  }
});

// ── Rewards ───────────────────────────────────────────────────────────────────
router.get('/rewards', authenticate, async (_req, res) => {
  try {
    const items = await getDynamo().scan(TABLES.REWARDS);
    items.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    res.json({ data: items });
  } catch {
    res.status(500).json({ error: 'Failed to retrieve rewards.' });
  }
});

function validateReward(body) {
  const errors = [];
  if (!body.name || !String(body.name).trim())               errors.push('name is required.');
  if (!VALID_REWARD_TYPES.includes(body.type))               errors.push(`type must be one of: ${VALID_REWARD_TYPES.join(', ')}.`);
  if (isNaN(Number(body.value))   || Number(body.value) < 0) errors.push('value must be a non-negative number.');
  if (isNaN(Number(body.xp_cost)) || Number(body.xp_cost) < 0) errors.push('xp_cost must be a non-negative number.');
  return errors;
}

router.post('/rewards', authenticate, async (req, res) => {
  const errors = validateReward(req.body || {});
  if (errors.length) return res.status(400).json({ errors });

  const { name, description, type, value, xp_cost, stock, status } = req.body;
  const item = {
    id: uuidv4(),
    name: name.trim(),
    description: description || '',
    type,
    value:   Number(value),
    xp_cost: Number(xp_cost),
    stock:   isNaN(Number(stock)) ? -1 : Number(stock),
    status:  VALID_REWARD_STATUSES.includes(status) ? status : 'Active',
    created_at: new Date().toISOString()
  };
  try {
    await getDynamo().put(TABLES.REWARDS, item);
    res.status(201).json(item);
  } catch {
    res.status(500).json({ error: 'Failed to create reward.' });
  }
});

router.put('/rewards/:id', authenticate, async (req, res) => {
  const errors = validateReward(req.body || {});
  if (errors.length) return res.status(400).json({ errors });

  const { name, description, type, value, xp_cost, stock, status } = req.body;
  try {
    const db       = getDynamo();
    const existing = await db.get(TABLES.REWARDS, { id: req.params.id });
    if (!existing) return res.status(404).json({ error: 'Reward not found.' });

    const updated = {
      ...existing,
      name: name.trim(),
      description: description || '',
      type,
      value:   Number(value),
      xp_cost: Number(xp_cost),
      stock:   isNaN(Number(stock)) ? -1 : Number(stock),
      status:  VALID_REWARD_STATUSES.includes(status) ? status : 'Active'
    };
    await db.put(TABLES.REWARDS, updated);
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to update reward.' });
  }
});

router.delete('/rewards/:id', authenticate, async (req, res) => {
  try {
    const db = getDynamo();
    if (!await db.get(TABLES.REWARDS, { id: req.params.id }))
      return res.status(404).json({ error: 'Reward not found.' });
    await db.delete(TABLES.REWARDS, { id: req.params.id });
    res.json({ message: 'Reward deleted.' });
  } catch {
    res.status(500).json({ error: 'Failed to delete reward.' });
  }
});

// ── Tiers ─────────────────────────────────────────────────────────────────────
router.get('/tiers', authenticate, async (_req, res) => {
  try {
    const items = await getDynamo().scan(TABLES.TIER_CONFIG);
    items.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    res.json({ data: items });
  } catch {
    res.status(500).json({ error: 'Failed to retrieve tier config.' });
  }
});

router.put('/tiers/:tier', authenticate, async (req, res) => {
  const { tier } = req.params;
  if (!VALID_TIERS.includes(tier)) return res.status(400).json({ error: 'Invalid tier name.' });

  const { xp_min, xp_max, benefits } = req.body || {};
  if (isNaN(Number(xp_min)) || isNaN(Number(xp_max)))
    return res.status(400).json({ error: 'xp_min and xp_max must be numbers.' });
  if (Number(xp_min) > Number(xp_max))
    return res.status(400).json({ error: 'xp_min cannot exceed xp_max.' });

  try {
    const db       = getDynamo();
    const existing = await db.get(TABLES.TIER_CONFIG, { tier });
    if (!existing) return res.status(404).json({ error: 'Tier not found.' });

    const updated = { ...existing, xp_min: Number(xp_min), xp_max: Number(xp_max), benefits: benefits || '' };
    await db.put(TABLES.TIER_CONFIG, updated);
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to update tier config.' });
  }
});

// ── Badges ────────────────────────────────────────────────────────────────────
router.get('/badges', authenticate, async (_req, res) => {
  try {
    const db           = getDynamo();
    const [badges, customerBadges] = await Promise.all([
      db.scan(TABLES.BADGES),
      db.scan(TABLES.CUSTOMER_BADGES)
    ]);

    // Count award_count per badge in JS
    const awardCounts = {};
    for (const cb of customerBadges) {
      awardCounts[cb.badge_id] = (awardCounts[cb.badge_id] || 0) + 1;
    }

    badges.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
    res.json({ data: badges.map(b => ({ ...b, award_count: awardCounts[b.id] || 0 })) });
  } catch {
    res.status(500).json({ error: 'Failed to retrieve badges.' });
  }
});

router.post('/badges', authenticate, async (req, res) => {
  const { name, description, icon, criteria, xp_bonus } = req.body || {};
  if (!name || !String(name).trim())
    return res.status(400).json({ errors: ['name is required.'] });

  const item = {
    id: uuidv4(),
    name: name.trim(),
    description: description || '',
    icon: icon || 'fa-medal',
    criteria: criteria || '',
    xp_bonus: Number(xp_bonus) || 0,
    created_at: new Date().toISOString()
  };
  try {
    await getDynamo().put(TABLES.BADGES, item);
    res.status(201).json({ ...item, award_count: 0 });
  } catch {
    res.status(500).json({ error: 'Failed to create badge.' });
  }
});

router.delete('/badges/:id', authenticate, async (req, res) => {
  try {
    const db = getDynamo();
    if (!await db.get(TABLES.BADGES, { id: req.params.id }))
      return res.status(404).json({ error: 'Badge not found.' });

    // Remove all customer_badge entries for this badge, then delete the badge
    const allCB    = await db.scan(TABLES.CUSTOMER_BADGES);
    const forBadge = allCB.filter(cb => cb.badge_id === req.params.id);
    await Promise.all(forBadge.map(cb => db.delete(TABLES.CUSTOMER_BADGES, { customer_id: cb.customer_id, badge_id: cb.badge_id })));

    await db.delete(TABLES.BADGES, { id: req.params.id });
    res.json({ message: 'Badge deleted.' });
  } catch {
    res.status(500).json({ error: 'Failed to delete badge.' });
  }
});

// ── Achievement Engine ────────────────────────────────────────────────────────

/**
 * Evaluate a single badge rule against a customer record.
 *
 * Rule schema:  { field: string, op: 'gte'|'lte'|'eq'|'in', value: any }
 *
 * Supported fields (customer columns):
 *   quests_done  – total quests completed
 *   xp           – total experience points
 *   completion   – average completion % (0-100)
 *   tier         – loyalty tier string
 *
 * Supported ops:
 *   gte  – customer[field] >= value
 *   lte  – customer[field] <= value
 *   eq   – customer[field] === value
 *   in   – value array includes customer[field]
 */
function evaluateRule(rule, customer) {
  if (!rule || !rule.field || !rule.op) return false;
  const actual = customer[rule.field];
  if (actual === undefined || actual === null) return false;
  switch (rule.op) {
    case 'gte': return actual >= rule.value;
    case 'lte': return actual <= rule.value;
    case 'eq':  return actual === rule.value;
    case 'in':  return Array.isArray(rule.value) && rule.value.includes(actual);
    default:    return false;
  }
}

/**
 * POST /api/loyalty/achievements/evaluate
 *
 * Scans all customers and all badges. For each customer × badge pair not yet
 * awarded, evaluates the badge rule. Awards matching badges and returns a
 * summary: { evaluated, newAwards, details[] }
 *
 * Optional body: { customer_id: "..." } to limit evaluation to one customer.
 */
router.post('/achievements/evaluate', authenticate, async (req, res) => {
  try {
    const db = getDynamo();
    const [badges, existingAwards] = await Promise.all([
      db.scan(TABLES.BADGES),
      db.scan(TABLES.CUSTOMER_BADGES)
    ]);

    // Only evaluate badges that have a rule
    const ruleableBadges = badges.filter(b => b.rule);
    if (!ruleableBadges.length) {
      return res.json({ evaluated: 0, newAwards: 0, details: [], message: 'No badges with rules defined.' });
    }

    // Build a Set of already-awarded pairs for O(1) lookup
    const awarded = new Set(existingAwards.map(a => `${a.customer_id}:${a.badge_id}`));

    // Fetch customers (optionally filtered to one)
    let customers = await db.scan(TABLES.CUSTOMERS);
    const { customer_id } = req.body || {};
    if (customer_id) customers = customers.filter(c => c.id === customer_id);

    const newAwards  = [];
    const now        = new Date().toISOString();

    for (const customer of customers) {
      for (const badge of ruleableBadges) {
        const key = `${customer.id}:${badge.id}`;
        if (awarded.has(key)) continue;                       // already earned
        if (!evaluateRule(badge.rule, customer)) continue;   // does not qualify

        await db.put(TABLES.CUSTOMER_BADGES, {
          customer_id: customer.id,
          badge_id:    badge.id,
          awarded_at:  now
        });
        awarded.add(key);
        newAwards.push({ customer_id: customer.id, customer_name: customer.name, badge_id: badge.id, badge_name: badge.name });
      }
    }

    res.json({
      evaluated:  customers.length,
      newAwards:  newAwards.length,
      details:    newAwards
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to evaluate achievements.' });
  }
});

/**
 * GET /api/customers/:id/achievements
 *
 * Returns all badges split into earned (with awarded_at) and locked (with
 * progress info showing how close the customer is to unlocking).
 */
router.get('/achievements/:customer_id', authenticate, async (req, res) => {
  try {
    const db       = getDynamo();
    const customer = await db.get(TABLES.CUSTOMERS, { id: req.params.customer_id });
    if (!customer) return res.status(404).json({ error: 'Customer not found.' });

    const [badges, customerBadges] = await Promise.all([
      db.scan(TABLES.BADGES),
      db.scan(TABLES.CUSTOMER_BADGES)
    ]);

    const earnedSet = new Map(
      customerBadges
        .filter(cb => cb.customer_id === req.params.customer_id)
        .map(cb => [cb.badge_id, cb])
    );

    const earned = [];
    const locked = [];

    for (const badge of badges) {
      const award = earnedSet.get(badge.id);
      if (award) {
        earned.push({ ...badge, awarded_at: award.awarded_at });
      } else {
        // Calculate progress toward the rule (for display)
        const progress = badge.rule ? computeProgress(badge.rule, customer) : null;
        locked.push({ ...badge, progress });
      }
    }

    res.json({ customer: { id: customer.id, name: customer.name, xp: customer.xp, tier: customer.tier, quests_done: customer.quests_done, completion: customer.completion }, earned, locked });
  } catch {
    res.status(500).json({ error: 'Failed to fetch achievements.' });
  }
});

/**
 * Compute a 0-100 progress percentage toward a badge rule.
 * Returns null if the rule type doesn't support progress.
 */
function computeProgress(rule, customer) {
  const actual = customer[rule.field];
  if (actual === undefined || actual === null) return { pct: 0, current: 0, target: rule.value };
  switch (rule.op) {
    case 'gte':
      return { pct: Math.min(100, Math.round((actual / rule.value) * 100)), current: actual, target: rule.value };
    case 'lte':
      return { pct: actual <= rule.value ? 100 : 0, current: actual, target: rule.value };
    case 'eq':
      return { pct: actual === rule.value ? 100 : 0, current: actual, target: rule.value };
    case 'in':
      return { pct: Array.isArray(rule.value) && rule.value.includes(actual) ? 100 : 0, current: actual, target: rule.value };
    default:
      return null;
  }
}

module.exports = router;
