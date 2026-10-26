export const SCHEMA_PART_11 = String.raw`
CREATE TABLE IF NOT EXISTS branch_warehouses (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL,
  warehouse_id TEXT NOT NULL,
  is_primary INTEGER DEFAULT 0,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
  UNIQUE(branch_id, warehouse_id)
);

CREATE TABLE IF NOT EXISTS users_branches (
  user_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  PRIMARY KEY (user_id, branch_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_branch_warehouses_branch ON branch_warehouses(branch_id);

-- 29. ADVANCED ANALYTICS SNAPSHOTS (لوحات التحليلات المتقدمة)
CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id TEXT PRIMARY KEY,
  metric_name TEXT NOT NULL,
  metric_value REAL NOT NULL,
  dimension TEXT,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_metric ON analytics_snapshots(metric_name, period_start, period_end);

-- 30. REAL-TIME NOTIFICATIONS ENHANCEMENTS (إشعارات فورية محسنة)
CREATE TABLE IF NOT EXISTS notification_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  email_enabled INTEGER DEFAULT 0,
  push_enabled INTEGER DEFAULT 1,
  low_stock_alerts INTEGER DEFAULT 1,
  payment_due_alerts INTEGER DEFAULT 1,
  system_alerts INTEGER DEFAULT 1,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS promotions (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  promotion_type TEXT NOT NULL CHECK(promotion_type IN ('PERCENTAGE', 'FIXED_AMOUNT', 'BUY_X_GET_Y', 'BUNDLE_PRICE')),
  discount_percentage REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  buy_quantity REAL DEFAULT 0,
  get_quantity REAL DEFAULT 0,
  min_order_amount REAL DEFAULT 0,
  applies_to TEXT DEFAULT 'ALL' CHECK(applies_to IN ('ALL', 'PRODUCTS', 'CATEGORIES', 'BRANDS')),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  usage_limit INTEGER,
  usage_count INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_promotions_active ON promotions(is_active, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS promotion_targets (
  id TEXT PRIMARY KEY,
  promotion_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK(target_type IN ('PRODUCT', 'CATEGORY', 'BRAND')),
  target_id TEXT NOT NULL,
  UNIQUE(promotion_id, target_type, target_id),
  FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE CASCADE
);

-- 26. CRM: LEADS, PIPELINE, ACTIVITIES, CAMPAIGNS
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  channel TEXT DEFAULT 'OTHER' CHECK(channel IN ('WHATSAPP', 'SMS', 'EMAIL', 'PHONE', 'SOCIAL', 'WALK_IN', 'REFERRAL', 'OTHER')),
  starts_at TEXT,
  ends_at TEXT,
  budget REAL DEFAULT 0,
  target_audience TEXT,
  status TEXT DEFAULT 'PLANNED' CHECK(status IN ('PLANNED', 'RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED')),
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  phone2 TEXT,
  email TEXT,
  city TEXT,
  address TEXT,
  source TEXT DEFAULT 'OTHER' CHECK(source IN ('WALK_IN', 'PHONE', 'WHATSAPP', 'REFERRAL', 'SOCIAL', 'CAMPAIGN', 'ENGINEER', 'CONTRACTOR', 'OTHER')),
  campaign_id TEXT,
  lead_type TEXT DEFAULT 'RETAIL' CHECK(lead_type IN ('RETAIL', 'WHOLESALE', 'CONTRACTOR', 'ENGINEER', 'PROJECT')),
  stage TEXT DEFAULT 'NEW' CHECK(stage IN ('NEW', 'CONTACTED', 'QUALIFIED', 'QUOTATION', 'NEGOTIATION', 'WON', 'LOST')),
  estimated_value REAL DEFAULT 0,
  probability INTEGER DEFAULT 0,
  assigned_to TEXT,
  next_follow_up TEXT,
  lost_reason TEXT,
  converted_customer_id TEXT,
  converted_at TEXT,
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (converted_customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);
CREATE INDEX IF NOT EXISTS idx_leads_assigned ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_follow_up ON leads(next_follow_up);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);

-- One activity feed for leads AND customers: exactly one of the two ids is set.
`;
