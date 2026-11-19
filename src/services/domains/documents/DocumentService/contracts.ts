import { AuthService } from '../../auth/AuthService';
import { PermissionService } from '../../auth/PermissionService';
import { ModuleRegistryService } from '../../config/ModuleRegistryService';
import { localDateString } from '../../../../utils/shared/date';
import type { User } from '../../../../types';
import type {
  ContractFilters,
  CreateContractDTO,
  EnterpriseContract,
  UpdateContractDTO,
} from '../../../../types/documents';
import {
  CURRENCY_PATTERN,
  MODULE_ID,
  optionalText,
  PARTY_TYPES,
  requireText,
  requiredDate,
} from './validation';
import { mapContract } from './mapping';
import { newId, nowIso } from './utils';
import { DocumentOperations } from './documents';

/** Enterprise contract registry: CRUD, activation, termination and renewal. */
export abstract class ContractOperations extends DocumentOperations {
  // ─── Contracts ─────────────────────────────────────────────────────────────

  public getContracts(filters: ContractFilters = {}): { contracts: EnterpriseContract[]; total: number } {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.contracts.contracts.view');
    const today = localDateString();

    const conditions: string[] = [];
    const params: Array<string | number> = [];
    const company = this.companyScope('ct', actor);
    const branch = this.branchScope('ct', actor);
    conditions.push(company.clause, branch.clause);
    params.push(...company.params, ...branch.params);

    if (filters.companyId) {
      this.access.requireCompanyAccess(filters.companyId, actor);
      conditions.push('ct.company_id = ?');
      params.push(filters.companyId);
    }
    if (filters.partyType) {
      if (!PARTY_TYPES.includes(filters.partyType)) throw new Error('نوع الطرف غير صالح.');
      conditions.push('ct.party_type = ?');
      params.push(filters.partyType);
    }
    if (filters.search) {
      const term = `%${filters.search.trim()}%`;
      conditions.push('(ct.title LIKE ? OR ct.contract_number LIKE ? OR ct.party_name LIKE ?)');
      params.push(term, term, term);
    }
    if (filters.status && filters.status !== 'ALL') {
      const status = filters.status;
      if (status === 'DRAFT' || status === 'TERMINATED') {
        conditions.push('ct.status = ?');
        params.push(status);
      } else if (status === 'EXPIRED') {
        conditions.push("ct.status = 'ACTIVE' AND ct.end_date < ?");
        params.push(today);
      } else if (status === 'SCHEDULED') {
        conditions.push("ct.status = 'ACTIVE' AND ct.start_date > ?");
        params.push(today);
      } else if (status === 'ACTIVE' || status === 'EXPIRING') {
        conditions.push("ct.status = 'ACTIVE' AND ct.start_date <= ? AND ct.end_date >= ?");
        params.push(today, today);
        const comparator = status === 'EXPIRING' ? '<=' : '>';
        conditions.push(`ct.end_date ${comparator} date(?, '+' || ct.renewal_notice_days || ' days')`);
        params.push(today);
      } else {
        throw new Error('حالة العقد غير صالحة.');
      }
    }
    if (filters.expiringWithinDays !== undefined) {
      const days = Math.max(0, Math.min(Math.trunc(Number(filters.expiringWithinDays)) || 0, 3650));
      const limit = new Date(`${today}T00:00:00Z`);
      limit.setUTCDate(limit.getUTCDate() + days);
      conditions.push("ct.status = 'ACTIVE' AND ct.end_date >= ? AND ct.end_date <= ?");
      params.push(today, limit.toISOString().slice(0, 10));
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const total = Number(this.db.query<{ total: number }>(
      `SELECT COUNT(*) AS total FROM enterprise_contracts ct ${where}`,
      params
    )[0]?.total || 0);

    const page = Math.max(1, Math.trunc(Number(filters.page)) || 1);
    const pageSize = Math.max(1, Math.min(Math.trunc(Number(filters.pageSize)) || 50, 200));
    const rows = this.db.query<any>(
      `SELECT ct.*, c.name AS companyName, u.full_name AS ownerName, d.title AS documentTitle
       FROM enterprise_contracts ct
       JOIN companies c ON c.id = ct.company_id
       LEFT JOIN users u ON u.id = ct.owner_user_id
       LEFT JOIN enterprise_documents d ON d.id = ct.document_id
       ${where}
       ORDER BY ct.end_date ASC, ct.id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    );

    return { contracts: rows.map((row) => mapContract(row, today)), total };
  }

  public getContract(id: string): EnterpriseContract {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.contracts.contracts.view');
    const row = this.db.query<any>(
      `SELECT ct.*, c.name AS companyName, u.full_name AS ownerName, d.title AS documentTitle
       FROM enterprise_contracts ct
       JOIN companies c ON c.id = ct.company_id
       LEFT JOIN users u ON u.id = ct.owner_user_id
       LEFT JOIN enterprise_documents d ON d.id = ct.document_id
       WHERE ct.id = ?`,
      [id]
    )[0];
    if (!row) throw new Error('العقد غير موجود.');
    this.access.requireCompanyAccess(row.company_id, actor);
    if (row.branch_id) this.access.requireBranchAccess(row.branch_id, actor);
    return mapContract(row, localDateString());
  }

  public createContract(dto: CreateContractDTO): EnterpriseContract {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.contracts.contracts.create');
    ModuleRegistryService.assertModuleEnabled(MODULE_ID);

    if (!dto.companyId) throw new Error('الشركة مطلوبة.');
    this.assertCompany(dto.companyId, actor);
    const branchId = this.assertBranch(dto.branchId, dto.companyId, actor)
      ?? this.access.getCurrentBranchId(actor);
    const title = requireText(dto.title, 'عنوان العقد', 2, 200);
    const partyName = requireText(dto.partyName, 'اسم الطرف', 2, 200);
    const partyType = dto.partyType || 'OTHER';
    if (!PARTY_TYPES.includes(partyType)) throw new Error('نوع الطرف غير صالح.');
    const startDate = requiredDate(dto.startDate, 'تاريخ بداية العقد');
    const endDate = requiredDate(dto.endDate, 'تاريخ نهاية العقد');
    if (endDate <= startDate) throw new Error('تاريخ نهاية العقد يجب أن يكون بعد تاريخ البداية.');
    const value = dto.value === undefined ? 0 : Number(dto.value);
    if (!Number.isFinite(value) || value < 0) throw new Error('قيمة العقد غير صالحة.');
    const currency = (dto.currency || this.defaultCurrency(dto.companyId)).toUpperCase();
    if (!CURRENCY_PATTERN.test(currency)) throw new Error('عملة العقد يجب أن تكون 3 أحرف (مثال: EGP).');
    const renewalNoticeDays = dto.renewalNoticeDays === undefined ? 30 : Number(dto.renewalNoticeDays);
    if (!Number.isInteger(renewalNoticeDays) || renewalNoticeDays < 0 || renewalNoticeDays > 3650) {
      throw new Error('مدة التنبيه قبل التجديد يجب أن تكون بين 0 و3650 يومًا.');
    }
    const ownerUserId = this.assertUser(dto.ownerUserId);
    const documentId = this.assertContractDocument(dto.documentId, dto.companyId, actor);
    const notes = optionalText(dto.notes, 'ملاحظات العقد', 4000);
    const contractNumberInput = dto.contractNumber ? this.normalizeNumber(dto.contractNumber, 'رقم العقد') : null;

    const id = newId('ctr');
    const now = nowIso();
    let number = contractNumberInput || '';

    this.db.executeTransaction((tx) => {
      number = contractNumberInput || tx.nextNumber('CTR');
      const existing = tx.query<{ id: string }>(
        'SELECT id FROM enterprise_contracts WHERE company_id = ? AND contract_number = ?',
        [dto.companyId, number]
      )[0];
      if (existing) throw new Error(`رقم العقد ${number} مستخدم بالفعل في هذه الشركة.`);

      tx.run(
        `INSERT INTO enterprise_contracts
           (id, company_id, branch_id, contract_number, title, party_type, party_id, party_name,
            start_date, end_date, value, currency, status, auto_renew, renewal_notice_days,
            owner_user_id, document_id, notes, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ROUND(?*100), ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          dto.companyId,
          branchId,
          number,
          title,
          partyType,
          dto.partyId || null,
          partyName,
          startDate,
          endDate,
          value,
          currency,
          dto.autoRenew ? 1 : 0,
          renewalNoticeDays,
          ownerUserId,
          documentId,
          notes,
          actor.id,
          now,
          now,
        ]
      );
      this.recordEvent('CONTRACT', id, 'CREATED', actor, { contractNumber: number, title, partyName });
    });

