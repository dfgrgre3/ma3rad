const fs = require('fs');
const f = 'src/services/domains/hr/PayrollSocialInsuranceService.ts';
let s = fs.readFileSync(f, 'utf8');
const rep = (a, b) => {
  if (!s.includes(a)) { console.log('MISS:', JSON.stringify(a.slice(0, 70))); return; }
  s = s.split(a).join(b);
};

// rules SELECT aliases (3 occurrences) — flexible whitespace
s = s.replace(/contribution_ceiling AS contributionCeiling,/g, 'contribution_ceiling / 100.0 AS contributionCeiling,');
s = s.replace(/minimum_contribution_base AS minimumContributionBase,/g, 'minimum_contribution_base / 100.0 AS minimumContributionBase,');
s = s.replace(/maximum_contribution_base AS maximumContributionBase,/g, 'maximum_contribution_base / 100.0 AS maximumContributionBase,');

// rules UPDATE
rep('contribution_ceiling = ?, minimum_contribution_base = ?, maximum_contribution_base = ?,',
    'contribution_ceiling = ROUND(?*100), minimum_contribution_base = ROUND(?*100), maximum_contribution_base = ROUND(?*100),');

// rules INSERT: money at positions 9,10,11
rep('employee_share_percent, employer_share_percent, contribution_ceiling,\n              minimum_contribution_base, maximum_contribution_base,\n              end_of_service_per_year_percent, end_of_service_months_per_year,\n              created_by)\n           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    'employee_share_percent, employer_share_percent, contribution_ceiling,\n              minimum_contribution_base, maximum_contribution_base,\n              end_of_service_per_year_percent, end_of_service_months_per_year,\n              created_by)\n           VALUES (?, ?, ?, ?, ?, ?, ?, ROUND(?*100), ROUND(?*100), ROUND(?*100), ?, ?, ?, ?)');

// contributions SELECT
rep('sic.contribution_base AS contributionBase,', 'sic.contribution_base / 100.0 AS contributionBase,');
rep('sic.employee_share_amount AS employeeShareAmount,', 'sic.employee_share_amount / 100.0 AS employeeShareAmount,');
rep('sic.employer_share_amount AS employerShareAmount,', 'sic.employer_share_amount / 100.0 AS employerShareAmount,');
rep('sic.total_amount AS totalAmount, sic.rule_name AS ruleName', 'sic.total_amount / 100.0 AS totalAmount, sic.rule_name AS ruleName');

// contributions INSERT: money positions 6-9
rep('(id, payroll_run_id, payroll_run_item_id, employee_id, period,\n          contribution_base, employee_share_amount, employer_share_amount,\n          total_amount, rule_id, rule_name)\n       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    '(id, payroll_run_id, payroll_run_item_id, employee_id, period,\n          contribution_base, employee_share_amount, employer_share_amount,\n          total_amount, rule_id, rule_name)\n       VALUES (?, ?, ?, ?, ?, ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ?, ?)');

fs.writeFileSync(f, s);
console.log('done');
