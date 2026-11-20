import { v4 as uuidv4 } from 'uuid';
import { platformAdminApiClient } from '../PlatformAdminApiClient';
import type {
  PlatformCentralSecurityIncident,
  PlatformSigningKey,
  PlatformCentralSecurityOverview,
} from '../platformTypes';
import { nowIso, toNumber } from '../platformUtils';
import type { StaffServiceContext } from './context';
import { mapSecurityIncident, mapSigningKey } from './mappers';

export function listPlatformSecurityIncidents(ctx: StaffServiceContext): PlatformCentralSecurityIncident[] {
  ctx.requirePlatformAccess('security', 'platform.security.incidents');
  const rows = ctx.db.query<any>('SELECT * FROM platform_security_incidents ORDER BY created_at DESC');
  return rows.map(mapSecurityIncident);
}

export function recordSecurityIncident(ctx: StaffServiceContext, input: {
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description?: string;
  tenantId?: string;
  staffId?: string;
  deviceId?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}): PlatformCentralSecurityIncident {
  ctx.requirePlatformAccess('security', 'platform.security.incidents');

  const id = `sec_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
  const now = nowIso();

  ctx.db.run(
    `INSERT INTO platform_security_incidents
      (id, type, severity, title, description, tenant_id, staff_id, device_id, ip_address, status, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?)`,
    [id, input.type, input.severity, input.title.trim(), input.description?.trim() ?? null, input.tenantId ?? null, input.staffId ?? null, input.deviceId ?? null, input.ipAddress ?? null, input.metadata ? JSON.stringify(input.metadata) : null, now, now]
  );

  ctx.audit('تسجيل حادث أمني', 'SECURITY_INCIDENT', id, { type: input.type, severity: input.severity });

  const incident = ctx.db.query<any>('SELECT * FROM platform_security_incidents WHERE id = ?', [id])[0];
  if (!incident) throw new Error('فشل تسجيل الحادث.');
  return mapSecurityIncident(incident);
}

export function respondToSecurityIncident(ctx: StaffServiceContext, id: string, action: string, resolve = false): PlatformCentralSecurityIncident {
  ctx.requirePlatformAccess('security', 'platform.security.incidents');

  const incidentRow = ctx.db.query<any>('SELECT * FROM platform_security_incidents WHERE id = ?', [id])[0];
  if (!incidentRow) throw new Error('الحادث غير موجود.')

  const now = nowIso();
  // 'CONTAINED' is the in-progress state the security-center UI understands;
  // 'RESOLVED' closes the incident and stamps resolved_at.
  const status = resolve ? 'RESOLVED' : 'CONTAINED';

  ctx.db.run(
    'UPDATE platform_security_incidents SET status = ?, response = ?, updated_at = ? WHERE id = ?',
    [status, action, now, id]
  );

  if (resolve) {
    ctx.db.run('UPDATE platform_security_incidents SET resolved_at = ? WHERE id = ?', [now, id]);
  }

  ctx.audit('الرد على حادث أمني', 'SECURITY_INCIDENT', id, { action, resolve });

  const updatedRow = ctx.db.query<any>('SELECT * FROM platform_security_incidents WHERE id = ?', [id])[0];
  if (!updatedRow) throw new Error('فشل تحديث الحادث.');
  return mapSecurityIncident(updatedRow);
}

export function getSecurityIncident(ctx: StaffServiceContext, id: string): PlatformCentralSecurityIncident | null {
  const row = ctx.db.query<any>('SELECT * FROM platform_security_incidents WHERE id = ?', [id])[0];
  return row ? mapSecurityIncident(row) : null;
}

export function listPlatformSigningKeys(ctx: StaffServiceContext): PlatformSigningKey[] {
  ctx.requirePlatformAccess('security', 'platform.security.keys');
  const rows = ctx.db.query<any>('SELECT * FROM platform_signing_keys ORDER BY created_at DESC');
  return rows.map(mapSigningKey);
}

export async function rotatePlatformSigningKey(ctx: StaffServiceContext, keyAlias: string): Promise<PlatformSigningKey> {
  ctx.requirePlatformAccess('security', 'platform.security.keys');

  // In central mode the authoritative Ed25519 key lives on the central
  // server — rotate it there instead of only touching local metadata.
  if (ctx.setting('platform.dataSource', 'local') === 'central') {
    if (!platformAdminApiClient.isAvailable()) {
      throw new Error('مصدر البيانات مركزي لكن جسر الاتصال بالسيرفر المركزي غير متاح.');
    }
    const rotated = await platformAdminApiClient.rotateCentralSigningKey();
    const now = nowIso();
    ctx.audit('تدوير مفتاح توقيع مركزي', 'SIGNING_KEY', rotated.keyId, { keyAlias, keyId: rotated.keyId });
    return {
      id: rotated.keyId,
      alias: keyAlias,
      keyAlias,
      algorithm: 'Ed25519',
      version: 1,
      status: 'ACTIVE',
      isCurrent: true,
      createdAt: now,
    };
  }

  const existing = ctx.db.query<any>(
    `SELECT * FROM platform_signing_keys WHERE key_alias = ? ORDER BY version DESC LIMIT 1`,
    [keyAlias]
  )[0];
  const now = nowIso();
  const nextVersion = existing ? toNumber(existing.version, 1) + 1 : 1;

  ctx.db.executeTransaction(() => {
    if (existing) {
      ctx.db.run(
        `UPDATE platform_signing_keys SET status = 'ROTATED', rotated_at = ? WHERE key_alias = ? AND status = 'ACTIVE'`,
        [now, keyAlias]
      );
    }
    const id = `sk_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    ctx.db.run(
      `INSERT INTO platform_signing_keys (id, key_alias, algorithm, version, status, rotated_at, created_at)
       VALUES (?, ?, 'Ed25519', ?, 'ACTIVE', ?, ?)`,
      [id, keyAlias, nextVersion, existing ? now : null, now]
    );
  });

  ctx.audit('تدوير مفتاح توقيع', 'SIGNING_KEY', null, { keyAlias });

  const updated = ctx.db.query<any>(
    `SELECT * FROM platform_signing_keys WHERE key_alias = ? AND status = 'ACTIVE' ORDER BY version DESC LIMIT 1`,
    [keyAlias]
  )[0];
  return mapSigningKey(updated);
}

