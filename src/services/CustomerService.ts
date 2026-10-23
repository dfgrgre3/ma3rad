import { DatabaseManager } from '../database/db';
import type { Customer, CustomerPayment, PaymentType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { round2 } from './financials';

export class CustomerService {
  private db = DatabaseManager.getInstance();

  public getAllCustomers(search?: string): Customer[] {
    let sql = `SELECT * FROM customers`;
    const params: any[] = [];

    if (search && search.trim()) {
      sql += ` WHERE name LIKE ? OR phone LIKE ? OR phone2 LIKE ? OR code LIKE ?`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }

    sql += ` ORDER BY name ASC`;
    return this.db.query<Customer>(sql, params);
  }

  public getCustomersPage(search = '', page = 1, pageSize = 25) {
    const params: any[] = [];
    let where = '';
    if (search.trim()) {
      where = ' WHERE name LIKE ? OR phone LIKE ? OR phone2 LIKE ? OR code LIKE ?';
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }
    return this.db.queryPage<Customer>(
      `SELECT * FROM customers${where} ORDER BY name ASC`,
      `SELECT COUNT(*) as total_items FROM customers${where}`,
      params, page, pageSize,
    );
  }

  public getCustomerById(id: string): Customer | null {
    const rows = this.db.query<Customer>(`SELECT * FROM customers WHERE id = ?`, [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  public createCustomer(customer: Omit<Customer, 'id' | 'createdAt' | 'updatedAt' | 'totalPurchases' | 'currentBalance'> & { initialBalance?: number }, performedBy = 'usr_admin'): Customer {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'customers.create');
    const id = `cust_${uuidv4().substring(0, 8)}`;
    const code = customer.code || `CUST-${Date.now().toString().slice(-5)}`;

    return this.db.executeTransaction((sqliteDb) => {
      sqliteDb.run(`
        INSERT INTO customers (
          id, code, name, phone, phone2, national_id, address, city,
          customer_type, credit_limit, current_balance, total_purchases, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
      `, [
        id, code, customer.name, customer.phone, customer.phone2 || null,
        customer.nationalId || null, customer.address || null, customer.city || null,
        customer.customerType || 'RETAIL', customer.creditLimit || 0, customer.initialBalance || 0,
        customer.notes || null
      ]);

      sqliteDb.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
        VALUES (?, ?, 'المدير', 'إضافة عميل جديد', 'CUSTOMERS', ?, ?)
      `, [`aud_${uuidv4().substring(0, 8)}`, actor.id, id, JSON.stringify(customer)]);

      return this.getCustomerById(id)!;
    });
  }

  public updateCustomer(id: string, updates: Partial<Customer>, performedBy = 'usr_admin'): Customer {
    const existing = this.getCustomerById(id);
    if (!existing) throw new Error('العميل غير موجود.');

    const sql = `
      UPDATE customers SET
        name = COALESCE(?, name),
        phone = COALESCE(?, phone),
        phone2 = COALESCE(?, phone2),
        national_id = COALESCE(?, national_id),
        address = COALESCE(?, address),
        city = COALESCE(?, city),
        customer_type = COALESCE(?, customer_type),
        credit_limit = COALESCE(?, credit_limit),
        notes = COALESCE(?, notes),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    return this.db.executeTransaction((sqliteDb) => {
      sqliteDb.run(sql, [
        updates.name ?? null, updates.phone ?? null, updates.phone2 ?? null, updates.nationalId ?? null,
        updates.address ?? null, updates.city ?? null, updates.customerType ?? null, updates.creditLimit ?? null,
        updates.notes ?? null, id
      ]);

      sqliteDb.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, old_values, new_values)
        VALUES (?, ?, 'المدير', 'تعديل بيانات عميل', 'CUSTOMERS', ?, ?, ?)
      `, [`aud_${uuidv4().substring(0, 8)}`, performedBy, id, JSON.stringify(existing), JSON.stringify(updates)]);

      return this.getCustomerById(id)!;
    });
  }

  public recordPayment(
    customerId: string,
    amount: number,
    paymentType: PaymentType = 'CASH',
    registerId?: string,
    shiftId?: string,
    notes = '',
    performedBy = 'usr_admin'
  ): CustomerPayment {
    if (amount <= 0) throw new Error('يجب أن يكون مبلغ السند أكبر من الصفر.');
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'customers.payment');

    const cust = this.getCustomerById(customerId);
    if (!cust) throw new Error('العميل غير موجود.');

    const paymentId = `cpay_${uuidv4().substring(0, 8)}`;
    const today = new Date().toISOString().slice(0, 10);

    return this.db.executeTransaction((sqliteDb) => {
      const receiptNumber = sqliteDb.nextNumber('REC');
      // 1. Record customer payment receipt
      sqliteDb.run(`
        INSERT INTO customer_payments (
          id, receipt_number, customer_id, amount, payment_type, date, register_id, shift_id, notes, performed_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [paymentId, receiptNumber, customerId, amount, paymentType, today, registerId || 'cr_main', shiftId || null, notes, actor.id]);
      // 2. Reduce customer debt balance
      sqliteDb.run(`
        UPDATE customers SET current_balance = current_balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `, [amount, customerId]);

      // 3. Update cash register balance if cash
      if (paymentType === 'CASH' && registerId) {
        sqliteDb.run(`
          UPDATE cash_registers SET current_balance = current_balance + ? WHERE id = ?
        `, [amount, registerId]);
      }

      // 4. If active shift, update shift total
      if (shiftId) {
        sqliteDb.run(`
          UPDATE cash_shifts SET total_customer_payments = total_customer_payments + ? WHERE id = ?
        `, [amount, shiftId]);
      }

      return {
        id: paymentId,
        receiptNumber,
        customerId,
        amount,
        paymentType,
        date: today,
        registerId,
        shiftId,
        notes,
        performedBy: actor.id,
        createdAt: new Date().toISOString()
      };
    });
  }

  public deletePayment(paymentId: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'customers.payment');
    const payment = this.db.query<any>(
      `SELECT id, receipt_number, customer_id, invoice_id, amount, payment_type, register_id, shift_id
       FROM customer_payments WHERE id = ?`,
      [paymentId]
    )[0];
    if (!payment) throw new Error('سند القبض غير موجود.');
    if (payment.invoice_id) throw new Error('سند مرتبط بفاتورة بيع. احذفه من تفاصيل الفاتورة.');

    const installment = this.db.query<{ count: number }>(
      'SELECT COUNT(*) AS count FROM installments WHERE payment_id = ?',
      [paymentId]
    )[0]?.count ?? 0;
    if (installment > 0) {
      throw new Error('السند مرتبط بقسط. ألغِ سداد القسط من صفحة الأقساط أولًا.');
    }

    const amount = round2(payment.amount);
    this.db.executeTransaction((db) => {
      db.run(
        `UPDATE customers SET current_balance = current_balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [amount, payment.customer_id]
      );
      if (payment.payment_type === 'CASH') {
        db.run(`UPDATE cash_registers SET current_balance = current_balance - ? WHERE id = ?`, [amount, payment.register_id || 'cr_main']);
      }
      if (payment.shift_id) {
        db.run(`UPDATE cash_shifts SET total_customer_payments = total_customer_payments - ? WHERE id = ?`, [amount, payment.shift_id]);
      }
      db.run('DELETE FROM customer_payments WHERE id = ?', [paymentId]);
      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, old_values)
         VALUES (?, ?, ?, 'حذف سند تحصيل', 'CUSTOMERS', ?, ?)`,
        [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, payment.customer_id, JSON.stringify({
          receiptNumber: payment.receipt_number, amount,
        })]
      );
    });
  }

  public getCustomerStatement(customerId: string): {
    customer: Customer;
    transactions: {
      id: string;
      date: string;
      type: 'INVOICE' | 'PAYMENT' | 'RETURN';
      docNumber: string;
      description: string;
      debit: number; // مدين (عليه)
      credit: number; // دائن (له/سدد)
      balanceAfter: number;
    }[];
  } {
    const cust = this.getCustomerById(customerId);
    if (!cust) throw new Error('العميل غير موجود.');

    // Fetch Invoices
    const invoices = this.db.query<any>(`
      SELECT id, date, invoice_number as docNumber, total_amount as debit, paid_amount, created_at
      FROM sales_invoices
      WHERE customer_id = ? AND invoice_status != 'VOID'
    `, [customerId]);

    // Fetch Payments
    const payments = this.db.query<any>(`
      SELECT id, date, receipt_number as docNumber, amount as credit, created_at, notes
      FROM customer_payments
      WHERE customer_id = ?
    `, [customerId]);

    // Fetch Returns
    const returns = this.db.query<any>(`
      SELECT id, date, return_number as docNumber, total_amount as credit, created_at, reason
      FROM sales_returns
      WHERE customer_id = ?
    `, [customerId]);

    // Aggregate and sort chronologically
    const allRecords: any[] = [
      ...invoices.map(i => ({
        id: i.id,
        date: i.date,
        type: 'INVOICE' as const,
        docNumber: i.docNumber,
        description: `فاتورة مبيعات رقم ${i.docNumber}`,
        debit: i.debit,
        credit: 0,
        createdAt: i.createdAt
      })),
      ...payments.map(p => ({
        id: p.id,
        date: p.date,
        type: 'PAYMENT' as const,
        docNumber: p.docNumber,
        description: `سند قبض / تحصيل دفعة (${p.notes || 'سداد نقدي'})`,
        debit: 0,
        credit: p.credit,
        createdAt: p.createdAt
      })),
      ...returns.map(r => ({
        id: r.id,
        date: r.date,
        type: 'RETURN' as const,
        docNumber: r.docNumber,
        description: `مرتجع مبيعات رقم ${r.docNumber} (${r.reason || ''})`,
        debit: 0,
        credit: r.credit,
        createdAt: r.createdAt
      }))
    ];

    allRecords.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    let runningBalance = 0;
    const finalStatement = allRecords.map(item => {
      runningBalance += (item.debit - item.credit);
      return {
        ...item,
        balanceAfter: Number(runningBalance.toFixed(2))
      };
    });

    return {
      customer: cust,
      transactions: finalStatement
    };
  }
}
