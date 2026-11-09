import { inflateSync } from 'fflate';
import { parsePdfExtractedText } from './PdfImportData';
import { decodeDelimitedText, looksLikeDelimitedText, parseDelimitedText } from './DelimitedTextImport';
import type { ParsedSpreadsheetSheet } from './SpreadsheetImportService';

export const MAX_DATA_FILE_IMPORT_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_CHARACTERS = 8 * 1024 * 1024;
const MAX_IMPORT_ROWS = 20_000;
const MAX_IMPORT_COLUMNS = 100;
const MAX_DOCX_XML_BYTES = 20 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 2_000;

const decodeText = (bytes: Uint8Array): string => {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (text.includes('\0')) throw new Error('يحتوي الملف على بيانات ثنائية.');
    return text;
  } catch (error) {
    if (error instanceof Error && error.message === 'يحتوي الملف على بيانات ثنائية.') throw error;
    throw new Error('ترميز الملف غير مدعوم. احفظه بصيغة UTF-8 ثم حاول مجددًا.');
  }
};

const validateDataFile = (fileName: string, buffer: ArrayBuffer): string => {
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (!extension || !['docx', 'json', 'xml', 'txt'].includes(extension)) {
    throw new Error('نوع الملف غير مدعوم.');
  }
  if (!buffer.byteLength || buffer.byteLength > MAX_DATA_FILE_IMPORT_BYTES) {
    throw new Error(`حجم الملف فارغ أو يتجاوز الحد المسموح (${MAX_DATA_FILE_IMPORT_BYTES / 1024 / 1024} ميجابايت).`);
  }
  return extension;
};

const parseXml = (text: string): Document => {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('تعريفات DOCTYPE وENTITY غير مسموحة في ملفات XML.');
  const document = new DOMParser().parseFromString(text, 'application/xml');
  if (document.getElementsByTagName('parsererror').length > 0) {
    throw new Error('صيغة XML غير صالحة.');
  }
  return document;
};

const valueText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
};

const createSheet = (name: string, rows: Record<string, unknown>[]): ParsedSpreadsheetSheet => {
  if (!rows.length) throw new Error('الملف لا يحتوي على صفوف بيانات.');
  if (rows.length > MAX_IMPORT_ROWS) throw new Error(`يتجاوز الملف الحد الأقصى (${MAX_IMPORT_ROWS.toLocaleString()} صف).`);
  const headers = [...new Set(rows.flatMap(row => Object.keys(row)))];
  if (!headers.length || headers.length > MAX_IMPORT_COLUMNS) {
    throw new Error(`عدد أعمدة البيانات غير صالح (الحد الأقصى ${MAX_IMPORT_COLUMNS}).`);
  }
  const normalizedRows = rows.map(row => Object.fromEntries(headers.map(header => [header, valueText(row[header])])));
  const dataBytes = normalizedRows.reduce((total, row) =>
    total + Object.values(row).reduce((rowTotal, value) => rowTotal + value.length * 2, 0), 0);
  if (dataBytes > MAX_TEXT_CHARACTERS * 2) throw new Error('حجم البيانات النصية يتجاوز الحد المسموح.');
  return { name, headers, rows: normalizedRows };
};

const parseJson = (text: string, name: string): ParsedSpreadsheetSheet => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('صيغة JSON غير صالحة.');
  }

  const findRecords = (input: unknown, depth = 0): Record<string, unknown>[] | null => {
    if (depth > 20) return null;
    if (Array.isArray(input)) {
      if (input.length && input.every(item => item && typeof item === 'object' && !Array.isArray(item))) {
        return input as Record<string, unknown>[];
      }
      if (input.length && input.every(item => item === null || typeof item !== 'object')) {
        return input.map(item => ({ القيمة: item }));
      }
      for (const item of input) {
        const found = findRecords(item, depth + 1);
        if (found) return found;
      }
      return null;
    }
    if (!input || typeof input !== 'object') return null;
    for (const child of Object.values(input)) {
      const found = findRecords(child, depth + 1);
      if (found) return found;
    }
    return [input as Record<string, unknown>];
  };

  const rows = findRecords(value);
  if (!rows) throw new Error('لم يتم العثور على سجلات قابلة للاستيراد في ملف JSON.');
  return createSheet(name, rows);
};

