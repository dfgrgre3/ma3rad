-- Migration: Add License Indexes
-- Run: sqlite3 your_database.db < scripts/migration-add-license-indexes.sql
-- Or from Node: require('sqlite3').verbose().Database('your_database.db').exec(sql)

-- ============================================
-- platform_licenses indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_platform_licenses_branches ON platform_licenses(branches_limit);
CREATE INDEX IF NOT EXISTS idx_platform_licenses_offline_grace ON platform_licenses(offline_grace_period_days);
CREATE INDEX IF NOT EXISTS idx_platform_licenses_coupling ON platform_licenses(coupling_mode);
CREATE INDEX IF NOT EXISTS idx_platform_licenses_starts ON platform_licenses(starts_at);

-- ============================================
-- platform_subscriptions indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_platform_subscriptions_branches ON platform_subscriptions(branches_limit);

-- ============================================
-- platform_tenants indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_platform_tenants_branches ON platform_tenants(branches_limit);
CREATE INDEX IF NOT EXISTS idx_platform_tenants_plan ON platform_tenants(plan_id);

-- ============================================
-- platform_notifications indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_platform_notifications_tenant ON platform_notifications(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_platform_notifications_type ON platform_notifications(type);
CREATE INDEX IF NOT EXISTS idx_platform_notifications_reference ON platform_notifications(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_platform_notifications_read ON platform_notifications(read_at);

-- ============================================
-- Verification query
-- ============================================
SELECT 
  'Indexes created:' as status,
  COUNT(*) as count
FROM sqlite_master 
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
  );