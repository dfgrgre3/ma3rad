import * as XLSX from 'xlsx';
import { INFO_SHEET, PAYLOAD_MARKER, PAYLOAD_SHEET, PAYLOAD_START_ROW, PAYLOAD_VERSION, RAW_CHUNK_SIZE, encodeBase64 } from './xlsxBackup_part01';

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
