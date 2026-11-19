import { v4 as uuidv4 } from 'uuid';
import {
  auditActor,
  branchAccess,
  currentCompanyId,
  db,
  isValidDate,
  requireManage,
  requireView,
  roundNumber,
} from './shared';
import type {
  BillStatus,
  UtilityBill,
  UtilityBillInput,
  UtilityBillPaymentInput,
  UtilityType,
} from './types';
import { localDateString } from '../../../../utils/shared/date';

export function getUtilityBills(options: {
  meterId?: string;
  status?: BillStatus;
  from?: string;
  to?: string;
} = {}): UtilityBill[] {
  const actor = requireView();
  const companyId = currentCompanyId(actor);
  const conditions: string[] = ['um.company_id = ?'];
  const params: (string | number)[] = [companyId];
  if (options.meterId) {
    conditions.push('fub.meter_id = ?');
    params.push(options.meterId);
  }
  if (options.status) {
    conditions.push('fub.status = ?');
    params.push(options.status);
  }
  if (options.from) {
    conditions.push('fub.billing_period_start >= ?');
    params.push(options.from);
  }
  if (options.to) {
    conditions.push('fub.billing_period_end <= ?');
    params.push(options.to);
  }
  const scope = branchAccess.sqlScope('um.branch_id', undefined, actor);
  conditions.push(scope.clause);
  params.push(...scope.params);

  const today = localDateString();
  const rows = db.query<any>(
    `SELECT fub.id, fub.meter_id AS meterId, um.meter_code AS meterCode,
            um.meter_name AS meterName, um.utility_type AS utilityType,
            fub.bill_number AS billNumber, fub.billing_period_start AS billingPeriodStart,
            fub.billing_period_end AS billingPeriodEnd, fub.bill_date AS billDate,
            fub.due_date AS dueDate, fub.amount_due / 100.0 AS amountDue,
            fub.amount_paid / 100.0 AS amountPaid, fub.consumption, fub.status,
            fub.payment_date AS paymentDate, fub.payment_reference AS paymentReference,
            fub.payment_proof AS paymentProof, fub.expense_id AS expenseId,
            fub.contract_id AS contractId, fub.notes,
            fub.created_by AS createdBy, u.full_name AS createdByName,
            fub.created_at AS createdAt, fub.updated_at AS updatedAt
     FROM facility_utility_bills fub
     JOIN facility_utility_meters um ON um.id = fub.meter_id
     LEFT JOIN users u ON u.id = fub.created_by
     WHERE ${conditions.join(' AND ')}
     ORDER BY fub.due_date DESC`,
    params
  );
  return rows.map((row) => {
    const dueDate = row.due_date;
    const daysOverdue = dueDate && row.status !== 'PAID'
      ? Math.max(0, Math.ceil((Date.parse(`${today}T00:00:00`) - Date.parse(`${dueDate}T00:00:00`)) / 86400000))
      : null;
    return {
      ...row,
      utilityType: row.utility_type as UtilityType,
      status: row.status as BillStatus,
      daysOverdue,
    };
  });
}

export function createUtilityBill(input: UtilityBillInput): UtilityBill {
  const actor = requireManage();
  const companyId = currentCompanyId(actor);
  const meter = db.query<{ id: string; meterCode: string; meterName: string; utilityType: UtilityType }>(
    `SELECT um.id, um.meter_code AS meterCode, um.meter_name AS meterName,
            um.utility_type AS utilityType
     FROM facility_utility_meters um
     WHERE um.id = ? AND um.company_id = ?`,
    [input.meterId, companyId]
  )[0];
  if (!meter) throw new Error('العداد غير موجود.');
  if (!input.billNumber?.trim()) throw new Error('رقم الفاتورة مطلوب.');
  if (!isValidDate(input.billingPeriodStart) || !isValidDate(input.billingPeriodEnd)) {
    throw new Error('تواريخ فترة الفوترة غير صالحة.');
  }
  if (input.billingPeriodEnd < input.billingPeriodStart) {
    throw new Error('تاريخ نهاية الفترة يسبق تاريخ بدايتها.');
  }
  if (!isValidDate(input.billDate) || !isValidDate(input.dueDate)) {
    throw new Error('تاريخ الفاتورة أو الاستحقاق غير صالح.');
  }
  if (Number(input.amountDue) < 0) throw new Error('المبلغ المستحق يجب أن يكون غير سالب.');
  const existing = db.query<{ id: string }>(
    `SELECT id FROM facility_utility_bills
     WHERE meter_id = ? AND billing_period_start = ? AND billing_period_end = ?`,
    [input.meterId, input.billingPeriodStart, input.billingPeriodEnd]
  )[0];
  if (existing) throw new Error('يوجد فاتورة مسجلة لنفس العداد وفترة الفوترة.');
  const id = `ub_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  db.run(
    `INSERT INTO facility_utility_bills
       (id, meter_id, bill_number, billing_period_start, billing_period_end,
        bill_date, due_date, amount_due, amount_paid, consumption, status,
        expense_id, contract_id, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ROUND(?*100), 0, ?, 'PENDING', ?, ?, ?, ?)`,
    [id, input.meterId, input.billNumber.trim(), input.billingPeriodStart,
      input.billingPeriodEnd, input.billDate, input.dueDate,
      Math.max(0, Number(input.amountDue)), input.consumption ?? 0,
      input.expenseId || null, input.contractId || null, input.notes || null,
      actor.id]
  );
  auditActor(actor, 'إضافة فاتورة مرافق', id, {
    meterId: input.meterId, billNumber: input.billNumber, amountDue: input.amountDue,
  });
  return getUtilityBill(id)!;
}

function getUtilityBill(id: string): UtilityBill | null {
  const bills = getUtilityBills().filter((b) => b.id === id);
  return bills[0] ?? null;
}

export function payUtilityBill(billId: string, input: UtilityBillPaymentInput): UtilityBill {
  const actor = requireManage();
  const companyId = currentCompanyId(actor);
  const bill = db.query<{ id: string; amountDue: number; amountPaid: number; meterId: string; status: string }>(
    `SELECT fub.id, fub.amount_due / 100.0 AS amountDue, fub.amount_paid / 100.0 AS amountPaid,
            fub.meter_id AS meterId, fub.status
     FROM facility_utility_bills fub
     JOIN facility_utility_meters um ON um.id = fub.meter_id
     WHERE fub.id = ? AND um.company_id = ?`,
    [billId, companyId]
  )[0];
  if (!bill) throw new Error('الفاتورة غير موجودة.');
  if (bill.status === 'PAID') throw new Error('الفاتورة مسددة مسبقاً.');
  if (!isValidDate(input.paymentDate)) throw new Error('تاريخ الدفع غير صالح.');
  if (Number(input.amountPaid) < 0) throw new Error('المبلغ المسدد يجب أن يكون غير سالب.');
  const newPaid = roundNumber(Number(bill.amountPaid) + Number(input.amountPaid));
  const newStatus = newPaid >= Number(bill.amountDue) ? 'PAID' : 'PARTIAL';
  db.run(
    `UPDATE facility_utility_bills SET amount_paid = ROUND(?*100), payment_date = ?,
       payment_reference = COALESCE(?, payment_reference),
       payment_proof = COALESCE(?, payment_proof), status = ?,
       updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [newPaid, input.paymentDate, input.paymentReference || null,
      input.paymentProof || null, newStatus, billId]
  );
  auditActor(actor, 'سداد فاتورة مرافق', billId, {
    meterId: bill.meterId, amountPaid: input.amountPaid, newStatus,
  });
  return getUtilityBill(billId)!;
}
