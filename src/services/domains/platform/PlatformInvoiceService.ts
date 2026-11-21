import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PlatformStaffAuthService } from './PlatformStaffAuthService';
import { PlatformAuthorizationService } from './PlatformAuthorizationService';
import { centralAuditService } from './CentralAuditService';
import type {
  PlatformInvoice,
  PlatformInvoiceInput,
  PlatformInvoiceStatus,
  PlatformPayment,
  PlatformPaymentInput,
  PlatformPaymentMethod,
} from './platformTypes';
import { nowIso, toNumber, formatDate } from './platformUtils';

export class PlatformInvoiceService {
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

  // ─── Invoice Management ───────────────────────────────────────────────────────

  public listInvoices(search = '', status = '', tenantId = ''): PlatformInvoice[] {
    PlatformInvoiceService.requirePlatformAccess('invoices', 'platform.invoices.view');

    const where: string[] = [];
    const params: (string | number)[] = [];

    if (tenantId) {
      where.push('i.tenant_id = ?');
      params.push(tenantId);
    }
    if (search) {
      where.push('(i.id LIKE ? OR t.name LIKE ? OR t.code LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term, term);
    }
    if (status) {
      where.push('i.status = ?');
      params.push(status);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rows = this.db.query<any>(
      `SELECT i.*, t.name AS tenantName, t.code AS tenantCode
       FROM platform_invoices i
       JOIN platform_tenants t ON t.id = i.tenant_id
       ${whereSql}
       ORDER BY i.created_at DESC`,
      params
    );

    return rows.map(this.mapInvoice);
  }

  public getInvoice(id: string): PlatformInvoice | null {
    PlatformInvoiceService.requirePlatformAccess('invoices', 'platform.invoices.view');
    const row = this.db.query<any>('SELECT * FROM platform_invoices WHERE id = ?', [id])[0];
    return row ? this.mapInvoice(row) : null;
  }

  public createInvoice(input: PlatformInvoiceInput): PlatformInvoice {
    PlatformInvoiceService.requirePlatformAccess('invoices', 'platform.invoices.create');

    const tenant = this.db.query<any>('SELECT * FROM platform_tenants WHERE id = ?', [input.tenantId])[0];
    if (!tenant) throw new Error('العميل غير موجود.');

    const id = `inv_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = nowIso();
    const issueDate = input.issueDate ?? now.split('T')[0];
    const dueDate = input.dueDate ?? addMonths(new Date(), 1).toISOString().split('T')[0];

    // Calculate totals from items
    const subtotal = input.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const discount = input.discount ?? 0;
    const tax = input.tax ?? 0;
    const total = subtotal - discount + tax;

    this.db.run(
      `INSERT INTO platform_invoices
        (id, tenant_id, subscription_id, number, issue_date, due_date, status, currency, subtotal, discount, tax, total, paid_amount, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'EGP', ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), 0, ?, ?, ?)`,
      [id, input.tenantId, input.subscriptionId ?? null, `INV-${Date.now()}`, issueDate, dueDate, input.status ?? 'DRAFT', subtotal, discount, tax, total, input.notes ?? null, now, now]
    );

    // Insert items
    for (const item of input.items) {
      const itemId = `ivi_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      this.db.run(
        `INSERT INTO platform_invoice_items (id, invoice_id, description, quantity, unit_price, total, created_at)
         VALUES (?, ?, ?, ?, ROUND(?*100), ROUND(?*100), ?)`,
        [itemId, id, item.description, item.quantity, item.unitPrice, item.quantity * item.unitPrice, now]
      );
    }

    this.audit('إنشاء فاتورة', 'INVOICE', id, { tenantId: input.tenantId, total });

    const invoice = this.getInvoice(id);
    if (!invoice) throw new Error('فشل إنشاء الفاتورة.');
    return invoice;
  }

