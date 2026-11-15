require('dotenv').config();
const path = require('path');
const fs = require('fs');

const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

module.exports = {
  port: Number(process.env.PORT) || 5509,
  host: process.env.HOST || undefined, // e.g. 127.0.0.1 behind a tunnel; unset = all interfaces
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  trustProxy: process.env.TRUST_PROXY === 'true',
  dataDir,
  publicDir: path.join(__dirname, 'public'),
  nodeModulesDir: path.join(__dirname, 'node_modules'),
};
