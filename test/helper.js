// Shared test bootstrap. MUST be required before anything that touches db.js:
// it points DATA_DIR at a fresh temp dir so each test file (node --test runs
// each file in its own process) gets its own SQLite database.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'noted-test-'));

const supertest = require('supertest');
const app = require('../app');

let counter = 0;

// Register a fresh user. Returns a cookie-persisting agent plus the CSRF
// token and API key captured from the register response.
async function makeUser(name) {
  const username = name || `user_${process.pid}_${++counter}`;
  const agent = supertest.agent(app);
  const res = await agent
    .post('/api/auth/register')
    .send({ username, password: 'password123' })
    .expect(200);
  return {
    agent,
    username,
    userId: res.body.id,
    csrf: res.body.csrf_token,
    apiKey: res.body.api_key,
  };
}

module.exports = { app, makeUser, request: supertest };
