const fs = require('fs');
const f = 'src/services/domains/platform/PlatformSubscriptionService.ts';
let s = fs.readFileSync(f, 'utf8');
const rep = (a, b, all) => {
  const c = s.split(a).length - 1;
  if (!c) { console.log('MISS:', a.slice(0, 60)); return; }
  s = all ? s.split(a).join(b) : s.replace(a, b);
  console.log(`ok x${c}:`, a.slice(0, 50));
};

// subscription INSERTs (price = 8th placeholder; trial site binds literal 0 -> still fine but ROUND harmless? keep consistent: only scale the two param sites)
rep(`VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
`VALUES (?, ?, ?, ?, ?, ?, ?, ROUND(?*100), ?, 1, ?)`, true);

// price lock INSERT
rep(`VALUES (?, ?, ?, ?, ?)`,
`VALUES (?, ?, ROUND(?*100), ?, ?)`, false);

// tenant price read
rep(`      price: row.price ?? null,`,
`      price: row.price != null ? Number(row.price) / 100 : null,`);

// subscription price read
rep(`      price: toNumber(row.price, 0),
      billingCycle: row.billing_cycle,`,
`      price: toNumber(row.price, 0) / 100,
      billingCycle: row.billing_cycle,`);

fs.writeFileSync(f, s);
console.log('done');
