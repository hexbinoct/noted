const express = require('express');
const db = require('../db');
const { requireSession, requireApiKey } = require('../auth');
const { sendNoteDownload } = require('../download');

const router = express.Router();

// =========================================================================
// API-KEY endpoints (used by Claude programmatically)
// =========================================================================

// Claude pushes a note to the user
router.post('/push', requireApiKey, (req, res) => {
  const { topic, content, repo } = req.body || {};
  if (!topic || !content) return res.status(400).json({ error: 'topic_and_content_required' });
  const info = db
    .prepare('INSERT INTO claude_pushed (user_id, topic, content, repo) VALUES (?, ?, ?, ?)')
    .run(req.userId, topic.trim(), content, repo ? repo.trim() : null);
  res.json({ id: info.lastInsertRowid, created_at: new Date().toISOString() });
});

// Claude fetches notes the user left for it
router.get('/inbox', requireApiKey, (req, res) => {
  const onlyUnread = req.query.unread === 'true';
  const sql = onlyUnread
    ? 'SELECT id, topic, content, created_at FROM claude_inbox WHERE user_id = ? AND fetched_at IS NULL ORDER BY created_at'
    : 'SELECT id, topic, content, created_at, fetched_at FROM claude_inbox WHERE user_id = ? ORDER BY created_at DESC LIMIT 100';
  res.json(db.prepare(sql).all(req.userId));
});

// Claude acknowledges that it has read an inbox item
router.post('/inbox/:id/ack', requireApiKey, (req, res) => {
  const info = db
    .prepare("UPDATE claude_inbox SET fetched_at = datetime('now') WHERE id = ? AND user_id = ?")
    .run(req.params.id, req.userId);
  if (!info.changes) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

// =========================================================================
// SESSION endpoints (browser UI)
// =========================================================================

// List notes Claude has pushed to me
router.get('/pushed', requireSession, (req, res) => {
  res.json(
    db
      .prepare('SELECT id, topic, content, repo, read, created_at FROM claude_pushed WHERE user_id = ? ORDER BY created_at DESC')
      .all(req.userId)
  );
});

router.post('/pushed/:id/read', requireSession, (req, res) => {
  db.prepare('UPDATE claude_pushed SET read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.json({ ok: true });
});

// Download a pushed note's full content. Claude pushes markdown, so .md.
router.get('/pushed/:id/download', requireSession, (req, res) => {
  const item = db
    .prepare('SELECT topic, content FROM claude_pushed WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!item) return res.status(404).json({ error: 'not_found' });
  sendNoteDownload(res, { title: item.topic, content: item.content, format: 'markdown' });
});

router.delete('/pushed/:id', requireSession, (req, res) => {
  db.prepare('DELETE FROM claude_pushed WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.json({ ok: true });
});

// My outbox: notes I want Claude to see later
router.get('/outbox', requireSession, (req, res) => {
  res.json(
    db
      .prepare('SELECT id, topic, content, fetched_at, created_at FROM claude_inbox WHERE user_id = ? ORDER BY created_at DESC')
      .all(req.userId)
  );
});

router.post('/outbox', requireSession, (req, res) => {
  const { topic, content } = req.body || {};
  if (!topic || !content) return res.status(400).json({ error: 'topic_and_content_required' });
  const info = db
    .prepare('INSERT INTO claude_inbox (user_id, topic, content) VALUES (?, ?, ?)')
    .run(req.userId, topic.trim(), content);
  res.json({ id: info.lastInsertRowid });
});

router.delete('/outbox/:id', requireSession, (req, res) => {
  db.prepare('DELETE FROM claude_inbox WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.json({ ok: true });
});

module.exports = router;
