import '../../../shims/iterator-helpers';
import { getDocument, GlobalWorkerOptions, type PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import './PdfImportService_part01';
import './PdfImportService_part02';
import './PdfImportService_part03';
export { MAX_PDF_IMPORT_BYTES } from './PdfImportService_part01';
export { extractPdfText } from './PdfImportService_part03';
