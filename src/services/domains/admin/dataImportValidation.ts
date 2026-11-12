import { ENTITY_META } from './dataImportMetadata';
import type {
  ExistingImportEntity,
  ImportEntity,
  ImportField,
  ImportIssue,
  ImportRowValues,
  ImportValue,
  ParsedImport,
} from './dataImportTypes';

const cleanHeader = (value: string): string => value.trim().toLocaleLowerCase().replace(/[\s_-]+/g, ' ');
const text = (value: unknown): string => String(value ?? '').trim();

export const parseImportRows = (
  headers: string[],
  rows: Record<string, unknown>[],
  preferred?: ImportEntity,
): ParsedImport => {
  if (!rows.length) throw new Error('الملف لا يحتوي على صفوف بيانات.');
  const scores = (Object.keys(ENTITY_META) as ExistingImportEntity[]).map((entity) => ({
    entity,
    score: ENTITY_META[entity].fields.reduce(
      (total, field) => total + (headers.some(
        (header) => field.aliases.some((alias) => cleanHeader(alias) === cleanHeader(header)),
      ) ? 1 : 0),
      0,
    ),
  }));
  scores.sort((left, right) => right.score - left.score);
  const best = scores[0];
  const requiredFields = ENTITY_META[best.entity].fields.filter((field) => field.required);
  const completeKnownShape = requiredFields.every((field) =>
    headers.some((header) => field.aliases.some((alias) => cleanHeader(alias) === cleanHeader(header))),
  );
  const winner: ImportEntity = preferred || (
    best.score >= Math.max(1, requiredFields.length)
    && completeKnownShape
    && best.score > (scores[1]?.score || 0)
      ? best.entity
      : 'dynamic'
  );
  if (winner === 'dynamic') return { entity: winner, headers, rows, mapping: {}, confidence: 0 };

  const mapping: Record<string, string> = {};
  for (const field of ENTITY_META[winner].fields) {
    const match = headers.find((header) =>
      field.aliases.some((alias) => cleanHeader(alias) === cleanHeader(header)),
    );
    if (match) mapping[field.key] = match;
  }
  return {
    entity: winner,
    headers,
    rows,
    mapping,
    confidence: preferred
      ? 1
      : best.score
        ? best.score / Math.max(1, requiredFields.length)
        : 0,
  };
};

const number = (value: unknown): number => {
  const raw = String(value ?? '').trim();
  if (!raw) return NaN;
  const normalized = raw
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06F0))
    .replace(/[٬,]/g, '')
    .replace(/[٫]/g, '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
};

export const createImportRowValues = (
  row: Record<string, unknown>,
  mapping: Record<string, string>,
): ImportRowValues => {
  const value: ImportValue = (key) => text(row[mapping[key]]);
  return {
    val: value,
    opt: (key) => value(key) || undefined,
    num: (key, fallback = 0) => {
      const raw = row[mapping[key]];
      if (!text(raw)) return fallback;
      const parsed = number(raw);
      return Number.isFinite(parsed) ? parsed : fallback;
    },
  };
};

const validateRequiredFields = (fields: ImportField[], value: ImportValue, messages: string[]): void => {
  for (const field of fields) {
    if (field.required && !value(field.key)) messages.push(`${field.label} مطلوب`);
  }
};

const validateUniqueValue = (value: string, seen: Set<string>, message: string, messages: string[]): void => {
  if (!value) return;
  if (seen.has(value)) messages.push(message);
  seen.add(value);
};

const validateNumericValue = (
  value: ImportValue,
  key: string,
  label: string,
  messages: string[],
  minimum?: number,
  exclusiveMinimum = false,
  invalidMessage?: string,
): void => {
  const raw = value(key);
  if (!raw) return;
  const parsed = number(raw);
  if (!Number.isFinite(parsed)) {
    messages.push(invalidMessage || `${label} يجب أن يكون رقمًا صالحًا`);
    return;
  }
  if (minimum !== undefined && (exclusiveMinimum ? parsed <= minimum : parsed < minimum)) {
    messages.push(`${label} يجب أن يكون ${exclusiveMinimum ? 'أكبر من' : 'على الأقل'} ${minimum}`);
  }
};

