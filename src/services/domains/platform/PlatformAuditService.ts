import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PlatformStaffAuthService } from './PlatformStaffAuthService';
import { PlatformAuthorizationService } from './PlatformAuthorizationService';
import { centralAuditService } from './CentralAuditService';
import type {
  PlatformAuditEntry,
  PlatformAuditFilters,
  PlatformAuditPaginatedResult,
} from './platformTypes';
import { nowIso, toNumber, safeJsonObject } from './platformUtils';

export class PlatformAuditService {
  private db = DatabaseManager.getInstance();

  private static requirePlatformAccess(modules: string | string[], action?: string) {
    const user = AuthService.getCurrentUser();
    if (!user || !user.isActive) {
      throw new Error('هذه العملية تتطلب جلسة منصة صالحة.');
    }

    if (user.role === 'SUPER_ADMIN') {
      return user;
    }

    const allowedRoles = new Set(['PLATFORM_ADMIN', 'SUPPORT_AGENT', 'OPERATIONS_ENGINEER', 'BILLING_SPECIALIST', 'LICENSE_MANAGER']);
    if (!allowedRoles.has(String(user.role))) {
      throw new Error('هذه العملية متاحة لمستخدمي المنصة المصرح لهم فقط.');
    }

    const permissionsOverride = PlatformStaffAuthService.getCurrentPermissionsOverride();
    const required = Array.isArray(modules) ? modules : [modules];
    const permitted = required.some((moduleKey) => {
      if (action && action.startsWith('platform.')) {
        return PlatformAuthorizationService.canAccessPermission(user.role, action, permissionsOverride);
      }
      return PlatformAuthorizationService.canAccessModule(user.role, moduleKey, permissionsOverride)
        && (!action || PlatformAuthorizationService.canAccessModule(user.role, action, permissionsOverride));
    });

    if (!permitted) {
      throw new Error('لا تملك صلاحية تنفيذ هذه العملية.');
    }

    return user;
  }

  private audit(
    action: string,
    entityType: string,
    entityId: string | null,
    details?: unknown,
    options?: {
      severity?: import('./platformTypes').AuditSeverity;
      status?: import('./platformTypes').AuditStatus;
      actorType?: import('./platformTypes').AuditActorType;
      tenantId?: string | null;
      deviceId?: string | null;
      deviceName?: string | null;
      ipAddress?: string | null;
      oldValues?: unknown;
      newValues?: unknown;
      errorMessage?: string | null;
    }
  ): void {
    const actor = AuthService.getCurrentUser();
    if (!actor) throw new Error('هذه العملية تتطلب جلسة منصة صالحة.');
    centralAuditService.log(actor, {
      action,
      entityType,
      entityId,
      details,
      severity: options?.severity,
      status: options?.status,
      actorType: options?.actorType,
      tenantId: options?.tenantId,
      deviceId: options?.deviceId,
      deviceName: options?.deviceName,
      ipAddress: options?.ipAddress,
      oldValues: options?.oldValues,
      newValues: options?.newValues,
      errorMessage: options?.errorMessage,
    });
  }

  // ─── Audit Log ────────────────────────────────────────────────────────────────

  public listAudit(limit = 200, search = ''): PlatformAuditEntry[] {
    PlatformAuditService.requirePlatformAccess('audit', 'platform.audit.view');

    const where = search ? 'WHERE action LIKE ? OR entity_type LIKE ? OR entity_id LIKE ? OR actor_id LIKE ?' : '';
    const params = search ? [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, limit] : [limit];

    const rows = this.db.query<any>(
      `SELECT * FROM platform_audit ${where} ORDER BY created_at DESC LIMIT ?`,
      params
    );

    return rows.map(this.mapEntry);
  }

