const fs = require('fs');
const f = 'src/services/domains/platform/PlatformTenantService.ts';
let s = fs.readFileSync(f, 'utf8');
const rep = (a, b, all) => {
  const c = s.split(a).length - 1;
  if (!c) { console.log('MISS:', a.slice(0, 60)); return; }
  s = all ? s.split(a).join(b) : s.replace(a, b);
  console.log(`ok x${c}:`, a.slice(0, 50));
};

// list query: planPrice + outstanding
rep(`p.name AS planName, p.price AS planPrice,`,
`p.name AS planName, p.price / 100.0 AS planPrice,`);
rep(`SELECT SUM(total - COALESCE(paid_amount, 0))
                FROM platform_invoices i
                WHERE i.tenant_id = t.id AND i.status IN ('SENT','PARTIAL','OVERDUE')
              ), 0) AS outstanding`,
`SELECT SUM(total - COALESCE(paid_amount, 0)) / 100.0
                FROM platform_invoices i
                WHERE i.tenant_id = t.id AND i.status IN ('SENT','PARTIAL','OVERDUE')
              ), 0) AS outstanding`);

// tenant price reads (list + get)
rep(`      price: row.price ?? null,`,
`      price: row.price != null ? Number(row.price) / 100 : null,`, true);

// INSERT platform_tenants: 22 placeholders, price = 20th
rep(`VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
`VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ROUND(?*100), ?, ?)`);

// trial subscription INSERT: price = 8th placeholder after 'TRIAL'
rep(`VALUES (?, ?, ?, 'TRIAL', ?, ?, ?, ?, ?, 1, ?)`,
`VALUES (?, ?, ?, 'TRIAL', ?, ?, ?, ROUND(?*100), ?, 1, ?)`);

// mapPlan + mapSubscription price fields
rep(`price: toNumber(row.price, 0),
      monthlyPrice: toNumber(row.monthly_price, 0),
      yearlyPrice: toNumber(row.yearly_price, 0),`,
`price: toNumber(row.price, 0) / 100,
      monthlyPrice: toNumber(row.monthly_price, 0) / 100,
      yearlyPrice: toNumber(row.yearly_price, 0) / 100,`, true);
rep(`      price: toNumber(row.price, 0),
      billingCycle: row.billing_cycle,`,
`      price: toNumber(row.price, 0) / 100,
      billingCycle: row.billing_cycle,`);

fs.writeFileSync(f, s);
console.log('done');
