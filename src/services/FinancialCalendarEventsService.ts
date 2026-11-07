import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { BranchAccessService } from './BranchAccessService';
import { PermissionService } from './PermissionService';
import { SalesService } from './SalesService';
import { SupplierService } from './SupplierService';
import { InstallmentService } from './InstallmentService';

export type FinancialSourceType = 'SALES_INVOICE' | 'PURCHASE_INVOICE' | 'INSTALLMENT';
export type FinancialEventOriginType = FinancialSourceType;

export type FinancialEventType =
  | 'INCOME'
  | 'EXPENSE'
  | 'CUSTOMER_INVOICE'
  | 'SUPPLIER_INVOICE'
  | 'PAYROLL'
  | 'INSTALLMENT'
  | 'TAX'
  | 'CHEQUE'
  | 'SUBSCRIPTION';

export type FinancialPartyType = 'CUSTOMER' | 'SUPPLIER' | 'EMPLOYEE' | 'OTHER';

export interface FinancialCalendarEventInput {
  title: string;
  eventType: FinancialEventType;
  amount: number;
  currency: string;
  dueDate: string;
  reminderAt?: string;
  reminderDays: number[];
  partyType?: FinancialPartyType;
  partyId?: string;
  partyName?: string;
  financialAccount?: string;
  reference?: string;
  description?: string;
}

export interface FinancialCalendarEvent extends FinancialCalendarEventInput {
  id: string;
  branchId: string;
  branchName: string;
  paidAmount: number;
  status: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  sourceType?: FinancialSourceType;
  sourceId?: string;
}

