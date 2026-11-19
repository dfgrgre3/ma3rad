import type { EstimatePayment } from '../../../types/projects/apartmentEstimate';
import type { Product } from '../../../types';
import { conversionFactor } from '../../../utils/products/uom_part02';
import {
  type EstimateLine, type EstimateRoom, type Measure,
} from '../estimateCalculations';

export type Room = EstimateRoom;
export type CostLine = EstimateLine;
export type ExecutionDraft = {
  contractDate: string; terms: string; quotationId: string;
  certificateDate: string; periodStart: string; periodEnd: string;
  certificateDescription: string; progressPercent: number; certificateAmount: number;
  costDate: string; costCategory: string; costDescription: string; costAmount: number;
};
export type PaymentDraftState = { date: string; amount: number; method: string; reference: string; notes: string };
export type StockRow = { productId: string; availableM2: number };
export type PurchasePriceSnapshot = { date: string; invoiceNumber: string; supplierName: string; effectiveUnitCost: number; quantityM2: number };
export type LocalEstimate = {
  id: string; name: string; area: number; customerId: string; rooms: Room[]; lines: CostLine[];
  contingencyPercent: number; taxPercent: number; paidAmount: number; terms?: string; payments?: EstimatePayment[]; updatedAt: string;
};
export type RecoverableEstimateDraft = {
  schemaVersion: 1;
  savedAt: string;
  projectId: string;
  selectedEstimateId: string;
  apartmentName: string;
  apartmentArea: string;
  customerId: string;
  warehouseId: string;
  rooms: Room[];
  lines: CostLine[];
  contingencyPercent: number;
  taxPercent: number;
  paidAmount: number;
  payments: EstimatePayment[];
  terms: string;
};
export const LOCAL_ESTIMATES_KEY = 'ceramisys.apartment-estimates.v1';
export const LOCAL_LINE_TEMPLATES_KEY = 'ceramisys.apartment-estimate-line-templates.v1';
export const ESTIMATE_RECOVERY_KEY = 'ceramisys.apartment-estimate-recovery.v1';
export const DEFAULT_ESTIMATE_TERMS = 'صلاحية العرض 15 يومًا من تاريخ الإصدار. يبدأ التنفيذ بعد اعتماد العرض والدفعة المقدمة. أي أعمال إضافية خارج البنود والكميات الموضحة تسعّر بموافقة منفصلة.';
export const readRecoverableEstimateDraft = (): RecoverableEstimateDraft | null => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ESTIMATE_RECOVERY_KEY) || 'null') as RecoverableEstimateDraft | null;
    if (!parsed || parsed.schemaVersion !== 1 || !Array.isArray(parsed.rooms) || !Array.isArray(parsed.lines)) return null;
    return parsed;
  } catch { return null; }
};
export const readLocalEstimates = (): LocalEstimate[] => {
  try {
    const raw = window.localStorage.getItem(LOCAL_ESTIMATES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed as LocalEstimate[] : [];
  } catch { return []; }
};

export const makeId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
export type LineTemplate = { id: string; name: string; line: CostLine };
export const readLineTemplates = (): LineTemplate[] => {
  try { const raw = window.localStorage.getItem(LOCAL_LINE_TEMPLATES_KEY); const value: unknown = raw ? JSON.parse(raw) : []; return Array.isArray(value) ? value as LineTemplate[] : []; }
  catch { return []; }
};
export const newRoom = (name = 'غرفة جديدة'): Room => ({
  id: makeId(), name, length: 4, width: 3, height: 3,
  doorCount: 1, doorWidth: 0.9, doorHeight: 2.1,
  windowCount: 1, windowWidth: 1.2, windowHeight: 1.2,
  shape: 'rectangle', polygonSides: [4, 3, 4, 3],
  walls: Array.from({ length: 4 }, (_, index) => ({ id: makeId(), name: `جدار ${index + 1}`, length: index % 2 === 0 ? 4 : 3, height: 3 })),
  openings: [], balconyLength: 0, balconyWidth: 0, electricalPoints: 0, plumbingPoints: 0,
});
export const newLine = (
  category: string, name: string, measure: Measure, unit: string,
): CostLine => ({
  id: makeId(), category, name, measure, unit,
  manualQuantity: 1, materialProductId: '', materialRate: 0, laborRate: 0,
  wastePercent: 0, discountPercent: 0, profitPercent: 0, equipmentRate: 0, expenseRate: 0,
  workType: category.includes('التأسيس') || category.includes('كهرباء') || category.includes('سباكة') ? 'FOUNDATION' : 'FINISHING',
  phase: category.includes('كهرباء') ? 'التأسيس الكهربائي' : category.includes('سباكة') ? 'تأسيس السباكة' : 'التشطيبات',
  specifications: '', notes: '', attachments: [],
});
export const initialLines = (): CostLine[] => [
  newLine('الأرضيات', 'توريد وتركيب الأرضيات', 'floor', 'م²'),
  newLine('السيراميك', 'سيراميك الحوائط', 'walls', 'م²'),
  newLine('المحارة', 'محارة الحوائط', 'walls', 'م²'),
  newLine('النقاشة', 'دهانات الحوائط', 'walls', 'م²'),
  newLine('الأسقف', 'دهانات الأسقف', 'ceiling', 'م²'),
  newLine('الجبس', 'أعمال الجبس', 'ceiling', 'م²'),
  newLine('كهرباء', 'أعمال الكهرباء', 'manual', 'نقطة'),
  newLine('سباكة', 'أعمال السباكة', 'manual', 'نقطة'),
  newLine('نجارة', 'أعمال النجارة', 'manual', 'بند'),
  newLine('ألوميتال', 'أعمال الألوميتال', 'manual', 'م²'),
  newLine('عمالة', 'عمالة التشطيب', 'floor', 'م²'),
];
export const initialRooms = (): Room[] => [
  newRoom('الريسبشن'), newRoom('غرفة النوم'), newRoom('المطبخ'), newRoom('الحمام'), newRoom('البلكونة'),
];
export const fmt = (value: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(value || 0);
export const measureLabel: Record<Measure, string> = {
  floor: 'مساحة الأرضية',
  walls: 'مساحة الحوائط الصافية',
  ceiling: 'مساحة السقف',
  perimeter: 'محيط الغرفة',
  electricalPoints: 'نقاط الكهرباء',
  plumbingPoints: 'نقاط السباكة',
  doors: 'عدد الأبواب',
  windows: 'عدد الشبابيك',
  balcony: 'مساحة البلكونة',
  manual: 'كمية يدوية',
};

export function fieldClass() {
  return 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100';
}

export function isUnitCompatible(product: Product, unit: string): boolean {
  return estimateUnitFactor(unit, product) !== null;
}

export function parsePolygonCoordinates(value: string): Array<{ x: number; y: number }> {
  return value.split(';').flatMap((pair) => {
    const coordinates = pair.split(',');
    if (coordinates.length !== 2) return [];
    const [rawX, rawY] = coordinates;
    if (!rawX?.trim() || !rawY?.trim()) return [];
    const x = Number(rawX); const y = Number(rawY);
    return Number.isFinite(x) && Number.isFinite(y) ? [{ x, y }] : [];
  });
}

export function estimateUnitFactor(unit: string, product: Product): number | null {
  const value = unit.trim().toLocaleLowerCase();
  const aliases: Record<string, string> = {
    'م²': 'M2', 'م2': 'M2', 'متر مربع': 'M2',
    'م': 'METER', 'م طولي': 'LINEAR_METER', 'متر طولي': 'LINEAR_METER', 'متر': 'METER',
    'نقطة': 'PIECE', 'بند': 'SERVICE', 'قطعة': 'PIECE', 'عدد': 'PIECE',
    'كجم': 'KG', 'طن': 'TON', 'لتر': 'LITER', 'كرتونة': 'BOX', 'عبوة': 'PACK', 'طقم': 'SET',
  };
  const from = aliases[value] || (value === product.customUnit?.trim().toLocaleLowerCase() ? 'CUSTOM' : unit);
  return conversionFactor(from, product.baseUnit, product);
}
