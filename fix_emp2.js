const fs = require('fs');
const f = 'src/services/domains/hr/EmployeeService.ts';
let s = fs.readFileSync(f, 'utf8');
const rep = (a, b) => {
  if (!s.includes(a)) { console.log('MISS:', a.slice(0, 70)); return; }
  s = s.split(a).join(b);
};

// 1) payroll_run_items INSERT VALUES -> ROUND on money positions
rep(`gross_amount, net_amount, warning_json, detail_json, payment_method, payout_status
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
`gross_amount, net_amount, warning_json, detail_json, payment_method, payout_status
           ) VALUES (?, ?, ?, ?, ?, ?, ROUND(?*100), ?, ?, ?, ?, ?, ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ?, ?, ?, ?)`);

// 2) readPayrollRun money aliases -> /100.0
rep('salary_type AS salaryType, base_salary AS baseSalary, expected_workdays AS expectedWorkdays,',
    'salary_type AS salaryType, base_salary / 100.0 AS baseSalary, expected_workdays AS expectedWorkdays,');
rep(`base_amount AS baseAmount, overtime_amount AS overtimeAmount,
              bonus_amount AS bonusAmount, commission_amount AS commissionAmount,
              allowance_amount AS allowanceAmount, loan_deduction_amount AS loanDeductionAmount,
              advance_amount AS advanceAmount, manual_deduction_amount AS manualDeductionAmount,
              attendance_deduction_amount AS attendanceDeductionAmount, tax_amount AS taxAmount,`,
`base_amount / 100.0 AS baseAmount, overtime_amount / 100.0 AS overtimeAmount,
              bonus_amount / 100.0 AS bonusAmount, commission_amount / 100.0 AS commissionAmount,
              allowance_amount / 100.0 AS allowanceAmount, loan_deduction_amount / 100.0 AS loanDeductionAmount,
              advance_amount / 100.0 AS advanceAmount, manual_deduction_amount / 100.0 AS manualDeductionAmount,
              attendance_deduction_amount / 100.0 AS attendanceDeductionAmount, tax_amount / 100.0 AS taxAmount,`);
rep(`social_insurance_base AS socialInsuranceBase,
              social_insurance_employee_share AS socialInsuranceEmployeeShare,
              social_insurance_employer_share AS socialInsuranceEmployerShare,
              social_insurance_total AS socialInsuranceTotal,
              gross_amount AS grossAmount, net_amount AS netAmount, warning_json AS warningJson,`,
`social_insurance_base / 100.0 AS socialInsuranceBase,
              social_insurance_employee_share / 100.0 AS socialInsuranceEmployeeShare,
              social_insurance_employer_share / 100.0 AS socialInsuranceEmployerShare,
              social_insurance_total / 100.0 AS socialInsuranceTotal,
              gross_amount / 100.0 AS grossAmount, net_amount / 100.0 AS netAmount, warning_json AS warningJson,`);
rep('payment_proof AS paymentProof, paid_amount AS paidAmount, payout_status AS payoutStatus',
    'payment_proof AS paymentProof, paid_amount / 100.0 AS paidAmount, payout_status AS payoutStatus');

// 3) paid_amount write -> piastres
rep("payment_proof = ?, paid_amount = ?, payout_status = 'PAID'",
    "payment_proof = ?, paid_amount = ROUND(?*100), payout_status = 'PAID'");

// 4) pt.* single-row read -> unscale amount
rep(`SELECT pt.*, COALESCE(pt.branch_id, e.branch_id) AS effective_branch_id FROM payroll_transactions pt
      LEFT JOIN employees e ON e.id = pt.employee_id
      WHERE pt.id = ? AND \${scope.clause} AND \${departmentScope.clause}
    \`, [id, ...scope.params, ...departmentScope.params])[0];`,
`SELECT pt.*, COALESCE(pt.branch_id, e.branch_id) AS effective_branch_id FROM payroll_transactions pt
      LEFT JOIN employees e ON e.id = pt.employee_id
      WHERE pt.id = ? AND \${scope.clause} AND \${departmentScope.clause}
    \`, [id, ...scope.params, ...departmentScope.params])
      .map((r) => unscaleMoneyRow(r, ['amount']))[0];`);

// 5) journal GL sums -> major
rep('SELECT COALESCE(SUM(l.credit-l.debit),0) AS amount',
    'SELECT COALESCE(SUM(l.credit-l.debit),0) / 100.0 AS amount');
rep('`SELECT COALESCE(SUM(l.credit - l.debit), 0) AS amount\n             FROM journal_entry_lines l',
    '`SELECT COALESCE(SUM(l.credit - l.debit), 0) / 100.0 AS amount\n             FROM journal_entry_lines l');

// 6) import unscaleMoneyRow
rep("import { AttendanceTimeService } from './AttendanceTimeService';",
    "import { AttendanceTimeService } from './AttendanceTimeService';\nimport { unscaleMoneyRow } from '../../../utils/money';");

fs.writeFileSync(f, s);
console.log('done');
