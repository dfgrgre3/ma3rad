const fs = require('fs');
const f = 'src/services/domains/operations/FacilityContractSLAService.ts';
let s = fs.readFileSync(f, 'utf8');
const rep = (a, b) => { if (!s.includes(a)) { console.log('MISS:', a.slice(0, 70)); return; } s = s.split(a).join(b); };
rep(`import { localDateString, addLocalDays } from '../../../utils/shared/date';`,
`import { localDateString, addLocalDays } from '../../../utils/shared/date';
import { unscaleMoneyRow } from '../../../utils/money';`);
rep('fc.next_payment_date AS nextPaymentDate, fc.payment_amount AS paymentAmount,',
'fc.next_payment_date AS nextPaymentDate, fc.payment_amount / 100.0 AS paymentAmount,');
rep('fcp.due_date AS dueDate, fcp.amount_due AS amountDue,',
'fcp.due_date AS dueDate, fcp.amount_due / 100.0 AS amountDue,');
rep('fcp.amount_paid AS amountPaid, fcp.payment_date AS paymentDate,',
'fcp.amount_paid / 100.0 AS amountPaid, fcp.payment_date AS paymentDate,');
rep('fcr.new_ends_at AS newEndsAt, fcr.new_payment_amount AS newPaymentAmount,',
'fcr.new_ends_at AS newEndsAt, fcr.new_payment_amount / 100.0 AS newPaymentAmount,');
rep(`      \`SELECT fcp.*, fc.id AS contractId FROM facility_contract_payments fcp
       JOIN facility_contracts fc ON fc.id = fcp.contract_id
       WHERE fcp.id = ? AND fc.company_id = ?\`,
      [paymentId, companyId]
    )[0];`,
`      \`SELECT fcp.*, fc.id AS contractId FROM facility_contract_payments fcp
       JOIN facility_contracts fc ON fc.id = fcp.contract_id
       WHERE fcp.id = ? AND fc.company_id = ?\`,
      [paymentId, companyId]
    )[0];
    if (payment) unscaleMoneyRow(payment, ['amount_due', 'amount_paid']);`);
rep("UPDATE facility_contract_payments SET amount_paid = ?, payment_date = ?,",
"UPDATE facility_contract_payments SET amount_paid = ROUND(?*100), payment_date = ?,");
rep("VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, 'PENDING', ?, ?)`",
"VALUES (?, ?, ?, ?, ROUND(?*100), 0, ?, ?, ?, 'PENDING', ?, ?)`");
rep("VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`",
"VALUES (?, ?, ?, ?, ?, ROUND(?*100), ?, 'PENDING', ?, ?)`");
fs.writeFileSync(f, s);
console.log('done');
