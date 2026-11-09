import '../../shims/iterator-helpers';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { MAX_PDF_IMPORT_BYTES, MAX_PDF_IMPORT_PAGES, MAX_PDF_TEXT_CHARACTERS, MIN_PAGE_TEXT_CHARACTERS, pageText } from './PdfImportService_part01';
import { renderPageForOcr } from './PdfImportService_part02';

export const extractPdfText = async (
  buffer: ArrayBuffer,
  onProgress?: (message: string) => void,
): Promise<string> => {
  if (buffer.byteLength < 8) throw new Error('ملف PDF فارغ أو غير صالح.');
  if (buffer.byteLength > MAX_PDF_IMPORT_BYTES) {
    throw new Error(`حجم PDF يتجاوز الحد الأقصى (${MAX_PDF_IMPORT_BYTES / 1024 / 1024} ميجابايت).`);
  }
  const signature = new Uint8Array(buffer, 0, 5);
  if (String.fromCharCode(...signature) !== '%PDF-') {
    throw new Error('محتوى الملف لا يطابق صيغة PDF.');
  }

  const loadingTask = getDocument({ data: new Uint8Array(buffer.slice(0)) });
  let extracted = '';
  let usesOcr = false;
  let extractionError: unknown;
  try {
    const pdf = await loadingTask.promise;
    if (pdf.numPages > MAX_PDF_IMPORT_PAGES) {
      throw new Error(`ملف PDF يتجاوز الحد الأقصى (${MAX_PDF_IMPORT_PAGES} صفحة).`);
    }

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      onProgress?.(`قراءة صفحة ${pageNumber} من ${pdf.numPages}...`);
      const page = await pdf.getPage(pageNumber);
      let text = await pageText(page);

      if (text.replace(/\s/g, '').length < MIN_PAGE_TEXT_CHARACTERS) {
        const documentBridge = window.ceramisys?.documents;
        if (!documentBridge?.recognizePage || !documentBridge.finishOcr) {
          throw new Error('هذه الصفحة ممسوحة ضوئيًا. يتطلب استخراجها تشغيل التطبيق المكتبي الذي يدعم OCR محليًا.');
        }
        onProgress?.(`استخراج النص من الصفحة الممسوحة ${pageNumber} من ${pdf.numPages} محليًا...`);
        const image = await renderPageForOcr(page);
        usesOcr = true;
        const result = await documentBridge.recognizePage(image);
        if (!result.ok) throw new Error(result.error || `تعذر استخراج نص الصفحة ${pageNumber}.`);
        text = result.text || '';
      }

      extracted += `${text}\n`;
      if (extracted.length > MAX_PDF_TEXT_CHARACTERS) {
        throw new Error('النص المستخرج يتجاوز الحد الأقصى المسموح.');
      }
      page.cleanup();
    }
  } catch (error) {
    extractionError = error;
  }

  let cleanupError: unknown;
  if (usesOcr) {
    try {
      const result = await window.ceramisys?.documents?.finishOcr?.();
      if (!result?.ok) throw new Error(result?.error || 'تعذر إغلاق عامل OCR بعد انتهاء المعالجة.');
    } catch (error) {
      cleanupError = error;
    }
  }

  try {
    await loadingTask.destroy();
  } catch (error) {
    cleanupError ??= error;
  }

  if (extractionError !== undefined && cleanupError !== undefined) {
    throw new AggregateError([extractionError, cleanupError], 'تعذر إكمال تنظيف معالجة ملف PDF.');
  }
  if (extractionError !== undefined) throw extractionError;
  if (cleanupError !== undefined) throw cleanupError;
  if (!extracted.trim()) throw new Error('لم يتم العثور على نص قابل للاستيراد في ملف PDF.');
  return extracted.trim();
};
