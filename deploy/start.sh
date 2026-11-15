#!/usr/bin/env bash
# ExecStart for noted.service: pull the latest main, install deps if the
# lockfile changed, then exec the server. If GitHub is unreachable it starts
# whatever is already checked out rather than failing.
#
# Everything runs inside main() so bash has parsed the whole file before
# `git reset` can rewrite it underneath us.
set -uo pipefail

main() {
  local app_dir branch
  app_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  branch="${NOTED_BRANCH:-main}"
  export PATH="${NODE_BIN_DIR:-/opt/node24/bin}:$PATH"
  cd "$app_dir" || exit 1

  if timeout 60 git fetch --quiet origin "$branch"; then
    git reset --quiet --hard "origin/$branch"
    echo "noted: at $(git rev-parse --short HEAD) ($(git log -1 --format=%s))"
  else
    echo "noted: git fetch failed, starting current checkout $(git rev-parse --short HEAD)" >&2
  fi

  local lock_hash stamp="node_modules/.noted-lock-hash"
  lock_hash="$(sha256sum package-lock.json | cut -d' ' -f1)"
  if [[ ! -f "$stamp" || "$(cat "$stamp")" != "$lock_hash" ]]; then
    echo "noted: installing dependencies"
    npm ci --omit=dev --no-audit --no-fund || exit 1
    echo "$lock_hash" > "$stamp"
  fi

  exec node server.js
}

main "$@"
exit
