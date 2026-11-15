#!/usr/bin/env bash
# One-time migration for the tags + archive release (July 2026).
# Brings a noted.db from the previous schema (notes without archived_at,
# no tags/note_tags tables) up to the current one.
#
# This applies exactly what db.js applies automatically at startup — running
# the new code once would do the same job. Use this script when you want an
# explicit backup + verification step first. Safe to run repeatedly.
#
# Usage:
#   sudo systemctl stop noted          # recommended, not strictly required
#   ./scripts/migrate-tags-archive.sh /path/to/data/noted.db
#   sudo systemctl start noted
set -euo pipefail

DB="${1:?usage: $0 /path/to/noted.db}"
[ -f "$DB" ] || { echo "error: no such file: $DB" >&2; exit 1; }
command -v sqlite3 >/dev/null || { echo "error: sqlite3 CLI not found" >&2; exit 1; }

# Consistent snapshot even if the app is still running (WAL-safe).
BACKUP="${DB%.db}.backup-$(date +%Y%m%d-%H%M%S).db"
sqlite3 "$DB" ".backup '$BACKUP'"
echo "backup written: $BACKUP"

sqlite3 "$DB" <<'SQL'
PRAGMA foreign_keys = ON;
BEGIN;

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, name)
);
CREATE INDEX IF NOT EXISTS idx_tags_user ON tags(user_id);

CREATE TABLE IF NOT EXISTS note_tags (
  note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag_id);

COMMIT;
SQL

# ALTER TABLE ... ADD COLUMN has no IF NOT EXISTS form; guard via pragma.
if [ -z "$(sqlite3 "$DB" "SELECT 1 FROM pragma_table_info('notes') WHERE name='archived_at';")" ]; then
  sqlite3 "$DB" "ALTER TABLE notes ADD COLUMN archived_at TEXT;"
  echo "added column: notes.archived_at"
else
  echo "column notes.archived_at already present — skipping"
fi
sqlite3 "$DB" "CREATE INDEX IF NOT EXISTS idx_notes_user_archived ON notes(user_id, archived_at);"

echo
echo "== verification =="
sqlite3 "$DB" "SELECT 'tables: ' || group_concat(name, ', ') FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;"
sqlite3 "$DB" "SELECT 'notes columns: ' || group_concat(name, ', ') FROM pragma_table_info('notes');"
sqlite3 "$DB" "SELECT (SELECT COUNT(*) FROM users) || ' users, ' || (SELECT COUNT(*) FROM notes) || ' notes (' || (SELECT COUNT(*) FROM notes WHERE archived_at IS NOT NULL) || ' archived), ' || (SELECT COUNT(*) FROM folders) || ' folders, ' || (SELECT COUNT(*) FROM claude_pushed) || ' pushed, ' || (SELECT COUNT(*) FROM claude_inbox) || ' inbox';"
sqlite3 "$DB" "PRAGMA integrity_check;"
echo "done"
