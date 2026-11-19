import {
  currentCompanyId,
  db,
  requireView,
  roundNumber,
} from './shared';
import type { VendorStats } from './types';

export function getVendorStats(): VendorStats {
  const actor = requireView();
  const companyId = currentCompanyId(actor);
  const total = db.query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM facility_service_vendors WHERE company_id = ?`,
    [companyId]
  )[0]?.count ?? 0;
  const active = db.query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM facility_service_vendors WHERE company_id = ? AND is_active = 1`,
    [companyId]
  )[0]?.count ?? 0;
  const preferred = db.query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM facility_service_vendors WHERE company_id = ? AND is_preferred = 1`,
    [companyId]
  )[0]?.count ?? 0;
  const byCategory = db.query<any>(
    `SELECT service_categories AS category, COUNT(*) AS count
     FROM facility_service_vendors WHERE company_id = ? AND is_active = 1
     GROUP BY service_categories`,
    [companyId]
  );
  const avgRating = db.query<{ avg: number }>(
    `SELECT AVG(rating) AS avg FROM facility_service_vendors WHERE company_id = ? AND is_active = 1`,
    [companyId]
  )[0]?.avg ?? 0;
  const topVendors = db.query<any>(
    `SELECT fsv.id, s.name AS name, fsv.rating, fsv.total_contracts
     FROM facility_service_vendors fsv
     JOIN suppliers s ON s.id = fsv.supplier_id
     WHERE fsv.company_id = ? AND fsv.is_active = 1
     ORDER BY fsv.rating DESC, fsv.total_contracts DESC LIMIT 5`,
    [companyId]
  );
  return {
    totalVendors: Number(total),
    activeVendors: Number(active),
    preferredVendors: Number(preferred),
    vendorsByCategory: byCategory.map((row) => ({ category: row.category, count: Number(row.count) })),
    averageRating: roundNumber(Number(avgRating) || 0),
    topVendors: topVendors.map((row) => ({
      id: row.id, name: row.name, rating: Number(row.rating) || 0,
      totalContracts: Number(row.total_contracts) || 0,
    })),
  };
}
