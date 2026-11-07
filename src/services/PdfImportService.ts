// Must run before pdfjs-dist: it reads `Iterator.prototype` at module load
// and throws "Iterator is not defined" on legacy Chromium (< 117).
import '../shims/iterator-helpers';
import { getDocument, GlobalWorkerOptions, type PDFPageProxy } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

export const MAX_PDF_IMPORT_BYTES = 25 * 1024 * 1024;
const MAX_PDF_IMPORT_PAGES = 100;
const MAX_PDF_TEXT_CHARACTERS = 1_000_000;
const MIN_PAGE_TEXT_CHARACTERS = 80;
const MAX_OCR_IMAGE_BYTES = 12 * 1024 * 1024;
type PdfTextItem = Extract<Awaited<ReturnType<PDFPageProxy['getTextContent']>>['items'][number], { str: string }>;

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const pageText = async (page: PDFPageProxy): Promise<string> => {
  const content = await page.getTextContent();
  const items = content.items.filter((item): item is PdfTextItem => 'str' in item && item.str.trim().length > 0);
  const lines: Array<{ y: number; items: typeof items }> = [];

  for (const item of items) {
    const y = item.transform[5];
    let line = lines.find(candidate => Math.abs(candidate.y - y) <= 3);
    if (!line) {
      line = { y, items: [] };
      lines.push(line);
    }
    line.items.push(item);
  }

  return lines
    .sort((left, right) => right.y - left.y)
    .map(line => {
      let output = '';
      let previous: (typeof line.items)[number] | undefined;
      for (const item of line.items) {
        if (previous) {
          const gap = Math.abs(item.transform[4] - (previous.transform[4] + previous.width));
          output += gap > 24 ? '\t' : ' ';
        }
        output += item.str;
        previous = item;
      }
      return output.trim();
    })
    .filter(Boolean)
    .join('\n');
};

const renderPageForOcr = async (page: PDFPageProxy): Promise<Uint8Array> => {
  const initialViewport = page.getViewport({ scale: 1.6 });
  const scale = Math.min(1, 3200 / Math.max(initialViewport.width, initialViewport.height));
  const viewport = page.getViewport({ scale: 1.6 * scale });
  if (viewport.width * viewport.height > 12_000_000) {
    throw new Error('أبعاد صفحة PDF أكبر من الحد المسموح للـOCR.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('تعذر تجهيز الصفحة لمعالجة OCR.');

  try {
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    const image = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('تعذر تحويل صفحة PDF إلى صورة.'));
      }, 'image/png');
    });
    if (image.size > MAX_OCR_IMAGE_BYTES) {
      throw new Error('حجم صورة الصفحة أكبر من الحد المسموح لمعالجة OCR.');
    }
    return new Uint8Array(await image.arrayBuffer());
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
};

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
