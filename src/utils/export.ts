import * as XLSX from 'xlsx';
import { localDateString } from './date';
import { ExportService } from '../services/ExportService';

export interface ExportColumn {
  key: string;
  label: string;
}

export interface ExportOptions {
  title: string;
  subtitle?: string;
  columns: ExportColumn[];
  rows: Array<Record<string, unknown>>;
  fileName: string;
  /** Permission code enforced before the document is built or written (for example `sales.export`). */
  permission?: string;
}

const stamp = () => localDateString();

function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '-');
}

/**
 * Builds the printable/preview HTML for an export. Kept separate so the UI can
 * render the exact same document inside the app before the user chooses to
 * download, print or share it.
 */
export function buildExportHtml(
  { title, subtitle, columns, rows, permission }: ExportOptions,
  autoPrint = false
): string {
  if (permission) ExportService.assertAllowed(permission);
  const esc = (s: unknown) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  const head = columns.map((c) => `<th>${esc(c.label)}</th>`).join('');
  const body = rows
    .map((r) => `<tr>${columns.map((c) => `<td>${esc(r[c.key])}</td>`).join('')}</tr>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>${esc(title)}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; color: #0f172a; margin: 0; padding: 18px; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    .sub { font-size: 11px; color: #64748b; margin-bottom: 14px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: right; }
    th { background: #f1f5f9; font-weight: 700; }
    tr:nth-child(even) td { background: #f8fafc; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>${esc(title)}</h1>
  <div class="sub">${esc(subtitle || `تاريخ التصدير: ${stamp()}`)}</div>
  <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
  ${autoPrint ? '<script>window.onload = function () { window.print(); };</script>' : ''}
</body>
</html>`;
}

/** Prints a standalone HTML document without leaving the application. */
export function printHtml(html: string): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '1px';
  iframe.style.height = '1px';
  iframe.style.opacity = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  let started = false;
  const startPrint = () => {
    if (started) return;
    started = true;
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      setTimeout(() => iframe.remove(), 1000);
    }
  };
  iframe.onload = startPrint;
  setTimeout(startPrint, 500);
}

/**
 * Saves the HTML as a real PDF. In Electron the main process renders it with
 * `printToPDF` and shows a native save dialog; in a browser we fall back to the
 * print dialog where the user can choose "Save as PDF".
 */
export async function downloadPdf(html: string, fileName: string): Promise<void> {
  const bridge = window.ceramisys;
  if (bridge?.savePdf) {
    const landscape = /@page[^}]*A4\s+landscape/i.test(html);
    await bridge.savePdf(html, fileName, landscape);
    return;
  }
  printHtml(html.replace('<body>', '<body onload="window.print()">'));
}

export function exportToExcel({ title, subtitle, columns, rows, fileName, permission }: ExportOptions): void {
  if (permission) ExportService.assertAllowed(permission);
  const header = columns.map((c) => c.label);
  const body = rows.map((row) =>
    columns.map((c) => {
      const v = row[c.key];
      return v === null || v === undefined ? '' : v;
    })
  );
  const meta: unknown[][] = [[title], [subtitle || `تاريخ التصدير: ${stamp()}`], []];
  const sheet = XLSX.utils.aoa_to_sheet([...meta, header, ...body]);
  sheet['!cols'] = columns.map((c) => ({ wch: Math.max(14, c.label.length + 4) }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'التقرير');
  XLSX.writeFile(book, `${safeName(fileName)}-${stamp()}.xlsx`);
}

export function exportToPdf(options: ExportOptions): void {
  printHtml(buildExportHtml(options, true));
}
