const fs = require('fs');
const rep = (f, pairs) => {
  let s = fs.readFileSync(f, 'utf8');
  for (const [a, b] of pairs) {
    if (!s.includes(a)) { console.log('MISS', f.split('/').pop(), JSON.stringify(a.slice(0, 60))); continue; }
    s = s.split(a).join(b);
  }
  fs.writeFileSync(f, s);
};

rep('src/services/domains/procurement/ProcurementServicePart03.ts', [
  ["batch_number, tone_shade, caliber, grade, unit_cost, inspection_notes, quality_verdict\n      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
   "batch_number, tone_shade, caliber, grade, unit_cost, inspection_notes, quality_verdict\n      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ROUND(?*100), ?, ?)"],
]);

rep('src/services/domains/procurement/ProcurementServicePart04.ts', [
  ["`SELECT product_id, unit_cost, quantity_m2 FROM purchase_order_items WHERE purchase_order_id = ?`",
   "`SELECT product_id, unit_cost / 100.0 AS unit_cost, quantity_m2 FROM purchase_order_items WHERE purchase_order_id = ?`"],
]);

rep('src/services/domains/procurement/ProcurementServicePart05.ts', [
  ["claim_type, severity, claimed_amount, agreed_amount, status, resolution_type, notes, created_by\n        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'OPEN', 'PENDING', ?, ?)",
   "claim_type, severity, claimed_amount, agreed_amount, status, resolution_type, notes, created_by\n        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ROUND(?*100), 0, 'OPEN', 'PENDING', ?, ?)"],
  ["INSERT INTO supplier_claim_items (id, claim_id, product_id, product_name, defect_type, quantity_m2, unit_cost, total_amount, notes)\n            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
   "INSERT INTO supplier_claim_items (id, claim_id, product_id, product_name, defect_type, quantity_m2, unit_cost, total_amount, notes)\n            VALUES (?, ?, ?, ?, ?, ?, ROUND(?*100), ROUND(?*100), ?)"],
]);

rep('src/services/domains/procurement/ProcurementServicePart06.ts', [
  ["SET status = 'SETTLED', resolution_type = ?, agreed_amount = ?, notes = COALESCE(?, notes)",
   "SET status = 'SETTLED', resolution_type = ?, agreed_amount = ROUND(?*100), notes = COALESCE(?, notes)"],
]);

rep('src/services/domains/procurement/ProcurementServicePart07.ts', [
  ["COALESCE(SUM(claimed_amount), 0) AS totalClaimed,", "COALESCE(SUM(claimed_amount), 0) / 100.0 AS totalClaimed,"],
  ["COALESCE(SUM(agreed_amount), 0) AS totalAgreed", "COALESCE(SUM(agreed_amount), 0) / 100.0 AS totalAgreed"],
]);

rep('src/services/domains/suppliers/SupplierService.ts', [
  ["agreed_amount as debit, created_at, notes", "agreed_amount / 100.0 as debit, created_at, notes"],
  ["COALESCE((SELECT SUM(agreed_amount) FROM supplier_claims WHERE supplier_id = ? AND status = 'SETTLED' AND resolution_type = 'DEBIT_NOTE' AND ${claimScope.clause}), 0) AS claims",
   "COALESCE((SELECT SUM(agreed_amount) FROM supplier_claims WHERE supplier_id = ? AND status = 'SETTLED' AND resolution_type = 'DEBIT_NOTE' AND ${claimScope.clause}), 0) / 100.0 AS claims"],
  ["COALESCE((SELECT SUM(agreed_amount) FROM supplier_claims WHERE supplier_id = ? AND status = 'SETTLED' AND resolution_type = 'DEBIT_NOTE' AND date < ? AND ${claimScope.clause}), 0) AS claims",
   "COALESCE((SELECT SUM(agreed_amount) FROM supplier_claims WHERE supplier_id = ? AND status = 'SETTLED' AND resolution_type = 'DEBIT_NOTE' AND date < ? AND ${claimScope.clause}), 0) / 100.0 AS claims"],
]);
console.log('done');
