'use strict';

const express = require('express');

const authRoutes = require('./auth');
const staffRoutes = require('./staff');
const tenantRoutes = require('./tenants');
const planRoutes = require('./plans');
const licenseRoutes = require('./licenses');
const deviceRoutes = require('./devices');
const billingRoutes = require('./billing');
const subscriptionRoutes = require('./subscriptions');
const operationsRoutes = require('./operations');
const integrationsRoutes = require('./integrations');
const notificationsRoutes = require('./notifications');
const backupsRoutes = require('./backups');
const policiesRoutes = require('./policies');
const systemRoutes = require('./system');
const configRoutes = require('./config');
const supportRoutes = require('./support');
const monitoringRoutes = require('./monitoring');
const telemetryRoutes = require('./telemetry');
const licensingRoutes = require('./licensing');
const { adminRouter: releasesAdminRoutes, clientRouter: releasesClientRoutes } = require('./releases');
const { adminRouter: appBackupsAdminRoutes, clientRouter: appBackupsClientRoutes } = require('./appBackups');
const moduleRoutes = require('./modules');
const adminExtraRoutes = require('./adminExtra');
const provisioningRoutes = require('./provisioning');
const tenantUserSyncRoutes = require('./tenantUserSync');
const tenantApiRoutes = require('./tenantApi');
const deviceNotificationsRoutes = require('./deviceNotifications');

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
  router.use('/admin/subscriptions', subscriptionRoutes);
  router.use('/admin/operations', operationsRoutes);
  router.use('/admin/integrations', integrationsRoutes);
  router.use('/admin/notifications', notificationsRoutes);
  router.use('/admin/backups', backupsRoutes);
  router.use('/admin/app-backups', appBackupsAdminRoutes);
  router.use('/admin/policies', policiesRoutes);
  router.use('/admin/support', supportRoutes);
  router.use('/admin/monitoring', monitoringRoutes);
  router.use('/admin/releases', releasesAdminRoutes);
  router.use('/', adminExtraRoutes);
  router.use('/telemetry', telemetryRoutes);
  router.use('/licensing', licensingRoutes);
  router.use('/releases', releasesClientRoutes);
  router.use('/modules', moduleRoutes);
  router.use('/device/backups', appBackupsClientRoutes);
  router.use('/device/provisioning', provisioningRoutes);
  router.use('/device/tenant-users', tenantUserSyncRoutes);
  router.use('/device/notifications', deviceNotificationsRoutes);
  router.use('/tenant/v1', tenantApiRoutes);
  router.use('/', systemRoutes);
  router.use('/', configRoutes);

  return router;
}

module.exports = { createApiRouter };
