import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { AlertCircle, CheckCircle2, Download, Eye, EyeOff, FileSpreadsheet, Loader2, Upload, WandSparkles } from 'lucide-react';
import { DataImportService, ENTITY_META, ImportEntity, ParsedImport, ImportIssue } from '../../../services/admin/DataImportService';
import { BackupService } from '../../../services/backup/BackupService';
import { DataAdminService, type DataImportPreview, type DataImportSheet } from '../../../services/admin/DataAdminService';
import { AuthService } from '../../../services/auth/AuthService';
import { PermissionService } from '../../../services/auth/PermissionService';
import { DynamicDataService, DynamicImportResult } from '../../../services/data/DynamicDataService';
import {
  MAX_SPREADSHEET_COLUMNS,
  MAX_SPREADSHEET_FILE_SIZE,
  MAX_SPREADSHEET_ROWS,
  ParsedSpreadsheetSheet,
  validateSpreadsheetFileHeader,
  validateSpreadsheetFileMetadata,
} from '../../../services/data/SpreadsheetImportService';
import { formatImportValue } from '../../admin/admin/adminDataUtils';
import { hasOfficeCompoundFileSignature } from '../../../services/backup/xlsxBackup';
import { parsePdfExtractedText } from '../../../services/data/PdfImportData';
import { extractPdfText, MAX_PDF_IMPORT_BYTES } from '../../../services/data/PdfImportService';
import { extractImageText, MAX_IMAGE_IMPORT_BYTES } from '../../../services/data/ImageImportService';
import { MAX_DATA_FILE_IMPORT_BYTES, parseDataFileBuffer } from '../../../services/data/DataFileImportService';

const parseSpreadsheetInWorker = (buffer: ArrayBuffer, fileName: string): Promise<{ buffer: ArrayBuffer; sheets: ParsedSpreadsheetSheet[] }> =>
  new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../../../workers/spreadsheetImport.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ buffer?: ArrayBuffer; sheets?: ParsedSpreadsheetSheet[]; error?: string }>) => {
      worker.terminate();
      if (event.data.error) reject(new Error(event.data.error));
      else if (event.data.buffer && event.data.sheets) resolve({ buffer: event.data.buffer, sheets: event.data.sheets });
      else reject(new Error('تعذر استلام نتيجة تحليل الملف.'));
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error('تعذر تحليل الملف في الخلفية. تحقق من الملف وحاول مجددًا.'));
    };
    worker.postMessage({ buffer, fileName }, [buffer]);
  });

