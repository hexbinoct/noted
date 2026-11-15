const express = require('express');
const db = require('../db');
const { requireSession } = require('../auth');

const router = express.Router();
router.use(requireSession);

// Canonical tag form: lowercase, no leading '#', inner whitespace as '-'.
// Returns null when nothing usable remains.
function normalizeTag(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw.trim().replace(/^#/, '').toLowerCase().replace(/\s+/g, '-').slice(0, 40);
  return name || null;
}

router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT t.id, t.name, COUNT(nt.note_id) AS note_count
       FROM tags t
       LEFT JOIN note_tags nt ON nt.tag_id = t.id
       WHERE t.user_id = ?
       GROUP BY t.id
       ORDER BY t.name`
    )
    .all(req.userId);
  res.json(rows);
});

router.post('/', (req, res) => {
  const name = normalizeTag((req.body || {}).name);
  if (!name) return res.status(400).json({ error: 'invalid_tag' });
  const existing = db.prepare('SELECT id FROM tags WHERE user_id = ? AND name = ?').get(req.userId, name);
  if (existing) return res.status(409).json({ error: 'tag_exists' });
  const info = db.prepare('INSERT INTO tags (user_id, name) VALUES (?, ?)').run(req.userId, name);
  res.json({ id: info.lastInsertRowid, name });
});

router.put('/:id', (req, res) => {
  const tag = db.prepare('SELECT id FROM tags WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!tag) return res.status(404).json({ error: 'not_found' });
  const name = normalizeTag((req.body || {}).name);
  if (!name) return res.status(400).json({ error: 'invalid_tag' });
  const clash = db
    .prepare('SELECT id FROM tags WHERE user_id = ? AND name = ? AND id != ?')
    .get(req.userId, name, tag.id);
  if (clash) return res.status(409).json({ error: 'tag_exists' });
  db.prepare('UPDATE tags SET name = ? WHERE id = ?').run(name, tag.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM tags WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  if (!info.changes) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

module.exports = router;
module.exports.normalizeTag = normalizeTag;
