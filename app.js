const express = require('express');
const config = require('./config');
const sessionMw = require('./middleware/session');
const apiRouter = require('./routes');
const vendorRouter = require('./routes/vendor');
const errorHandler = require('./middleware/errorHandler');
const spaFallback = require('./middleware/spaFallback');

const app = express();

if (config.trustProxy) app.set('trust proxy', 1);

app.use(express.json({ limit: '2mb' }));
app.use(sessionMw);

app.use('/api', apiRouter);
app.use('/vendor', vendorRouter);
app.use(express.static(config.publicDir));
app.get(/^\/(?!api\/).*/, spaFallback);

app.use(errorHandler);

module.exports = app;
