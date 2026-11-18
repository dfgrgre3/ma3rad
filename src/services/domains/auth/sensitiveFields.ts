import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';

/**
 * رؤية بيانات التكلفة/الربح في DTOs — طبقة بيانات وليس UI فقط.
 *
 * الأساس: أكواد الحساسية finance.cost.view / finance.profit.view.
 * التوافق: ui.finance.overview.view يُقبل كبديل أثناء الترحيل حتى لا
 * تنقطع القدرات عن الأدوار التي لم تُزرع لها الأكواد الجديدة بعد.
 */
export interface FinancialFieldVisibility {
  cost: boolean;
  profit: boolean;
}

export function financialFieldVisibility(user: Parameters<typeof PermissionService.hasRoleGrant>[0] = AuthService.getCurrentUser()): FinancialFieldVisibility {
  const legacy = PermissionService.hasRoleGrant(user, 'ui.finance.overview.view');
  return {
    cost: legacy || PermissionService.hasRoleGrant(user, 'finance.cost.view'),
    profit: legacy || PermissionService.hasRoleGrant(user, 'finance.profit.view'),
  };
}

const camelToSnakeKey = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** يصفّر الحقول الحساسة (camelCase وsnake_case) في صف نتيجة استعلام. */
export function maskSensitiveFields(
  row: Record<string, any>,
  fields: string[],
  visible: boolean
): void {
  if (visible) return;
  for (const field of fields) {
    if (field in row) row[field] = 0;
    const snake = camelToSnakeKey(field);
    if (snake !== field && snake in row) row[snake] = 0;
  }
}

/** اختصارات جاهزة: تكلفة أو ربح أو كليهما. */
export function maskCostFields(row: Record<string, any>, fields: string[]): void {
  maskSensitiveFields(row, fields, financialFieldVisibility().cost);
}

export function maskProfitFields(row: Record<string, any>, fields: string[]): void {
  maskSensitiveFields(row, fields, financialFieldVisibility().profit);
}
