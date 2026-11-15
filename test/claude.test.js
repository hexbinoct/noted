const { test } = require('node:test');
const assert = require('node:assert/strict');
const { app, makeUser, request } = require('./helper');

test('push requires a valid api key', async () => {
  // No credentials at all: csrfGuard runs before the api-key check, so this
  // is rejected as a CSRF-less browser request (403), not a 401.
  await request(app).post('/api/claude/push').send({ topic: 't', content: 'c' }).expect(403);
  await request(app)
    .post('/api/claude/push')
    .set('Authorization', 'Bearer nk_bogus')
    .send({ topic: 't', content: 'c' })
    .expect(401);
});

test('push validates topic and content', async () => {
  const u = await makeUser();
  const res = await request(app)
    .post('/api/claude/push')
    .set('Authorization', `Bearer ${u.apiKey}`)
    .send({ topic: 't' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'topic_and_content_required');
});

test('push works with Bearer and with x-api-key; pushed list/read/delete via session', async () => {
  const u = await makeUser();
  await request(app)
    .post('/api/claude/push')
    .set('Authorization', `Bearer ${u.apiKey}`)
    .send({ topic: 'via bearer', content: 'a', repo: 'noted' })
    .expect(200);
  await request(app)
    .post('/api/claude/push')
    .set('x-api-key', u.apiKey)
    .send({ topic: 'via header', content: 'b' })
    .expect(200);

  const list = await u.agent.get('/api/claude/pushed').expect(200);
  assert.equal(list.body.length, 2);
  assert.equal(list.body.every((i) => !i.read), true);

  const first = list.body[0];
  await u.agent.post(`/api/claude/pushed/${first.id}/read`).set('X-CSRF-Token', u.csrf).expect(200);
  const after = await u.agent.get('/api/claude/pushed').expect(200);
  assert.equal(after.body.find((i) => i.id === first.id).read, 1);

  await u.agent.delete('/api/claude/pushed/' + first.id).set('X-CSRF-Token', u.csrf).expect(200);
  const remaining = await u.agent.get('/api/claude/pushed').expect(200);
  assert.equal(remaining.body.length, 1);
});

test('outbox -> inbox -> ack flow', async () => {
  const u = await makeUser();
  await u.agent
    .post('/api/claude/outbox')
    .set('X-CSRF-Token', u.csrf)
    .send({ topic: 'remember', content: 'the milk' })
    .expect(200);

  const unread = await request(app)
    .get('/api/claude/inbox?unread=true')
    .set('Authorization', `Bearer ${u.apiKey}`)
    .expect(200);
  assert.equal(unread.body.length, 1);
  assert.equal(unread.body[0].topic, 'remember');

  await request(app)
    .post(`/api/claude/inbox/${unread.body[0].id}/ack`)
    .set('Authorization', `Bearer ${u.apiKey}`)
    .expect(200);

  const afterAck = await request(app)
    .get('/api/claude/inbox?unread=true')
    .set('Authorization', `Bearer ${u.apiKey}`)
    .expect(200);
  assert.equal(afterAck.body.length, 0);

  const outbox = await u.agent.get('/api/claude/outbox').expect(200);
  assert.ok(outbox.body[0].fetched_at);

  await u.agent.delete('/api/claude/outbox/' + outbox.body[0].id).set('X-CSRF-Token', u.csrf).expect(200);
  const empty = await u.agent.get('/api/claude/outbox').expect(200);
  assert.equal(empty.body.length, 0);
});

test('api keys are user-scoped', async () => {
  const a = await makeUser();
  const b = await makeUser();
  await request(app)
    .post('/api/claude/push')
    .set('Authorization', `Bearer ${a.apiKey}`)
    .send({ topic: 'for a', content: 'x' })
    .expect(200);
  const bList = await b.agent.get('/api/claude/pushed').expect(200);
  assert.equal(bList.body.length, 0);
});

test('note and pushed downloads set filename and type', async () => {
  const u = await makeUser();
  const note = await u.agent
    .post('/api/notes')
    .set('X-CSRF-Token', u.csrf)
    .send({ title: 'My Note', content: 'body', format: 'markdown' })
    .expect(200);
  const dl = await u.agent.get(`/api/notes/${note.body.id}/download`).expect(200);
  assert.match(dl.headers['content-disposition'], /attachment; filename="My Note\.md"/);
  assert.match(dl.headers['content-type'], /text\/markdown/);
  assert.equal(dl.text, 'body');

  await request(app)
    .post('/api/claude/push')
    .set('Authorization', `Bearer ${u.apiKey}`)
    .send({ topic: 'Pushed Note', content: '# hi' })
    .expect(200);
  const pushed = await u.agent.get('/api/claude/pushed').expect(200);
  const pdl = await u.agent.get(`/api/claude/pushed/${pushed.body[0].id}/download`).expect(200);
  assert.match(pdl.headers['content-disposition'], /Pushed Note\.md/);
  assert.equal(pdl.text, '# hi');
});