const validateCustomerOrSupplier = (value: ImportValue, seen: Set<string>, messages: string[]): void => {
  const code = value('code');
  const phone = value('phone');
  if (!phone) messages.push('رقم الهاتف مطلوب');
  validateUniqueValue(code ? `code:${code.toLocaleLowerCase()}` : '', seen, 'سجل مكرر داخل الملف', messages);
  validateUniqueValue(phone ? `phone:${phone}` : '', seen, 'سجل مكرر داخل الملف', messages);
};

const validateNamedEntity = (value: ImportValue, seen: Set<string>, messages: string[]): void => {
  validateUniqueValue(value('name').toLocaleLowerCase(), seen, 'اسم مكرر داخل الملف', messages);
};

const validateNumericFields = (
  entity: ExistingImportEntity,
  value: ImportValue,
  messages: string[],
): void => {
  const validators: Record<ExistingImportEntity, Array<[string, string, number?, boolean?, string?]>> = {
    customers: [
      ['creditLimit', 'حد الائتمان', 0],
      ['initialBalance', 'الرصيد الافتتاحي', undefined, false, 'الرصيد الافتتاحي غير صالح'],
    ],
    suppliers: [
      ['paymentTermsDays', 'مدة السداد بالأيام', 0],
      ['initialBalance', 'الرصيد الافتتاحي', undefined, false, 'الرصيد الافتتاحي غير صالح'],
    ],
    categories: [],
    brands: [],
    products: [
      ['costPrice', 'سعر التكلفة', 0],
      ['wholesalePriceM2', 'سعر الجملة', 0],
      ['minSellingPriceM2', 'أقل سعر', 0],
      ['initialStockM2', 'الرصيد الافتتاحي بالمتر', 0],
    ],
    employees: [['baseSalary', 'الراتب الأساسي', 0, false, 'الراتب غير صالح']],
    warehouses: [],
  };
  for (const [key, label, minimum, exclusiveMinimum, invalidMessage] of validators[entity]) {
    validateNumericValue(value, key, label, messages, minimum, exclusiveMinimum, invalidMessage);
  }
};

const validateEntitySpecificFields = (
  entity: ExistingImportEntity,
  value: ImportValue,
  seen: Set<string>,
  messages: string[],
): void => {
  switch (entity) {
    case 'customers':
    case 'suppliers': {
      validateCustomerOrSupplier(value, seen, messages);
      break;
    }
    case 'categories':
    case 'brands':
    case 'warehouses': {
      validateNamedEntity(value, seen, messages);
      break;
    }
    case 'employees': {
      validateUniqueValue(value('phone'), seen, 'رقم هاتف مكرر داخل الملف', messages);
      break;
    }
    case 'products': {
      for (const key of ['piecesPerBox', 'metersPerBox', 'sellingPriceM2']) {
        const amount = number(value(key));
        if (!Number.isFinite(amount) || amount <= 0) {
          const label = ENTITY_META.products.fields.find((field) => field.key === key)?.label;
          messages.push(`${label} يجب أن يكون أكبر من صفر`);
        }
      }
      validateUniqueValue(value('sku'), seen, 'كود مكرر داخل الملف', messages);
      break;
    }
  }
};

export const validateImport = (data: ParsedImport): ImportIssue[] => {
  if (data.entity === 'dynamic') return [];
  const entity = data.entity;
  const fields = ENTITY_META[entity].fields;
  const seen = new Set<string>();
  const mappedHeaders = Object.values(data.mapping).filter(Boolean);
  const hasDuplicateMapping = new Set(mappedHeaders).size !== mappedHeaders.length;

  return data.rows.flatMap((row, index) => {
    const messages: string[] = [];
    const value: ImportValue = (key) => text(row[data.mapping[key]]);
    validateRequiredFields(fields, value, messages);
    if (hasDuplicateMapping) messages.push('لا يمكن ربط العمود نفسه بأكثر من حقل');
    validateNumericFields(entity, value, messages);
    validateEntitySpecificFields(entity, value, seen, messages);
    return messages.length ? [{ row: index + 2, messages }] : [];
  });
};
