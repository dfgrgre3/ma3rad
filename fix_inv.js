const fs = require('fs');
const f = 'src/services/domains/platform/PlatformInvoiceService.ts';
let s = fs.readFileSync(f, 'utf8');
const rep = (a, b, all) => {
  const c = s.split(a).length - 1;
  if (!c) { console.log('MISS:', a.slice(0, 60)); return; }
  s = all ? s.split(a).join(b) : s.replace(a, b);
  console.log(`ok x${c}:`, a.slice(0, 50));
};

// invoice INSERT: subtotal,discount,tax,total = placeholders 9-12
rep(`VALUES (?, ?, ?, ?, ?, ?, ?, 'EGP', ?, ?, ?, ?, 0, ?, ?, ?)`,
`VALUES (?, ?, ?, ?, ?, ?, ?, 'EGP', ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), 0, ?, ?, ?)`);

// invoice items INSERT: unit_price, total = placeholders 5,6 (targeted)
rep(`INSERT INTO platform_invoice_items (id, invoice_id, description, quantity, unit_price, total, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
`INSERT INTO platform_invoice_items (id, invoice_id, description, quantity, unit_price, total, created_at)
         VALUES (?, ?, ?, ?, ROUND(?*100), ROUND(?*100), ?)`, false);

// payments INSERT: amount = placeholder 4
rep(`INSERT INTO platform_payments
        (id, tenant_id, invoice_id, amount, method, reference, paid_at, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
`INSERT INTO platform_payments
        (id, tenant_id, invoice_id, amount, method, reference, paid_at, notes, created_at)
       VALUES (?, ?, ?, ROUND(?*100), ?, ?, ?, ?, ?)`);

// paid_amount updates
rep(`paid_amount = paid_amount + ?, updated_at = ?`,
`paid_amount = paid_amount + ROUND(?*100), updated_at = ?`, true);
rep(`paid_amount = paid_amount - ?, updated_at = ?`,
`paid_amount = paid_amount - ROUND(?*100), updated_at = ?`, true);

// mapInvoice fields
rep(`subtotal: toNumber(row.subtotal, 0),
      discount: toNumber(row.discount, 0),
      tax: toNumber(row.tax, 0),
      total: toNumber(row.total, 0),
      paidAmount: toNumber(row.paid_amount, 0),`,
`subtotal: toNumber(row.subtotal, 0) / 100,
      discount: toNumber(row.discount, 0) / 100,
      tax: toNumber(row.tax, 0) / 100,
      total: toNumber(row.total, 0) / 100,
      paidAmount: toNumber(row.paid_amount, 0) / 100,`);

// mapPayment amount
rep(`      amount: toNumber(row.amount, 0),
      method: row.method,`,
`      amount: toNumber(row.amount, 0) / 100,
      method: row.method,`);

fs.writeFileSync(f, s);
console.log('done');
