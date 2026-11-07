import { DatabaseManager } from '../database/db';
import type { Supplier, SupplierPayment, PaymentType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { BranchAccessService } from './BranchAccessService';
import { localDateString } from '../utils/date';
import { paymentAccountCode, postLedgerEntry } from '../database/ledger';
import { MasterDataSyncService } from '../sync/MasterDataSyncService';
import { BusinessRecordSyncService } from '../sync/BusinessRecordSyncService';

export class SupplierService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();
  private sync = new MasterDataSyncService(this.db);

  public getAllSuppliers(search?: string, includeInactive = false): Supplier[] {
    this.requireSuppliersDirectory();
    return this.fetchSuppliers(search, includeInactive);
  }

  public getSupplierById(id: string): Supplier | null {
    this.requireSuppliersView();
    return this.readSupplier(id);
  }

  private requireSuppliersView(): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.suppliers.suppliers.view');
  }

  /** Supplier directory is also needed to record purchases, receipts and quotations. */
  private requireSuppliersDirectory(): void {
    const actor = AuthService.requireAuth();
    PermissionService.requireAny(actor, ['ui.suppliers.suppliers.view', 'purchases.create', 'purchases.view']);
  }

  /** Internal read used by mutations; public reads additionally require `suppliers.view`. */
  private readSupplier(id: string): Supplier | null {
    const scope = this.branchAccess.companyScope('company_id');
    const rows = this.db.query<Supplier>(`SELECT * FROM suppliers WHERE id = ? AND ${scope.clause}`, [id, ...scope.params]);
    return rows.length > 0 ? rows[0] : null;
  }

  private fetchSuppliers(search?: string, includeInactive = false): Supplier[] {
    const scope = this.branchAccess.companyScope('company_id');
    let sql = `SELECT * FROM suppliers`;
    const params: any[] = [];
    const conditions: string[] = [scope.clause];
    params.push(...scope.params);

    if (!includeInactive) conditions.push('is_active = 1');

    if (search && search.trim()) {
      conditions.push('(name LIKE ? OR company_name LIKE ? OR phone LIKE ? OR code LIKE ?)');
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }

    sql += ` WHERE ${conditions.join(' AND ')}`;
    sql += ` ORDER BY name ASC`;
    return this.db.query<Supplier>(sql, params);
  }

  public createSupplier(supplier: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt' | 'totalPurchases' | 'currentBalance'> & { initialBalance?: number }): Supplier {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.suppliers.suppliers.create');
    if (Number(supplier.initialBalance || 0) !== 0) PermissionService.require(actor, 'ui.finance.receivables.approve');
    const cleanName = String(supplier.name || '').trim();
    if (!cleanName) throw new Error('اسم المورد مطلوب.');
    if (!String(supplier.phone || '').trim()) throw new Error('رقم هاتف المورد مطلوب.');
    supplier.name = cleanName;
    const existing = this.db.query('SELECT id FROM suppliers WHERE name = ?', [cleanName]);
    if (existing.length > 0) throw new Error('اسم المورد مسجل مسبقاً.');
    const id = `sup_${uuidv4().substring(0, 8)}`;
    const code = supplier.code || `SUP-${Date.now().toString().slice(-5)}`;

    return this.db.executeTransaction((sqliteDb) => {
      sqliteDb.run(`
        INSERT INTO suppliers (
          id, code, name, company_name, phone, email, tax_number, commercial_record,
          address, current_balance, total_purchases, payment_terms_days, notes, company_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
      `, [
        id, code, supplier.name, supplier.companyName || null, supplier.phone,
        supplier.email || null, supplier.taxNumber || null, supplier.commercialRecord || null,
        supplier.address || null, supplier.initialBalance || 0, supplier.paymentTermsDays || 30,
        supplier.notes || null,
        (this.branchAccess.getAccessibleCompanyIds(actor) || ['cmp_main'])[0]
      ]);
      this.sync.capture(sqliteDb, 'supplier', id, 'CREATE');

      sqliteDb.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
        VALUES (?, ?, ?, 'إضافة مورد / مصنع جديد', 'SUPPLIERS', ?, ?)
      `, [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id, JSON.stringify(supplier)]);

      return this.readSupplier(id)!;
    });
  }

  public updateSupplier(id: string, updates: Partial<Supplier>): Supplier {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.suppliers.suppliers.update');
    if (updates.isActive !== undefined) PermissionService.require(actor, 'ui.suppliers.suppliers.delete');
    const existing = this.readSupplier(id);
    if (!existing) throw new Error('المورد غير موجود.');

    if (updates.name !== undefined) {
      const cleanName = String(updates.name || '').trim();
      if (!cleanName) throw new Error('اسم المورد مطلوب.');
      updates.name = cleanName;
      if (cleanName !== existing.name) {
        const dup = this.db.query('SELECT id FROM suppliers WHERE name = ? AND id != ?', [cleanName, id]);
        if (dup.length > 0) throw new Error('اسم المورد مسجل مسبقاً.');
      }
    }
    if (updates.phone !== undefined && !String(updates.phone || '').trim()) {
      throw new Error('رقم هاتف المورد مطلوب.');
    }

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
      this.sync.capture(sqliteDb, 'supplier', id, 'UPDATE');

      sqliteDb.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, old_values, new_values)
        VALUES (?, ?, ?, 'تعديل بيانات مورد', 'SUPPLIERS', ?, ?, ?)
      `, [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id, JSON.stringify(existing), JSON.stringify(updates)]);

      return this.readSupplier(id)!;
    });
  }

  public recordPayment(
    supplierId: string,
    amount: number,
    paymentType: PaymentType = 'CASH',
    registerId = 'cr_main',
    notes = '',
    idempotencyKey?: string,
    paymentDate?: string,
    invoiceId?: string
  ): SupplierPayment {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.suppliers.suppliers.payment');
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('يجب أن يكون مبلغ السداد أكبر من الصفر.');
    const branchId = this.branchAccess.requireRegisterAccess(registerId, actor);

    const sup = this.readSupplier(supplierId);
    if (!sup) throw new Error('المورد غير موجود.');
    if (invoiceId) {
      const invoice = this.db.query<{ supplierId: string; remainingAmount: number; branchId: string | null }>(`
        SELECT pi.supplier_id AS supplierId, pi.remaining_amount AS remainingAmount,
          COALESCE(pi.branch_id, w.branch_id) AS branchId
        FROM purchase_invoices pi JOIN warehouses w ON w.id = pi.warehouse_id
        WHERE pi.id = ?
      `, [invoiceId])[0];
      if (!invoice || invoice.supplierId !== supplierId || invoice.branchId !== branchId) {
        throw new Error('فاتورة المورد غير موجودة أو خارج نطاق صلاحية الفرع.');
      }
      if (!Number.isFinite(invoice.remainingAmount) || amount > Number(invoice.remainingAmount) + 0.009) {
        throw new Error('مبلغ السداد يتجاوز الرصيد المستحق على الفاتورة.');
      }
    }

    const paymentId = `spay_${uuidv4().substring(0, 8)}`;
    const today = paymentDate || localDateString();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || Number.isNaN(Date.parse(`${today}T00:00:00Z`)) ||
        new Date(`${today}T00:00:00Z`).toISOString().slice(0, 10) !== today) {
      throw new Error('تاريخ السداد غير صحيح.');
    }

    return this.db.executeTransaction((sqliteDb) => {
      if (idempotencyKey) {
        const prior = sqliteDb.query<any>(`SELECT * FROM supplier_payments WHERE idempotency_key = ?`, [idempotencyKey])[0];
        if (prior) {
          if (prior.supplierId !== supplierId || Number(prior.amount) !== amount ||
            prior.paymentType !== paymentType || (prior.registerId || 'cr_main') !== registerId ||
            (prior.notes || '') !== notes || prior.date !== today) {
            throw new Error('The supplier payment idempotency key was already used for a different request.');
          }
          return prior as SupplierPayment;
        }
      }
      const receiptNumber = sqliteDb.nextNumber('PAY');
      // 1. Insert Payment Receipt
      sqliteDb.run(`
        INSERT INTO supplier_payments (
          id, receipt_number, supplier_id, amount, idempotency_key, payment_type, date, register_id, branch_id, notes, performed_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [paymentId, receiptNumber, supplierId, amount, idempotencyKey || null, paymentType, today, registerId, branchId, notes, actor.id]);

      let unapplied = amount;
      const invoices = sqliteDb.query<any>(`
        SELECT id,paid_amount,remaining_amount FROM purchase_invoices
        WHERE supplier_id=? AND branch_id=? AND remaining_amount>0.009
        ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END, date, created_at, id
      `, [supplierId, branchId, invoiceId || '']);
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

      new BusinessRecordSyncService(sqliteDb).capture(sqliteDb, 'supplier_payment', paymentId, 'CREATE');

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
    this.requireSuppliersView();
    PermissionService.require(AuthService.requireAuth(), 'ui.finance.receivables.view');
    const sup = this.readSupplier(supplierId);
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

    allRecords.sort((a, b) =>
      String(a.date).localeCompare(String(b.date)) ||
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

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
    this.requireSuppliersView();
    PermissionService.require(AuthService.requireAuth(), 'ui.finance.receivables.view');
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
    this.requireSuppliersView();
    PermissionService.require(AuthService.requireAuth(), 'ui.finance.receivables.view');
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
        SELECT a.id, a.purchase_invoice_id AS purchaseInvoiceId, a.amount,
          pi.invoice_number AS invoiceNumber, pi.date AS invoiceDate, pi.total_amount AS invoiceTotal
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
    PermissionService.require(actor, 'ui.suppliers.suppliers.payment');
    PermissionService.require(actor, 'ui.finance.receivables.view');
    if (!Array.isArray(allocations)) throw new Error('قائمة التوزيعات غير صحيحة.');

    const requested = new Map<string, number>();
    const seenInvoices = new Set<string>();
    for (const item of allocations) {
      const invoiceId = String(item?.purchaseInvoiceId || '').trim();
      const amount = Number(item?.amount);
      if (!invoiceId || !Number.isFinite(amount) || amount < 0) {
        throw new Error('بيانات تخصيص الفاتورة غير صحيحة.');
      }
      if (seenInvoices.has(invoiceId)) throw new Error('لا يمكن إضافة الفاتورة نفسها أكثر من مرة في التوزيع.');
      seenInvoices.add(invoiceId);
      const cents = Math.round(amount * 100);
      if (cents > 0) requested.set(invoiceId, cents);
    }

    this.db.executeTransaction((db) => {
      const payment = db.query<any>(`
        SELECT sp.id, sp.supplier_id AS supplierId, sp.amount,
          COALESCE(sp.branch_id, cr.branch_id) AS effectiveBranchId
        FROM supplier_payments sp
        LEFT JOIN cash_registers cr ON cr.id = sp.register_id
        WHERE sp.id = ?
      `, [paymentId])[0];
      if (!payment) throw new Error('سند الصرف غير موجود.');
      if (!payment.effectiveBranchId) throw new Error('سند الصرف غير مرتبط بفرع.');
      this.branchAccess.requireBranchAccess(payment.effectiveBranchId, actor);

      const paymentCents = Math.round(Number(payment.amount) * 100);
      const requestedCents = [...requested.values()].reduce((sum, amount) => sum + amount, 0);
      if (!Number.isFinite(paymentCents) || paymentCents <= 0 || requestedCents > paymentCents) {
        throw new Error(`مجموع التوزيعات (${(requestedCents / 100).toFixed(2)} ج) يتجاوز قيمة السند (${payment.amount} ج).`);
      }

      const oldAllocations = db.query<any>(`
        SELECT purchase_invoice_id AS purchaseInvoiceId, amount
        FROM supplier_payment_allocations
        WHERE payment_id = ?
      `, [paymentId]);
      const priorByInvoice = new Map<string, number>();
      for (const old of oldAllocations) {
        const invoiceId = String(old.purchaseInvoiceId);
        const amountCents = Math.round(Number(old.amount) * 100);
        if (!invoiceId || !Number.isFinite(amountCents) || amountCents < 0) {
          throw new Error('تخصيص سابق غير صالح على سند الصرف.');
        }
        priorByInvoice.set(invoiceId, (priorByInvoice.get(invoiceId) || 0) + amountCents);
      }

      const invoiceStates = new Map<string, { paidCents: number; totalCents: number }>();
      for (const invoiceId of new Set([...priorByInvoice.keys(), ...requested.keys()])) {
        const invoice = db.query<any>(`
          SELECT pi.id, pi.supplier_id AS supplierId, pi.paid_amount AS paidAmount,
            pi.total_amount AS totalAmount, COALESCE(pi.branch_id, w.branch_id) AS effectiveBranchId
          FROM purchase_invoices pi
          LEFT JOIN warehouses w ON w.id = pi.warehouse_id
          WHERE pi.id = ?
        `, [invoiceId])[0];
        if (!invoice || invoice.supplierId !== payment.supplierId ||
            invoice.effectiveBranchId !== payment.effectiveBranchId) {
          throw new Error('الفاتورة غير تابعة لهذا المورد أو خارج نطاق فرع السند.');
        }
        const paidAmount = Number(invoice.paidAmount || 0);
        const totalAmount = Number(invoice.totalAmount || 0);
        if (!Number.isFinite(paidAmount) || !Number.isFinite(totalAmount) || paidAmount < 0 || totalAmount < 0) {
          throw new Error(`أرصدة الفاتورة ${invoiceId} غير صالحة.`);
        }
        const paidCents = Math.round(paidAmount * 100);
        const totalCents = Math.round(totalAmount * 100);
        const priorCents = priorByInvoice.get(invoiceId) || 0;
        const capacityCents = Math.max(0, totalCents - Math.max(0, paidCents - priorCents));
        const requestedAmountCents = requested.get(invoiceId) || 0;
        if (requestedAmountCents > capacityCents) {
          throw new Error(`التوزيع يتجاوز المتبقي المتاح على الفاتورة ${invoiceId}.`);
        }
        invoiceStates.set(invoiceId, { paidCents, totalCents });
      }

      db.run(`DELETE FROM supplier_payment_allocations WHERE payment_id = ?`, [paymentId]);
      for (const invoiceId of invoiceStates.keys()) {
        const state = invoiceStates.get(invoiceId)!;
        const adjustedPaidCents = Math.max(0, state.paidCents - (priorByInvoice.get(invoiceId) || 0))
          + (requested.get(invoiceId) || 0);
        const remainingCents = Math.max(0, state.totalCents - adjustedPaidCents);
        const paidAmount = adjustedPaidCents / 100;
        const remainingAmount = remainingCents / 100;
        db.run(`
          UPDATE purchase_invoices
          SET paid_amount = ?, remaining_amount = ?,
              payment_status = CASE WHEN ? <= 1 THEN 'PAID' ELSE 'PARTIAL' END
          WHERE id = ?
        `, [paidAmount, remainingAmount, remainingCents, invoiceId]);
      }

      for (const [invoiceId, amountCents] of requested) {
        db.run(`
          INSERT INTO supplier_payment_allocations (id, payment_id, purchase_invoice_id, amount)
          VALUES (?, ?, ?, ?)
        `, [`spa_${uuidv4().substring(0, 8)}`, paymentId, invoiceId, amountCents / 100]);
      }
    });
  }
}