  public setInvoiceStatus(id: string, status: PlatformInvoiceStatus): void {
    PlatformInvoiceService.requirePlatformAccess('invoices', 'platform.invoices.update');

    const invoice = this.getInvoice(id);
    if (!invoice) throw new Error('الفاتورة غير موجودة.');

    const now = nowIso();
    const updates: string[] = ['status = ?', 'updated_at = ?'];
    const params: (string | number)[] = [status, now];

    if (status === 'PAID' && invoice.status !== 'PAID') {
      updates.push('paid_amount = total', 'paid_at = ?');
      params.push(now);
    } else if (status !== 'PAID' && invoice.status === 'PAID') {
      updates.push('paid_amount = 0', 'paid_at = NULL');
    }

    this.db.run(`UPDATE platform_invoices SET ${updates.join(', ')} WHERE id = ?`, [...params, id]);

    this.audit('تغيير حالة الفاتورة', 'INVOICE', id, { status });
  }

  public voidInvoice(id: string): void {
    PlatformInvoiceService.requirePlatformAccess('invoices', 'platform.invoices.delete');

    const invoice = this.getInvoice(id);
    if (!invoice) throw new Error('الفاتورة غير موجودة.');

    if (invoice.paidAmount > 0) throw new Error('لا يمكن إبطال فاتورة تم دفع جزء منها.');

    const now = nowIso();
    this.db.run('UPDATE platform_invoices SET status = \'VOID\', updated_at = ? WHERE id = ?', [now, id]);

    this.audit('إبطال فاتورة', 'INVOICE', id, {});
  }

  // ─── Payment Management ───────────────────────────────────────────────────────

  public listPayments(limit = 200): PlatformPayment[] {
    PlatformInvoiceService.requirePlatformAccess('payments', 'platform.payments.view');
    const rows = this.db.query<any>(
      `SELECT p.*, t.name AS tenantName, t.code AS tenantCode, i.id AS invoiceId
       FROM platform_payments p
       JOIN platform_tenants t ON t.id = p.tenant_id
       LEFT JOIN platform_invoices i ON i.id = p.invoice_id
       ORDER BY p.paid_at DESC
       LIMIT ?`,
      [limit]
    );
    return rows.map(this.mapPayment);
  }