const elementChildren = (element: Element): Element[] => Array.from(element.children);

const findRepeatedRecords = (element: Element, depth = 0): Element[] | null => {
  if (depth > 20) return null;
  const groups = new Map<string, Element[]>();
  for (const child of elementChildren(element)) {
    const group = groups.get(child.localName) || [];
    group.push(child);
    groups.set(child.localName, group);
  }
  for (const group of groups.values()) {
    if (group.length > 1 && group.some(item => elementChildren(item).length > 0 || item.attributes.length > 0)) {
      return group;
    }
  }
  for (const child of elementChildren(element)) {
    const found = findRepeatedRecords(child, depth + 1);
    if (found) return found;
  }
  return null;
};

const xmlElementRecord = (element: Element): Record<string, unknown> => {
  const record: Record<string, unknown> = {};
  for (const attribute of Array.from(element.attributes)) {
    record[attribute.localName] = attribute.value;
  }
  for (const child of elementChildren(element)) {
    const key = child.localName;
    const value = elementChildren(child).length
      ? xmlElementRecord(child)
      : child.textContent?.trim() || '';
    if (Object.hasOwn(record, key)) {
      const existing = record[key];
      record[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
    } else {
      record[key] = value;
    }
  }
  if (!Object.keys(record).length) record.value = element.textContent?.trim() || '';
  return record;
};

const parseXmlData = (text: string, name: string): ParsedSpreadsheetSheet => {
  const root = parseXml(text).documentElement;
  if (!root) throw new Error('ملف XML لا يحتوي على بيانات.');
  const records = findRepeatedRecords(root);
  return createSheet(name, records?.map(xmlElementRecord) || [xmlElementRecord(root)]);
};

const readDocxDocument = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const searchStart = Math.max(0, bytes.length - 65_557);
  let endOffset = -1;
  for (let offset = bytes.length - 22; offset >= searchStart; offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw new Error('ملف DOCX ليس حزمة ZIP صالحة.');

  const entryCount = view.getUint16(endOffset + 10, true);
  const directorySize = view.getUint32(endOffset + 12, true);
  const directoryOffset = view.getUint32(endOffset + 16, true);
  if (!entryCount || entryCount > MAX_ZIP_ENTRIES ||
    directoryOffset + directorySize > endOffset) {
    throw new Error('بنية ملف DOCX أو عدد عناصره غير صالح.');
  }

  let cursor = directoryOffset;
  let documentEntry: { compressedSize: number; uncompressedSize: number; method: number; localOffset: number } | null = null;
  for (let entryIndex = 0; entryIndex < entryCount; entryIndex++) {
    if (cursor + 46 > directoryOffset + directorySize || view.getUint32(cursor, true) !== 0x02014b50) {
      throw new Error('دليل ملف DOCX تالف.');
    }
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const nameStart = cursor + 46;
    const nextOffset = nameStart + nameLength + extraLength + commentLength;
    if (nextOffset > directoryOffset + directorySize ||
      compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new Error('حجم أحد عناصر ملف DOCX يتجاوز الحد المدعوم.');
    }
    const entryName = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(nameStart, nameStart + nameLength));
    if (entryName === 'word/document.xml') {
      if (documentEntry) throw new Error('يحتوي ملف DOCX على أكثر من مستند رئيسي.');
      documentEntry = { compressedSize, uncompressedSize, method, localOffset };
      if (flags & 1) throw new Error('ملفات DOCX المشفرة غير مدعومة.');
    }
    cursor = nextOffset;
  }

  if (!documentEntry) throw new Error('لم يتم العثور على محتوى مستند Word داخل الملف.');
  if (documentEntry.uncompressedSize > MAX_DOCX_XML_BYTES) {
    throw new Error('محتوى DOCX غير المضغوط يتجاوز الحد المسموح.');
  }
  const { localOffset, compressedSize, uncompressedSize, method } = documentEntry;
  if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== 0x04034b50) {
    throw new Error('رأس محتوى ملف DOCX تالف.');
  }
  const localNameLength = view.getUint16(localOffset + 26, true);
  const localExtraLength = view.getUint16(localOffset + 28, true);
  const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
  if (dataOffset + compressedSize > bytes.length) throw new Error('محتوى ملف DOCX غير مكتمل.');
  const compressed = bytes.subarray(dataOffset, dataOffset + compressedSize);
  let xmlBytes: Uint8Array;
  try {
    if (method === 0) xmlBytes = compressed.slice(0, uncompressedSize);
    else if (method === 8) xmlBytes = inflateSync(compressed, { out: new Uint8Array(uncompressedSize) });
    else throw new Error('طريقة ضغط محتوى DOCX غير مدعومة.');
  } catch (error) {
    if (error instanceof Error && error.message === 'طريقة ضغط محتوى DOCX غير مدعومة.') throw error;
    throw new Error('تعذر فك ضغط محتوى ملف DOCX.');
  }
  if (xmlBytes.byteLength !== uncompressedSize) throw new Error('حجم محتوى ملف DOCX غير متطابق.');
  return decodeText(xmlBytes);
};

