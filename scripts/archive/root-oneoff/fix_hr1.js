const fs = require('fs');
const rep = (f, pairs) => {
  let s = fs.readFileSync(f, 'utf8');
  for (const [a, b] of pairs) {
    if (!s.includes(a)) { console.log('MISS', f.split('/').pop(), JSON.stringify(a.slice(0, 60))); continue; }
    s = s.split(a).join(b);
  }
  fs.writeFileSync(f, s);
};

// ── HrBenefitsService ──
rep('src/services/domains/hr/HrBenefitsService.ts', [
  ['allowance_type, amount, frequency, effective_from, effective_to) VALUES (?, ?, ?, ?, ?, ?, ?)',
   'allowance_type, amount, frequency, effective_from, effective_to) VALUES (?, ?, ?, ROUND(?*100), ?, ?, ?)'],
  ['SELECT COALESCE(SUM(amount), 0) AS amount FROM hr_allowances',
   'SELECT COALESCE(SUM(amount), 0) / 100.0 AS amount FROM hr_allowances'],
  ['end_date, amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
   'end_date, amount) VALUES (?, ?, ?, ?, ?, ?, ?, ROUND(?*100))'],
  ['installment_amount, start_date, remaining_balance, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
   'installment_amount, start_date, remaining_balance, notes) VALUES (?, ?, ROUND(?*100), ?, ROUND(?*100), ?, ?)'],
  // hr_loans INSERT has principal too — check columns list separately
  ['INSERT INTO hr_loan_installments (id, loan_id, due_date, amount) VALUES (?, ?, ?, ?)',
   'INSERT INTO hr_loan_installments (id, loan_id, due_date, amount) VALUES (?, ?, ?, ROUND(?*100))'],
  ['SELECT COALESCE(SUM(i.amount), 0) AS amount', 'SELECT COALESCE(SUM(i.amount), 0) / 100.0 AS amount'],
  ['hr_leave_settlements (id, employee_id, leave_days, amount, settlement_date, notes) VALUES (?, ?, ?, ?, ?, ?)',
   'hr_leave_settlements (id, employee_id, leave_days, amount, settlement_date, notes) VALUES (?, ?, ?, ROUND(?*100), ?, ?)'],
  ["SELECT employee_id AS employeeId, amount, settlement_date AS settlementDate, status",
   "SELECT employee_id AS employeeId, amount / 100.0 AS amount, settlement_date AS settlementDate, status"],
]);

// ── HrDisciplineService ──
rep('src/services/domains/hr/HrDisciplineService.ts', [
  ['penalty_type, amount, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
   'penalty_type, amount, notes, created_by) VALUES (?, ?, ?, ROUND(?*100), ?, ?, ?)'],
  ["'SELECT employee_id AS employeeId, amount, notes FROM hr_penalties WHERE id = ?'",
   "'SELECT employee_id AS employeeId, amount / 100.0 AS amount, notes FROM hr_penalties WHERE id = ?'"],
  ["'SELECT employee_id AS employeeId, amount, status, notes FROM hr_penalties WHERE id = ?'",
   "'SELECT employee_id AS employeeId, amount / 100.0 AS amount, status, notes FROM hr_penalties WHERE id = ?'"],
  ['INSERT INTO payroll_transactions (id, employee_id, type, amount, date, notes, created_by, branch_id, payment_status)',
   'INSERT INTO payroll_transactions (id, employee_id, type, amount, date, notes, created_by, branch_id, payment_status)'],
]);

// ── PerformanceService ──
rep('src/services/domains/hr/PerformanceService.ts', [
  ["INSERT INTO performance_rewards (id, employee_id, evaluation_id, reward_type, amount, status, notes, created_by)",
   "INSERT INTO performance_rewards (id, employee_id, evaluation_id, reward_type, amount, status, notes, created_by)"],
]);

// ── RecruitmentService ──
rep('src/services/domains/hr/RecruitmentService.ts', [
  ['salary, salary_type AS salaryType,', 'salary / 100.0 AS salary, salary_type AS salaryType,'],
]);

// ── TrainingService ──
rep('src/services/domains/hr/TrainingService.ts', [
  ['end_date, cost, status, created_by, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
   'end_date, cost, status, created_by, branch_id) VALUES (?, ?, ?, ?, ?, ?, ROUND(?*100), ?, ?, ?)'],
  ['cost: Number(r.cost) || 0', 'cost: Number(r.cost) / 100 || 0'],
  ["'SELECT name, cost FROM training_courses WHERE id = ?'",
   "'SELECT name, cost / 100.0 AS cost FROM training_courses WHERE id = ?'"],
  ['COALESCE(SUM(amount), 0) AS total FROM training_expenses',
   'COALESCE(SUM(amount), 0) / 100.0 AS total FROM training_expenses'],
]);
console.log('done');
