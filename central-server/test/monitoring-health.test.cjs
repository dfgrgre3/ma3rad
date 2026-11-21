'use strict';

process.env.NODE_ENV = 'test';
process.env.CENTRAL_DISABLE_STARTUP_CHECK = '1';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { createApp } = require('../app');
const { initDatabase, getDb, bootstrapDefaults, seedPlatformRBAC } = require('../lib/db');
const { initSigningKeys } = require('../lib/signing');
const { invalidatePermissionsCache } = require('../identity');
const { tempDbPath, removeDbFiles, startTestServer, api } = require('./helpers.cjs');

const dbPath = tempDbPath('monitoring-health');
const DEVICE_CREDENTIAL = 'device-secret-123';
const DEVICE_CREDENTIAL_HASH = crypto.createHash('sha256').update(DEVICE_CREDENTIAL, 'utf8').digest('hex');

let server;
let token;
let tenantId;
let deviceId;

async function login() {
  const response = await api(server.base, '/api/v1/admin/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'admin-test-pass' },
  });
  return response.body.data.token;
}

before(async () => {
  await initDatabase({ filename: dbPath });
  await initSigningKeys();
  await bootstrapDefaults({ initialPassword: 'admin-test-pass' });
  await seedPlatformRBAC();
  invalidatePermissionsCache();
  server = await startTestServer(createApp());
  token = await login();

  const db = getDb();
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO platform_plans (id, code, name, devices_limit, created_at, updated_at)
     VALUES ('plan_mh', 'MH', 'Monitoring', 10, ?, ?)`,
    [now, now]
  );
  await db.run(
    `INSERT INTO platform_tenants (id, code, name, status, plan_id, devices_limit, created_at, updated_at)
     VALUES ('tnt_mh', 'MHT', 'Monitoring Co', 'ACTIVE', 'plan_mh', 10, ?, ?)`,
    [now, now]
  );
  tenantId = 'tnt_mh';
  deviceId = 'dev_mh_1';
  await db.run(
    `INSERT INTO platform_devices
       (id, tenant_id, hardware_id, name, os, app_version, status, credential_hash, last_seen_at, created_at, updated_at)
     VALUES (?, ?, 'hw-mh-1', 'Branch PC', 'win32', '1.0.0', 'ACTIVE', ?, ?, ?, ?)`,
    [deviceId, tenantId, DEVICE_CREDENTIAL_HASH, now, now, now]
  );
});

after(async () => {
  await server?.close();
  await getDb().close();
  removeDbFiles(dbPath);
});

test('POST /telemetry/metrics validates payload and device credential', async () => {
  const empty = await api(server.base, '/api/v1/telemetry/metrics', {
    method: 'POST', body: { deviceId, deviceCredential: DEVICE_CREDENTIAL, metrics: [] },
  });
  assert.equal(empty.status, 400);

  const badValue = await api(server.base, '/api/v1/telemetry/metrics', {
    method: 'POST',
    body: { deviceId, deviceCredential: DEVICE_CREDENTIAL, metrics: [{ name: 'cpu', value: 'high' }] },
  });
  assert.equal(badValue.status, 400);

  const forged = await api(server.base, '/api/v1/telemetry/metrics', {
    method: 'POST',
    body: {
      deviceId, deviceCredential: 'forged',
      metrics: [{ name: 'cpu_percent', value: 42 }],
    },
  });
  assert.equal(forged.status, 401);
});

test('POST /telemetry/metrics stores device metrics with resolved tenant', async () => {
  const res = await api(server.base, '/api/v1/telemetry/metrics', {
    method: 'POST',
    body: {
      deviceId, deviceCredential: DEVICE_CREDENTIAL, deviceName: 'Branch PC',
      appVersion: '1.2.3', os: 'win32',
      metrics: [
        { name: 'cpu_percent', value: 37.5, unit: '%', status: 'OK' },
        { name: 'memory_percent', value: 61.2, unit: '%' },
        { name: 'disk_percent', value: 88.0, unit: '%', status: 'WARNING' },
      ],
    },
  });
  assert.equal(res.status, 201, res.text);
  assert.equal(res.body.data.inserted, 3);

  const db = getDb();
  const rows = await db.all(
    `SELECT * FROM platform_health_metrics WHERE device_id = ? ORDER BY metric_name`,
    [deviceId]
  );
  assert.equal(rows.length, 3);
  for (const row of rows) {
    assert.equal(row.tenant_id, tenantId);
    assert.equal(row.device_name, 'Branch PC');
  }
  const disk = rows.find((r) => r.metric_name === 'disk_percent');
  assert.equal(disk.status, 'WARNING');

  // Liveness side-effects match the heartbeat channel.
  const device = await db.get('SELECT last_seen_at, app_version, os FROM platform_devices WHERE id = ?', [deviceId]);
  assert.equal(device.app_version, '1.2.3');
  assert.equal(device.os, 'win32');
  assert.ok(device.last_seen_at);
});

test('POST /telemetry/metrics accepts non-device callers via tenantId', async () => {
  const res = await api(server.base, '/api/v1/telemetry/metrics', {
    method: 'POST',
    body: {
      tenantId,
      metrics: [{ name: 'server_load', value: 1.5, unit: 'load' }],
    },
  });
  assert.equal(res.status, 201, res.text);
  const row = await getDb().get(
    `SELECT tenant_id, device_id FROM platform_health_metrics WHERE metric_name = 'server_load' ORDER BY recorded_at DESC LIMIT 1`
  );
  assert.equal(row.tenant_id, tenantId);
  assert.equal(row.device_id, null);
});

test('GET /admin/monitoring/health requires auth and returns aggregate sections', async () => {
  const unauth = await api(server.base, '/api/v1/admin/monitoring/health');
  assert.equal(unauth.status, 401);

  const res = await api(server.base, '/api/v1/admin/monitoring/health', { token });
  assert.equal(res.status, 200, res.text);
  const data = res.body.data;
  assert.ok(data.generatedAt);
  assert.ok(data.server.dbLatencyMs >= 0);
  assert.ok(data.server.uptimeSeconds > 0);
  assert.equal(typeof data.server.dbSizeMb, 'number');

  assert.ok(data.devices.total >= 1);
  assert.ok(data.devices.byStatus.ACTIVE >= 1);
  const device = data.devices.rows.find((d) => d.id === deviceId);
  assert.ok(device, 'device listed');
  assert.equal(device.tenantId, tenantId);
  assert.ok(device.metrics.cpu_percent, 'latest device metrics attached');
  assert.equal(device.metrics.disk_percent.status, 'WARNING');

  assert.ok(data.errors && typeof data.errors.total === 'number');
  assert.ok(data.jobs && typeof data.jobs.total === 'number');
  assert.ok(data.backups && typeof data.backups.total === 'number');
  assert.ok(Array.isArray(data.metrics));
  assert.ok(data.metrics.some((m) => m.deviceId === deviceId && m.metricName === 'cpu_percent'));
});

test('GET /admin/monitoring/metrics applies filters', async () => {
  const all = await api(server.base, '/api/v1/admin/monitoring/metrics', { token });
  assert.equal(all.status, 200);
  assert.ok(all.body.data.length >= 4);

  const filtered = await api(
    server.base,
    `/api/v1/admin/monitoring/metrics?deviceId=${deviceId}&metricName=disk_percent`,
    { token }
  );
  assert.equal(filtered.status, 200);
  assert.ok(filtered.body.data.length >= 1);
  for (const row of filtered.body.data) {
    assert.equal(row.deviceId, deviceId);
    assert.equal(row.metricName, 'disk_percent');
    assert.equal(row.tenantName, 'Monitoring Co');
  }

  const byTenant = await api(server.base, `/api/v1/admin/monitoring/metrics?tenantId=${tenantId}`, { token });
  assert.equal(byTenant.status, 200);
  assert.ok(byTenant.body.data.every((m) => m.tenantId === tenantId));
});
