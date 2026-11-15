const { test } = require('node:test');
const assert = require('node:assert/strict');
const { app, makeUser, request } = require('./helper');

test('register rejects short passwords', async () => {
  const res = await request(app).post('/api/auth/register').send({ username: 'shorty', password: '1234567' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'username_and_password_min_8_required');
});

test('register rejects duplicate usernames', async () => {
  const u = await makeUser();
  const res = await request(app).post('/api/auth/register').send({ username: u.username, password: 'password123' });
  assert.equal(res.status, 409);
  assert.equal(res.body.error, 'username_taken');
});

test('login works with valid credentials and rejects bad ones', async () => {
  const u = await makeUser();
  const ok = await request(app).post('/api/auth/login').send({ username: u.username, password: 'password123' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.username, u.username);
  assert.ok(ok.body.csrf_token);

  const bad = await request(app).post('/api/auth/login').send({ username: u.username, password: 'wrong-password' });
  assert.equal(bad.status, 401);
});

test('/me requires a session', async () => {
  const res = await request(app).get('/api/auth/me');
  assert.equal(res.status, 401);
});

test('/me returns the user with api key for a session', async () => {
  const u = await makeUser();
  const res = await u.agent.get('/api/auth/me').expect(200);
  assert.equal(res.body.username, u.username);
  assert.equal(res.body.api_key, u.apiKey);
});

test('logout destroys the session', async () => {
  const u = await makeUser();
  await u.agent.post('/api/auth/logout').set('X-CSRF-Token', u.csrf).expect(200);
  const res = await u.agent.get('/api/auth/me');
  assert.equal(res.status, 401);
});

test('theme update validates values', async () => {
  const u = await makeUser();
  const bad = await u.agent.put('/api/auth/me/theme').set('X-CSRF-Token', u.csrf).send({ theme: 'neon' });
  assert.equal(bad.status, 400);
  const ok = await u.agent.put('/api/auth/me/theme').set('X-CSRF-Token', u.csrf).send({ theme: 'dark' });
  assert.equal(ok.status, 200);
  const me = await u.agent.get('/api/auth/me').expect(200);
  assert.equal(me.body.theme, 'dark');
});

test('regenerating the api key invalidates the old one', async () => {
  const u = await makeUser();
  await request(app).get('/api/claude/inbox').set('Authorization', `Bearer ${u.apiKey}`).expect(200);
  const res = await u.agent.post('/api/auth/me/regenerate-key').set('X-CSRF-Token', u.csrf).expect(200);
  const newKey = res.body.api_key;
  assert.notEqual(newKey, u.apiKey);
  await request(app).get('/api/claude/inbox').set('Authorization', `Bearer ${u.apiKey}`).expect(401);
  await request(app).get('/api/claude/inbox').set('Authorization', `Bearer ${newKey}`).expect(200);
});
