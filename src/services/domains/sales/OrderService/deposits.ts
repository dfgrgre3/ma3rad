import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../../database/repositories/databaseManager';
import { AuthService } from '../../auth/AuthService';
import { PermissionService } from '../../auth/PermissionService';
import type { BranchAccessService } from '../../auth/BranchAccessService';
import { round2 } from '../../finance/financials';
import type { PaymentType } from '../../../../types';
import { CashierService } from '../../finance/CashierService';
import { paymentAccountCode, postLedgerEntry } from '../../../../database/repositories/ledger';
import { localDateString } from '../../../../utils/shared/date';
import { getOrder } from './queries';
import { audit, logStatus } from './internals';
import type { Order, OrderStatus } from './types';

export function recordDeposit(
  db: DatabaseManager,
  access: BranchAccessService,
  id: string,
  amount: number,
  paymentType: PaymentType = 'CASH',
  notes?: string,
  bankAccountId?: string,
  idempotencyKey?: string,
): Order {
  const actor = AuthService.requireAuth();
  PermissionService.require(actor, 'orders.update');
  if (!['CASH', 'CARD', 'BANK_TRANSFER', 'CHEQUE'].includes(paymentType)) throw new Error('طريقة الدفع غير مدعومة لعربون الطلب.');
  const order = getOrder(db, access, id);
  if (!order) throw new Error('الطلب غير موجود.');
  if (['COMPLETED', 'CANCELLED'].includes(order.status) || order.billingStatus === 'INVOICED') {
    throw new Error('لا يمكن تسجيل عربون لطلب مكتمل أو ملغي.');
  }
  const deposit = round2(Number(amount));
  if (!Number.isFinite(deposit)) throw new Error('مبلغ العربون غير صحيح.');
  if (deposit <= 0) throw new Error('مبلغ العربون يجب أن يكون أكبر من صفر.');
  const cashier = new CashierService();
  const shift = cashier.getActiveShift(actor.id, order.branchId || undefined);
  if (shift && shift.status !== 'OPEN') throw new Error('وردية التحصيل مغلقة.');
  const registerId = shift?.registerId || access.getDefaultRegisterId(order.branchId || access.getCurrentBranchId(), actor);
  const date = localDateString();
  let cashAccount = paymentAccountCode(paymentType);
  if (paymentType === 'BANK_TRANSFER') {
    if (!bankAccountId) throw new Error('حدد الحساب البنكي الذي استقبل التحويل.');
    const bank = db.query<{ glAccountCode: string; branchId: string | null }>(`SELECT coa.code AS glAccountCode, ba.branch_id AS branchId FROM bank_accounts ba JOIN chart_of_accounts coa ON coa.id = ba.gl_account_id WHERE ba.id = ? AND ba.is_active = 1`, [bankAccountId])[0];
    if (!order.branchId || !bank || bank.branchId !== order.branchId) throw new Error('الحساب البنكي غير نشط أو لا يتبع لفرع الطلب.');
    cashAccount = bank.glAccountCode;
  }

  return db.executeTransaction((tx) => {
    if (idempotencyKey) {
      const prior = tx.query<{ orderId: string; amount: number; paymentMethod: string; bankAccountId: string | null }>(
        `SELECT od.order_id AS orderId, od.amount / 100.0 AS amount, od.payment_method AS paymentMethod,
                od.bank_account_id AS bankAccountId
         FROM order_deposits od JOIN customer_payments cp ON cp.id = od.receipt_id
         WHERE cp.idempotency_key = ?`, [idempotencyKey]
      )[0];
      if (prior) {
        if (prior.orderId !== id || round2(Number(prior.amount)) !== deposit || prior.paymentMethod !== paymentType ||
            (prior.bankAccountId || null) !== (bankAccountId || null)) {
          throw new Error('The deposit idempotency key was already used for a different request.');
        }
        return getOrder(db, access, id)!;
      }
    }
    const current = tx.query<{ paidAmount: number; remainingAmount: number; totalAmount: number; status: OrderStatus; billingStatus: string; customerId: string; branchId: string | null }>(
      `SELECT paid_amount / 100.0 AS paidAmount, remaining_amount / 100.0 AS remainingAmount, total_amount / 100.0 AS totalAmount,
              status, billing_status AS billingStatus, customer_id AS customerId, branch_id AS branchId
       FROM orders WHERE id = ?`, [id]
    )[0];
    if (!current || ['COMPLETED', 'CANCELLED'].includes(current.status) || current.billingStatus === 'INVOICED') {
      throw new Error('Cannot record a deposit for a completed, cancelled, or invoiced order.');
    }
    const newPaid = round2(Number(current.paidAmount || 0) + deposit);
    const newRemaining = round2(Number(current.remainingAmount || 0) - deposit);
    if (deposit > Number(current.remainingAmount || 0) + 0.009 || newRemaining < -0.009) {
      throw new Error('Deposit exceeds the order balance.');
    }
    tx.run(
      `UPDATE orders SET paid_amount = ROUND(?*100), remaining_amount = ROUND(?*100), financial_status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status NOT IN ('COMPLETED', 'CANCELLED') AND billing_status != 'INVOICED'
         AND remaining_amount >= ROUND(?*100)`,
      [newPaid, Math.max(0, newRemaining), newPaid >= Number(current.totalAmount) - 0.009 ? 'PAID' : 'PARTIAL', id, deposit]
    );
    if (Number((tx.getDatabase() as any).getRowsModified?.() ?? 0) !== 1) {
      throw new Error('Order balance changed while recording the deposit; retry.');
    }
    const receiptId = `cpay_${uuidv4().substring(0, 8)}`;
    const receiptNumber = tx.nextNumber('REC');
    tx.run(`INSERT INTO customer_payments (id, receipt_number, customer_id, invoice_id, amount, payment_type, date, register_id, shift_id, notes, performed_by, branch_id, idempotency_key)
      VALUES (?, ?, ?, NULL, ROUND(?*100), ?, ?, ?, ?, ?, ?, ?, ?)`, [receiptId, receiptNumber, current.customerId, deposit, paymentType, date, registerId, shift?.id || null, notes || `عربون للطلب ${order.orderNumber}`, actor.id, current.branchId || null, idempotencyKey || null]);
    postLedgerEntry(tx.getDatabase(), {
      date, description: `Order deposit ${order.orderNumber} (${receiptNumber})`, referenceType: 'ORDER_DEPOSIT', referenceId: receiptId, createdBy: actor.id,
      branchId: current.branchId,
      lines: [{ accountCode: cashAccount, debit: deposit, credit: 0 }, { accountCode: '2106', debit: 0, credit: deposit }],
    });
    if (paymentType === 'CASH') tx.run('UPDATE cash_registers SET current_balance = current_balance + ROUND(?*100) WHERE id = ?', [deposit, registerId]);
    if (paymentType === 'BANK_TRANSFER' && bankAccountId) tx.run('UPDATE bank_accounts SET current_balance = current_balance + ROUND(?*100) WHERE id = ?', [deposit, bankAccountId]);
    if (shift) {
      if (paymentType === 'CASH') tx.run('UPDATE cash_shifts SET total_customer_payments = total_customer_payments + ROUND(?*100) WHERE id = ?', [deposit, shift.id]);
    }
    tx.run(`INSERT INTO order_deposits (id, deposit_number, order_id, customer_id, amount, payment_method, register_id, shift_id, receipt_id, bank_account_id, date, created_by)
      VALUES (?, ?, ?, ?, ROUND(?*100), ?, ?, ?, ?, ?, ?, ?)`, [receiptId, receiptNumber, id, current.customerId, deposit, paymentType, registerId, shift?.id || null, receiptId, bankAccountId || null, date, actor.id]);
    logStatus(
      tx, id, order.status, order.status,
      `سند قبض ${receiptNumber} بقيمة ${deposit} ج (${paymentType}) ${notes || ''}`.trim(),
      actor.id, actor.fullName
    );
    audit(tx, actor.id, actor.fullName, 'تسجيل عربون طلب', id, {
      orderNumber: order.orderNumber, receiptId, receiptNumber, deposit, totalPaid: newPaid, remaining: Math.max(0, newRemaining)
    });
    return getOrder(db, access, id)!;
  }, { immediatePersist: true });
}

