import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { SettingsService } from '../../../services/domains/config/SettingsService';
import { getEffectiveBusinessType } from '../../../services/domains/config/BusinessTypeService';
import { parseEnabledModules } from '../../../config/businessProfiles';
import { mergeSetupDraft } from './setupPersistence';
import type { DefaultAdminState, SetupDraft, SetupForm } from './setupTypes';

export function buildInitialForm(draft: SetupDraft | null, security: DefaultAdminState): SetupForm {
  let current: ReturnType<typeof SettingsService.getSettings> | null = null;
  let company: { legalName: string | null; fiscalYearStartMonth: number | null } | undefined;
  let branch: { id: string; name: string; phone: string | null; address: string | null; companyId: string | null } | undefined;
  let warehouse: { name: string; location: string | null } | undefined;
  try { current = SettingsService.getSettings(); } catch { current = null; }
  try {
    const db = DatabaseManager.getInstance();
    const configuredBranchId = SettingsService.getValue('defaultBranchId') || 'br_main';
    branch = db.query<NonNullable<typeof branch>>(
      'SELECT id, name, phone, address, company_id AS companyId FROM branches WHERE id = ? AND is_active = 1 LIMIT 1',
      [configuredBranchId]
    )[0] || db.query<NonNullable<typeof branch>>(
      'SELECT id, name, phone, address, company_id AS companyId FROM branches WHERE is_main = 1 AND is_active = 1 LIMIT 1'
    )[0];
    if (branch?.companyId) {
      company = db.query<NonNullable<typeof company>>(
        'SELECT legal_name AS legalName, fiscal_year_start_month AS fiscalYearStartMonth FROM companies WHERE id = ?',
        [branch.companyId]
      )[0];
    }
    if (branch) {
      warehouse = db.query<NonNullable<typeof warehouse>>(
        'SELECT name, location FROM warehouses WHERE branch_id = ? AND is_default = 1 AND is_active = 1 LIMIT 1',
        [branch.id]
      )[0];
    }
  } catch { /* use the seeded defaults below when setup records are unavailable */ }
  const businessType = getEffectiveBusinessType();
  return mergeSetupDraft({
    showroomName: current?.showroomName || '',
    legalName: company?.legalName || '',
    branchName: branch?.name || 'الفرع الرئيسي',
    branchPhone: branch?.phone || current?.phone || '',
    branchAddress: branch?.address || current?.address || '',
    warehouseName: warehouse?.name || 'المخزن الرئيسي',
    warehouseLocation: warehouse?.location || '',
    businessType,
    businessTypeLabel: SettingsService.getValue('businessTypeLabel') || '',
    enabledModules: parseEnabledModules(SettingsService.getValue('enabledModules'), businessType),
    phone: current?.phone || '',
    address: current?.address || '',
    taxNumber: current?.taxNumber || '',
    commercialRecord: current?.commercialRecord || '',
    currency: current?.currency || 'EGP',
    currencySymbol: current?.currencySymbol || 'ج.م',
    taxPercentage: String(current?.defaultTaxPercentage ?? 0),
    fiscalYearStartMonth: String(company?.fiscalYearStartMonth ?? 1),
    lowStockThreshold: String(current?.lowStockAlertThresholdM2 ?? 20),
    discountThreshold: String(current?.discountApprovalThresholdPercent ?? 10),
    adminUsername: security.username,
    adminFullName: security.fullName,
    adminPhone: security.phone,
    isTaxInclusive: current?.isTaxInclusive ?? false,
    enableNegativeStock: current?.enableNegativeStock ?? false,
    costingMethod: current?.costingMethod ?? 'AVERAGE_COST',
  }, draft);
}
