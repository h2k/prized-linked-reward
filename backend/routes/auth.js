/**
 * Auth routes – login and logout.
 * POST /api/auth/login  { username, password } → { token, user }
 * POST /api/auth/logout → 200
 */
'use strict';

const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { getDynamo, TABLES } = require('../db');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  try {
    const db    = getDynamo();
    const users = await db.scan(TABLES.USERS);
    const user  = users.find(u => u.username === String(username).trim().toLowerCase());

    if (!user || !bcrypt.compareSync(String(password), user.password)) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const payload = { sub: user.id, username: user.username, role: user.role };
    const token   = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });

    return res.json({ token, user: { id: user.id, username: user.username, fullName: user.full_name, role: user.role } });
  } catch {
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/auth/logout  (client should discard the token)
router.post('/logout', (_req, res) => res.json({ message: 'Logged out.' }));

module.exports = router;
