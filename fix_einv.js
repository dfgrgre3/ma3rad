const fs = require('fs');
const f = 'src/services/domains/sales/ElectronicInvoiceService.ts';
let s = fs.readFileSync(f, 'utf8');
const orig = s;

// 1) INSERT: scale money params to piastres
const insOld = `) VALUES (?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?)`;
const insNew = `) VALUES (?, ?, ?, ?, 'DRAFT', ROUND(?*100), ROUND(?*100), ?, ?, ?)`;
if (!s.includes(insOld)) { console.log('MISS insert'); } else { s = s.split(insOld).join(insNew); }

// 2) unscale wildcard reads
const read1 = `    \`, [id, ...branch.params, ...company.params]);
    return rows[0] || null;`;
const read1n = `    \`, [id, ...branch.params, ...company.params]);
    return rows[0] ? unscaleMoneyRow(rows[0], ['total_tax','total_amount']) : null;`;
if (!s.includes(read1)) { console.log('MISS read1'); } else { s = s.split(read1).join(read1n); }

const read2 = `    \`, [salesInvoiceId, ...branch.params, ...company.params])[0] || null;`;
const read2n = `    \`, [salesInvoiceId, ...branch.params, ...company.params]).map((row) => unscaleMoneyRow(row, ['total_tax','total_amount']))[0] || null;`;
if (!s.includes(read2)) { console.log('MISS read2'); } else { s = s.split(read2).join(read2n); }

fs.writeFileSync(f, s);
console.log(s === orig ? 'NO CHANGE' : 'written');
console.log('ROUND count:', (s.match(/ROUND\(\?\*100\)/g) || []).length);
console.log('unscaleMoneyRow count:', (s.match(/unscaleMoneyRow/g) || []).length);
