import {
  auditActor,
  currentCompanyId,
  db,
  requireManage,
  requireView,
} from './shared';
import type { SLAViolation } from './types';
import { localDateString, addLocalDays } from '../../../../utils/shared/date';

export function getSLASeverityViolations(): SLAViolation[] {
  const actor = requireView();
  const companyId = currentCompanyId(actor);
  const today = localDateString();
  const violations: SLAViolation[] = [];

  // Overdue payments
  const overduePayments = db.query<any>(
    `SELECT fcp.id, fcp.contract_id AS contractId, fc.title AS contractTitle,
            fc.vendor_name AS vendorName, fcp.due_date AS dueDate,
            fcp.amount_due AS amountDue, fcp.amount_paid AS amountPaid
     FROM facility_contract_payments fcp
     JOIN facility_contracts fc ON fc.id = fcp.contract_id
     WHERE fc.company_id = ? AND fcp.status IN ('PENDING', 'PARTIAL')
       AND fcp.due_date < ?`,
    [companyId, today]
  );
  for (const p of overduePayments) {
    violations.push({
      id: `sla_pay_${p.id}`,
      contractId: p.contractId,
      contractTitle: p.contractTitle,
      vendorName: p.vendorName,
      violationType: 'PAYMENT_OVERDUE',
      severity: 'HIGH',
      description: `دفعة متأخرة لعقد "${p.contractTitle}" بقيمة ${Number(p.amountDue) - Number(p.amountPaid)} ج، استحقاق في ${p.dueDate}`,
      detectedAt: today,
      dueDate: p.dueDate,
      penaltyAmount: null,
      status: 'OPEN',
    });
  }

  // Expiring contracts
  const inThirtyDays = localDateString(addLocalDays(new Date(), 30));
  const expiringContracts = db.query<any>(
    `SELECT fc.id, fc.contract_number AS contractNumber, fc.title,
            fc.vendor_name AS vendorName, fc.ends_at AS endsAt,
            fc.auto_renew AS autoRenew
     FROM facility_contracts fc
     WHERE fc.company_id = ? AND fc.status = 'ACTIVE'
       AND fc.ends_at BETWEEN ? AND ?
       AND fc.auto_renew = 0`,
    [companyId, today, inThirtyDays]
  );
  for (const c of expiringContracts) {
    violations.push({
      id: `sla_exp_${c.id}`,
      contractId: c.id,
      contractTitle: c.title,
      vendorName: c.vendorName,
      violationType: 'CONTRACT_EXPIRY',
      severity: 'CRITICAL',
      description: `عقد "${c.title}" ينتهي في ${c.ends_at} ولم يتم تفعيل التجديد التلقائي`,
      detectedAt: today,
      dueDate: c.ends_at,
      penaltyAmount: null,
      status: 'OPEN',
    });
  }

  return violations.sort((a, b) => {
    const sevOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return (sevOrder[a.severity] ?? 99) - (sevOrder[b.severity] ?? 99);
  });
}

export function acknowledgeSLASeverity(violationId: string): void {
  const actor = requireManage();
  auditActor(actor, 'اعتراف بمخالفة SLA', violationId, { acknowledgedBy: actor.id });
}
