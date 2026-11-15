const express = require('express');
const db = require('../db');
const { requireSession } = require('../auth');

const router = express.Router();
router.use(requireSession);

router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT id, name, parent_id, created_at FROM folders WHERE user_id = ? ORDER BY name')
    .all(req.userId);
  res.json(rows);
});

router.post('/', (req, res) => {
  const { name, parent_id } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'name_required' });
  if (parent_id) {
    const parent = db.prepare('SELECT id FROM folders WHERE id = ? AND user_id = ?').get(parent_id, req.userId);
    if (!parent) return res.status(400).json({ error: 'invalid_parent' });
  }
  const info = db
    .prepare('INSERT INTO folders (user_id, name, parent_id) VALUES (?, ?, ?)')
    .run(req.userId, name.trim(), parent_id || null);
  res.json({ id: info.lastInsertRowid, name: name.trim(), parent_id: parent_id || null });
});

router.put('/:id', (req, res) => {
  const { name, parent_id } = req.body || {};
  const folder = db.prepare('SELECT id FROM folders WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!folder) return res.status(404).json({ error: 'not_found' });
  if (name) db.prepare('UPDATE folders SET name = ? WHERE id = ?').run(name.trim(), folder.id);
  if (parent_id !== undefined) {
    if (parent_id && parent_id == folder.id) return res.status(400).json({ error: 'invalid_parent' });
    db.prepare('UPDATE folders SET parent_id = ? WHERE id = ?').run(parent_id || null, folder.id);
  }
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const info = db
    .prepare('DELETE FROM folders WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.userId);
  if (!info.changes) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

module.exports = router;
