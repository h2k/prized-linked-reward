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

module.exports = router;
