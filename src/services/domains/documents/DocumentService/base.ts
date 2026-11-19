import { DatabaseManager } from '../../../../database/repositories/databaseManager';
import { BranchAccessService } from '../../auth/BranchAccessService';
import { AuditService } from '../../security/AuditService';
import type { User } from '../../../../types';
import { NUMBER_PATTERN } from './validation';
import { newId, nowIso } from './utils';

interface SqlScope {
  clause: string;
  params: string[];
}

/** Shared scope, assertion and audit helpers for the document service hierarchy. */
export abstract class DocumentServiceBase {
  protected readonly db = DatabaseManager.getInstance();
  protected readonly access = new BranchAccessService();

  // ─── Scope helpers ─────────────────────────────────────────────────────────

  protected companyScope(alias: string, actor: User): SqlScope {
    const companies = this.access.getAccessibleCompanyIds(actor);
    if (companies === null) return { clause: '1 = 1', params: [] };
    if (!companies.length) return { clause: '1 = 0', params: [] };
    return {
      clause: `${alias}.company_id IN (${companies.map(() => '?').join(', ')})`,
      params: companies,
    };
  }

  protected branchScope(alias: string, actor: User): SqlScope {
    const selected = this.access.sqlScope(`${alias}.branch_id`, undefined, actor);
    return {
      clause: `(${alias}.branch_id IS NULL OR ${selected.clause})`,
      params: selected.params,
    };
  }

  protected assertCompany(companyId: string, actor: User): void {
    const company = this.db.query<{ id: string; isActive: number }>(
      'SELECT id, is_active AS isActive FROM companies WHERE id = ?',
      [companyId]
    )[0];
    if (!company) throw new Error('الشركة المحددة غير موجودة.');
    if (Number(company.isActive) !== 1) throw new Error('لا يمكن تسجيل مستندات أو عقود على شركة معطلة.');
    this.access.requireCompanyAccess(companyId, actor);
  }

  protected assertBranch(branchId: string | null | undefined, companyId: string, actor: User): string | null {
    if (!branchId) return null;
    const branch = this.db.query<{ id: string; companyId: string | null; isActive: number }>(
      'SELECT id, company_id AS companyId, is_active AS isActive FROM branches WHERE id = ?',
      [branchId]
    )[0];
    if (!branch) throw new Error('الفرع المحدد غير موجود.');
    if (Number(branch.isActive) !== 1) throw new Error('لا يمكن ربط المستند بفرع معطل.');
    if ((branch.companyId || null) !== companyId) {
      throw new Error('الفرع لا يتبع الشركة المحددة.');
    }
    this.access.requireBranchAccess(branchId, actor);
    return branchId;
  }

  protected assertUser(userId: string | null | undefined): string | null {
    if (!userId) return null;
    const user = this.db.query<{ id: string; isActive: number }>(
      'SELECT id, is_active AS isActive FROM users WHERE id = ?',
      [userId]
    )[0];
    if (!user) throw new Error('المستخدم المسؤول غير موجود.');
    if (Number(user.isActive) !== 1) throw new Error('لا يمكن إسناد المستند لمستخدم معطل.');
    return userId;
  }

  protected recordEvent(
    entityType: 'DOCUMENT' | 'CONTRACT',
    entityId: string,
    action: string,
    actor: User,
    details?: Record<string, unknown>
  ): void {
    this.db.run(
      `INSERT INTO enterprise_document_events
         (id, entity_type, entity_id, action, actor_id, actor_name, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId('dev'),
        entityType,
        entityId,
        action,
        actor.id,
        actor.fullName,
        details ? JSON.stringify(details) : null,
        nowIso(),
      ]
    );
  }

  protected audit(action: string, module: string, recordId: string, actor: User, before?: unknown, after?: unknown): void {
    try {
      new AuditService().log({
        userId: actor.id,
        userName: actor.fullName,
        action,
        module,
        recordId,
        oldValues: before === undefined ? undefined : JSON.stringify(before),
        newValues: after === undefined ? undefined : JSON.stringify(after),
      });
    } catch {
      // Audit must never block a validated business transaction.
    }
  }

  protected normalizeNumber(value: string, label: string): string {
    const number = String(value || '').trim().toUpperCase();
    if (!NUMBER_PATTERN.test(number)) {
      throw new Error(`${label} يجب أن يكون 2 إلى 40 حرفًا إنجليزيًا أو رقميًا (A-Z, 0-9, -, _, /).`);
    }
    return number;
  }
}
