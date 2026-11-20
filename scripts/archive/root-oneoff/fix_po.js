const fs = require('fs');
const rep = (f, pairs) => {
  let s = fs.readFileSync(f, 'utf8');
  for (const [a, b] of pairs) {
    if (!s.includes(a)) { console.log('MISS', f.split('/').pop(), JSON.stringify(a.slice(0, 60))); continue; }
    s = s.split(a).join(b);
  }
  fs.writeFileSync(f, s);
};

// ── PurchaseOrderService ──
rep('src/services/domains/purchases/PurchaseOrderService.ts', [
  ["import { round2 } from '../finance/financials';",
   "import { round2 } from '../finance/financials';\nimport { unscaleMoneyRow } from '../../../utils/money';"],
  ["export type PurchaseOrderStatus = 'DRAFT' | 'SENT' | 'CONFIRMED' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';",
   `export type PurchaseOrderStatus = 'DRAFT' | 'SENT' | 'CONFIRMED' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';

const PO_MONEY_FIELDS = ['subtotal', 'discount_amount', 'tax_amount', 'shipping_cost', 'total_amount'] as const;`],
  ['return this.db.query<PurchaseOrderRow>(sql, params);',
   'return this.db.query<PurchaseOrderRow>(sql, params).map((row) => unscaleMoneyRow(row, PO_MONEY_FIELDS));'],
  ["i.received_m2 AS receivedM2, i.unit_cost AS unitCost, i.total_cost AS totalCost,",
   "i.received_m2 AS receivedM2, i.unit_cost / 100.0 AS unitCost, i.total_cost / 100.0 AS totalCost,"],
  ["WHERE po.id = ?\`, [id])[0];",
   "WHERE po.id = ?\`, [id]).map((row) => unscaleMoneyRow(row, PO_MONEY_FIELDS))[0];"],
  ["VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?)",
   "VALUES (?, ?, ?, ?, ?, ?, ?, ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), 'DRAFT', ?, ?)"],
  ["boxes_count, received_m2, unit_cost, total_cost\n          ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)",
   "boxes_count, received_m2, unit_cost, total_cost\n          ) VALUES (?, ?, ?, ?, ?, ?, 0, ROUND(?*100), ROUND(?*100))"],
]);

// ── PurchaseRequestService ──
rep('src/services/domains/purchases/PurchaseRequestService.ts', [
  ["(SELECT COALESCE(SUM(pri.quantity_m2 * pri.estimated_unit_cost), 0)\n           FROM purchase_request_items pri WHERE pri.request_id = pr.id) AS estimated_total",
   "(SELECT COALESCE(SUM(pri.quantity_m2 * pri.estimated_unit_cost), 0) / 100.0\n           FROM purchase_request_items pri WHERE pri.request_id = pr.id) AS estimated_total"],
  ["estimated_unit_cost, notes)\n           VALUES (?, ?, ?, ?, ?, ?, ?)",
   "estimated_unit_cost, notes)\n           VALUES (?, ?, ?, ?, ?, ROUND(?*100), ?)"],
]);
console.log('done');
