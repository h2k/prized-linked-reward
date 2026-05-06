/**
 * Analytics routes – KPIs and chart data derived from quest data.
 *
 * GET /api/analytics/kpis    – top-level dashboard KPIs
 * GET /api/analytics/charts  – data for all 4 charts
 */
'use strict';

const router       = require('express').Router();
const { getDynamo, TABLES } = require('../db');
const authenticate = require('../middleware/authenticate');

const CATEGORIES = {
  casa:               { label: 'Improve CASA',                    short: 'CASA'   },
  engagement:         { label: 'Increase Engagement',             short: 'ENGAGE' },
  spending:           { label: 'Encourage Spending',              short: 'SPEND'  },
  risk:               { label: 'Risk Reduction and Good Behavior', short: 'RISK'  },
  socialresponsibility:{ label: 'Social Responsibility',          short: 'SOCIAL' }
};

// GET /api/analytics/kpis
router.get('/kpis', authenticate, async (_req, res) => {
  try {
  const quests = await getDynamo().scan(TABLES.QUESTS);

  const active    = quests.filter(q => ['Live', 'Scheduled'].includes(q.status)).length;
  const target    = quests.reduce((s, q) => s + q.target, 0);
  const completed = quests.reduce((s, q) => s + q.target * q.completion / 100, 0);
  const revenue   = quests.reduce((s, q) => s + q.revenue, 0);
  const budget    = quests.reduce((s, q) => s + q.budget, 0);
  const roi       = budget ? ((revenue - budget) / budget) * 100 : 0;
  const completion = target ? (completed / target) * 100 : 0;

  // Category summary
  const categoryStats = Object.keys(CATEGORIES).map(key => {
    const list = quests.filter(q => q.category === key);
    const catRevenue = list.reduce((s, q) => s + q.revenue, 0);
    const catBudget  = list.reduce((s, q) => s + q.budget, 0);
    const catCompleted = list.reduce((s, q) => s + q.target * q.completion / 100, 0);
    return {
      key,
      label: CATEGORIES[key].label,
      short: CATEGORIES[key].short,
      count: list.length,
      completed: Math.round(catCompleted),
      revenue: catRevenue,
      budget: catBudget,
      roi: catBudget ? ((catRevenue - catBudget) / catBudget) * 100 : 0
    };
  });

  res.json({ active, total: quests.length, completed: Math.round(completed), target, revenue, budget, roi, completion, categoryStats });
  } catch { res.status(500).json({ error: 'Failed to compute KPIs.' }); }
});

// GET /api/analytics/charts
router.get('/charts', authenticate, async (_req, res) => {
  try {
  const quests = await getDynamo().scan(TABLES.QUESTS);

  // Revenue & engagement by month
  const monthly = {};
  quests.forEach(q => {
    const key = new Date(`${q.start_date}T00:00:00`).toLocaleString('en-US', { month: 'short', year: '2-digit' });
    if (!monthly[key]) monthly[key] = { revenue: 0, engagement: 0 };
    monthly[key].revenue   += q.revenue;
    monthly[key].engagement += q.target * q.completion / 100;
  });

  const forecastLabels = Object.keys(monthly);
  const forecastRevenue = forecastLabels.map(k => Math.round(monthly[k].revenue));
  const forecastEngagement = forecastLabels.map(k => Math.round(monthly[k].engagement));

  // Quest mix by category
  const mixLabels = [];
  const mixCounts = [];
  for (const key of Object.keys(CATEGORIES)) {
    mixLabels.push(CATEGORIES[key].label);
    mixCounts.push(quests.filter(q => q.category === key).length);
  }

  // Funnel
  const totalTarget    = quests.reduce((s, q) => s + q.target, 0);
  const totalCompleted = quests.reduce((s, q) => s + q.target * q.completion / 100, 0);
  const avgCompletion  = quests.length ? quests.reduce((s, q) => s + q.completion, 0) / quests.length : 0;
  const participating  = avgCompletion ? totalCompleted / (avgCompletion / 100) : 0;

  // Scorecard – avg completion per category
  const scorecardLabels = Object.values(CATEGORIES).map(c => c.short);
  const scorecardData = Object.keys(CATEGORIES).map(key => {
    const list = quests.filter(q => q.category === key);
    return list.length ? Math.round(list.reduce((s, q) => s + q.completion, 0) / list.length) : 0;
  });

  res.json({
    forecast: { labels: forecastLabels, revenue: forecastRevenue, engagement: forecastEngagement.map(Math.round) },
    mix:      { labels: mixLabels, counts: mixCounts },
    funnel:   { targeted: Math.round(totalTarget), participating: Math.round(participating), completed: Math.round(totalCompleted) },
    scorecard:{ labels: scorecardLabels, data: scorecardData }
  });
  } catch { res.status(500).json({ error: 'Failed to compute chart data.' }); }
});

