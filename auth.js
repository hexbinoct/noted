const crypto = require('crypto');
const db = require('./db');

function generateApiKey() {
  return 'nk_' + crypto.randomBytes(24).toString('base64url');
}

function generateCsrfToken() {
  return crypto.randomBytes(32).toString('base64url');
}

// Constant-time string comparison
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// Verify CSRF token on state-changing session requests.
// Bearer-token (API-key) requests are exempt: browsers don't attach Authorization
// headers cross-origin automatically, so they aren't subject to CSRF.
function csrfGuard(req, res, next) {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();

  // Login + register predate a session; they're authenticated by credentials,
  // which is itself sufficient CSRF defense for those endpoints.
  if (req.originalUrl === '/api/auth/login' || req.originalUrl === '/api/auth/register') return next();

  // If a Bearer / x-api-key is presented, this is the programmatic flow.
  const authz = req.get('authorization') || '';
  if (authz.startsWith('Bearer ') || req.get('x-api-key')) return next();

  const expected = req.session && req.session.csrf;
  const got = req.get('x-csrf-token');
  if (!expected || !safeEqual(expected, got || '')) {
    return res.status(403).json({ error: 'csrf_invalid' });
  }
  next();
}

// Browser-session auth
function requireSession(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'not_authenticated' });
  }
  req.userId = req.session.userId;
  next();
}

// API-key auth for programmatic access (Claude)
function requireApiKey(req, res, next) {
  const header = req.get('authorization') || '';
  const key = header.startsWith('Bearer ') ? header.slice(7) : req.get('x-api-key');
  if (!key) return res.status(401).json({ error: 'missing_api_key' });
  const user = db.prepare('SELECT id FROM users WHERE api_key = ?').get(key);
  if (!user) return res.status(401).json({ error: 'invalid_api_key' });
  req.userId = user.id;
  next();
}

module.exports = { generateApiKey, generateCsrfToken, csrfGuard, requireSession, requireApiKey };
