import { DatabaseManager } from '../database/db';
import type { Supplier, SupplierPayment, PaymentType } from '../types';
import { v4 as uuidv4 } from 'uuid';

export class SupplierService {
  private db = DatabaseManager.getInstance();

  public getAllSuppliers(search?: string): Supplier[] {
    let sql = `SELECT * FROM suppliers`;
    const params: any[] = [];

    if (search && search.trim()) {
      sql += ` WHERE name LIKE ? OR company_name LIKE ? OR phone LIKE ? OR code LIKE ?`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }

    sql += ` ORDER BY name ASC`;
    return this.db.query<Supplier>(sql, params);
  }

  public getSupplierById(id: string): Supplier | null {
    const rows = this.db.query<Supplier>(`SELECT * FROM suppliers WHERE id = ?`, [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  public createSupplier(supplier: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt' | 'totalPurchases' | 'currentBalance'> & { initialBalance?: number }, performedBy = 'usr_admin'): Supplier {
    const id = `sup_${uuidv4().substring(0, 8)}`;
    const code = supplier.code || `SUP-${Date.now().toString().slice(-5)}`;

    return this.db.executeTransaction((sqliteDb) => {
      sqliteDb.run(`
        INSERT INTO suppliers (
          id, code, name, company_name, phone, email, tax_number, commercial_record,
          address, current_balance, total_purchases, payment_terms_days, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `, [
        id, code, supplier.name, supplier.companyName || null, supplier.phone,
        supplier.email || null, supplier.taxNumber || null, supplier.commercialRecord || null,
        supplier.address || null, supplier.initialBalance || 0, supplier.paymentTermsDays || 30,
        supplier.notes || null
      ]);

      sqliteDb.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
        VALUES (?, ?, 'المدير', 'إضافة مورد / مصنع جديد', 'SUPPLIERS', ?, ?)
      `, [`aud_${uuidv4().substring(0, 8)}`, performedBy, id, JSON.stringify(supplier)]);

      return this.getSupplierById(id)!;
    });
  }

  public updateSupplier(id: string, updates: Partial<Supplier>, performedBy = 'usr_admin'): Supplier {
    const existing = this.getSupplierById(id);
    if (!existing) throw new Error('المورد غير موجود.');

    const sql = `
      UPDATE suppliers SET
        name = COALESCE(?, name),
        company_name = COALESCE(?, company_name),
        phone = COALESCE(?, phone),
        email = COALESCE(?, email),
        tax_number = COALESCE(?, tax_number),
        commercial_record = COALESCE(?, commercial_record),
        address = COALESCE(?, address),
        payment_terms_days = COALESCE(?, payment_terms_days),
        notes = COALESCE(?, notes),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    return this.db.executeTransaction((sqliteDb) => {
      sqliteDb.run(sql, [
        updates.name ?? null, updates.companyName ?? null, updates.phone ?? null, updates.email ?? null,
        updates.taxNumber ?? null, updates.commercialRecord ?? null, updates.address ?? null,
        updates.paymentTermsDays ?? null, updates.notes ?? null, id
      ]);

      sqliteDb.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, old_values, new_values)
        VALUES (?, ?, 'المدير', 'تعديل بيانات مورد', 'SUPPLIERS', ?, ?, ?)
      `, [`aud_${uuidv4().substring(0, 8)}`, performedBy, id, JSON.stringify(existing), JSON.stringify(updates)]);

      return this.getSupplierById(id)!;
    });
  }

  public recordPayment(
    supplierId: string,
    amount: number,
    paymentType: PaymentType = 'CASH',
    registerId?: string,
    notes = '',
    performedBy = 'usr_admin'
  ): SupplierPayment {
    if (amount <= 0) throw new Error('يجب أن يكون مبلغ السداد أكبر من الصفر.');

    const sup = this.getSupplierById(supplierId);
    if (!sup) throw new Error('المورد غير موجود.');

    const paymentId = `spay_${uuidv4().substring(0, 8)}`;
    const receiptNumber = `PAY-${Date.now().toString().slice(-6)}`;
    const today = new Date().toISOString().slice(0, 10);

    return this.db.executeTransaction((sqliteDb) => {
      // 1. Insert Payment Receipt
      sqliteDb.run(`
        INSERT INTO supplier_payments (
          id, receipt_number, supplier_id, amount, payment_type, date, register_id, notes, performed_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [paymentId, receiptNumber, supplierId, amount, paymentType, today, registerId || 'cr_main', notes, performedBy]);

      // 2. Reduce supplier balance
      sqliteDb.run(`
        UPDATE suppliers SET current_balance = current_balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `, [amount, supplierId]);

      // 3. Deduct from Cash register if cash
      if (paymentType === 'CASH' && registerId) {
        sqliteDb.run(`
          UPDATE cash_registers SET current_balance = current_balance - ? WHERE id = ?
        `, [amount, registerId]);
      }

      return {
        id: paymentId,
        receiptNumber,
        supplierId,
        amount,
        paymentType,
        date: today,
        registerId,
        notes,
        performedBy,
        createdAt: new Date().toISOString()
      };
    });
  }

  public getSupplierStatement(supplierId: string) {
    const sup = this.getSupplierById(supplierId);
    if (!sup) throw new Error('المورد غير موجود.');

    const purchases = this.db.query<any>(`
      SELECT id, date, invoice_number as docNumber, total_amount as credit, paid_amount, created_at
      FROM purchase_invoices
      WHERE supplier_id = ?
    `, [supplierId]);

    const payments = this.db.query<any>(`
      SELECT id, date, receipt_number as docNumber, amount as debit, created_at, notes
      FROM supplier_payments
      WHERE supplier_id = ?
    `, [supplierId]);

    const allRecords: any[] = [
      ...purchases.map(p => ({
        id: p.id,
        date: p.date,
        type: 'PURCHASE' as const,
        docNumber: p.docNumber,
        description: `فاتورة شراء توريد سيراميك رقم ${p.docNumber}`,
        debit: 0,
        credit: p.credit,
        createdAt: p.createdAt
      })),
      ...payments.map(py => ({
        id: py.id,
        date: py.date,
        type: 'PAYMENT' as const,
        docNumber: py.docNumber,
        description: `سند صرف / سداد دفعة للمورد (${py.notes || 'سداد نقدي'})`,
        debit: py.debit,
        credit: 0,
        createdAt: py.createdAt
      }))
    ];

    allRecords.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    let runningBalance = 0;
    const finalStatement = allRecords.map(item => {
      runningBalance += (item.credit - item.debit); // له - سددنا له
      return {
        ...item,
        balanceAfter: Number(runningBalance.toFixed(2))
      };
    });

    return {
      supplier: sup,
      transactions: finalStatement
    };
  }
}
