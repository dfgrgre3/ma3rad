import { DatabaseManager } from '../database/db';
import { postLedgerEntry, paymentAccountCode } from '../database/ledger';
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

  createPlan(input: { customerId: string; totalAmount: number; downPayment: number; installmentsCount: number; startDate: string }) {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'finance.installments.manage');
    const { customerId, totalAmount, downPayment, installmentsCount, startDate } = input;
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
      const planNumber = db.nextNumber('PLN');
      db.run(`INSERT INTO installment_plans (id,plan_number,customer_id,total_amount,down_payment,financed_amount,installments_count,installment_amount,start_date,paid_amount,remaining_amount,status,created_by)
        VALUES (?,?,?,?,?,?,?,?,?,0,?,'ACTIVE',?)`, [planId, planNumber, customerId, totalAmount, downPayment, financed, installmentsCount, monthlyAmount, startDate, financed, actor.id]);
      let allocated = 0;
      for (let i = 1; i <= installmentsCount; i++) {
        const amount = i === installmentsCount ? Math.round((financed - allocated) * 100) / 100 : monthlyAmount;
        allocated += amount;
        db.run(`INSERT INTO installments (id,plan_id,sequence_number,due_date,amount,paid_amount,remaining_amount,status) VALUES (?,?,?,?,?,0,?,'UPCOMING')`,
          [uuidv4(), planId, i, addLocalMonths(startDate, i), amount, amount]);
      }
      db.run(`INSERT INTO audit_logs (id,user_id,user_name,action,module,record_id,new_values) VALUES (?,?,?,?,?,?,?)`,
        [uuidv4(), actor.id, actor.fullName, 'Create installment plan', 'FINANCE', planId, JSON.stringify({ planNumber, customerId, totalAmount, downPayment, financed, installmentsCount })]);
      return { id: planId, planNumber };
    });
  }

  payInstallment(installmentId: string) {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'finance.installments.manage');
    return this.db.executeTransaction((db) => {
      const inst = db.query<any>(`SELECT i.*,p.plan_number,p.installments_count,p.customer_id FROM installments i JOIN installment_plans p ON p.id=i.plan_id WHERE i.id=?`, [installmentId])[0];
      if (!inst) throw new Error('Installment not found.');
      if (inst.status === 'PAID' || inst.status === 'WAIVED') throw new Error('Installment is already paid or waived.');
      const amount = Number(inst.remainingAmount);
      if (!(amount > 0)) throw new Error('No amount is due for this installment.');
      const customer = db.query<any>('SELECT name FROM customers WHERE id=?', [inst.customerId])[0];
      const register = db.query<any>('SELECT id FROM cash_registers WHERE id=? AND is_active=1', ['cr_main'])[0];
      if (!register) throw new Error('The main cash register is unavailable.');
      const paymentId = uuidv4();
      const receiptNumber = db.nextNumber('RCP-INST');
      const today = localDateString();
      db.run(`INSERT INTO customer_payments (id,receipt_number,customer_id,amount,payment_type,date,notes,performed_by,register_id) VALUES (?,?,?,?,'CASH',?,?,?,?)`,
        [paymentId, receiptNumber, inst.customerId, amount, today, `Installment payment ${inst.sequenceNumber}/${inst.installmentsCount} for plan ${inst.planNumber}`, actor.id, 'cr_main']);
      db.run(`UPDATE installments SET status='PAID',paid_amount=paid_amount+?,remaining_amount=0,paid_at=?,payment_id=? WHERE id=?`, [amount, `${today}T${new Date().toTimeString().slice(0, 8)}`, paymentId, installmentId]);
      db.run('UPDATE customers SET current_balance=current_balance-?,updated_at=CURRENT_TIMESTAMP WHERE id=?', [amount, inst.customerId]);
      db.run(`UPDATE installment_plans SET paid_amount=paid_amount+?,remaining_amount=MAX(0,remaining_amount-?),status=CASE WHEN remaining_amount-?<=0 THEN 'COMPLETED' ELSE status END WHERE id=?`, [amount, amount, amount, inst.planId]);
      db.run('UPDATE cash_registers SET current_balance=current_balance+? WHERE id=?', [amount, 'cr_main']);
      postLedgerEntry(db.getDatabase(), { date: today, description: `Installment receipt ${receiptNumber}`, referenceType: 'CUSTOMER_PAYMENT', referenceId: paymentId, createdBy: actor.id,
        lines: [{ accountCode: paymentAccountCode('CASH'), debit: amount, credit: 0 }, { accountCode: '1103', debit: 0, credit: amount }] });
      db.run(`INSERT INTO audit_logs (id,user_id,user_name,action,module,record_id,new_values) VALUES (?,?,?,?,?,?,?)`,
        [uuidv4(), actor.id, actor.fullName, 'Collect installment', 'FINANCE', installmentId, JSON.stringify({ receiptNumber, amount, customer: customer?.name, planNumber: inst.planNumber })]);
      return { receiptNumber, amount };
    });
  }
}