    this.audit('إضافة عقد', 'CONTRACTS', id, actor, undefined, {
      contractNumber: number,
      title,
      partyName,
      startDate,
      endDate,
      value,
    });
    return this.getContract(id);
  }

  public updateContract(id: string, patch: UpdateContractDTO): EnterpriseContract {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.contracts.contracts.update');
    ModuleRegistryService.assertModuleEnabled(MODULE_ID);
    const before = this.getContract(id);
    if (before.status === 'TERMINATED') throw new Error('لا يمكن تعديل عقد منتهٍ أو مفسوخ.');

    const startDate = patch.startDate === undefined ? before.startDate : requiredDate(patch.startDate, 'تاريخ بداية العقد');
    const endDate = patch.endDate === undefined ? before.endDate : requiredDate(patch.endDate, 'تاريخ نهاية العقد');
    if (endDate <= startDate) throw new Error('تاريخ نهاية العقد يجب أن يكون بعد تاريخ البداية.');
    const value = patch.value === undefined ? before.value : Number(patch.value);
    if (!Number.isFinite(value) || value < 0) throw new Error('قيمة العقد غير صالحة.');
    const currency = (patch.currency === undefined ? before.currency : String(patch.currency)).toUpperCase();
    if (!CURRENCY_PATTERN.test(currency)) throw new Error('عملة العقد يجب أن تكون 3 أحرف (مثال: EGP).');
    const renewalNoticeDays = patch.renewalNoticeDays === undefined ? before.renewalNoticeDays : Number(patch.renewalNoticeDays);
    if (!Number.isInteger(renewalNoticeDays) || renewalNoticeDays < 0 || renewalNoticeDays > 3650) {
      throw new Error('مدة التنبيه قبل التجديد يجب أن تكون بين 0 و3650 يومًا.');
    }
    const partyType = patch.partyType === undefined ? before.partyType : patch.partyType;
    if (!PARTY_TYPES.includes(partyType)) throw new Error('نوع الطرف غير صالح.');

    const next = {
      title: patch.title === undefined ? before.title : requireText(patch.title, 'عنوان العقد', 2, 200),
      partyType,
      partyId: patch.partyId === undefined ? before.partyId : (patch.partyId || null),
      partyName: patch.partyName === undefined ? before.partyName : requireText(patch.partyName, 'اسم الطرف', 2, 200),
      startDate,
      endDate,
      value,
      currency,
      autoRenew: patch.autoRenew === undefined ? before.autoRenew : Boolean(patch.autoRenew),
      renewalNoticeDays,
      ownerUserId: patch.ownerUserId === undefined ? before.ownerUserId : this.assertUser(patch.ownerUserId),
      documentId: patch.documentId === undefined
        ? before.documentId
        : this.assertContractDocument(patch.documentId, before.companyId, actor),
      notes: patch.notes === undefined ? before.notes : optionalText(patch.notes, 'ملاحظات العقد', 4000),
    };

    this.db.executeTransaction((tx) => {
      tx.run(
        `UPDATE enterprise_contracts SET
           title = ?, party_type = ?, party_id = ?, party_name = ?, start_date = ?, end_date = ?,
           value = ROUND(?*100), currency = ?, auto_renew = ?, renewal_notice_days = ?, owner_user_id = ?,
           document_id = ?, notes = ?, updated_at = ?
         WHERE id = ?`,
        [
          next.title,
          next.partyType,
          next.partyId,
          next.partyName,
          next.startDate,
          next.endDate,
          next.value,
          next.currency,
          next.autoRenew ? 1 : 0,
          next.renewalNoticeDays,
          next.ownerUserId,
          next.documentId,
          next.notes,
          nowIso(),
          id,
        ]
      );
      this.recordEvent('CONTRACT', id, 'UPDATED', actor, {
        before: {
          title: before.title,
          partyName: before.partyName,
          startDate: before.startDate,
          endDate: before.endDate,
          value: before.value,
          currency: before.currency,
        },
        after: next,
      });
    });
    this.audit('تعديل عقد', 'CONTRACTS', id, actor, before, next);
    return this.getContract(id);
  }

  public activateContract(id: string, effectiveFrom?: string): EnterpriseContract {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.contracts.contracts.update');
    ModuleRegistryService.assertModuleEnabled(MODULE_ID);
    const contract = this.getContract(id);
    if (contract.status !== 'DRAFT') throw new Error('يمكن تفعيل العقود المسودة فقط.');
    const today = localDateString();
    if (contract.endDate < today) throw new Error('لا يمكن تفعيل عقد انتهت مدته. حدّث تاريخ النهاية أولًا.');
    const startDate = effectiveFrom ? requiredDate(effectiveFrom, 'تاريخ سريان العقد') : contract.startDate;
    if (startDate >= contract.endDate) throw new Error('تاريخ السريان يجب أن يكون قبل تاريخ نهاية العقد.');

    this.db.executeTransaction((tx) => {
      tx.run(
        "UPDATE enterprise_contracts SET status = 'ACTIVE', start_date = ?, updated_at = ? WHERE id = ?",
        [startDate, nowIso(), id]
      );
      this.recordEvent('CONTRACT', id, 'ACTIVATED', actor, { startDate });
    });
    this.audit('تفعيل عقد', 'CONTRACTS', id, actor, { status: contract.status }, { status: 'ACTIVE', startDate });
    return this.getContract(id);
  }

  public terminateContract(id: string, reason: string): EnterpriseContract {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.contracts.contracts.terminate');
    ModuleRegistryService.assertModuleEnabled(MODULE_ID);
    const contract = this.getContract(id);
    if (contract.status !== 'ACTIVE') throw new Error('يمكن فسخ العقود السارية فقط.');
    const terminationReason = requireText(reason, 'سبب الفسخ', 3, 500);

    this.db.executeTransaction((tx) => {
      tx.run(
        `UPDATE enterprise_contracts
         SET status = 'TERMINATED', terminated_at = ?, termination_reason = ?, updated_at = ?
         WHERE id = ?`,
        [nowIso(), terminationReason, nowIso(), id]
      );
      this.recordEvent('CONTRACT', id, 'TERMINATED', actor, { reason: terminationReason });
    });
    this.audit('فسخ عقد', 'CONTRACTS', id, actor,
      { status: contract.status },
      { status: 'TERMINATED', reason: terminationReason });
    return this.getContract(id);
  }

  /** Extend a contract. Never rewrites or deletes the previous term; the event keeps it. */
  public renewContract(id: string, newEndDate: string, newValue?: number): EnterpriseContract {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.contracts.contracts.update');
    ModuleRegistryService.assertModuleEnabled(MODULE_ID);
    const contract = this.getContract(id);
    if (contract.status === 'TERMINATED') throw new Error('لا يمكن تجديد عقد مفسوخ.');
    const endDate = requiredDate(newEndDate, 'تاريخ النهاية الجديد');
    if (endDate <= contract.endDate) {
      throw new Error('تاريخ النهاية الجديد يجب أن يكون بعد تاريخ النهاية الحالي.');
    }
    const value = newValue === undefined ? contract.value : Number(newValue);
    if (!Number.isFinite(value) || value < 0) throw new Error('قيمة العقد غير صالحة.');

    this.db.executeTransaction((tx) => {
      tx.run(
        'UPDATE enterprise_contracts SET end_date = ?, value = ROUND(?*100), updated_at = ? WHERE id = ?',
        [endDate, value, nowIso(), id]
      );
      this.recordEvent('CONTRACT', id, 'RENEWED', actor, {
        fromEndDate: contract.endDate,
        toEndDate: endDate,
        fromValue: contract.value,
        toValue: value,
      });
    });
    this.audit('تجديد عقد', 'CONTRACTS', id, actor,
      { endDate: contract.endDate, value: contract.value },
      { endDate, value });
    return this.getContract(id);
  }

  private assertContractDocument(documentId: string | null | undefined, companyId: string, actor: User): string | null {
    if (!documentId) return null;
    const document = this.db.query<{ id: string; companyId: string }>(
      'SELECT id, company_id AS companyId FROM enterprise_documents WHERE id = ?',
      [documentId]
    )[0];
    if (!document) throw new Error('المستند المرتبط غير موجود.');
    if (document.companyId !== companyId) throw new Error('لا يمكن ربط عقد بمستند يتبع شركة أخرى.');
    this.access.requireCompanyAccess(document.companyId, actor);
    return documentId;
  }

  private defaultCurrency(companyId: string): string {
    const row = this.db.query<{ currency: string | null }>(
      'SELECT currency FROM companies WHERE id = ?',
      [companyId]
    )[0];
    const currency = (row?.currency || '').toUpperCase();
    if (CURRENCY_PATTERN.test(currency)) return currency;
    const setting = this.db.query<{ value: string }>(
      "SELECT value FROM system_settings WHERE key = 'currency'"
    )[0]?.value;
    const fallback = (setting || 'EGP').toUpperCase();
    return CURRENCY_PATTERN.test(fallback) ? fallback : 'EGP';
  }
}
