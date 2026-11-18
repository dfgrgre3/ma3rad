const fs = require('fs'), path = require('path');
const MONEY = {
  inventory_special_stocks: ['unit_cost', 'total_cost', 'discounted_unit_price'],
  stock_transfers: ['total_cost'],
  stock_transfer_items: ['unit_cost', 'total_cost'],
  stock_counts: ['total_variance_value'],
  stock_count_items: ['unit_cost', 'variance_value'],
  stock_adjustments: ['total_value'],
  stock_adjustment_items: ['unit_cost', 'total_value'],
  product_batches: ['cost_price'],
  product_variants: ['cost_price', 'selling_price_m2'],
  inventory_reconciliation_logs: ['total_physical_cost', 'total_fifo_layer_cost', 'total_gl_inventory_cost', 'variance_physical_vs_fifo', 'variance_fifo_vs_gl'],
  inventory_cost_layers: ['unit_cost', 'original_unit_cost', 'landed_cost_share'],
  inventory_cost_allocations: ['unit_cost'],
  price_list_items: ['price_m2', 'price_box'],
  customer_price_overrides: ['price_m2'],
};
const tableRe = new RegExp('INSERT INTO (' + Object.keys(MONEY).join('|') + ')\\s*\\(([^)]*)\\)\\s*VALUES\\s*\\(([^)]*)\\)', 'gi');
const report = [];
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (['migrations', 'schema', 'node_modules'].includes(e.name)) continue; walk(p); continue; }
    if (!/\.(ts|tsx)$/.test(e.name)) continue;
    const s = fs.readFileSync(p, 'utf8'); let changed = 0;
    const out = s.replace(tableRe, (m, t, cols, vals) => {
      const money = MONEY[t.toLowerCase()]; if (!money) return m;
      const colList = cols.split(',').map(c => c.trim().toLowerCase());
      const idxs = []; colList.forEach((c, i) => { if (money.includes(c)) idxs.push(i); });
      if (!idxs.length) return m;
      const parts = vals.split(',').map(x => x.trim());
      if (parts.length !== colList.length) return m;
      let hit = false;
      const mapped = parts.map((pp, i) => {
        if (idxs.includes(i) && pp === '?') { hit = true; return 'ROUND(?*100)'; }
        return pp;
      });
      if (hit) { changed++; return m.replace(vals, mapped.join(', ')); }
      return m;
    });
    if (changed) { fs.writeFileSync(p, out); report.push(p + ': ' + changed); }
  }
}
walk('src');
console.log(report.join('\n') || 'none');
