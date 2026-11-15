const app = require('./app');
const config = require('./config');

app.listen(config.port, config.host, () =>
  console.log(`noted listening on ${config.host || '*'}:${config.port}`)
);
