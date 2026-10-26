export const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(n || 0) + ' ج';
export const CATEGORY_LABELS: Record<string, string> = {
  VEHICLES: 'سيارات ومركبات', EQUIPMENT: 'معدات وآلات', FURNITURE: 'أثاث ومفروشات',
  COMPUTERS: 'أجهزة حاسوب', BUILDINGS: 'مباني', OTHER: 'أخرى',
};

