const { test } = require('node:test');
const assert = require('node:assert/strict');
const { app, makeUser, request } = require('./helper');

test('mutating session request without CSRF token is rejected', async () => {
  const u = await makeUser();
  const res = await u.agent.post('/api/notes').send({ title: 'x' });
  assert.equal(res.status, 403);
  assert.equal(res.body.error, 'csrf_invalid');
});

test('mutating session request with wrong CSRF token is rejected', async () => {
  const u = await makeUser();
  const res = await u.agent.post('/api/notes').set('X-CSRF-Token', 'nope').send({ title: 'x' });
  assert.equal(res.status, 403);
});

test('mutating session request with CSRF token succeeds', async () => {
  const u = await makeUser();
  const res = await u.agent.post('/api/notes').set('X-CSRF-Token', u.csrf).send({ title: 'x' });
  assert.equal(res.status, 200);
});

test('GET requests do not require CSRF', async () => {
  const u = await makeUser();
  await u.agent.get('/api/notes').expect(200);
});

test('Bearer api-key requests are exempt from CSRF', async () => {
  const u = await makeUser();
  const res = await request(app)
    .post('/api/claude/push')
    .set('Authorization', `Bearer ${u.apiKey}`)
    .send({ topic: 't', content: 'c' });
  assert.equal(res.status, 200);
});