// GET /api/analytics/transaction-success
// Maps transaction-related quests (spending + casa categories) to customer data
// and calculates success rates per quest, per segment, and top performers.
router.get('/transaction-success', authenticate, async (_req, res) => {
  try {
    const TRANSACTION_CATS = ['spending', 'casa'];

    const [quests, customers] = await Promise.all([
      getDynamo().scan(TABLES.QUESTS),
      getDynamo().scan(TABLES.CUSTOMERS)
    ]);

    const txQuests = quests.filter(q => TRANSACTION_CATS.includes(q.category));

    if (!txQuests.length) {
      return res.json({ summary: { totalTransactionQuests: 0, avgSuccessRate: 0, totalParticipants: 0, totalTarget: 0 }, byQuest: [], bySegment: [], topCustomers: [] });
    }

    // ── Per-quest breakdown ─────────────────────────────────────────────────
    const byQuest = txQuests.map(q => ({
      id:          q.id,
      title:       q.title,
      category:    q.category,
      segment:     q.segment,
      status:      q.status,
      completion:  q.completion,               // % from quest record
      target:      q.target,
      participants: Math.round(q.target * q.completion / 100),
      revenue:     q.revenue
    })).sort((a, b) => b.completion - a.completion);

    // ── Per-segment breakdown ───────────────────────────────────────────────
    // Group transaction quests by segment; find matching customers.
    const segmentMap = {};
    txQuests.forEach(q => {
      if (!segmentMap[q.segment]) segmentMap[q.segment] = { quests: [], customers: [] };
      segmentMap[q.segment].quests.push(q);
    });
    customers.forEach(c => {
      if (segmentMap[c.segment]) segmentMap[c.segment].customers.push(c);
    });

    const bySegment = Object.entries(segmentMap).map(([segment, data]) => {
      const questAvgCompletion = data.quests.length
        ? Math.round(data.quests.reduce((s, q) => s + q.completion, 0) / data.quests.length)
        : 0;
      const customerAvgCompletion = data.customers.length
        ? Math.round(data.customers.reduce((s, c) => s + c.completion, 0) / data.customers.length)
        : null;
      const totalParticipants = data.quests.reduce((s, q) => s + Math.round(q.target * q.completion / 100), 0);
      return {
        segment,
        questCount:              data.quests.length,
        customerCount:           data.customers.length,
        questAvgCompletion,      // avg quest completion% for this segment's tx quests
        customerAvgCompletion,   // avg customer.completion for this segment (or null)
        totalParticipants
      };
    }).sort((a, b) => b.questAvgCompletion - a.questAvgCompletion);

    // ── Top customers for transaction quests ────────────────────────────────
    // Rank customers whose segment has at least one transaction quest,
    // sorted by (completion desc, quests_done desc).
    const txSegments = new Set(txQuests.map(q => q.segment));
    const topCustomers = customers
      .filter(c => txSegments.has(c.segment))
      .sort((a, b) => b.completion - a.completion || b.quests_done - a.quests_done)
      .slice(0, 10)
      .map(c => ({
        name:        c.name,
        segment:     c.segment,
        tier:        c.tier,
        completion:  c.completion,
        quests_done: c.quests_done,
        xp:          c.xp
      }));

    // ── Summary ─────────────────────────────────────────────────────────────
    const avgSuccessRate = Math.round(txQuests.reduce((s, q) => s + q.completion, 0) / txQuests.length);
    const totalParticipants = txQuests.reduce((s, q) => s + Math.round(q.target * q.completion / 100), 0);
    const totalTarget = txQuests.reduce((s, q) => s + q.target, 0);

    res.json({
      summary: {
        totalTransactionQuests: txQuests.length,
        avgSuccessRate,
        totalParticipants,
        totalTarget
      },
      byQuest,
      bySegment,
      topCustomers
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to compute transaction success data.' });
  }
});

module.exports = router;
