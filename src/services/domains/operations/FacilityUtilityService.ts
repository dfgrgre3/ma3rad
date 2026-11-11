import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import { NotificationService } from '../notifications/NotificationService';
import { localDateString, addLocalDays } from '../../../utils/shared/date';

export type UtilityType = 'ELECTRICITY' | 'WATER' | 'GAS' | 'INTERNET' | 'HVAC' | 'GENERATOR' | 'ELEVATOR' | 'FIRE_SUPPRESSION' | 'WASTE' | 'OTHER';
export type UnitOfMeasure = 'kWh' | 'm3' | 'liter' | 'GB' | 'hour' | 'unit' | 'OTHER';
export type BillStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'CANCELLED';
export type OutageType = 'PLANNED' | 'UNPLANNED' | 'EMERGENCY';
export type OutageStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export interface UtilityMeter {
  id: string;
  locationId: string;
  locationName: string;
  branchId: string;
  branchName: string;
  meterCode: string;
  meterName: string;
  utilityType: UtilityType;
  unitOfMeasure: UnitOfMeasure;
  tariffPerUnit: number;
  fixedMonthlyFee: number;
  installationDate: string | null;
  lastReadingDate: string | null;
  lastReadingValue: number;
  isActive: boolean;
  notes: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface UtilityMeterInput {
  locationId: string;
  meterName: string;
  utilityType: UtilityType;
  unitOfMeasure?: UnitOfMeasure;
  tariffPerUnit?: number;
  fixedMonthlyFee?: number;
  installationDate?: string | null;
  notes?: string | null;
}

export interface UtilityReading {
  id: string;
  meterId: string;
  meterCode: string;
  meterName: string;
  readingDate: string;
  readingValue: number;
  previousValue: number;
  consumption: number;
  cost: number;
  isEstimated: boolean;
  recordedBy: string;
  recordedByName: string;
  recordedAt: string;
  notes: string | null;
}

export interface UtilityReadingInput {
  meterId: string;
  readingDate: string;
  readingValue: number;
  isEstimated?: boolean;
  notes?: string | null;
}

export interface UtilityBill {
  id: string;
  meterId: string;
  meterCode: string;
  meterName: string;
  utilityType: UtilityType;
  billNumber: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  billDate: string;
  dueDate: string;
  amountDue: number;
  amountPaid: number;
  consumption: number;
  status: BillStatus;
  paymentDate: string | null;
  paymentReference: string | null;
  paymentProof: string | null;
  expenseId: string | null;
  contractId: string | null;
  daysOverdue: number | null;
  notes: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface UtilityBillInput {
  meterId: string;
  billNumber: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  billDate: string;
  dueDate: string;
  amountDue: number;
  consumption?: number;
  expenseId?: string | null;
  contractId?: string | null;
  notes?: string | null;
}

export interface UtilityBillPaymentInput {
  amountPaid: number;
  paymentDate: string;
  paymentReference?: string | null;
  paymentProof?: string | null;
}

export interface UtilityContract {
  id: string;
  meterId: string;
  meterCode: string;
  meterName: string;
  utilityType: UtilityType;
  supplierId: string;
  supplierName: string;
  contractNumber: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  autoRenew: boolean;
  renewalNoticeDays: number;
  slaResponseTimeHours: number;
  slaResolutionTimeHours: number;
  status: string;
  notes: string | null;
  daysToExpiry: number | null;
  isExpiringSoon: boolean;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface UtilityContractInput {
  meterId: string;
  supplierId: string;
  contractNumber: string;
  title: string;
  startsAt: string;
  endsAt?: string | null;
  autoRenew?: boolean;
  renewalNoticeDays?: number;
  slaResponseTimeHours?: number;
  slaResolutionTimeHours?: number;
  notes?: string | null;
}

export interface UtilityOutage {
  id: string;
  meterId: string;
  meterCode: string;
  meterName: string;
  utilityType: UtilityType;
  outageType: OutageType;
  outageStart: string;
  outageEnd: string | null;
  durationMinutes: number;
  affectedAreas: string | null;
  cause: string | null;
  reportedBy: string;
  reportedByName: string;
  reportedAt: string;
  resolvedBy: string | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
  status: OutageStatus;
  notes: string | null;
}

export interface UtilityOutageInput {
  meterId: string;
  outageType: OutageType;
  outageStart: string;
  outageEnd?: string | null;
  affectedAreas?: string | null;
  cause?: string | null;
  notes?: string | null;
}

export interface UtilityConsumptionComparison {
  branchId: string;
  branchName: string;
  utilityType: UtilityType;
  periodMonth: string;
  totalConsumption: number;
  totalCost: number;
  meterCount: number;
}

export interface UtilityStats {
  totalMeters: number;
  activeMeters: number;
  metersByType: Array<{ type: string; count: number }>;
  pendingBills: number;
  overdueBills: number;
  totalAmountDue: number;
  totalAmountPaid: number;
  openOutages: number;
  monthlyConsumptionByType: Array<{ type: string; month: string; consumption: number; cost: number }>;
  topConsumingBranches: Array<{ branchId: string; branchName: string; totalCost: number }>;
}

const MAX_DATE = '9999-12-31';

function roundNumber(value: number): number {
  return Math.round(value * 100) / 100;
}

function isValidDate(value: string | null | undefined): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export class FacilityUtilityService {
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

  /* ========== Utility Meters ========== */

  static getUtilityMeters(utilityType?: UtilityType): UtilityMeter[] {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const conditions: string[] = ['um.company_id = ?'];
    const params: (string | number)[] = [companyId];
    if (utilityType) {
      conditions.push('um.utility_type = ?');
      params.push(utilityType);
    }
    const scope = this.branchAccess.sqlScope('um.branch_id', undefined, actor);
    conditions.push(scope.clause);
    params.push(...scope.params);

    const rows = this.db.query<any>(
      `SELECT um.id, um.location_id AS locationId, fl.name AS locationName,
              um.branch_id AS branchId, b.name AS branchName,
              um.meter_code AS meterCode, um.meter_name AS meterName,
              um.utility_type AS utilityType, um.unit_of_measure AS unitOfMeasure,
              um.tariff_per_unit AS tariffPerUnit, um.fixed_monthly_fee AS fixedMonthlyFee,
              um.installation_date AS installationDate, um.last_reading_date AS lastReadingDate,
              um.last_reading_value AS lastReadingValue, um.is_active AS isActive,
              um.notes, um.created_by AS createdBy, u.full_name AS createdByName,
              um.created_at AS createdAt, um.updated_at AS updatedAt
       FROM facility_utility_meters um
       JOIN facility_locations fl ON fl.id = um.location_id
       JOIN branches b ON b.id = um.branch_id
       LEFT JOIN users u ON u.id = um.created_by
       WHERE um.company_id = ? AND ${conditions.slice(1).join(' AND ')}
       ORDER BY um.utility_type, um.meter_name`,
      params
    );
    return rows.map((row) => ({
      ...row,
      utilityType: row.utility_type as UtilityType,
      unitOfMeasure: row.unit_of_measure as UnitOfMeasure,
      isActive: Boolean(row.isActive),
    }));
  }

  static createUtilityMeter(input: UtilityMeterInput): UtilityMeter {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const location = this.db.query<{ id: string; name: string; branch_id: string }>(
      'SELECT id, name, branch_id AS branchId FROM facility_locations WHERE id = ?',
      [input.locationId]
    )[0];
    if (!location) throw new Error('الموقع غير موجود.');
    const branch = this.db.query<{ id: string; name: string }>(
      'SELECT id, name FROM branches WHERE id = ?',
      [location.branch_id]
    )[0];
    if (!branch) throw new Error('الفرع غير موجود.');
    if (!input.meterName?.trim()) throw new Error('اسم العداد مطلوب.');
    if (!isValidDate(input.installationDate || '')) {
      // installation date is optional, skip validation if empty
    }
    const meterCode = `UM-${localDateString().slice(0, 7)}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
    const id = `um_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO facility_utility_meters
         (id, location_id, branch_id, meter_code, meter_name, utility_type,
          unit_of_measure, tariff_per_unit, fixed_monthly_fee, installation_date,
          is_active, notes, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.locationId, location.branch_id, meterCode, input.meterName.trim(),
        input.utilityType, input.unitOfMeasure ?? 'kWh',
        input.tariffPerUnit ?? 0, input.fixedMonthlyFee ?? 0,
        input.installationDate || null, 1, input.notes || null, actor.id,
        new Date().toISOString(), new Date().toISOString()]
    );
    this.auditActor(actor, 'إضافة عداد مرافق', id, {
      meterCode, meterName: input.meterName, utilityType: input.utilityType,
    });
    return this.getUtilityMeter(id)!;
  }

  private static getUtilityMeter(id: string): UtilityMeter | null {
    const meters = this.getUtilityMeters().filter((m) => m.id === id);
    return meters[0] ?? null;
  }

  static updateUtilityMeter(id: string, input: Partial<UtilityMeterInput>): UtilityMeter {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const meter = this.db.query<{ id: string }>(
      'SELECT id FROM facility_utility_meters WHERE id = ? AND company_id = ?',
      [id, companyId]
    )[0];
    if (!meter) throw new Error('العداد غير موجود.');
    const updates: string[] = [];
    const params: (string | number | null)[] = [];
    const setField = (column: string, value: string | number | null | undefined) => {
      if (value !== undefined) { updates.push(`${column} = ?`); params.push(value); }
    };
    setField('meter_name', input.meterName?.trim() || null);
    setField('utility_type', input.utilityType || null);
    setField('unit_of_measure', input.unitOfMeasure || null);
    setField('tariff_per_unit', input.tariffPerUnit !== undefined ? input.tariffPerUnit : undefined);
    setField('fixed_monthly_fee', input.fixedMonthlyFee !== undefined ? input.fixedMonthlyFee : undefined);
    setField('installation_date', input.installationDate || null);
    setField('notes', input.notes || null);
    if (!updates.length) throw new Error('لا توجد بيانات للتعديل.');
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);
    this.db.run(`UPDATE facility_utility_meters SET ${updates.join(', ')} WHERE id = ?`, params);
    this.auditActor(actor, 'تعديل عداد مرافق', id, input);
    return this.getUtilityMeter(id)!;
  }

  static toggleMeterActive(id: string, isActive: boolean): UtilityMeter {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const meter = this.db.query<{ id: string }>(
      'SELECT id FROM facility_utility_meters WHERE id = ? AND company_id = ?',
      [id, companyId]
    )[0];
    if (!meter) throw new Error('العداد غير موجود.');
    this.db.run(
      `UPDATE facility_utility_meters SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [isActive ? 1 : 0, id]
    );
    this.auditActor(actor, isActive ? 'تفعيل عداد مرافق' : 'تعطيل عداد مرافق', id, { isActive });
    return this.getUtilityMeter(id)!;
  }

  /* ========== Utility Readings ========== */

  static getUtilityReadings(options: {
    meterId?: string;
    from?: string;
    to?: string;
    limit?: number;
  }): UtilityReading[] {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const conditions: string[] = ['um.company_id = ?'];
    const params: (string | number)[] = [companyId];
    if (options.meterId) {
      conditions.push('ur.meter_id = ?');
      params.push(options.meterId);
    }
    if (options.from) {
      conditions.push('ur.reading_date >= ?');
      params.push(options.from);
    }
    if (options.to) {
      conditions.push('ur.reading_date <= ?');
      params.push(options.to);
    }
    const scope = this.branchAccess.sqlScope('um.branch_id', undefined, actor);
    conditions.push(scope.clause);
    params.push(...scope.params);
    const limit = options.limit ? `LIMIT ${Math.min(options.limit, 500)}` : '';

    const rows = this.db.query<any>(
      `SELECT ur.id, ur.meter_id AS meterId, um.meter_code AS meterCode,
              um.meter_name AS meterName, ur.reading_date AS readingDate,
              ur.reading_value AS readingValue, ur.previous_value AS previousValue,
              ur.consumption, ur.cost, ur.is_estimated AS isEstimated,
              ur.recorded_by AS recordedBy, u.full_name AS recordedByName,
              ur.recorded_at AS recordedAt, ur.notes
       FROM facility_utility_readings ur
       JOIN facility_utility_meters um ON um.id = ur.meter_id
       LEFT JOIN users u ON u.id = ur.recorded_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY ur.reading_date DESC ${limit}`,
      params
    );
    return rows.map((row) => ({
      ...row,
      isEstimated: Boolean(row.is_estimated),
    }));
  }

  static createUtilityReading(input: UtilityReadingInput): UtilityReading {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const meter = this.db.query<{ id: string; meterCode: string; meterName: string; lastReadingValue: number; tariffPerUnit: number }>(
      `SELECT um.id, um.meter_code AS meterCode, um.meter_name AS meterName,
              um.last_reading_value AS lastReadingValue, um.tariff_per_unit AS tariffPerUnit
       FROM facility_utility_meters um
       WHERE um.id = ? AND um.company_id = ? AND um.is_active = 1`,
      [input.meterId, companyId]
    )[0];
    if (!meter) throw new Error('العداد غير موجود أو غير نشط.');
    if (!isValidDate(input.readingDate)) throw new Error('تاريخ القراءة غير صالح.');
    if (Number(input.readingValue) < 0) throw new Error('قيمة القراءة يجب أن تكون غير سالبة.');
    const existing = this.db.query<{ id: string }>(
      'SELECT id FROM facility_utility_readings WHERE meter_id = ? AND reading_date = ?',
      [input.meterId, input.readingDate]
    )[0];
    if (existing) throw new Error('يوجد قراءة مسجلة لهذا العداد في نفس التاريخ.');
    const previousValue = meter.lastReadingValue;
    const consumption = roundNumber(Math.max(0, Number(input.readingValue) - previousValue));
    const cost = roundNumber(consumption * meter.tariffPerUnit);
    const id = `ur_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.executeTransaction((db) => {
      db.run(
        `INSERT INTO facility_utility_readings
           (id, meter_id, reading_date, reading_value, previous_value, consumption,
            cost, is_estimated, recorded_by, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, input.meterId, input.readingDate, Number(input.readingValue),
          previousValue, consumption, cost, input.isEstimated ? 1 : 0, actor.id,
          input.notes || null]
      );
      db.run(
        `UPDATE facility_utility_meters
         SET last_reading_date = ?, last_reading_value = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [input.readingDate, Number(input.readingValue), input.meterId]
      );
      this.auditDB(db, actor, 'إضافة قراءة عداد', id, {
        meterId: input.meterId, readingValue: input.readingValue, consumption, cost,
      });
    });
    return this.getUtilityReading(id)!;
  }

  private static getUtilityReading(id: string): UtilityReading | null {
    const readings = this.getUtilityReadings({ limit: 1000 }).filter((r) => r.id === id);
    return readings[0] ?? null;
  }

  /* ========== Utility Bills ========== */

  static getUtilityBills(options: {
    meterId?: string;
    status?: BillStatus;
    from?: string;
    to?: string;
  } = {}): UtilityBill[] {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const conditions: string[] = ['um.company_id = ?'];
    const params: (string | number)[] = [companyId];
    if (options.meterId) {
      conditions.push('fub.meter_id = ?');
      params.push(options.meterId);
    }
    if (options.status) {
      conditions.push('fub.status = ?');
      params.push(options.status);
    }
    if (options.from) {
      conditions.push('fub.billing_period_start >= ?');
      params.push(options.from);
    }
    if (options.to) {
      conditions.push('fub.billing_period_end <= ?');
      params.push(options.to);
    }
    const scope = this.branchAccess.sqlScope('um.branch_id', undefined, actor);
    conditions.push(scope.clause);
    params.push(...scope.params);

    const today = localDateString();
    const rows = this.db.query<any>(
      `SELECT fub.id, fub.meter_id AS meterId, um.meter_code AS meterCode,
              um.meter_name AS meterName, um.utility_type AS utilityType,
              fub.bill_number AS billNumber, fub.billing_period_start AS billingPeriodStart,
              fub.billing_period_end AS billingPeriodEnd, fub.bill_date AS billDate,
              fub.due_date AS dueDate, fub.amount_due AS amountDue,
              fub.amount_paid AS amountPaid, fub.consumption, fub.status,
              fub.payment_date AS paymentDate, fub.payment_reference AS paymentReference,
              fub.payment_proof AS paymentProof, fub.expense_id AS expenseId,
              fub.contract_id AS contractId, fub.notes,
              fub.created_by AS createdBy, u.full_name AS createdByName,
              fub.created_at AS createdAt, fub.updated_at AS updatedAt
       FROM facility_utility_bills fub
       JOIN facility_utility_meters um ON um.id = fub.meter_id
       LEFT JOIN users u ON u.id = fub.created_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY fub.due_date DESC`,
      params
    );
    return rows.map((row) => {
      const dueDate = row.due_date;
      const daysOverdue = dueDate && row.status !== 'PAID'
        ? Math.max(0, Math.ceil((Date.parse(`${today}T00:00:00`) - Date.parse(`${dueDate}T00:00:00`)) / 86400000))
        : null;
      return {
        ...row,
        utilityType: row.utility_type as UtilityType,
        status: row.status as BillStatus,
        daysOverdue,
      };
    });
  }

  static createUtilityBill(input: UtilityBillInput): UtilityBill {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const meter = this.db.query<{ id: string; meterCode: string; meterName: string; utilityType: UtilityType }>(
      `SELECT um.id, um.meter_code AS meterCode, um.meter_name AS meterName,
              um.utility_type AS utilityType
       FROM facility_utility_meters um
       WHERE um.id = ? AND um.company_id = ?`,
      [input.meterId, companyId]
    )[0];
    if (!meter) throw new Error('العداد غير موجود.');
    if (!input.billNumber?.trim()) throw new Error('رقم الفاتورة مطلوب.');
    if (!isValidDate(input.billingPeriodStart) || !isValidDate(input.billingPeriodEnd)) {
      throw new Error('تواريخ فترة الفوترة غير صالحة.');
    }
    if (input.billingPeriodEnd < input.billingPeriodStart) {
      throw new Error('تاريخ نهاية الفترة يسبق تاريخ بدايتها.');
    }
    if (!isValidDate(input.billDate) || !isValidDate(input.dueDate)) {
      throw new Error('تاريخ الفاتورة أو الاستحقاق غير صالح.');
    }
    if (Number(input.amountDue) < 0) throw new Error('المبلغ المستحق يجب أن يكون غير سالب.');
    const existing = this.db.query<{ id: string }>(
      `SELECT id FROM facility_utility_bills
       WHERE meter_id = ? AND billing_period_start = ? AND billing_period_end = ?`,
      [input.meterId, input.billingPeriodStart, input.billingPeriodEnd]
    )[0];
    if (existing) throw new Error('يوجد فاتورة مسجلة لنفس العداد وفترة الفوترة.');
    const id = `ub_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO facility_utility_bills
         (id, meter_id, bill_number, billing_period_start, billing_period_end,
          bill_date, due_date, amount_due, amount_paid, consumption, status,
          expense_id, contract_id, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'PENDING', ?, ?, ?, ?)`,
      [id, input.meterId, input.billNumber.trim(), input.billingPeriodStart,
        input.billingPeriodEnd, input.billDate, input.dueDate,
        Math.max(0, Number(input.amountDue)), input.consumption ?? 0,
        input.expenseId || null, input.contractId || null, input.notes || null,
        actor.id]
    );
    this.auditActor(actor, 'إضافة فاتورة مرافق', id, {
      meterId: input.meterId, billNumber: input.billNumber, amountDue: input.amountDue,
    });
    return this.getUtilityBill(id)!;
  }

  private static getUtilityBill(id: string): UtilityBill | null {
    const bills = this.getUtilityBills().filter((b) => b.id === id);
    return bills[0] ?? null;
  }

  static payUtilityBill(billId: string, input: UtilityBillPaymentInput): UtilityBill {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const bill = this.db.query<{ id: string; amountDue: number; amountPaid: number; meterId: string; status: string }>(
      `SELECT fub.id, fub.amount_due AS amountDue, fub.amount_paid AS amountPaid,
              fub.meter_id AS meterId, fub.status
       FROM facility_utility_bills fub
       JOIN facility_utility_meters um ON um.id = fub.meter_id
       WHERE fub.id = ? AND um.company_id = ?`,
      [billId, companyId]
    )[0];
    if (!bill) throw new Error('الفاتورة غير موجودة.');
    if (bill.status === 'PAID') throw new Error('الفاتورة مسددة مسبقاً.');
    if (!isValidDate(input.paymentDate)) throw new Error('تاريخ الدفع غير صالح.');
    if (Number(input.amountPaid) < 0) throw new Error('المبلغ المسدد يجب أن يكون غير سالب.');
    const newPaid = roundNumber(Number(bill.amountPaid) + Number(input.amountPaid));
    const newStatus = newPaid >= Number(bill.amountDue) ? 'PAID' : 'PARTIAL';
    this.db.run(
      `UPDATE facility_utility_bills SET amount_paid = ?, payment_date = ?,
         payment_reference = COALESCE(?, payment_reference),
         payment_proof = COALESCE(?, payment_proof), status = ?,
         updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [newPaid, input.paymentDate, input.paymentReference || null,
        input.paymentProof || null, newStatus, billId]
    );
    this.auditActor(actor, 'سداد فاتورة مرافق', billId, {
      meterId: bill.meterId, amountPaid: input.amountPaid, newStatus,
    });
    return this.getUtilityBill(billId)!;
  }

  /* ========== Utility Contracts ========== */

  static getUtilityContracts(): UtilityContract[] {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const scope = this.branchAccess.sqlScope('um.branch_id', undefined, actor);
    const today = localDateString();
    const inThirtyDays = localDateString(addLocalDays(new Date(), 30));
    const rows = this.db.query<any>(
      `SELECT fuc.id, fuc.meter_id AS meterId, um.meter_code AS meterCode,
              um.meter_name AS meterName, um.utility_type AS utilityType,
              fuc.supplier_id AS supplierId, s.name AS supplierName,
              fuc.contract_number AS contractNumber, fuc.title,
              fuc.starts_at AS startsAt, fuc.ends_at AS endsAt,
              fuc.auto_renew AS autoRenew, fuc.renewal_notice_days AS renewalNoticeDays,
              fuc.sla_response_time_hours AS slaResponseTimeHours,
              fuc.sla_resolution_time_hours AS slaResolutionTimeHours,
              fuc.status, fuc.notes,
              fuc.created_by AS createdBy, u.full_name AS createdByName,
              fuc.created_at AS createdAt, fuc.updated_at AS updatedAt
       FROM facility_utility_contracts fuc
       JOIN facility_utility_meters um ON um.id = fuc.meter_id
       JOIN suppliers s ON s.id = fuc.supplier_id
       LEFT JOIN users u ON u.id = fuc.created_by
       WHERE um.company_id = ? AND ${scope.clause}
       ORDER BY fuc.ends_at, fuc.title`,
      [companyId, ...scope.params]
    );
    return rows.map((row) => {
      const endsAt = row.ends_at;
      const daysToExpiry = endsAt
        ? Math.max(0, Math.ceil((Date.parse(`${endsAt}T00:00:00`) - Date.parse(`${today}T00:00:00`)) / 86400000))
        : null;
      const isExpiringSoon = endsAt ? endsAt <= inThirtyDays && endsAt >= today : false;
      return {
        ...row,
        utilityType: row.utility_type as UtilityType,
        autoRenew: Boolean(row.autoRenew),
        status: row.status as string,
        daysToExpiry,
        isExpiringSoon,
        createdByName: row.created_by_name || null,
      };
    });
  }

  static createUtilityContract(input: UtilityContractInput): UtilityContract {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const meter = this.db.query<{ id: string; meterCode: string; meterName: string; utilityType: UtilityType }>(
      `SELECT um.id, um.meter_code AS meterCode, um.meter_name AS meterName,
              um.utility_type AS utilityType
       FROM facility_utility_meters um
       WHERE um.id = ? AND um.company_id = ?`,
      [input.meterId, companyId]
    )[0];
    if (!meter) throw new Error('العداد غير موجود.');
    const supplier = this.db.query<{ id: string; name: string }>(
      'SELECT id, name FROM suppliers WHERE id = ?',
      [input.supplierId]
    )[0];
    if (!supplier) throw new Error('المورد غير موجود.');
    if (!input.contractNumber?.trim()) throw new Error('رقم العقد مطلوب.');
    if (!input.title?.trim()) throw new Error('عنوان العقد مطلوب.');
    if (!isValidDate(input.startsAt)) throw new Error('تاريخ بداية العقد غير صالح.');
    if (input.endsAt && !isValidDate(input.endsAt)) throw new Error('تاريخ نهاية العقد غير صالح.');
    if (input.endsAt && input.endsAt < input.startsAt) {
      throw new Error('تاريخ نهاية العقد يسبق تاريخ بدايته.');
    }
    const existing = this.db.query<{ id: string }>(
      'SELECT id FROM facility_utility_contracts WHERE meter_id = ? AND contract_number = ?',
      [input.meterId, input.contractNumber.trim()]
    )[0];
    if (existing) throw new Error('رقم العقد مسجل مسبقاً لهذا العداد.');
    const id = `uc_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO facility_utility_contracts
         (id, meter_id, supplier_id, contract_number, title, starts_at, ends_at,
          auto_renew, renewal_notice_days, sla_response_time_hours,
          sla_resolution_time_hours, status, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`,
      [id, input.meterId, input.supplierId, input.contractNumber.trim(),
        input.title.trim(), input.startsAt, input.endsAt || null,
        input.autoRenew ? 1 : 0, input.renewalNoticeDays ?? 30,
        input.slaResponseTimeHours ?? 24, input.slaResolutionTimeHours ?? 48,
        input.notes || null, actor.id]
    );
    this.auditActor(actor, 'إضافة عقد خدمة مرافق', id, {
      meterId: input.meterId, contractNumber: input.contractNumber, supplierId: input.supplierId,
    });
    return this.getUtilityContract(id)!;
  }

  private static getUtilityContract(id: string): UtilityContract | null {
    const contracts = this.getUtilityContracts().filter((c) => c.id === id);
    return contracts[0] ?? null;
  }

  static updateUtilityContractStatus(id: string, status: string): UtilityContract {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const contract = this.db.query<{ id: string }>(
      `SELECT fuc.id FROM facility_utility_contracts fuc
       JOIN facility_utility_meters um ON um.id = fuc.meter_id
       WHERE fuc.id = ? AND um.company_id = ?`,
      [id, companyId]
    )[0];
    if (!contract) throw new Error('العقد غير موجود.');
    this.db.run(
      `UPDATE facility_utility_contracts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [status, id]
    );
    this.auditActor(actor, 'تعديل عقد خدمة مرافق', id, { status });
    return this.getUtilityContract(id)!;
  }

  /* ========== Utility Outages ========== */

  static getUtilityOutages(options: {
    meterId?: string;
    status?: OutageStatus;
    from?: string;
    to?: string;
    limit?: number;
  }): UtilityOutage[] {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const conditions: string[] = ['um.company_id = ?'];
    const params: (string | number)[] = [companyId];
    if (options.meterId) {
      conditions.push('uo.meter_id = ?');
      params.push(options.meterId);
    }
    if (options.status) {
      conditions.push('uo.status = ?');
      params.push(options.status);
    }
    if (options.from) {
      conditions.push('uo.outage_start >= ?');
      params.push(options.from);
    }
    if (options.to) {
      conditions.push('uo.outage_start <= ?');
      params.push(options.to);
    }
    const scope = this.branchAccess.sqlScope('um.branch_id', undefined, actor);
    conditions.push(scope.clause);
    params.push(...scope.params);

    const rows = this.db.query<any>(
      `SELECT uo.id, uo.meter_id AS meterId, um.meter_code AS meterCode,
              um.meter_name AS meterName, um.utility_type AS utilityType,
              uo.outage_type AS outageType, uo.outage_start AS outageStart,
              uo.outage_end AS outageEnd, uo.duration_minutes AS durationMinutes,
              uo.affected_areas AS affectedAreas, uo.cause,
              uo.reported_by AS reportedBy, r.full_name AS reportedByName,
              uo.reported_at AS reportedAt, uo.resolved_by AS resolvedBy,
              res.full_name AS resolvedByName, uo.resolved_at AS resolvedAt,
              uo.status, uo.notes
       FROM facility_utility_outages uo
       JOIN facility_utility_meters um ON um.id = uo.meter_id
       LEFT JOIN users r ON r.id = uo.reported_by
       LEFT JOIN users res ON res.id = uo.resolved_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY uo.outage_start DESC`,
      params
    );
    return rows.map((row) => ({
      ...row,
      utilityType: row.utility_type as UtilityType,
      outageType: row.outage_type as OutageType,
      status: row.status as OutageStatus,
      reportedByName: row.reported_by_name || null,
      resolvedByName: row.resolved_by_name || null,
    }));
  }

  static createUtilityOutage(input: UtilityOutageInput): UtilityOutage {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const meter = this.db.query<{ id: string; meterCode: string; meterName: string; utilityType: UtilityType }>(
      `SELECT um.id, um.meter_code AS meterCode, um.meter_name AS meterName,
              um.utility_type AS utilityType
       FROM facility_utility_meters um
       WHERE um.id = ? AND um.company_id = ?`,
      [input.meterId, companyId]
    )[0];
    if (!meter) throw new Error('العداد غير موجود.');
    if (!isValidDate(input.outageStart)) throw new Error('تاريخ بدء الانقطاع غير صالح.');
    if (input.outageEnd && !isValidDate(input.outageEnd)) throw new Error('تاريخ نهاية الانقطاع غير صالح.');
    if (input.outageEnd && input.outageEnd < input.outageStart) {
      throw new Error('تاريخ نهاية الانقطاع يسبق تاريخ بدايته.');
    }
    const id = `uo_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    let durationMinutes = 0;
    if (input.outageEnd) {
      durationMinutes = Math.max(0, Math.round(
        (Date.parse(`${input.outageEnd}T00:00:00`) - Date.parse(`${input.outageStart}T00:00:00`)) / 60000
      ));
    }
    this.db.run(
      `INSERT INTO facility_utility_outages
         (id, meter_id, outage_type, outage_start, outage_end, duration_minutes,
          affected_areas, cause, reported_by, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)`,
      [id, input.meterId, input.outageType, input.outageStart, input.outageEnd || null,
        durationMinutes, input.affectedAreas || null, input.cause || null,
        actor.id, input.notes || null]
    );
    this.auditActor(actor, 'تسجيل انقطاع مرافق', id, {
      meterId: input.meterId, outageType: input.outageType, durationMinutes,
    });
    return this.getUtilityOutage(id)!;
  }

  private static getUtilityOutage(id: string): UtilityOutage | null {
    const outages = this.getUtilityOutages({ limit: 1000 }).filter((o) => o.id === id);
    return outages[0] ?? null;
  }

  static resolveUtilityOutage(id: string, resolvedByNote?: string | null): UtilityOutage {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const outage = this.db.query<{ id: string; outageStart: string }>(
      `SELECT uo.id, uo.outage_start AS outageStart FROM facility_utility_outages uo
       JOIN facility_utility_meters um ON um.id = uo.meter_id
       WHERE uo.id = ? AND um.company_id = ?`,
      [id, companyId]
    )[0];
    if (!outage) throw new Error('سجل الانقطاع غير موجود.');
    const now = new Date().toISOString();
    const durationMinutes = Math.max(0, Math.round(
      (Date.parse(now) - Date.parse(`${outage.outageStart}T00:00:00`)) / 60000
    ));
    this.db.run(
      `UPDATE facility_utility_outages
       SET status = 'RESOLVED', resolved_by = ?, resolved_at = ?,
           duration_minutes = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [actor.id, now, durationMinutes, id]
    );
    this.auditActor(actor, 'إنهاء انقطاع مرافق', id, { durationMinutes, note: resolvedByNote });
    return this.getUtilityOutage(id)!;
  }

  /* ========== Consumption Comparison ========== */

  static getConsumptionComparison(periodMonth: string): UtilityConsumptionComparison[] {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodMonth)) {
      throw new Error('الفترة غير صالحة (صيغة YYYY-MM).');
    }
    const periodStart = `${periodMonth}-01`;
    const periodEnd = new Date(
      Number(periodMonth.slice(0, 4)),
      Number(periodMonth.slice(5, 7)),
      0
    ).toISOString().slice(0, 10);
    const scope = this.branchAccess.sqlScope('b.id', undefined, actor);
    const rows = this.db.query<any>(
      `SELECT b.id AS branchId, b.name AS branchName, um.utility_type AS utilityType,
              SUM(ur.consumption) AS totalConsumption, SUM(ur.cost) AS totalCost,
              COUNT(DISTINCT um.id) AS meterCount
       FROM facility_utility_readings ur
       JOIN facility_utility_meters um ON um.id = ur.meter_id
       JOIN branches b ON b.id = um.branch_id
       WHERE um.company_id = ? AND ur.reading_date BETWEEN ? AND ? AND ${scope.clause}
       GROUP BY b.id, um.utility_type
       ORDER BY b.name, um.utility_type`,
      [companyId, periodStart, periodEnd, ...scope.params]
    );
    return rows.map((row) => ({
      branchId: row.branchId,
      branchName: row.branchName,
      utilityType: row.utility_type as UtilityType,
      periodMonth,
      totalConsumption: roundNumber(Number(row.totalConsumption) || 0),
      totalCost: roundNumber(Number(row.totalCost) || 0),
      meterCount: Number(row.meterCount) || 0,
    }));
  }

  /* ========== Stats ========== */

  static getUtilityStats(): UtilityStats {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const scope = this.branchAccess.sqlScope('um.branch_id', undefined, actor);
    const today = localDateString();
    const inThirtyDays = localDateString(addLocalDays(new Date(), 30));
    const totalMeters = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM facility_utility_meters WHERE company_id = ?`,
      [companyId]
    )[0]?.count ?? 0;
    const activeMeters = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM facility_utility_meters WHERE company_id = ? AND is_active = 1`,
      [companyId]
    )[0]?.count ?? 0;
    const metersByType = this.db.query<any>(
      `SELECT utility_type AS type, COUNT(*) AS count
       FROM facility_utility_meters WHERE company_id = ? AND is_active = 1
       GROUP BY utility_type`,
      [companyId]
    );
    const pendingBills = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM facility_utility_bills fub
       JOIN facility_utility_meters um ON um.id = fub.meter_id
       WHERE um.company_id = ? AND fub.status = 'PENDING'`,
      [companyId]
    )[0]?.count ?? 0;
    const overdueBills = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM facility_utility_bills fub
       JOIN facility_utility_meters um ON um.id = fub.meter_id
       WHERE um.company_id = ? AND fub.status IN ('PENDING', 'PARTIAL')
         AND fub.due_date < ?`,
      [companyId, today]
    )[0]?.count ?? 0;
    const totalAmountDue = this.db.query<{ total: number }>(
      `SELECT COALESCE(SUM(amount_due), 0) AS total FROM facility_utility_bills fub
       JOIN facility_utility_meters um ON um.id = fub.meter_id
       WHERE um.company_id = ?`,
      [companyId]
    )[0]?.total ?? 0;
    const totalAmountPaid = this.db.query<{ total: number }>(
      `SELECT COALESCE(SUM(amount_paid), 0) AS total FROM facility_utility_bills fub
       JOIN facility_utility_meters um ON um.id = fub.meter_id
       WHERE um.company_id = ?`,
      [companyId]
    )[0]?.total ?? 0;
    const openOutages = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM facility_utility_outages uo
       JOIN facility_utility_meters um ON um.id = uo.meter_id
       WHERE um.company_id = ? AND uo.status = 'OPEN'`,
      [companyId]
    )[0]?.count ?? 0;
    const monthlyConsumptionByType = this.db.query<any>(
      `SELECT um.utility_type AS type,
              substr(ur.reading_date, 1, 7) AS month,
              SUM(ur.consumption) AS consumption, SUM(ur.cost) AS cost
       FROM facility_utility_readings ur
       JOIN facility_utility_meters um ON um.id = ur.meter_id
       WHERE um.company_id = ?
       GROUP BY um.utility_type, substr(ur.reading_date, 1, 7)
       ORDER BY month DESC, um.utility_type
       LIMIT 24`,
      [companyId]
    );
    const topConsumingBranches = this.db.query<any>(
      `SELECT b.id AS branchId, b.name AS branchName,
              SUM(ur.cost) AS totalCost
       FROM facility_utility_readings ur
       JOIN facility_utility_meters um ON um.id = ur.meter_id
       JOIN branches b ON b.id = um.branch_id
       WHERE um.company_id = ?
       GROUP BY b.id
       ORDER BY totalCost DESC
       LIMIT 10`,
      [companyId]
    );
    return {
      totalMeters: Number(totalMeters),
      activeMeters: Number(activeMeters),
      metersByType: metersByType.map((row) => ({ type: row.type, count: Number(row.count) })),
      pendingBills: Number(pendingBills),
      overdueBills: Number(overdueBills),
      totalAmountDue: roundNumber(Number(totalAmountDue)),
      totalAmountPaid: roundNumber(Number(totalAmountPaid)),
      openOutages: Number(openOutages),
      monthlyConsumptionByType: monthlyConsumptionByType.map((row) => ({
        type: row.type, month: row.month,
        consumption: roundNumber(Number(row.consumption) || 0),
        cost: roundNumber(Number(row.cost) || 0),
      })),
      topConsumingBranches: topConsumingBranches.map((row) => ({
        branchId: row.branchId, branchName: row.branchName,
        totalCost: roundNumber(Number(row.totalCost) || 0),
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

  private static auditDB(db: any, actor: { id: string; fullName: string }, action: string, recordId: string, values: object): void {
    db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
       VALUES (?, ?, ?, ?, 'OPERATIONS', ?, ?)`,
      [`aud_${uuidv4().replace(/-/g, '').slice(0, 12)}`, actor.id, actor.fullName, action, recordId,
        JSON.stringify(values)]
    );
  }
}
