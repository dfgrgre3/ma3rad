export const SCHEMA_PART_26 = String.raw`

-- 108. SUPPORT TICKETS
CREATE TABLE IF NOT EXISTS platform_support_tickets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  device_id TEXT,
  subject TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK(priority IN ('LOW','MEDIUM','HIGH','URGENT')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','IN_PROGRESS','WAITING_CUSTOMER','RESOLVED','CLOSED')),
  assigned_to TEXT,
  remote_access_requested INTEGER NOT NULL DEFAULT 0 CHECK(remote_access_requested IN (0,1)),
  remote_access_approved INTEGER NOT NULL DEFAULT 0 CHECK(remote_access_approved IN (0,1)),
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (device_id) REFERENCES platform_devices(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_platform_support_tickets_tenant ON platform_support_tickets(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_platform_support_tickets_status ON platform_support_tickets(status, priority);

CREATE TABLE IF NOT EXISTS platform_support_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_role TEXT NOT NULL DEFAULT 'SUPPORT' CHECK(author_role IN ('CUSTOMER','SUPPORT','SYSTEM')),
  body TEXT NOT NULL,
  attachment_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ticket_id) REFERENCES platform_support_tickets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_platform_support_messages_ticket ON platform_support_messages(ticket_id, created_at);
`;