  public addPayment(input: PlatformPaymentInput): PlatformPayment {
    PlatformInvoiceService.requirePlatformAccess('payments', 'platform.payments.create');

    const tenant = this.db.query<any>('SELECT * FROM platform_tenants WHERE id = ?', [input.tenantId])[0];
    if (!tenant) throw new Error('العميل غير موجود.');

    if (input.invoiceId) {
      const invoice = this.getInvoice(input.invoiceId);
      if (!invoice) throw new Error('الفاتورة غير موجودة.');
      if (invoice.tenantId !== input.tenantId) throw new Error('الفاتورة لا تنتمي لهذا العميل.');
    }

    const id = `pay_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = nowIso();
    const paidAt = input.paidAt ?? now;

    this.db.run(
      `INSERT INTO platform_payments
        (id, tenant_id, invoice_id, amount, method, reference, paid_at, notes, created_at)
       VALUES (?, ?, ?, ROUND(?*100), ?, ?, ?, ?, ?)`,
      [id, input.tenantId, input.invoiceId ?? null, toNumber(input.amount, 0), input.method, input.reference ?? null, paidAt, input.notes ?? null, now]
    );

    // Update invoice paid amount
    if (input.invoiceId) {
      this.db.run(
        `UPDATE platform_invoices SET paid_amount = paid_amount + ROUND(?*100), updated_at = ?
         WHERE id = ?`,
        [toNumber(input.amount, 0), now, input.invoiceId]
      );

      // Auto-update invoice status
      const invoice = this.getInvoice(input.invoiceId);
      if (invoice) {
        const newPaid = invoice.paidAmount + toNumber(input.amount, 0);
        if (newPaid >= invoice.total) {
          this.db.run('UPDATE platform_invoices SET status = \'PAID\', paid_at = ?, updated_at = ? WHERE id = ?', [now, now, input.invoiceId]);
        } else if (newPaid > 0) {
          this.db.run('UPDATE platform_invoices SET status = \'PARTIAL\', updated_at = ? WHERE id = ?', [now, input.invoiceId]);
        }
      }
    }

    this.audit('إضافة دفعة', 'PAYMENT', id, { tenantId: input.tenantId, amount: input.amount });

    const payment = this.getPayment(id);
    if (!payment) throw new Error('فشل إضافة الدفعة.');
    return payment;
  }

  public voidPayment(id: string, reason?: string): void {
    PlatformInvoiceService.requirePlatformAccess('payments', 'platform.payments.delete');

    const payment = this.getPayment(id);
    if (!payment) throw new Error('الدفعة غير موجودة.');

    const now = nowIso();
    this.db.executeTransaction(() => {
      // Update invoice paid amount
      if (payment.invoiceId) {
        this.db.run(
          `UPDATE platform_invoices SET paid_amount = paid_amount - ROUND(?*100), updated_at = ? WHERE id = ?`,
          [payment.amount, now, payment.invoiceId]
        );

        // Recalculate invoice status
        const invoice = this.getInvoice(payment.invoiceId);
        if (invoice) {
          const newPaid = invoice.paidAmount - payment.amount;
          if (newPaid <= 0) {
            this.db.run('UPDATE platform_invoices SET status = \'SENT\', paid_at = NULL, updated_at = ? WHERE id = ?', [now, payment.invoiceId]);
          } else if (newPaid < invoice.total) {
            this.db.run('UPDATE platform_invoices SET status = \'PARTIAL\', updated_at = ? WHERE id = ?', [now, payment.invoiceId]);
          }
        }
      }

      this.db.run('DELETE FROM platform_payments WHERE id = ?', [id]);
    });

    this.audit('إبطال دفعة', 'PAYMENT', id, { reason });
  }

  public getPayment(id: string): PlatformPayment | null {
    PlatformInvoiceService.requirePlatformAccess('payments', 'platform.payments.view');
    const row = this.db.query<any>(
      `SELECT p.*, i.number AS invoice_number FROM platform_payments p
       LEFT JOIN platform_invoices i ON i.id = p.invoice_id
       WHERE p.id = ?`,
      [id]
    )[0];
    return row ? this.mapPayment(row) : null;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private mapInvoice(row: any): PlatformInvoice {
    return {
      id: String(row.id),
      number: String(row.number ?? row.id),
      tenantId: String(row.tenant_id),
      tenantName: row.tenantName ?? null,
      subscriptionId: row.subscription_id ?? null,
      issueDate: String(row.issue_date),
      dueDate: row.due_date ?? null,
      status: row.status,
      currency: row.currency ?? 'EGP',
      subtotal: toNumber(row.subtotal, 0) / 100,
      discount: toNumber(row.discount, 0) / 100,
      tax: toNumber(row.tax, 0) / 100,
      total: toNumber(row.total, 0) / 100,
      paidAmount: toNumber(row.paid_amount, 0) / 100,
      notes: row.notes ?? null,
      createdAt: String(row.created_at),
      items: row.items ? JSON.parse(row.items) : undefined,
    };
  }

  private mapPayment(row: any): PlatformPayment {
    return {
      id: String(row.id),
      invoiceId: row.invoice_id ?? null,
      invoiceNumber: row.invoiceNumber ?? row.invoice_number ?? null,
      tenantId: String(row.tenant_id),
      tenantName: row.tenantName ?? null,
      amount: toNumber(row.amount, 0) / 100,
      method: row.method,
      reference: row.reference ?? null,
      paidAt: String(row.paid_at),
      notes: row.notes ?? null,
    };
  }
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const targetMonth = result.getMonth() + months;
  const day = result.getDate();
  result.setMonth(targetMonth);
  if (result.getDate() < day) result.setDate(0);
  return result;
}

export const platformInvoiceService = new PlatformInvoiceService();