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

export const MIGRATION_PART_12: Migration[] = [
{
    id: '047_purchasing_full_lifecycle',
    description: 'Add RFQ, independent GRN inspection, claims, landed cost and 3-way matching columns',
    up: (db) => {
      // 1. Columns for purchase_invoices
      addColumn(db, 'purchase_invoices', 'grn_id', 'TEXT');
      addColumn(db, 'purchase_invoices', 'purchase_order_id', 'TEXT');
      addColumn(db, 'purchase_invoices', 'landed_freight', 'REAL DEFAULT 0');
      addColumn(db, 'purchase_invoices', 'landed_loading', 'REAL DEFAULT 0');
      addColumn(db, 'purchase_invoices', 'landed_customs_taxes', 'REAL DEFAULT 0');
      addColumn(db, 'purchase_invoices', 'landed_insurance', 'REAL DEFAULT 0');
      addColumn(db, 'purchase_invoices', 'landed_other', 'REAL DEFAULT 0');
      addColumn(db, 'purchase_invoices', 'landed_allocation_method', 'TEXT DEFAULT "VALUE"');
      addColumn(db, 'purchase_invoices', 'is_no_number_supplier', 'INTEGER DEFAULT 0');
      addColumn(db, 'purchase_invoices', 'matching_status', 'TEXT DEFAULT "MATCHED"');
      addColumn(db, 'purchase_invoices', 'price_variance_amount', 'REAL DEFAULT 0');
      addColumn(db, 'purchase_invoices', 'qty_variance_amount', 'REAL DEFAULT 0');

      // 2. Columns for purchase_invoice_items
      addColumn(db, 'purchase_invoice_items', 'landed_cost_share', 'REAL DEFAULT 0');
      addColumn(db, 'purchase_invoice_items', 'effective_unit_cost', 'REAL DEFAULT 0');
      addColumn(db, 'purchase_invoice_items', 'ordered_unit_cost', 'REAL DEFAULT 0');
      addColumn(db, 'purchase_invoice_items', 'grn_accepted_qty', 'REAL DEFAULT 0');

      // 3. Columns for purchase_requests
      addColumn(db, 'purchase_requests', 'estimated_total', 'REAL DEFAULT 0');
      addColumn(db, 'purchase_requests', 'approval_tier', 'TEXT DEFAULT "LEVEL_1"');

      // 4. Tables
      db.exec(`
        CREATE TABLE IF NOT EXISTS supplier_rfqs (
          id TEXT PRIMARY KEY,
          rfq_number TEXT UNIQUE NOT NULL,
          date TEXT NOT NULL,
          due_date TEXT,
          status TEXT DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'EVALUATING', 'AWARDED', 'CANCELLED')),
          notes TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS supplier_rfq_items (
          id TEXT PRIMARY KEY,
          rfq_id TEXT NOT NULL,
          product_id TEXT NOT NULL,
          product_name TEXT NOT NULL,
          quantity_m2 REAL NOT NULL,
          notes TEXT,
          FOREIGN KEY (rfq_id) REFERENCES supplier_rfqs(id) ON DELETE CASCADE,
          FOREIGN KEY (product_id) REFERENCES products(id)
        );

        CREATE TABLE IF NOT EXISTS supplier_quotations (
          id TEXT PRIMARY KEY,
          rfq_id TEXT NOT NULL,
          supplier_id TEXT NOT NULL,
          quotation_number TEXT NOT NULL,
          date TEXT NOT NULL,
          valid_until TEXT,
          total_amount REAL NOT NULL DEFAULT 0,
          delivery_days INTEGER DEFAULT 7,
          payment_terms TEXT DEFAULT 'CASH',
          quality_rating TEXT DEFAULT 'GRADE_1',
          status TEXT DEFAULT 'SUBMITTED' CHECK(status IN ('SUBMITTED', 'ACCEPTED', 'REJECTED')),
          notes TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (rfq_id) REFERENCES supplier_rfqs(id) ON DELETE CASCADE,
          FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
        );

        CREATE TABLE IF NOT EXISTS supplier_quotation_items (
          id TEXT PRIMARY KEY,
          quotation_id TEXT NOT NULL,
          rfq_item_id TEXT,
          product_id TEXT NOT NULL,
          quantity_m2 REAL NOT NULL,
          unit_cost REAL NOT NULL,
          total_cost REAL NOT NULL,
          notes TEXT,
          FOREIGN KEY (quotation_id) REFERENCES supplier_quotations(id) ON DELETE CASCADE,
          FOREIGN KEY (product_id) REFERENCES products(id)
        );

        CREATE TABLE IF NOT EXISTS goods_receipt_notes (
          id TEXT PRIMARY KEY,
          grn_number TEXT UNIQUE NOT NULL,
          date TEXT NOT NULL,
          purchase_order_id TEXT,
          supplier_id TEXT NOT NULL,
          warehouse_id TEXT NOT NULL,
          delivery_note_number TEXT,
          vehicle_number TEXT,
          driver_name TEXT,
          status TEXT DEFAULT 'ACCEPTED' CHECK(status IN ('PENDING_INSPECTION', 'ACCEPTED', 'ACCEPTED_WITH_REMARKS', 'REJECTED')),
          total_received_m2 REAL NOT NULL DEFAULT 0,
          total_accepted_m2 REAL NOT NULL DEFAULT 0,
          total_damaged_m2 REAL NOT NULL DEFAULT 0,
          total_shortage_m2 REAL NOT NULL DEFAULT 0,
          notes TEXT,
          inspected_by TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE SET NULL,
          FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
          FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
          FOREIGN KEY (inspected_by) REFERENCES users(id),
          FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS goods_receipt_note_items (
          id TEXT PRIMARY KEY,
          grn_id TEXT NOT NULL,
          purchase_order_item_id TEXT,
          product_id TEXT NOT NULL,
          product_name TEXT NOT NULL,
          ordered_quantity_m2 REAL NOT NULL DEFAULT 0,
          received_quantity_m2 REAL NOT NULL DEFAULT 0,
          accepted_quantity_m2 REAL NOT NULL DEFAULT 0,
          damaged_quantity_m2 REAL NOT NULL DEFAULT 0,
          shortage_quantity_m2 REAL NOT NULL DEFAULT 0,
          batch_number TEXT,
          tone_shade TEXT,
          caliber TEXT,
          grade TEXT DEFAULT 'GRADE_1',
          unit_cost REAL NOT NULL DEFAULT 0,
          inspection_notes TEXT,
          quality_verdict TEXT DEFAULT 'PASS' CHECK(quality_verdict IN ('PASS', 'DEFECT', 'REJECT')),
          FOREIGN KEY (grn_id) REFERENCES goods_receipt_notes(id) ON DELETE CASCADE,
          FOREIGN KEY (product_id) REFERENCES products(id)
        );

        CREATE TABLE IF NOT EXISTS supplier_claims (
          id TEXT PRIMARY KEY,
          claim_number TEXT UNIQUE NOT NULL,
          date TEXT NOT NULL,
          supplier_id TEXT NOT NULL,
          purchase_invoice_id TEXT,
          grn_id TEXT,
          purchase_order_id TEXT,
          claim_type TEXT NOT NULL DEFAULT 'DAMAGE_DEFECT' CHECK(claim_type IN ('SHORTAGE', 'DAMAGE_DEFECT', 'PRICE_DIFFERENCE', 'LATE_DELIVERY', 'OTHER')),
          severity TEXT DEFAULT 'MEDIUM' CHECK(severity IN ('LOW', 'MEDIUM', 'CRITICAL')),
          claimed_amount REAL NOT NULL DEFAULT 0,
          agreed_amount REAL NOT NULL DEFAULT 0,
          status TEXT DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'UNDER_REVIEW', 'APPROVED', 'SETTLED', 'REJECTED')),
          resolution_type TEXT DEFAULT 'PENDING' CHECK(resolution_type IN ('DEBIT_NOTE', 'REPLACEMENT', 'REFUND', 'PENDING', 'NONE')),
          notes TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
          FOREIGN KEY (purchase_invoice_id) REFERENCES purchase_invoices(id) ON DELETE SET NULL,
          FOREIGN KEY (grn_id) REFERENCES goods_receipt_notes(id) ON DELETE SET NULL,
          FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE SET NULL,
          FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS supplier_claim_items (
          id TEXT PRIMARY KEY,
          claim_id TEXT NOT NULL,
          product_id TEXT NOT NULL,
          product_name TEXT NOT NULL,
          defect_type TEXT,
          quantity_m2 REAL NOT NULL,
          unit_cost REAL NOT NULL,
          total_amount REAL NOT NULL,
          notes TEXT,
          FOREIGN KEY (claim_id) REFERENCES supplier_claims(id) ON DELETE CASCADE,
          FOREIGN KEY (product_id) REFERENCES products(id)
        );
      `);

      // 5. Backfill existing items
      db.run(`UPDATE purchase_invoice_items SET effective_unit_cost = unit_cost WHERE effective_unit_cost = 0 OR effective_unit_cost IS NULL`);
      db.run(`
        UPDATE purchase_requests
        SET estimated_total = (
          SELECT COALESCE(SUM(quantity_m2 * estimated_unit_cost), 0)
          FROM purchase_request_items
          WHERE request_id = purchase_requests.id
        )
        WHERE estimated_total = 0 OR estimated_total IS NULL
      `);
      db.run(`UPDATE purchase_requests SET approval_tier = CASE WHEN estimated_total >= 25000 THEN 'LEVEL_2' ELSE 'LEVEL_1' END`);
    },
  }
];