export function refundDeposit(db: DatabaseManager, access: BranchAccessService, depositId: string, reason: string): string {
  const actor = AuthService.requireAuth();
  PermissionService.require(actor, 'sales.orders_deposits.manage');
  const cleanReason = String(reason || '').trim();
  if (!cleanReason) throw new Error('يجب تسجيل سبب رد العربون.');

  return db.executeTransaction((tx) => {
    const deposit = tx.query<{
      id: string; orderId: string; orderNumber: string; customerId: string; amount: number;
      paymentMethod: PaymentType; registerId: string | null; shiftId: string | null;
      bankAccountId: string | null; invoiceId: string | null; branchId: string | null;
      paidAmount: number; totalAmount: number;
    }>(
      `SELECT od.id, od.order_id AS orderId, o.order_number AS orderNumber,
              od.customer_id AS customerId, od.amount / 100.0 AS amount, od.payment_method AS paymentMethod,
              od.register_id AS registerId, od.shift_id AS shiftId, od.bank_account_id AS bankAccountId,
              od.invoice_id AS invoiceId, o.branch_id AS branchId,
              o.paid_amount / 100.0 AS paidAmount, o.total_amount / 100.0 AS totalAmount
       FROM order_deposits od JOIN orders o ON o.id = od.order_id WHERE od.id = ?`,
      [depositId]
    )[0];
    if (!deposit) throw new Error('عربون الطلب غير موجود.');
    if (!['CASH', 'CARD', 'BANK_TRANSFER', 'CHEQUE'].includes(deposit.paymentMethod)) {
      throw new Error('طريقة الدفع المسجلة لهذا العربون لا تدعم الرد من هذا المسار.');
    }
    const scopedOrder = getOrder(db, access, deposit.orderId);
    if (!scopedOrder) throw new Error('لا تملك صلاحية الوصول إلى هذا الطلب.');
    if (deposit.paymentMethod === 'CASH' && deposit.registerId) {
      access.requireRegisterAccess(deposit.registerId, actor, deposit.branchId || undefined);
    }
    if (deposit.invoiceId) throw new Error('تمت تسوية هذا العربون على فاتورة؛ يجب معالجة رد الفاتورة من مسار المرتجعات.');
    const refundedBefore = Number(tx.query<{ amount: number }>(
      'SELECT COALESCE(SUM(amount) / 100.0, 0) AS amount FROM order_deposit_refunds WHERE order_deposit_id = ?', [depositId]
    )[0]?.amount || 0);
    const amount = round2(Number(deposit.amount) - refundedBefore);
    const paidAmount = round2(Number(deposit.paidAmount));
    if (amount <= 0.009 || paidAmount + 0.009 < amount) throw new Error('رصيد العربون المتاح للرد غير كافٍ.');
    const refundRegisterId = deposit.paymentMethod === 'CASH' ? deposit.registerId : null;
    const refundShift = refundRegisterId ? tx.query<{ id: string }>(
      `SELECT id FROM cash_shifts WHERE register_id = ? AND status = 'OPEN' ORDER BY opened_at DESC LIMIT 1`,
      [refundRegisterId]
    )[0] : null;
    let cashAccount = paymentAccountCode(deposit.paymentMethod);
    if (deposit.paymentMethod === 'BANK_TRANSFER') {
      if (!deposit.bankAccountId) throw new Error('الحساب البنكي المرتبط بالعربون غير محدد.');
      const bank = tx.query<{ glAccountCode: string; branchId: string | null }>(
        `SELECT coa.code AS glAccountCode, ba.branch_id AS branchId FROM bank_accounts ba
         JOIN chart_of_accounts coa ON coa.id = ba.gl_account_id WHERE ba.id = ? AND ba.is_active = 1`,
        [deposit.bankAccountId]
      )[0];
      if (!deposit.branchId || !bank || bank.branchId !== deposit.branchId) throw new Error('الحساب البنكي غير نشط أو لا يتبع لفرع الطلب.');
      cashAccount = bank.glAccountCode;
    }

    const date = localDateString();
    const refundId = `odrf_${uuidv4().substring(0, 12)}`;
    const refundNumber = tx.nextNumber('ODR');
    tx.run(
      `INSERT INTO order_deposit_refunds
        (id, refund_number, order_deposit_id, order_id, customer_id, amount, payment_method,
         register_id, shift_id, bank_account_id, date, reason, created_by)
       VALUES (?, ?, ?, ?, ?, ROUND(?*100), ?, ?, ?, ?, ?, ?, ?)`,
      [refundId, refundNumber, deposit.id, deposit.orderId, deposit.customerId, amount,
        deposit.paymentMethod, refundRegisterId, refundShift?.id || null, deposit.bankAccountId, date, cleanReason, actor.id]
    );
    const newPaid = round2(paidAmount - amount);
    const normalizedPaid = Math.max(0, newPaid);
    const newRemaining = round2(Number(deposit.totalAmount) - normalizedPaid);
    tx.run(
      `UPDATE orders SET paid_amount = ROUND(?*100), remaining_amount = ROUND(?*100),
         financial_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [normalizedPaid, Math.max(0, newRemaining), normalizedPaid <= 0.009 ? 'UNPAID' : 'PARTIAL', deposit.orderId]
    );
    postLedgerEntry(tx.getDatabase(), {
      date, description: `Refund order deposit ${deposit.orderNumber} (${refundNumber})`,
      referenceType: 'ORDER_DEPOSIT_REFUND', referenceId: refundId, createdBy: actor.id, branchId: deposit.branchId,
      lines: [{ accountCode: '2106', debit: amount, credit: 0 }, { accountCode: cashAccount, debit: 0, credit: amount }],
    });
    if (deposit.paymentMethod === 'CASH') {
      if (!deposit.registerId) throw new Error('الصندوق المرتبط بالعربون غير محدد.');
      tx.run('UPDATE cash_registers SET current_balance = current_balance - ROUND(?*100) WHERE id = ?', [amount, deposit.registerId]);
      if (refundShift) tx.run('UPDATE cash_shifts SET total_refunds = total_refunds + ROUND(?*100) WHERE id = ?', [amount, refundShift.id]);
    } else if (deposit.paymentMethod === 'BANK_TRANSFER' && deposit.bankAccountId) {
      tx.run('UPDATE bank_accounts SET current_balance = current_balance - ROUND(?*100) WHERE id = ?', [amount, deposit.bankAccountId]);
    }
    logStatus(tx, deposit.orderId, scopedOrder.status, scopedOrder.status,
      `رد عربون ${deposit.orderNumber} بمبلغ ${amount}؛ السبب: ${cleanReason}`, actor.id, actor.fullName);
    tx.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
       VALUES (?, ?, ?, ?, 'SALES', ?, ?)`,
      [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, 'رد عربون طلب', deposit.orderId,
        JSON.stringify({ depositId, refundId, refundNumber, amount, paymentMethod: deposit.paymentMethod, reason: cleanReason })]
    );
    return refundId;
  }, { immediatePersist: true });
}
