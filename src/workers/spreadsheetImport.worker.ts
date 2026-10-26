import { parseSpreadsheetBuffer } from '../services/SpreadsheetImportService';

self.onmessage = (event: MessageEvent<{ buffer: ArrayBuffer; fileName: string }>) => {
  try {
    const parsed = parseSpreadsheetBuffer(event.data.buffer, event.data.fileName);
    self.postMessage(parsed, { transfer: [parsed.buffer] });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'تعذر تحليل الملف.' });
  }
};