const INCOME_TYPES: FinancialEventType[] = ['INCOME', 'CUSTOMER_INVOICE'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_REMINDER_DAYS = [1, 3, 7];

function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export class FinancialCalendarEventsService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();

  private context(manage = false) {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, manage ? 'ui.finance.receivables.approve' : 'ui.finance.overview.view');
    const branchId = this.branchAccess.getCurrentBranchId(actor);
    const branch = this.db.query<{ companyId: string | null; branchName: string }>(
      `SELECT company_id AS companyId, name AS branchName FROM branches
       WHERE id = ? AND is_active = 1`,
      [branchId]
    )[0];
    if (!branch?.companyId) throw new Error('تعذر تحديد الشركة التابعة للفرع النشط.');
    return { actor, branchId, branchName: branch.branchName, companyId: branch.companyId };
  }

  public getEvents(startDate: string, endDate: string): FinancialCalendarEvent[] {
    const { branchId } = this.context();
    if (!isValidDate(startDate) || !isValidDate(endDate) || startDate > endDate) {
      throw new Error('الفترة الزمنية المحددة غير صحيحة.');
    }
    const savedEvents = this.db.query<any>(`
      SELECT e.*, b.name AS branch_name, u.full_name AS created_by_name
      FROM financial_calendar_events e
      JOIN branches b ON b.id = e.branch_id
      JOIN users u ON u.id = e.created_by
      WHERE e.branch_id = ? AND e.due_date >= ? AND e.due_date <= ?
      ORDER BY e.due_date ASC, e.created_at ASC
    `, [branchId, startDate, endDate]).map((row) => ({
      id: row.id,
      branchId: row.branchId,
      branchName: row.branchName,
      title: row.title,
      eventType: row.eventType,
      amount: Number(row.amount),
      paidAmount: Number(row.paidAmount),
      currency: row.currency,
      dueDate: row.dueDate,
      reminderAt: row.reminderAt || '',
      reminderDays: this.parseReminderDays(row.reminderDays),
      partyType: row.partyType || undefined,
      partyId: row.partyId || undefined,
      partyName: row.partyName || '',
      financialAccount: row.financialAccount || '',
      reference: row.reference || '',
      description: row.description || '',
      status: row.status,
      createdBy: row.createdByName,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
    return [...savedEvents, ...this.getInvoiceEvents(branchId, startDate, endDate)]
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title, 'ar'));
  }

  public getEventDetails(eventId: string) {
    const { branchId } = this.context();
    const source = this.parseSourceId(eventId);
    if (source) {
      const event = this.getSourceEvent(source, branchId);
      if (!event) throw new Error('الفاتورة غير موجودة أو خارج نطاق الفرع الحالي.');
      const payments = source.type === 'SALES_INVOICE'
        ? this.db.query<any>(`
          SELECT p.id, p.amount, p.date AS paymentDate, p.receipt_number AS reference,
            p.notes, p.created_at AS createdAt, u.full_name AS performedBy
          FROM customer_payments p
          JOIN users u ON u.id = p.performed_by
          WHERE p.invoice_id = ? ORDER BY p.date DESC, p.created_at DESC
        `, [source.id])
        : source.type === 'PURCHASE_INVOICE'
          ? this.db.query<any>(`
          SELECT sp.id, spa.amount, sp.date AS paymentDate, sp.receipt_number AS reference,
            sp.notes, sp.created_at AS createdAt, u.full_name AS performedBy
          FROM supplier_payment_allocations spa
          JOIN supplier_payments sp ON sp.id = spa.payment_id
          JOIN users u ON u.id = sp.performed_by
          WHERE spa.purchase_invoice_id = ? ORDER BY sp.date DESC, sp.created_at DESC
          `, [source.id])
          : this.db.query<any>(`
            SELECT p.id, p.amount, p.date AS paymentDate, p.receipt_number AS reference,
              p.notes, p.created_at AS createdAt, u.full_name AS performedBy
            FROM installments i JOIN installment_plans ip ON ip.id = i.plan_id
            JOIN customer_payments p ON p.notes LIKE ('Installment payment ' || i.sequence_number || '/% for plan ' || ip.plan_number || '%')
            JOIN users u ON u.id = p.performed_by
            WHERE i.id = ? ORDER BY p.date DESC, p.created_at DESC
          `, [source.id]);
      return {
        event,
        payments: payments.map((payment) => ({ ...payment, amount: Number(payment.amount) })),
        attachments: [],
        audit: [],
      };
    }
    const event = this.db.query<any>(`
      SELECT e.*, b.name AS branch_name, u.full_name AS created_by_name
      FROM financial_calendar_events e
      JOIN branches b ON b.id = e.branch_id
      JOIN users u ON u.id = e.created_by
      WHERE e.id = ? AND e.branch_id = ?
    `, [eventId, branchId])[0];
    if (!event) throw new Error('الحدث المالي غير موجود أو خارج نطاق الفرع الحالي.');
    return {
      event: this.getEvents(event.dueDate, event.dueDate).find((item) => item.id === eventId)!,
      payments: this.db.query<any>(`
        SELECT p.id, p.amount, p.payment_date AS paymentDate, p.reference, p.notes,
          p.created_at AS createdAt, u.full_name AS performedBy
        FROM financial_calendar_payments p
        JOIN users u ON u.id = p.created_by
        WHERE p.event_id = ?
        ORDER BY p.payment_date DESC, p.created_at DESC
      `, [eventId]).map((payment) => ({ ...payment, amount: Number(payment.amount) })),
      attachments: this.db.query<any>(`
        SELECT id, file_name AS fileName, mime_type AS mimeType, data_url AS dataUrl, created_at AS createdAt
        FROM financial_calendar_attachments WHERE event_id = ? ORDER BY created_at DESC
      `, [eventId]),
      audit: this.db.query<any>(`
        SELECT a.action, a.details, a.created_at AS createdAt, u.full_name AS performedBy
        FROM financial_calendar_audit a
        JOIN users u ON u.id = a.performed_by
        WHERE a.event_id = ?
        ORDER BY a.created_at DESC
      `, [eventId]),
    };
  }

  public getOptions() {
    const { branchId, branchName } = this.context();
    return {
      branchName,
      customers: this.db.query<{ id: string; name: string }>(
        'SELECT id, name FROM customers ORDER BY name COLLATE NOCASE LIMIT 500'
      ),
      suppliers: this.db.query<{ id: string; name: string }>(
        'SELECT id, name FROM suppliers WHERE is_active = 1 ORDER BY name COLLATE NOCASE LIMIT 500'
      ),
      employees: this.db.query<{ id: string; name: string }>(
        `SELECT id, full_name AS name FROM employees
         WHERE is_active = 1 AND (branch_id = ? OR branch_id IS NULL)
         ORDER BY full_name COLLATE NOCASE LIMIT 500`,
        [branchId]
      ),
      accounts: [
        ...this.db.query<{ name: string }>(
          'SELECT name FROM cash_registers WHERE is_active = 1 ORDER BY is_default DESC, name COLLATE NOCASE'
        ),
        ...this.db.query<{ name: string }>(
          `SELECT account_name AS name FROM bank_accounts
           WHERE is_active = 1 AND (branch_id = ? OR branch_id IS NULL)
           ORDER BY account_name COLLATE NOCASE`,
          [branchId]
        ),
      ].map((account) => account.name),
      registers: this.db.query<{ id: string; name: string }>(
        `SELECT id, name FROM cash_registers
         WHERE is_active = 1 AND (branch_id = ? OR branch_id IS NULL)
         ORDER BY is_default DESC, name COLLATE NOCASE`,
        [branchId]
      ),
    };
  }

  public saveEvent(input: FinancialCalendarEventInput, eventId?: string): string {
    const { actor, branchId, companyId } = this.context(true);
    this.validateInput(input);
    const id = eventId || `fce_${uuidv4()}`;
    const existing = eventId
      ? this.db.query<any>(
        `SELECT id, amount, paid_amount AS paidAmount, status
         FROM financial_calendar_events WHERE id = ? AND branch_id = ? AND company_id = ?`,
        [eventId, branchId, companyId]
      )[0]
      : null;
    if (eventId && !existing) throw new Error('الحدث المالي غير موجود أو خارج نطاق الفرع الحالي.');
    if (existing?.status === 'CANCELLED') throw new Error('لا يمكن تعديل حدث ملغي.');
    if (existing && round2(input.amount) < Number(existing.paidAmount)) {
      throw new Error('لا يمكن تخفيض مبلغ الحدث إلى أقل من المبلغ المدفوع أو المحصل.');
    }

    this.db.executeTransaction((tx) => {
      if (existing) {
        tx.run(`
          UPDATE financial_calendar_events
          SET title = ?, event_type = ?, amount = ?, currency = ?, due_date = ?,
            reminder_at = ?, reminder_days = ?, party_type = ?, party_id = ?, party_name = ?,
            financial_account = ?, reference = ?, description = ?, updated_at = ?
          WHERE id = ? AND branch_id = ? AND company_id = ?
        `, [
          input.title.trim(), input.eventType, round2(input.amount), input.currency.trim().toUpperCase(),
          input.dueDate, input.reminderAt || null, JSON.stringify(input.reminderDays),
          input.partyType || null, input.partyId || null, input.partyName?.trim() || null,
          input.financialAccount?.trim() || null, input.reference?.trim() || null,
          input.description?.trim() || null, new Date().toISOString(), id, branchId, companyId,
        ]);
      } else {
        tx.run(`
          INSERT INTO financial_calendar_events (
            id, company_id, branch_id, title, event_type, amount, currency, due_date,
            reminder_at, reminder_days, party_type, party_id, party_name, financial_account,
            reference, description, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          id, companyId, branchId, input.title.trim(), input.eventType, round2(input.amount),
          input.currency.trim().toUpperCase(), input.dueDate, input.reminderAt || null,
          JSON.stringify(input.reminderDays), input.partyType || null, input.partyId || null,
          input.partyName?.trim() || null, input.financialAccount?.trim() || null,
          input.reference?.trim() || null, input.description?.trim() || null, actor.id,
        ]);
      }
      this.writeAudit(tx, id, existing ? 'UPDATE' : 'CREATE', JSON.stringify(input), actor.id);
    });
    return id;
  }

  public recordPayment(input: {
    eventId: string;
    amount: number;
    paymentDate: string;
    reference?: string;
    notes?: string;
    paymentType?: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'CHEQUE';
    registerId?: string;
  }): void {
    const actor = AuthService.requireAuth();
    if (!Number.isFinite(input.amount) || round2(input.amount) <= 0) throw new Error('يجب إدخال مبلغ أكبر من صفر.');
    if (!isValidDate(input.paymentDate)) throw new Error('تاريخ الدفعة غير صحيح.');
    const source = this.parseSourceId(input.eventId);
    if (source) {
      this.recordSourcePayment(source, input, actor.id, actor.fullName);
      return;
    }
    const { branchId, companyId } = this.context(true);
    const reference = input.reference?.trim() || null;
    const event = this.db.query<any>(`
      SELECT id, event_type AS eventType, amount, paid_amount AS paidAmount, status
      FROM financial_calendar_events
      WHERE id = ? AND branch_id = ? AND company_id = ?
    `, [input.eventId, branchId, companyId])[0];
    if (!event) throw new Error('الحدث المالي غير موجود أو خارج نطاق الفرع الحالي.');
    if (event.status === 'CANCELLED') throw new Error('لا يمكن تسجيل دفعة لحدث ملغي.');
    const paidAmount = round2(Number(event.paidAmount) + input.amount);
    if (paidAmount > round2(Number(event.amount))) throw new Error('مبلغ الدفعة يتجاوز الرصيد المستحق.');
    if (reference && this.db.query(
      'SELECT id FROM financial_calendar_payments WHERE company_id = ? AND reference = ?',
      [companyId, reference]
    ).length) {
      throw new Error('رقم المرجع مستخدم في عملية مالية أخرى.');
    }

    const paymentId = `fcp_${uuidv4()}`;
    const eventStatus = paidAmount >= Number(event.amount)
      ? (INCOME_TYPES.includes(event.eventType) ? 'COLLECTED' : 'PAID')
      : (INCOME_TYPES.includes(event.eventType) ? 'PARTIALLY_COLLECTED' : 'PARTIALLY_PAID');
    this.db.executeTransaction((tx) => {
      tx.run(`
        INSERT INTO financial_calendar_payments
          (id, event_id, company_id, amount, payment_date, reference, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        paymentId, input.eventId, companyId, round2(input.amount), input.paymentDate,
        reference, input.notes?.trim() || null, actor.id,
      ]);
      tx.run(`
        UPDATE financial_calendar_events SET paid_amount = ?, status = ?, updated_at = ?
        WHERE id = ? AND branch_id = ? AND company_id = ?
      `, [paidAmount, eventStatus, new Date().toISOString(), input.eventId, branchId, companyId]);
      this.writeAudit(tx, input.eventId, 'PAYMENT', JSON.stringify({
        amount: round2(input.amount), paymentDate: input.paymentDate, reference,
      }), actor.id);
    });
  }

  public reschedule(eventId: string, dueDate: string): void {
    const { actor, branchId, companyId } = this.context(true);
    if (!isValidDate(dueDate)) throw new Error('تاريخ الاستحقاق غير صحيح.');
    this.db.executeTransaction((tx) => {
      const event = tx.query<any>(
        'SELECT id, status, due_date AS dueDate FROM financial_calendar_events WHERE id = ? AND branch_id = ? AND company_id = ?',
        [eventId, branchId, companyId]
      )[0];
      if (!event) throw new Error('الحدث المالي غير موجود أو خارج نطاق الفرع الحالي.');
      if (event.status === 'CANCELLED') throw new Error('لا يمكن تأجيل حدث ملغي.');
      tx.run('UPDATE financial_calendar_events SET due_date = ?, updated_at = ? WHERE id = ?',
        [dueDate, new Date().toISOString(), eventId]);
      this.writeAudit(tx, eventId, 'RESCHEDULE', JSON.stringify({ from: event.dueDate, to: dueDate }), actor.id);
    });
  }

  public cancelEvent(eventId: string): void {
    const { actor, branchId, companyId } = this.context(true);
    this.db.executeTransaction((tx) => {
      const event = tx.query<any>(
        'SELECT id, status FROM financial_calendar_events WHERE id = ? AND branch_id = ? AND company_id = ?',
        [eventId, branchId, companyId]
      )[0];
      if (!event) throw new Error('الحدث المالي غير موجود أو خارج نطاق الفرع الحالي.');
      if (event.status === 'CANCELLED') throw new Error('الحدث ملغي بالفعل.');
      tx.run(`UPDATE financial_calendar_events SET status = 'CANCELLED', updated_at = ? WHERE id = ?`,
        [new Date().toISOString(), eventId]);
      this.writeAudit(tx, eventId, 'CANCEL', null, actor.id);
    });
  }

  public addAttachment(eventId: string, input: { fileName: string; mimeType: string; dataUrl: string }): void {
    const { actor, branchId } = this.context(true);
    if (!input.fileName.trim() || !input.dataUrl.startsWith('data:')) throw new Error('الملف المرفق غير صالح.');
    if (input.dataUrl.length > 7_000_000) throw new Error('حجم الملف يتجاوز الحد المسموح (5 ميجابايت).');
    const allowedMime = /^image\/(jpeg|png|gif|webp)$|^application\/pdf$|^application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet)$/;
    if (!allowedMime.test(input.mimeType)) throw new Error('نوع الملف غير مدعوم. أرفق صورة أو ملف PDF أو Excel أو Word.');
    const id = `fca_${uuidv4()}`;
    this.db.executeTransaction((tx) => {
      const event = tx.query<{ id: string; status: string }>(
        'SELECT id, status FROM financial_calendar_events WHERE id = ? AND branch_id = ?',
        [eventId, branchId]
      )[0];
      if (!event) throw new Error('الحدث المالي غير موجود أو خارج نطاق الفرع الحالي.');
      if (event.status === 'CANCELLED') throw new Error('لا يمكن إرفاق ملف بحدث ملغي.');
      tx.run(`
        INSERT INTO financial_calendar_attachments (id, event_id, file_name, mime_type, data_url, created_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [id, eventId, input.fileName.trim().slice(0, 255), input.mimeType, input.dataUrl, actor.id]);
      this.writeAudit(tx, eventId, 'ATTACHMENT', input.fileName.trim(), actor.id);
    });
  }

  private validateInput(input: FinancialCalendarEventInput): void {
    const allowedEventTypes: FinancialEventType[] = ['INCOME', 'EXPENSE', 'CUSTOMER_INVOICE', 'SUPPLIER_INVOICE', 'PAYROLL', 'INSTALLMENT', 'TAX', 'CHEQUE', 'SUBSCRIPTION'];
    if (!allowedEventTypes.includes(input.eventType)) throw new Error('نوع الحدث غير صالح.');
    if (typeof input.title !== 'string' || !input.title.trim()) throw new Error('عنوان الحدث مطلوب.');
    if (!Number.isFinite(input.amount) || round2(input.amount) <= 0) throw new Error('يجب إدخال مبلغ مالي أكبر من صفر.');
    if (!isValidDate(input.dueDate)) throw new Error('تاريخ الاستحقاق غير صحيح.');
    const currency = typeof input.currency === 'string' ? input.currency.trim().toUpperCase() : '';
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error('رمز العملة يجب أن يتكون من ثلاثة أحرف.');
    try {
      new Intl.NumberFormat('en', { style: 'currency', currency }).format(0);
    } catch {
      throw new Error('رمز العملة غير مدعوم.');
    }
    const requiredParty: Partial<Record<FinancialEventType, FinancialPartyType>> = {
      CUSTOMER_INVOICE: 'CUSTOMER',
      SUPPLIER_INVOICE: 'SUPPLIER',
      PAYROLL: 'EMPLOYEE',
    };
    const partyType = input.partyType as FinancialPartyType | undefined;
    if (partyType && !['CUSTOMER', 'SUPPLIER', 'EMPLOYEE', 'OTHER'].includes(partyType)) {
      throw new Error('نوع الطرف المرتبط غير صالح.');
    }
    if (requiredParty[input.eventType] && !partyType) {
      throw new Error('نوع الطرف المرتبط مطلوب لنوع الحدث المحدد.');
    }
    if (requiredParty[input.eventType] && requiredParty[input.eventType] !== partyType) {
      throw new Error('نوع الطرف المرتبط لا يتوافق مع نوع الحدث المالي.');
    }
    if (!Array.isArray(input.reminderDays) || input.reminderDays.some((day) => !ALLOWED_REMINDER_DAYS.includes(day))) {
      throw new Error('خيارات التذكير غير صحيحة.');
    }
    if (input.reminderAt && Number.isNaN(new Date(input.reminderAt).getTime())) throw new Error('موعد التذكير غير صحيح.');
  }

  private getInvoiceEvents(branchId: string, startDate: string, endDate: string): FinancialCalendarEvent[] {
    const sales = this.db.query<any>(`
      SELECT si.id, si.branch_id AS branchId, b.name AS branchName,
        si.invoice_number AS reference, si.total_amount AS amount, si.paid_amount AS paidAmount,
        COALESCE(si.due_date, date(si.date, '+' || COALESCE(c.payment_terms_days, 0) || ' days')) AS dueDate,
        c.id AS partyId, c.name AS partyName, si.created_at AS createdAt, si.updated_at AS updatedAt
      FROM sales_invoices si
      JOIN warehouses w ON w.id = si.warehouse_id
      JOIN branches b ON b.id = COALESCE(si.branch_id, w.branch_id)
      JOIN customers c ON c.id = si.customer_id
      WHERE COALESCE(si.branch_id, w.branch_id) = ?
        AND si.invoice_status <> 'VOID' AND si.remaining_amount > 0.009
        AND NOT EXISTS (
          SELECT 1 FROM installment_plans ip
          WHERE ip.invoice_id = si.id AND ip.status IN ('ACTIVE', 'DEFAULTED')
        )
        AND COALESCE(si.due_date, date(si.date, '+' || COALESCE(c.payment_terms_days, 0) || ' days')) BETWEEN ? AND ?
      ORDER BY dueDate, si.created_at
    `, [branchId, startDate, endDate]).map((row) => this.mapInvoiceEvent(row, 'SALES_INVOICE'));

    const purchases = this.db.query<any>(`
      SELECT pi.id, COALESCE(pi.branch_id, w.branch_id) AS branchId, b.name AS branchName,
        pi.invoice_number AS reference, pi.total_amount AS amount, pi.paid_amount AS paidAmount,
        COALESCE(pi.due_date, date(pi.date, '+' || COALESCE(s.payment_terms_days, 30) || ' days')) AS dueDate,
        s.id AS partyId, s.name AS partyName, pi.created_at AS createdAt, pi.created_at AS updatedAt
      FROM purchase_invoices pi
      JOIN warehouses w ON w.id = pi.warehouse_id
      JOIN branches b ON b.id = COALESCE(pi.branch_id, w.branch_id)
      JOIN suppliers s ON s.id = pi.supplier_id
      WHERE COALESCE(pi.branch_id, w.branch_id) = ?
        AND pi.remaining_amount > 0.009
        AND COALESCE(pi.due_date, date(pi.date, '+' || COALESCE(s.payment_terms_days, 30) || ' days')) BETWEEN ? AND ?
      ORDER BY dueDate, pi.created_at
    `, [branchId, startDate, endDate]).map((row) => this.mapInvoiceEvent(row, 'PURCHASE_INVOICE'));

    const installments = this.db.query<any>(`
      SELECT i.id, ip.branch_id AS branchId, b.name AS branchName,
        printf('%s/%s', ip.plan_number, i.sequence_number) AS reference,
        i.amount AS amount, i.paid_amount AS paidAmount, i.due_date AS dueDate,
        c.id AS partyId, c.name AS partyName, ip.created_at AS createdAt,
        COALESCE(i.paid_at, ip.created_at) AS updatedAt
      FROM installments i
      JOIN installment_plans ip ON ip.id = i.plan_id
      JOIN branches b ON b.id = ip.branch_id
      JOIN customers c ON c.id = ip.customer_id
      WHERE ip.branch_id = ? AND ip.status IN ('ACTIVE', 'DEFAULTED')
        AND i.status NOT IN ('PAID', 'WAIVED') AND i.remaining_amount > 0.009
        AND i.due_date BETWEEN ? AND ?
      ORDER BY i.due_date, ip.plan_number, i.sequence_number
    `, [branchId, startDate, endDate]).map((row) => this.mapInstallmentEvent(row));

    return [...sales, ...purchases, ...installments];
  }

  private mapInvoiceEvent(row: any, sourceType: FinancialSourceType): FinancialCalendarEvent {
    return {
      id: `${sourceType.toLowerCase()}:${row.id}`,
      sourceId: row.id,
      sourceType,
      branchId: row.branchId,
      branchName: row.branchName,
      title: sourceType === 'SALES_INVOICE'
        ? `فاتورة عميل ${row.reference}`
        : `فاتورة مورد ${row.reference}`,
      eventType: sourceType === 'SALES_INVOICE' ? 'CUSTOMER_INVOICE' : 'SUPPLIER_INVOICE',
      amount: Number(row.amount),
      paidAmount: Number(row.paidAmount),
      currency: 'EGP',
      dueDate: row.dueDate,
      reminderAt: '',
      reminderDays: [7, 3, 1],
      partyType: sourceType === 'SALES_INVOICE' ? 'CUSTOMER' : 'SUPPLIER',
      partyId: row.partyId,
      partyName: row.partyName,
      financialAccount: '',
      reference: row.reference,
      description: 'حدث متزامن تلقائيًا من الفاتورة الأصلية.',
      status: Number(row.paidAmount) > 0
        ? (sourceType === 'SALES_INVOICE' ? 'PARTIALLY_COLLECTED' : 'PARTIALLY_PAID')
        : 'SCHEDULED',
      createdBy: 'النظام',
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapInstallmentEvent(row: any): FinancialCalendarEvent {
    return {
      id: `installment:${row.id}`,
      sourceId: row.id,
      sourceType: 'INSTALLMENT' as FinancialSourceType,
      branchId: row.branchId,
      branchName: row.branchName,
      title: `قسط ${row.reference}`,
      eventType: 'INSTALLMENT',
      amount: Number(row.amount),
      paidAmount: Number(row.paidAmount),
      currency: 'EGP',
      dueDate: row.dueDate,
      reminderAt: '',
      reminderDays: [7, 3, 1],
      partyType: 'CUSTOMER',
      partyId: row.partyId,
      partyName: row.partyName,
      financialAccount: '',
      reference: row.reference,
      description: 'حدث متزامن تلقائيًا من جدول الأقساط.',
      status: Number(row.paidAmount) > 0 ? 'PARTIALLY_COLLECTED' : 'SCHEDULED',
      createdBy: 'النظام',
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private parseSourceId(id: string): { type: FinancialSourceType; id: string } | null {
    const separator = id.indexOf(':');
    if (separator < 0) return null;
    const type = id.slice(0, separator).toUpperCase();
    const sourceId = id.slice(separator + 1);
    if (!sourceId || !['SALES_INVOICE', 'PURCHASE_INVOICE', 'INSTALLMENT'].includes(type)) return null;
    return { type: type as FinancialSourceType, id: sourceId };
  }

  private getSourceEvent(source: { type: FinancialSourceType; id: string }, branchId: string) {
    if (source.type === 'INSTALLMENT') {
      const dueDate = this.db.query<{ dueDate: string }>(`
        SELECT i.due_date AS dueDate FROM installments i
        JOIN installment_plans ip ON ip.id = i.plan_id
        WHERE i.id = ? AND ip.branch_id = ?
      `, [source.id, branchId])[0]?.dueDate;
      return dueDate
        ? this.db.query<any>(`
          SELECT i.id, ip.branch_id AS branchId, b.name AS branchName,
            printf('%s/%s', ip.plan_number, i.sequence_number) AS reference,
            i.amount AS amount, i.paid_amount AS paidAmount, i.due_date AS dueDate,
            c.id AS partyId, c.name AS partyName, ip.created_at AS createdAt,
            COALESCE(i.paid_at, ip.created_at) AS updatedAt
          FROM installments i JOIN installment_plans ip ON ip.id = i.plan_id
          JOIN branches b ON b.id = ip.branch_id JOIN customers c ON c.id = ip.customer_id
          WHERE i.id = ? AND ip.branch_id = ? AND ip.status IN ('ACTIVE', 'DEFAULTED')
            AND i.status NOT IN ('PAID', 'WAIVED') AND i.remaining_amount > 0.009
        `, [source.id, branchId]).map((row) => this.mapInstallmentEvent(row))[0]
        : undefined;
    }
    const dueDate = source.type === 'SALES_INVOICE'
      ? this.db.query<{ dueDate: string }>(`
        SELECT COALESCE(si.due_date, date(si.date, '+' || COALESCE(c.payment_terms_days, 0) || ' days')) AS dueDate
        FROM sales_invoices si JOIN warehouses w ON w.id = si.warehouse_id
        JOIN customers c ON c.id = si.customer_id
        WHERE si.id = ? AND COALESCE(si.branch_id, w.branch_id) = ?
      `, [source.id, branchId])[0]?.dueDate
      : this.db.query<{ dueDate: string }>(`
        SELECT COALESCE(pi.due_date, date(pi.date, '+' || COALESCE(s.payment_terms_days, 30) || ' days')) AS dueDate
        FROM purchase_invoices pi JOIN warehouses w ON w.id = pi.warehouse_id
        JOIN suppliers s ON s.id = pi.supplier_id
        WHERE pi.id = ? AND COALESCE(pi.branch_id, w.branch_id) = ?
      `, [source.id, branchId])[0]?.dueDate;
    return dueDate
      ? this.getInvoiceEvents(branchId, dueDate, dueDate).find((event) => event.id === `${source.type.toLowerCase()}:${source.id}`)
      : undefined;
  }

  private recordSourcePayment(
    source: { type: FinancialSourceType; id: string },
    input: { amount: number; paymentDate: string; reference?: string; notes?: string; paymentType?: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'CHEQUE'; registerId?: string },
    actorId: string,
    actorName: string
  ): void {
    const registerId = input.registerId || 'cr_main';
    const paymentType = input.paymentType || 'CASH';
    const reference = input.reference?.trim() || `FINCAL-${uuidv4()}`;
    if (source.type === 'INSTALLMENT') {
      PermissionService.require(AuthService.getCurrentUser(), 'ui.finance.installments.manage');
      const row = this.db.query<{ remainingAmount: number; branchId: string }>(`
        SELECT i.remaining_amount AS remainingAmount, ip.branch_id AS branchId
        FROM installments i JOIN installment_plans ip ON ip.id = i.plan_id
        WHERE i.id = ? AND ip.status IN ('ACTIVE', 'DEFAULTED')
      `, [source.id])[0];
      if (!row || row.branchId !== this.branchAccess.getCurrentBranchId()) throw new Error('القسط غير موجود أو خارج نطاق الفرع الحالي.');
      if (round2(input.amount) > round2(Number(row.remainingAmount))) throw new Error('مبلغ التحصيل يتجاوز الرصيد المستحق على القسط.');
      if (paymentType !== 'CASH') throw new Error('تسجيل الأقساط من التقويم يدعم السداد النقدي فقط؛ استخدم صفحة الأقساط لطرق الدفع الأخرى.');
      new InstallmentService().payInstallment(source.id, input.amount, input.paymentDate, input.notes);
      return;
    }
    if (source.type === 'SALES_INVOICE') {
      PermissionService.require(AuthService.getCurrentUser(), 'ui.customers.detail.payment');
      const invoice = this.db.query<{ remainingAmount: number }>(`
        SELECT si.remaining_amount AS remainingAmount
        FROM sales_invoices si JOIN warehouses w ON w.id = si.warehouse_id
        WHERE si.id = ? AND COALESCE(si.branch_id, w.branch_id) = ?
          AND si.invoice_status <> 'VOID'
      `, [source.id, this.branchAccess.getCurrentBranchId()])[0];
      if (!invoice) throw new Error('فاتورة العميل غير موجودة أو خارج نطاق صلاحيتك.');
      if (round2(input.amount) > round2(Number(invoice.remainingAmount))) throw new Error('مبلغ التحصيل يتجاوز الرصيد المستحق على الفاتورة.');
      new SalesService().recordInvoicePayment(
        source.id, input.amount, paymentType, registerId, undefined,
        [input.notes?.trim(), `تقويم مالي ${reference}`, `بواسطة ${actorName}`].filter(Boolean).join(' · '),
        `financial-calendar:${reference}`,
        input.paymentDate
      );
      return;
    }
    PermissionService.require(AuthService.getCurrentUser(), 'ui.suppliers.suppliers.payment');
    const invoice = this.db.query<any>(`
      SELECT pi.id, pi.supplier_id AS supplierId, pi.remaining_amount AS remainingAmount
      FROM purchase_invoices pi JOIN warehouses w ON w.id = pi.warehouse_id
      WHERE pi.id = ? AND COALESCE(pi.branch_id, w.branch_id) = ?
    `, [source.id, this.branchAccess.getCurrentBranchId()])[0];
    if (!invoice) throw new Error('فاتورة المورد غير موجودة أو خارج نطاق صلاحيتك.');
    if (round2(input.amount) > round2(Number(invoice.remainingAmount))) throw new Error('مبلغ السداد يتجاوز الرصيد المستحق على الفاتورة.');
    new SupplierService().recordPayment(
      invoice.supplierId,
      input.amount,
      paymentType,
      registerId,
      [input.notes?.trim(), `تقويم مالي ${reference}`].filter(Boolean).join(' · '),
      `financial-calendar:${source.id}:${reference}`,
      input.paymentDate,
      source.id
    );
  }

  private parseReminderDays(value: string): number[] {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((day) => ALLOWED_REMINDER_DAYS.includes(day)) : [];
    } catch (error) {
      throw new Error(`تعذر قراءة إعدادات التذكير للحدث: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private writeAudit(tx: DatabaseManager, eventId: string, action: string, details: string | null, userId: string): void {
    tx.run(`
      INSERT INTO financial_calendar_audit (id, event_id, action, details, performed_by)
      VALUES (?, ?, ?, ?, ?)
    `, [`fcal_${uuidv4()}`, eventId, action, details, userId]);
  }
}
