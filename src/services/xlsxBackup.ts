import * as XLSX from 'xlsx';

const INFO_SHEET = 'معلومات النسخة';
const PAYLOAD_SHEET = '_CERAMISYS_BACKUP';
const PAYLOAD_MARKER = 'CERAMISYS_SQLITE_BACKUP';
const PAYLOAD_VERSION = '1';
const PAYLOAD_START_ROW = 4;
const MAX_BASE64_CELL_LENGTH = 32_000;
const RAW_CHUNK_SIZE = 24_000;
const OLE_SIGNATURE = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

export function hasOfficeCompoundFileSignature(bytes: Uint8Array): boolean {
  return bytes.length >= OLE_SIGNATURE.length &&
    OLE_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

export function createXlsxBackupWorkbook(databaseBytes: Uint8Array): Uint8Array {
  if (databaseBytes.length === 0) throw new Error('قاعدة البيانات فارغة ولا يمكن تصديرها.');
  const chunkCount = Math.ceil(databaseBytes.length / RAW_CHUNK_SIZE);
  if (chunkCount + PAYLOAD_START_ROW - 1 > 1_048_576) {
    throw new Error('حجم قاعدة البيانات يتجاوز الحد الأقصى الذي يمكن حفظه داخل ملف XLSX.');
  }

  const payloadRows: unknown[][] = [
    [PAYLOAD_MARKER],
    [PAYLOAD_VERSION],
    [databaseBytes.length],
  ];
  for (let offset = 0; offset < databaseBytes.length; offset += RAW_CHUNK_SIZE) {
    payloadRows.push([encodeBase64(databaseBytes.subarray(offset, offset + RAW_CHUNK_SIZE))]);
  }

  const workbook = XLSX.utils.book_new();
  const infoSheet = XLSX.utils.aoa_to_sheet([
    ['نسخة احتياطية مشفرة من CeramiSys'],
    ['تاريخ الإنشاء', new Date().toISOString()],
    ['حجم قاعدة البيانات بالبايت', databaseBytes.length],
    ['الاستعادة', 'افتح صفحة النسخ الاحتياطي في التطبيق واختر هذا الملف وأدخل كلمة مروره.'],
  ]);
  const payloadSheet = XLSX.utils.aoa_to_sheet(payloadRows);
  XLSX.utils.book_append_sheet(workbook, infoSheet, INFO_SHEET);
  XLSX.utils.book_append_sheet(workbook, payloadSheet, PAYLOAD_SHEET);
  workbook.Workbook = {
    Sheets: [
      { name: INFO_SHEET, Hidden: 0 },
      { name: PAYLOAD_SHEET, Hidden: 2 },
    ],
  };

  const workbookBytes = XLSX.write(workbook, {
    type: 'array',
    bookType: 'xlsx',
    compression: true,
  });
  return new Uint8Array(workbookBytes);
}

export function extractDatabaseFromXlsxBackup(workbookBytes: Uint8Array): Uint8Array {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(workbookBytes, { type: 'array' });
  } catch {
    throw new Error('تعذر قراءة محتوى ملف النسخة XLSX.');
  }

  const payloadSheet = workbook.Sheets[PAYLOAD_SHEET];
  if (!payloadSheet ||
    payloadSheet.A1?.v !== PAYLOAD_MARKER ||
    payloadSheet.A2?.v !== PAYLOAD_VERSION) {
    throw new Error('ملف XLSX لا يحتوي على نسخة قاعدة بيانات CeramiSys.');
  }

  const expectedLength = Number(payloadSheet.A3?.v);
  if (!Number.isSafeInteger(expectedLength) || expectedLength <= 0) {
    throw new Error('حجم قاعدة البيانات داخل ملف XLSX غير صالح.');
  }

  const chunkCount = Math.ceil(expectedLength / RAW_CHUNK_SIZE);
  if (chunkCount + PAYLOAD_START_ROW - 1 > 1_048_576) {
    throw new Error('حجم قاعدة البيانات داخل ملف XLSX يتجاوز الحد المسموح.');
  }

  const databaseBytes = new Uint8Array(expectedLength);
  let outputOffset = 0;
  for (let index = 0; index < chunkCount; index++) {
    const cell = payloadSheet[`A${PAYLOAD_START_ROW + index}`];
    if (typeof cell?.v !== 'string' || cell.v.length > MAX_BASE64_CELL_LENGTH) {
      throw new Error('بيانات قاعدة البيانات داخل ملف XLSX ناقصة أو تالفة.');
    }

    let chunk: Uint8Array;
    try {
      chunk = decodeBase64(cell.v);
    } catch {
      throw new Error('بيانات قاعدة البيانات داخل ملف XLSX تالفة.');
    }
    const expectedChunkLength = Math.min(RAW_CHUNK_SIZE, expectedLength - outputOffset);
    if (chunk.length !== expectedChunkLength) {
      throw new Error('طول بيانات قاعدة البيانات داخل ملف XLSX غير متطابق.');
    }
    databaseBytes.set(chunk, outputOffset);
    outputOffset += chunk.length;
  }

  if (payloadSheet[`A${PAYLOAD_START_ROW + chunkCount}`]?.v !== undefined) {
    throw new Error('ملف XLSX يحتوي على بيانات قاعدة إضافية غير متوقعة.');
  }
  return databaseBytes;
}
