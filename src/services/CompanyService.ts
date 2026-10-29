import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { BranchAccessService } from './BranchAccessService';
import { AuditService } from './AuditService';
import type { Company, CreateCompanyDTO, User } from '../types';

const COMPANY_CODE = /^[A-Z0-9][A-Z0-9_-]{1,19}$/;

/**
 * Legal-entity / company administration.
 *
 * Companies are the top-level ownership boundary. Branches belong to a
 * company and inherit its scope: a user who can only see one branch cannot
 * see another company's records through this service.
 */
export class CompanyService {
  private db = DatabaseManager.getInstance();
  private access = new BranchAccessService();

  private scopeClause(actor: User): { clause: string; params: string[] } {
    const allowed = this.access.getAccessibleCompanyIds(actor);
    if (allowed === null) return { clause: '1 = 1', params: [] };
    if (!allowed.length) return { clause: '1 = 0', params: [] };
    return {
      clause: `c.id IN (${allowed.map(() => '?').join(', ')})`,
      params: allowed,
    };
  }

  public getAllCompanies(includeInactive = true): Company[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'companies.view');
    const scope = this.scopeClause(actor);
    const rows = this.db.query<any>(
      `SELECT c.*,
              (SELECT COUNT(*) FROM branches b WHERE b.company_id = c.id AND b.is_active = 1) AS branchCount
       FROM companies c
       WHERE ${scope.clause} ${includeInactive ? '' : 'AND c.is_active = 1'}
       ORDER BY c.is_active DESC, c.name ASC`,
      scope.params
    );
    return rows.map((row) => this.mapCompany(row));
  }

  public getCompanyById(id: string): Company | null {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'companies.view');
    this.access.requireCompanyAccess(id, actor);
    const row = this.db.query<any>(
      `SELECT c.*,
              (SELECT COUNT(*) FROM branches b WHERE b.company_id = c.id AND b.is_active = 1) AS branchCount
       FROM companies c WHERE c.id = ?`,
      [id]
    )[0];
    return row ? this.mapCompany(row) : null;
  }

  public createCompany(dto: CreateCompanyDTO): Company {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'companies.create');

    const code = (dto.code || '').trim().toUpperCase();
    const name = (dto.name || '').trim();
    if (!COMPANY_CODE.test(code)) {
      throw new Error('كود الشركة يجب أن يكون 2 إلى 20 حرفًا إنجليزيًا أو رقميًا (A-Z, 0-9, -, _).');
    }
    if (name.length < 2) throw new Error('اسم الشركة مطلوب (حرفان على الأقل).');
    if (this.db.query('SELECT 1 FROM companies WHERE code = ?', [code]).length > 0) {
      throw new Error(`كود الشركة ${code} مستخدم بالفعل.`);
    }
    if (dto.parentCompanyId) {
      const parent = this.getCompanyById(dto.parentCompanyId);
      if (!parent) throw new Error('الشركة الأم المحددة غير موجودة أو خارج نطاق صلاحيتك.');
      if (parent.isActive === false) throw new Error('لا يمكن الإضافة تحت شركة معطلة.');
    }

    const id = `cmp_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO companies
         (id, code, name, legal_name, tax_number, commercial_record, currency, fiscal_year_start_month, time_zone, locale, date_format, payroll_tax_rate, overtime_multiplier, working_days_per_month, parent_company_id, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        id,
        code,
        name,
        dto.legalName?.trim() || null,
        dto.taxNumber?.trim() || null,
        dto.commercialRecord?.trim() || null,
        dto.currency?.trim() || null,
        dto.fiscalYearStartMonth ?? 1,
        dto.timeZone?.trim() || null,
        dto.locale?.trim() || 'ar',
        dto.dateFormat?.trim() || 'YYYY-MM-DD',
        dto.payrollTaxRate ?? 0,
        dto.overtimeMultiplier ?? 1.5,
        dto.workingDaysPerMonth ?? 26,
        dto.parentCompanyId || null,
        now,
        now,
      ]
    );

    try {
      new AuditService().log({
        userId: actor.id,
        userName: actor.fullName,
        action: 'إضافة شركة',
        module: 'COMPANIES',
        recordId: id,
        newValues: JSON.stringify({ code, name, parentCompanyId: dto.parentCompanyId || null }),
      });
    } catch { /* audit must not block company creation */ }

    return this.getCompanyById(id)!;
  }

  public updateCompany(id: string, patch: Partial<Omit<Company, 'id' | 'code' | 'createdAt'>>): Company {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'companies.update');
    const before = this.getCompanyById(id);
    if (!before) throw new Error('الشركة غير موجودة أو خارج نطاق صلاحيتك.');

    const nextName = patch.name === undefined ? before.name : patch.name.trim();
    if (nextName.length < 2) throw new Error('اسم الشركة مطلوب (حرفان على الأقل).');
    if (patch.parentCompanyId) {
      if (patch.parentCompanyId === id) throw new Error('لا يمكن أن تكون الشركة تابعة لنفسها.');
      const parent = this.getCompanyById(patch.parentCompanyId);
      if (!parent) throw new Error('الشركة الأم المحددة غير موجودة أو خارج نطاق صلاحيتك.');
      if (this.isDescendant(patch.parentCompanyId, id)) {
        throw new Error('لا يمكن إنشاء تسلسل ملكية دائري بين الشركات.');
      }
    }

    this.db.run(
      `UPDATE companies SET
         name = ?, legal_name = ?, tax_number = ?, commercial_record = ?,
         currency = ?, fiscal_year_start_month = ?, time_zone = ?, locale = ?, date_format = ?,
         payroll_tax_rate = ?, overtime_multiplier = ?, working_days_per_month = ?,
         parent_company_id = ?, is_active = ?, updated_at = ?
       WHERE id = ?`,
      [
        nextName,
        patch.legalName === undefined ? before.legalName || null : (patch.legalName || null),
        patch.taxNumber === undefined ? before.taxNumber || null : (patch.taxNumber || null),
        patch.commercialRecord === undefined ? before.commercialRecord || null : (patch.commercialRecord || null),
        patch.currency === undefined ? before.currency || null : (patch.currency || null),
        patch.fiscalYearStartMonth === undefined ? (before.fiscalYearStartMonth ?? 1) : (patch.fiscalYearStartMonth ?? 1),
        patch.timeZone === undefined ? before.timeZone || null : (patch.timeZone || null),
        patch.locale === undefined ? (before.locale || 'ar') : (patch.locale || 'ar'),
        patch.dateFormat === undefined ? (before.dateFormat || 'YYYY-MM-DD') : (patch.dateFormat || 'YYYY-MM-DD'),
        patch.payrollTaxRate === undefined ? (before.payrollTaxRate ?? 0) : (patch.payrollTaxRate ?? 0),
        patch.overtimeMultiplier === undefined ? (before.overtimeMultiplier ?? 1.5) : (patch.overtimeMultiplier ?? 1.5),
        patch.workingDaysPerMonth === undefined ? (before.workingDaysPerMonth ?? 26) : (patch.workingDaysPerMonth ?? 26),
        patch.parentCompanyId === undefined ? before.parentCompanyId || null : (patch.parentCompanyId || null),
        patch.isActive === undefined ? (before.isActive ? 1 : 0) : (patch.isActive ? 1 : 0),
        new Date().toISOString(),
        id,
      ]
    );

    try {
      new AuditService().log({
        userId: actor.id,
        userName: actor.fullName,
        action: 'تعديل شركة',
        module: 'COMPANIES',
        recordId: id,
        oldValues: JSON.stringify(before),
        newValues: JSON.stringify(patch),
      });
    } catch { /* audit must not block company update */ }

    return this.getCompanyById(id)!;
  }

  /**
   * Deactivate a company. Refuses while active branches still belong to it, so
   * historical records always keep a resolvable, accountable owner.
   */
  public deactivateCompany(id: string): Company {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'companies.delete');
    const company = this.getCompanyById(id);
    if (!company) throw new Error('الشركة غير موجودة أو خارج نطاق صلاحيتك.');
    if (!company.isActive) return company;

    const activeBranches = Number(this.db.query<{ count: number }>(
      'SELECT COUNT(*) AS count FROM branches WHERE company_id = ? AND is_active = 1',
      [id]
    )[0]?.count || 0);
    if (activeBranches > 0) {
      throw new Error(`لا يمكن تعطيل الشركة مع وجود ${activeBranches} فرع نشط. انقل الفروع أو عطّلها أولًا.`);
    }
    const activeChildren = Number(this.db.query<{ count: number }>(
      'SELECT COUNT(*) AS count FROM companies WHERE parent_company_id = ? AND is_active = 1',
      [id]
    )[0]?.count || 0);
    if (activeChildren > 0) {
      throw new Error('لا يمكن تعطيل شركة لها شركات تابعة نشطة.');
    }

    this.db.run('UPDATE companies SET is_active = 0, updated_at = ? WHERE id = ?', [new Date().toISOString(), id]);
    try {
      new AuditService().log({
        userId: actor.id,
        userName: actor.fullName,
        action: 'تعطيل شركة',
        module: 'COMPANIES',
        recordId: id,
        oldValues: JSON.stringify({ isActive: true }),
        newValues: JSON.stringify({ isActive: false }),
      });
    } catch { /* ignore */ }
    return this.getCompanyById(id)!;
  }

  private isDescendant(candidateId: string, ancestorId: string): boolean {
    let current: string | null = candidateId;
    const visited = new Set<string>();
    while (current) {
      if (visited.has(current)) return false;
      visited.add(current);
      if (current === ancestorId) return true;
      current = this.db.query<{ parentCompanyId: string | null }>(
        'SELECT parent_company_id AS parentCompanyId FROM companies WHERE id = ?',
        [current]
      )[0]?.parentCompanyId ?? null;
    }
    return false;
  }

  private mapCompany(row: any): Company {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      legalName: row.legalName ?? row.legal_name ?? null,
      taxNumber: row.taxNumber ?? row.tax_number ?? null,
      commercialRecord: row.commercialRecord ?? row.commercial_record ?? null,
      currency: row.currency ?? null,
      fiscalYearStartMonth: row.fiscalYearStartMonth ?? row.fiscal_year_start_month ?? 1,
      timeZone: row.timeZone ?? row.time_zone ?? null,
      locale: row.locale ?? 'ar',
      dateFormat: row.dateFormat ?? row.date_format ?? 'YYYY-MM-DD',
      payrollTaxRate: row.payrollTaxRate ?? row.payroll_tax_rate ?? 0,
      overtimeMultiplier: row.overtimeMultiplier ?? row.overtime_multiplier ?? 1.5,
      workingDaysPerMonth: row.workingDaysPerMonth ?? row.working_days_per_month ?? 26,
      parentCompanyId: row.parentCompanyId ?? row.parent_company_id ?? null,
      isActive: Number(row.isActive ?? row.is_active) === 1,
      createdAt: row.createdAt ?? row.created_at,
      updatedAt: row.updatedAt ?? row.updated_at,
      branchCount: Number(row.branchCount || 0),
    };
  }
}
