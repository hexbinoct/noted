# noted

A small personal notes web app: Express + SQLite, vanilla JS frontend, single user-account model with an API key for programmatic pushes.

## Features
- User auth (bcrypt + session cookies)
- Folders (nested) + notes with autosave
- Search across notes
- 4 themes (light / dark / sepia / solarized)
- Mobile-friendly responsive layout
- **From Claude**: an inbox of notes Claude has pushed in (topic, content, repo, datetime)
- **For Claude**: an outbox where you leave notes Claude can fetch later
- Per-user API key for the Claude integration

## Stack
- Node 20+, Express 4
- `better-sqlite3` (synchronous, fast, single-file)
- `express-session` + `connect-sqlite3`
- Vanilla HTML/CSS/JS — no build step

## Run locally
```bash
cp .env.example .env       # edit SESSION_SECRET
npm install
npm start                  # serves on :5509
```
Data is stored in `./data/noted.db` and `./data/sessions.db`.

## Deployment (DigitalOcean + Cloudflare Tunnel)
1. Provision a small droplet, `apt install nodejs npm`.
2. Clone the repo, `npm ci --omit=dev`.
3. Create `/etc/systemd/system/noted.service`:
   ```ini
   [Unit]
   Description=noted
   After=network.target

   [Service]
   WorkingDirectory=/opt/noted
   Environment=PORT=5509
   Environment=SESSION_SECRET=replace-me
   Environment=COOKIE_SECURE=true
   Environment=TRUST_PROXY=true
   ExecStart=/usr/bin/node server.js
   Restart=on-failure
   User=noted

   [Install]
   WantedBy=multi-user.target
   ```
   Then `systemctl enable --now noted`.
4. Install `cloudflared`, run `cloudflared tunnel create noted`, and in your tunnel config map your hostname to `http://localhost:5509`. Cloudflare terminates TLS — `COOKIE_SECURE=true` and `TRUST_PROXY=true` ensure session cookies behave correctly.

## API for Claude

All Claude endpoints use the per-user API key from **Settings → API Key**.

```bash
# Claude pushes a note into your "From Claude" inbox
curl -X POST https://your-host/api/claude/push \
  -H "Authorization: Bearer $NOTED_KEY" \
  -H "Content-Type: application/json" \
  -d '{"topic":"db migration plan","content":"remember to backfill","repo":"my-project"}'

# Claude fetches notes you left for it
curl https://your-host/api/claude/inbox?unread=true \
  -H "Authorization: Bearer $NOTED_KEY"

# Claude acks an item (marks it fetched)
curl -X POST https://your-host/api/claude/inbox/<id>/ack \
  -H "Authorization: Bearer $NOTED_KEY"
```

To wire this up in a Claude Code session, set `NOTED_KEY` in your shell or save it via the `chub annotate` mechanism so Claude can find it.

## REST surface (session-auth)
| Method | Path | Purpose |
| --- | --- | --- |
| POST   | `/api/auth/register` | create account |
| POST   | `/api/auth/login`    | log in |
| POST   | `/api/auth/logout`   | log out |
| GET    | `/api/auth/me`       | current user incl. api_key |
| PUT    | `/api/auth/me/theme` | set theme |
| POST   | `/api/auth/me/regenerate-key` | rotate API key |
| GET/POST/PUT/DELETE | `/api/folders[/:id]` | folder CRUD |
| GET/POST/PUT/DELETE | `/api/notes[/:id]`   | note CRUD (`?folder_id=`, `?q=`) |
| GET    | `/api/claude/pushed` | notes Claude has pushed |
| GET    | `/api/claude/outbox` | notes left for Claude |

## Notes
- Schema migrations: there are none — the schema is created idempotently in `db.js`. For changes, add an explicit migration or drop the db file.
- Backups: copy `data/noted.db` while the server is stopped (or use `sqlite3 data/noted.db .backup ...`).
