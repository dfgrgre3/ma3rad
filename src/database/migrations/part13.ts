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

export const MIGRATION_PART_13: Migration[] = [
{
    id: '048_inventory_warehouse_professional',
    description: 'Add warehouse locations, shelf barcodes, special stock management, reconciliation logs, and transfer/count enhancements',
    up: (db) => {
      // 1. Products replenishment columns
      addColumn(db, 'products', 'reorder_point', 'REAL DEFAULT 20');
      addColumn(db, 'products', 'safety_stock', 'REAL DEFAULT 10');
      addColumn(db, 'products', 'lead_time_days', 'INTEGER DEFAULT 7');

      // 2. Stock count columns
      addColumn(db, 'stock_counts', 'is_blind', 'INTEGER DEFAULT 0');
      addColumn(db, 'stock_counts', 'approval_status', 'TEXT DEFAULT "PENDING"');
      addColumn(db, 'stock_counts', 'approved_by', 'TEXT');
      addColumn(db, 'stock_counts', 'approved_at', 'TEXT');
      addColumn(db, 'stock_counts', 'rejection_reason', 'TEXT');

      // 3. Stock count items columns
      addColumn(db, 'stock_count_items', 'discrepancy_reason', 'TEXT');
      addColumn(db, 'stock_count_items', 'action_plan', 'TEXT');

      // 4. Stock transfers lifecycle columns
      addColumn(db, 'stock_transfers', 'approved_by', 'TEXT');
      addColumn(db, 'stock_transfers', 'approved_at', 'TEXT');
      addColumn(db, 'stock_transfers', 'dispatched_by', 'TEXT');
      addColumn(db, 'stock_transfers', 'dispatched_at', 'TEXT');
      addColumn(db, 'stock_transfers', 'total_shipped_m2', 'REAL DEFAULT 0');
      addColumn(db, 'stock_transfers', 'total_received_m2', 'REAL DEFAULT 0');
      addColumn(db, 'stock_transfers', 'total_lost_m2', 'REAL DEFAULT 0');
      addColumn(db, 'stock_transfers', 'rejection_reason', 'TEXT');

      // 5. Stock transfer items columns
      addColumn(db, 'stock_transfer_items', 'shipped_m2', 'REAL NOT NULL DEFAULT 0');
      addColumn(db, 'stock_transfer_items', 'received_m2', 'REAL NOT NULL DEFAULT 0');
      addColumn(db, 'stock_transfer_items', 'lost_m2', 'REAL NOT NULL DEFAULT 0');
      addColumn(db, 'stock_transfer_items', 'damaged_m2', 'REAL NOT NULL DEFAULT 0');
      addColumn(db, 'stock_transfer_items', 'item_notes', 'TEXT');

      // 6. Create tables
      db.exec(`
        CREATE TABLE IF NOT EXISTS warehouse_locations (
          id TEXT PRIMARY KEY,
          warehouse_id TEXT NOT NULL,
          zone TEXT NOT NULL,
          aisle TEXT NOT NULL,
          shelf TEXT NOT NULL,
          bin TEXT NOT NULL,
          barcode TEXT UNIQUE NOT NULL,
          max_capacity_m2 REAL DEFAULT 0,
          notes TEXT,
          is_active INTEGER DEFAULT 1,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS product_location_stock (
          id TEXT PRIMARY KEY,
          location_id TEXT NOT NULL,
          product_id TEXT NOT NULL,
          quantity_m2 REAL NOT NULL DEFAULT 0,
          last_moved_at TEXT DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(location_id, product_id),
          FOREIGN KEY (location_id) REFERENCES warehouse_locations(id) ON DELETE CASCADE,
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS inventory_special_stocks (
          id TEXT PRIMARY KEY,
          special_number TEXT UNIQUE NOT NULL,
          warehouse_id TEXT NOT NULL,
          product_id TEXT NOT NULL,
          category TEXT NOT NULL CHECK(category IN ('DAMAGED', 'BROKEN', 'DISPLAY_SAMPLE', 'NON_SELLABLE_RETURN', 'QUARANTINE_INSPECTION')),
          quantity_m2 REAL NOT NULL,
          boxes_count REAL DEFAULT 0,
          unit_cost REAL NOT NULL DEFAULT 0,
          total_cost REAL NOT NULL DEFAULT 0,
          status TEXT DEFAULT 'RECORDED' CHECK(status IN ('RECORDED', 'INSPECTED', 'DOWNGRADED_SALE', 'WRITTEN_OFF', 'RESTORED_TO_STOCK')),
          source_type TEXT,
          source_id TEXT,
          inspection_notes TEXT,
          inspected_by TEXT,
          inspected_at TEXT,
          resolution_notes TEXT,
          resolved_by TEXT,
          resolved_at TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
          FOREIGN KEY (product_id) REFERENCES products(id),
          FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS inventory_reconciliation_logs (
          id TEXT PRIMARY KEY,
          reconciliation_date TEXT NOT NULL,
          warehouse_id TEXT,
          total_physical_cost REAL NOT NULL,
          total_fifo_layer_cost REAL NOT NULL,
          total_gl_inventory_cost REAL NOT NULL,
          variance_physical_vs_fifo REAL NOT NULL,
          variance_fifo_vs_gl REAL NOT NULL,
          status TEXT DEFAULT 'BALANCED' CHECK(status IN ('BALANCED', 'DISCREPANCY_DETECTED', 'RESOLVED')),
          notes TEXT,
          performed_by TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
          FOREIGN KEY (performed_by) REFERENCES users(id)
        );

        CREATE TRIGGER IF NOT EXISTS trg_prevent_update_inv_tx BEFORE UPDATE ON inventory_transactions
        BEGIN
          SELECT RAISE(ABORT, 'Inventory ledger is immutable. Update is prohibited.');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_prevent_delete_inv_tx BEFORE DELETE ON inventory_transactions
        BEGIN
          SELECT RAISE(ABORT, 'Inventory ledger is immutable. Delete is prohibited.');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_prevent_excess_reservation_insert BEFORE INSERT ON warehouse_stock
        WHEN (ROUND(NEW.reserved_m2, 3) > ROUND(NEW.quantity_m2, 3))
        BEGIN
          SELECT RAISE(ABORT, 'Reserved stock cannot exceed total physical stock.');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_prevent_excess_reservation_update BEFORE UPDATE ON warehouse_stock
        WHEN (ROUND(NEW.reserved_m2, 3) > ROUND(NEW.quantity_m2, 3))
        BEGIN
          SELECT RAISE(ABORT, 'Reserved stock cannot exceed total physical stock.');
        END;
      `);

    },
  }
];
