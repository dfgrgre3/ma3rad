'use strict';

const express = require('express');

const authRoutes = require('./auth');
const staffRoutes = require('./staff');
const tenantRoutes = require('./tenants');
const planRoutes = require('./plans');
const licenseRoutes = require('./licenses');
const deviceRoutes = require('./devices');
const systemRoutes = require('./system');

/**
 * Mounts every central API router under /api/v1.
 *
 * Path shapes are identical to the original monolithic server so existing
 * clients (desktop app, tests) keep working unchanged.
 */
function createApiRouter() {
  const router = express.Router();

  router.use('/admin/auth', authRoutes);
  router.use('/admin/staff', staffRoutes);
  router.use('/admin/tenants', tenantRoutes);
  router.use('/admin/plans', planRoutes);
  router.use('/admin/licenses', licenseRoutes);
  router.use('/admin/devices', deviceRoutes);
  router.use('/', systemRoutes);

  return router;
}

module.exports = { createApiRouter };
