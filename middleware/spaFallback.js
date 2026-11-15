const path = require('path');
const config = require('../config');

// Catch any non-API GET and return the SPA shell so client-side routing works.
module.exports = function spaFallback(_req, res) {
  res.sendFile(path.join(config.publicDir, 'index.html'));
};
