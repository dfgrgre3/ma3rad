const fs = require('fs');
const s = fs.readFileSync('src/services/domains/customers/PartnerService.ts', 'utf8');
for (const m of s.matchAll(/INSERT INTO partner_account_transactions[\s\S]*?VALUES \(([\s\S]*?)\)\s*`,/g)) {
  const exprs = m[1].split(',').map((x) => x.trim());
  const line = s.slice(0, m.index).split('\n').length;
  console.log('line', line, 'exprs:', exprs.length);
  console.log(' ', exprs.join(' | '));
}
