import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { postLedgerEntry } from '../../../database/repositories/ledger';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import { NotificationService } from '../notifications/NotificationService';
import { localDateString, addLocalDays } from '../../../utils/shared/date';

export type FacilityServiceCategory = 'MAINTENANCE' | 'CLEANING' | 'SECURITY' | 'UTILITY' | 'LEASE' | 'OTHER';
export type ContractStatus = 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'TERMINATED';
export type PaymentStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'CANCELLED';
export type RenewalStatus = 'PENDING' | 'APPROVED' | 'EXECUTED' | 'REJECTED';

export interface FacilityServiceVendor {
  id: string;
  supplierId: string;
  supplierName: string;
  companyId: string;
  serviceCategories: FacilityServiceCategory[];
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  taxNumber: string | null;
  commercialRecord: string | null;
  address: string | null;
  paymentTermsDays: number;
  rating: number;
  totalContracts: number;
  activeContracts: number;
  isPreferred: boolean;
  isActive: boolean;
  notes: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface FacilityServiceVendorInput {
  supplierId: string;
  serviceCategories: FacilityServiceCategory[];
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  taxNumber?: string | null;
  commercialRecord?: string | null;
  address?: string | null;
  paymentTermsDays?: number;
  isPreferred?: boolean;
  isActive?: boolean;
  notes?: string | null;
}

export interface FacilityContractExtended {
  id: string;
  contractNumber: string;
  locationId: string;
  locationName: string;
  contractType: string;
  title: string;
  vendorName: string;
  supplierId: string | null;
  supplierName: string | null;
  startsAt: string | null;
  endsAt: string | null;
  nextPaymentDate: string | null;
  paymentAmount: number;
  paymentCycle: string;
  status: ContractStatus;
  expenseReference: string | null;
  slaResponseTimeMinutes: number;
  slaResolutionTimeMinutes: number;
  slaPenaltyPerDelay: number;
  autoRenew: boolean;
  renewalNoticeDays: number;
  vendorRating: number | null;
  lastEvaluationDate: string | null;
  amendmentCount: number;
  isExpiringSoon: boolean;
  daysToExpiry: number | null;
  slaCompliance: number | null;
}

export interface SLAViolation {
  id: string;
  contractId: string;
  contractTitle: string;
  vendorName: string;
  violationType: 'RESPONSE_DELAY' | 'RESOLUTION_DELAY' | 'PAYMENT_OVERDUE' | 'CONTRACT_EXPIRY';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  detectedAt: string;
  dueDate: string | null;
  penaltyAmount: number | null;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'WAIVED';
}

export interface ContractPayment {
  id: string;
  contractId: string;
  paymentNumber: string;
  dueDate: string;
  amountDue: number;
  amountPaid: number;
  paymentDate: string | null;
  paymentMethod: string | null;
  referenceNumber: string | null;
  proofReference: string | null;
  status: PaymentStatus;
  notes: string | null;
  daysOverdue: number | null;
}

export interface ContractRenewal {
  id: string;
  contractId: string;
  contractTitle: string;
  renewalNumber: string;
  previousEndsAt: string;
  newEndsAt: string;
  newPaymentAmount: number;
  newPaymentCycle: string;
  status: RenewalStatus;
  approvedBy: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  notes: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

export interface VendorEvaluation {
  id: string;
  vendorId: string;
  vendorName: string;
  contractId: string | null;
  contractTitle: string | null;
  evaluationDate: string;
  evaluatorId: string;
  evaluatorName: string;
  qualityRating: number;
  timelinessRating: number;
  communicationRating: number;
  overallRating: number;
  comments: string | null;
  issuesFound: string | null;
  actionsRequired: string | null;
  followUpDate: string | null;
  createdAt: string;
}

export interface ContractAmendment {
  id: string;
  contractId: string;
  contractTitle: string;
  amendmentNumber: string;
  amendmentDate: string;
  fieldChanged: string;
  oldValue: string | null;
  newValue: string | null;
  reason: string;
  approvedBy: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  notes: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

export interface VendorStats {
  totalVendors: number;
  activeVendors: number;
  preferredVendors: number;
  vendorsByCategory: Array<{ category: string; count: number }>;
  averageRating: number;
  topVendors: Array<{ id: string; name: string; rating: number; totalContracts: number }>;
}

const _MAX_DATE = '9999-12-31';

export class FacilityContractSLAService {
  private static db = DatabaseManager.getInstance();
  private static branchAccess = new BranchAccessService();
  private static notification = new NotificationService();

  private static requireView() {
    const actor = AuthService.requireAuth();
    PermissionService.requireAny(actor, [
      'operations.view', 'facility_management.view',
    ]);
    return actor;
  }

  private static requireManage() {
    const actor = AuthService.requireAuth();
    ModuleRegistryService.assertModuleEnabled('hr');
    PermissionService.requireAny(actor, [
      'operations.update', 'facility_management.manage',
    ]);
    return actor;
  }

  private static currentCompanyId(actor = AuthService.requireAuth()): string {
    const branchId = this.branchAccess.getCurrentBranchId(actor);
    const row = this.db.query<{ companyId: string | null }>(
      'SELECT company_id AS companyId FROM branches WHERE id = ?',
      [branchId]
    )[0];
    if (!row?.companyId) throw new Error('فرع العمل الحالي غير مرتبط بشركة.');
    return row.companyId;
  }

