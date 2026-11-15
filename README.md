# noted

A notes app in which your agent can leave messages and you can leave messages for your agent to read during AI sessions.

Folders, tags, search, markdown preview, four themes, and a layout that works on a phone. Express + SQLite, plain JS, no build step.

## Messaging with your agent

Each account has an API key (**Settings → API Key**). Give it to Claude Code, or any agent that can make HTTP requests, and the app becomes a two-way mailbox:

- **From Claude** — the agent pushes notes to you: results of a long run, something blocked on you, a summary for when you're back at the other machine.
- **For Claude** — you leave notes for the agent; it reads the unread ones at the start of a session and acks them.

```bash
# agent → you
curl -X POST https://your-host/api/claude/push -H "Authorization: Bearer $NOTED_KEY" \
  -H "Content-Type: application/json" -d '{"topic":"build done","content":"all tests pass","repo":"optional"}'

# you → agent: read unread notes, then ack one
curl https://your-host/api/claude/inbox?unread=true -H "Authorization: Bearer $NOTED_KEY"
curl -X POST https://your-host/api/claude/inbox/<id>/ack -H "Authorization: Bearer $NOTED_KEY"
```

To wire it up, put the key in an environment variable and tell the agent about these endpoints in its instructions file (e.g. `CLAUDE.md`).

## Run

```bash
cp .env.example .env   # set SESSION_SECRET
npm install
npm start              # http://localhost:5509
```

Data lives in `data/` (SQLite). Tests: `npm test`.

## License

[MIT](LICENSE)
