const express = require('express');
const path = require('path');
const config = require('../config');

const router = express.Router();

const markedPath = path.join(config.nodeModulesDir, 'marked', 'lib', 'marked.umd.js');
const purifyPath = path.join(config.nodeModulesDir, 'dompurify', 'dist', 'purify.min.js');

router.get('/marked.umd.js', (_req, res) => res.type('application/javascript').sendFile(markedPath));
router.get('/purify.min.js', (_req, res) => res.type('application/javascript').sendFile(purifyPath));

module.exports = router;
