export type DynamicAttributeDataType =
  | 'TEXT'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'SELECT'
  | 'MULTI_SELECT'
  | 'DATE';

export interface DynamicAttributeDefinition {
  id: string;
  name: string;
  dataType: DynamicAttributeDataType;
  unit?: string | null;
  isRequired: boolean;
  isFilterable: boolean;
  appliesToCategoryId?: string | null;
  values: Array<{ value: string; label: string }>;
}

export function normalizeDynamicAttributeValue(
  definition: DynamicAttributeDefinition,
  rawValue: unknown,
): string | null {
  const required = definition.isRequired;
  const fail = (): never => {
    throw new Error(`قيمة الخاصية «${definition.name}» غير صالحة.`);
  };
  if (rawValue === null || rawValue === undefined) {
    if (required) throw new Error(`الخاصية «${definition.name}» مطلوبة.`);
    return null;
  }

  const value = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
  if (definition.dataType === 'MULTI_SELECT') {
    let selected: unknown;
    if (Array.isArray(value)) {
      selected = value;
    } else if (typeof value === 'string' && value) {
      try {
        selected = JSON.parse(value);
      } catch {
        selected = value.split(',').map((item) => item.trim()).filter(Boolean);
      }
    } else {
      selected = [];
    }

    if (!Array.isArray(selected) || selected.some((item) => typeof item !== 'string')) fail();
    const values = [...new Set((selected as string[]).map((item) => item.trim()).filter(Boolean))];
    if (required && values.length === 0) throw new Error(`الخاصية «${definition.name}» مطلوبة.`);
    if (definition.values.length > 0
      && values.some((item) => !definition.values.some((option) => option.value === item))) fail();
    return values.length ? JSON.stringify(values) : null;
  }

  if (typeof value !== 'string') return fail();
  if (!value) {
    if (required) throw new Error(`الخاصية «${definition.name}» مطلوبة.`);
    return null;
  }

  switch (definition.dataType) {
    case 'TEXT':
      return value;
    case 'NUMBER': {
      const number = Number(value);
      if (!Number.isFinite(number)) fail();
      return String(number);
    }
    case 'BOOLEAN':
      if (['true', '1'].includes(value.toLowerCase())) return 'true';
      if (['false', '0'].includes(value.toLowerCase())) return 'false';
      return fail();
    case 'DATE': {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) fail();
      const date = new Date(`${value}T00:00:00.000Z`);
      if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) fail();
      return value;
    }
    case 'SELECT':
      if (definition.values.length > 0
        && !definition.values.some((option) => option.value === value)) fail();
      return value;
    default:
      return fail();
  }
}
