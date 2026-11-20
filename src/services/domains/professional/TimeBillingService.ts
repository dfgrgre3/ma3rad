import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { PermissionService } from '../auth/PermissionService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import { localDateString } from '../../../utils/shared/date';
import { round2 } from '../finance/financials';

export type TimeEntryStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'INVOICED' | 'REJECTED';

export interface TimeEntry {
  id: string; branchId: string | null; customerId: string | null; customerName: string | null;
  projectId: string | null; projectName: string | null; employeeId: string | null;
  employeeName: string | null; entryDate: string; description: string; minutes: number;
  hours: number; hourlyRate: number; amount: number; billable: number; status: TimeEntryStatus;
  invoiceId: string | null; createdAt: string;
}

export interface BillingBatch {
  id: string; batchNumber: string; customerId: string | null; customerName: string | null;
  projectId: string | null; projectName: string | null; periodStart: string | null;
  periodEnd: string | null; totalAmount: number; invoiceId: string | null;
  status: 'OPEN' | 'INVOICED' | 'CANCELLED'; notes: string | null; createdAt: string;
  itemCount: number;
}

const TRANSITIONS: Record<TimeEntryStatus, TimeEntryStatus[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['APPROVED', 'REJECTED'],
  APPROVED: ['INVOICED'],
  INVOICED: [],
  REJECTED: ['DRAFT'],
};

