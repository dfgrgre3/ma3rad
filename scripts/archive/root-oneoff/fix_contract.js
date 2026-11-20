const fs = require('fs');
const f = 'src/services/domains/hr/ContractService.ts';
let s = fs.readFileSync(f, 'utf8');
const rep = (a, b) => {
  if (!s.includes(a)) { console.log('MISS:', a.slice(0, 70)); return; }
  s = s.split(a).join(b);
};

rep("import { localDateString } from '../../../utils/shared/date';",
    "import { localDateString } from '../../../utils/shared/date';\nimport { unscaleMoneyRow } from '../../../utils/money';");
rep("import type { User } from '../../../types/auth/identity';",
    "const CONTRACT_MONEY_FIELDS = ['salary'] as const;\n\nimport type { User } from '../../../types/auth/identity';");

// unscale c.* contract reads (salary -> major)
rep(`WHERE c.id = ? AND \${scope.clause} AND \${departmentScope.clause}\`,
      [id, ...scope.params, ...departmentScope.params]
    )[0];
    return row ? this.decorate(row) : null;`,
`WHERE c.id = ? AND \${scope.clause} AND \${departmentScope.clause}\`,
      [id, ...scope.params, ...departmentScope.params]
    ).map((r) => unscaleMoneyRow(r, CONTRACT_MONEY_FIELDS))[0];
    return row ? this.decorate(unscaleMoneyRow(row, CONTRACT_MONEY_FIELDS)) : null;`);
// simpler: decorate already applied to row — patch differently below if MISS

rep(`ORDER BY c.start_date DESC, c.created_at DESC\`,
      params
    ).map((row) => this.decorate(row));`,
`ORDER BY c.start_date DESC, c.created_at DESC\`,
      params
    ).map((row) => this.decorate(unscaleMoneyRow(row, CONTRACT_MONEY_FIELDS)));`);

// INSERT employee_contracts salary -> piastres (position 9)
rep(`job_title, salary, salary_components_json, currency, status, renewal_notice_days,
           notes, created_by, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?)` ,
`job_title, salary, salary_components_json, currency, status, renewal_notice_days,
           notes, created_by, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ROUND(?*100), ?, ?, 'DRAFT', ?, ?, ?, ?, ?)`);

// UPDATE salary COALESCE
rep('salary = COALESCE(?, salary),', 'salary = COALESCE(ROUND(?*100), salary),');

// employees.base_salary update
rep("'UPDATE employees SET base_salary = ?, updated_at = ? WHERE id = ?'",
    "'UPDATE employees SET base_salary = ROUND(?*100), updated_at = ? WHERE id = ?'");

// salary history INSERT prev/next -> ROUND x2
rep(`(id, employee_id, previous_salary, next_salary, salary_type, effective_date,
           source_type, source_id, reason, actor_id
         ) VALUES (?, ?, ?, ?, ?, ?, 'CONTRACT', ?, ?, ?)`,
`(id, employee_id, previous_salary, next_salary, salary_type, effective_date,
           source_type, source_id, reason, actor_id
         ) VALUES (?, ?, ROUND(?*100), ROUND(?*100), ?, ?, 'CONTRACT', ?, ?, ?)`);

// salary history SELECT
rep('h.previous_salary AS previousSalary, h.next_salary AS nextSalary,',
    'h.previous_salary / 100.0 AS previousSalary, h.next_salary / 100.0 AS nextSalary,');

// payroll SUM
rep('`SELECT COALESCE(SUM(amount), 0) AS amount FROM payroll_transactions',
    '`SELECT COALESCE(SUM(amount), 0) / 100.0 AS amount FROM payroll_transactions');

// final settlements INSERT: base_salary(8), earned_wages(9), leave_payout(11), total_amount(12)
rep(`base_salary, earned_wages, unused_annual_leave_days, leave_payout, total_amount,
           details_json, created_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
`base_salary, earned_wages, unused_annual_leave_days, leave_payout, total_amount,
           details_json, created_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ROUND(?*100), ROUND(?*100), ?, ROUND(?*100), ROUND(?*100), ?, ?)`);

fs.writeFileSync(f, s);
console.log('done');