  public queryAuditPaginated(filters: PlatformAuditFilters = {}): PlatformAuditPaginatedResult {
    PlatformAuditService.requirePlatformAccess('audit', 'platform.audit.view');

    const where: string[] = [];
    const params: (string | number)[] = [];

    if (filters.actorId) {
      where.push('actor_id = ?');
      params.push(filters.actorId);
    }
    if (filters.actorType) {
      where.push('actor_type = ?');
      params.push(filters.actorType);
    }
    if (filters.search) {
      where.push('(action LIKE ? OR entity_type LIKE ? OR entity_id LIKE ? OR actor_id LIKE ?)');
      const term = `%${filters.search}%`;
      params.push(term, term, term, term);
    }
    if (filters.entityType) {
      where.push('entity_type = ?');
      params.push(filters.entityType);
    }
    if (filters.tenantId) {
      where.push('tenant_id = ?');
      params.push(filters.tenantId);
    }
    if (filters.severity && filters.severity !== 'all') {
      where.push('severity = ?');
      params.push(filters.severity);
    }
    if (filters.status && filters.status !== 'all') {
      where.push('status = ?');
      params.push(filters.status);
    }
    if (filters.dateFrom) {
      where.push('created_at >= ?');
      params.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      where.push('created_at <= ?');
      params.push(filters.dateTo);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 50;
    const offset = (page - 1) * pageSize;

    const total = this.db.query<any>(`SELECT COUNT(*) AS c FROM platform_audit ${whereSql}`, params)[0]?.c ?? 0;
    params.push(pageSize, offset);

    const rows = this.db.query<any>(
      `SELECT * FROM platform_audit ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      params
    );

    return {
      entries: rows.map(this.mapEntry),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      integrityVerified: false,
    };
  }

  public queryAuditForExport(filters: PlatformAuditFilters = {}): PlatformAuditEntry[] {
    PlatformAuditService.requirePlatformAccess('audit', 'platform.audit.export');

    const where: string[] = [];
    const params: (string | number)[] = [];

    if (filters.actorId) {
      where.push('actor_id = ?');
      params.push(filters.actorId);
    }
    if (filters.actorType) {
      where.push('actor_type = ?');
      params.push(filters.actorType);
    }
    if (filters.search) {
      where.push('(action LIKE ? OR entity_type LIKE ? OR entity_id LIKE ? OR actor_id LIKE ?)');
      const term = `%${filters.search}%`;
      params.push(term, term, term, term);
    }
    if (filters.entityType) {
      where.push('entity_type = ?');
      params.push(filters.entityType);
    }
    if (filters.tenantId) {
      where.push('tenant_id = ?');
      params.push(filters.tenantId);
    }
    if (filters.severity && filters.severity !== 'all') {
      where.push('severity = ?');
      params.push(filters.severity);
    }
    if (filters.status && filters.status !== 'all') {
      where.push('status = ?');
      params.push(filters.status);
    }
    if (filters.dateFrom) {
      where.push('created_at >= ?');
      params.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      where.push('created_at <= ?');
      params.push(filters.dateTo);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rows = this.db.query<any>(
      `SELECT * FROM platform_audit ${whereSql} ORDER BY created_at DESC`,
      params
    );

    return rows.map(this.mapEntry);
  }

  public verifyAuditIntegrity(): { isValid: boolean; checkedCount: number; brokenAtId?: string } {
    PlatformAuditService.requirePlatformAccess('audit', 'platform.audit.verify');

    const rows = this.db.query<any>('SELECT id, hash, prev_hash FROM platform_audit ORDER BY created_at');
    let prevHash = '0'.repeat(64);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row.prev_hash !== prevHash) {
        return { isValid: false, checkedCount: i, brokenAtId: row.id };
      }
      prevHash = row.hash;
    }

    return { isValid: true, checkedCount: rows.length };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private mapEntry(row: any): PlatformAuditEntry {
    return {
      id: String(row.id),
      actorId: String(row.actor_id),
      actorType: row.actor_type,
      action: String(row.action),
      entityType: row.entity_type,
      entityId: row.entity_id ?? null,
      severity: row.severity,
      status: row.status,
      details: row.details ? JSON.parse(row.details) : null,
      oldValues: row.old_values ? JSON.parse(row.old_values) : null,
      newValues: row.new_values ? JSON.parse(row.new_values) : null,
      errorMessage: row.error_message ?? null,
      tenantId: row.tenant_id ?? null,
      deviceId: row.device_id ?? null,
      deviceName: row.device_name ?? null,
      ipAddress: row.ip_address ?? null,
      prevHash: row.prev_hash ?? null,
      recordHash: row.hash ?? null,
      createdAt: String(row.created_at),
    };
  }
}

export const platformAuditService = new PlatformAuditService();