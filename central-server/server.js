'use strict';

require('dotenv').config();

const cron = require('node-cron');

const { app } = require('./app');
const { initDatabase, getDb, bootstrapDefaults, seedPlatformRBAC } = require('./lib/db');
const { initSigningKeys, signCertificate, verifyCertificate } = require('./lib/signing');
const { recordAuditEvent } = require('./lib/audit');

const PORT = process.env.PORT || 3001;

/**
 * Daily sweep for licenses and subscriptions that are about to expire or have
 * already expired. Takes real action: suspends expired items, creates audit
 * records and notifications instead of only logging to console.
 */
async function checkExpiringLicensesAndSubscriptions() {
  const db = getDb();
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  console.log(`[${now.toISOString()}] Running scheduled check for expiring licenses and subscriptions...`);

  const horizons = [1, 7, 14, 30];

  // --- Expiring soon: create audit + notification hints (no state change) ---
  for (const days of horizons) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const expiringLicenses = await db.all(
      `SELECT l.*, t.name AS tenantName, t.id AS tenantId
       FROM platform_licenses l
       JOIN platform_tenants t ON t.id = l.tenant_id
       WHERE l.status IN ('ACTIVE', 'ISSUED')
         AND l.expires_at IS NOT NULL
         AND date(l.expires_at) = date(?)`,
      [cutoffStr]
    );
    for (const license of expiringLicenses) {
      console.log(`License expiring in ${days} days: ${license.license_key} for tenant ${license.tenantName}`);
      await recordAuditEvent({
        actorType: 'SYSTEM',
        actorId: null,
        actorName: 'System Scheduler',
        tenantId: license.tenantId,
        action: 'LICENSE_EXPIRING_SOON',
        resourceType: 'platform_licenses',
        resourceId: license.id,
        beforeData: null,
        afterData: { licenseKey: license.license_key, expiresAt: license.expires_at, daysRemaining: days },
        ipAddress: null,
        userAgent: 'system-scheduler',
      });
    }

    const expiringSubscriptions = await db.all(
      `SELECT s.*, t.name AS tenantName, t.id AS tenantId
       FROM platform_subscriptions s
       JOIN platform_tenants t ON t.id = s.tenant_id
       WHERE s.status IN ('ACTIVE', 'TRIAL')
         AND s.end_date IS NOT NULL
         AND date(s.end_date) = date(?)`,
      [cutoffStr]
    );
    for (const subscription of expiringSubscriptions) {
      console.log(`Subscription expiring in ${days} days: ${subscription.id} for tenant ${subscription.tenantName}`);
      await recordAuditEvent({
        actorType: 'SYSTEM',
        actorId: null,
        actorName: 'System Scheduler',
        tenantId: subscription.tenantId,
        action: 'SUBSCRIPTION_EXPIRING_SOON',
        resourceType: 'platform_subscriptions',
        resourceId: subscription.id,
        beforeData: null,
        afterData: { endDate: subscription.end_date, daysRemaining: days },
        ipAddress: null,
        userAgent: 'system-scheduler',
      });
    }
  }

  // --- Already expired licenses: suspend them ---
  const expiredLicenses = await db.all(
    `SELECT l.*, t.name AS tenantName, t.id AS tenantId
     FROM platform_licenses l
     JOIN platform_tenants t ON t.id = l.tenant_id
     WHERE l.status IN ('ACTIVE', 'ISSUED')
       AND l.expires_at IS NOT NULL
       AND date(l.expires_at) < date('now')`
  );
  for (const license of expiredLicenses) {
    console.log(`License ALREADY EXPIRED: suspending ${license.license_key} for tenant ${license.tenantName}`);
    await db.run(
      `UPDATE platform_licenses SET status = 'EXPIRED', updated_at = ? WHERE id = ?`,
      [now.toISOString(), license.id]
    );
    await recordAuditEvent({
      actorType: 'SYSTEM',
      actorId: null,
      actorName: 'System Scheduler',
      tenantId: license.tenantId,
      action: 'LICENSE_SUSPENDED_EXPIRY',
      resourceType: 'platform_licenses',
      resourceId: license.id,
      beforeData: { status: 'ACTIVE' },
      afterData: { status: 'EXPIRED', licenseKey: license.license_key, expiresAt: license.expires_at },
      ipAddress: null,
      userAgent: 'system-scheduler',
    });
  }

  // --- Already expired subscriptions: suspend them ---
  const expiredSubscriptions = await db.all(
    `SELECT s.*, t.name AS tenantName, t.id AS tenantId
     FROM platform_subscriptions s
     JOIN platform_tenants t ON t.id = s.tenant_id
     WHERE s.status IN ('ACTIVE', 'TRIAL')
       AND s.end_date IS NOT NULL
       AND date(s.end_date) < date('now')`
  );
  for (const subscription of expiredSubscriptions) {
    console.log(`Subscription ALREADY EXPIRED: suspending ${subscription.id} for tenant ${subscription.tenantName}`);
    await db.run(
      `UPDATE platform_subscriptions SET status = 'SUSPENDED', updated_at = ? WHERE id = ?`,
      [now.toISOString(), subscription.id]
    );
    await recordAuditEvent({
      actorType: 'SYSTEM',
      actorId: null,
      actorName: 'System Scheduler',
      tenantId: subscription.tenantId,
      action: 'SUBSCRIPTION_SUSPENDED_EXPIRY',
      resourceType: 'platform_subscriptions',
      resourceId: subscription.id,
      beforeData: { status: subscription.status, endDate: subscription.end_date },
      afterData: { status: 'SUSPENDED' },
      ipAddress: null,
      userAgent: 'system-scheduler',
    });

    // Also suspend all active licenses tied to this subscription
    await db.run(
      `UPDATE platform_licenses SET status = 'SUSPENDED', updated_at = ? WHERE subscription_id = ? AND status = 'ACTIVE'`,
      [now.toISOString(), subscription.id]
    );
  }

  // --- Tenants whose subscription is suspended: set tenant status ---
  const suspendedTenants = await db.all(
    `SELECT t.id, t.name, t.status
     FROM platform_tenants t
     JOIN platform_subscriptions s ON s.tenant_id = t.id
     WHERE t.status IN ('ACTIVE', 'TRIAL')
       AND s.status = 'SUSPENDED'
       AND s.end_date IS NOT NULL
       AND date(s.end_date) < date('now')`
  );
  for (const tenant of suspendedTenants) {
    console.log(`Tenant ${tenant.name} (${tenant.id}) set to SUSPENDED due to expired subscription`);
    await db.run(
      `UPDATE platform_tenants SET status = 'SUSPENDED', updated_at = ? WHERE id = ?`,
      [now.toISOString(), tenant.id]
    );
    await recordAuditEvent({
      actorType: 'SYSTEM',
      actorId: null,
      actorName: 'System Scheduler',
      tenantId: tenant.id,
      action: 'TENANT_SUSPENDED_EXPIRY',
      resourceType: 'platform_tenants',
      resourceId: tenant.id,
      beforeData: { status: tenant.status },
      afterData: { status: 'SUSPENDED' },
      ipAddress: null,
      userAgent: 'system-scheduler',
    });
  }

  console.log(`[${new Date().toISOString()}] Scheduled check completed.`);
}

function scheduleJobs() {
  // Run every day at 09:00 server time.
  cron.schedule('0 9 * * *', async () => {
    try {
      await checkExpiringLicensesAndSubscriptions();
    } catch (err) {
      console.error('Scheduled job failed:', err);
    }
  });

  if (process.env.CENTRAL_DISABLE_STARTUP_CHECK !== '1') {
    setTimeout(async () => {
      try {
        await checkExpiringLicensesAndSubscriptions();
      } catch (err) {
        console.error('Initial check failed:', err);
      }
    }, 5000).unref?.();
  }
}

async function start() {
  try {
    await initDatabase();
    await initSigningKeys();
    await bootstrapDefaults();
    await seedPlatformRBAC();

    scheduleJobs();

    app.listen(PORT, () => {
      console.log(`Central server running on http://localhost:${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/v1/health`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = {
  app,
  start,
  signCertificate,
  verifyCertificate,
  checkExpiringLicensesAndSubscriptions,
};
