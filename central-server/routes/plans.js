'use strict';

const express = require('express');
const { getDb } = require('../lib/db');
const { authenticatePlatformUser, requirePlatformPermission } = require('../middleware/auth');

const router = express.Router();

router.get(
  '/',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.plans.view', 'platform.plans.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const plans = await db.all('SELECT * FROM platform_plans ORDER BY sort_order, price');
      res.json(plans);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
