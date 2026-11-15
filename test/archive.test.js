const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makeUser } = require('./helper');

function post(u, path, body) {
  return u.agent.post('/api' + path).set('X-CSRF-Token', u.csrf).send(body || {});
}

test('archive hides a note from default list and search; unarchive restores it', async () => {
  const u = await makeUser();
  const note = await post(u, '/notes', { title: 'old plan', content: 'quarterly goals' }).expect(200);
  assert.equal(note.body.archived_at, null);

  const archived = await post(u, '/notes/' + note.body.id + '/archive').expect(200);
  assert.ok(archived.body.archived_at);

  const list = await u.agent.get('/api/notes').expect(200);
  assert.equal(list.body.length, 0);
  const search = await u.agent.get('/api/notes?q=quarterly').expect(200);
  assert.equal(search.body.length, 0);

  const archiveView = await u.agent.get('/api/notes?archived=true').expect(200);
  assert.deepEqual(archiveView.body.map((n) => n.title), ['old plan']);

  const restored = await post(u, '/notes/' + note.body.id + '/unarchive').expect(200);
  assert.equal(restored.body.archived_at, null);
  const after = await u.agent.get('/api/notes').expect(200);
  assert.equal(after.body.length, 1);
});

test('archiving does not bump updated_at', async () => {
  const u = await makeUser();
  const note = await post(u, '/notes', { title: 'n' }).expect(200);
  const archived = await post(u, '/notes/' + note.body.id + '/archive').expect(200);
  assert.equal(archived.body.updated_at, note.body.updated_at);
});

test('cannot archive another user\'s note', async () => {
  const a = await makeUser();
  const b = await makeUser();
  const note = await post(a, '/notes', { title: 'mine' }).expect(200);
  await post(b, '/notes/' + note.body.id + '/archive').expect(404);
});
