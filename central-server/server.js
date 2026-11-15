'use strict';

require('dotenv').config();

const cron = require('node-cron');

const { app } = require('./app');
const { initDatabase, getDb, bootstrapDefaults, seedPlatformRBAC } = require('./lib/db');
const { initSigningKeys, signCertificate, verifyCertificate } = require('./lib/signing');

const PORT = process.env.PORT || 3001;

/**
 * Daily sweep for licenses and subscriptions that are about to expire or have
 * already expired. Notifications are logged for now; the notification center
 * phase will consume these events instead of the console.
 */
async function checkExpiringLicensesAndSubscriptions() {
  const db = getDb();
  console.log('Running scheduled check for expiring licenses and subscriptions...');

  const horizons = [1, 7, 14, 30];

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
    }
  }

  const expiredLicenses = await db.all(
    `SELECT l.*, t.name AS tenantName
     FROM platform_licenses l
     JOIN platform_tenants t ON t.id = l.tenant_id
     WHERE l.status IN ('ACTIVE', 'ISSUED')
       AND l.expires_at IS NOT NULL
       AND date(l.expires_at) < date('now')`
  );
  for (const license of expiredLicenses) {
    console.log(`License ALREADY EXPIRED: ${license.license_key} for tenant ${license.tenantName}`);
  }

  const expiredSubscriptions = await db.all(
    `SELECT s.*, t.name AS tenantName
     FROM platform_subscriptions s
     JOIN platform_tenants t ON t.id = s.tenant_id
     WHERE s.status IN ('ACTIVE', 'TRIAL')
       AND s.end_date IS NOT NULL
       AND date(s.end_date) < date('now')`
  );
  for (const subscription of expiredSubscriptions) {
    console.log(`Subscription ALREADY EXPIRED: ${subscription.id} for tenant ${subscription.tenantName}`);
  }

  console.log('Scheduled check completed');
}

function scheduleJobs() {
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
