import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { localDateString } from '../../../utils/shared/date';
import { paymentAccountCode, postLedgerEntry, reverseLedgerEntry } from '../../../database/repositories/ledger';
import { round2 } from '../finance/financials';
import { BusinessRecordSyncService } from '../../../sync/BusinessRecordSyncService';
import { defaultEffectEngine } from '../effects/EffectEngine';
import type { Effect } from '../../../types/effects';
import '../effects/handlers/salesInvoiceHandlers';
import type { CustomerPayment, PaymentType } from '../../../types';
import type { SalesContext } from './context';
import { getActiveBankAccount, updateBankBalance } from './paymentAccounts';
import { CashShiftPolicyService } from '../finance/CashShiftPolicyService';

export type InvoicePaymentComponent = {
  paymentType: Exclude<PaymentType, 'CREDIT' | 'MIXED'>;
  amount: number;
  bankAccountId?: string;
};

function assertCollectionPaymentType(paymentType: PaymentType): asserts paymentType is InvoicePaymentComponent['paymentType'] {
  if (paymentType === 'CREDIT') throw new Error('لا يمكن تسجيل الآجل كتحصيل فعلي.');
  if (paymentType === 'MIXED') throw new Error('استخدم مسار مكونات التحصيل المختلط لتسجيل كل وسيلة على حدة.');
  if (!['CASH', 'CARD', 'BANK_TRANSFER', 'CHEQUE'].includes(paymentType)) {
    throw new Error(`وسيلة التحصيل غير مدعومة: ${String(paymentType)}.`);
  }
}

function validatePaymentDate(date: string, label: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ||
      new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    throw new Error(label);
  }
}

