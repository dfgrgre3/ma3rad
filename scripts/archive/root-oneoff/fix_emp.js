const fs = require('fs');
const f = 'src/services/domains/hr/EmployeeService.ts';
let s = fs.readFileSync(f, 'utf8');
const rep = (a, b) => {
  if (!s.includes(a)) { console.log('MISS:', a.slice(0, 60)); return; }
  s = s.split(a).join(b);
};

// payroll_transactions INSERT amount -> piastres
rep(`VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    `VALUES (?,?,?,ROUND(?*100),?,?,?,?,?,?,?,?,?,?,?,?)`);

// SUM(amount) reads -> major
rep("`SELECT COALESCE(SUM(amount),0) AS amount FROM payroll_transactions WHERE employee_id=? AND type='ADVANCE' AND substr(date,1,7)=?`",
    "`SELECT COALESCE(SUM(amount),0) / 100.0 AS amount FROM payroll_transactions WHERE employee_id=? AND type='ADVANCE' AND substr(date,1,7)=?`");
rep('`SELECT employee_id AS employeeId, type, SUM(amount) AS amount',
    '`SELECT employee_id AS employeeId, type, SUM(amount) / 100.0 AS amount');
rep('`SELECT COALESCE(SUM(amount), 0) AS amount FROM hr_allowances',
    '`SELECT COALESCE(SUM(amount), 0) / 100.0 AS amount FROM hr_allowances');
rep('`SELECT i.id, i.amount FROM hr_loan_installments i',
    '`SELECT i.id, i.amount / 100.0 AS amount FROM hr_loan_installments i');
rep('`SELECT COALESCE(SUM(pt.amount), 0) AS total', '`SELECT COALESCE(SUM(pt.amount), 0) / 100.0 AS total');
rep('SUM(pt.amount) AS total', 'SUM(pt.amount) / 100.0 AS total');

// pt.* -> unscale
rep('SELECT pt.*, COALESCE(pt.branch_id, e.branch_id) AS effective_branch_id FROM payroll_transactions pt',
    'SELECT pt.*, COALESCE(pt.branch_id, e.branch_id) AS effective_branch_id FROM payroll_transactions pt');

// journal legacy amount (GL piastres) -> major for comparison with wages
rep('`SELECT COALESCE(SUM(l.credit - l.debit), 0) AS amount\n             FROM journal_entry_lines l',
    '`SELECT COALESCE(SUM(l.credit - l.debit), 0) / 100.0 AS amount\n             FROM journal_entry_lines l');

// payroll_run_items INSERT: positions 7 + 13..28 money -> ROUND(?*100)
rep('payment_method, payout_status\n           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    'payment_method, payout_status\n           ) VALUES (?, ?, ?, ?, ?, ?, ROUND(?*100), ?, ?, ?, ?, ?, ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ?, ?, ?, ?)');

fs.writeFileSync(f, s);
console.log('done');
