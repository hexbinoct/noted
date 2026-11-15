const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const { generateApiKey, generateCsrfToken, requireSession } = require('../auth');

const router = express.Router();

router.post('/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password || password.length < 8) {
    return res.status(400).json({ error: 'username_and_password_min_8_required' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return res.status(409).json({ error: 'username_taken' });
  const hash = await bcrypt.hash(password, 12);
  const apiKey = generateApiKey();
  const info = db
    .prepare('INSERT INTO users (username, password_hash, api_key) VALUES (?, ?, ?)')
    .run(username, hash, apiKey);
  req.session.userId = info.lastInsertRowid;
  req.session.csrf = generateCsrfToken();
  res.json({ id: info.lastInsertRowid, username, api_key: apiKey, csrf_token: req.session.csrf });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'missing_credentials' });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return res.status(401).json({ error: 'invalid_credentials' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'invalid_credentials' });
  req.session.userId = user.id;
  req.session.csrf = generateCsrfToken();
  res.json({ id: user.id, username: user.username, theme: user.theme, csrf_token: req.session.csrf });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', requireSession, (req, res) => {
  const user = db
    .prepare('SELECT id, username, theme, api_key, created_at FROM users WHERE id = ?')
    .get(req.userId);
  if (!req.session.csrf) req.session.csrf = generateCsrfToken();
  res.json({ ...user, csrf_token: req.session.csrf });
});

router.put('/me/theme', requireSession, (req, res) => {
  const { theme } = req.body || {};
  if (!['light', 'dark', 'sepia', 'solarized'].includes(theme)) {
    return res.status(400).json({ error: 'invalid_theme' });
  }
  db.prepare('UPDATE users SET theme = ? WHERE id = ?').run(theme, req.userId);
  res.json({ ok: true, theme });
});

router.post('/me/regenerate-key', requireSession, (req, res) => {
  const key = generateApiKey();
  db.prepare('UPDATE users SET api_key = ? WHERE id = ?').run(key, req.userId);
  res.json({ api_key: key });
});

module.exports = router;
