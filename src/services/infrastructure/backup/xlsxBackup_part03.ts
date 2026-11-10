import * as XLSX from 'xlsx';
import { MAX_BASE64_CELL_LENGTH, PAYLOAD_MARKER, PAYLOAD_SHEET, PAYLOAD_START_ROW, PAYLOAD_VERSION, RAW_CHUNK_SIZE, decodeBase64 } from './xlsxBackup_part01';

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
