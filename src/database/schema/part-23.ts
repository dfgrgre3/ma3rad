export const SCHEMA_PART_23 = String.raw`

-- 105. LICENSE ACTIVATION HISTORY
CREATE TABLE IF NOT EXISTS platform_license_activations (
  id TEXT PRIMARY KEY,
  license_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  device_id TEXT,
  activation_code TEXT,
  mode TEXT NOT NULL DEFAULT 'ONLINE' CHECK(mode IN ('ONLINE','OFFLINE')),
  action TEXT NOT NULL CHECK(action IN ('ACTIVATE','DEACTIVATE','TRANSFER','RENEW','REVOKE')),
  status TEXT NOT NULL DEFAULT 'SUCCESS' CHECK(status IN ('SUCCESS','FAILED','PENDING')),
  ip_address TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (license_id) REFERENCES platform_licenses(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_platform_license_activations_license ON platform_license_activations(license_id, created_at);
CREATE INDEX IF NOT EXISTS idx_platform_license_activations_tenant ON platform_license_activations(tenant_id, created_at);
`;