  /* ========== Service Vendors ========== */

  static getServiceVendors(category?: FacilityServiceCategory): FacilityServiceVendor[] {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const conditions: string[] = ['fsv.company_id = ?'];
    const params: (string | number)[] = [companyId];
    if (category) {
      conditions.push('fsv.service_categories = ?');
      params.push(category);
    }
    const scope = this.branchAccess.sqlScope('fsv.branch_id', undefined, actor);
    conditions.push(scope.clause);
    params.push(...scope.params);

    const rows = this.db.query<any>(
      `SELECT fsv.id, fsv.supplier_id AS supplierId, s.name AS supplierName,
              fsv.company_id AS companyId, fsv.service_categories AS serviceCategories,
              fsv.contact_name AS contactName, fsv.contact_phone AS contactPhone,
              fsv.contact_email AS contactEmail, fsv.tax_number AS taxNumber,
              fsv.commercial_record AS commercialRecord, fsv.address,
              fsv.payment_terms_days AS paymentTermsDays, fsv.rating,
              fsv.total_contracts AS totalContracts, fsv.active_contracts AS activeContracts,
              fsv.is_preferred AS isPreferred, fsv.is_active AS isActive,
              fsv.notes, fsv.created_by AS createdBy, u.full_name AS createdByName,
              fsv.created_at AS createdAt, fsv.updated_at AS updatedAt
       FROM facility_service_vendors fsv
       JOIN suppliers s ON s.id = fsv.supplier_id
       LEFT JOIN users u ON u.id = fsv.created_by
       WHERE fsv.company_id = ? AND ${conditions.slice(1).join(' AND ')}
       ORDER BY fsv.is_preferred DESC, fsv.rating DESC, s.name`,
      params
    );
    return rows.map((row) => ({
      ...row,
      serviceCategories: row.serviceCategories ? [row.serviceCategories] : [],
      isActive: Boolean(row.isActive),
      isPreferred: Boolean(row.isPreferred),
    }));
  }

  static createServiceVendor(input: FacilityServiceVendorInput): FacilityServiceVendor {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const supplier = this.db.query<{ id: string; name: string }>(
      'SELECT id, name FROM suppliers WHERE id = ?',
      [input.supplierId]
    )[0];
    if (!supplier) throw new Error('المورد غير موجود.');
    if (!input.serviceCategories || !input.serviceCategories.length) {
      throw new Error('يجب تحديد فئة خدمة واحدة على الأقل.');
    }

    const id = `fsv_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO facility_service_vendors
         (id, supplier_id, company_id, service_categories, contact_name,
          contact_phone, contact_email, tax_number, commercial_record, address,
          payment_terms_days, rating, total_contracts, active_contracts,
          is_preferred, is_active, notes, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?, ?)`,
      [id, input.supplierId, companyId, input.serviceCategories[0],
        input.contactName || null, input.contactPhone || null, input.contactEmail || null,
        input.taxNumber || null, input.commercialRecord || null, input.address || null,
        input.paymentTermsDays ?? 30, input.isPreferred ? 1 : 0,
        input.isActive !== false ? 1 : 0, input.notes || null, actor.id, now, now]
    );
    this.auditActor(actor, 'إضافة مورد خدمة منشأة', id, {
      supplierId: input.supplierId, supplierName: supplier.name,
      serviceCategories: input.serviceCategories,
    });
    return this.getServiceVendor(id)!;
  }

  static getServiceVendor(vendorId: string): FacilityServiceVendor | null {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const scope = this.branchAccess.sqlScope('fsv.branch_id', undefined, actor);
    const row = this.db.query<any>(
      `SELECT fsv.id, fsv.supplier_id AS supplierId, s.name AS supplierName,
              fsv.company_id AS companyId, fsv.service_categories AS serviceCategories,
              fsv.contact_name AS contactName, fsv.contact_phone AS contactPhone,
              fsv.contact_email AS contactEmail, fsv.tax_number AS taxNumber,
              fsv.commercial_record AS commercialRecord, fsv.address,
              fsv.payment_terms_days AS paymentTermsDays, fsv.rating,
              fsv.total_contracts AS totalContracts, fsv.active_contracts AS activeContracts,
              fsv.is_preferred AS isPreferred, fsv.is_active AS isActive,
              fsv.notes, fsv.created_by AS createdBy, u.full_name AS createdByName,
              fsv.created_at AS createdAt, fsv.updated_at AS updatedAt
       FROM facility_service_vendors fsv
       JOIN suppliers s ON s.id = fsv.supplier_id
       LEFT JOIN users u ON u.id = fsv.created_by
       WHERE fsv.id = ? AND fsv.company_id = ? AND ${scope.clause}`,
      [vendorId, companyId, ...scope.params]
    )[0];
    if (!row) return null;
    return {
      ...row,
      serviceCategories: row.serviceCategories ? [row.serviceCategories] : [],
      isActive: Boolean(row.isActive),
      isPreferred: Boolean(row.isPreferred),
    };
  }

