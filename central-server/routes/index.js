'use strict';

const express = require('express');

const authRoutes = require('./auth');
const staffRoutes = require('./staff');
const tenantRoutes = require('./tenants');
const planRoutes = require('./plans');
const licenseRoutes = require('./licenses');
const deviceRoutes = require('./devices');
const billingRoutes = require('./billing');
const operationsRoutes = require('./operations');
const integrationsRoutes = require('./integrations');
const notificationsRoutes = require('./notifications');
const backupsRoutes = require('./backups');
const policiesRoutes = require('./policies');
const systemRoutes = require('./system');
const configRoutes = require('./config');

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
  router.use('/admin/billing', billingRoutes);
  router.use('/admin/operations', operationsRoutes);
  router.use('/admin/integrations', integrationsRoutes);
  router.use('/admin/notifications', notificationsRoutes);
  router.use('/admin/backups', backupsRoutes);
  router.use('/admin/policies', policiesRoutes);
  router.use('/', systemRoutes);
  router.use('/', configRoutes);

  return router;
}

module.exports = { createApiRouter };
