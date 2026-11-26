import type { Migration } from './support';

// Restaurant guest & delivery extras: waiting list, loyalty & wallet,
// ratings & complaints, coupons, and driver cash settlements.
export const MIGRATION_269_RESTAURANT_GUEST_SUITE: Migration = {
  id: '269_restaurant_guest_suite',
  description: 'Add restaurant waitlist, loyalty/wallet, feedback, coupons and driver settlements tables',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS restaurant_waitlist (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL,
        guest_name TEXT NOT NULL,
        phone TEXT,
        party_size INTEGER NOT NULL DEFAULT 2,
        quoted_wait_minutes INTEGER,
        status TEXT NOT NULL DEFAULT 'WAITING' CHECK(status IN ('WAITING', 'NOTIFIED', 'SEATED', 'CANCELLED')),
        table_id TEXT,
        notes TEXT,
        notified_at TEXT,
        seated_at TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_restaurant_waitlist_branch ON restaurant_waitlist(branch_id, status, created_at);

      CREATE TABLE IF NOT EXISTS restaurant_loyalty_accounts (
        customer_id TEXT PRIMARY KEY,
        points INTEGER NOT NULL DEFAULT 0,
        wallet_balance REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS restaurant_loyalty_transactions (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('EARN', 'REDEEM', 'TOPUP', 'WALLET_SPEND', 'ADJUST')),
        points INTEGER NOT NULL DEFAULT 0,
        amount REAL NOT NULL DEFAULT 0,
        reference TEXT,
        expires_at TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_restaurant_loyalty_tx_customer ON restaurant_loyalty_transactions(customer_id, created_at);

      CREATE TABLE IF NOT EXISTS restaurant_feedback (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL,
        customer_id TEXT,
        order_number TEXT,
        kind TEXT NOT NULL DEFAULT 'RATING' CHECK(kind IN ('RATING', 'COMPLAINT')),
        target TEXT NOT NULL DEFAULT 'ORDER' CHECK(target IN ('ORDER', 'ITEM', 'DRIVER')),
        target_name TEXT,
        rating INTEGER CHECK(rating IS NULL OR (rating BETWEEN 1 AND 5)),
        comment TEXT,
        status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED')),
        handled_by TEXT,
        compensation TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_restaurant_feedback_branch ON restaurant_feedback(branch_id, status, created_at);

      CREATE TABLE IF NOT EXISTS restaurant_coupons (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        discount_type TEXT NOT NULL CHECK(discount_type IN ('PERCENT', 'AMOUNT')),
        discount_value REAL NOT NULL CHECK(discount_value > 0),
        min_order REAL NOT NULL DEFAULT 0,
        max_uses INTEGER,
        per_customer_limit INTEGER,
        used_count INTEGER NOT NULL DEFAULT 0,
        valid_from TEXT,
        valid_until TEXT,
        target_customer_id TEXT,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS restaurant_coupon_redemptions (
        id TEXT PRIMARY KEY,
        coupon_id TEXT NOT NULL,
        customer_id TEXT,
        order_number TEXT,
        discount_amount REAL NOT NULL DEFAULT 0,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (coupon_id) REFERENCES restaurant_coupons(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_restaurant_coupon_redemptions ON restaurant_coupon_redemptions(coupon_id, customer_id);

      CREATE TABLE IF NOT EXISTS restaurant_driver_settlements (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL,
        driver_name TEXT NOT NULL,
        settlement_date TEXT NOT NULL,
        orders_count INTEGER NOT NULL DEFAULT 0,
        cash_collected REAL NOT NULL DEFAULT 0,
        cash_handed_over REAL NOT NULL DEFAULT 0,
        commission REAL NOT NULL DEFAULT 0,
        difference REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED')),
        shift_id TEXT,
        notes TEXT,
        approved_by TEXT,
        approved_at TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_restaurant_driver_settlements ON restaurant_driver_settlements(branch_id, settlement_date);
    `);
  },
};
