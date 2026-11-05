import * as XLSX from 'xlsx';
import { localDateString } from './date';
import { ExportService } from '../services/ExportService';
import { SettingsService } from '../services/SettingsService';

export interface ExportColumn {
  key: string;
  label: string;
  type?: string;
  align?: 'start' | 'center' | 'end';
}

export interface ExportOptions {
  title: string;
  subtitle?: string;
  columns: ExportColumn[];
  rows: Array<Record<string, unknown>>;
  fileName: string;
  kpis?: Array<{ label: string; value: string | number; hint?: string }>;
  notes?: string[];
  /** Permission code enforced before the document is built or written (for example `sales.export`). */
  permission?: string;
}

const stamp = () => localDateString();

function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '-');
}

/**
 * Builds the printable/preview HTML for an export. Includes official company letterhead,
 * stylish KPI metric cards, elegant tables, and summary totals.
 */
export function buildExportHtml(
  { title, subtitle, columns, rows, kpis, notes, permission }: ExportOptions,
  _autoPrint = false
): string {
  if (permission) ExportService.assertAllowed(permission);
  const esc = (s: unknown) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  let companyName = 'معرض السيراميك والبورسلين';
  let phone = '';
  let address = '';
  let taxNumber = '';
  let logoHtml = '';

  try {
    const settings = SettingsService.getSettings();
    companyName = settings.showroomName || settings.brandName || companyName;
    phone = settings.phone || settings.phone2 || '';
    address = settings.address || '';
    taxNumber = settings.taxNumber || '';
    if (settings.brandLogoDataUrl) {
      logoHtml = `<img src="${settings.brandLogoDataUrl}" class="logo" alt="Logo" />`;
    }
  } catch {
    // fallback to defaults if settings service isn't ready
  }

  const head = columns.map((c) => {
    const isNum = c.type === 'currency' || c.type === 'number' || c.type === 'qty' || c.type === 'percent';
    const align = isNum ? 'left' : (c.align === 'center' ? 'center' : 'right');
    return `<th style="text-align: ${align}">${esc(c.label)}</th>`;
  }).join('');

  const body = rows
    .map((r) => {
      const cells = columns.map((c) => {
        const val = r[c.key];
        const isNum = c.type === 'currency' || c.type === 'number' || c.type === 'qty' || c.type === 'percent';
        const align = isNum ? 'left' : (c.align === 'center' ? 'center' : 'right');
        const numStyle = isNum ? 'font-family: monospace; font-weight: bold;' : '';
        return `<td style="text-align: ${align}; ${numStyle}">${esc(val ?? '—')}</td>`;
      }).join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  // KPIs summary cards
  let kpiHtml = '';
  if (kpis && kpis.length > 0) {
    const cards = kpis.map(k => `
      <div class="kpi-card">
        <div class="kpi-label">${esc(k.label)}</div>
        <div class="kpi-val">${esc(k.value)}</div>
        ${k.hint ? `<div class="kpi-hint">${esc(k.hint)}</div>` : ''}
      </div>
    `).join('');
    kpiHtml = `<div class="kpi-grid">${cards}</div>`;
  }

  // Notes
  let notesHtml = '';
  if (notes && notes.length > 0) {
    notesHtml = `<div class="notes-box">
      <strong>ملاحظات:</strong>
      <ul>${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>
    </div>`;
  }

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>${esc(title)}</title>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      margin: 0;
      padding: 16px;
      direction: rtl;
    }
    .header-box {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 2px solid #0f766e;
      padding-bottom: 12px;
      margin-bottom: 16px;
    }
    .org-info h2 { margin: 0 0 4px; font-size: 20px; color: #0f766e; font-weight: 800; }
    .org-info p { margin: 2px 0; font-size: 11px; color: #475569; }
    .report-title-box { text-align: left; }
    .report-title-box h1 { margin: 0 0 4px; font-size: 18px; color: #1e293b; font-weight: 800; }
    .report-title-box .subtitle { font-size: 11px; color: #64748b; font-weight: 600; }
    .logo { max-height: 55px; max-width: 140px; object-fit: contain; }
    
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 10px;
      margin-bottom: 16px;
    }
    .kpi-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 8px 12px;
      text-align: right;
    }
    .kpi-label { font-size: 10px; font-weight: 600; color: #64748b; margin-bottom: 4px; }
    .kpi-val { font-size: 15px; font-weight: 800; color: #0f172a; }
    .kpi-hint { font-size: 9px; color: #94a3b8; margin-top: 2px; }

    table { width: 100%; border-collapse: collapse; font-size: 10.5px; margin-bottom: 16px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 9px; }
    th { background: #f1f5f9; color: #334155; font-weight: 700; white-space: nowrap; }
    tr:nth-child(even) td { background: #f8fafc; }

    .notes-box {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 10.5px;
      color: #166534;
      margin-bottom: 16px;
    }
    .notes-box ul { margin: 4px 0 0; padding-right: 20px; }

    .footer {
      display: flex;
      justify-content: space-between;
      border-top: 1px solid #e2e8f0;
      padding-top: 8px;
      font-size: 10px;
      color: #94a3b8;
    }

    @media print {
      body { padding: 0; }
      .header-box { border-bottom: 2px solid #0f766e !important; }
      th { background: #f1f5f9 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .kpi-card { background: #f8fafc !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="header-box">
    <div class="org-info">
      ${logoHtml}
      <h2>${esc(companyName)}</h2>
      ${address ? `<p>العنوان: ${esc(address)}</p>` : ''}
      ${phone ? `<p>الهاتف: ${esc(phone)}</p>` : ''}
      ${taxNumber ? `<p>الرقم الضريبي: ${esc(taxNumber)}</p>` : ''}
    </div>
    <div class="report-title-box">
      <h1>${esc(title)}</h1>
      <div class="subtitle">${esc(subtitle || `تاريخ الطباعة: ${stamp()}`)}</div>
    </div>
  </div>

  ${kpiHtml}

  <table>
    <thead><tr>${head}</tr></thead>
    <tbody>${body}</tbody>
  </table>

  ${notesHtml}

  <div class="footer">
    <div>تم الاستخراج بواسطة النظام: ${esc(companyName)}</div>
    <div>تاريخ وموعد الطباعة: ${stamp()}</div>
  </div>

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
  printHtml(html);
}

export function exportToExcel({ title, subtitle, columns, rows, fileName, kpis, permission }: ExportOptions): void {
  if (permission) ExportService.assertAllowed(permission);
  const header = columns.map((c) => c.label);
  const body = rows.map((row) =>
    columns.map((c) => {
      const v = row[c.key];
      return v === null || v === undefined ? '' : v;
    })
  );
  
  let companyName = 'معرض السيراميك والبورسلين';
  try {
    const s = SettingsService.getSettings();
    companyName = s.showroomName || s.brandName || companyName;
  } catch { /* ignore */ }

  const meta: unknown[][] = [
    [companyName],
    [title],
    [subtitle || `تاريخ التصدير: ${stamp()}`],
    [],
  ];

  if (kpis && kpis.length > 0) {
    meta.push(['المؤشرات الإجمالية:']);
    meta.push(kpis.map((k) => `${k.label}: ${k.value}`));
    meta.push([]);
  }

  const sheet = XLSX.utils.aoa_to_sheet([...meta, header, ...body]);
  sheet['!cols'] = columns.map((c) => ({ wch: Math.max(16, c.label.length + 5) }));
  
  // Set right-to-left flag for excel sheet
  sheet['!views'] = [{ rightToLeft: true }];

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'التقرير');
  XLSX.writeFile(book, `${safeName(fileName)}-${stamp()}.xlsx`);
}

export function exportToPdf(options: ExportOptions): void {
  printHtml(buildExportHtml(options, true));
}
