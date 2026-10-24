import { DatabaseManager } from '../database/db';
import { postLedgerEntry, paymentAccountCode, reverseLedgerEntry } from '../database/ledger';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { v4 as uuidv4 } from 'uuid';
import { localDateString } from '../utils/date';

function addLocalMonths(dateString: string, months: number): string {
  const [year, month, day] = dateString.split('-').map(Number);
  const targetMonth = month - 1 + months;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(targetYear, normalizedMonth + 1, 0).getDate();
  return localDateString(new Date(targetYear, normalizedMonth, Math.min(day, lastDay)));
}

export class InstallmentService {
  private db = DatabaseManager.getInstance();

  createPlan(input: { customerId: string; invoiceId: string; totalAmount: number; downPayment: number; installmentsCount: number; startDate: string }) {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'finance.installments.manage');
    const { customerId, invoiceId, totalAmount, downPayment, installmentsCount, startDate } = input;
    if (!this.db.query('SELECT id FROM customers WHERE id = ?', [customerId])[0]) throw new Error('Customer not found.');
    if (!Number.isFinite(totalAmount) || totalAmount <= 0 || !Number.isFinite(downPayment) || downPayment < 0 || downPayment > totalAmount) throw new Error('Check total and down payment amounts.');
    if (!Number.isInteger(installmentsCount) || installmentsCount < 1 || installmentsCount > 120) throw new Error('Installment count is invalid.');
    const financed = totalAmount - downPayment;
    if (financed <= 0) throw new Error('The financed amount must be greater than zero.');
    const parsedStartDate = new Date(`${startDate}T00:00:00`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || Number.isNaN(parsedStartDate.getTime()) || localDateString(parsedStartDate) !== startDate) throw new Error('Start date is invalid.');
    const monthlyAmount = Math.round((financed / installmentsCount) * 100) / 100;
    const planId = uuidv4();
    return this.db.executeTransaction((db) => {
      const invoice = db.query<any>(`SELECT id,customerId,invoiceNumber,remainingAmount,invoiceStatus FROM sales_invoices WHERE id=?`, [invoiceId])[0];
      if (!invoice || invoice.customerId !== customerId || invoice.invoiceStatus === 'VOID') throw new Error('Select a valid invoice for this customer.');
      if (Math.abs(Number(invoice.remainingAmount) - totalAmount) > 0.009 || Number(invoice.remainingAmount) <= 0) throw new Error('The invoice balance changed. Reload the invoice and try again.');
      const existingPlan = db.query<any>(`SELECT id FROM installment_plans WHERE invoice_id=? AND status IN ('ACTIVE','DEFAULTED') LIMIT 1`, [invoiceId])[0];
      if (existingPlan) throw new Error('This invoice already has an active installment plan.');
      let downPaymentId: string | null = null;
      let downPaymentReceipt: string | null = null;
      if (downPayment > 0) {
        const register = db.query<any>('SELECT id FROM cash_registers WHERE id=? AND is_active=1', ['cr_main'])[0];
        if (!register) throw new Error('The main cash register is unavailable for the down payment.');
        const shift = db.query<any>(`SELECT id FROM cash_shifts WHERE user_id=? AND register_id=? AND status='OPEN' ORDER BY opened_at DESC LIMIT 1`, [actor.id, register.id])[0];
        downPaymentId = uuidv4();
        downPaymentReceipt = db.nextNumber('RCP-INST-DP');
        const today = localDateString();
        db.run(`INSERT INTO customer_payments (id,receipt_number,customer_id,invoice_id,amount,payment_type,date,register_id,shift_id,notes,performed_by)
          VALUES (?,?,?,?,?,'CASH',?,?,?,?,?)`, [downPaymentId, downPaymentReceipt, customerId, invoiceId, downPayment, today, register.id, shift?.id || null, `Down payment for installment plan on ${invoice.invoiceNumber}`, actor.id]);
        db.run(`INSERT INTO customer_payment_allocations (id,payment_id,sales_invoice_id,amount) VALUES (?,?,?,?)`,
          [`cpa_${uuidv4().substring(0, 8)}`, downPaymentId, invoiceId, downPayment]);
        db.run(`UPDATE sales_invoices SET paid_amount=paid_amount+?,remaining_amount=MAX(0,remaining_amount-?),payment_status=CASE WHEN remaining_amount-?<=0 THEN 'PAID' ELSE 'PARTIAL' END,updated_at=CURRENT_TIMESTAMP WHERE id=?`, [downPayment, downPayment, downPayment, invoiceId]);
        db.run('UPDATE customers SET current_balance=current_balance-?,updated_at=CURRENT_TIMESTAMP WHERE id=?', [downPayment, customerId]);
        db.run('UPDATE cash_registers SET current_balance=current_balance+? WHERE id=?', [downPayment, register.id]);
        if (shift?.id) db.run('UPDATE cash_shifts SET total_customer_payments=total_customer_payments+? WHERE id=?', [downPayment, shift.id]);
        postLedgerEntry(db.getDatabase(), { date: today, description: `Installment plan down payment ${downPaymentReceipt}`, referenceType: 'CUSTOMER_PAYMENT', referenceId: downPaymentId, createdBy: actor.id,
          lines: [{ accountCode: paymentAccountCode('CASH'), debit: downPayment, credit: 0 }, { accountCode: '1103', debit: 0, credit: downPayment }] });
      }
      const planNumber = db.nextNumber('PLN');
      db.run(`INSERT INTO installment_plans (id,plan_number,customer_id,invoice_id,total_amount,down_payment,financed_amount,installments_count,installment_amount,start_date,down_payment_payment_id,paid_amount,remaining_amount,status,created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,0,?,'ACTIVE',?)`, [planId, planNumber, customerId, invoiceId, totalAmount, downPayment, financed, installmentsCount, monthlyAmount, startDate, downPaymentId, financed, actor.id]);
      let allocated = 0;
      for (let i = 1; i <= installmentsCount; i++) {
        const amount = i === installmentsCount ? Math.round((financed - allocated) * 100) / 100 : monthlyAmount;
        allocated += amount;
        db.run(`INSERT INTO installments (id,plan_id,sequence_number,due_date,amount,paid_amount,remaining_amount,status) VALUES (?,?,?,?,?,0,?,'UPCOMING')`,
          [uuidv4(), planId, i, addLocalMonths(startDate, i - 1), amount, amount]);
      }
      db.run(`INSERT INTO audit_logs (id,user_id,user_name,action,module,record_id,new_values) VALUES (?,?,?,?,?,?,?)`,
        [uuidv4(), actor.id, actor.fullName, 'Create installment plan', 'FINANCE', planId, JSON.stringify({ planNumber, customerId, invoiceId, totalAmount, downPayment, downPaymentId, financed, installmentsCount })]);
      return { id: planId, planNumber, downPaymentReceipt };
    });
  }

  payInstallment(installmentId: string) {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'finance.installments.manage');
    return this.db.executeTransaction((db) => {
      const inst = db.query<any>(`SELECT i.*,p.plan_number,p.installments_count,p.customer_id,p.invoice_id FROM installments i JOIN installment_plans p ON p.id=i.plan_id WHERE i.id=?`, [installmentId])[0];
      if (!inst) throw new Error('Installment not found.');
      if (inst.status === 'PAID' || inst.status === 'WAIVED') throw new Error('Installment is already paid or waived.');
      const amount = Number(inst.remainingAmount);
      if (!(amount > 0)) throw new Error('No amount is due for this installment.');
      const customer = db.query<any>('SELECT name FROM customers WHERE id=?', [inst.customerId])[0];
      const register = db.query<any>('SELECT id FROM cash_registers WHERE id=? AND is_active=1', ['cr_main'])[0];
      if (!register) throw new Error('The main cash register is unavailable.');
      const shift = db.query<any>(`SELECT id FROM cash_shifts WHERE user_id=? AND register_id=? AND status='OPEN' ORDER BY opened_at DESC LIMIT 1`, [actor.id, register.id])[0];
      const paymentId = uuidv4();
      const receiptNumber = db.nextNumber('RCP-INST');
      const today = localDateString();
      db.run(`INSERT INTO customer_payments (id,receipt_number,customer_id,invoice_id,amount,payment_type,date,notes,performed_by,register_id,shift_id) VALUES (?,?,?,?,?,'CASH',?,?,?,?,?)`,
        [paymentId, receiptNumber, inst.customerId, inst.invoiceId || null, amount, today, `Installment payment ${inst.sequenceNumber}/${inst.installmentsCount} for plan ${inst.planNumber}`, actor.id, register.id, shift?.id || null]);
      if (inst.invoiceId) db.run(`INSERT INTO customer_payment_allocations (id,payment_id,sales_invoice_id,amount) VALUES (?,?,?,?)`,
        [`cpa_${uuidv4().substring(0, 8)}`, paymentId, inst.invoiceId, amount]);
      if (inst.invoiceId) {
        db.run(`UPDATE sales_invoices SET paid_amount=paid_amount+?,remaining_amount=MAX(0,remaining_amount-?),payment_status=CASE WHEN remaining_amount-?<=0 THEN 'PAID' ELSE 'PARTIAL' END,updated_at=CURRENT_TIMESTAMP WHERE id=?`, [amount, amount, amount, inst.invoiceId]);
      }
      db.run(`UPDATE installments SET status='PAID',paid_amount=paid_amount+?,remaining_amount=0,paid_at=?,payment_id=? WHERE id=?`, [amount, `${today}T${new Date().toTimeString().slice(0, 8)}`, paymentId, installmentId]);
      db.run('UPDATE customers SET current_balance=current_balance-?,updated_at=CURRENT_TIMESTAMP WHERE id=?', [amount, inst.customerId]);
      db.run(`UPDATE installment_plans SET paid_amount=paid_amount+?,remaining_amount=MAX(0,remaining_amount-?),status=CASE WHEN remaining_amount-?<=0 THEN 'COMPLETED' ELSE status END WHERE id=?`, [amount, amount, amount, inst.planId]);
      db.run('UPDATE cash_registers SET current_balance=current_balance+? WHERE id=?', [amount, register.id]);
      if (shift?.id) db.run('UPDATE cash_shifts SET total_customer_payments=total_customer_payments+? WHERE id=?', [amount, shift.id]);
      postLedgerEntry(db.getDatabase(), { date: today, description: `Installment receipt ${receiptNumber}`, referenceType: 'CUSTOMER_PAYMENT', referenceId: paymentId, createdBy: actor.id,
        lines: [{ accountCode: paymentAccountCode('CASH'), debit: amount, credit: 0 }, { accountCode: '1103', debit: 0, credit: amount }] });
      db.run(`INSERT INTO audit_logs (id,user_id,user_name,action,module,record_id,new_values) VALUES (?,?,?,?,?,?,?)`,
        [uuidv4(), actor.id, actor.fullName, 'Collect installment', 'FINANCE', installmentId, JSON.stringify({ receiptNumber, amount, customer: customer?.name, planNumber: inst.planNumber })]);
      return { receiptNumber, amount };
    });
  }

  reverseInstallmentPayment(installmentId: string) {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'finance.installments.manage');
    return this.db.executeTransaction((db) => {
      const inst = db.query<any>(`SELECT i.*,p.plan_number,p.customer_id,p.invoice_id FROM installments i JOIN installment_plans p ON p.id=i.plan_id WHERE i.id=?`, [installmentId])[0];
      if (!inst || inst.status !== 'PAID' || !inst.paymentId) throw new Error('This installment has no payment to reverse.');
      const payment = db.query<any>('SELECT * FROM customer_payments WHERE id=?', [inst.paymentId])[0];
      if (!payment) throw new Error('The installment receipt is missing.');
      const amount = Number(payment.amount);
      const today = localDateString();
      const entry = db.query<any>(`SELECT id FROM journal_entries WHERE reference_type='CUSTOMER_PAYMENT' AND reference_id=?`, [payment.id])[0];
      if (entry) reverseLedgerEntry(db.getDatabase(), entry.id, {
        date: today, description: `Reverse installment receipt ${payment.receiptNumber}`,
        referenceType: 'CUSTOMER_PAYMENT_VOID', referenceId: `${payment.id}:${uuidv4()}`, createdBy: actor.id,
      });
      if (inst.invoiceId) {
        db.run(`UPDATE sales_invoices SET paid_amount=MAX(0,paid_amount-?),remaining_amount=MIN(total_amount,remaining_amount+?),payment_status=CASE WHEN paid_amount-?<=0 THEN 'UNPAID' ELSE 'PARTIAL' END,updated_at=CURRENT_TIMESTAMP WHERE id=?`, [amount, amount, amount, inst.invoiceId]);
      }
      db.run('UPDATE customers SET current_balance=current_balance+?,updated_at=CURRENT_TIMESTAMP WHERE id=?', [amount, inst.customerId]);
      if (payment.paymentType === 'CASH') db.run('UPDATE cash_registers SET current_balance=current_balance-? WHERE id=?', [amount, payment.registerId || 'cr_main']);
      if (payment.shiftId) db.run('UPDATE cash_shifts SET total_customer_payments=total_customer_payments-? WHERE id=?', [amount, payment.shiftId]);
      db.run(`UPDATE installments SET status=CASE WHEN due_date<? THEN 'OVERDUE' ELSE 'UPCOMING' END,paid_amount=0,remaining_amount=amount,paid_at=NULL,payment_id=NULL WHERE id=?`, [today, installmentId]);
      db.run(`UPDATE installment_plans SET paid_amount=MAX(0,paid_amount-?),remaining_amount=MIN(financed_amount,remaining_amount+?),status='ACTIVE' WHERE id=?`, [amount, amount, inst.planId]);
      db.run('DELETE FROM customer_payments WHERE id=?', [payment.id]);
      db.run(`INSERT INTO audit_logs (id,user_id,user_name,action,module,record_id,old_values) VALUES (?,?,?,?,?,?,?)`,
        [uuidv4(), actor.id, actor.fullName, 'Reverse installment payment', 'FINANCE', installmentId,
          JSON.stringify({ receiptNumber: payment.receiptNumber, amount, planNumber: inst.planNumber })]);
      return { receiptNumber: payment.receiptNumber, amount };
    });
  }

  cancelPlan(planId: string) {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'finance.installments.manage');
    return this.db.executeTransaction((db) => {
      const plan = db.query<any>(`SELECT * FROM installment_plans WHERE id=?`, [planId])[0];
      if (!plan || !['ACTIVE', 'DEFAULTED'].includes(plan.status)) throw new Error('This installment plan cannot be cancelled.');
      const paid = db.query<any>(`SELECT COUNT(*) AS count FROM installments WHERE plan_id=? AND status='PAID'`, [planId])[0]?.count || 0;
      if (paid) throw new Error('Reverse all collected installments before cancelling the plan.');
      if (plan.downPaymentPaymentId) {
        const payment = db.query<any>('SELECT * FROM customer_payments WHERE id=?', [plan.downPaymentPaymentId])[0];
        if (!payment) throw new Error('The down payment receipt is missing; reconcile it before cancelling the plan.');
        const entry = db.query<any>(`SELECT id FROM journal_entries WHERE reference_type='CUSTOMER_PAYMENT' AND reference_id=?`, [payment.id])[0];
        if (entry) reverseLedgerEntry(db.getDatabase(), entry.id, {
          date: localDateString(), description: `Reverse installment down payment ${payment.receiptNumber}`,
          referenceType: 'CUSTOMER_PAYMENT_VOID', referenceId: `${payment.id}:${uuidv4()}`, createdBy: actor.id,
        });
        if (plan.invoiceId) {
          db.run(`UPDATE sales_invoices SET paid_amount=MAX(0,paid_amount-?),remaining_amount=MIN(total_amount,remaining_amount+?),payment_status=CASE WHEN paid_amount-?<=0 THEN 'UNPAID' ELSE 'PARTIAL' END,updated_at=CURRENT_TIMESTAMP WHERE id=?`, [payment.amount, payment.amount, payment.amount, plan.invoiceId]);
        }
        db.run('UPDATE customers SET current_balance=current_balance+?,updated_at=CURRENT_TIMESTAMP WHERE id=?', [payment.amount, plan.customerId]);
        if (payment.paymentType === 'CASH') db.run('UPDATE cash_registers SET current_balance=current_balance-? WHERE id=?', [payment.amount, payment.registerId || 'cr_main']);
        if (payment.shiftId) db.run('UPDATE cash_shifts SET total_customer_payments=total_customer_payments-? WHERE id=?', [payment.amount, payment.shiftId]);
        db.run('DELETE FROM customer_payments WHERE id=?', [payment.id]);
      }
      db.run(`UPDATE installments SET status='WAIVED',remaining_amount=0 WHERE plan_id=?`, [planId]);
      db.run(`UPDATE installment_plans SET status='CANCELLED',remaining_amount=0 WHERE id=?`, [planId]);
      db.run(`INSERT INTO audit_logs (id,user_id,user_name,action,module,record_id,old_values) VALUES (?,?,?,?,?,?,?)`,
        [uuidv4(), actor.id, actor.fullName, 'Cancel installment plan', 'FINANCE', planId,
          JSON.stringify({ planNumber: plan.planNumber, downPayment: plan.downPayment })]);
      return { planNumber: plan.planNumber };
    });
  }
}
