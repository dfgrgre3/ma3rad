import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { STOCK_LEDGER_BALANCE_AMOUNT } from '../src/pages/inventory/stock-ledger/stockLedgerBalance.ts';

const db = DatabaseManager.getInstance();

test('stock ledger running balance does not subtract transfer losses twice', async () => {
  await db.initialize();
  const adminId = db.query<{ id: string }>(`SELECT id FROM users WHERE username = 'admin'`)[0]?.id;
  assert.ok(adminId, 'Admin user must exist');

  const warehouseId = 'wh_ledger_loss';
  const productId = 'prod_ledger_loss';
  db.run(`INSERT OR IGNORE INTO warehouses (id, code, name, branch_id, is_active) VALUES (?, 'WH-LOSS', 'مخزن اختبار الفقد', 'br_main', 1)`, [warehouseId]);
  db.run(`INSERT OR IGNORE INTO categories (id, name) VALUES ('cat_ledger_loss', 'تصنيف اختبار الفقد')`);
  db.run(`INSERT OR IGNORE INTO brands (id, name) VALUES ('brand_ledger_loss', 'ماركة اختبار الفقد')`);
  db.run(`INSERT OR IGNORE INTO products (
    id, sku, barcode, name, category_id, brand_id, size, base_unit, sell_unit,
    cost_price, selling_price_m2, is_active
  ) VALUES (?, 'SKU-LOSS', 'BAR-LOSS', 'صنف اختبار الفقد', 'cat_ledger_loss', 'brand_ledger_loss', '60x60', 'M2', 'M2', 100, 150, 1)`, [productId]);

  const rows: Array<{ id: string; type: string; qty: number; refType: string; at: string; number: string }> = [
    { id: 'tx_loss_open', type: 'OPENING_BALANCE', qty: 100, refType: 'SYSTEM_INIT', at: '2026-01-01 10:00:00', number: 'TX-LOSS-1' },
    { id: 'tx_loss_out', type: 'TRANSFER_OUT', qty: -30, refType: 'TRANSFER', at: '2026-01-02 10:00:00', number: 'TX-LOSS-2' },
    { id: 'tx_loss_damage', type: 'DAMAGE', qty: -3, refType: 'TRANSFER_LOSS', at: '2026-01-03 10:00:00', number: 'TX-LOSS-3' },
  ];
  for (const row of rows) {
    db.run(`INSERT INTO inventory_transactions (
      id, transaction_number, type, product_id, warehouse_id, quantity_m2, boxes_count,
      unit_cost, total_cost, reference_type, reference_id, notes, performed_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 0, 100, ?, ?, 'trf_loss_test', 'اختبار فقد التحويل', ?, ?)`, [
      row.id, row.number, row.type, productId, warehouseId, row.qty, row.qty * 100, row.refType, adminId, row.at,
    ]);
  }

  const balances = db.query<{ id: string; previousBalance: number; balance: number }>(`
    WITH balances AS (
      SELECT it.id,
        COALESCE(SUM(${STOCK_LEDGER_BALANCE_AMOUNT}) OVER (
          PARTITION BY it.product_id, it.warehouse_id
          ORDER BY it.created_at ASC, it.rowid ASC
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ), 0) AS previous_balance,
        SUM(${STOCK_LEDGER_BALANCE_AMOUNT}) OVER (
          PARTITION BY it.product_id, it.warehouse_id
          ORDER BY it.created_at ASC, it.rowid ASC
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS balance
      FROM inventory_transactions it
      JOIN warehouses w ON w.id = it.warehouse_id
      WHERE w.id = ?
    )
    SELECT b.id, b.previous_balance AS previousBalance, b.balance AS balance
    FROM balances b
    JOIN inventory_transactions it ON it.id = b.id
    ORDER BY it.created_at ASC, it.rowid ASC
  `, [warehouseId]);

  const byId = new Map(balances.map((row) => [row.id, row]));
  assert.equal(byId.get('tx_loss_open')?.balance, 100);
  assert.equal(byId.get('tx_loss_out')?.balance, 70);
  assert.equal(byId.get('tx_loss_damage')?.balance, 70, 'The loss is already inside the 30 shipped units');
  assert.equal(byId.get('tx_loss_damage')?.previousBalance, 70);
});
