const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makeUser } = require('./helper');

function post(u, path, body) {
  return u.agent.post('/api' + path).set('X-CSRF-Token', u.csrf).send(body || {});
}
function put(u, path, body) {
  return u.agent.put('/api' + path).set('X-CSRF-Token', u.csrf).send(body || {});
}

test('tag names are normalized', async () => {
  const u = await makeUser();
  const res = await post(u, '/tags', { name: '  #Foo Bar  ' }).expect(200);
  assert.equal(res.body.name, 'foo-bar');
});

test('empty or invalid tag names are rejected', async () => {
  const u = await makeUser();
  assert.equal((await post(u, '/tags', { name: '   ' })).status, 400);
  assert.equal((await post(u, '/tags', { name: '#' })).status, 400);
  assert.equal((await post(u, '/tags', {})).status, 400);
});

test('duplicate tags are rejected', async () => {
  const u = await makeUser();
  await post(u, '/tags', { name: 'work' }).expect(200);
  const dup = await post(u, '/tags', { name: '#WORK' });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error, 'tag_exists');
});

test('rename tag, including 409 on collision', async () => {
  const u = await makeUser();
  const a = await post(u, '/tags', { name: 'aaa' }).expect(200);
  await post(u, '/tags', { name: 'bbb' }).expect(200);
  await put(u, '/tags/' + a.body.id, { name: 'ccc' }).expect(200);
  const clash = await put(u, '/tags/' + a.body.id, { name: 'bbb' });
  assert.equal(clash.status, 409);
});

test('PUT /notes/:id with tags replaces the full set and auto-creates tags', async () => {
  const u = await makeUser();
  const note = await post(u, '/notes', { title: 'n' }).expect(200);

  const first = await put(u, '/notes/' + note.body.id, { tags: ['alpha', '#Beta'] }).expect(200);
  assert.deepEqual(first.body.tags.map((t) => t.name), ['alpha', 'beta']);

  const second = await put(u, '/notes/' + note.body.id, { tags: ['beta', 'gamma'] }).expect(200);
  assert.deepEqual(second.body.tags.map((t) => t.name).sort(), ['beta', 'gamma']);

  const cleared = await put(u, '/notes/' + note.body.id, { tags: [] }).expect(200);
  assert.deepEqual(cleared.body.tags, []);
});

test('invalid tag in a note update is rejected', async () => {
  const u = await makeUser();
  const note = await post(u, '/notes', { title: 'n' }).expect(200);
  const res = await put(u, '/notes/' + note.body.id, { tags: ['ok', '  '] });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'invalid_tag');
});

test('filter notes by tag, alone and combined with q', async () => {
  const u = await makeUser();
  const a = await post(u, '/notes', { title: 'apples', content: 'fruit list' }).expect(200);
  const b = await post(u, '/notes', { title: 'bananas', content: 'fruit list' }).expect(200);
  await post(u, '/notes', { title: 'carrots', content: 'veg' }).expect(200);
  await put(u, '/notes/' + a.body.id, { tags: ['shopping'] }).expect(200);
  await put(u, '/notes/' + b.body.id, { tags: ['shopping'] }).expect(200);

  const byTag = await u.agent.get('/api/notes?tag=shopping').expect(200);
  assert.equal(byTag.body.length, 2);

  const combined = await u.agent.get('/api/notes?tag=shopping&q=apples').expect(200);
  assert.deepEqual(combined.body.map((n) => n.title), ['apples']);
});

test('GET /tags returns note counts', async () => {
  const u = await makeUser();
  const a = await post(u, '/notes', { title: 'a' }).expect(200);
  const b = await post(u, '/notes', { title: 'b' }).expect(200);
  await put(u, '/notes/' + a.body.id, { tags: ['shared', 'solo'] }).expect(200);
  await put(u, '/notes/' + b.body.id, { tags: ['shared'] }).expect(200);

  const tags = await u.agent.get('/api/tags').expect(200);
  const byName = Object.fromEntries(tags.body.map((t) => [t.name, t.note_count]));
  assert.equal(byName.shared, 2);
  assert.equal(byName.solo, 1);
});

test('deleting a tag removes it from notes; deleting a note updates counts', async () => {
  const u = await makeUser();
  const note = await post(u, '/notes', { title: 'n' }).expect(200);
  await put(u, '/notes/' + note.body.id, { tags: ['doomed'] }).expect(200);
  const tags = await u.agent.get('/api/tags').expect(200);
  const doomed = tags.body.find((t) => t.name === 'doomed');

  await u.agent.delete('/api/tags/' + doomed.id).set('X-CSRF-Token', u.csrf).expect(200);
  const after = await u.agent.get('/api/notes/' + note.body.id).expect(200);
  assert.deepEqual(after.body.tags, []);

  // Note delete cascades note_tags.
  await put(u, '/notes/' + note.body.id, { tags: ['kept'] }).expect(200);
  await u.agent.delete('/api/notes/' + note.body.id).set('X-CSRF-Token', u.csrf).expect(200);
  const counts = await u.agent.get('/api/tags').expect(200);
  assert.equal(counts.body.find((t) => t.name === 'kept').note_count, 0);
});

test('tags are scoped per user', async () => {
  const a = await makeUser();
  const b = await makeUser();
  const tag = await post(a, '/tags', { name: 'mine' }).expect(200);
  const list = await b.agent.get('/api/tags').expect(200);
  assert.equal(list.body.length, 0);
  await b.agent.delete('/api/tags/' + tag.body.id).set('X-CSRF-Token', b.csrf).expect(404);
});
