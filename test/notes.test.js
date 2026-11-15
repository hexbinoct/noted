const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makeUser } = require('./helper');

function post(u, path, body) {
  return u.agent.post('/api' + path).set('X-CSRF-Token', u.csrf).send(body || {});
}
function put(u, path, body) {
  return u.agent.put('/api' + path).set('X-CSRF-Token', u.csrf).send(body || {});
}

test('note CRUD lifecycle', async () => {
  const u = await makeUser();
  const created = await post(u, '/notes', { title: 'First', content: 'hello world' }).expect(200);
  assert.equal(created.body.title, 'First');
  assert.deepEqual(created.body.tags, []);

  const got = await u.agent.get('/api/notes/' + created.body.id).expect(200);
  assert.equal(got.body.content, 'hello world');

  const updated = await put(u, '/notes/' + created.body.id, { title: 'Renamed' }).expect(200);
  assert.equal(updated.body.title, 'Renamed');

  const list = await u.agent.get('/api/notes').expect(200);
  assert.equal(list.body.length, 1);

  await u.agent.delete('/api/notes/' + created.body.id).set('X-CSRF-Token', u.csrf).expect(200);
  await u.agent.get('/api/notes/' + created.body.id).expect(404);
});

test('creating a note in an invalid folder fails', async () => {
  const u = await makeUser();
  const res = await post(u, '/notes', { title: 'x', folder_id: 9999 });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'invalid_folder');
});

test('folder filtering: folder_id=null returns only unfiled notes', async () => {
  const u = await makeUser();
  const folder = await post(u, '/folders', { name: 'Work' }).expect(200);
  await post(u, '/notes', { title: 'filed', folder_id: folder.body.id }).expect(200);
  await post(u, '/notes', { title: 'unfiled' }).expect(200);

  const unfiled = await u.agent.get('/api/notes?folder_id=null').expect(200);
  assert.deepEqual(unfiled.body.map((n) => n.title), ['unfiled']);

  const filed = await u.agent.get('/api/notes?folder_id=' + folder.body.id).expect(200);
  assert.deepEqual(filed.body.map((n) => n.title), ['filed']);
});

test('search matches title and content', async () => {
  const u = await makeUser();
  await post(u, '/notes', { title: 'groceries', content: 'milk eggs' }).expect(200);
  await post(u, '/notes', { title: 'other', content: 'buy milk tomorrow' }).expect(200);
  await post(u, '/notes', { title: 'unrelated', content: 'nothing' }).expect(200);

  const res = await u.agent.get('/api/notes?q=milk').expect(200);
  assert.equal(res.body.length, 2);
});

test('list preview is truncated to 200 chars', async () => {
  const u = await makeUser();
  await post(u, '/notes', { title: 'long', content: 'x'.repeat(500) }).expect(200);
  const res = await u.agent.get('/api/notes').expect(200);
  assert.equal(res.body[0].preview.length, 200);
});

test('users cannot see or mutate each other\'s notes', async () => {
  const a = await makeUser();
  const b = await makeUser();
  const note = await post(a, '/notes', { title: 'private' }).expect(200);

  await b.agent.get('/api/notes/' + note.body.id).expect(404);
  await put(b, '/notes/' + note.body.id, { title: 'stolen' }).expect(404);
  await b.agent.delete('/api/notes/' + note.body.id).set('X-CSRF-Token', b.csrf).expect(404);

  const list = await b.agent.get('/api/notes').expect(200);
  assert.equal(list.body.length, 0);
});
