const fs = require('fs');
const rep = (f, a, b) => {
  let s = fs.readFileSync(f, 'utf8');
  if (!s.includes(a)) { console.log('MISS', f.split('/').pop(), a.slice(0, 60)); return; }
  s = s.split(a).join(b);
  fs.writeFileSync(f, s);
  console.log('ok', f.split('/').pop());
};

// Part03: journal lines debit/credit are piastres
rep('src/services/domains/finance/FinanceEnterprisePart03.ts',
`             COALESCE(l.description, e.description) as description,
             l.debit, l.credit`,
`             COALESCE(l.description, e.description) as description,
             l.debit / 100.0 AS debit, l.credit / 100.0 AS credit`);

// Part04: book balance SUM + INSERTs + list map
rep('src/services/domains/finance/FinanceEnterprisePart04.ts',
`      SELECT COALESCE(SUM(l.debit - l.credit), 0) as balance`,
`      SELECT COALESCE(SUM(l.debit - l.credit), 0) / 100.0 as balance`);
rep('src/services/domains/finance/FinanceEnterprisePart04.ts',
`        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'RECONCILED', ?, ?)`,
`        ) VALUES (?, ?, ?, ?, ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), 'RECONCILED', ?, ?)`);
rep('src/services/domains/finance/FinanceEnterprisePart04.ts',
`          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
`          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ROUND(?*100), 1, ?)`);
rep('src/services/domains/finance/FinanceEnterprisePart04.ts',
`      statementBalance: Number(r.statementBalance),
      bookBalance: Number(r.bookBalance),
      unreconciledDifference: Number(r.unreconciledDifference),
      clearedDeposits: Number(r.clearedDeposits),
      clearedWithdrawals: Number(r.clearedWithdrawals),`,
`      statementBalance: Number(r.statementBalance) / 100,
      bookBalance: Number(r.bookBalance) / 100,
      unreconciledDifference: Number(r.unreconciledDifference) / 100,
      clearedDeposits: Number(r.clearedDeposits) / 100,
      clearedWithdrawals: Number(r.clearedWithdrawals) / 100,`);

// Part06: budgets reads + actual spent
rep('src/services/domains/finance/FinanceEnterprisePart06.ts',
`      totalAllocated: Number(r.totalAllocated),`,
`      totalAllocated: Number(r.totalAllocated) / 100,`);
rep('src/services/domains/finance/FinanceEnterprisePart06.ts',
`        SELECT COALESCE(SUM(l.debit - l.credit), 0) as spent`,
`        SELECT COALESCE(SUM(l.debit - l.credit), 0) / 100.0 as spent`);
rep('src/services/domains/finance/FinanceEnterprisePart06.ts',
`      const allocatedAmount = Number(i.allocatedAmount);`,
`      const allocatedAmount = Number(i.allocatedAmount) / 100;`);

// Part07: budget INSERTs
rep('src/services/domains/finance/FinanceEnterprisePart07.ts',
`        VALUES (?, ?, ?, ?, ?, ?, 'APPROVED', ?, CURRENT_TIMESTAMP)`,
`        VALUES (?, ?, ?, ?, ?, ROUND(?*100), 'APPROVED', ?, CURRENT_TIMESTAMP)`);
rep('src/services/domains/finance/FinanceEnterprisePart07.ts',
`          VALUES (?, ?, ?, ?, ?)`,
`          VALUES (?, ?, ?, ROUND(?*100), ?)`);

// Part09: payment gateways + settlements
rep('src/services/domains/finance/FinanceEnterprisePart09.ts',
`      fixedFee: Number(r.fixed_fee),`,
`      fixedFee: Number(r.fixed_fee) / 100,`);
rep('src/services/domains/finance/FinanceEnterprisePart09.ts',
`        SET name = ?, provider_code = ?, gl_account_id = ?, commission_rate = ?, fixed_fee = ?,`,
`        SET name = ?, provider_code = ?, gl_account_id = ?, commission_rate = ?, fixed_fee = ROUND(?*100),`);
rep('src/services/domains/finance/FinanceEnterprisePart09.ts',
`        VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
`        VALUES (?, ?, ?, ?, ?, ROUND(?*100), ?, 1)`);
rep('src/services/domains/finance/FinanceEnterprisePart09.ts',
`      grossAmount: Number(r.gross_amount),
      commissionAmount: Number(r.commission_amount),
      taxDeduction: Number(r.tax_deduction),
      netAmount: Number(r.net_amount),`,
`      grossAmount: Number(r.gross_amount) / 100,
      commissionAmount: Number(r.commission_amount) / 100,
      taxDeduction: Number(r.tax_deduction) / 100,
      netAmount: Number(r.net_amount) / 100,`);
rep('src/services/domains/finance/FinanceEnterprisePart09.ts',
`        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SETTLED', ?, ?)`,
`        ) VALUES (?, ?, ?, ?, ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ?, ?, 'SETTLED', ?, ?)`);
