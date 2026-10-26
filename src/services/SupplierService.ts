import { DatabaseManager } from '../database/db';
import type { Supplier, SupplierPayment, PaymentType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { BranchAccessService } from './BranchAccessService';
import { localDateString } from '../utils/date';
import { paymentAccountCode, postLedgerEntry } from '../database/ledger';

export class SupplierService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();

  public getAllSuppliers(search?: string, includeInactive = false): Supplier[] {
    let sql = `SELECT * FROM suppliers`;
    const params: any[] = [];
    const conditions: string[] = [];

    if (!includeInactive) conditions.push('is_active = 1');

    if (search && search.trim()) {
      conditions.push('(name LIKE ? OR company_name LIKE ? OR phone LIKE ? OR code LIKE ?)');
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }

    if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`;
    sql += ` ORDER BY name ASC`;
    return this.db.query<Supplier>(sql, params);
  }

  public getSupplierById(id: string): Supplier | null {
    const rows = this.db.query<Supplier>(`SELECT * FROM suppliers WHERE id = ?`, [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  public createSupplier(supplier: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt' | 'totalPurchases' | 'currentBalance'> & { initialBalance?: number }): Supplier {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'suppliers.create');
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
        VALUES (?, ?, ?, 'إضافة مورد / مصنع جديد', 'SUPPLIERS', ?, ?)
      `, [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id, JSON.stringify(supplier)]);

      return this.getSupplierById(id)!;
    });
  }

  public updateSupplier(id: string, updates: Partial<Supplier>): Supplier {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'suppliers.update');
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
        is_active = COALESCE(?, is_active),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    return this.db.executeTransaction((sqliteDb) => {
      sqliteDb.run(sql, [
        updates.name ?? null, updates.companyName ?? null, updates.phone ?? null, updates.email ?? null,
        updates.taxNumber ?? null, updates.commercialRecord ?? null, updates.address ?? null,
        updates.paymentTermsDays ?? null, updates.notes ?? null, updates.isActive ?? null, id
      ]);

      sqliteDb.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, old_values, new_values)
        VALUES (?, ?, ?, 'تعديل بيانات مورد', 'SUPPLIERS', ?, ?, ?)
      `, [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id, JSON.stringify(existing), JSON.stringify(updates)]);

      return this.getSupplierById(id)!;
    });
  }

  public recordPayment(
    supplierId: string,
    amount: number,
    paymentType: PaymentType = 'CASH',
    registerId = 'cr_main',
    notes = '',
    idempotencyKey?: string
  ): SupplierPayment {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'suppliers.payment');
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('يجب أن يكون مبلغ السداد أكبر من الصفر.');
    const branchId = this.branchAccess.requireRegisterAccess(registerId, actor);

    const sup = this.getSupplierById(supplierId);
    if (!sup) throw new Error('المورد غير موجود.');

    const paymentId = `spay_${uuidv4().substring(0, 8)}`;
    const receiptNumber = `PAY-${Date.now().toString().slice(-6)}`;
    const today = localDateString();

    return this.db.executeTransaction((sqliteDb) => {
      if (idempotencyKey) {
        const prior = sqliteDb.query<any>(`SELECT * FROM supplier_payments WHERE idempotency_key = ?`, [idempotencyKey])[0];
        if (prior) {
          if (prior.supplierId !== supplierId || Number(prior.amount) !== amount ||
            prior.paymentType !== paymentType || (prior.registerId || 'cr_main') !== registerId || (prior.notes || '') !== notes) {
            throw new Error('The supplier payment idempotency key was already used for a different request.');
          }
          return prior as SupplierPayment;
        }
      }
      // 1. Insert Payment Receipt
      sqliteDb.run(`
        INSERT INTO supplier_payments (
          id, receipt_number, supplier_id, amount, idempotency_key, payment_type, date, register_id, branch_id, notes, performed_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [paymentId, receiptNumber, supplierId, amount, idempotencyKey || null, paymentType, today, registerId, branchId, notes, actor.id]);

      let unapplied = amount;
      const invoices = sqliteDb.query<any>(`SELECT id,paid_amount,remaining_amount FROM purchase_invoices WHERE supplier_id=? AND branch_id=? AND remaining_amount>0.009 ORDER BY date,created_at,id`, [supplierId, branchId]);
      for (const invoice of invoices) {
        if (unapplied <= 0.009) break;
        const allocated = Math.round(Math.min(unapplied, Number(invoice.remainingAmount)) * 100) / 100;
        if (allocated <= 0) continue;
        sqliteDb.run(`INSERT INTO supplier_payment_allocations (id,payment_id,purchase_invoice_id,amount) VALUES (?,?,?,?)`,
          [`spa_${uuidv4().substring(0, 8)}`, paymentId, invoice.id, allocated]);
        const paid = Math.round((Number(invoice.paidAmount) + allocated) * 100) / 100;
        const remaining = Math.max(0, Math.round((Number(invoice.remainingAmount) - allocated) * 100) / 100);
        sqliteDb.run(`UPDATE purchase_invoices SET paid_amount=?,remaining_amount=?,payment_status=? WHERE id=?`,
          [paid, remaining, remaining <= 0 ? 'PAID' : 'PARTIAL', invoice.id]);
        unapplied = Math.round((unapplied - allocated) * 100) / 100;
      }

      // 2. Reduce supplier balance
      sqliteDb.run(`
        UPDATE suppliers SET current_balance = current_balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `, [amount, supplierId]);

      // 3. Deduct from Cash register if cash
      if (paymentType === 'CASH') {
        sqliteDb.run(`
          UPDATE cash_registers SET current_balance = current_balance - ? WHERE id = ?
        `, [amount, registerId]);
      }
      postLedgerEntry(sqliteDb.getDatabase(), {
        date: today,
        description: `Supplier payment ${receiptNumber}`,
        referenceType: 'SUPPLIER_PAYMENT',
        referenceId: paymentId,
        createdBy: actor.id,
        lines: [
          { accountCode: '2101', debit: amount, credit: 0 },
          { accountCode: paymentAccountCode(paymentType), debit: 0, credit: amount },
        ],
      });

      sqliteDb.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
        VALUES (?, ?, ?, 'سداد دفعة لمورد', 'SUPPLIERS', ?, ?)
      `, [
        `aud_${uuidv4().substring(0, 8)}`,
        actor.id,
        actor.fullName,
        paymentId,
        JSON.stringify({ supplierId, receiptNumber, amount, paymentType, registerId }),
      ]);

      return {
        id: paymentId,
        receiptNumber,
        supplierId,
        branchId,
        amount,
        paymentType,
        date: today,
        registerId,
        notes,
        performedBy: actor.id,
        createdAt: new Date().toISOString()
      };
    });
  }

  public getSupplierStatement(supplierId: string, fromDate?: string, toDate?: string) {
    const sup = this.getSupplierById(supplierId);
    if (!sup) throw new Error('المورد غير موجود.');

    const invoiceScope = this.branchAccess.sqlScope(
      'pi.branch_id',
      '(SELECT w.branch_id FROM warehouses w WHERE w.id = pi.warehouse_id)',
    );
    const paymentScope = this.branchAccess.sqlScope(
      'sp.branch_id',
      '(SELECT cr.branch_id FROM cash_registers cr WHERE cr.id = sp.register_id)',
    );
    const returnScope = this.branchAccess.sqlScope('pi.branch_id', 'w.branch_id');
    const claimScope = this.branchAccess.supplierClaimBranchScope('supplier_claims');

    const purchases = this.db.query<any>(`
      SELECT pi.id, pi.date, pi.invoice_number as docNumber, pi.total_amount as credit,
        pi.paid_amount, pi.created_at
      FROM purchase_invoices pi
      WHERE pi.supplier_id = ? AND (? = '' OR pi.date >= ?) AND (? = '' OR pi.date <= ?)
        AND ${invoiceScope.clause}
    `, [supplierId, fromDate || '', fromDate || '', toDate || '', toDate || '', ...invoiceScope.params]);

    const payments = this.db.query<any>(`
      SELECT sp.id, sp.date, sp.receipt_number as docNumber, sp.amount as debit, sp.created_at, sp.notes
      FROM supplier_payments sp
      WHERE sp.supplier_id = ? AND (? = '' OR sp.date >= ?) AND (? = '' OR sp.date <= ?)
        AND ${paymentScope.clause}
    `, [supplierId, fromDate || '', fromDate || '', toDate || '', toDate || '', ...paymentScope.params]);

    const returns = this.db.query<any>(`
      SELECT pr.id, pr.date, pr.return_number as docNumber, pr.total_amount as debit, pr.created_at, pr.reason
      FROM purchase_returns pr
      LEFT JOIN purchase_invoices pi ON pi.id = pr.original_purchase_id
      LEFT JOIN warehouses w ON w.id = pr.warehouse_id
      WHERE pr.supplier_id = ? AND (? = '' OR pr.date >= ?) AND (? = '' OR pr.date <= ?)
        AND ${returnScope.clause}
    `, [supplierId, fromDate || '', fromDate || '', toDate || '', toDate || '', ...returnScope.params]);

    const claims = this.db.query<any>(`
      SELECT id, date, claim_number as docNumber, agreed_amount as debit, created_at, notes
      FROM supplier_claims
      WHERE supplier_id = ? AND status = 'SETTLED' AND resolution_type = 'DEBIT_NOTE'
        AND (? = '' OR date >= ?) AND (? = '' OR date <= ?)
        AND ${claimScope.clause}
    `, [supplierId, fromDate || '', fromDate || '', toDate || '', toDate || '', ...claimScope.params]);

    const totals = this.db.query<{ purchases: number; payments: number; returns: number; claims: number }>(`
      SELECT
        COALESCE((SELECT SUM(pi.total_amount) FROM purchase_invoices pi WHERE pi.supplier_id = ? AND ${invoiceScope.clause}), 0) AS purchases,
        COALESCE((SELECT SUM(sp.amount) FROM supplier_payments sp WHERE sp.supplier_id = ? AND ${paymentScope.clause}), 0) AS payments,
        COALESCE((SELECT SUM(pr.total_amount) FROM purchase_returns pr
          LEFT JOIN purchase_invoices pi ON pi.id = pr.original_purchase_id
          LEFT JOIN warehouses w ON w.id = pr.warehouse_id
          WHERE pr.supplier_id = ? AND ${returnScope.clause}), 0) AS returns,
        COALESCE((SELECT SUM(agreed_amount) FROM supplier_claims WHERE supplier_id = ? AND status = 'SETTLED' AND resolution_type = 'DEBIT_NOTE' AND ${claimScope.clause}), 0) AS claims
    `, [
      supplierId, ...invoiceScope.params,
      supplierId, ...paymentScope.params,
      supplierId, ...returnScope.params,
      supplierId, ...claimScope.params,
    ])[0];

    const beforeRange = fromDate
      ? this.db.query<{ purchases: number; payments: number; returns: number; claims: number }>(`
        SELECT
          COALESCE((SELECT SUM(pi.total_amount) FROM purchase_invoices pi WHERE pi.supplier_id = ? AND pi.date < ? AND ${invoiceScope.clause}), 0) AS purchases,
          COALESCE((SELECT SUM(sp.amount) FROM supplier_payments sp WHERE sp.supplier_id = ? AND sp.date < ? AND ${paymentScope.clause}), 0) AS payments,
          COALESCE((SELECT SUM(pr.total_amount) FROM purchase_returns pr
            LEFT JOIN purchase_invoices pi ON pi.id = pr.original_purchase_id
            LEFT JOIN warehouses w ON w.id = pr.warehouse_id
            WHERE pr.supplier_id = ? AND pr.date < ? AND ${returnScope.clause}), 0) AS returns,
          COALESCE((SELECT SUM(agreed_amount) FROM supplier_claims WHERE supplier_id = ? AND status = 'SETTLED' AND resolution_type = 'DEBIT_NOTE' AND date < ? AND ${claimScope.clause}), 0) AS claims
      `, [
        supplierId, fromDate, ...invoiceScope.params,
        supplierId, fromDate, ...paymentScope.params,
        supplierId, fromDate, ...returnScope.params,
        supplierId, fromDate, ...claimScope.params,
      ])[0]
      : { purchases: 0, payments: 0, returns: 0, claims: 0 };

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
      })),
      ...returns.map(r => ({
        id: r.id,
        date: r.date,
        type: 'RETURN' as const,
        docNumber: r.docNumber,
        description: `مرتجع مشتريات رقم ${r.docNumber} (${r.reason || ''})`,
        debit: r.debit,
        credit: 0,
        createdAt: r.createdAt
      })),
      ...claims.map(c => ({
        id: c.id,
        date: c.date,
        type: 'DEBIT_NOTE' as const,
        docNumber: c.docNumber,
        description: `إشعار مدين / تسوية مطالبة مورد رقم ${c.docNumber}`,
        debit: c.debit,
        credit: 0,
        createdAt: c.createdAt
      }))
    ];

    allRecords.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    const totalDebits = Number(totals?.payments || 0) + Number(totals?.returns || 0) + Number(totals?.claims || 0);
    const historicalOpening = Number(sup.currentBalance || 0) -
      (Number(totals?.purchases || 0) - totalDebits);

    const beforeDebits = Number(beforeRange.payments || 0) + Number(beforeRange.returns || 0) + Number(beforeRange.claims || 0);
    let runningBalance = historicalOpening +
      Number(beforeRange.purchases || 0) - beforeDebits;

    const finalStatement = allRecords.map(item => {
      runningBalance += (item.credit - item.debit);
      return {
        ...item,
        balanceAfter: Number(runningBalance.toFixed(2))
      };
    });

    return {
      supplier: sup,
      openingBalance: Number((historicalOpening + Number(beforeRange.purchases || 0) - beforeDebits).toFixed(2)),
      closingBalance: Number(runningBalance.toFixed(2)),
      transactions: finalStatement
    };
  }

  public getInvoicesWithAllocations(supplierId: string) {
    const invoiceScope = this.branchAccess.sqlScope(
      'pi.branch_id',
      '(SELECT w.branch_id FROM warehouses w WHERE w.id = pi.warehouse_id)',
    );
    const invoices = this.db.query<any>(`
      SELECT pi.id, pi.invoice_number, pi.supplier_invoice_number, pi.date, pi.total_amount,
             pi.paid_amount, pi.remaining_amount, pi.payment_status
      FROM purchase_invoices pi
      WHERE pi.supplier_id = ? AND ${invoiceScope.clause}
      ORDER BY pi.date DESC, pi.created_at DESC
    `, [supplierId, ...invoiceScope.params]);

    return invoices.map(inv => {
      const allocations = this.db.query<any>(`
        SELECT a.id, a.amount, sp.receipt_number AS receiptNumber, sp.date AS paymentDate, sp.payment_type AS paymentType
        FROM supplier_payment_allocations a
        JOIN supplier_payments sp ON sp.id = a.payment_id
        WHERE a.purchase_invoice_id = ?
        ORDER BY sp.date DESC
      `, [inv.id]);
      return {
        ...inv,
        allocations
      };
    });
  }

  public getPaymentsWithAllocations(supplierId: string) {
    const paymentScope = this.branchAccess.sqlScope(
      'sp.branch_id',
      '(SELECT cr.branch_id FROM cash_registers cr WHERE cr.id = sp.register_id)',
    );
    const payments = this.db.query<any>(`
      SELECT sp.id, sp.receipt_number, sp.date, sp.amount, sp.payment_type, sp.notes
      FROM supplier_payments sp
      WHERE sp.supplier_id = ? AND ${paymentScope.clause}
      ORDER BY sp.date DESC, sp.created_at DESC
    `, [supplierId, ...paymentScope.params]);

    return payments.map(pay => {
      const allocations = this.db.query<any>(`
        SELECT a.id, a.amount, pi.invoice_number AS invoiceNumber, pi.date AS invoiceDate, pi.total_amount AS invoiceTotal
        FROM supplier_payment_allocations a
        JOIN purchase_invoices pi ON pi.id = a.purchase_invoice_id
        WHERE a.payment_id = ?
      `, [pay.id]);
      const totalAllocated = allocations.reduce((sum: number, a: any) => sum + Number(a.amount), 0);
      return {
        ...pay,
        allocatedAmount: totalAllocated,
        unallocatedAmount: Math.max(0, Number(pay.amount) - totalAllocated),
        allocations
      };
    });
  }

  public reallocateSupplierPayment(paymentId: string, allocations: { purchaseInvoiceId: string; amount: number }[]) {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'suppliers.payment');

    const payment = this.db.query<any>(`SELECT * FROM supplier_payments WHERE id = ?`, [paymentId])[0];
    if (!payment) throw new Error('سند الصرف غير موجود.');

    const totalAlloc = allocations.reduce((s, a) => s + Number(a.amount || 0), 0);
    if (totalAlloc > Number(payment.amount) + 0.01) {
      throw new Error(`مجموع التوزيعات (${totalAlloc} ج) يتجاوز قيمة السند (${payment.amount} ج).`);
    }

    this.db.executeTransaction((db) => {
      // 1. Remove previous allocations for this payment and revert invoice paid amounts
      const oldAllocations = db.query<any>(`SELECT purchase_invoice_id, amount FROM supplier_payment_allocations WHERE payment_id = ?`, [paymentId]);
      for (const old of oldAllocations) {
        db.run(`
          UPDATE purchase_invoices
          SET paid_amount = MAX(0, paid_amount - ?),
              remaining_amount = total_amount - MAX(0, paid_amount - ?),
              payment_status = CASE WHEN total_amount - MAX(0, paid_amount - ?) <= 0.01 THEN 'PAID' ELSE 'PARTIAL' END
          WHERE id = ?
        `, [old.amount, old.amount, old.amount, old.purchase_invoice_id]);
      }
      db.run(`DELETE FROM supplier_payment_allocations WHERE payment_id = ?`, [paymentId]);

      // 2. Insert new allocations and update invoices
      for (const item of allocations) {
        const val = Math.round(Number(item.amount) * 100) / 100;
        if (val <= 0) continue;
        db.run(`
          INSERT INTO supplier_payment_allocations (id, payment_id, purchase_invoice_id, amount)
          VALUES (?, ?, ?, ?)
        `, [`spa_${uuidv4().substring(0, 8)}`, paymentId, item.purchaseInvoiceId, val]);

        db.run(`
          UPDATE purchase_invoices
          SET paid_amount = paid_amount + ?,
              remaining_amount = MAX(0, total_amount - (paid_amount + ?)),
              payment_status = CASE WHEN MAX(0, total_amount - (paid_amount + ?)) <= 0.01 THEN 'PAID' ELSE 'PARTIAL' END
          WHERE id = ?
        `, [val, val, val, item.purchaseInvoiceId]);
      }
    });
  }
}
