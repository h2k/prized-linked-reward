'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

const authRouter      = require('./routes/auth');
const questsRouter    = require('./routes/quests');
const customersRouter = require('./routes/customers');
const analyticsRouter = require('./routes/analytics');
const loyaltyRouter   = require('./routes/loyalty');
const { initDb }      = require('./db');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Security / middleware ────────────────────────────────────────────────────

app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5500', 'http://127.0.0.1:5500'],
  credentials: true
}));

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false }));

// Rate limiting – stricter on auth endpoints
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many login attempts. Please try again later.' } });
const apiLimiter  = rateLimit({ windowMs: 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false });

app.use('/api/auth', authLimiter);
app.use('/api',      apiLimiter);

// ── Serve frontend static files ──────────────────────────────────────────────

const frontendDir = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendDir));

// ── API routes ───────────────────────────────────────────────────────────────

app.use('/api/auth',      authRouter);
app.use('/api/quests',    questsRouter);
app.use('/api/customers', customersRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/loyalty',   loyaltyRouter);

// Health check
app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// ── SPA fallback (serve frontend index for non-API routes) ───────────────────

app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(frontendDir, 'index.html'));
  } else {
    res.status(404).json({ error: 'Not found.' });
  }
});

// ── Error handler ────────────────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'An internal server error occurred.' });
});

// ── Start ────────────────────────────────────────────────────────────────────

async function main() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`Gamification Admin API running on http://localhost:${PORT}`);
    console.log(`  Frontend: http://localhost:${PORT}`);
    console.log(`  API base: http://localhost:${PORT}/api`);
  });
}

main().catch(err => { console.error('Startup error:', err); process.exit(1); });
