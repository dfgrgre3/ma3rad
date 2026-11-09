import type { CeramicGrade } from '../../types';

export const pickCell = (row: Record<string, any>, keys: string[]): string => {
  for (const key of keys) {
    const found = Object.keys(row).find((k) => k.trim().toLowerCase() === key.trim().toLowerCase());
    if (found !== undefined && row[found] !== undefined && row[found] !== null && String(row[found]).trim() !== '') {
      return String(row[found]).trim();
    }
  }
  return '';
};

export const parseGrade = (
  value: string,
  configuredGrades: Array<{ value: string; label: string; isActive?: boolean }> = [],
): CeramicGrade => {
  const v = value.trim();
  const match = configuredGrades.find((grade) =>
    grade.value.toUpperCase() === v.toUpperCase() || grade.label.trim().toLocaleLowerCase() === v.toLocaleLowerCase(),
  );
  if (match) return match.value as CeramicGrade;
  if (v.includes('ثاني') || v.toUpperCase() === 'GRADE_2') return 'GRADE_2';
  if (v.includes('ثالث') || v.toUpperCase() === 'GRADE_3') return 'GRADE_3';
  if (v.includes('تجاري') || v.toUpperCase() === 'COMMERCIAL') return 'COMMERCIAL';
  return (configuredGrades.find((grade) => grade.isActive)?.value || 'GRADE_1') as CeramicGrade;
};