export class TimeBillingService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();

  private currentBranchId(): string {
    try { return this.branchAccess.getCurrentBranchId(); } catch { return ''; }
  }

  private requireView() {
    ModuleRegistryService.assertModuleEnabled('projects');
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'projects.view');
    return actor;
  }

  private requireManage() {
    ModuleRegistryService.assertModuleEnabled('projects');
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'projects.update');
    return actor;
  }

  // ── Lookups ─────────────────────────────────────────────────────────────

  public getProjects(): Array<{ id: string; name: string; customerName: string | null }> {
    this.requireView();
    return this.db.query<any>(
      `SELECT p.id, p.name, c.name AS customerName
       FROM projects p LEFT JOIN customers c ON c.id = p.customer_id
       WHERE p.status != 'CANCELLED' ORDER BY p.name`
    );
  }

  public getEmployees(): Array<{ id: string; fullName: string; jobTitle: string | null }> {
    this.requireView();
    return this.db.query<any>(
      `SELECT id, full_name AS fullName, job_title AS jobTitle
       FROM employees WHERE COALESCE(is_active,1)=1 ORDER BY full_name`
    );
  }

  // ── Time entries ────────────────────────────────────────────────────────

  public getTimeEntries(filters?: {
    status?: TimeEntryStatus; customerId?: string; projectId?: string;
    employeeId?: string; from?: string; to?: string;
  }): TimeEntry[] {
    this.requireView();
    const where: string[] = [];
    const params: unknown[] = [];
    if (filters?.status) { where.push('t.status = ?'); params.push(filters.status); }
    if (filters?.customerId) { where.push('t.customer_id = ?'); params.push(filters.customerId); }
    if (filters?.projectId) { where.push('t.project_id = ?'); params.push(filters.projectId); }
    if (filters?.employeeId) { where.push('t.employee_id = ?'); params.push(filters.employeeId); }
    if (filters?.from) { where.push('t.entry_date >= ?'); params.push(filters.from); }
    if (filters?.to) { where.push('t.entry_date <= ?'); params.push(filters.to); }
    return this.db.query<any>(
      `SELECT t.id, t.branch_id AS branchId, t.customer_id AS customerId, c.name AS customerName,
              t.project_id AS projectId, p.name AS projectName, t.employee_id AS employeeId,
              e.full_name AS employeeName, t.entry_date AS entryDate, t.description,
              t.minutes, t.hourly_rate AS hourlyRate, t.billable, t.status,
              t.invoice_id AS invoiceId, t.created_at AS createdAt
       FROM time_entries t
       LEFT JOIN customers c ON c.id = t.customer_id
       LEFT JOIN projects p ON p.id = t.project_id
       LEFT JOIN employees e ON e.id = t.employee_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY t.entry_date DESC, t.created_at DESC`,
      params
    ).map((r) => ({
      ...r,
      hours: round2(Number(r.minutes) / 60),
      hourlyRate: round2(r.hourlyRate),
      amount: round2((Number(r.minutes) / 60) * Number(r.hourlyRate)),
    }));
  }

  public getTimeEntryById(id: string): TimeEntry | null {
    return this.getTimeEntries().find((t) => t.id === id) ?? null;
  }

  public createTimeEntry(input: {
    branchId?: string; customerId?: string; projectId?: string; employeeId?: string;
    entryDate?: string; description: string; minutes: number; hourlyRate?: number; billable?: boolean;
  }): TimeEntry {
    this.requireManage();
    if (!input.description?.trim()) throw new Error('الوصف مطلوب.');
    if (!Number.isFinite(input.minutes) || input.minutes <= 0) throw new Error('عدد الدقائق يجب أن يكون أكبر من صفر.');
    const actor = AuthService.requireAuth();
    const id = uuidv4();
    this.db.run(
      `INSERT INTO time_entries (id, branch_id, customer_id, project_id, employee_id, entry_date,
         description, minutes, hourly_rate, billable, status, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, input.branchId || this.currentBranchId() || null, input.customerId || null, input.projectId || null,
       input.employeeId || null, input.entryDate ?? localDateString(), input.description.trim(),
       Math.round(input.minutes), input.hourlyRate ?? 0, input.billable === false ? 0 : 1, 'DRAFT', actor.id]
    );
    return this.getTimeEntryById(id)!;
  }

  public updateTimeEntry(id: string, patch: {
    customerId?: string | null; projectId?: string | null; description?: string;
    minutes?: number; hourlyRate?: number; billable?: boolean; entryDate?: string;
  }): void {
    this.requireManage();
    const existing = this.getTimeEntryById(id);
    if (!existing) throw new Error('القيد الزمني غير موجود.');
    if (existing.status === 'INVOICED') throw new Error('لا يمكن تعديل قيد مفوتر.');
    const sets: string[] = ['updated_at=CURRENT_TIMESTAMP'];
    const params: unknown[] = [];
    const map: Record<string, string> = {
      customerId: 'customer_id', projectId: 'project_id', description: 'description',
      minutes: 'minutes', hourlyRate: 'hourly_rate', entryDate: 'entry_date',
    };
    for (const [key, col] of Object.entries(map)) {
      const v = (patch as any)[key];
      if (v !== undefined) { sets.push(`${col}=?`); params.push(v); }
    }
    if (patch.billable !== undefined) { sets.push('billable=?'); params.push(patch.billable ? 1 : 0); }
    params.push(id);
    this.db.run(`UPDATE time_entries SET ${sets.join(', ')} WHERE id=?`, params);
  }

  public transitionStatus(id: string, status: TimeEntryStatus): void {
    this.requireManage();
    const entry = this.getTimeEntryById(id);
    if (!entry) throw new Error('القيد الزمني غير موجود.');
    const allowed = TRANSITIONS[entry.status];
    if (!allowed.includes(status)) throw new Error(`لا يمكن الانتقال من ${entry.status} إلى ${status}.`);
    this.db.run(`UPDATE time_entries SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, [status, id]);
  }

  public submitEntries(ids: string[]): number {
    let count = 0;
    for (const id of ids) {
      const e = this.getTimeEntryById(id);
      if (e && e.status === 'DRAFT') { this.transitionStatus(id, 'SUBMITTED'); count += 1; }
    }
    return count;
  }

  public approveEntries(ids: string[]): number {
    let count = 0;
    for (const id of ids) {
      const e = this.getTimeEntryById(id);
      if (e && e.status === 'SUBMITTED') { this.transitionStatus(id, 'APPROVED'); count += 1; }
    }
    return count;
  }

  // ── Billing batches → invoice ───────────────────────────────────────────

  public getBatches(status?: string): BillingBatch[] {
    this.requireView();
    return this.db.query<any>(
      `SELECT b.id, b.batch_number AS batchNumber, b.customer_id AS customerId,
              c.name AS customerName, b.project_id AS projectId, p.name AS projectName,
              b.period_start AS periodStart, b.period_end AS periodEnd,
              b.total_amount AS totalAmount, b.invoice_id AS invoiceId, b.status, b.notes,
              b.created_at AS createdAt,
              (SELECT COUNT(*) FROM time_billing_batch_items bi WHERE bi.batch_id = b.id) AS itemCount
       FROM time_billing_batches b
       LEFT JOIN customers c ON c.id = b.customer_id
       LEFT JOIN projects p ON p.id = b.project_id
       ${status ? 'WHERE b.status = ?' : ''}
       ORDER BY b.created_at DESC`,
      status ? [status] : []
    ).map((r) => ({ ...r, totalAmount: round2(r.totalAmount) }));
  }

  /** Group APPROVED billable entries into a batch ready for invoicing. */
  public createBatch(input: {
    customerId?: string; projectId?: string; periodStart?: string; periodEnd?: string;
    entryIds?: string[]; notes?: string;
  }): BillingBatch {
    this.requireManage();
    const actor = AuthService.requireAuth();
    // Resolve candidate entries: explicit ids or all APPROVED billable matching filters.
    let entries = this.getTimeEntries({ status: 'APPROVED' })
      .filter((e) => e.billable === 1 && (!input.customerId || e.customerId === input.customerId)
        && (!input.projectId || e.projectId === input.projectId));
    if (input.entryIds?.length) {
      const wanted = new Set(input.entryIds);
      entries = entries.filter((e) => wanted.has(e.id));
    }
    if (!entries.length) throw new Error('لا توجد قيود معتمدة قابلة للفوترة في النطاق المحدد.');
    const alreadyBatched = new Set(this.db.query<any>(
      `SELECT time_entry_id AS id FROM time_billing_batch_items`
    ).map((r) => r.id));
    entries = entries.filter((e) => !alreadyBatched.has(e.id));
    if (!entries.length) throw new Error('كل القيود المحددة مفوترة مسبقاً.');

    const total = round2(entries.reduce((s, e) => s + e.amount, 0));
    const number = `TB-${localDateString().replace(/-/g, '')}-${uuidv4().slice(0, 6).toUpperCase()}`;
    const batchId = uuidv4();
    this.db.executeTransaction(() => {
      this.db.run(
        `INSERT INTO time_billing_batches (id, batch_number, customer_id, project_id, period_start, period_end, total_amount, notes, created_by)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [batchId, number, input.customerId || entries[0].customerId || null,
         input.projectId || entries[0].projectId || null, input.periodStart ?? null,
         input.periodEnd ?? null, total, input.notes ?? null, actor.id]
      );
      for (const e of entries) {
        this.db.run(
          `INSERT INTO time_billing_batch_items (id, batch_id, time_entry_id, amount) VALUES (?,?,?,?)`,
          [uuidv4(), batchId, e.id, e.amount]
        );
      }
    });
    return this.getBatches().find((b) => b.id === batchId)!;
  }

  /** Mark batch entries as INVOICED and link the sales invoice id. */
  public markBatchInvoiced(batchId: string, invoiceId: string): void {
    this.requireManage();
    const items = this.db.query<any>(
      `SELECT time_entry_id AS entryId FROM time_billing_batch_items WHERE batch_id=?`, [batchId]
    );
    this.db.executeTransaction(() => {
      for (const item of items) {
        this.db.run(`UPDATE time_entries SET status='INVOICED', invoice_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
          [invoiceId, item.entryId]);
      }
      this.db.run(`UPDATE time_billing_batches SET status='INVOICED', invoice_id=? WHERE id=?`, [invoiceId, batchId]);
    });
  }

  // ── Reporting ───────────────────────────────────────────────────────────

  public getProfitability(filters?: { from?: string; to?: string }): Array<{
    customerId: string | null; customerName: string; billableHours: number;
    billableAmount: number; entryCount: number;
  }> {
    this.requireView();
    const where = [`t.status IN ('APPROVED','INVOICED')`, 't.billable = 1'];
    const params: unknown[] = [];
    if (filters?.from) { where.push('t.entry_date>=?'); params.push(filters.from); }
    if (filters?.to) { where.push('t.entry_date<=?'); params.push(filters.to); }
    return this.db.query<any>(
      `SELECT t.customer_id AS customerId, COALESCE(c.name,'غير محدد') AS customerName,
              SUM(t.minutes)/60.0 AS billableHours, COUNT(*) AS entryCount,
              SUM(t.minutes/60.0*t.hourly_rate) AS billableAmount
       FROM time_entries t LEFT JOIN customers c ON c.id = t.customer_id
       WHERE ${where.join(' AND ')}
       GROUP BY t.customer_id ORDER BY billableAmount DESC`,
      params
    ).map((r) => ({ ...r, billableHours: round2(r.billableHours), billableAmount: round2(r.billableAmount) }));
  }

  public getUnbilledSummary(): { count: number; hours: number; amount: number } {
    const rows = this.db.query<any>(
      `SELECT COUNT(*) c, COALESCE(SUM(minutes),0) m, COALESCE(SUM(minutes/60.0*hourly_rate),0) a
       FROM time_entries WHERE status='APPROVED' AND billable=1`
    )[0];
    return { count: Number(rows?.c ?? 0), hours: round2(Number(rows?.m ?? 0) / 60), amount: round2(rows?.a ?? 0) };
  }
}
