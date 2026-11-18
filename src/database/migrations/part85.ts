import type { Migration } from './support';
import { addColumn, tableExists } from './support';

/**
 * المرحلة 1 من توحيد الصلاحيات: أبعاد النطاق (مخازن) وحدود المبالغ
 * وحساسية البيانات المالية على كتالوج الصلاحيات.
 */
export const MIGRATION_PART_85: Migration = {
  id: '201_authorization_dimensions',
  description: 'Add warehouse grants, amount limits and permission sensitivity metadata.',
  up: (db) => {
    // نطاق المخازن لكل مستخدم — تكملة users_branches (الفروع).
    // دلالة: عدم وجود أي صف = غير مقيّد (كل المخازن)؛ وجود صفوف = قائمة بيضاء.
    db.run(`
      CREATE TABLE IF NOT EXISTS user_warehouse_grants (
        user_id TEXT NOT NULL,
        warehouse_id TEXT NOT NULL,
        PRIMARY KEY (user_id, warehouse_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE
      )
    `);
    db.run(
      'CREATE INDEX IF NOT EXISTS idx_user_warehouse_grants_user ON user_warehouse_grants(user_id)'
    );

    // حدود المبالغ لكل (صلاحية عملية، دور أو مستخدم).
    db.run(`
      CREATE TABLE IF NOT EXISTS permission_amount_limits (
        id TEXT PRIMARY KEY,
        permission_code TEXT NOT NULL,
        scope_type TEXT NOT NULL CHECK(scope_type IN ('ROLE','USER')),
        scope_id TEXT NOT NULL,
        max_amount REAL NOT NULL,
        currency TEXT NOT NULL DEFAULT 'EGP',
        on_exceed TEXT NOT NULL DEFAULT 'DENY' CHECK(on_exceed IN ('DENY','REQUIRE_APPROVAL')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(permission_code, scope_type, scope_id)
      )
    `);

    // خريطة الشاشات الموحدة (تُملأ من ScreenRegistry في المرحلة 2).
    db.run(`
      CREATE TABLE IF NOT EXISTS screen_permissions (
        screen_key TEXT PRIMARY KEY,
        path_pattern TEXT NOT NULL,
        tab_key TEXT,
        required_all TEXT NOT NULL DEFAULT '[]',
        required_any TEXT NOT NULL DEFAULT '[]',
        label_ar TEXT
      )
    `);

    // حساسية الصلاحية: NONE | COST | PROFIT | COST_PROFIT | AMOUNT
    if (tableExists(db, 'permissions')) {
      addColumn(db, 'permissions', 'sensitivity', "TEXT NOT NULL DEFAULT 'NONE'");
    }
  },
};