  static updateServiceVendor(vendorId: string, input: Partial<FacilityServiceVendorInput>): FacilityServiceVendor {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const vendor = this.db.query<{ id: string }>(
      'SELECT id FROM facility_service_vendors WHERE id = ? AND company_id = ?',
      [vendorId, companyId]
    )[0];
    if (!vendor) throw new Error('المورد غير موجود.');
    const updates: string[] = [];
    const params: (string | number | null)[] = [];
    const setField = (column: string, value: string | number | null | undefined) => {
      if (value !== undefined) { updates.push(`${column} = ?`); params.push(value); }
    };
    setField('service_categories', input.serviceCategories?.[0] || null);
    setField('contact_name', input.contactName || null);
    setField('contact_phone', input.contactPhone || null);
    setField('contact_email', input.contactEmail || null);
    setField('tax_number', input.taxNumber || null);
    setField('commercial_record', input.commercialRecord || null);
    setField('address', input.address || null);
    setField('payment_terms_days', input.paymentTermsDays !== undefined ? input.paymentTermsDays : undefined);
    setField('is_preferred', input.isPreferred !== undefined ? (input.isPreferred ? 1 : 0) : undefined);
    setField('is_active', input.isActive !== undefined ? (input.isActive ? 1 : 0) : undefined);
    setField('notes', input.notes || null);
    if (!updates.length) throw new Error('لا توجد بيانات للتعديل.');
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(vendorId);
    this.db.run(`UPDATE facility_service_vendors SET ${updates.join(', ')} WHERE id = ?`, params);
    this.auditActor(actor, 'تعديل مورد خدمة منشأة', vendorId, input);
    return this.getServiceVendor(vendorId)!;
  }

  /* ========== Extended Contracts with SLA ========== */

  static getExtendedContracts(): FacilityContractExtended[] {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const scope = this.branchAccess.sqlScope('fc.branch_id', undefined, actor);
    const today = localDateString();
    const inThirtyDays = localDateString(addLocalDays(new Date(), 30));
    const rows = this.db.query<any>(
      `SELECT fc.id, fc.contract_number AS contractNumber, fc.location_id AS locationId,
              fl.name AS locationName, fc.contract_type AS contractType, fc.title,
              fc.vendor_name AS vendorName, fc.supplier_id AS supplierId,
              s.name AS supplierName, fc.starts_at AS startsAt, fc.ends_at AS endsAt,
              fc.next_payment_date AS nextPaymentDate, fc.payment_amount AS paymentAmount,
              fc.payment_cycle AS paymentCycle, fc.status,
              fc.expense_reference AS expenseReference,
              fc.sla_response_time_minutes AS slaResponseTimeMinutes,
              fc.sla_resolution_time_minutes AS slaResolutionTimeMinutes,
              fc.sla_penalty_per_delay AS slaPenaltyPerDelay,
              fc.auto_renew AS autoRenew, fc.renewal_notice_days AS renewalNoticeDays,
              fc.vendor_rating AS vendorRating, fc.last_evaluation_date AS lastEvaluationDate,
              fc.amendment_count AS amendmentCount
       FROM facility_contracts fc
       JOIN facility_locations fl ON fl.id = fc.location_id
       LEFT JOIN suppliers s ON s.id = fc.supplier_id
       WHERE fc.company_id = ? AND ${scope.clause}
       ORDER BY fc.ends_at, fc.title`,
      [companyId, ...scope.params]
    );
    return rows.map((row) => {
      const endsAt = row.ends_at;
      const daysToExpiry = endsAt
        ? Math.max(0, Math.ceil((Date.parse(`${endsAt}T00:00:00`) - Date.parse(`${today}T00:00:00`)) / 86400000))
        : null;
      const isExpiringSoon = endsAt
        ? endsAt <= inThirtyDays && endsAt >= today
        : false;
      return {
        ...row,
        status: row.status as ContractStatus,
        autoRenew: Boolean(row.autoRenew),
        isExpiringSoon,
        daysToExpiry,
        slaCompliance: this.calculateSLAClaims(row.id),
      };
    });
  }

  private static calculateSLAClaims(contractId: string): number | null {
    // Calculate SLA compliance based on work orders linked to this contract's location/assets
    // Simplified: return null if no data
    const violations = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM facility_work_orders wo
       JOIN facility_contracts fc ON fc.location_id = wo.location_id
       WHERE fc.id = ? AND wo.status = 'COMPLETED'
         AND wo.resolution_time_minutes > COALESCE(fc.sla_resolution_time_minutes, 0)
         AND fc.sla_resolution_time_minutes > 0`,
      [contractId]
    )[0]?.count ?? 0;
    const total = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM facility_work_orders wo
       JOIN facility_contracts fc ON fc.location_id = wo.location_id
       WHERE fc.id = ? AND wo.status = 'COMPLETED'`,
      [contractId]
    )[0]?.count ?? 0;
    if (total === 0) return null;
    return roundNumber(((total - Number(violations)) / total) * 100);
  }

