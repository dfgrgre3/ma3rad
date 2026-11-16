export const SCHEMA_PART_28 = String.raw`

-- 110. COUPONS
CREATE TABLE IF NOT EXISTS platform_coupons (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  discount_type TEXT NOT NULL CHECK(discount_type IN ('PERCENT','FIXED')),
  discount_value REAL NOT NULL DEFAULT 0,
  max_uses INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  /** إذا كان الكوبون خاصاً بخطة معينة (null = كل الخطط). */
  plan_id TEXT,
  /** إذا كان الكوبون للدفعة الأولى فقط (مثل عرض تجريبي). */
  first_payment_only INTEGER NOT NULL DEFAULT 0 CHECK(first_payment_only IN (0,1)),
  /** الحد الأدنى لمبلغ الفاتورة لتطبيق الكوبون. */
  min_subtotal REAL NOT NULL DEFAULT 0,
  /** تاريخ بدء سريان الكوبون. */
  starts_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (plan_id) REFERENCES platform_plans(id)
);

-- 111. SYNC APPLIED EVENTS — أرشفة الأحداث الواردة التي تم تطبيقها لمراجعة المزامنة ومنع التكرار
CREATE TABLE IF NOT EXISTS sync_applied_events (
  event_id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  tenant_id TEXT,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sync_applied_events_entity ON sync_applied_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_sync_applied_events_branch ON sync_applied_events(branch_id);
CREATE INDEX IF NOT EXISTS idx_sync_applied_events_applied_at ON sync_applied_events(applied_at);
`;
