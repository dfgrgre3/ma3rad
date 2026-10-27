import { DatabaseManager } from '../database/db';
import type { ElectronicInvoice, CreateElectronicInvoiceDTO, ElectronicInvoiceStatus } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { localDateString } from '../utils/date';
import { round2 } from './financials';

export class ElectronicInvoiceService {
  private db = DatabaseManager.getInstance();

  public getAllElectronicInvoices(status?: ElectronicInvoiceStatus): ElectronicInvoice[] {
    let sql = `
      SELECT ei.*, c.name as customerName, u.full_name as createdByName
      FROM electronic_invoices ei
      JOIN customers c ON ei.customer_id = c.id
      LEFT JOIN users u ON ei.created_by = u.id
    `;
    const params: any[] = [];
    if (status) {
      sql += ` WHERE ei.status = ?`;
      params.push(status);
    }
    sql += ` ORDER BY ei.created_at DESC`;
    return this.db.query<ElectronicInvoice>(sql, params);
  }

  public getElectronicInvoiceById(id: string): ElectronicInvoice | null {
    const rows = this.db.query<ElectronicInvoice>(`
      SELECT ei.*, c.name as customerName, u.full_name as createdByName
      FROM electronic_invoices ei
      JOIN customers c ON ei.customer_id = c.id
      LEFT JOIN users u ON ei.created_by = u.id
      WHERE ei.id = ?
    `, [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  public getElectronicInvoiceBySalesInvoice(salesInvoiceId: string): ElectronicInvoice | null {
    const rows = this.db.query<ElectronicInvoice>(`
      SELECT * FROM electronic_invoices WHERE sales_invoice_id = ?
    `, [salesInvoiceId]);
    return rows.length > 0 ? rows[0] : null;
  }

  public createElectronicInvoice(dto: CreateElectronicInvoiceDTO): ElectronicInvoice {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'electronic_invoices.create');

    const salesInvoice = this.db.query<any>(
      'SELECT * FROM sales_invoices WHERE id = ?',
      [dto.salesInvoiceId]
    )[0];
    if (!salesInvoice) throw new Error('الفاتورة التجارية غير موجودة.');

    const existing = this.getElectronicInvoiceBySalesInvoice(dto.salesInvoiceId);
    if (existing) throw new Error('يوجد فاتورة إلكترونية مرتبطة بهذه الفاتورة التجارية مسبقاً.');

    const id = `einv_${uuidv4().substring(0, 8)}`;
    const invoiceNumber = `EINV-${localDateString().replace(/-/g, '')}-${Date.now().toString().slice(-6)}`;
    const now = new Date().toISOString();

    return this.db.executeTransaction((sqliteDb) => {
      sqliteDb.run(`
        INSERT INTO electronic_invoices (
          id, invoice_number, sales_invoice_id, customer_id, status,
          total_tax, total_amount, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?)
      `, [
        id, invoiceNumber, dto.salesInvoiceId, dto.customerId,
        Number(salesInvoice.tax_amount || 0), Number(salesInvoice.total_amount || 0),
        actor.id, now, now
      ]);

      return this.getElectronicInvoiceById(id)!;
    });
  }

  public submitElectronicInvoice(id: string): ElectronicInvoice {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'electronic_invoices.submit');
    throw new Error('لم يتم إعداد موفر فوترة إلكترونية معتمد؛ لا يمكن تسجيل الفاتورة كمرسلة ضريبيًا.');
  }

  public acceptElectronicInvoice(id: string, taxAuthorityReference: string): ElectronicInvoice {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'electronic_invoices.accept');
    throw new Error('لا يمكن تسجيل قبول ضريبي دون رد موثق من موفر التكامل المعتمد.');
  }

  public rejectElectronicInvoice(id: string, reason: string): ElectronicInvoice {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'electronic_invoices.reject');

    const invoice = this.getElectronicInvoiceById(id);
    if (!invoice) throw new Error('الفاتورة الإلكترونية غير موجودة.');
    if (invoice.status !== 'SENT') throw new Error('لا يمكن رفض فاتورة لم تُرسل بعد.');

    this.db.run(`
      UPDATE electronic_invoices
      SET status = 'REJECTED', rejection_reason = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [reason, id]);

    return this.getElectronicInvoiceById(id)!;
  }

  public cancelElectronicInvoice(id: string): ElectronicInvoice {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'electronic_invoices.cancel');

    const invoice = this.getElectronicInvoiceById(id);
    if (!invoice) throw new Error('الفاتورة الإلكترونية غير موجودة.');
    if (invoice.status === 'ACCEPTED') throw new Error('لا يمكن إلغاء فاتورة تم قبولها من الهيئة الضريبية.');

    this.db.run(`
      UPDATE electronic_invoices
      SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [id]);

    return this.getElectronicInvoiceById(id)!;
  }

  public getStats(): {
    total: number;
    draft: number;
    sent: number;
    accepted: number;
    rejected: number;
    cancelled: number;
  } {
    const rows = this.db.query<any>(`
      SELECT status, COUNT(*) as cnt FROM electronic_invoices GROUP BY status
    `);
    const stats: Record<string, number> = {};
    for (const row of rows) stats[row.status] = row.cnt;
    return {
      total: Object.values(stats).reduce((a, b) => a + b, 0),
      draft: stats.DRAFT || 0,
      sent: stats.SENT || 0,
      accepted: stats.ACCEPTED || 0,
      rejected: stats.REJECTED || 0,
      cancelled: stats.CANCELLED || 0,
    };
  }
}