  static updateContractSLA(
    contractId: string,
    input: {
      supplierId?: string | null;
      slaResponseTimeMinutes?: number;
      slaResolutionTimeMinutes?: number;
      slaPenaltyPerDelay?: number;
      autoRenew?: boolean;
      renewalNoticeDays?: number;
    }
  ): FacilityContractExtended {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const contract = this.db.query<{ id: string }>(
      'SELECT id FROM facility_contracts WHERE id = ? AND company_id = ?',
      [contractId, companyId]
    )[0];
    if (!contract) throw new Error('العقد غير موجود.');
    if (input.supplierId !== undefined) {
      const supplier = this.db.query<{ id: string }>(
        'SELECT id FROM suppliers WHERE id = ?',
        [input.supplierId]
      )[0];
      if (!supplier) throw new Error('المورد غير موجود.');
    }
    const updates: string[] = [];
    const params: (string | number | null)[] = [];
    const setField = (column: string, value: string | number | null | undefined) => {
      if (value !== undefined) { updates.push(`${column} = ?`); params.push(value); }
    };
    setField('supplier_id', input.supplierId);
    setField('sla_response_time_minutes', input.slaResponseTimeMinutes);
    setField('sla_resolution_time_minutes', input.slaResolutionTimeMinutes);
    setField('sla_penalty_per_delay', input.slaPenaltyPerDelay);
    setField('auto_renew', input.autoRenew !== undefined ? (input.autoRenew ? 1 : 0) : undefined);
    setField('renewal_notice_days', input.renewalNoticeDays);
    if (!updates.length) throw new Error('لا توجد بيانات للتعديل.');
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(contractId);
    this.db.run(`UPDATE facility_contracts SET ${updates.join(', ')} WHERE id = ?`, params);
    this.auditActor(actor, 'تعديل اتفاقية مستوى الخدمة (SLA)', contractId, input);
    return this.getExtendedContracts().find((c) => c.id === contractId)!;
  }

  /* ========== Contract Payments ========== */

  static getContractPayments(contractId: string): ContractPayment[] {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const scope = this.branchAccess.sqlScope('fc.branch_id', undefined, actor);
    const today = localDateString();
    const rows = this.db.query<any>(
      `SELECT fcp.id, fcp.contract_id AS contractId, fcp.payment_number AS paymentNumber,
              fcp.due_date AS dueDate, fcp.amount_due AS amountDue,
              fcp.amount_paid AS amountPaid, fcp.payment_date AS paymentDate,
              fcp.payment_method AS paymentMethod, fcp.reference_number AS referenceNumber,
              fcp.proof_reference AS proofReference, fcp.status,
              fcp.notes, fcp.created_by AS createdBy, fcp.created_at AS createdAt,
              fcp.updated_at AS updatedAt
       FROM facility_contract_payments fcp
       JOIN facility_contracts fc ON fc.id = fcp.contract_id
       WHERE fcp.contract_id = ? AND fc.company_id = ? AND ${scope.clause}
       ORDER BY fcp.due_date`,
      [contractId, companyId, ...scope.params]
    );
    return rows.map((row) => {
      const dueDate = row.due_date;
      const daysOverdue = dueDate && row.status !== 'PAID'
        ? Math.max(0, Math.ceil((Date.parse(`${today}T00:00:00`) - Date.parse(`${dueDate}T00:00:00`)) / 86400000))
        : null;
      return {
        ...row,
        status: row.status as PaymentStatus,
        daysOverdue,
      };
    });
  }

  static createContractPayment(
    contractId: string,
    input: {
      paymentNumber: string;
      dueDate: string;
      amountDue: number;
      paymentMethod?: string | null;
      referenceNumber?: string | null;
      proofReference?: string | null;
      notes?: string | null;
    }
  ): ContractPayment {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const contract = this.db.query<{ id: string }>(
      'SELECT id FROM facility_contracts WHERE id = ? AND company_id = ?',
      [contractId, companyId]
    )[0];
    if (!contract) throw new Error('العقد غير موجود.');
    if (!input.paymentNumber?.trim()) throw new Error('رقم الدفعة مطلوب.');
    if (!isValidDate(input.dueDate)) throw new Error('تاريخ الاستحقاق غير صالح.');
    if (Number(input.amountDue) < 0) throw new Error('المبلغ المستحق يجب أن يكون غير سالب.');

    const id = `fcp_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO facility_contract_payments
         (id, contract_id, payment_number, due_date, amount_due, amount_paid,
          payment_method, reference_number, proof_reference, status, notes, created_by)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, 'PENDING', ?, ?)`,
      [id, contractId, input.paymentNumber.trim(), input.dueDate,
        Math.max(0, Number(input.amountDue)), input.paymentMethod || null,
        input.referenceNumber || null, input.proofReference || null,
        input.notes || null, actor.id]
    );
    this.auditActor(actor, 'إضافة دفعة عقد خدمة', id, {
      contractId, paymentNumber: input.paymentNumber, amountDue: input.amountDue,
    });
    return this.getContractPayments(contractId).find((p) => p.id === id)!;
  }