/** Collect a payment against an unpaid/partially-paid invoice (brief §68/§220). */
export function recordInvoicePaymentEntry(
  ctx: SalesContext,
  invoiceId: string,
  amount: number,
  paymentType: PaymentType = 'CASH',
  registerId?: string,
  shiftId?: string,
  notes = '',
  idempotencyKey?: string,
  paymentDate?: string,
  bankAccountId?: string
): CustomerPayment {
  assertCollectionPaymentType(paymentType);
  const actor = AuthService.requireAuth();
  PermissionService.require(actor, 'ui.customers.detail.payment');
  const invoice = ctx.getInvoiceById(invoiceId);
  if (!invoice) throw new Error('الفاتورة غير موجودة.');
  if (invoice.invoiceStatus === 'VOID') throw new Error('لا يمكن التحصيل على فاتورة ملغاة.');
  if (invoice.remainingAmount <= 0) throw new Error('الفاتورة مسددة بالكامل بالفعل.');
  const invoiceBranchId = invoice.branchId || ctx.branchAccess.requireWarehouseAccess(invoice.warehouseId, actor);

  const requestedAmount = Number(amount);
  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) throw new Error('يجب أن يكون مبلغ التحصيل أكبر من الصفر.');
  const value = round2(requestedAmount);
  if (value - round2(invoice.remainingAmount) > 0.009) {
    throw new Error(`مبلغ التحصيل (${value.toFixed(2)}) يتجاوز المتبقي على الفاتورة (${round2(invoice.remainingAmount).toFixed(2)}).`);
  }

  const today = paymentDate || localDateString();
  validatePaymentDate(today, 'تاريخ التحصيل غير صحيح.');
  const paymentId = `cpay_${uuidv4().substring(0, 8)}`;
  const shiftContext = new CashShiftPolicyService().resolve(invoiceBranchId, {
    registerId,
    shiftId,
    required: paymentType === 'CASH',
  });
  const register = registerId || shiftContext.registerId || ctx.branchAccess.getDefaultRegisterId(invoiceBranchId, actor);
  const branchId = ctx.branchAccess.requireRegisterAccess(register, actor, invoiceBranchId);
  const resolvedShiftId = shiftContext.shiftId;

  return ctx.db.executeTransaction((db) => {
    if (idempotencyKey) {
      const prior = db.query<CustomerPayment>(
        `SELECT * FROM customer_payments WHERE idempotency_key = ?`,
        [idempotencyKey]
      )[0];
      if (prior) {
        if (prior.invoiceId !== invoiceId || round2(Number(prior.amount)) !== value || prior.paymentType !== paymentType ||
            ((prior as any).bankAccountId || null) !== (bankAccountId || null)) {
          throw new Error('The idempotency key was already used for a different payment.');
        }
        return prior;
      }
    }
    const currentInvoice = db.query<{
      id: string; customerId: string; invoiceNumber: string; paidAmount: number;
      remainingAmount: number; invoiceStatus: string;
    }>(`SELECT id, customer_id AS customerId, invoice_number AS invoiceNumber,
               paid_amount AS paidAmount, remaining_amount AS remainingAmount,
               invoice_status AS invoiceStatus
        FROM sales_invoices WHERE id = ?`, [invoiceId])[0];
    if (!currentInvoice || currentInvoice.invoiceStatus === 'VOID') throw new Error('الفاتورة غير متاحة للتحصيل.');
    if (Number(currentInvoice.remainingAmount) <= 0) throw new Error('الفاتورة مسددة بالكامل بالفعل.');
    if (value - round2(Number(currentInvoice.remainingAmount)) > 0.009) {
      throw new Error(`مبلغ التحصيل (${value.toFixed(2)}) يتجاوز المتبقي على الفاتورة (${round2(Number(currentInvoice.remainingAmount)).toFixed(2)}).`);
    }
    const receiptNumber = db.nextNumber('REC');
    const newPaid = round2(Number(currentInvoice.paidAmount) + value);
    const newRemaining = round2(Math.max(0, Number(currentInvoice.remainingAmount) - value));
    const status = newRemaining <= 0 ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'UNPAID';
    db.run(
      `INSERT INTO customer_payments (
         id, receipt_number, customer_id, invoice_id, amount, payment_type, date, branch_id,
         register_id, shift_id, notes, performed_by, idempotency_key, bank_account_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        paymentId, receiptNumber, currentInvoice.customerId, invoiceId, value, paymentType, today, branchId,
        register, resolvedShiftId || null,
        notes || `تحصيل دفعة على الفاتورة ${currentInvoice.invoiceNumber}`,
        actor.id,
        idempotencyKey || null,
        bankAccountId || null,
      ]
    );
    db.run(`INSERT INTO customer_payment_allocations (id,payment_id,sales_invoice_id,amount) VALUES (?,?,?,?)`,
      [`cpa_${uuidv4().substring(0, 8)}`, paymentId, invoiceId, value]);

    db.run(
      `UPDATE customers SET current_balance = current_balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [value, currentInvoice.customerId]
    );

    db.run(
      `UPDATE sales_invoices SET paid_amount = ?, remaining_amount = ?, payment_status = ?,
       updated_at = CURRENT_TIMESTAMP WHERE id = ? AND invoice_status != 'VOID'
       AND remaining_amount >= ?`,
      [newPaid, newRemaining, status, invoiceId, value]
    );
    if (db.getDatabase().getRowsModified() !== 1) throw new Error('تغير رصيد الفاتورة أثناء التحصيل؛ أعد المحاولة.');

    if (paymentType === 'CASH') {
      db.run(`UPDATE cash_registers SET current_balance = current_balance + ? WHERE id = ?`, [value, register]);
    }
    const bank = paymentType === 'BANK_TRANSFER' ? getActiveBankAccount(db, bankAccountId) : null;
    if (bank) updateBankBalance(db, bank.id, value);
    const effects: Effect[] = [
      {
        type: 'ledger.post',
        payload: {
          aggregateType: 'customer_payment',
          aggregateId: paymentId,
          data: {
            date: today,
            description: `Customer receipt ${receiptNumber}`,
            referenceType: 'CUSTOMER_PAYMENT',
            referenceId: paymentId,
            createdBy: actor.id,
            lines: [
              { accountCode: bank?.glAccountCode || paymentAccountCode(paymentType), debit: value, credit: 0 },
              { accountCode: '1103', debit: 0, credit: value },
            ],
          },
        },
      },
      {
        type: 'audit.log',
        payload: {
          aggregateType: 'customer_payment',
          aggregateId: paymentId,
          data: { recordId: invoiceId, action: 'تحصيل دفعة على فاتورة', module: 'SALES', newValues: { receiptNumber, invoiceNumber: invoice.invoiceNumber, amount: value, paymentType } },
        },
      },
      {
        type: 'sync.capture',
        payload: { aggregateType: 'customer_payment', aggregateId: paymentId, data: { operation: 'CREATE' } },
      },
    ];
    defaultEffectEngine.run({ db, actorId: actor.id, actorName: actor.fullName }, effects);

    if (paymentType === 'CASH' && resolvedShiftId) {
      db.run(`UPDATE cash_shifts SET total_customer_payments = total_customer_payments + ? WHERE id = ?`, [value, resolvedShiftId]);
    }

    return {
      id: paymentId,
      receiptNumber,
      customerId: invoice.customerId,
      branchId,
      amount: value,
      paymentType,
      date: today,
      registerId: register,
      shiftId: resolvedShiftId,
      notes,
      performedBy: actor.id,
      createdAt: new Date().toISOString(),
    };
  });
}

