import { DatabaseManager } from '../database/db';
import type { Customer, CustomerPayment, PaymentType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { BranchAccessService } from './BranchAccessService';
import { round2 } from './financials';
import { localDateString } from '../utils/date';
import { paymentAccountCode, postLedgerEntry } from '../database/ledger';

function getExistingCustomerPayment(
  prior: CustomerPayment[],
  customerId: string,
  amount: number,
  paymentType: PaymentType,
  register: string,
  shiftId: string | undefined,
  notes: string,
  branchId: string,
): CustomerPayment | undefined {
  if (prior.some((row) => row.branchId !== branchId)) {
    throw new Error('The customer payment idempotency key was already used in another branch.');
  }
  if (!prior.length) return undefined;

  const existingPayment = prior[0];
  if (
    existingPayment.customerId !== customerId ||
    Number(existingPayment.amount) !== amount ||
    existingPayment.paymentType !== paymentType ||
    (existingPayment.registerId || 'cr_main') !== register ||
    (existingPayment.shiftId || null) !== (shiftId || null) ||
    (existingPayment.notes || '') !== notes
  ) {
    throw new Error('The customer payment idempotency key was already used for a different request.');
  }
  return {
    id: existingPayment.id,
    receiptNumber: existingPayment.receiptNumber,
    customerId: existingPayment.customerId,
    branchId: existingPayment.branchId,
    amount: existingPayment.amount,
    paymentType: existingPayment.paymentType,
    date: existingPayment.date,
    registerId: existingPayment.registerId,
    shiftId: existingPayment.shiftId,
    notes: existingPayment.notes,
    performedBy: existingPayment.performedBy,
    createdAt: existingPayment.createdAt,
  };
}

export class CustomerService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();

  public getAllCustomers(search?: string): Customer[] {
    const scope = this.branchAccess.companyScope('company_id');
    let sql = `SELECT * FROM customers WHERE ${scope.clause}`;
    const params: any[] = [...scope.params];

    if (search && search.trim()) {
      sql += ` AND (name LIKE ? OR phone LIKE ? OR phone2 LIKE ? OR code LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }

    sql += ` ORDER BY name ASC`;
    return this.db.query<Customer>(sql, params);
  }

  public getCustomersPage(search = '', page = 1, pageSize = 25) {
    const scope = this.branchAccess.companyScope('company_id');
    const params: any[] = [...scope.params];
    let where = ` WHERE ${scope.clause}`;
    if (search.trim()) {
      where += ' AND (name LIKE ? OR phone LIKE ? OR phone2 LIKE ? OR code LIKE ?)';
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
    const rows = this.db.query<Customer>(`SELECT * FROM customers WHERE id = ? AND ${this.branchAccess.companyScope('company_id').clause}`, [id, ...this.branchAccess.companyScope('company_id').params]);
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
          customer_type, credit_limit, payment_terms_days, current_balance, total_purchases, notes, company_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `, [
        id, code, customer.name, customer.phone, customer.phone2 || null,
        customer.nationalId || null, customer.address || null, customer.city || null,
        customer.customerType || 'RETAIL', customer.creditLimit || 0, customer.paymentTermsDays || 0, customer.initialBalance || 0,
        customer.notes || null, this.branchAccess.getAccessibleCompanyIds(AuthService.requireAuth())?.[0] ?? null
      ]);

      sqliteDb.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
        VALUES (?, ?, 'المدير', 'إضافة عميل جديد', 'CUSTOMERS', ?, ?)
      `, [`aud_${uuidv4().substring(0, 8)}`, actor.id, id, JSON.stringify(customer)]);

      return this.getCustomerById(id)!;
    });
  }

  public updateCustomer(id: string, updates: Partial<Customer>): Customer {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'customers.update');
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
        payment_terms_days = COALESCE(?, payment_terms_days),
        notes = COALESCE(?, notes),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    return this.db.executeTransaction((sqliteDb) => {
      sqliteDb.run(sql, [
        updates.name ?? null, updates.phone ?? null, updates.phone2 ?? null, updates.nationalId ?? null,
        updates.address ?? null, updates.city ?? null, updates.customerType ?? null, updates.creditLimit ?? null, updates.paymentTermsDays ?? null,
        updates.notes ?? null, id
      ]);

      sqliteDb.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, old_values, new_values)
        VALUES (?, ?, ?, 'تعديل بيانات عميل', 'CUSTOMERS', ?, ?, ?)
      `, [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id, JSON.stringify(existing), JSON.stringify(updates)]);

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
    performedBy = 'usr_admin',
    paymentDate?: string,
    idempotencyKey?: string
  ): CustomerPayment {
    if (amount <= 0) throw new Error('يجب أن يكون مبلغ السند أكبر من الصفر.');
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'customers.payment');

    const cust = this.getCustomerById(customerId);
    if (!cust) throw new Error('العميل غير موجود.');
    const register = registerId || 'cr_main';
    const branchId = this.branchAccess.requireRegisterAccess(register, actor);
    if (shiftId) {
      const shift = this.branchAccess.requireShiftAccess(shiftId, actor, register);
      if (shift.status !== 'OPEN') throw new Error('الوردية المحددة مغلقة.');
    }

    const paymentId = `cpay_${uuidv4().substring(0, 8)}`;
    const today = paymentDate || localDateString();

    return this.db.executeTransaction((sqliteDb) => {
      const prior = idempotencyKey
        ? sqliteDb.query<CustomerPayment>(`SELECT * FROM customer_payments WHERE payment_group_id=?`, [idempotencyKey])
        : [];
      const existingPayment = getExistingCustomerPayment(prior, customerId, amount, paymentType, register, shiftId, notes, branchId);
      if (existingPayment) return existingPayment;

      const receiptNumber = sqliteDb.nextNumber('REC');
      // 1. Record customer payment receipt
      sqliteDb.run(`
        INSERT INTO customer_payments (
          id, receipt_number, customer_id, amount, payment_group_id, payment_type, date, register_id, shift_id, branch_id, notes, performed_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [paymentId, receiptNumber, customerId, amount, idempotencyKey || null, paymentType, today, register, shiftId || null, branchId, notes, actor.id]);
      let unapplied = round2(amount);
      const openInvoices = sqliteDb.query<any>(`SELECT id,paid_amount,remaining_amount,total_amount FROM sales_invoices WHERE customer_id=? AND branch_id=? AND invoice_status!='VOID' AND date<=? AND remaining_amount>0.009 ORDER BY date,created_at,id`, [customerId, branchId, today]);
      for (const invoice of openInvoices) {
        if (unapplied <= 0.009) break;
        const allocated = round2(Math.min(unapplied, Number(invoice.remainingAmount)));
        if (allocated <= 0) continue;
        sqliteDb.run(`INSERT INTO customer_payment_allocations (id,payment_id,sales_invoice_id,amount) VALUES (?,?,?,?)`,
          [`cpa_${uuidv4().substring(0, 8)}`, paymentId, invoice.id, allocated]);
        const paidAmount = round2(Number(invoice.paidAmount) + allocated);
        const remainingAmount = round2(Math.max(0, Number(invoice.remainingAmount) - allocated));
        sqliteDb.run(`UPDATE sales_invoices SET paid_amount=?,remaining_amount=?,payment_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
          [paidAmount, remainingAmount, remainingAmount <= 0 ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'UNPAID', invoice.id]);
        unapplied = round2(unapplied - allocated);
      }
      // 2. Reduce customer debt balance
      sqliteDb.run(`
        UPDATE customers SET current_balance = current_balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `, [amount, customerId]);

      // 3. Update cash register balance if cash
      if (paymentType === 'CASH') {
        sqliteDb.run(`
          UPDATE cash_registers SET current_balance = current_balance + ? WHERE id = ?
        `, [amount, register]);
      }
      postLedgerEntry(sqliteDb.getDatabase(), {
        date: today,
        description: `Customer receipt ${receiptNumber}`,
        referenceType: 'CUSTOMER_PAYMENT',
        referenceId: paymentId,
        createdBy: actor.id,
        lines: [
          { accountCode: paymentAccountCode(paymentType), debit: amount, credit: 0 },
          { accountCode: '1103', debit: 0, credit: amount },
        ],
      });

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
        branchId,
        amount,
        paymentType,
        date: today,
        registerId: register,
        shiftId,
        notes,
        performedBy: actor.id,
        createdAt: new Date().toISOString()
      };
    });
  }

  public deletePayment(paymentId: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'customers.payment.reverse');
    const payment = this.db.query<any>(
      `SELECT id, receipt_number, customer_id, invoice_id, amount, payment_type, register_id, shift_id, branch_id
       FROM customer_payments WHERE id = ?`,
      [paymentId]
    )[0];
    if (!payment) throw new Error('سند القبض غير موجود.');
    this.branchAccess.requireBranchAccess(payment.branchId, actor);
    if (payment.registerId) this.branchAccess.requireRegisterAccess(payment.registerId, actor, payment.branchId);
    if (payment.invoiceId) throw new Error('سند مرتبط بفاتورة بيع. اعكسه من تفاصيل الفاتورة.');

    const installment = this.db.query<{ count: number }>(
      'SELECT COUNT(*) AS count FROM installments WHERE payment_id = ?',
      [paymentId]
    )[0]?.count ?? 0;
    if (installment > 0) {
      throw new Error('السند مرتبط بقسط. ألغِ سداد القسط من صفحة الأقساط أولًا.');
    }

    const downPaymentPlan = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM installment_plans WHERE down_payment_payment_id=? AND status!='CANCELLED'`, [paymentId]
    )[0]?.count ?? 0;
    if (downPaymentPlan) throw new Error('This receipt is the down payment for an installment plan. Cancel the plan from the installments screen first.');

    const amount = round2(payment.amount);
    this.db.executeTransaction((db) => {
      db.run(
        `UPDATE customers SET current_balance = current_balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [amount, payment.customerId]
      );
      if (payment.paymentType === 'CASH') {
        db.run(`UPDATE cash_registers SET current_balance = current_balance - ? WHERE id = ?`, [amount, payment.registerId || 'cr_main']);
      }
      if (payment.shiftId) {
        db.run(`UPDATE cash_shifts SET total_customer_payments = total_customer_payments - ? WHERE id = ?`, [amount, payment.shiftId]);
      }
      postLedgerEntry(db.getDatabase(), {
        date: localDateString(),
        description: `Reverse customer receipt ${payment.receiptNumber}`,
        referenceType: 'CUSTOMER_PAYMENT_VOID',
        referenceId: paymentId,
        createdBy: actor.id,
        lines: [
          { accountCode: '1103', debit: amount, credit: 0 },
          { accountCode: paymentAccountCode(payment.paymentType), debit: 0, credit: amount },
        ],
      });
      const allocations = db.query<any>(`SELECT sales_invoice_id,amount FROM customer_payment_allocations WHERE payment_id=?`, [paymentId]);
      for (const allocation of allocations) {
        const invoice = db.query<any>('SELECT id,paid_amount,total_amount,remaining_amount FROM sales_invoices WHERE id=?', [allocation.salesInvoiceId])[0];
        if (!invoice) continue;
        const paid = round2(Math.max(0, Number(invoice.paidAmount) - Number(allocation.amount)));
        const remaining = round2(Math.min(Number(invoice.totalAmount), Number(invoice.remainingAmount) + Number(allocation.amount)));
        db.run(`UPDATE sales_invoices SET paid_amount=?,remaining_amount=?,payment_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
          [paid, remaining, remaining <= 0 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID', invoice.id]);
      }
      db.run('DELETE FROM customer_payments WHERE id = ?', [paymentId]);
      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, old_values)
         VALUES (?, ?, ?, 'حذف سند تحصيل', 'CUSTOMERS', ?, ?)`,
        [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, payment.customerId, JSON.stringify({
          receiptNumber: payment.receiptNumber, amount,
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