  static recordContractPayment(
    paymentId: string,
    input: {
      amountPaid: number;
      paymentDate: string;
      paymentMethod: string;
      referenceNumber?: string | null;
      proofReference?: string | null;
    }
  ): ContractPayment {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const payment = this.db.query<any>(
      `SELECT fcp.*, fc.id AS contractId FROM facility_contract_payments fcp
       JOIN facility_contracts fc ON fc.id = fcp.contract_id
       WHERE fcp.id = ? AND fc.company_id = ?`,
      [paymentId, companyId]
    )[0];
    if (!payment) throw new Error('الدفعة غير موجودة.');
    if (payment.status === 'PAID') throw new Error('الدفعة مسددة مسبقاً.');
    if (!isValidDate(input.paymentDate)) throw new Error('تاريخ الدفع غير صالح.');
    if (Number(input.amountPaid) < 0) throw new Error('المبلغ المسدد يجب أن يكون غير سالب.');

    const newPaid = roundNumber(Number(payment.amount_paid) + Number(input.amountPaid));
    const newStatus = newPaid >= Number(payment.amount_due) ? 'PAID' : 'PARTIAL';
    this.db.run(
      `UPDATE facility_contract_payments SET amount_paid = ?, payment_date = ?,
         payment_method = ?, reference_number = COALESCE(?, reference_number),
         proof_reference = COALESCE(?, proof_reference), status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [newPaid, input.paymentDate, input.paymentMethod, input.referenceNumber || null,
        input.proofReference || null, newStatus, paymentId]
    );

    // Create ledger entry for contract payment
    this.postContractPaymentLedger(payment.contractId, paymentId, newPaid, input.paymentDate, actor);

    this.auditActor(actor, 'تسديد دفعة عقد خدمة', paymentId, {
      contractId: payment.contractId, amountPaid: input.amountPaid, newStatus,
    });
    return this.getContractPayments(payment.contractId).find((p) => p.id === paymentId)!;
  }

  private static postContractPaymentLedger(
    contractId: string,
    paymentId: string,
    amount: number,
    date: string,
    actor: { id: string; fullName: string }
  ): void {
    const contract = this.db.query<{ title: string }>(
      'SELECT title FROM facility_contracts WHERE id = ?',
      [contractId]
    )[0];
    const description = `دفعة عقد خدمة: ${contract?.title || contractId} (${paymentId})`;
    const ledger = this.db.query<{ glAccountCode: string }>(
      "SELECT code AS glAccountCode FROM chart_of_accounts WHERE code = '5205' LIMIT 1"
    )[0];
    if (ledger) {
      postLedgerEntry(this.db.getDatabase(), {
        date,
        description,
        referenceType: 'FACILITY_CONTRACT_PAYMENT',
        referenceId: paymentId,
        createdBy: actor.id,
        lines: [
          { accountCode: '5205', debit: amount, credit: 0 },
          { accountCode: ledger.glAccountCode, debit: 0, credit: amount },
        ],
      });
    }
  }

  /* ========== Contract Renewals ========== */

  static getContractRenewals(contractId?: string): ContractRenewal[] {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const conditions: string[] = ['fcr.company_id = ?'];
    const params: (string | number)[] = [companyId];
    if (contractId) {
      conditions.push('fcr.contract_id = ?');
      params.push(contractId);
    }
    const scope = this.branchAccess.sqlScope('fc.branch_id', undefined, actor);
    conditions.push(scope.clause);
    params.push(...scope.params);

    const rows = this.db.query<any>(
      `SELECT fcr.id, fcr.contract_id AS contractId, fc.title AS contractTitle,
              fcr.renewal_number AS renewalNumber, fcr.previous_ends_at AS previousEndsAt,
              fcr.new_ends_at AS newEndsAt, fcr.new_payment_amount AS newPaymentAmount,
              fcr.new_payment_cycle AS newPaymentCycle, fcr.status,
              fcr.approved_by AS approvedBy, u.full_name AS approvedByName,
              fcr.approved_at AS approvedAt, fcr.notes,
              fcr.created_by AS createdBy, cu.full_name AS createdByName,
              fcr.created_at AS createdAt
       FROM facility_contract_renewals fcr
       JOIN facility_contracts fc ON fc.id = fcr.contract_id
       LEFT JOIN users u ON u.id = fcr.approved_by
       LEFT JOIN users cu ON cu.id = fcr.created_by
       WHERE fc.company_id = ? AND ${conditions.slice(1).join(' AND ')}
       ORDER BY fcr.created_at DESC`,
      params
    );
    return rows.map((row) => ({
      ...row,
      status: row.status as RenewalStatus,
      approvedByName: row.approvedByName || null,
    }));
  }

  static createContractRenewal(
    contractId: string,
    input: {
      newEndsAt: string;
      newPaymentAmount: number;
      newPaymentCycle: string;
      notes?: string | null;
    }
  ): ContractRenewal {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const contract = this.db.query<any>(
      `SELECT fc.id, fc.title, fc.ends_at AS endsAt FROM facility_contracts fc
       WHERE fc.id = ? AND fc.company_id = ?`,
      [contractId, companyId]
    )[0];
    if (!contract) throw new Error('العقد غير موجود.');
    if (!isValidDate(input.newEndsAt)) throw new Error('تاريخ نهاية العقد الجديد غير صالح.');
    if (contract.endsAt && input.newEndsAt <= contract.endsAt) {
      throw new Error('تاريخ نهاية العقد الجديد يجب أن يكون بعد تاريخ نهاية العقد الحالي.');
    }
    if (Number(input.newPaymentAmount) < 0) throw new Error('مبلغ الدفعة يجب أن يكون غير سالب.');

    const renewalNumber = `RN-${localDateString().slice(0, 7)}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
    const id = `fcr_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO facility_contract_renewals
         (id, contract_id, renewal_number, previous_ends_at, new_ends_at,
          new_payment_amount, new_payment_cycle, status, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
      [id, contractId, renewalNumber, contract.endsAt, input.newEndsAt,
        Math.max(0, Number(input.newPaymentAmount)), input.newPaymentCycle,
        input.notes || null, actor.id]
    );
    this.auditActor(actor, 'إنشاء تجديد عقد خدمة', id, {
      contractId, newEndsAt: input.newEndsAt, newPaymentAmount: input.newPaymentAmount,
    });
    return this.getContractRenewals(contractId).find((r) => r.id === id)!;
  }

  static decideContractRenewal(renewalId: string, approve: boolean, notes?: string | null): ContractRenewal {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const renewal = this.db.query<any>(
      `SELECT fcr.*, fc.title AS contractTitle, fc.ends_at AS currentEndsAt
       FROM facility_contract_renewals fcr
       JOIN facility_contracts fc ON fc.id = fcr.contract_id
       WHERE fcr.id = ? AND fc.company_id = ?`,
      [renewalId, companyId]
    )[0];
    if (!renewal) throw new Error('طلب التجديد غير موجود.');
    if (renewal.status !== 'PENDING') throw new Error('تم البت في طلب التجديد مسبقاً.');
    const now = new Date().toISOString();
    const newStatus = approve ? 'APPROVED' : 'REJECTED';
    this.db.run(
      `UPDATE facility_contract_renewals SET status = ?, approved_by = ?,
         approved_at = ?, notes = COALESCE(?, notes), updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [newStatus, actor.id, now, notes || null, renewalId]
    );
    if (approve) {
      // Execute renewal: update contract end date and payment
      this.db.run(
        `UPDATE facility_contracts SET ends_at = ?, payment_amount = ?,
           payment_cycle = ?, status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [renewal.new_ends_at, renewal.new_payment_amount, renewal.new_payment_cycle, renewal.contract_id]
      );
    }
    this.auditActor(actor, approve ? 'اعتماد تجديد عقد خدمة' : 'رفض تجديد عقد خدمة', renewalId, {
      previousStatus: renewal.status, newStatus, notes,
    });
    return this.getContractRenewals(renewal.contract_id).find((r) => r.id === renewalId)!;
  }

  /* ========== Vendor Evaluations ========== */

  static getVendorEvaluations(vendorId?: string): VendorEvaluation[] {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const conditions: string[] = ['fve.company_id = ?'];
    const params: (string | number)[] = [companyId];
    if (vendorId) {
      conditions.push('fve.vendor_id = ?');
      params.push(vendorId);
    }
    const scope = this.branchAccess.sqlScope('fve.branch_id', undefined, actor);
    conditions.push(scope.clause);
    params.push(...scope.params);

    const rows = this.db.query<any>(
      `SELECT fve.id, fve.vendor_id AS vendorId, fsv.supplier_name AS vendorName,
              fve.contract_id AS contractId, fc.title AS contractTitle,
              fve.evaluation_date AS evaluationDate, fve.evaluator_id AS evaluatorId,
              ev.full_name AS evaluatorName, fve.quality_rating AS qualityRating,
              fve.timeliness_rating AS timelinessRating,
              fve.communication_rating AS communicationRating,
              fve.overall_rating AS overallRating, fve.comments,
              fve.issues_found AS issuesFound, fve.actions_required AS actionsRequired,
              fve.follow_up_date AS followUpDate, fve.created_at AS createdAt
       FROM facility_vendor_evaluations fve
       JOIN facility_service_vendors fsv ON fsv.id = fve.vendor_id
       JOIN suppliers s ON s.id = fsv.supplier_id
       LEFT JOIN facility_contracts fc ON fc.id = fve.contract_id
       LEFT JOIN users ev ON ev.id = fve.evaluator_id
       WHERE fve.company_id = ? AND ${conditions.slice(1).join(' AND ')}
       ORDER BY fve.evaluation_date DESC`,
      params
    );
    return rows.map((row) => ({
      ...row,
      evaluatorName: row.evaluatorName || null,
    }));
  }

  static createVendorEvaluation(
    vendorId: string,
    input: {
      contractId?: string | null;
      evaluationDate: string;
      qualityRating: number;
      timelinessRating: number;
      communicationRating: number;
      comments?: string | null;
      issuesFound?: string | null;
      actionsRequired?: string | null;
      followUpDate?: string | null;
    }
  ): VendorEvaluation {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const vendor = this.db.query<{ id: string; supplierName: string }>(
      `SELECT fsv.id, s.name AS supplierName FROM facility_service_vendors fsv
       JOIN suppliers s ON s.id = fsv.supplier_id
       WHERE fsv.id = ? AND fsv.company_id = ?`,
      [vendorId, companyId]
    )[0];
    if (!vendor) throw new Error('المورد غير موجود.');
    if (!isValidDate(input.evaluationDate)) throw new Error('تاريخ التقييم غير صالح.');
    for (const [field, value] of [
      ['جودة الخدمة', input.qualityRating],
      ['الالتزام بالمواعيد', input.timelinessRating],
      ['التواصل', input.communicationRating],
    ]) {
      if (Number(value) < 0 || Number(value) > 5) throw new Error(`تقييم ${field} يجب أن يكون بين 0 و 5.`);
    }
    const overallRating = roundNumber((input.qualityRating + input.timelinessRating + input.communicationRating) / 3);

    const id = `fve_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO facility_vendor_evaluations
         (id, vendor_id, contract_id, evaluation_date, evaluator_id, evaluator_name,
          quality_rating, timeliness_rating, communication_rating, overall_rating,
          comments, issues_found, actions_required, follow_up_date, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, vendorId, input.contractId || null, input.evaluationDate, actor.id, actor.fullName,
        input.qualityRating, input.timelinessRating, input.communicationRating, overallRating,
        input.comments || null, input.issuesFound || null, input.actionsRequired || null,
        input.followUpDate || null, actor.id]
    );

    // Update vendor rating
    const allEvals = this.db.query<{ overall: number }>(
      `SELECT overall_rating AS overall FROM facility_vendor_evaluations WHERE vendor_id = ?`,
      [vendorId]
    );
    const avgRating = roundNumber(allEvals.reduce((sum, row) => sum + Number(row.overall), 0) / allEvals.length);
    this.db.run(
      `UPDATE facility_service_vendors SET rating = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [avgRating, vendorId]
    );

    this.auditActor(actor, 'تقييم أداء مورد خدمة', id, {
      vendorId, vendorName: vendor.supplierName, overallRating,
    });
    return this.getVendorEvaluations(vendorId).find((e) => e.id === id)!;
  }

  /* ========== Contract Amendments ========== */

  static getContractAmendments(contractId: string): ContractAmendment[] {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const scope = this.branchAccess.sqlScope('fc.branch_id', undefined, actor);
    const rows = this.db.query<any>(
      `SELECT fca.id, fca.contract_id AS contractId, fc.title AS contractTitle,
              fca.amendment_number AS amendmentNumber, fca.amendment_date AS amendmentDate,
              fca.field_changed AS fieldChanged, fca.old_value AS oldValue,
              fca.new_value AS newValue, fca.reason, fca.approved_by AS approvedBy,
              u.full_name AS approvedByName, fca.approved_at AS approvedAt,
              fca.notes, fca.created_by AS createdBy, cu.full_name AS createdByName,
              fca.created_at AS createdAt
       FROM facility_contract_amendments fca
       JOIN facility_contracts fc ON fc.id = fca.contract_id
       LEFT JOIN users u ON u.id = fca.approved_by
       LEFT JOIN users cu ON cu.id = fca.created_by
       WHERE fca.contract_id = ? AND fc.company_id = ? AND ${scope.clause}
       ORDER BY fca.amendment_date DESC`,
      [contractId, companyId, ...scope.params]
    );
    return rows.map((row) => ({
      ...row,
      approvedByName: row.approvedByName || null,
    }));
  }

  static createContractAmendment(
    contractId: string,
    input: {
      amendmentDate: string;
      fieldChanged: string;
      oldValue?: string | null;
      newValue?: string | null;
      reason: string;
      notes?: string | null;
    }
  ): ContractAmendment {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const contract = this.db.query<{ id: string; amendmentCount: number }>(
      `SELECT id, amendment_count AS amendmentCount FROM facility_contracts WHERE id = ? AND company_id = ?`,
      [contractId, companyId]
    )[0];
    if (!contract) throw new Error('العقد غير موجود.');
    if (!isValidDate(input.amendmentDate)) throw new Error('تاريخ التعديل غير صالح.');
    if (!input.fieldChanged?.trim()) throw new Error('الحقل المعدل مطلوب.');
    if (!input.reason?.trim()) throw new Error('سبب التعديل مطلوب.');

    const amendmentNumber = `AM-${localDateString().slice(0, 7)}-${String(contract.amendmentCount + 1).padStart(3, '0')}`;
    const id = `fca_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO facility_contract_amendments
         (id, contract_id, amendment_number, amendment_date, field_changed,
          old_value, new_value, reason, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, contractId, amendmentNumber, input.amendmentDate, input.fieldChanged.trim(),
        input.oldValue || null, input.newValue || null, input.reason.trim(),
        input.notes || null, actor.id]
    );
    this.db.run(
      `UPDATE facility_contracts SET amendment_count = amendment_count + 1,
         updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [contractId]
    );
    this.auditActor(actor, 'إضافة تعديل عقد خدمة', id, {
      contractId, fieldChanged: input.fieldChanged, reason: input.reason,
    });
    return this.getContractAmendments(contractId).find((a) => a.id === id)!;
  }

  /* ========== SLA Violations & Alerts ========== */

  static getSLASeverityViolations(): SLAViolation[] {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const today = localDateString();
    const violations: SLAViolation[] = [];

    // Overdue payments
    const overduePayments = this.db.query<any>(
      `SELECT fcp.id, fcp.contract_id AS contractId, fc.title AS contractTitle,
              fc.vendor_name AS vendorName, fcp.due_date AS dueDate,
              fcp.amount_due AS amountDue, fcp.amount_paid AS amountPaid
       FROM facility_contract_payments fcp
       JOIN facility_contracts fc ON fc.id = fcp.contract_id
       WHERE fc.company_id = ? AND fcp.status IN ('PENDING', 'PARTIAL')
         AND fcp.due_date < ?`,
      [companyId, today]
    );
    for (const p of overduePayments) {
      violations.push({
        id: `sla_pay_${p.id}`,
        contractId: p.contractId,
        contractTitle: p.contractTitle,
        vendorName: p.vendorName,
        violationType: 'PAYMENT_OVERDUE',
        severity: 'HIGH',
        description: `دفعة متأخرة لعقد "${p.contractTitle}" بقيمة ${Number(p.amountDue) - Number(p.amountPaid)} ج، استحقاق في ${p.dueDate}`,
        detectedAt: today,
        dueDate: p.dueDate,
        penaltyAmount: null,
        status: 'OPEN',
      });
    }

    // Expiring contracts
    const inThirtyDays = localDateString(addLocalDays(new Date(), 30));
    const expiringContracts = this.db.query<any>(
      `SELECT fc.id, fc.contract_number AS contractNumber, fc.title,
              fc.vendor_name AS vendorName, fc.ends_at AS endsAt,
              fc.auto_renew AS autoRenew
       FROM facility_contracts fc
       WHERE fc.company_id = ? AND fc.status = 'ACTIVE'
         AND fc.ends_at BETWEEN ? AND ?
         AND fc.auto_renew = 0`,
      [companyId, today, inThirtyDays]
    );
    for (const c of expiringContracts) {
      violations.push({
        id: `sla_exp_${c.id}`,
        contractId: c.id,
        contractTitle: c.title,
        vendorName: c.vendorName,
        violationType: 'CONTRACT_EXPIRY',
        severity: 'CRITICAL',
        description: `عقد "${c.title}" ينتهي في ${c.ends_at} ولم يتم تفعيل التجديد التلقائي`,
        detectedAt: today,
        dueDate: c.ends_at,
        penaltyAmount: null,
        status: 'OPEN',
      });
    }

    return violations.sort((a, b) => {
      const sevOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      return (sevOrder[a.severity] ?? 99) - (sevOrder[b.severity] ?? 99);
    });
  }

  static acknowledgeSLASeverity(violationId: string): void {
    const actor = this.requireManage();
    this.auditActor(actor, 'اعتراف بمخالفة SLA', violationId, { acknowledgedBy: actor.id });
  }

  /* ========== Stats ========== */

  static getVendorStats(): VendorStats {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const total = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM facility_service_vendors WHERE company_id = ?`,
      [companyId]
    )[0]?.count ?? 0;
    const active = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM facility_service_vendors WHERE company_id = ? AND is_active = 1`,
      [companyId]
    )[0]?.count ?? 0;
    const preferred = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM facility_service_vendors WHERE company_id = ? AND is_preferred = 1`,
      [companyId]
    )[0]?.count ?? 0;
    const byCategory = this.db.query<any>(
      `SELECT service_categories AS category, COUNT(*) AS count
       FROM facility_service_vendors WHERE company_id = ? AND is_active = 1
       GROUP BY service_categories`,
      [companyId]
    );
    const avgRating = this.db.query<{ avg: number }>(
      `SELECT AVG(rating) AS avg FROM facility_service_vendors WHERE company_id = ? AND is_active = 1`,
      [companyId]
    )[0]?.avg ?? 0;
    const topVendors = this.db.query<any>(
      `SELECT fsv.id, s.name AS name, fsv.rating, fsv.total_contracts
       FROM facility_service_vendors fsv
       JOIN suppliers s ON s.id = fsv.supplier_id
       WHERE fsv.company_id = ? AND fsv.is_active = 1
       ORDER BY fsv.rating DESC, fsv.total_contracts DESC LIMIT 5`,
      [companyId]
    );
    return {
      totalVendors: Number(total),
      activeVendors: Number(active),
      preferredVendors: Number(preferred),
      vendorsByCategory: byCategory.map((row) => ({ category: row.category, count: Number(row.count) })),
      averageRating: roundNumber(Number(avgRating) || 0),
      topVendors: topVendors.map((row) => ({
        id: row.id, name: row.name, rating: Number(row.rating) || 0,
        totalContracts: Number(row.total_contracts) || 0,
      })),
    };
  }

  /* ========== Helpers ========== */

  private static auditActor(actor: { id: string; fullName: string }, action: string, recordId: string, values: object): void {
    this.db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
       VALUES (?, ?, ?, ?, 'OPERATIONS', ?, ?)`,
      [`aud_${uuidv4().replace(/-/g, '').slice(0, 12)}`, actor.id, actor.fullName, action, recordId,
        JSON.stringify(values)]
    );
  }
}

function roundNumber(value: number): number {
  return Math.round(value * 100) / 100;
}

function isValidDate(value: string): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
