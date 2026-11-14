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
`;
