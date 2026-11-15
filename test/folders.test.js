const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makeUser } = require('./helper');

function post(u, path, body) {
  return u.agent.post('/api' + path).set('X-CSRF-Token', u.csrf).send(body || {});
}
function put(u, path, body) {
  return u.agent.put('/api' + path).set('X-CSRF-Token', u.csrf).send(body || {});
}

test('folder CRUD and nesting', async () => {
  const u = await makeUser();
  const parent = await post(u, '/folders', { name: 'Projects' }).expect(200);
  const child = await post(u, '/folders', { name: 'noted', parent_id: parent.body.id }).expect(200);
  assert.equal(child.body.parent_id, parent.body.id);

  const empty = await post(u, '/folders', { name: '   ' });
  assert.equal(empty.status, 400);

  const badParent = await post(u, '/folders', { name: 'x', parent_id: 9999 });
  assert.equal(badParent.status, 400);
  assert.equal(badParent.body.error, 'invalid_parent');

  await put(u, '/folders/' + child.body.id, { name: 'renamed' }).expect(200);
  const selfParent = await put(u, '/folders/' + child.body.id, { parent_id: child.body.id });
  assert.equal(selfParent.status, 400);

  const list = await u.agent.get('/api/folders').expect(200);
  assert.equal(list.body.length, 2);
});

test('deleting a folder cascades children and unfiles its notes', async () => {
  const u = await makeUser();
  const parent = await post(u, '/folders', { name: 'Parent' }).expect(200);
  await post(u, '/folders', { name: 'Child', parent_id: parent.body.id }).expect(200);
  const note = await post(u, '/notes', { title: 'inside', folder_id: parent.body.id }).expect(200);

  await u.agent.delete('/api/folders/' + parent.body.id).set('X-CSRF-Token', u.csrf).expect(200);

  const folders = await u.agent.get('/api/folders').expect(200);
  assert.equal(folders.body.length, 0);

  const after = await u.agent.get('/api/notes/' + note.body.id).expect(200);
  assert.equal(after.body.folder_id, null);
});

test('folders are scoped per user', async () => {
  const a = await makeUser();
  const b = await makeUser();
  const folder = await post(a, '/folders', { name: 'private' }).expect(200);
  await b.agent.delete('/api/folders/' + folder.body.id).set('X-CSRF-Token', b.csrf).expect(404);
  const list = await b.agent.get('/api/folders').expect(200);
  assert.equal(list.body.length, 0);
});
