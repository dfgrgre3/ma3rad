const fs = require('fs');
const f = 'src/services/domains/platform/PlatformPlanService.ts';
let s = fs.readFileSync(f, 'utf8');
const rep = (a, b, all) => {
  const c = s.split(a).length - 1;
  if (!c) { console.log('MISS:', a.slice(0, 60)); return; }
  s = all ? s.split(a).join(b) : s.replace(a, b);
  console.log(`ok x${c}:`, a.slice(0, 50));
};

// INSERT platform_plans (create + copyPlan share identical VALUES)
rep(`VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
`VALUES (?, ?, ?, ?, ?, ROUND(?*100), ROUND(?*100), ROUND(?*100), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, true);

// UPDATE platform_plans money columns
rep(`billing_cycle = ?, price = ?, monthly_price = ?, yearly_price = ?, currency = ?,`,
`billing_cycle = ?, price = ROUND(?*100), monthly_price = ROUND(?*100), yearly_price = ROUND(?*100), currency = ?,`);

// price_history INSERT: old_price pos3, new_price pos4 (targeted)
rep(`INSERT INTO platform_price_history (id, plan_id, old_price, new_price, changed_at, changed_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
`INSERT INTO platform_price_history (id, plan_id, old_price, new_price, changed_at, changed_by)
         VALUES (?, ?, ROUND(?*100), ROUND(?*100), ?, ?)`, false);

// mapPlan + mapPlanVersion price fields
rep(`price: toNumber(row.price, 0),
      monthlyPrice: toNumber(row.monthly_price, 0),
      yearlyPrice: toNumber(row.yearly_price, 0),`,
`price: toNumber(row.price, 0) / 100,
      monthlyPrice: toNumber(row.monthly_price, 0) / 100,
      yearlyPrice: toNumber(row.yearly_price, 0) / 100,`, true);

// price history read
rep(`oldPrice: toNumber(row.old_price, 0),
      newPrice: toNumber(row.new_price, 0),`,
`oldPrice: toNumber(row.old_price, 0) / 100,
      newPrice: toNumber(row.new_price, 0) / 100,`);

// createPlanVersion INSERT: price pos7, monthly pos8, yearly pos9 of 27
rep(`VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
`VALUES (?, ?, ?, ?, ?, ?, ROUND(?*100), ROUND(?*100), ROUND(?*100), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

fs.writeFileSync(f, s);
console.log('done');
