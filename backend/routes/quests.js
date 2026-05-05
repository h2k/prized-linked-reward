/**
 * Quest routes – full CRUD (DynamoDB).
 *
 * GET    /api/quests          list (with optional filters/search/sort/paginate)
 * POST   /api/quests          create
 * GET    /api/quests/:id      get single
 * PUT    /api/quests/:id      update
 * DELETE /api/quests/:id      delete
 */
'use strict';

const router = require('express').Router();
const { v4: uuidv4 }  = require('uuid');
const { getDynamo, TABLES } = require('../db');
const authenticate    = require('../middleware/authenticate');

const VALID_CATEGORIES = ['casa', 'engagement', 'spending', 'risk', 'socialresponsibility'];
const VALID_STATUSES   = ['Draft', 'Scheduled', 'Live', 'Paused', 'Completed'];
const VALID_SEGMENTS   = ['Mass Retail', 'Salary Customers', 'Youth & Students', 'Affluent', 'Credit Card Holders', 'Dormant Customers'];

function validateQuest(body) {
  const errors = [];
  if (!body.title || !String(body.title).trim())                                                              errors.push('title is required.');
  if (!VALID_CATEGORIES.includes(body.category))                                                              errors.push(`category must be one of: ${VALID_CATEGORIES.join(', ')}.`);
  if (!VALID_STATUSES.includes(body.status))                                                                  errors.push(`status must be one of: ${VALID_STATUSES.join(', ')}.`);
  if (!body.start_date || !/^\d{4}-\d{2}-\d{2}$/.test(body.start_date))                                     errors.push('start_date must be YYYY-MM-DD.');
  if (!body.end_date   || !/^\d{4}-\d{2}-\d{2}$/.test(body.end_date))                                       errors.push('end_date must be YYYY-MM-DD.');
  if (body.start_date && body.end_date && body.start_date > body.end_date)                                   errors.push('start_date cannot be after end_date.');
  if (!VALID_SEGMENTS.includes(body.segment))                                                                 errors.push(`segment must be one of: ${VALID_SEGMENTS.join(', ')}.`);
  if (isNaN(Number(body.target))     || Number(body.target) < 0)                                             errors.push('target must be a non-negative number.');
  if (isNaN(Number(body.completion)) || Number(body.completion) < 0 || Number(body.completion) > 100)        errors.push('completion must be 0-100.');
  if (isNaN(Number(body.xp))      || Number(body.xp) < 0)                                                   errors.push('xp must be a non-negative number.');
  if (isNaN(Number(body.revenue)) || Number(body.revenue) < 0)                                               errors.push('revenue must be a non-negative number.');
  if (isNaN(Number(body.budget))  || Number(body.budget) < 0)                                                errors.push('budget must be a non-negative number.');
  if (!body.action || !String(body.action).trim())                                                            errors.push('action is required.');
  return errors;
}

const SORT_MAP = { title: 'title', category: 'category', start: 'start_date', status: 'status', revenue: 'revenue', completed: 'completion' };

// GET /api/quests
router.get('/', authenticate, async (req, res) => {
  const { search, category, status, sort = 'start_date', direction = 'asc', page = 1, limit = 200 } = req.query;

  try {
    const db = getDynamo();
    let items = await db.scan(TABLES.QUESTS);

    // Filter in JS
    if (search) {
      const term = search.toLowerCase();
      items = items.filter(q =>
        q.title?.toLowerCase().includes(term) ||
        q.action?.toLowerCase().includes(term) ||
        q.segment?.toLowerCase().includes(term)
      );
    }
    if (category && VALID_CATEGORIES.includes(category)) items = items.filter(q => q.category === category);
    if (status   && VALID_STATUSES.includes(status))     items = items.filter(q => q.status   === status);

    // Sort in JS
    const sortKey = SORT_MAP[sort] || 'start_date';
    items.sort((a, b) => {
      const va = a[sortKey] ?? '';
      const vb = b[sortKey] ?? '';
      const r  = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return direction === 'desc' ? -r : r;
    });

    // Paginate in JS
    const total    = items.length;
    const pageNum  = Math.max(1, Number(page));
    const pageSize = Math.max(1, Number(limit));
    const offset   = (pageNum - 1) * pageSize;
    res.json({ total, page: pageNum, limit: pageSize, data: items.slice(offset, offset + pageSize) });
  } catch {
    res.status(500).json({ error: 'Failed to retrieve quests.' });
  }
});

// GET /api/quests/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const quest = await getDynamo().get(TABLES.QUESTS, { id: req.params.id });
    if (!quest) return res.status(404).json({ error: 'Quest not found.' });
    res.json(quest);
  } catch {
    res.status(500).json({ error: 'Failed to retrieve quest.' });
  }
});

// POST /api/quests
router.post('/', authenticate, async (req, res) => {
  const errors = validateQuest(req.body);
  if (errors.length) return res.status(400).json({ errors });

  const { title, category, status, start_date, end_date, segment, target, completion, xp, revenue, budget, action } = req.body;
  const now  = new Date().toISOString();
  const item = {
    id: uuidv4(), title: title.trim(), category, status, start_date, end_date, segment,
    target: Number(target), completion: Number(completion), xp: Number(xp),
    revenue: Number(revenue), budget: Number(budget), action: action.trim(),
    created_by: req.user.sub, created_at: now, updated_at: now
  };
  try {
    const db = getDynamo();
    await db.put(TABLES.QUESTS, item);
    await db.put(TABLES.AUDIT_LOG, { id: uuidv4(), user_id: req.user.sub, action: 'CREATE', entity: 'quest', entity_id: item.id, detail: item.title, created_at: now });
    res.status(201).json(item);
  } catch {
    res.status(500).json({ error: 'Failed to create quest.' });
  }
});

// PUT /api/quests/:id
router.put('/:id', authenticate, async (req, res) => {
  const errors = validateQuest(req.body);
  if (errors.length) return res.status(400).json({ errors });

  const { title, category, status, start_date, end_date, segment, target, completion, xp, revenue, budget, action } = req.body;
  try {
    const db       = getDynamo();
    const existing = await db.get(TABLES.QUESTS, { id: req.params.id });
    if (!existing) return res.status(404).json({ error: 'Quest not found.' });

    const now     = new Date().toISOString();
    const updated = {
      ...existing,
      title: title.trim(), category, status, start_date, end_date, segment,
      target: Number(target), completion: Number(completion), xp: Number(xp),
      revenue: Number(revenue), budget: Number(budget), action: action.trim(),
      updated_at: now
    };
    await db.put(TABLES.QUESTS, updated);
    await db.put(TABLES.AUDIT_LOG, { id: uuidv4(), user_id: req.user.sub, action: 'UPDATE', entity: 'quest', entity_id: req.params.id, detail: title.trim(), created_at: now });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to update quest.' });
  }
});

// DELETE /api/quests/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const db       = getDynamo();
    const existing = await db.get(TABLES.QUESTS, { id: req.params.id });
    if (!existing) return res.status(404).json({ error: 'Quest not found.' });
    await db.delete(TABLES.QUESTS, { id: req.params.id });
    await db.put(TABLES.AUDIT_LOG, { id: uuidv4(), user_id: req.user.sub, action: 'DELETE', entity: 'quest', entity_id: req.params.id, detail: existing.title, created_at: new Date().toISOString() });
    res.json({ message: 'Quest deleted.' });
  } catch {
    res.status(500).json({ error: 'Failed to delete quest.' });
  }
});

module.exports = router;
