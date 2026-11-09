import { MAX_OCR_IMAGE_BYTES } from './OcrImportLimits';

const MAX_IMAGE_PIXELS = 12_000_000;
const MAX_IMAGE_DIMENSION = 3_200;
const SUPPORTED_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
export const MAX_IMAGE_IMPORT_BYTES = MAX_OCR_IMAGE_BYTES;

export const validateImageImportFile = (fileName: string, size: number, header: Uint8Array): void => {
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (!extension || !SUPPORTED_IMAGE_EXTENSIONS.includes(extension)) {
    throw new Error('صيغة الصورة غير مدعومة. اختر PNG أو JPG أو WEBP أو GIF.');
  }
  if (!Number.isFinite(size) || size <= 0 || size > MAX_OCR_IMAGE_BYTES) {
    throw new Error(`حجم الصورة فارغ أو يتجاوز الحد المسموح (${MAX_OCR_IMAGE_BYTES / 1024 / 1024} ميجابايت).`);
  }

  const isPng = header.length >= 8 &&
    header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47 &&
    header[4] === 0x0d && header[5] === 0x0a && header[6] === 0x1a && header[7] === 0x0a;
  const isJpeg = header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  const isWebp = header.length >= 12 &&
    String.fromCharCode(...header.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...header.subarray(8, 12)) === 'WEBP';
  const signature = String.fromCharCode(...header.subarray(0, 6));
  const isGif = signature === 'GIF87a' || signature === 'GIF89a';
  if ((extension === 'png' && !isPng) ||
    (['jpg', 'jpeg'].includes(extension) && !isJpeg) ||
    (extension === 'webp' && !isWebp) ||
    (extension === 'gif' && !isGif)) {
    throw new Error('محتوى الملف لا يطابق صيغة الصورة المحددة.');
  }
};

export const extractImageText = async (
  buffer: ArrayBuffer,
  fileName: string,
  onProgress?: (message: string) => void,
): Promise<string> => {
  const header = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 12));
  validateImageImportFile(fileName, buffer.byteLength, header);

  const documentBridge = window.ceramisys?.documents;
  if (!documentBridge?.recognizePage || !documentBridge.finishOcr) {
    throw new Error('يتطلب استخراج النص من الصور تشغيل التطبيق المكتبي الذي يدعم OCR محليًا.');
  }

  let bitmap: ImageBitmap | null = null;
  let extractionError: unknown;
  let cleanupError: unknown;
  let recognitionStarted = false;
  let text = '';
  try {
    bitmap = await createImageBitmap(new Blob([buffer]));
    const pixelCount = bitmap.width * bitmap.height;
    if (!bitmap.width || !bitmap.height || pixelCount > MAX_IMAGE_PIXELS) {
      throw new Error('أبعاد الصورة أكبر من الحد المسموح لمعالجة OCR.');
    }

    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(bitmap.width * scale));
    canvas.height = Math.max(1, Math.ceil(bitmap.height * scale));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('تعذر تجهيز الصورة لمعالجة OCR.');

    try {
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const png = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('تعذر تحويل الصورة لمعالجة OCR.')), 'image/png');
      });
      if (png.size > MAX_OCR_IMAGE_BYTES) {
        throw new Error('حجم الصورة بعد تجهيزها يتجاوز الحد المسموح لمعالجة OCR.');
      }

      onProgress?.('استخراج النص من الصورة محليًا...');
      recognitionStarted = true;
      const result = await documentBridge.recognizePage(new Uint8Array(await png.arrayBuffer()));
      if (!result.ok) throw new Error(result.error || 'تعذر استخراج النص من الصورة.');
      text = result.text || '';
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  } catch (error) {
    extractionError = error;
  } finally {
    bitmap?.close();
    if (recognitionStarted) {
      try {
        const result = await documentBridge.finishOcr();
        if (!result.ok) cleanupError = new Error(result.error || 'تعذر إغلاق عامل OCR بعد انتهاء المعالجة.');
      } catch (error) {
        cleanupError = error;
      }
    }
  }

  if (extractionError !== undefined && cleanupError !== undefined) {
    throw new AggregateError([extractionError, cleanupError], 'تعذر إكمال تنظيف معالجة الصورة.');
  }
  if (extractionError !== undefined) throw extractionError;
  if (cleanupError !== undefined) throw cleanupError;
  if (!text.trim()) throw new Error('لم يتم العثور على نص قابل للاستيراد في الصورة.');
  return text.trim();
};
