import '../../shims/iterator-helpers';
import { type PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { MAX_OCR_IMAGE_BYTES } from './PdfImportService_part01';

export const renderPageForOcr = async (page: PDFPageProxy): Promise<Uint8Array> => {
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
