const fs = require('fs');
const f = 'src/services/domains/inventory/InventoryIntelligenceService.ts';
let s = fs.readFileSync(f, 'utf8');
const reps = [
  ['COALESCE(p.selling_price_m2, 0) AS listSellingPriceM2,', 'COALESCE(p.selling_price_m2, 0) / 100.0 AS listSellingPriceM2,'],
  ['COALESCE(p.cost_price, 0)       AS listCostPrice,', 'COALESCE(p.cost_price, 0) / 100.0       AS listCostPrice,'],
  ['COALESCE(p.cost_price, 0)   AS unitCost,', 'COALESCE(p.cost_price, 0) / 100.0   AS unitCost,'],
  ['COALESCE(sci.unit_cost, 0)           AS unitCost,', 'COALESCE(sci.unit_cost, 0) / 100.0           AS unitCost,'],
  ['COALESCE(sci.variance_value, 0)      AS varianceValue,', 'COALESCE(sci.variance_value, 0) / 100.0      AS varianceValue,'],
];
for (const [a, b] of reps) {
  if (!s.includes(a)) console.log('MISS:', a.slice(0, 50));
  else s = s.split(a).join(b);
}
fs.writeFileSync(f, s);
console.log('done');
const lines = s.split('\n');
lines.forEach((l, i) => {
  if (/cost_price|selling_price_m2|unit_cost|total_cost|price_m2|variance_value|total_value/.test(l) && !/\/\s*100|ROUND\(|\*\s*100/.test(l)) {
    console.log((i + 1) + ': ' + l.trim().slice(0, 140));
  }
});