/** Record a mixed invoice collection as individually posted tender receipts atomically. */
export function recordInvoicePaymentComponentsEntry(
  ctx: SalesContext,
  invoiceId: string,
  components: InvoicePaymentComponent[],
  registerId?: string,
  shiftId?: string,
  notes = '',
  idempotencyKey?: string,
  paymentDate?: string,
): CustomerPayment[] {
  if (!Array.isArray(components) || components.length < 2) {
    throw new Error('يتطلب التحصيل المختلط وسيلتي دفع منفصلتين على الأقل.');
  }
  for (const component of components) {
    assertCollectionPaymentType(component?.paymentType as PaymentType);
    if (!Number.isFinite(component.amount) || component.amount <= 0) {
      throw new Error('يجب أن يكون مبلغ كل مكوّن دفع أكبر من صفر.');
    }
  }
  return ctx.db.executeTransaction(() => components.map((component, index) =>
    recordInvoicePaymentEntry(
      ctx,
      invoiceId,
      component.amount,
      component.paymentType,
      registerId,
      shiftId,
      notes,
      idempotencyKey ? `${idempotencyKey}:tender:${index}` : undefined,
      paymentDate,
      component.bankAccountId,
    )
  ));
}

/** Record one receipt allocated across several open invoices in one transaction. */
export function recordCustomerPaymentAllocationsEntry(
  ctx: SalesContext,
  customerId: string,
  allocations: Array<{ invoiceId: string; amount: number }>,
  paymentType: PaymentType = 'CASH',
  registerId?: string,
  date = localDateString(),
  reference = '',
  notes = '',
  shiftId?: string,
  idempotencyKey?: string,
  bankAccountId?: string,
): { groupId: string; total: number; receipts: string[] } {
  assertCollectionPaymentType(paymentType);
  const actor = AuthService.requireAuth();
  PermissionService.require(actor, 'ui.customers.detail.payment');
  validatePaymentDate(date, 'تاريخ الدفعة غير صحيح.');
  const entries = allocations.filter((a) => Number(a.amount) > 0)
    .map((a) => ({ invoiceId: a.invoiceId, amount: round2(Number(a.amount)) }))
    .sort((a, b) => a.invoiceId.localeCompare(b.invoiceId));
  if (!entries.length || new Set(entries.map((a) => a.invoiceId)).size !== entries.length) throw new Error('حدد فواتير ومبالغ صحيحة دون تكرار.');
  let branchId: string | undefined;
  for (const entry of entries) {
    const invoice = ctx.getInvoiceById(entry.invoiceId);
    if (!invoice) throw new Error('تتضمن الدفعة فاتورة غير موجودة أو خارج نطاق الفروع المصرح به.');
    const invoiceBranchId = invoice.branchId || ctx.branchAccess.requireWarehouseAccess(invoice.warehouseId, actor);
    if (branchId && invoiceBranchId !== branchId) throw new Error('لا يمكن توزيع سند واحد على فواتير من فروع مختلفة.');
    branchId = invoiceBranchId;
  }
  if (!branchId) throw new Error('تعذر تحديد فرع الدفعة.');
  const shiftContext = new CashShiftPolicyService().resolve(branchId, {
    registerId,
    shiftId,
    required: paymentType === 'CASH',
  });
  const resolvedRegisterId = registerId || shiftContext.registerId || ctx.branchAccess.getDefaultRegisterId(branchId, actor);
  ctx.branchAccess.requireRegisterAccess(resolvedRegisterId, actor, branchId);
  const resolvedShiftId = shiftContext.shiftId;
  const groupId = idempotencyKey || `cpgrp_${uuidv4().slice(0, 10)}`;
  return ctx.db.executeTransaction((db) => {
    const prior = db.query<{
      receiptNumber: string; amount: number; branchId: string; customerId: string;
      invoiceId: string | null; paymentType: PaymentType; date: string;
      registerId: string | null; shiftId: string | null; notes: string | null;
      bankAccountId: string | null;
    }>(
      `SELECT receipt_number AS receiptNumber, amount, branch_id AS branchId,
              customer_id AS customerId, invoice_id AS invoiceId, payment_type AS paymentType,
              date, register_id AS registerId, shift_id AS shiftId, notes, bank_account_id AS bankAccountId
       FROM customer_payments WHERE payment_group_id = ? ORDER BY created_at`,
      [groupId]
    );
    if (prior.length) {
      const expectedNotes = [reference ? `مرجع: ${reference}` : '', notes, `دفعة مجمعة ${groupId}`].filter(Boolean).join(' | ');
      const priorAllocations = prior
        .map((row) => ({ invoiceId: row.invoiceId || '', amount: round2(Number(row.amount)) }))
        .sort((a, b) => a.invoiceId.localeCompare(b.invoiceId));
      const requestMatches = prior.every((row) =>
        row.branchId === branchId && row.customerId === customerId && row.paymentType === paymentType &&
        row.date === date && row.registerId === resolvedRegisterId && (row.shiftId || null) === (resolvedShiftId || null) &&
        (row.bankAccountId || null) === (bankAccountId || null) &&
        row.notes === expectedNotes
      ) && priorAllocations.length === entries.length && priorAllocations.every((row, index) =>
        row.invoiceId === entries[index].invoiceId && row.amount === entries[index].amount
      );
      if (!requestMatches) throw new Error('The idempotency key was already used for a different customer payment request.');
      return { groupId, total: round2(prior.reduce((sum,row)=>sum+Number(row.amount),0)), receipts: prior.map(row=>row.receiptNumber) };
    }
    const customer = db.query<{ id: string }>('SELECT id FROM customers WHERE id=?', [customerId])[0];
    if (!customer) throw new Error('العميل غير موجود.');
    const receipts: string[] = [];
    let total = 0;
    for (const allocation of entries) {
      const invoice = db.query<any>(`SELECT id,invoice_number AS invoiceNumber,customer_id AS customerId,paid_amount AS paidAmount,remaining_amount AS remainingAmount,invoice_status AS invoiceStatus FROM sales_invoices WHERE id=?`, [allocation.invoiceId])[0];
      const amount = round2(Number(allocation.amount));
      if (!invoice || invoice.customerId !== customerId || invoice.invoiceStatus === 'VOID') throw new Error('إحدى الفواتير المحددة غير صالحة لهذا العميل.');
      if (amount <= 0 || amount > Number(invoice.remainingAmount) + 0.009) throw new Error(`المبلغ يتجاوز المتبقي في الفاتورة ${invoice.invoiceNumber}.`);
      const receiptNumber = db.nextNumber('REC');
      const newPaid = round2(Number(invoice.paidAmount) + amount);
      const remaining = round2(Math.max(0, Number(invoice.remainingAmount) - amount));
      const paymentNotes = [reference ? `مرجع: ${reference}` : '', notes, `دفعة مجمعة ${groupId}`].filter(Boolean).join(' | ');
      const paymentId = `cpay_${uuidv4().slice(0, 8)}`;
      db.run(`INSERT INTO customer_payments (id,receipt_number,customer_id,invoice_id,amount,payment_group_id,payment_type,date,register_id,shift_id,branch_id,notes,performed_by,bank_account_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [paymentId, receiptNumber, customerId, allocation.invoiceId, amount, groupId, paymentType, date, resolvedRegisterId, resolvedShiftId || null, branchId, paymentNotes, actor.id, bankAccountId || null]);
      db.run(`INSERT INTO customer_payment_allocations (id,payment_id,sales_invoice_id,amount) VALUES (?,?,?,?)`,
        [`cpa_${uuidv4().substring(0, 8)}`, paymentId, allocation.invoiceId, amount]);
      db.run(`UPDATE sales_invoices SET paid_amount=?,remaining_amount=?,payment_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [newPaid, remaining, remaining <= 0 ? 'PAID' : 'PARTIAL', allocation.invoiceId]);
      new BusinessRecordSyncService(db).capture(db, 'customer_payment', paymentId, 'CREATE');
      receipts.push(receiptNumber); total = round2(total + amount);
    }
    db.run(`UPDATE customers SET current_balance=current_balance-?,updated_at=CURRENT_TIMESTAMP WHERE id=?`, [total, customerId]);
    if (paymentType === 'CASH') db.run(`UPDATE cash_registers SET current_balance=current_balance+? WHERE id=?`, [total, resolvedRegisterId]);
    const bank = paymentType === 'BANK_TRANSFER' ? getActiveBankAccount(db, bankAccountId) : null;
    if (bank) updateBankBalance(db, bank.id, total);
    postLedgerEntry(db.getDatabase(), {
      date,
      description: `Customer receipt group ${groupId}`,
      referenceType: 'CUSTOMER_PAYMENT_GROUP',
      referenceId: groupId,
      createdBy: actor.id,
      lines: [
        { accountCode: bank?.glAccountCode || paymentAccountCode(paymentType), debit: total, credit: 0 },
        { accountCode: '1103', debit: 0, credit: total },
      ],
    });
    if (paymentType === 'CASH' && resolvedShiftId) db.run(`UPDATE cash_shifts SET total_customer_payments=total_customer_payments+? WHERE id=?`, [total, resolvedShiftId]);
    db.run(`INSERT INTO audit_logs (id,user_id,user_name,action,module,record_id,new_values) VALUES (?,?,?,?,?,?,?)`,
      [`aud_${uuidv4().slice(0, 8)}`, actor.id, actor.fullName, 'تحصيل دفعة موزعة على فواتير', 'SALES', groupId, JSON.stringify({ customerId, allocations: entries, total, date, reference, receipts })]);
    return { groupId, total, receipts };
  });
}

