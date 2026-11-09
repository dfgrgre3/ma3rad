import '../../shims/iterator-helpers';
import { GlobalWorkerOptions, type PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

export const MAX_PDF_IMPORT_BYTES = 25 * 1024 * 1024;

export const MAX_PDF_IMPORT_PAGES = 100;

export const MAX_PDF_TEXT_CHARACTERS = 1_000_000;

export const MIN_PAGE_TEXT_CHARACTERS = 80;

export { MAX_OCR_IMAGE_BYTES } from './OcrImportLimits';

export type PdfTextItem = Extract<Awaited<ReturnType<PDFPageProxy['getTextContent']>>['items'][number], { str: string }>;

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export const pageText = async (page: PDFPageProxy): Promise<string> => {
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
