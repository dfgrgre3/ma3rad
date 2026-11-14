import type { Migration } from './support';
import { tableExists } from './support';

export const MIGRATION_PART_111: Migration = {
  id: '161_platform_staff_management',
  description: 'Add platform staff management table with granular roles for platform operator staff.',
  up: (db) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS platform_staff (
        id TEXT PRIMARY KEY,
        full_name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        phone TEXT,
        role TEXT NOT NULL CHECK(role IN ('SUPER_ADMIN', 'PLATFORM_ADMIN', 'SUPPORT_AGENT', 'OPERATIONS_ENGINEER', 'BILLING_SPECIALIST', 'LICENSE_MANAGER')),
        permissions_override TEXT,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
        last_login_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`CREATE INDEX IF NOT EXISTS idx_platform_staff_role ON platform_staff(role)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_platform_staff_active ON platform_staff(is_active)`);

    // Seed default platform staff accounts if empty
    const count = Number(db.exec('SELECT COUNT(*) FROM platform_staff')[0]?.values[0]?.[0] || 0);
    if (count === 0) {
      db.run(`
        INSERT INTO platform_staff (id, full_name, email, phone, role, is_active)
        VALUES 
          ('staff_super_admin', 'مالك المنصة (الرئيسي)', 'owner@ceramisys.cloud', '01000000001', 'SUPER_ADMIN', 1),
          ('staff_support_lead', 'مهندس أحمد كمال - رئيس فريق الدعم', 'support.lead@ceramisys.cloud', '01000000002', 'SUPPORT_AGENT', 1),
          ('staff_ops_eng', 'مهندس محمود طارق - مهندس البنية التحتية', 'ops.eng@ceramisys.cloud', '01000000003', 'OPERATIONS_ENGINEER', 1),
          ('staff_billing_mgr', 'أستاذة سارة يوسف - مسؤولة الاشتراكات والفوترة', 'billing@ceramisys.cloud', '01000000004', 'BILLING_SPECIALIST', 1),
          ('staff_license_mgr', 'مهندس طارق علام - مسؤول التراخيص وتفعيل الأجهزة', 'licensing@ceramisys.cloud', '01000000005', 'LICENSE_MANAGER', 1)
      `);
    }
  },
};
