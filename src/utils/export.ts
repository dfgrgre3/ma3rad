import { localDateString } from './date';
import { ExportService } from '../services/ExportService';
import { SettingsService } from '../services/SettingsService';
import { createExcelWorkbook } from './excelExportWorkbook';

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
export async function downloadPdf(html: string, fileName: string): Promise<boolean> {
  const bridge = window.ceramisys;
  if (bridge?.savePdf) {
    const landscape = /@page[^}]*A4\s+landscape/i.test(html);
    return Boolean(await bridge.savePdf(html, fileName, landscape));
  }
  printHtml(html);
  return true;
}

export function exportToExcel({ title, subtitle, columns, rows, fileName, kpis, permission }: ExportOptions): void {
  if (permission) ExportService.assertAllowed(permission);

  let companyName = 'معرض السيراميك والبورسلين';
  try {
    const s = SettingsService.getSettings();
    companyName = s.showroomName || s.brandName || companyName;
  } catch { /* ignore */ }

  const exportedAt = stamp();
  const triggerDownload = (bytes: ArrayBuffer | Uint8Array) => {
    try {
      // Copy into a fresh ArrayBuffer-backed view: Blob requires ArrayBuffer (not SharedArrayBuffer).
      const blobBytes = bytes instanceof Uint8Array ? new Uint8Array(bytes).buffer : bytes;
      const blob = new Blob([blobBytes], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${safeName(fileName)}-${exportedAt}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error('Could not download the generated Excel workbook:', error);
      window.alert('تم إنشاء التقرير لكن تعذر تنزيل ملف Excel.');
      return;
    }
  };

  if (typeof Worker === 'undefined') {
    try {
      const workbook = createExcelWorkbook({
        title,
        subtitle: subtitle || `تاريخ التصدير: ${exportedAt}`,
        columns,
        rows,
        companyName,
        kpis,
      });
      triggerDownload(workbook);
    } catch (error) {
      console.error('Could not generate Excel workbook without a web worker:', error);
      window.alert('تعذر إنشاء ملف Excel. حاول مرة أخرى.');
    }
    return;
  }

  let worker: Worker;
  try {
    worker = new Worker(new URL('../workers/excelExport.worker.ts', import.meta.url), { type: 'module' });
  } catch (error) {
    console.error('Could not create Excel export worker:', error);
    window.alert('تعذر بدء تصدير Excel. حاول مرة أخرى.');
    return;
  }

  const startedAt = performance.now();
  const timeout = window.setTimeout(() => {
    worker.terminate();
    console.error('Excel export failed: background workbook generation timed out.');
    window.alert('تعذر إنشاء ملف Excel في الوقت المحدد. حاول تصدير نطاق أصغر.');
  }, 120_000);
  const finish = () => {
    window.clearTimeout(timeout);
    worker.terminate();
  };

  worker.onmessage = (event: MessageEvent<{ bytes?: ArrayBuffer; error?: string }>) => {
    finish();
    if (event.data.error || !event.data.bytes) {
      console.error('Excel export failed:', event.data.error || 'The background worker returned no workbook.');
      window.alert('تعذر إنشاء ملف Excel. تحقق من البيانات وحاول مرة أخرى.');
      return;
    }

    triggerDownload(event.data.bytes);

    if (import.meta.env.DEV) {
      console.info('[performance] Excel export worker completed', {
        rowCount: rows.length,
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      });
    }
  };
  worker.onerror = (event) => {
    finish();
    console.error('Excel export worker failed:', event.message);
    window.alert('تعذر إنشاء ملف Excel في الخلفية. حاول مرة أخرى.');
  };
  worker.onmessageerror = () => {
    finish();
    console.error('Excel export worker returned an unreadable result.');
    window.alert('تعذر استلام ملف Excel الناتج. حاول مرة أخرى.');
  };

  try {
    worker.postMessage({
      title,
      subtitle: subtitle || `تاريخ التصدير: ${exportedAt}`,
      columns,
      rows,
      companyName,
      kpis,
    });
  } catch (error) {
    finish();
    console.error('Could not start Excel export worker:', error);
    window.alert('تعذر بدء تصدير Excel. حاول مرة أخرى.');
  }
}

export function exportToPdf(options: ExportOptions): void {
  printHtml(buildExportHtml(options, true));
}
