# noted

Personal notes web app with a Claude integration. Express + SQLite backend,
vanilla-JS SPA frontend, **no build step**. See `README.md` for the
deployment runbook (DigitalOcean droplet + Cloudflare Tunnel + systemd).

## Run

```bash
npm install
npm start            # node server.js, serves on :5509
npm run dev          # node --watch server.js (auto-restart on change)
npm test             # node --test + supertest API suite (test/*.test.js)
```

No linter, no bundler. The frontend is served as static files straight from
`public/`; edits are live on reload. Data lives in `data/` (gitignored):
`noted.db` (app), `sessions.db` (express-session store). `DATA_DIR` env
overrides the data directory — the tests rely on this.

## Tests

`test/helper.js` sets `DATA_DIR` to a fresh temp dir **before** requiring the
app (db.js opens the database at require time), and `node --test` runs each
test file in its own process, so every file gets an isolated SQLite db. Don't
run with `--test-isolation=none` — it would break that isolation. Session
tests must use `supertest.agent()` (persists cookies) and send the
`csrf_token` captured from register/login responses as `X-CSRF-Token`.

## Architecture

Request flow in `app.js`: `express.json` → session middleware → `/api`
router → `/vendor` router → static `public/` → SPA fallback → error handler.

```
server.js            entrypoint: require('./app') + app.listen
app.js               Express app wiring (exported for supertest)
config.js            env-driven config (PORT, SESSION_SECRET, COOKIE_SECURE, TRUST_PROXY, DATA_DIR)
db.js                better-sqlite3 connection; schema created idempotently at require time
auth.js              api-key gen, CSRF tokens, safeEqual, and the 3 guard middlewares
download.js          shared note-download helper (Content-Disposition etc.)
routes/
  index.js           mounts csrfGuard + /auth /folders /notes /tags /claude, plus /health
  auth.js            register/login/logout, /me, theme, regenerate-key
  folders.js         nested-folder CRUD (session-auth)
  notes.js           note CRUD + search + tag filter + archive/unarchive (session-auth)
  tags.js            tag CRUD + normalizeTag helper (session-auth)
  claude.js          BOTH api-key endpoints (push/inbox/ack) AND session endpoints (pushed/outbox)
  vendor.js          serves marked + dompurify from node_modules under /vendor
middleware/          session.js, spaFallback.js, errorHandler.js
test/                helper.js + *.test.js (auth, csrf, notes, tags, archive, folders, claude)
public/
  index.html         SPA shell: auth screen + 3-pane app (library | note list | editor)
  styles.css         4 themes (CSS custom properties), pane layout, mobile drill-down
  js/                native ES modules, no framework:
    main.js          init + cross-view event wiring (single place events are subscribed)
    api.js           fetch wrapper: CSRF echo capture, 401 → auth screen
    state.js         single shared state object + tiny on/emit pub-sub + setView()
    nav.js           mobile pane navigation (#app[data-pane]), isMobile()
    util.js          $, $$, fmtDate, parseUtc (SQLite UTC quirk), escapeHtml, debounce
    views/           auth, library (folders+tags nav), noteList (date-grouped list,
                     search), editor (autosave, tags chips, archive, preview),
                     claude (pushed/outbox), settings
```

Module graph is acyclic: views never import each other's *reactions* — they
`emit()` events (`refresh-list`, `note-updated`, `library`, …) that `main.js`
wires to handlers. Keep it that way.

## Data model (`db.js`)

**Multi-user-capable** — `POST /api/auth/register` is open (no user cap, no
"registration closed" flag; only rejects duplicate usernames). It's deployed as
a single-user instance by convention, not by any code constraint. Everything is
scoped by `user_id`:
- **users** — username, bcrypt `password_hash`, unique `api_key` (`nk_` prefix), theme.
- **folders** — self-referential `parent_id` (nested); `ON DELETE CASCADE`.
- **notes** — `folder_id` (`ON DELETE SET NULL`), title (may be empty; UI shows
  "Untitled"), content, `format` (`'plain'` | `'markdown'`), `archived_at`
  (NULL = active), created/updated timestamps.
- **tags** — per-user, `UNIQUE(user_id, name)`; names normalized server-side
  (lowercase, no leading `#`, whitespace → `-`, ≤40 chars — `normalizeTag` in
  `routes/tags.js`).
- **note_tags** — join table, `ON DELETE CASCADE` both ways.
- **claude_pushed** — notes Claude pushed *to the user* ("From Claude" inbox):
  topic, content, repo, read flag.
