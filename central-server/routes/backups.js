'use strict';
const express = require('express');
const { getDb } = require('../lib/db');
const { authenticatePlatformUser, requirePlatformPermission } = require('../middleware/auth');
const router = express.Router();
router.get('/', authenticatePlatformUser, requirePlatformPermission(['platform.backups.view']), async (req, res, next) => {
  try { const db = getDb(); const rows = await db.all('SELECT * FROM platform_backups ORDER BY created_at DESC'); res.json({ data: rows, meta: { total: rows.length } }); }
  catch (e) { next(e); }
});
module.exports = router;