function assertPaymentIsNotInstallmentLinked(ctx: SalesContext, paymentId: string, invoiceId: string): void {
  const protectedPayment = ctx.db.query<any>(
    'SELECT COUNT(*) AS count FROM installments WHERE payment_id=?',
    [paymentId]
  )[0]?.count || 0;
  const linkedPlan = ctx.db.query<any>(
    `SELECT COUNT(*) AS count FROM installment_plans WHERE invoice_id=? AND status!='CANCELLED'`,
    [invoiceId]
  )[0]?.count || 0;
  if (protectedPayment || linkedPlan) {
    throw new Error('This receipt belongs to an installment plan. Reverse the plan payment from the installments screen.');
  }
}

function validatePaymentGroup(ctx: SalesContext, group: any[]): void {
  for (const row of group) {
    if (row.invoiceId && !ctx.getInvoiceById(row.invoiceId)) {
      throw new Error('تتضمن الدفعة فاتورة خارج نطاق الفروع المصرح به.');
    }
    assertPaymentIsNotInstallmentLinked(ctx, row.id, row.invoiceId);
  }
}

function reversePaymentGroup(ctx: SalesContext, payment: any, group: any[], actor: ReturnType<typeof AuthService.requireAuth>): void {
  ctx.db.executeTransaction((db) => {
    const groupEntry = db.getDatabase().exec(
      `SELECT id FROM journal_entries WHERE reference_type='CUSTOMER_PAYMENT_GROUP' AND reference_id=?`,
      [payment.paymentGroupId]
    )[0]?.values[0]?.[0];
    if (groupEntry) reverseLedgerEntry(db.getDatabase(), String(groupEntry), {
      date: localDateString(), description: `Reverse customer receipt group ${payment.paymentGroupId}`,
      referenceType: 'CUSTOMER_PAYMENT_GROUP_VOID', referenceId: `${payment.paymentGroupId}:${uuidv4()}`, createdBy: actor.id,
    });
    for (const row of group) {
      const paymentEntry = db.getDatabase().exec(
        `SELECT id FROM journal_entries WHERE reference_type='CUSTOMER_PAYMENT' AND reference_id=?`,
        [row.id]
      )[0]?.values[0]?.[0];
      if (paymentEntry) reverseLedgerEntry(db.getDatabase(), String(paymentEntry), {
        date: localDateString(), description: `Reverse customer receipt ${row.receiptNumber}`,
        referenceType: 'CUSTOMER_PAYMENT_VOID', referenceId: `${row.id}:${uuidv4()}`, createdBy: actor.id,
      });
      const invoice = db.query<any>(
        `SELECT id,customer_id,paid_amount,total_amount,remaining_amount,invoice_status FROM sales_invoices WHERE id=?`,
        [row.invoiceId]
      )[0];
      if (!invoice || invoice.invoiceStatus === 'VOID') throw new Error('تعذر عكس الدفعة المرتبطة بفاتورة غير متاحة.');
      const value = round2(row.amount);
      const paid = round2(Math.max(0, invoice.paidAmount - value));
      const remaining = round2(Math.min(invoice.totalAmount, invoice.remainingAmount + value));
      db.run(
        `UPDATE sales_invoices SET paid_amount=?,remaining_amount=?,payment_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [paid, remaining, remaining <= 0 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID', invoice.id]
      );
      db.run(`UPDATE customers SET current_balance=current_balance+?,updated_at=CURRENT_TIMESTAMP WHERE id=?`, [value, invoice.customerId]);
      if (row.paymentType === 'CASH') {
        db.run(`UPDATE cash_registers SET current_balance=current_balance-? WHERE id=?`, [value, row.registerId || 'cr_main']);
      }
      if (row.paymentType === 'BANK_TRANSFER' && row.bankAccountId) {
        db.run('UPDATE bank_accounts SET current_balance=current_balance-? WHERE id=?', [value, row.bankAccountId]);
      }
      if (row.paymentType === 'CASH' && row.shiftId) {
        db.run(`UPDATE cash_shifts SET total_customer_payments=total_customer_payments-? WHERE id=?`, [value, row.shiftId]);
      }
    }
    db.run(`DELETE FROM customer_payments WHERE payment_group_id=?`, [payment.paymentGroupId]);
    db.run(
      `INSERT INTO audit_logs (id,user_id,user_name,action,module,record_id,old_values) VALUES (?,?,?,?,?,?,?)`,
      [`aud_${uuidv4().slice(0, 8)}`, actor.id, actor.fullName, 'عكس دفعة موزعة على فواتير', 'SALES',
        payment.paymentGroupId, JSON.stringify(group.map(row => ({
          receiptNumber: row.receiptNumber, invoiceId: row.invoiceId, amount: row.amount,
        })))]
    );
  });
}

function reverseSingleInvoicePayment(
  ctx: SalesContext,
  payment: any,
  paymentId: string,
  invoice: NonNullable<ReturnType<SalesContext['getInvoiceById']>>,
  actor: ReturnType<typeof AuthService.requireAuth>
): void {
  const amount = round2(payment.amount);
  const newPaid = round2(Math.max(0, invoice.paidAmount - amount));
  const newRemaining = round2(Math.min(invoice.totalAmount, invoice.remainingAmount + amount));
  const status = newRemaining <= 0 ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'UNPAID';

  ctx.db.executeTransaction((db) => {
    const paymentEntry = db.getDatabase().exec(
      `SELECT id FROM journal_entries WHERE reference_type='CUSTOMER_PAYMENT' AND reference_id=?`,
      [paymentId]
    )[0]?.values[0]?.[0];
    if (paymentEntry) reverseLedgerEntry(db.getDatabase(), String(paymentEntry), {
      date: localDateString(), description: `Reverse customer receipt ${payment.receiptNumber}`,
      referenceType: 'CUSTOMER_PAYMENT_VOID', referenceId: `${paymentId}:${uuidv4()}`, createdBy: actor.id,
    });
    db.run(
      `UPDATE sales_invoices SET paid_amount = ?, remaining_amount = ?, payment_status = ?,
       updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [newPaid, newRemaining, status, invoice.id]
    );
    db.run(
      `UPDATE customers SET current_balance = current_balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [amount, invoice.customerId]
    );
    if (payment.paymentType === 'CASH') {
      db.run(`UPDATE cash_registers SET current_balance = current_balance - ? WHERE id = ?`, [amount, payment.registerId || 'cr_main']);
    }
    if (payment.paymentType === 'BANK_TRANSFER' && payment.bankAccountId) {
      db.run('UPDATE bank_accounts SET current_balance = current_balance - ? WHERE id = ?', [amount, payment.bankAccountId]);
    }
    if (payment.paymentType === 'CASH' && payment.shiftId) {
      db.run(`UPDATE cash_shifts SET total_customer_payments = total_customer_payments - ? WHERE id = ?`, [amount, payment.shiftId]);
    }
    db.run('DELETE FROM customer_payments WHERE id = ?', [paymentId]);
    db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, old_values, new_values)
       VALUES (?, ?, ?, 'حذف سند تحصيل', 'SALES', ?, ?, ?)`,
      [
        `aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, invoice.id,
        JSON.stringify({ receiptNumber: payment.receiptNumber, amount }),
        JSON.stringify({ invoiceNumber: invoice.invoiceNumber }),
      ]
    );
  });
}

export function deleteInvoicePaymentEntry(ctx: SalesContext, paymentId: string): void {
  const actor = AuthService.requireAuth();
  PermissionService.require(actor, 'customers.payment.reverse');
  const payment = ctx.db.query<any>(
    `SELECT id, receipt_number, invoice_id, customer_id, amount, payment_type, register_id, shift_id, payment_group_id, branch_id, bank_account_id AS bankAccountId
     FROM customer_payments WHERE id = ?`,
    [paymentId]
  )[0];
  if (!payment) throw new Error('سند القبض غير موجود.');
  ctx.branchAccess.requireBranchAccess(payment.branchId, actor);
  if (payment.registerId) ctx.branchAccess.requireRegisterAccess(payment.registerId, actor, payment.branchId);
  if (payment.invoiceId && !ctx.getInvoiceById(payment.invoiceId)) {
    throw new Error('الفاتورة غير موجودة أو خارج نطاق الفروع المصرح به.');
  }
  if (payment.paymentGroupId) {
    const group = ctx.db.query<any>(
      `SELECT * FROM customer_payments WHERE payment_group_id=? AND branch_id=?`,
      [payment.paymentGroupId, payment.branchId]
    );
    validatePaymentGroup(ctx, group);
    reversePaymentGroup(ctx, payment, group, actor);
    return;
  }
  if (!payment.invoiceId) throw new Error('هذا السند غير مرتبط بفاتورة بيع. احذفه من كشف حساب العميل.');
  assertPaymentIsNotInstallmentLinked(ctx, paymentId, payment.invoiceId);
  const invoice = ctx.getInvoiceById(payment.invoiceId);
  if (!invoice) throw new Error('فاتورة البيع غير موجودة.');
  if (invoice.invoiceStatus === 'VOID') throw new Error('لا يمكن حذف دفعة من فاتورة ملغاة.');
  reverseSingleInvoicePayment(ctx, payment, paymentId, invoice, actor);
}