- **claude_inbox** — notes the user left *for Claude* (the user's "outbox" /
  Claude's "inbox"): topic, content, `fetched_at`.

Schema is created with `CREATE TABLE IF NOT EXISTS` at require time — **there is
no migration framework**. For schema changes, add an idempotent `ALTER` guarded
by a `PRAGMA table_info` check (see the `format` and `archived_at` migrations at
the bottom of `db.js`), or drop the db file in dev.

## Notes API specifics

- `GET /api/notes` excludes archived notes unless `archived=true`; filters
  compose: `folder_id` (`null` for unfiled), `q` (LIKE on title/content),
  `tag` (exact normalized name). Rows include `tags: [{id,name}]` (bulk-loaded,
  no N+1) and `archived_at`.
- `PUT /api/notes/:id` accepts `tags: [names]` as a full replace (transaction;
  auto-creates tags). It bumps `updated_at`.
- `POST /api/notes/:id/archive` / `/unarchive` deliberately do **not** touch
  `updated_at` (archiving shouldn't reshuffle the date-grouped list).

## Auth & security

Two parallel auth schemes, both resolving to `req.userId`:
- **Session** (`requireSession`) — browser UI; httpOnly cookie, 30-day maxAge,
  `sameSite: 'lax'`. CSRF token minted at login/register, echoed in JSON
  responses, sent back via `X-CSRF-Token`, verified by `csrfGuard` on mutating
  requests.
- **API key** (`requireApiKey`) — programmatic (Claude); `Authorization: Bearer
  <key>` or `x-api-key`. **Exempt from CSRF** (`csrfGuard` skips Bearer/x-api-key
  requests — browsers don't auto-attach those cross-origin). A request with
  neither session-CSRF nor key gets 403 from csrfGuard before any 401.

Use the `safeEqual` constant-time compare for any secret comparison. The
frontend `api()` helper auto-attaches the CSRF header and re-captures any
`csrf_token` returned in a response body.

## Claude integration (the reason this app exists)

The same routes power both directions; mind which auth guard each uses:

| Direction | Endpoint | Auth |
| --- | --- | --- |
| Claude → user | `POST /api/claude/push` | api-key |
| user → Claude | `GET /api/claude/inbox?unread=true` | api-key |
| user → Claude | `POST /api/claude/inbox/:id/ack` | api-key |
| UI: read pushed | `GET/POST/DELETE /api/claude/pushed[...]` | session |
| UI: manage outbox | `GET/POST/DELETE /api/claude/outbox[...]` | session |

**These are live production contracts** — other machines push/read via them.
Do not change their request/response shapes (locked by `test/claude.test.js`).
The user's global `~/.claude/CLAUDE.md` documents the live production instance
and the bearer token used to push/read notes (neither belongs in this repo).

## Frontend notes (`public/js/`)

- **Layout**: Bear-style 3 panes. On ≤760px they become full-screen layers
  driven by `#app[data-pane="library"|"list"|"editor"]` (drill-down with back
  buttons). Every pane is a flex column with `min-height:0` and exactly one
  `.pane-scroll` child — keep that structure or inner scrolling breaks.
- **Empty editor**: when no note is open the editor gets `.empty` (overlay +
  disabled inputs) so keystrokes can't be silently lost. Desktop auto-opens
  the most recent note after list loads; mobile lands on the list pane.
- **Autosave**: debounced 600ms → `saveNow()`; on failure retries on a backoff
  (`RETRY_DELAYS_MS`) with a clickable "save failed" status; a new edit
  supersedes a pending retry. (In `views/editor.js`.)
- **Markdown**: per-note `format` toggle (TXT/MD). Preview renders via `marked`
  then **`DOMPurify.sanitize`** (classic scripts from `/vendor`, loaded before
  the deferred modules) — keep markdown rendering sanitized.
- **Read-only**: notes pushed from Claude open read-only (`.readonly`), default
  to markdown preview. Don't make the Claude-pushed view editable.
- **Search box** parses `#tag` tokens into the `tag` query param client-side;
  the remainder is `q`.

## Conventions

- CommonJS (`require`/`module.exports`) on the backend; native ES modules in
  `public/js/`. Node 20+.
- All DB access is synchronous via `better-sqlite3` prepared statements — always
  parameterize, and always scope queries by `user_id`.
- Routes return JSON `{ error: '<snake_case_code>' }` with an appropriate status;
  match that shape for new endpoints.
- New API behavior needs a test in `test/`.
