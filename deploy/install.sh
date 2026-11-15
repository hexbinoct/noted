#!/usr/bin/env bash
# One-time setup on a Linux server with systemd. Run as root:
#
#   curl -fsSL https://raw.githubusercontent.com/hexbinoct/noted/main/deploy/install.sh | bash
#   # or, to bring over an existing data directory (noted.db, sessions.db):
#   bash install.sh --import-data /path/to/old/data
#
# Layout:  /opt/noted            git checkout (owned by the `noted` user)
#          /var/lib/noted/data   SQLite databases (DATA_DIR), never touched by updates
#          /etc/noted/noted.env  config + generated SESSION_SECRET
# Safe to re-run: it never overwrites the env file or existing data.
set -euo pipefail

REPO="${NOTED_REPO:-https://github.com/hexbinoct/noted.git}"
APP_DIR=/opt/noted
DATA_DIR=/var/lib/noted/data
ENV_FILE=/etc/noted/noted.env
NODE_BIN_DIR="${NODE_BIN_DIR:-/opt/node24/bin}"
IMPORT=""
[[ "${1:-}" == "--import-data" ]] && IMPORT="${2:?--import-data needs a directory}"

[[ $EUID -eq 0 ]] || { echo "run as root" >&2; exit 1; }
"$NODE_BIN_DIR/node" -v >/dev/null || { echo "node not found in $NODE_BIN_DIR (set NODE_BIN_DIR)" >&2; exit 1; }

id noted &>/dev/null || useradd --system --home-dir /var/lib/noted --shell /usr/sbin/nologin noted
install -d -o noted -g noted -m 750 /var/lib/noted "$DATA_DIR"

if [[ ! -d "$APP_DIR/.git" ]]; then
  git clone "$REPO" "$APP_DIR"
fi
chown -R noted:noted "$APP_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  install -d -m 750 -g noted /etc/noted
  umask 027
  cat > "$ENV_FILE" <<EOF
PORT=5509
HOST=127.0.0.1
DATA_DIR=$DATA_DIR
SESSION_SECRET=$(head -c 48 /dev/urandom | base64 | tr -d '\n/+=')
COOKIE_SECURE=true
TRUST_PROXY=true
NODE_ENV=production
NODE_BIN_DIR=$NODE_BIN_DIR
EOF
  chgrp noted "$ENV_FILE"
  echo "wrote $ENV_FILE"
fi

if [[ -n "$IMPORT" ]]; then
  if ls "$DATA_DIR"/noted.db &>/dev/null; then
    echo "refusing to import: $DATA_DIR/noted.db already exists" >&2; exit 1
  fi
  # Merge the WAL into a single consistent file instead of copying -wal/-shm.
  sqlite3 "$IMPORT/noted.db" ".backup '$DATA_DIR/noted.db'"
  [[ -f "$IMPORT/sessions.db" ]] && cp "$IMPORT/sessions.db" "$DATA_DIR/"
  chown noted:noted "$DATA_DIR"/*
  echo "imported data from $IMPORT"
fi

chmod +x "$APP_DIR"/deploy/*.sh
install -m 644 "$APP_DIR/deploy/noted.service" /etc/systemd/system/noted.service
install -m 644 "$APP_DIR/deploy/noted-update.service" /etc/systemd/system/noted-update.service
install -m 644 "$APP_DIR/deploy/noted-update.timer" /etc/systemd/system/noted-update.timer
systemctl daemon-reload
systemctl enable --now noted noted-update.timer
echo "done: systemctl status noted   |   journalctl -u noted -f"
