const fs = require('fs');
const f = 'src/services/domains/customers/PartnerService.ts';
let s = fs.readFileSync(f, 'utf8');
const rep = (re, b, label) => {
  if (!re.test(s)) { console.log('MISS:', label); return; }
  s = s.replace(re, b);
};

rep(/END\), 0\) AS \$\{alias\}`;/, 'END), 0) / 100.0 AS ${alias}`;', 'typeTotal');
rep(/END\), 0\) AS adjustments,\s*\r?\n\s*COALESCE\(SUM\(t\.balance_effect\), 0\) AS netBalance/, 'END), 0) / 100.0 AS adjustments,\n  COALESCE(SUM(t.balance_effect), 0) / 100.0 AS netBalance', 'adjustments/netBalance');
rep(/p\.capital_amount AS capitalAmount,/, 'p.capital_amount / 100.0 AS capitalAmount,', 'capitalAmount');
rep(/END\), 0\)\) AS remainingCapital/, 'END), 0)) / 100.0 AS remainingCapital', 'remainingCapital');
rep(/h\.old_amount AS oldValue, h\.new_amount AS newValue,/, 'h.old_amount / 100.0 AS oldValue, h.new_amount / 100.0 AS newValue,', 'capitalHistory');
rep(/SELECT COALESCE\(SUM\(t\.balance_effect\), 0\) AS balance/, 'SELECT COALESCE(SUM(t.balance_effect), 0) / 100.0 AS balance', 'openingBalance');
rep(/t\.amount, t\.balance_effect AS balanceEffect, t\.transaction_date AS transactionDate,/, 't.amount / 100.0 AS amount, t.balance_effect / 100.0 AS balanceEffect, t.transaction_date AS transactionDate,', 'stmtRows');
rep(/t\.amount, t\.balance_effect AS balanceEffect, t\.payment_type AS paymentType,/, 't.amount / 100.0 AS amount, t.balance_effect / 100.0 AS balanceEffect, t.payment_type AS paymentType,', 'reversalRow');

rep(/profit_share_percent, capital_amount, notes, created_by\)\s*\r?\n\s*VALUES \(\?, \?, \?, \?, \?, \?, \?, \?, \?, \?\)/, 'profit_share_percent, capital_amount, notes, created_by)\n        VALUES (?, ?, ?, ?, ?, ?, ?, ROUND(?*100), ?, ?)', 'partnersInsert');
rep(/profit_share_percent = \?, capital_amount = \?, notes = \?,/, 'profit_share_percent = ?, capital_amount = ROUND(?*100), notes = ?,', 'partnersUpdate');
rep(/old_amount, new_amount, effective_date, reason, created_by\)\s*\r?\n\s*VALUES \(\?, \?, \?, \?, \?, \?, \?, \?\)/, 'old_amount, new_amount, effective_date, reason, created_by)\n      ) VALUES (?, ?, ?, ROUND(?*100), ROUND(?*100), ?, ?, ?)', 'capitalHistoryInsert');

rep(/'REVERSAL', \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?\)/, "'REVERSAL', ?, ROUND(?*100), ROUND(?*100), ?, ?, ?, ?, ?, ?, ?, ?, ?)", 'reversalInsert');
rep(/'PROFIT_ALLOCATION', \?, \?, \?, \?, \?, \?, \?, \?, \?, \?\)/, "'PROFIT_ALLOCATION', ?, ROUND(?*100), ROUND(?*100), ?, ?, ?, ?, ?, ?, ?)", 'profitAllocInsert');
rep(/attachments_json, created_by\)\s*\r?\n\s*VALUES \(\?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?\)/, 'attachments_json, created_by)\n      ) VALUES (?, ?, ?, ?, ?, ROUND(?*100), ROUND(?*100), ?, ?, ?, ?, ?, ?, ?, ?, ?)', 'mainTxnInsert');
rep(/reversal_of_id, reversal_of_type, created_by\)\s*\r?\n\s*VALUES \(\?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?\)/, 'reversal_of_id, reversal_of_type, created_by)\n      ) VALUES (?, ?, ?, ?, ?, ROUND(?*100), ROUND(?*100), ?, ?, ?, ?, ?, ?, ?, ?, ?)', 'adjustInsert');

fs.writeFileSync(f, s);
console.log('done');
