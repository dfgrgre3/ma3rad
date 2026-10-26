import type { Database } from 'sql.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { paymentAccountCode, postLedgerEntry, queryLedgerRows } from '../ledger';
import { localDateString } from '../../utils/date';
import {
  DEFAULT_SETTINGS, DEFAULT_BRANCH_ID, EXTENDED_SETTINGS_KEYS,
  tableExists, columnExists, addColumn, backfillReturnLedgerEntries,
  type Migration,
} from '../migrationSupport';

export const MIGRATION_PART_10: Migration[] = [
{
    id: '038_inventory_cost_layers',
    description: 'Create FIFO inventory cost layers and seed an estimated opening layer for existing stock',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS inventory_cost_layers (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL,
          warehouse_id TEXT NOT NULL,
          source_transaction_id TEXT,
          source_type TEXT NOT NULL,
          source_id TEXT,
          received_at TEXT NOT NULL,
          quantity_received REAL NOT NULL CHECK(quantity_received > 0),
          quantity_remaining REAL NOT NULL CHECK(quantity_remaining >= 0),
          unit_cost REAL NOT NULL CHECK(unit_cost >= 0),
          is_estimated INTEGER NOT NULL DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(product_id) REFERENCES products(id),
          FOREIGN KEY(warehouse_id) REFERENCES warehouses(id),
          FOREIGN KEY(source_transaction_id) REFERENCES inventory_transactions(id)
        );
        CREATE INDEX IF NOT EXISTS idx_inventory_cost_layers_fifo
          ON inventory_cost_layers(product_id, warehouse_id, received_at, created_at, id);
        CREATE INDEX IF NOT EXISTS idx_inventory_cost_layers_source
          ON inventory_cost_layers(source_type, source_id);
        CREATE TABLE IF NOT EXISTS inventory_cost_allocations (
          id TEXT PRIMARY KEY,
          outbound_transaction_id TEXT NOT NULL,
          layer_id TEXT NOT NULL,
          quantity REAL NOT NULL CHECK(quantity > 0),
          quantity_restored REAL NOT NULL DEFAULT 0 CHECK(quantity_restored >= 0 AND quantity_restored <= quantity),
          unit_cost REAL NOT NULL CHECK(unit_cost >= 0),
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(outbound_transaction_id) REFERENCES inventory_transactions(id),
          FOREIGN KEY(layer_id) REFERENCES inventory_cost_layers(id)
        );
        CREATE INDEX IF NOT EXISTS idx_inventory_cost_allocations_transaction
          ON inventory_cost_allocations(outbound_transaction_id);
      `);

      const stocks = queryLedgerRows<{ product_id: string; warehouse_id: string; quantity_m2: number; cost_price: number }>(db, `
        SELECT ws.product_id,ws.warehouse_id,ws.quantity_m2,p.cost_price
        FROM warehouse_stock ws JOIN products p ON p.id=ws.product_id
        WHERE ws.quantity_m2>0
      `);
      for (const stock of stocks) {
        const hasLayers = Number(queryLedgerRows<{ count: number }>(db,
          `SELECT COUNT(*) AS count FROM inventory_cost_layers WHERE product_id=? AND warehouse_id=?`,
          [stock.product_id, stock.warehouse_id])[0]?.count || 0);
        if (hasLayers) continue;
        db.run(`INSERT INTO inventory_cost_layers
          (id,product_id,warehouse_id,source_type,source_id,received_at,quantity_received,quantity_remaining,unit_cost,is_estimated)
          VALUES (?,?,?,?,?,?,?,?,?,1)`, [
          `icl_open_${uuidv4().replace(/-/g, '').slice(0, 12)}`, stock.product_id, stock.warehouse_id,
          'OPENING_ESTIMATE', null, '0001-01-01', stock.quantity_m2, stock.quantity_m2,
          Math.max(0, Number(stock.cost_price) || 0),
        ]);
      }
      db.run(`INSERT OR REPLACE INTO system_settings (key,value) VALUES ('costingMethod','FIFO')`);
    },
  },

{
    id: '039_fifo_allocation_order',
    description: 'Preserve FIFO lot order on issue allocations for accurate returns',
    up: (db) => addColumn(db, 'inventory_cost_allocations', 'allocation_order', 'INTEGER NOT NULL DEFAULT 0'),
  },

{
    id: '040_enable_fifo_costing',
    description: 'Initialize estimated opening cost layers and enable FIFO for new inventory movements',
    up: (db) => {
      const stocks = queryLedgerRows<{ product_id: string; warehouse_id: string; quantity_m2: number; cost_price: number }>(db, `
        SELECT ws.product_id,ws.warehouse_id,ws.quantity_m2,p.cost_price
        FROM warehouse_stock ws JOIN products p ON p.id=ws.product_id
        WHERE ws.quantity_m2>0 AND NOT EXISTS (
          SELECT 1 FROM inventory_cost_layers l WHERE l.product_id=ws.product_id AND l.warehouse_id=ws.warehouse_id
        )
      `);
      for (const stock of stocks) {
        db.run(`INSERT INTO inventory_cost_layers
          (id,product_id,warehouse_id,source_type,received_at,quantity_received,quantity_remaining,unit_cost,is_estimated)
          VALUES (?,?,?,'OPENING_ESTIMATE','0001-01-01',?,?,?,1)`, [
          `icl_open_${uuidv4().replace(/-/g, '').slice(0, 12)}`,stock.product_id,stock.warehouse_id,
          stock.quantity_m2,stock.quantity_m2,Math.max(0,Number(stock.cost_price)||0),
        ]);
      }
      db.run(`INSERT OR REPLACE INTO system_settings (key,value) VALUES ('costingMethod','FIFO')`);
    },
  },

{
    id: '041_backfill_legacy_fifo_returns',
    description: 'Create estimated reversible FIFO allocations for sales posted before lot tracking',
    up: (db) => {
      const issues = queryLedgerRows<{
        id: string; reference_id: string; product_id: string; warehouse_id: string;
        quantity: number; unit_cost: number; created_at: string; invoice_status: string;
      }>(db, `
        SELECT tx.id,tx.reference_id,tx.product_id,tx.warehouse_id,ABS(tx.quantity_m2) AS quantity,
               tx.unit_cost,tx.created_at,si.invoice_status
        FROM inventory_transactions tx
        JOIN sales_invoices si ON si.id=tx.reference_id
        WHERE tx.reference_type='INVOICE' AND tx.type='SALE'
        ORDER BY tx.created_at,tx.rowid
      `);
      for (const issue of issues) {
        if (queryLedgerRows(db, `SELECT id FROM inventory_cost_allocations WHERE outbound_transaction_id=? LIMIT 1`, [issue.id]).length) continue;
        const returned = Number(queryLedgerRows<{ quantity: number }>(db, `
          SELECT COALESCE(SUM(sri.quantity_m2),0) AS quantity FROM sales_return_items sri
          JOIN sales_returns sr ON sr.id=sri.return_id
          WHERE sr.original_invoice_id=? AND sri.product_id=?
        `, [issue.reference_id,issue.product_id])[0]?.quantity || 0);
        const restored = issue.invoice_status === 'VOID'
          ? Number(issue.quantity)
          : Math.min(Number(issue.quantity), Math.max(0,returned));
        const layerId = `icl_legacy_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
        db.run(`INSERT INTO inventory_cost_layers
          (id,product_id,warehouse_id,source_transaction_id,source_type,source_id,received_at,
           quantity_received,quantity_remaining,unit_cost,is_estimated)
          VALUES (?,?,?,?,?,?,?,?,0,?,1)`, [
          layerId,issue.product_id,issue.warehouse_id,issue.id,'LEGACY_SALE_RETURN',issue.id,
          String(issue.created_at || '').slice(0,10) || '0001-01-01',issue.quantity,Number(issue.unit_cost)||0,
        ]);
        db.run(`INSERT INTO inventory_cost_allocations
          (id,outbound_transaction_id,layer_id,allocation_order,quantity,quantity_restored,unit_cost)
          VALUES (?,?,?,?,?,?,?)`, [
          `icla_legacy_${uuidv4().replace(/-/g, '').slice(0, 12)}`,issue.id,layerId,0,
          issue.quantity,restored,Number(issue.unit_cost)||0,
        ]);
      }
    },
  }
];
