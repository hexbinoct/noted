#!/usr/bin/env bash
# Run by noted-update.timer (as root). If origin has new commits, restart
# noted; start.sh does the actual pull.
set -euo pipefail
APP_DIR=/opt/noted
BRANCH="${NOTED_BRANCH:-main}"

runuser -u noted -- git -C "$APP_DIR" fetch --quiet origin "$BRANCH"
local_rev="$(runuser -u noted -- git -C "$APP_DIR" rev-parse HEAD)"
remote_rev="$(runuser -u noted -- git -C "$APP_DIR" rev-parse "origin/$BRANCH")"

if [[ "$local_rev" != "$remote_rev" ]]; then
  echo "noted-update: ${local_rev:0:7} -> ${remote_rev:0:7}, restarting"
  systemctl restart noted
fi
