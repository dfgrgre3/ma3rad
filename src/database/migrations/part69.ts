import type { Migration } from './support';

export const MIGRATION_PART_69: Migration[] = [
  {
    id: '179_apartment_estimate_versions_and_quotation_history',
    description: 'Store immutable apartment estimate revisions, reviews, and quotation links.',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS project_apartment_estimate_versions (
          id TEXT PRIMARY KEY,
          estimate_id TEXT NOT NULL,
          project_id TEXT NOT NULL,
          version_number INTEGER NOT NULL CHECK(version_number > 0),
          status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PENDING','APPROVED','RETURNED')),
          snapshot_json TEXT NOT NULL,
          change_summary TEXT NOT NULL DEFAULT '',
          created_by TEXT NOT NULL,
          created_by_name TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          reviewed_by TEXT,
          reviewed_by_name TEXT,
          reviewed_at TEXT,
          review_notes TEXT,
          UNIQUE(estimate_id, version_number),
          FOREIGN KEY(estimate_id) REFERENCES project_apartment_estimates(id) ON DELETE CASCADE,
          FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
          FOREIGN KEY(created_by) REFERENCES users(id),
          FOREIGN KEY(reviewed_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_project_estimate_versions_history
          ON project_apartment_estimate_versions(estimate_id, version_number DESC);
        CREATE TABLE IF NOT EXISTS project_apartment_estimate_quotation_links (
          id TEXT PRIMARY KEY,
          estimate_id TEXT NOT NULL,
          version_id TEXT,
          quotation_id TEXT NOT NULL UNIQUE,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(estimate_id) REFERENCES project_apartment_estimates(id) ON DELETE CASCADE,
          FOREIGN KEY(version_id) REFERENCES project_apartment_estimate_versions(id) ON DELETE SET NULL,
          FOREIGN KEY(quotation_id) REFERENCES quotations(id) ON DELETE CASCADE,
          FOREIGN KEY(created_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_project_estimate_quotation_links_estimate
          ON project_apartment_estimate_quotation_links(estimate_id, created_at DESC);
      `);
      const existing = db.exec(`
        SELECT id, project_id, name, area_m2, total_amount, contingency_percent, tax_percent,
               payments_json, rooms_json, cost_lines_json, updated_by, updated_at, quotation_id
        FROM project_apartment_estimates
      `)[0]?.values || [];
      for (const row of existing) {
        const [estimateId, projectId, name, areaM2, totalAmount, contingencyPercent, taxPercent,
          paymentsJson, roomsJson, costLinesJson, createdBy, createdAt, quotationId] = row;
        if (typeof estimateId !== 'string' || typeof projectId !== 'string' || typeof createdBy !== 'string') continue;
        const parse = (value: unknown) => { try { return JSON.parse(String(value || '[]')); } catch { return []; } };
        const snapshot = JSON.stringify({
          id: estimateId, projectId, name, areaM2, totalAmount, contingencyPercent, taxPercent,
          payments: parse(paymentsJson), rooms: parse(roomsJson), costLines: parse(costLinesJson),
        });
        const versionId = `paev_seed_${String(estimateId)}`;
        db.run(`
          INSERT OR IGNORE INTO project_apartment_estimate_versions
            (id, estimate_id, project_id, version_number, status, snapshot_json, change_summary,
             created_by, created_by_name, created_at)
          VALUES (?, ?, ?, 1, 'DRAFT', ?, 'النسخة الحالية عند ترقية النظام', ?,
             COALESCE((SELECT full_name FROM users WHERE id = ?), ?), ?)
        `, [versionId, estimateId, projectId, snapshot, createdBy, createdBy, createdBy, String(createdAt || new Date().toISOString())]);
        if (typeof quotationId === 'string' && quotationId) {
          db.run(`
            INSERT OR IGNORE INTO project_apartment_estimate_quotation_links
              (id, estimate_id, version_id, quotation_id, created_by)
            VALUES (?, ?, ?, ?, ?)
          `, [`paeq_seed_${String(quotationId)}`, estimateId, versionId, quotationId, createdBy]);
        }
      }
    },
  },
];