export const DataImportPage: React.FC = () => {
  const service = useMemo(() => new DataImportService(), []);
  const backupService = useMemo(() => new BackupService(), []);
  const adminDataService = useMemo(() => new DataAdminService(), []);
  const dynamicService = useMemo(() => new DynamicDataService(), []);
  const [data, setData] = useState<ParsedImport | null>(null);
  const [fileName, setFileName] = useState('');
  const [issues, setIssues] = useState<ImportIssue[]>([]);
  const [allowBalances, setAllowBalances] = useState(false);
  const [allowStock, setAllowStock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number; errors: ImportIssue[] } | null>(null);
  const [message, setMessage] = useState('');
  const [manualEntity, setManualEntity] = useState<ImportEntity | ''>('');
  const [manualOverride, setManualOverride] = useState(false);
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [spreadsheetSheets, setSpreadsheetSheets] = useState<ParsedSpreadsheetSheet[]>([]);
  const [extractedText, setExtractedText] = useState('');
  const [dynamicName, setDynamicName] = useState('');
  const [dynamicPreview, setDynamicPreview] = useState<{ headers: string[]; rows: Record<string, unknown>[] } | null>(null);
  const [dynamicResult, setDynamicResult] = useState<DynamicImportResult | null>(null);
  const [backupImport, setBackupImport] = useState<{ sheets: DataImportSheet[]; preview: DataImportPreview } | null>(null);
  const [encryptedBackupFile, setEncryptedBackupFile] = useState<File | null>(null);
  const [backupPassword, setBackupPassword] = useState('');
  const [showBackupPassword, setShowBackupPassword] = useState(false);
  const currentUser = AuthService.getCurrentUser();
  const canOpen = service.canOpen(currentUser);

  const prepareSheetImport = (
    sheets: ParsedSpreadsheetSheet[],
    buffer: ArrayBuffer,
    importFileName: string,
  ) => {
    const firstSheet = sheets[0];
    if (!firstSheet) throw new Error('الملف لا يحتوي على صفوف بيانات.');
    const parsedBase = service.parseRows(
      firstSheet.headers,
      firstSheet.rows,
      manualOverride && manualEntity ? manualEntity : undefined,
    );
    const parsed = !manualOverride && sheets.length > 1 ? { ...parsedBase, entity: 'dynamic' as const } : parsedBase;
    if (parsed.entity === 'dynamic' && !PermissionService.can(currentUser, 'admin.data')) {
      throw new Error('الملف لا يطابق كيانًا معروفًا. صلاحية إنشاء أنواع البيانات المرنة غير متاحة لحسابك.');
    }

    setFileBuffer(buffer);
    setSpreadsheetSheets(sheets);
    setData(parsed);
    setManualEntity(parsed.entity);
    if (parsed.entity === 'dynamic') {
      setDynamicPreview({ headers: firstSheet.headers, rows: firstSheet.rows });
      setDynamicName(firstSheet.name || importFileName.replace(/\.[^.]+$/, ''));
      setIssues([]);
    } else {
      setDynamicPreview(null);
      setIssues(service.validate(parsed));
    }
    if (parsed.confidence < 0.35 && parsed.entity !== 'dynamic') {
      setMessage('التعرف التلقائي غير واثق. اختر نوع البيانات الصحيح وراجع مطابقة الأعمدة.');
    }
  };

  const prepareExtractedTextImport = (text: string, buffer: ArrayBuffer, importFileName: string) => {
    const sheet = parsePdfExtractedText(text, importFileName.replace(/\.[^.]+$/, ''));
    prepareSheetImport([sheet], buffer, importFileName);
    setExtractedText(text);
    setMessage('تم استخراج النص محليًا. راجع النص والبيانات المقترحة وطابق الحقول قبل الحفظ.');
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    setBusy(true); setMessage(''); setResult(null); setIssues([]); setData(null); setFileBuffer(null); setSpreadsheetSheets([]); setExtractedText('');
    setDynamicPreview(null); setDynamicResult(null); setBackupImport(null); setEncryptedBackupFile(null); setBackupPassword(''); setShowBackupPassword(false); setFileName(file.name);
    try {
      const lowerName = file.name.toLocaleLowerCase();
      if (lowerName.endsWith('.pdf')) {
        if (file.size > MAX_PDF_IMPORT_BYTES) {
          throw new Error(`حجم PDF يتجاوز الحد الأقصى (${MAX_PDF_IMPORT_BYTES / 1024 / 1024} ميجابايت).`);
        }
        const buffer = await file.arrayBuffer();
        const extractedText = await extractPdfText(buffer, setMessage);
        prepareExtractedTextImport(extractedText, buffer, file.name);
        return;
      }

      if (/\.(png|jpe?g|webp|gif)$/i.test(lowerName)) {
        const buffer = await file.arrayBuffer();
        const extractedText = await extractImageText(buffer, file.name, setMessage);
        prepareExtractedTextImport(extractedText, buffer, file.name);
        return;
      }

      const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
      const isEncryptedXlsx = lowerName.endsWith('.xlsx') && hasOfficeCompoundFileSignature(header);
      if (lowerName.endsWith('.ceramisys-backup') || isEncryptedXlsx) {
        if (!PermissionService.can(currentUser, 'admin.data.delete')) {
          throw new Error('لا تملك صلاحية استيراد النسخ الاحتياطية. يلزم منح صلاحية إدارة البيانات.');
        }
        setEncryptedBackupFile(file);
        setMessage('أدخل كلمة مرور النسخة الاحتياطية لفتح الملف ومراجعته.');
        return;
      }

      if (/\.(docx|json|xml|txt)$/i.test(lowerName)) {
        if (file.size > MAX_DATA_FILE_IMPORT_BYTES) {
          throw new Error(`حجم الملف يتجاوز الحد الأقصى (${MAX_DATA_FILE_IMPORT_BYTES / 1024 / 1024} ميجابايت).`);
        }
        const buffer = await file.arrayBuffer();
        prepareSheetImport(parseDataFileBuffer(buffer, file.name), buffer, file.name);
        return;
      }

      const extension = validateSpreadsheetFileMetadata(file.name, file.size);
      validateSpreadsheetFileHeader(extension, header);
      const parsedFile = await parseSpreadsheetInWorker(await file.arrayBuffer(), file.name);
      prepareSheetImport(parsedFile.sheets, parsedFile.buffer, file.name);
    } catch (e: any) { setData(null); setMessage(e?.message || 'تعذرت قراءة الملف.'); }
    finally { setBusy(false); }
  };

  const openEncryptedBackup = async () => {
    if (!encryptedBackupFile) return;
    if (!backupPassword) {
      setMessage('أدخل كلمة مرور النسخة الاحتياطية لفتح الملف.');
      return;
    }
    setBusy(true); setMessage('');
    try {
      const sheets = await backupService.readBackupDataForImport(encryptedBackupFile, backupPassword);
      const preview = adminDataService.previewDataImport(sheets);
      setBackupImport({ sheets, preview });
      setEncryptedBackupFile(null);
      setBackupPassword('');
      setMessage('تمت قراءة النسخة المشفرة. راجع ملخص السجلات قبل دمجها مع البيانات الحالية.');
    } catch (e: any) {
      const errorMessage = e?.message?.replace(/^Error invoking remote method '[^']+': Error:\s*/, '');
      setMessage(errorMessage || 'تعذر فتح النسخة المشفرة. تحقق من كلمة المرور وحاول مجددًا.');
    } finally { setBusy(false); }
  };

  const runBackupImport = async () => {
    if (!backupImport) return;
    setBusy(true); setMessage('');
    try {
      const outcome = await adminDataService.importData(backupImport.sheets);
      setBackupImport(null);
      setMessage(`تم استيراد النسخة: أُضيف ${outcome.insertedRows} سجل، واستُبدل ${outcome.updatedRows} سجل، وتم تخطي ${outcome.skippedRows} سجل.`);
    } catch (e: any) { setMessage(e?.message || 'تعذر استيراد النسخة المشفرة.'); }
    finally { setBusy(false); }
  };

  const changeEntity = (entity: ImportEntity | '') => {
    setManualEntity(entity);
    setManualOverride(Boolean(entity));
    if (!data) return;
    if (!spreadsheetSheets.length) return;
    const firstSheet = spreadsheetSheets[0];
    const next = service.parseRows(firstSheet.headers, firstSheet.rows, entity || undefined);
    setData(next); setIssues(next.entity === 'dynamic' ? [] : service.validate(next)); setResult(null); setDynamicResult(null);
    if (next.entity === 'dynamic') {
      setDynamicPreview({ headers: firstSheet.headers, rows: firstSheet.rows }); setDynamicName(firstSheet.name || fileName.replace(/\.[^.]+$/, ''));
    } else setDynamicPreview(null);
  };

  const changeExtractedText = (text: string) => {
    setExtractedText(text);
    setResult(null);
    setDynamicResult(null);
    try {
      const sheet = parsePdfExtractedText(text, fileName.replace(/\.[^.]+$/, ''));
      const next = service.parseRows(
        sheet.headers,
        sheet.rows,
        manualOverride && manualEntity ? manualEntity : undefined,
      );
      if (next.entity === 'dynamic' && !PermissionService.can(currentUser, 'admin.data')) {
        throw new Error('لم يتم التعرف على نوع بيانات معروف. يلزم منح صلاحية إدارة البيانات لإنشاء نوع مرن.');
      }
      setSpreadsheetSheets([sheet]);
      setData(next);
      setManualEntity(next.entity);
      if (next.entity === 'dynamic') {
        setDynamicPreview({ headers: sheet.headers, rows: sheet.rows });
        setIssues([]);
      } else {
        setDynamicPreview(null);
        setIssues(service.validate(next));
      }
      setMessage('');
    } catch (error: any) {
      setData(null);
      setSpreadsheetSheets([]);
      setDynamicPreview(null);
      setIssues([]);
      setMessage(error?.message || 'تعذر تحويل النص المستخرج إلى صفوف بيانات.');
    }
  };

  const changeMapping = (key: string, header: string) => {
    if (!data) return;
    const next = { ...data, mapping: { ...data.mapping, [key]: header } };
    setData(next); setIssues(service.validate(next)); setResult(null);
  };

  const downloadTemplate = () => {
    if (!data || data.entity === 'dynamic') return;
    const fields = ENTITY_META[data.entity].fields;
    const worksheet = XLSX.utils.aoa_to_sheet([fields.map(f => f.label), fields.map(() => '')]);
    const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, 'البيانات');
    XLSX.writeFile(workbook, `قالب-${data.entity}.xlsx`);
  };

  const runImport = () => {
    if (!data) return;
    setBusy(true); setMessage('');
    try {
      if (data.entity === 'dynamic') {
        if (!fileBuffer) throw new Error('أعد اختيار الملف قبل الاستيراد.');
        const outcome = dynamicService.importSheets(fileBuffer, fileName, spreadsheetSheets, dynamicName);
        setDynamicResult(outcome);
        setMessage(`تم استيراد ${outcome.imported} سجل إلى ${outcome.entities?.length||1} نوع بيانات. البيانات الأصلية محفوظة كاملة.`);
        setBusy(false);
        return;
      }
      const outcome = service.import(data, issues, { allowInitialBalances: allowBalances, allowProductStock: allowStock });
      setResult(outcome);
      if (outcome.created) setMessage(`تمت إضافة ${outcome.created} سجل بنجاح.`);
      else setMessage('لم تتم إضافة سجلات. راجع الأخطاء أدناه.');
    } catch (e: any) { setMessage(e?.message || 'تعذر إتمام الاستيراد.'); }
    finally { setBusy(false); }
  };

  const fields = data && data.entity !== 'dynamic' ? ENTITY_META[data.entity].fields : [];
  const invalidRows = new Set(issues.map(x => x.row));
  const validCount = data ? data.rows.length - invalidRows.size : 0;

  if (!canOpen) return <div className="m-8 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm font-bold text-amber-900" dir="rtl">لا تملك صلاحية استيراد البيانات. يرجى التواصل مع مسؤول النظام لمنحك الصلاحية اللازمة.</div>;
  return <div className="w-full p-4 md:p-8 space-y-6" dir="rtl">
    {/* Sub Navigation Bar */}
    <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
      <Link
        to="/data-import"
        className="px-4 py-2 rounded-xl text-xs font-black bg-sky-600 text-white shadow-sm"
      >
        مركز استيراد الملفات
      </Link>
      <Link
        to="/data-import/types"
        className="px-4 py-2 rounded-xl text-xs font-black text-slate-600 hover:bg-slate-100 transition"
      >
        إدارة أنواع البيانات المرنة والسجلات
      </Link>
    </div>

    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><div className="flex items-center gap-3"><span className="rounded-2xl bg-sky-100 p-3 text-sky-700"><FileSpreadsheet className="w-6 h-6" /></span><div><h1 className="text-2xl font-black text-slate-900">مركز استيراد البيانات</h1><p className="mt-1 text-sm text-slate-500">استورد الجداول والمستندات والصور، راجع البيانات وطابق الحقول قبل الحفظ، أو ادمج نسخة مشفرة.</p></div></div></div>
      {data && data.entity !== 'dynamic' && <button onClick={downloadTemplate} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"><Download className="h-4 w-4"/>تنزيل قالب {ENTITY_META[data.entity].label}</button>}
    </div>

    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block"><span className="mb-2 block text-xs font-black text-slate-600">تحديد نوع البيانات</span><select value={manualEntity} onChange={e=>changeEntity(e.target.value as ImportEntity)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold"><option value="">اكتشاف تلقائي من الملف</option>{Object.entries(ENTITY_META).filter(([,meta])=>PermissionService.can(currentUser,meta.permission)).map(([key,meta])=><option key={key} value={key}>{meta.label}</option>)}{PermissionService.can(currentUser,'admin.data')&&<option value="dynamic">إنشاء نوع بيانات مرن</option>}</select></label>
          <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3 text-sm font-black text-white hover:bg-sky-700">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<Upload className="h-4 w-4"/>}{fileName || 'اختر ملفًا للاستيراد'}<input type="file" accept=".xlsx,.xls,.csv,.pdf,.docx,.json,.xml,.txt,.png,.jpg,.jpeg,.webp,.gif,.ceramisys-backup,image/png,image/jpeg,image/webp,image/gif,application/pdf,application/json,text/plain,application/xml,application/octet-stream" className="hidden" onChange={e=>{void handleFile(e.target.files?.[0]);e.currentTarget.value='';}}/></label>
        </div>
        <p className="text-xs text-slate-500">الصيغ المدعومة: XLSX وXLS وCSV وPDF وDOCX وJSON وXML وTXT وصور PNG وJPG وWEBP وGIF، إضافة إلى النسخ المشفرة. الحد الأقصى لملفات DOCX وJSON وXML وTXT {MAX_DATA_FILE_IMPORT_BYTES / 1024 / 1024} ميجابايت، وللصورة {MAX_IMAGE_IMPORT_BYTES / 1024 / 1024} ميجابايت، ولـPDF {MAX_PDF_IMPORT_BYTES / 1024 / 1024} ميجابايت، وللجداول {MAX_SPREADSHEET_FILE_SIZE / 1024 / 1024} ميجابايت و{MAX_SPREADSHEET_ROWS.toLocaleString('ar-EG')} صف و{MAX_SPREADSHEET_COLUMNS} عمود. تُستخرج نصوص PDF والصور محليًا عبر OCR، وتُراجع كل البيانات قبل حفظها. النسخة المشفرة تُدمج بعد المراجعة ولا تستبدل قاعدة البيانات كاملة.</p>
        {message && <div className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-bold ${result?.created ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}><AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/><span>{message}</span></div>}
        {encryptedBackupFile && <div className="flex flex-wrap items-end gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <label className="min-w-60 flex-1 text-xs font-black text-amber-950">كلمة مرور النسخة الاحتياطية
            <span className="mt-1.5 flex overflow-hidden rounded-lg border border-amber-300 bg-white focus-within:ring-2 focus-within:ring-amber-400">
              <input
                type={showBackupPassword ? 'text' : 'password'}
                value={backupPassword}
                onChange={event => setBackupPassword(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter') void openEncryptedBackup(); }}
                autoComplete="off"
                className="min-w-0 flex-1 px-3 py-2.5 text-sm font-normal text-slate-900 outline-none"
                placeholder="أدخل كلمة المرور لفتح الملف"
              />
              <button
                type="button"
                onClick={() => setShowBackupPassword(visible => !visible)}
                aria-label={showBackupPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                aria-pressed={showBackupPassword}
                className="px-3 text-amber-800 hover:bg-amber-50"
              >
                {showBackupPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </span>
          </label>
          <button type="button" onClick={() => void openEncryptedBackup()} disabled={busy || !backupPassword} className="rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-40">
            {busy ? 'جارٍ فتح الملف...' : 'فتح الملف'}
          </button>
        </div>}
        {extractedText && <label className="block rounded-xl border border-sky-200 bg-sky-50/60 p-4 text-xs font-black text-sky-950">النص المستخرج — صحّح أخطاء القراءة قبل الاستيراد
          <textarea value={extractedText} onChange={event=>changeExtractedText(event.target.value)} rows={10} className="mt-2 w-full rounded-lg border border-sky-200 bg-white p-3 text-sm font-normal leading-6 text-slate-800" dir="auto" />
          <span className="mt-2 block text-[11px] font-normal text-sky-800">تتم المعالجة على الجهاز. ملفات PDF والصور تُقرأ بتقنية OCR المحلية للغتين العربية والإنجليزية.</span>
        </label>}
        {backupImport && <div role="dialog" aria-modal="true" aria-labelledby="backup-import-review-title" className="fixed inset-0 z-[100] flex flex-col gap-4 overflow-hidden bg-amber-50 p-3 text-slate-900 sm:p-5 lg:p-7">
          <div className="shrink-0">
            <h2 id="backup-import-review-title" className="text-xl font-black text-amber-950 sm:text-2xl">مراجعة النسخة المشفرة قبل الدمج</h2>
            <p className="mt-2 text-sm leading-6 text-amber-900">السجلات الجديدة ستُضاف، والسجلات المتعارضة ستُحدّث بعد موافقتك. لن تُحذف البيانات الأخرى ولن تُستبدل قاعدة البيانات كاملة. الجداول المحمية لن تُستورد.</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 text-sm font-bold">
            <span className="rounded-lg bg-white px-4 py-2.5">جداول: {backupImport.preview.tables.length}</span>
            <span className="rounded-lg bg-emerald-100 px-4 py-2.5 text-emerald-900">جديد: {backupImport.preview.newRows}</span>
            <span className="rounded-lg bg-orange-100 px-4 py-2.5 text-orange-900">متعارض: {backupImport.preview.conflictRows}</span>
            <span className="rounded-lg bg-white px-4 py-2.5">متخطى: {backupImport.preview.skippedRows}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-amber-200 bg-white">
            <table className="min-w-full text-right text-sm">
              <thead className="sticky top-0 z-10 bg-amber-100 text-amber-950">
                <tr>
                  <th className="whitespace-nowrap p-3 sm:p-4">الجدول</th>
                  <th className="whitespace-nowrap p-3 sm:p-4">في الملف</th>
                  <th className="whitespace-nowrap p-3 sm:p-4">الحالي</th>
                  <th className="whitespace-nowrap p-3 sm:p-4">جديد</th>
                  <th className="whitespace-nowrap p-3 sm:p-4">متعارض</th>
                  <th className="whitespace-nowrap p-3 sm:p-4">متخطى</th>
                  <th className="whitespace-nowrap p-3 sm:p-4">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {backupImport.preview.tables.map(table=>(
                  <React.Fragment key={table.table}>
                    <tr className="border-t border-amber-100">
                      <td className="whitespace-nowrap p-3 font-mono font-bold sm:p-4">{table.table}</td>
                      <td className="p-3 sm:p-4">{table.incomingRows}</td>
                      <td className="p-3 sm:p-4">{table.existingRows}</td>
                      <td className="p-3 sm:p-4">{table.newRows}</td>
                      <td className="p-3 sm:p-4">{table.conflictRows}</td>
                      <td className="p-3 sm:p-4">{table.skippedRows}</td>
                      <td className={`whitespace-nowrap p-3 font-bold sm:p-4 ${table.protected ? 'text-amber-700' : 'text-emerald-700'}`}>
                        {table.protected ? 'محمي — لن يُستورد' : 'جاهز للدمج'}
                      </td>
                    </tr>
                    {table.sampleConflicts.length > 0 && (
                      <tr className="border-t border-amber-100 bg-amber-50">
                        <td colSpan={7} className="space-y-2 p-3 sm:p-4">
                          {table.sampleConflicts.map((conflict,index)=>(
                            <div key={`${conflict.key}-${index}`} className="rounded-lg bg-white p-3">
                              <div className="font-bold">مفتاح السجل: {conflict.key}</div>
                              {conflict.changes.length
                                ? conflict.changes.map(change=>(
                                  <div key={change.column} className="mt-1 break-words text-slate-700">
                                    {change.column} — الحالي: {formatImportValue(change.existing)} ← الملف: {formatImportValue(change.imported)}
                                  </div>
                                ))
                                : <div className="mt-1 text-slate-600">لا توجد اختلافات في القيم.</div>}
                            </div>
                          ))}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3 border-t border-amber-200 pt-3">
            <button onClick={()=>void runBackupImport()} disabled={busy||backupImport.preview.newRows+backupImport.preview.conflictRows===0} className="rounded-xl bg-amber-700 px-5 py-3 text-sm font-black text-white disabled:opacity-40">{busy ? 'جارٍ الدمج...' : 'دمج السجلات المعروضة'}</button>
            <button onClick={()=>setBackupImport(null)} disabled={busy} className="rounded-xl border border-amber-300 bg-white px-5 py-3 text-sm font-bold text-amber-900 disabled:opacity-40">إلغاء</button>
          </div>
        </div>}
        {data?.entity === 'dynamic' && dynamicPreview && <div className="space-y-4 rounded-xl border border-violet-200 bg-violet-50/60 p-4"><div className="flex items-start gap-3"><WandSparkles className="mt-1 h-5 w-5 text-violet-700"/><div><h2 className="font-black text-violet-950">نوع غير معروف — سيُنشأ له تعريف قابل لإعادة الاستخدام</h2><p className="mt-1 text-xs leading-5 text-violet-900">سيتم استنتاج أنواع الحقول مبدئيًا، وحفظ كل قيمة أصلية كما وردت في الملف. يمكن تعديل التعريف والبحث والتصدير من إدارة الأنواع.</p></div></div><label className="block text-xs font-black text-slate-700">اسم نوع البيانات<input value={dynamicName} onChange={e=>setDynamicName(e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm" placeholder="اسم الورقة أو اسم واضح لهذا النوع"/></label><div className="overflow-auto rounded-lg border border-slate-200 bg-white"><table className="min-w-full text-right text-xs"><thead className="bg-slate-100"><tr>{dynamicPreview.headers.map(h=><th key={h} className="p-2.5">{h}</th>)}</tr></thead><tbody>{dynamicPreview.rows.slice(0,8).map((row,i)=><tr key={i} className="border-t border-slate-100">{dynamicPreview.headers.map(h=><td key={h} className="max-w-48 truncate p-2.5">{String(row[h]??'')}</td>)}</tr>)}</tbody></table></div><div className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs font-bold text-slate-600">{dynamicPreview.rows.length} سجل · {dynamicPreview.headers.length} حقل · ستُحفظ القيم الأصلية كاملة</span><button onClick={runImport} disabled={!dynamicName.trim()||busy||!PermissionService.can(currentUser,'admin.data')} className="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-40">إنشاء النوع واستيراد البيانات</button></div>{dynamicResult&&<Link className="inline-block text-sm font-black text-violet-800 underline" to="/data-import/types">فتح إدارة الأنواع والسجلات</Link>}</div>}
        {data && data.entity !== 'dynamic' && <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3"><div className="flex items-center gap-2"><WandSparkles className="h-4 w-4 text-violet-600"/><span className="text-sm font-black">نوع البيانات: {ENTITY_META[data.entity].label}</span><span className="text-xs text-slate-500">({data.rows.length} صف)</span></div><span className="text-xs font-bold text-slate-500">تم ربط {Object.keys(data.mapping).length} من {fields.length} عمود</span></div>
          <div><h2 className="mb-3 text-sm font-black text-slate-800">مطابقة الأعمدة</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{fields.map(field=><label key={field.key} className="text-xs font-bold text-slate-600">{field.label}{field.required&&<span className="text-rose-600"> *</span>}<select value={data.mapping[field.key]||''} onChange={e=>changeMapping(field.key,e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"><option value="">— غير مرتبط —</option>{data.headers.map(h=><option key={h} value={h}>{h}</option>)}</select></label>)}</div></div>
          {(data.entity==='customers'||data.entity==='suppliers')&&<label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900"><input type="checkbox" checked={allowBalances} onChange={e=>setAllowBalances(e.target.checked)} className="mt-0.5"/>تطبيق عمود الرصيد الافتتاحي على حسابات {ENTITY_META[data.entity].label}. يؤثر هذا على الأرصدة المالية.</label>}
          {data.entity==='products'&&<label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900"><input type="checkbox" checked={allowStock} onChange={e=>setAllowStock(e.target.checked)} className="mt-0.5"/>إضافة الكميات من عمود الرصيد الافتتاحي إلى المخزن الافتراضي، مع تسجيل حركة مخزنية.</label>}
          <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[700px] text-right text-xs"><thead className="bg-slate-50 text-slate-600"><tr><th className="p-3">صف الملف</th>{fields.filter(f=>data.mapping[f.key]).slice(0,7).map(f=><th key={f.key} className="p-3">{f.label}</th>)}<th className="p-3">التحقق</th></tr></thead><tbody>{data.rows.slice(0,100).map((row,i)=>{const rowNo=i+2;const rowIssues=issues.find(x=>x.row===rowNo);return <tr key={rowNo} className="border-t border-slate-100"><td className="p-3 font-bold">{rowNo}</td>{fields.filter(f=>data.mapping[f.key]).slice(0,7).map(f=><td key={f.key} className="max-w-48 truncate p-3">{String(row[data.mapping[f.key]]??'')}</td>)}<td className="p-3">{rowIssues?<span className="text-rose-700">{rowIssues.messages.join('، ')}</span>:<span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5"/>صالح</span>}</td></tr>})}</tbody></table>{data.rows.length>100&&<p className="bg-slate-50 p-2 text-center text-xs text-slate-500">معاينة أول 100 صف؛ سيتم فحص كل الصفوف عند الاستيراد.</p>}</div>
          {result?.errors?.length ? <div className="max-h-36 overflow-auto rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{result.errors.map(e=><p key={e.row}>صف {e.row}: {e.messages.join('، ')}</p>)}</div>:null}
        </>}
      </section>

      <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-3 font-black text-slate-900">أنواع البيانات المدعومة</h2><ul className="space-y-2">{Object.entries(ENTITY_META).filter(([,meta])=>PermissionService.can(currentUser,meta.permission)).map(([key,meta])=><li key={key} className={`rounded-lg px-3 py-2 text-xs font-bold ${data?.entity===key?'bg-sky-50 text-sky-800':'bg-slate-50 text-slate-600'}`}>{meta.label}</li>)}</ul>{PermissionService.can(currentUser,'admin.data')&&<Link to="/data-import/types" className="mt-4 block rounded-xl bg-violet-50 hover:bg-violet-100 p-3 text-xs font-black text-violet-900 border border-violet-200 transition">إدارة الأنواع المرنة والسجلات والعلاقات ←</Link>}<div className="mt-4 rounded-xl bg-violet-50 p-3 text-xs leading-6 text-violet-900"><b>حقول إضافية:</b> الأصناف تشمل أكواد وباركود وأسعار ومقاسات وفرز ومتر الكرتونة وقطعها. يمكن تصدير القوالب من هنا وتعبئتها قبل الاستيراد.</div>{data&&data.entity!=='dynamic'&&<><button onClick={runImport} disabled={!PermissionService.can(currentUser,ENTITY_META[data.entity].permission)||validCount===0||busy} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<Upload className="h-4 w-4"/>}استيراد {validCount>0?`${validCount} سجل صالح`:''}</button><p className="mt-2 text-center text-[11px] text-slate-500">الصفوف غير الصالحة أو المكررة تُتخطى ويُذكر سببها.</p></>}</aside>
    </div>
  </div>;
};