const docxParagraphText = (element: Element): string =>
  Array.from(element.getElementsByTagNameNS('*', 't')).map(node => node.textContent || '').join('');

const parseDocx = (buffer: ArrayBuffer, name: string): ParsedSpreadsheetSheet[] => {
  const document = parseXml(readDocxDocument(buffer));
  const body = Array.from(document.getElementsByTagNameNS('*', 'body'))[0];
  if (!body) throw new Error('لم يتم العثور على محتوى مستند Word.');
  const tables = Array.from(body.getElementsByTagNameNS('*', 'tbl'));
  if (tables.length) {
    return tables.map((table, tableIndex) => {
      const matrix = Array.from(table.getElementsByTagNameNS('*', 'tr')).map(row =>
        Array.from(row.getElementsByTagNameNS('*', 'tc')).map(cell => docxParagraphText(cell).trim()));
      const header = matrix[0] || [];
      if (!header.length || header.some(value => !value)) {
        throw new Error(`يجب أن يحتوي جدول Word رقم ${tableIndex + 1} على عناوين أعمدة في الصف الأول.`);
      }
      const headers = [...new Set(header)];
      if (headers.length !== header.length) throw new Error(`عناوين الأعمدة في جدول Word رقم ${tableIndex + 1} مكررة.`);
      return createSheet(`${name} ${tableIndex + 1}`, matrix.slice(1).map(values =>
        Object.fromEntries(headers.map((field, index) => [field, values[index] || '']))));
    });
  }
  const text = Array.from(body.getElementsByTagNameNS('*', 'p'))
    .map(docxParagraphText)
    .filter(Boolean)
    .join('\n');
  return [parsePdfExtractedText(text, name)];
};

export const parseDataFileBuffer = (buffer: ArrayBuffer, fileName: string): ParsedSpreadsheetSheet[] => {
  const extension = validateDataFile(fileName, buffer);
  if (extension === 'docx') return parseDocx(buffer, fileName.replace(/\.[^.]+$/, ''));

  const text = extension === 'txt'
    ? decodeDelimitedText(new Uint8Array(buffer))
    : decodeText(new Uint8Array(buffer));
  if (text.length > MAX_TEXT_CHARACTERS) throw new Error('النص المستخرج يتجاوز الحد الأقصى المسموح.');
  const name = fileName.replace(/\.[^.]+$/, '');
  if (extension === 'json') return [parseJson(text, name)];
  if (extension === 'xml') return [parseXmlData(text, name)];
  if (looksLikeDelimitedText(text)) return [parseDelimitedText(text, name)];
  const sheet = parsePdfExtractedText(text, name);
  return [createSheet(sheet.name, sheet.rows)];
};
