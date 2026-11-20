const fs = require('fs');
const f = 'src/services/domains/operations/FacilityUtilityService.ts';
let s = fs.readFileSync(f, 'utf8');
const rep = (a, b) => { if (!s.includes(a)) { console.log('MISS:', a.slice(0, 70)); return; } s = s.split(a).join(b); };

// reads
rep('um.tariff_per_unit AS tariffPerUnit, um.fixed_monthly_fee AS fixedMonthlyFee,',
'um.tariff_per_unit / 100.0 AS tariffPerUnit, um.fixed_monthly_fee / 100.0 AS fixedMonthlyFee,');
rep('um.last_reading_value AS lastReadingValue, um.tariff_per_unit AS tariffPerUnit',
'um.last_reading_value AS lastReadingValue, um.tariff_per_unit / 100.0 AS tariffPerUnit');
rep('ur.consumption, ur.cost, ur.is_estimated AS isEstimated,',
'ur.consumption, ur.cost / 100.0 AS cost, ur.is_estimated AS isEstimated,');
rep('fub.due_date AS dueDate, fub.amount_due AS amountDue,',
'fub.due_date AS dueDate, fub.amount_due / 100.0 AS amountDue,');
rep('fub.amount_paid AS amountPaid, fub.consumption, fub.status,',
'fub.amount_paid / 100.0 AS amountPaid, fub.consumption, fub.status,');
rep('SELECT fub.id, fub.amount_due AS amountDue, fub.amount_paid AS amountPaid,',
'SELECT fub.id, fub.amount_due / 100.0 AS amountDue, fub.amount_paid / 100.0 AS amountPaid,');

// meter INSERT: tariff pos8, fee pos9 of 15
rep(`VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
`VALUES (?, ?, ?, ?, ?, ?, ?, ROUND(?*100), ROUND(?*100), ?, ?, ?, ?, ?, ?)`, );
// OOPS this VALUES pattern may appear once only - verify below

// meter UPDATE setField -> manual pushes
rep(`    setField('tariff_per_unit', input.tariffPerUnit !== undefined ? input.tariffPerUnit : undefined);
    setField('fixed_monthly_fee', input.fixedMonthlyFee !== undefined ? input.fixedMonthlyFee : undefined);`,
`    if (input.tariffPerUnit !== undefined) { updates.push('tariff_per_unit = ROUND(?*100)'); params.push(input.tariffPerUnit); }
    if (input.fixedMonthlyFee !== undefined) { updates.push('fixed_monthly_fee = ROUND(?*100)'); params.push(input.fixedMonthlyFee); }`);

// reading INSERT: cost pos7 of 10
rep(`         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
`         VALUES (?, ?, ?, ?, ?, ?, ROUND(?*100), ?, ?, ?)`);

// bill INSERT: amount_due pos8 of 15 (amount_paid literal 0)
rep(`VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'PENDING', ?, ?, ?, ?)`,
`VALUES (?, ?, ?, ?, ?, ?, ?, ROUND(?*100), 0, ?, 'PENDING', ?, ?, ?, ?)`);

// bill UPDATE amount_paid
rep('UPDATE facility_utility_bills SET amount_paid = ?, payment_date = ?,',
'UPDATE facility_utility_bills SET amount_paid = ROUND(?*100), payment_date = ?,');

fs.writeFileSync(f, s);
console.log('done');
