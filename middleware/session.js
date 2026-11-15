const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const config = require('../config');

module.exports = session({
  store: new SQLiteStore({ db: 'sessions.db', dir: config.dataDir }),
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  },
});
