#!/usr/bin/env node
/**
 * Migration Information: Add License Indexes
 * 
 * NOTE: This project uses sql.js (SQLite compiled to WebAssembly) with IndexedDB/localStorage
 * persistence. The database is NOT a traditional SQLite file.
 * 
 * Indexes are applied AUTOMATICALLY during app initialization via the migration system.
 * The indexes defined in schema files (part-19.ts, part-25.ts) will be created when
 * the app runs its migration process.
 * 
 * To verify indexes are created:
 * 1. Start the Electron app: npm run electron:dev
 * 2. Open DevTools Console
 * 3. Run the verification query below
 * 
 * Verification Query (run in DevTools Console):
 * ----------------------------------------------------------
 * const db = window.ceramisys?.db?.getDatabase?.();
 * if (db) {
 *   const indexes = db.exec(`
 *     SELECT name FROM sqlite_master 
 *     WHERE type='index' 
 *     AND name LIKE 'idx_platform_%'
 *     AND name IN (
 *       'idx_platform_licenses_branches',
 *       'idx_platform_licenses_offline_grace',
 *       'idx_platform_licenses_coupling',
 *       'idx_platform_licenses_starts',
 *       'idx_platform_subscriptions_branches',
 *       'idx_platform_tenants_branches',
 *       'idx_platform_tenants_plan',
 *       'idx_platform_notifications_tenant',
 *       'idx_platform_notifications_type',
 *       'idx_platform_notifications_reference',
 *       'idx_platform_notifications_read'
 *     )
 *     ORDER BY name
 *   `);
 *   console.table(indexes[0]?.values || []);
 * } else {
 *   console.log('Database not available - ensure app is initialized');
 * }
 * ----------------------------------------------------------
 * 
 * Indexes Added in Schema Files:
 * - src/database/schema/part-19.ts:
 *   * idx_platform_licenses_branches (branches_limit)
 *   * idx_platform_licenses_offline_grace (offline_grace_period_days)
 *   * idx_platform_licenses_coupling (coupling_mode)
 *   * idx_platform_licenses_starts (starts_at)
 *   * idx_platform_subscriptions_branches (branches_limit)
 *   * idx_platform_tenants_branches (branches_limit)
 *   * idx_platform_tenants_plan (plan_id)
 * 
 * - src/database/schema/part-25.ts:
 *   * idx_platform_notifications_tenant (tenant_id, created_at)
 *   * idx_platform_notifications_type (type)
 *   * idx_platform_notifications_reference (reference_type, reference_id)
 *   * idx_platform_notifications_read (read_at)
 * 
 * These indexes are included in the CREATE INDEX statements in the schema files
 * and will be applied automatically by the migration system on app startup.
 */

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  Migration: Add License Indexes                                ║
╠═══════════════════════════════════════════════════════════════╣
║  This project uses sql.js + IndexedDB (not a SQLite file).    ║
║  Indexes are applied AUTOMATICALLY during app initialization. ║
╠═══════════════════════════════════════════════════════════════╣
║  To verify indexes:                                            ║
║  1. Run: npm run electron:dev                                  ║
║  2. Open DevTools Console                                      ║
║  3. Paste and run the verification query from this file        ║
╚═══════════════════════════════════════════════════════════════╝
`);

console.log('\n📋 Verification Query (copy to DevTools Console):');
console.log('─'.repeat(60));
console.log(`
const db = window.ceramisys?.db?.getDatabase?.();
if (db) {
  const indexes = db.exec(\`
    SELECT name FROM sqlite_master 
    WHERE type='index' 
    AND name LIKE 'idx_platform_%'
    AND name IN (
      'idx_platform_licenses_branches',
      'idx_platform_licenses_offline_grace',
      'idx_platform_licenses_coupling',
      'idx_platform_licenses_starts',
      'idx_platform_subscriptions_branches',
      'idx_platform_tenants_branches',
      'idx_platform_tenants_plan',
      'idx_platform_notifications_tenant',
      'idx_platform_notifications_type',
      'idx_platform_notifications_reference',
      'idx_platform_notifications_read'
    )
    ORDER BY name
  \`);
  console.table(indexes[0]?.values || []);
} else {
  console.log('Database not available - ensure app is initialized');
}
`);
console.log('─'.repeat(60));