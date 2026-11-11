import type { Migration } from './support';

export const MIGRATION_PART_66: Migration[] = [
  {
    id: '177_performance_query_indexes',
    description: 'Add indexes for frequently searched and joined columns to speed up queries',
    up: (db) => {
      const statements = [
        'CREATE INDEX IF NOT EXISTS idx_products_name ON products(name)',
        'CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku)',
        'CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)',
        'CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id)',
        'CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand_id)',
        'CREATE INDEX IF NOT EXISTS idx_products_company ON products(company_id)',
        'CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active)',
        'CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name)',
        'CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone)',
        'CREATE INDEX IF NOT EXISTS idx_customers_company ON customers(company_id)',
        'CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name)',
        'CREATE INDEX IF NOT EXISTS idx_suppliers_company ON suppliers(company_id)',
        'CREATE INDEX IF NOT EXISTS idx_sales_inv_customer ON sales_invoices(customer_id)',
        'CREATE INDEX IF NOT EXISTS idx_sales_inv_date ON sales_invoices(date)',
        'CREATE INDEX IF NOT EXISTS idx_purchase_inv_supplier ON purchase_invoices(supplier_id)',
        'CREATE INDEX IF NOT EXISTS idx_purchase_inv_date ON purchase_invoices(date)',
        'CREATE INDEX IF NOT EXISTS idx_warehouse_stock_product ON warehouse_stock(product_id)',
        'CREATE INDEX IF NOT EXISTS idx_warehouse_stock_warehouse ON warehouse_stock(warehouse_id)',
        'CREATE INDEX IF NOT EXISTS idx_inventory_tx_product ON inventory_transactions(product_id)',
        'CREATE INDEX IF NOT EXISTS idx_inventory_tx_date ON inventory_transactions(created_at)',
      ];
      for (const statement of statements) {
        try { db.exec(statement); } catch { /* table/column may not exist in older schemas */ }
      }
    },
  },
];