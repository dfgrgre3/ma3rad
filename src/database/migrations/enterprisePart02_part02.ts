import type { Database } from 'sql.js';

export function runEnterprisePart6(db: Database): void {
  // 6. E-Payment Gateways & Electronic Settlements
  db.run(`
    CREATE TABLE IF NOT EXISTS payment_gateways (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      provider_code TEXT NOT NULL,
      gl_account_id TEXT NOT NULL,
      commission_rate REAL DEFAULT 0,
      fixed_fee REAL DEFAULT 0,
      settlement_period_days INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      config_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (gl_account_id) REFERENCES chart_of_accounts(id)
    );
  
    CREATE TABLE IF NOT EXISTS payment_gateway_settlements (
      id TEXT PRIMARY KEY,
      settlement_number TEXT UNIQUE NOT NULL,
      gateway_id TEXT NOT NULL,
      settlement_date TEXT NOT NULL,
      gross_amount REAL NOT NULL,
      commission_amount REAL NOT NULL,
      tax_deduction REAL DEFAULT 0,
      net_amount REAL NOT NULL,
      bank_account_id TEXT NOT NULL,
      journal_entry_id TEXT,
      status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'SETTLED', 'DISPUTED')),
      notes TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (gateway_id) REFERENCES payment_gateways(id),
      FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );
  `);
}

export function runEnterprisePart7(db: Database): void {
  // 7. Multi-currency & Exchange rates
  db.run(`
    CREATE TABLE IF NOT EXISTS currencies (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      symbol TEXT NOT NULL,
      exchange_rate REAL NOT NULL DEFAULT 1.0,
      is_base INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1
    );
  
    CREATE TABLE IF NOT EXISTS currency_exchange_rates (
      id TEXT PRIMARY KEY,
      currency_code TEXT NOT NULL,
      rate_date TEXT NOT NULL,
      rate REAL NOT NULL,
      created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (currency_code) REFERENCES currencies(code)
    );
  `);
}
