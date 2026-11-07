import { createExcelWorkbook, type ExcelWorkbookRequest } from '../utils/excelExportWorkbook';

self.onmessage = (event: MessageEvent<ExcelWorkbookRequest>) => {
  try {
    const bytes = createExcelWorkbook(event.data);
    self.postMessage({ bytes: bytes.buffer }, { transfer: [bytes.buffer] });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'تعذر إنشاء ملف Excel.' });
  }
};
