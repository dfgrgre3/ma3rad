const fs = require('fs'), path = require('path');
const cols = 'unit_cost|total_cost|cost_price|price_m2|price_box|total_value|variance_value|total_variance_value|discounted_unit_price|selling_price_m2|selling_price_box|wholesale_price_m2|min_selling_price_m2|original_unit_cost|landed_cost_share|total_physical_cost|total_fifo_layer_cost|total_gl_inventory_cost|variance_physical_vs_fifo|variance_fifo_vs_gl';
const re = new RegExp('(' + cols + ')');
const scaled = /\/\s*100\.0|ROUND\(\?\s*\*\s*100\)|100\.0\s*\*|\/\s*100\b|\*\s*100\b/;
const hits = [];
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (['migrations', 'schema', 'node_modules'].includes(e.name)) continue; walk(p); continue; }
    if (!/\.(ts|tsx)$/.test(e.name)) continue;
    const lines = fs.readFileSync(p, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (re.test(l) && !scaled.test(l)) hits.push(p + ':' + (i + 1) + ': ' + l.trim().slice(0, 130));
    }
  }
}
walk('src');
fs.writeFileSync('money2.txt', hits.join('\n'));
console.log(hits.length);
