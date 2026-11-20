const fs = require('fs');
const rep = (f, pairs) => {
  let s = fs.readFileSync(f, 'utf8');
  for (const [a, b] of pairs) {
    if (!s.includes(a)) { console.log('MISS', f.split('/').pop(), JSON.stringify(a.slice(0, 60))); continue; }
    s = s.split(a).join(b);
  }
  fs.writeFileSync(f, s);
};

// PurchaseOrderService getOrderById header row
rep('src/services/domains/purchases/PurchaseOrderService.ts', [
  ["      WHERE po.id = ?\n    `, [id])[0];",
   "      WHERE po.id = ?\n    `, [id]).map((row) => unscaleMoneyRow(row, PO_MONEY_FIELDS))[0];"],
]);

// ProcurementSupplierRfqService
rep('src/services/domains/procurement/ProcurementSupplierRfqService.ts', [
  ["import { round2 } from '../finance/financials';",
   "import { round2 } from '../finance/financials';\nimport { unscaleMoneyRow } from '../../../utils/money';"],
  ["import type { ReorderSuggestion, SupplierRfqRow, SupplierRfqItem, SupplierQuotationRow, SupplierQuotationItem } from '../../../types/procurement';",
   `import type { ReorderSuggestion, SupplierRfqRow, SupplierRfqItem, SupplierQuotationRow, SupplierQuotationItem } from '../../../types/procurement';

const QUOTE_MONEY_FIELDS = ['total_amount'] as const;
const QUOTE_ITEM_MONEY_FIELDS = ['unit_cost', 'total_cost'] as const;`],
  // quotations list q.*
  ["      ORDER BY q.total_amount ASC\n    `, [id]);",
   "      ORDER BY q.total_amount ASC\n    `, [id]).map((row) => unscaleMoneyRow(row, QUOTE_MONEY_FIELDS));"],
  // quotation items qi.* inside getRfqById loop
  ["        WHERE qi.quotation_id = ?\n      `, [qid]));",
   "        WHERE qi.quotation_id = ?\n      `, [qid]).map((row) => unscaleMoneyRow(row, QUOTE_ITEM_MONEY_FIELDS)));"],
  // fallback: items query may use different param name — handled below if MISS
  // INSERT supplier_quotations total_amount
  ["total_amount, delivery_days, payment_terms, quality_rating, status, notes\n        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SUBMITTED', ?)",
   "total_amount, delivery_days, payment_terms, quality_rating, status, notes\n        ) VALUES (?, ?, ?, ?, ?, ?, ROUND(?*100), ?, ?, ?, 'SUBMITTED', ?)"],
  // INSERT supplier_quotation_items
  ["VALUES (?, ?, ?, ?, ?, ?, ?, ?)\n        `, [`sqi_",
   "VALUES (?, ?, ?, ?, ?, ROUND(?*100), ROUND(?*100), ?)\n        `, [`sqi_"],
  // res query q.* after insert
  ["FROM supplier_quotations q JOIN suppliers s ON s.id = q.supplier_id WHERE q.id = ?\n      `, [quoteId])[0];",
   "FROM supplier_quotations q JOIN suppliers s ON s.id = q.supplier_id WHERE q.id = ?\n      `, [quoteId]).map((row) => unscaleMoneyRow(row, QUOTE_MONEY_FIELDS))[0];"],
  // awardQuotation quote row
  ["SELECT q.*, s.name AS supplierName FROM supplier_quotations q JOIN suppliers s ON s.id = q.supplier_id WHERE q.id = ?\n    `, [quotationId])[0];",
   "SELECT q.*, s.name AS supplierName FROM supplier_quotations q JOIN suppliers s ON s.id = q.supplier_id WHERE q.id = ?\n    `, [quotationId]).map((row) => unscaleMoneyRow(row, QUOTE_MONEY_FIELDS))[0];"],
  // awardQuotation items qi.*
  ["FROM supplier_quotation_items qi LEFT JOIN products p ON p.id = qi.product_id WHERE qi.quotation_id = ?\n    `, [quotationId]);",
   "FROM supplier_quotation_items qi LEFT JOIN products p ON p.id = qi.product_id WHERE qi.quotation_id = ?\n    `, [quotationId]).map((row) => unscaleMoneyRow(row, QUOTE_ITEM_MONEY_FIELDS));"],
  // PO insert from award: subtotal + total_amount
  ["VALUES (?, ?, ?, ?, ?, NULL, ?, 0, 0, 0, ?, 'SENT', ?, ?)",
   "VALUES (?, ?, ?, ?, ?, NULL, ROUND(?*100), 0, 0, 0, ROUND(?*100), 'SENT', ?, ?)"],
  // PO items insert
  ["received_m2, unit_cost, total_cost\n            ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)",
   "received_m2, unit_cost, total_cost\n            ) VALUES (?, ?, ?, ?, ?, ?, 0, ROUND(?*100), ROUND(?*100))"],
]);
console.log('done');
