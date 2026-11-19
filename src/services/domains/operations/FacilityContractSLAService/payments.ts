import { v4 as uuidv4 } from 'uuid';
import { postLedgerEntry } from '../../../../database/repositories/ledger';
import { unscaleMoneyRow } from '../../../../utils/money';
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
  ContractPayment,
  PaymentStatus,
} from './types';
import { localDateString } from '../../../../utils/shared/date';

export function getContractPayments(contractId: string): ContractPayment[] {
  const actor = requireView();
  const companyId = currentCompanyId(actor);
  const scope = branchAccess.sqlScope('fc.branch_id', undefined, actor);
  const today = localDateString();
  const rows = db.query<any>(
    `SELECT fcp.id, fcp.contract_id AS contractId, fcp.payment_number AS paymentNumber,
            fcp.due_date AS dueDate, fcp.amount_due / 100.0 AS amountDue,
            fcp.amount_paid / 100.0 AS amountPaid, fcp.payment_date AS paymentDate,
            fcp.payment_method AS paymentMethod, fcp.reference_number AS referenceNumber,
            fcp.proof_reference AS proofReference, fcp.status,
            fcp.notes, fcp.created_by AS createdBy, fcp.created_at AS createdAt,
            fcp.updated_at AS updatedAt
     FROM facility_contract_payments fcp
     JOIN facility_contracts fc ON fc.id = fcp.contract_id
     WHERE fcp.contract_id = ? AND fc.company_id = ? AND ${scope.clause}
     ORDER BY fcp.due_date`,
    [contractId, companyId, ...scope.params]
  );
  return rows.map((row) => {
    const dueDate = row.due_date;
    const daysOverdue = dueDate && row.status !== 'PAID'
      ? Math.max(0, Math.ceil((Date.parse(`${today}T00:00:00`) - Date.parse(`${dueDate}T00:00:00`)) / 86400000))
      : null;
    return {
      ...row,
      status: row.status as PaymentStatus,
      daysOverdue,
    };
  });
}

export function createContractPayment(
  contractId: string,
  input: {
    paymentNumber: string;
    dueDate: string;
    amountDue: number;
    paymentMethod?: string | null;
    referenceNumber?: string | null;
    proofReference?: string | null;
    notes?: string | null;
  }
): ContractPayment {
  const actor = requireManage();
  const companyId = currentCompanyId(actor);
  const contract = db.query<{ id: string }>(
    'SELECT id FROM facility_contracts WHERE id = ? AND company_id = ?',
    [contractId, companyId]
  )[0];
  if (!contract) throw new Error('العقد غير موجود.');
  if (!input.paymentNumber?.trim()) throw new Error('رقم الدفعة مطلوب.');
  if (!isValidDate(input.dueDate)) throw new Error('تاريخ الاستحقاق غير صالح.');
  if (Number(input.amountDue) < 0) throw new Error('المبلغ المستحق يجب أن يكون غير سالب.');

  const id = `fcp_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  db.run(
    `INSERT INTO facility_contract_payments
       (id, contract_id, payment_number, due_date, amount_due, amount_paid,
        payment_method, reference_number, proof_reference, status, notes, created_by)
     VALUES (?, ?, ?, ?, ROUND(?*100), 0, ?, ?, ?, 'PENDING', ?, ?)`,
    [id, contractId, input.paymentNumber.trim(), input.dueDate,
      Math.max(0, Number(input.amountDue)), input.paymentMethod || null,
      input.referenceNumber || null, input.proofReference || null,
      input.notes || null, actor.id]
  );
  auditActor(actor, 'إضافة دفعة عقد خدمة', id, {
    contractId, paymentNumber: input.paymentNumber, amountDue: input.amountDue,
  });
  return getContractPayments(contractId).find((p) => p.id === id)!;
}

export function recordContractPayment(
  paymentId: string,
  input: {
    amountPaid: number;
    paymentDate: string;
    paymentMethod: string;
    referenceNumber?: string | null;
    proofReference?: string | null;
  }
): ContractPayment {
  const actor = requireManage();
  const companyId = currentCompanyId(actor);
  const payment = db.query<any>(
    `SELECT fcp.*, fc.id AS contractId FROM facility_contract_payments fcp
     JOIN facility_contracts fc ON fc.id = fcp.contract_id
     WHERE fcp.id = ? AND fc.company_id = ?`,
    [paymentId, companyId]
  )[0];
  if (payment) unscaleMoneyRow(payment, ['amount_due', 'amount_paid']);
  if (!payment) throw new Error('الدفعة غير موجودة.');
  if (payment.status === 'PAID') throw new Error('الدفعة مسددة مسبقاً.');
  if (!isValidDate(input.paymentDate)) throw new Error('تاريخ الدفع غير صالح.');
  if (Number(input.amountPaid) < 0) throw new Error('المبلغ المسدد يجب أن يكون غير سالب.');

  const newPaid = roundNumber(Number(payment.amount_paid) + Number(input.amountPaid));
  const newStatus = newPaid >= Number(payment.amount_due) ? 'PAID' : 'PARTIAL';
  db.run(
    `UPDATE facility_contract_payments SET amount_paid = ROUND(?*100), payment_date = ?,
       payment_method = ?, reference_number = COALESCE(?, reference_number),
       proof_reference = COALESCE(?, proof_reference), status = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [newPaid, input.paymentDate, input.paymentMethod, input.referenceNumber || null,
      input.proofReference || null, newStatus, paymentId]
  );

  // Create ledger entry for contract payment
  postContractPaymentLedger(payment.contractId, paymentId, newPaid, input.paymentDate, actor);

  auditActor(actor, 'تسديد دفعة عقد خدمة', paymentId, {
    contractId: payment.contractId, amountPaid: input.amountPaid, newStatus,
  });
  return getContractPayments(payment.contractId).find((p) => p.id === paymentId)!;
}

function postContractPaymentLedger(
  contractId: string,
  paymentId: string,
  amount: number,
  date: string,
  actor: { id: string; fullName: string }
): void {
  const contract = db.query<{ title: string }>(
    'SELECT title FROM facility_contracts WHERE id = ?',
    [contractId]
  )[0];
  const description = `دفعة عقد خدمة: ${contract?.title || contractId} (${paymentId})`;
  const ledger = db.query<{ glAccountCode: string }>(
    "SELECT code AS glAccountCode FROM chart_of_accounts WHERE code = '5205' LIMIT 1"
  )[0];
  if (ledger) {
    postLedgerEntry(db.getDatabase(), {
      date,
      description,
      referenceType: 'FACILITY_CONTRACT_PAYMENT',
      referenceId: paymentId,
      createdBy: actor.id,
      lines: [
        { accountCode: '5205', debit: amount, credit: 0 },
        { accountCode: ledger.glAccountCode, debit: 0, credit: amount },
      ],
    });
  }
}