export function getPlatformSecurityOverview(ctx: StaffServiceContext): PlatformCentralSecurityOverview {
  ctx.requirePlatformAccess('security', 'platform.security.view');

  const incidents = ctx.listPlatformSecurityIncidents();
  const mfaCompliance = ctx.getStaffMfaCompliance();
  const recentLogins = ctx.listStaffLogins(50);
  const activeSessions = ctx.db.query<any>('SELECT COUNT(*) AS c FROM platform_staff_sessions WHERE expires_at > datetime(\'now\')')[0]?.c ?? 0;
  const trustedDevices = ctx.db.query<any>('SELECT COUNT(*) AS c FROM platform_trusted_devices')[0]?.c ?? 0;
  const signingKeys = ctx.listPlatformSigningKeys();
  const failedLogins24h = ctx.db.query<any>('SELECT COUNT(*) AS c FROM platform_staff_logins WHERE success = 0 AND created_at > datetime(\'now\', \'-24 hours\')')[0]?.c ?? 0;
  const openIncidents = incidents.filter((i) => i.status === 'OPEN').length;

  // Heuristic score: MFA coverage dominates, then failed logins and open incidents.
  let securityScore = 100;
  if (mfaCompliance.total > 0) {
    securityScore -= Math.round((1 - mfaCompliance.enabled / mfaCompliance.total) * 30);
  }
  securityScore -= Math.min(20, toNumber(failedLogins24h, 0) * 2);
  securityScore -= Math.min(30, openIncidents * 10);
  securityScore = Math.max(0, Math.min(100, securityScore));

  const mfaEnforcement = ctx.getStaffMfaEnforcement();

  return {
    securityScore,
    twoFactorEnforcement: {
      // Reflect the real platform.staffMfaEnforcement policy — 'required'
      // means 2FA is mandatory for every staff account.
      enabled: mfaEnforcement === 'required',
      compliantStaffCount: mfaCompliance.enabled,
      totalStaffCount: mfaCompliance.total,
    },
    activeStaffSessionsCount: toNumber(activeSessions, 0),
    failedLogins24hCount: toNumber(failedLogins24h, 0),
    activeIncidentsCount: openIncidents,
    signingKeysCount: signingKeys.length,
    trustedDevicesCount: toNumber(trustedDevices, 0),
    sessions: ctx.listStaffSessions().slice(0, 50),
    recentLogins: recentLogins.slice(0, 50),
    incidents: incidents.slice(0, 50),
    signingKeys: signingKeys,
  };
}
