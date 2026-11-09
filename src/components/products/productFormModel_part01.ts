import type { CeramicGrade, UnitType } from '../../types';

export const UNITS: { value: UnitType; label: string }[] = [
  { value: 'M2', label: 'متر مربع (م²)' },
  { value: 'LINEAR_METER', label: 'متر طولي' },
  { value: 'METER', label: 'متر' },
  { value: 'KG', label: 'كيلوجرام' },
  { value: 'TON', label: 'طن' },
  { value: 'LITER', label: 'لتر' },
  { value: 'SET', label: 'طقم' },
  { value: 'PACK', label: 'عبوة' },
  { value: 'SERVICE', label: 'خدمة' },
  { value: 'BOX', label: 'كرتونة' },
  { value: 'PIECE', label: 'قطعة' },
];

export const unitLabelFor = (unit: UnitType, custom = '') => custom.trim() || UNITS.find((item) => item.value === unit)?.label || unit;

export const SURFACES = [
  { value: 'FLOOR', label: 'أرضيات' },
  { value: 'WALL', label: 'حوائط' },
  { value: 'OUTDOOR', label: 'خارجي / حدائق' },
  { value: 'GENERAL', label: 'عام / متعدد' },
];

export const GRADES: { value: CeramicGrade; label: string }[] = [
  { value: 'GRADE_1', label: 'فرز أول' },
  { value: 'GRADE_2', label: 'فرز ثاني' },
  { value: 'GRADE_3', label: 'فرز ثالث' },
  { value: 'COMMERCIAL', label: 'تجاري' },
];

export let configuredGradeLabels = new Map<string, string>();

export const setConfiguredGradeLabels = (grades: Array<{ value: string; label: string }>) => {
  configuredGradeLabels = new Map(grades.map((grade) => [grade.value, grade.label]));
};

export const round = (value: number, digits = 2) => Number(((Number.isFinite(value) ? value : 0)).toFixed(digits));

export const gradeLabel = (grade: CeramicGrade) =>
  configuredGradeLabels.get(grade) || GRADES.find((g) => g.value === grade)?.label || grade;

export const calcMetersFromSize = (size: string, pieces: number): number | null => {
  const normalized = (size || '').replace(/[×*]/g, 'x');
  const match = normalized.match(/^\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*$/i);
  if (!match) return null;
  const width = Number.parseFloat(match[1]);
  const height = Number.parseFloat(match[2]);
  if (!width || !height || !pieces || pieces <= 0) return null;
  return round((width / 100) * (height / 100) * pieces, 3);
};
