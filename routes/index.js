const express = require('express');
const { csrfGuard } = require('../auth');

const router = express.Router();

router.use(csrfGuard);
router.get('/health', (_req, res) => res.json({ ok: true }));
router.use('/auth', require('./auth'));
router.use('/folders', require('./folders'));
router.use('/notes', require('./notes'));
router.use('/tags', require('./tags'));
router.use('/claude', require('./claude'));

module.exports = router;
