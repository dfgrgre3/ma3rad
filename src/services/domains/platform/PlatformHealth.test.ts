import { test } from 'node:test';
import assert from 'node:assert/strict';
import type {
  PlatformServerTelemetry,
  PlatformCentralBackup,
  PlatformServiceIncident,
  PlatformComprehensiveHealth,
} from './platformTypes';

test('should model live server telemetry correctly', () => {
  const tel: PlatformServerTelemetry = {
    id: 'tel_123',
    cpuUsage: 24.5,
    memoryUsage: 55.2,
    diskUsage: 48.0,
    apiLatencyMs: 42,
    apiErrorRate: 0.02,
    redisStatus: 'CONNECTED',
    activeConnections: 180,
    recordedAt: '2026-11-14T20:00:00Z',
  };

  assert.strictEqual(tel.cpuUsage, 24.5);
  assert.strictEqual(tel.redisStatus, 'CONNECTED');
  assert.strictEqual(tel.apiLatencyMs, 42);
});

test('should model verified central backups', () => {
  const backup: PlatformCentralBackup = {
    id: 'bk_001',
    filename: 'ceramisys_vault_backup_20261114.tar.gz',
    sizeBytes: 157286400,
    storageLocation: 's3://vault/backups/',
    status: 'VERIFIED',
    integrityCheckPassed: true,
    createdAt: '2026-11-14T02:00:00Z',
    verifiedAt: '2026-11-14T02:05:00Z',
  };

  assert.strictEqual(backup.status, 'VERIFIED');
  assert.strictEqual(backup.integrityCheckPassed, true);
  assert.ok(backup.sizeBytes > 0);
});

test('should model service incidents with lifecycle state', () => {
  const incident: PlatformServiceIncident = {
    id: 'inc_999',
    serviceName: 'Redis Cache Layer',
    severity: 'HIGH',
    title: 'High memory saturation on cache cluster',
    description: 'Eviction rate exceeded threshold',
    status: 'OPEN',
    createdAt: '2026-11-14T19:00:00Z',
  };

  assert.strictEqual(incident.status, 'OPEN');
  assert.strictEqual(incident.severity, 'HIGH');
});

test('should aggregate comprehensive platform health metrics', () => {
  const compHealth: PlatformComprehensiveHealth = {
    overallScore: 98,
    serverVitals: {
      cpuPercent: 18.5,
      memoryPercent: 42.0,
      diskPercent: 36.4,
      apiLatencyMs: 45,
      apiErrorRatePercent: 0.05,
      activeConnections: 128,
      uptimeSeconds: 864000,
    },
    components: {
      database: { status: 'HEALTHY', sizeMb: 256.4, queryTimeMs: 4 },
      redisCache: { status: 'CONNECTED', hitRatioPercent: 96.8 },
      syncService: { status: 'HEALTHY', connectedDevices: 45, pendingSyncCount: 12 },
      backupSystem: { status: 'VERIFIED', sizeMb: 115, lastBackupAt: '2026-11-14T02:00:00Z' },
    },
    recentBackups: [],
    openIncidents: [],
    telemetryHistory: [],
  };

  assert.strictEqual(compHealth.overallScore, 98);
  assert.strictEqual(compHealth.components.database.status, 'HEALTHY');
  assert.strictEqual(compHealth.components.redisCache.hitRatioPercent, 96.8);
});
