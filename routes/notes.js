const express = require('express');
const db = require('../db');
const { requireSession } = require('../auth');
const { sendNoteDownload } = require('../download');
const { normalizeTag } = require('./tags');

const router = express.Router();
router.use(requireSession);

// Bulk-load tags for a set of notes: one query, grouped into Map(note_id -> [{id, name}]).
function tagsForNotes(userId, noteIds) {
  const map = new Map();
  if (!noteIds.length) return map;
  const placeholders = noteIds.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT nt.note_id, t.id, t.name
       FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
       WHERE t.user_id = ? AND nt.note_id IN (${placeholders})
       ORDER BY t.name`
    )
    .all(userId, ...noteIds);
  for (const r of rows) {
    if (!map.has(r.note_id)) map.set(r.note_id, []);
    map.get(r.note_id).push({ id: r.id, name: r.name });
  }
  return map;
}

function withTags(userId, note) {
  return { ...note, tags: tagsForNotes(userId, [note.id]).get(note.id) || [] };
}

// Full-replace of a note's tags inside a transaction. Names are normalized;
// any name that normalizes to nothing throws { code: 'invalid_tag' }.
const replaceTags = db.transaction((userId, noteId, names) => {
  const ids = [];
  for (const raw of names) {
    const name = normalizeTag(raw);
    if (!name) {
      const err = new Error('invalid_tag');
      err.code = 'invalid_tag';
      throw err;
    }
    db.prepare('INSERT OR IGNORE INTO tags (user_id, name) VALUES (?, ?)').run(userId, name);
    ids.push(db.prepare('SELECT id FROM tags WHERE user_id = ? AND name = ?').get(userId, name).id);
  }
  db.prepare('DELETE FROM note_tags WHERE note_id = ?').run(noteId);
  for (const tagId of ids) {
    db.prepare('INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)').run(noteId, tagId);
  }
});

router.get('/', (req, res) => {
  const { folder_id, q, tag, archived } = req.query;
  let sql =
    'SELECT id, folder_id, title, substr(content, 1, 200) AS preview, format, archived_at, created_at, updated_at FROM notes WHERE user_id = ?';
  const params = [req.userId];
  sql += archived === 'true' ? ' AND archived_at IS NOT NULL' : ' AND archived_at IS NULL';
  if (folder_id === 'null' || folder_id === '') {
    sql += ' AND folder_id IS NULL';
  } else if (folder_id) {
    sql += ' AND folder_id = ?';
    params.push(folder_id);
  }
  if (tag) {
    sql +=
      ' AND id IN (SELECT nt.note_id FROM note_tags nt JOIN tags t ON t.id = nt.tag_id WHERE t.user_id = ? AND t.name = ?)';
    params.push(req.userId, tag);
  }
  if (q) {
    sql += ' AND (title LIKE ? OR content LIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }
  sql += ' ORDER BY updated_at DESC';
  const notes = db.prepare(sql).all(...params);
  const tagMap = tagsForNotes(req.userId, notes.map((n) => n.id));
  res.json(notes.map((n) => ({ ...n, tags: tagMap.get(n.id) || [] })));
});

router.get('/:id', (req, res) => {
  const note = db
    .prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!note) return res.status(404).json({ error: 'not_found' });
  res.json(withTags(req.userId, note));
});

// Download a note's full content as a .md/.txt file.
router.get('/:id/download', (req, res) => {
  const note = db
    .prepare('SELECT title, content, format FROM notes WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!note) return res.status(404).json({ error: 'not_found' });
  sendNoteDownload(res, note);
});

router.post('/', (req, res) => {
  const { title, content, folder_id, format, tags } = req.body || {};
  if (folder_id) {
    const f = db.prepare('SELECT id FROM folders WHERE id = ? AND user_id = ?').get(folder_id, req.userId);
    if (!f) return res.status(400).json({ error: 'invalid_folder' });
  }
  const fmt = format === 'markdown' ? 'markdown' : 'plain';
  const info = db
    .prepare('INSERT INTO notes (user_id, folder_id, title, content, format) VALUES (?, ?, ?, ?, ?)')
    .run(req.userId, folder_id || null, title || '', content || '', fmt);
  if (Array.isArray(tags) && tags.length) {
    try {
      replaceTags(req.userId, info.lastInsertRowid, tags);
    } catch (err) {
      if (err.code === 'invalid_tag') return res.status(400).json({ error: 'invalid_tag' });
      throw err;
    }
  }
  const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(info.lastInsertRowid);
  res.json(withTags(req.userId, note));
});

router.put('/:id', (req, res) => {
  const note = db
    .prepare('SELECT id FROM notes WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!note) return res.status(404).json({ error: 'not_found' });
  const { title, content, folder_id, format, tags } = req.body || {};
  const fields = [];
  const params = [];
  if (title !== undefined) { fields.push('title = ?'); params.push(title); }
  if (content !== undefined) { fields.push('content = ?'); params.push(content); }
  if (format !== undefined) {
    if (!['plain', 'markdown'].includes(format)) return res.status(400).json({ error: 'invalid_format' });
    fields.push('format = ?');
    params.push(format);
  }
  if (folder_id !== undefined) {
    if (folder_id) {
      const f = db.prepare('SELECT id FROM folders WHERE id = ? AND user_id = ?').get(folder_id, req.userId);
      if (!f) return res.status(400).json({ error: 'invalid_folder' });
    }
    fields.push('folder_id = ?');
    params.push(folder_id || null);
  }
  let touched = fields.length > 0;
  if (tags !== undefined) {
    if (!Array.isArray(tags)) return res.status(400).json({ error: 'invalid_tag' });
    try {
      replaceTags(req.userId, note.id, tags);
    } catch (err) {
      if (err.code === 'invalid_tag') return res.status(400).json({ error: 'invalid_tag' });
      throw err;
    }
    touched = true;
  }
  if (touched) {
    fields.push("updated_at = datetime('now')");
    params.push(note.id);
    db.prepare(`UPDATE notes SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  }
  res.json(withTags(req.userId, db.prepare('SELECT * FROM notes WHERE id = ?').get(note.id)));
});

// Archive/unarchive deliberately don't touch updated_at: archiving shouldn't
// reshuffle the date-grouped list when the note comes back.
router.post('/:id/archive', (req, res) => {
  const info = db
    .prepare("UPDATE notes SET archived_at = datetime('now') WHERE id = ? AND user_id = ?")
    .run(req.params.id, req.userId);
  if (!info.changes) return res.status(404).json({ error: 'not_found' });
  res.json(withTags(req.userId, db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id)));
});

router.post('/:id/unarchive', (req, res) => {
  const info = db
    .prepare('UPDATE notes SET archived_at = NULL WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.userId);
  if (!info.changes) return res.status(404).json({ error: 'not_found' });
  res.json(withTags(req.userId, db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id)));
});

router.delete('/:id', (req, res) => {
  const info = db
    .prepare('DELETE FROM notes WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.userId);
  if (!info.changes) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

module.exports = router;
