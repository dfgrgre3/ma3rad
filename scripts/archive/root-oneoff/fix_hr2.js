const fs = require('fs');
const rep = (f, pairs) => {
  let s = fs.readFileSync(f, 'utf8');
  for (const [a, b] of pairs) {
    if (!s.includes(a)) { console.log('MISS', f.split('/').pop(), JSON.stringify(a.slice(0, 60))); continue; }
    s = s.split(a).join(b);
  }
  fs.writeFileSync(f, s);
};

rep('src/services/domains/hr/HrBenefitsService.ts', [
  ['INSERT INTO hr_loans (id, employee_id, principal, installment_amount, start_date, remaining_balance, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
   'INSERT INTO hr_loans (id, employee_id, principal, installment_amount, start_date, remaining_balance, notes) VALUES (?, ?, ROUND(?*100), ROUND(?*100), ?, ROUND(?*100), ?)'],
  ['INSERT INTO hr_loan_installments (id, loan_id, due_date, amount) VALUES (?, ?, ?, ?)',
   'INSERT INTO hr_loan_installments (id, loan_id, due_date, amount) VALUES (?, ?, ?, ROUND(?*100))'],
]);

rep('src/services/domains/hr/PerformanceService.ts', [
  ['reward_type, amount, status, notes, created_by)\n       VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
   'reward_type, amount, status, notes, created_by)\n       VALUES (?, ?, ?, ?, ROUND(?*100), ?, ?, ?)'],
]);

rep('src/services/domains/hr/RecruitmentService.ts', [
  ['(id, candidate_id, salary, salary_type, offered_at, expires_at, terms, created_by, created_at, updated_at)\n       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
   '(id, candidate_id, salary, salary_type, offered_at, expires_at, terms, created_by, created_at, updated_at)\n       VALUES (?, ?, ROUND(?*100), ?, ?, ?, ?, ?, ?, ?)'],
]);

rep('src/services/domains/hr/TrainingService.ts', [
  ['amount, expense_date, description, payment_method, register_id, bank_account_id, ledger_reference_id, created_by)\n         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
   'amount, expense_date, description, payment_method, register_id, bank_account_id, ledger_reference_id, created_by)\n         VALUES (?, ?, ?, ROUND(?*100), ?, ?, ?, ?, ?, ?, ?)'],
]);

rep('src/services/domains/hr/HrDisciplineService.ts', [
  // payroll_transactions INSERT: find its VALUES
]);
console.log('done');
