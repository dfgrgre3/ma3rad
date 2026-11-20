const fs = require('fs'), path = require('path');
const tables = ['products','product_batches','product_variants','price_list_items','customer_price_overrides','inventory_transactions','inventory_cost_layers','inventory_special_stocks','stock_transfers','stock_transfer_items','stock_counts','stock_count_items','stock_adjustments','stock_adjustment_items','inventory_reconciliation_logs'];
const re = new RegExp('\\b(' + tables.join('|') + ')\\b');
const counts = {};
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!/\.(ts|tsx)$/.test(e.name)) continue;
    const s = fs.readFileSync(p, 'utf8');
    if (re.test(s)) counts[p] = (counts[p] || 0) + 1;
  }
}
walk('src');
const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
console.log('files:', entries.length);
entries.forEach(([f, c]) => console.log(c, f));
