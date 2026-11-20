import React, { useEffect, useMemo, useState } from 'react';
import { Database, Download, HardDrive, Table2, RefreshCw, ShieldCheck, Wrench, Eye, Search, Upload, X } from 'lucide-react';
import {
  DataAdminService, type StorageStats, type TableInfo,
  type DataImportConflictPolicy, type DataImportPreview, type DataImportSheet,
} from '../../../services/domains/admin/DataAdminService';
import { BackupService } from '../../../services/infrastructure/backup/BackupService';
import { usePermission } from '../../../hooks/domains/auth/usePermission';
import { useToast } from '../../../components/ui/Toast';

import { downloadExcel, formatBytes, formatImportValue, parseAdminDataWorkbook } from './adminDataUtils';
import { AdminDataTable } from './AdminDataTable';
import { hasOfficeCompoundFileSignature } from '../../../services/infrastructure/backup/xlsxBackup';

export const AdminDataTab: React.FC = () => {
  const toast = useToast();
  const can = usePermission();
  const allowed = can('admin.data');
  const canExport = can('admin.data.export');
  const canImport = can('admin.data.import');
  const canImportBackup = can('settings.backup');
  const service = useMemo(() => new DataAdminService(), []);
  const backupService = useMemo(() => new BackupService(), []);
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<TableInfo | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [integrity, setIntegrity] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingImport, setPendingImport] = useState<{
    fileName: string;
    sheets: DataImportSheet[];
    preview: DataImportPreview;
    sourceType: 'xlsx' | 'backup';
  } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [conflictPolicy, setConflictPolicy] = useState<DataImportConflictPolicy>('overwrite');

  const load = () => {
    if (!allowed) return;
    try {
      setTables(service.listTables());
      setStats(service.getStorageStats());
    } catch (error: any) {
      toast.error('تعذر تحميل بيانات قاعدة البيانات', error?.message);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  const view = (table: TableInfo) => {
    try {
      const data = service.getRows(table.name, { limit: 50 });
      setSelected(table);
      setRows(data);
      setColumns(data[0] ? Object.keys(data[0]) : service.getColumns(table.name).map((c) => c.name));
    } catch (error: any) {
      toast.error('تعذر عرض الجدول', error?.message);
    }
  };

  const exportTable = (table: TableInfo) => {
    try {
      const result = service.exportTableData(table.name);
      downloadExcel(result.fileName, result.sheets);
      toast.success('تم تصدير الجدول.');
    } catch (error: any) {
      toast.error('تعذر التصدير', error?.message);
    }
  };

  const exportAll = () => {
    try {
      const result = service.exportAllData();
      downloadExcel(result.fileName, result.sheets);
      toast.success('تم تصدير كل البيانات.');
    } catch (error: any) {
      toast.error('تعذر التصدير', error?.message);
    }
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    try {
      const lowerName = file.name.toLocaleLowerCase();
      const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
      const isEncryptedXlsx = lowerName.endsWith('.xlsx') && hasOfficeCompoundFileSignature(header);
      const sourceType = lowerName.endsWith('.ceramisys-backup') || isEncryptedXlsx ? 'backup' : 'xlsx';
      if (sourceType === 'backup' && !canImportBackup) {
        throw new Error('لا تملك صلاحية استيراد النسخ الاحتياطية المشفرة.');
      }
      const sheets = sourceType === 'backup'
        ? await backupService.readBackupDataForImport(file)
        : parseAdminDataWorkbook(await file.arrayBuffer(), file.name);
      const preview = service.previewDataImport(sheets, conflictPolicy);
      setPendingImport({ fileName: file.name, sheets, preview, sourceType });
    } catch (error: any) {
      toast.error('تعذر قراءة ملف الاستيراد', error?.message);
    }
  };

  const acceptImport = async () => {
    if (!pendingImport) return;
    setIsImporting(true);
    try {
      const result = await service.importData(pendingImport.sheets, conflictPolicy);
      setPendingImport(null);
      setSelected(null);
      setRows([]);
      setColumns([]);
      load();
      toast.success(
        'تم استيراد البيانات.',
        `أُضيف ${result.insertedRows} سجل، واستُبدل ${result.updatedRows} سجل، وتم تخطي ${result.skippedRows} سجل.`
      );
    } catch (error: any) {
      toast.error('تعذر استيراد البيانات', error?.message);
    } finally {
      setIsImporting(false);
    }
  };

  const runIntegrity = () => {
    try {
      const result = service.integrityCheck();
      setIntegrity(result);
      if (result.every((line) => line.toLowerCase() === 'ok')) toast.success('قاعدة البيانات سليمة.');
      else toast.warning('نتائج فحص السلامة تحتاج مراجعة.');
    } catch (error: any) {
      toast.error('تعذر فحص السلامة', error?.message);
    }
  };

  const runVacuum = () => {
    if (!window.confirm('ضغط قاعدة البيانات قد يستغرق لحظات. متابعة؟')) return;
    setBusy(true);
    try {
      service.vacuum();
      load();
      toast.success('تم ضغط قاعدة البيانات.');
    } catch (error: any) {
      toast.error('تعذر الضغط', error?.message);
    } finally {
      setBusy(false);
    }
  };

  if (!allowed) {
    return (
      <div className="rounded-2xl border border-warning-border bg-warning-soft p-6 text-sm font-bold text-warning dark:border-warning/30 dark:bg-warning/10 ">
        لا تملك صلاحية أدوات البيانات (admin.data).
      </div>
    );
  }

  const filteredTables = tables.filter((table) => !search.trim() || table.name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Database} label="حجم قاعدة البيانات" value={stats ? formatBytes(stats.databaseBytes) : '—'} />
        <Stat icon={HardDrive} label="حجم التخزين المحلي" value={stats ? formatBytes(stats.localStorageBytes) : '—'} />
        <Stat icon={Table2} label="عدد الجداول" value={stats ? String(stats.tableCount) : '—'} />
        <Stat icon={Table2} label="إجمالي السجلات" value={stats ? stats.totalRows.toLocaleString('en-US') : '—'} />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-4">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث عن جدول..."
            className="w-full rounded-xl border border-line bg-surface-muted px-3 py-2 pr-9 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 "
          />
        </div>
        <button onClick={load} className="rounded-xl border border-line p-2 text-muted hover:bg-surface-sunken dark:hover:bg-primary" title="تحديث">
          <RefreshCw className="h-4 w-4" />
        </button>
        {canExport && <button onClick={exportAll} className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white hover:bg-primary">
          <Download className="h-4 w-4" /> تصدير كل البيانات في جدول بيانات
        </button>}
        {canImport && <label className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-accent-border px-3 py-2 text-xs font-bold text-primary hover:bg-accent-soft dark:border-primary/30 dark:hover:bg-primary/10">
          <Upload className="h-4 w-4" /> استيراد جدول بيانات أو نسخة مشفرة
          <input type="file" accept=".xlsx,.ceramisys-backup,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream" onChange={(event) => void handleImportFile(event)} className="hidden" />
        </label>}
        <button onClick={runIntegrity} className="flex items-center gap-1.5 rounded-xl border border-success-border px-3 py-2 text-xs font-bold text-success hover:bg-success-soft dark:border-success/30 dark:hover:bg-success/10">
          <ShieldCheck className="h-4 w-4" /> فحص السلامة
        </button>
        <button onClick={runVacuum} disabled={busy} className="flex items-center gap-1.5 rounded-xl border border-warning-border px-3 py-2 text-xs font-bold text-warning hover:bg-warning-soft disabled:opacity-50 dark:border-warning/30 dark:hover:bg-warning/10">
          <Wrench className="h-4 w-4" /> VACUUM
        </button>
      </div>

      {pendingImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/50 p-4" role="dialog" aria-modal="true" aria-labelledby="data-import-title">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-surface shadow-2xl ">
            <div className="flex items-start justify-between border-b border-line p-5 ">
              <div>
                <h2 id="data-import-title" className="text-base font-black text-ink ">مراجعة البيانات قبل الاستيراد</h2>
                <p className="mt-1 break-all text-xs text-muted">{pendingImport.fileName}</p>
              </div>
              <button type="button" onClick={() => setPendingImport(null)} className="rounded-lg p-2 text-muted hover:bg-surface-sunken dark:hover:bg-primary" aria-label="إغلاق">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[62vh] space-y-3 overflow-auto p-5">
              <div className="rounded-xl border border-warning-border bg-warning-soft p-3 text-xs leading-6 text-warning dark:border-warning/30 dark:bg-warning/10 ">
                {pendingImport.sourceType === 'backup'
                  ? 'هذه نسخة مشفرة كاملة. أدخل كلمة مرورها لعرض مقارنة السجلات. عند القبول ستُضاف السجلات الجديدة وتُستبدل السجلات المتعارضة؛ لن تُحذف بقية البيانات ولن تُستبدل قاعدة البيانات كاملة. الجداول المحمية، مثل المستخدمين والصلاحيات وإعدادات النظام وسجل التدقيق وتسلسل أرقام المستندات، لن تُستورد.'
                  : 'ستُضاف السجلات الجديدة، وستظهر السجلات المطابقة لمفتاح موجود مع مقارنة القيم قبل اعتماد استبدالها. لن تُحذف السجلات غير الموجودة في الملف. لن تُستورد الجداول المحمية، مثل المستخدمين والصلاحيات وإعدادات النظام وسجل التدقيق وتسلسل أرقام المستندات.'}
              </div>
              <label className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-3 py-2 text-xs font-bold text-ink ">
                <span>سياسة التعارض:</span>
                <select
                  value={conflictPolicy}
                  disabled={isImporting}
                  onChange={(event) => {
                    const next = event.target.value as DataImportConflictPolicy;
                    setConflictPolicy(next);
                    try {
                      const pending = pendingImport;
                      setPendingImport({
                        ...pending,
                        preview: service.previewDataImport(pending.sheets, next),
                      });
                    } catch (error: any) {
                      toast.error('تعذر إعادة حساب المعاينة', error?.message);
                    }
                  }}
                  className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs "
                >
                  <option value="overwrite">استبدال قيم السجلات الموجودة</option>
                  <option value="skip">تخطي السجلات الموجودة والاحتفاظ بقيمها</option>
                </select>
                <span className="font-normal text-muted">
                  {conflictPolicy === 'overwrite'
                    ? 'ستُستبدل جميع أعمدة السجل الموجود بقيم الملف.'
                    : 'لن تُلمس السجلات الموجودة؛ ستُضاف السجلات الجديدة فقط.'}
                </span>
              </label>
              <div className="flex flex-wrap gap-2 text-xs font-bold">
                <span className="rounded-lg bg-surface-sunken px-3 py-2 ">جداول: {pendingImport.preview.tables.length}</span>
                <span className="rounded-lg bg-success-soft px-3 py-2 text-success dark:bg-success/10 ">جديد: {pendingImport.preview.newRows}</span>
                <span className="rounded-lg bg-warning-soft px-3 py-2 text-warning dark:bg-warning/10 ">موجود وسيتم استبداله عند القبول: {pendingImport.preview.conflictRows}</span>
                <span className="rounded-lg bg-surface-sunken px-3 py-2 ">متخطى: {pendingImport.preview.skippedRows}</span>
              </div>
              <div className="space-y-2">
                {pendingImport.preview.tables.map((table) => (
                  <section key={table.table} className="rounded-xl border border-line p-3 ">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="font-mono text-xs">{table.table}</strong>
                      <span className="text-[11px] text-muted">
                        الملف: {table.incomingRows} · الحالي: {table.existingRows} · جديد: {table.newRows} · متعارض: {table.conflictRows} · متخطى: {table.skippedRows}
                      </span>
                    </div>
                    {table.protected && <p className="mt-2 text-xs font-bold text-warning ">جدول محمي — لن يتم استيراده.</p>}
                    {table.sampleConflicts.map((conflict, index) => (
                      <div key={`${conflict.key}-${index}`} className="mt-2 rounded-lg bg-warning-soft p-2 text-[11px] dark:bg-warning/10">
                        <div className="font-bold text-warning ">مفتاح السجل: {conflict.key}</div>
                        {conflict.changes.length > 0 ? conflict.changes.map((change) => (
                          <div key={change.column} className="mt-1 break-words text-ink ">
                            {change.column} — الموجود: {formatImportValue(change.existing)} ← الملف: {formatImportValue(change.imported)}
                          </div>
                        )) : <div className="mt-1 text-ink-secondary ">القيم متطابقة؛ لا يوجد اختلاف بين الملف والبيانات الحالية.</div>}
                      </div>
                    ))}
                    {table.conflictRows > table.sampleConflicts.length && (
                      <p className="mt-2 text-[11px] text-muted">عُرضت أول {table.sampleConflicts.length} حالات من أصل {table.conflictRows} تعارض.</p>
                    )}
                  </section>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-line p-4 ">
              <button type="button" onClick={() => setPendingImport(null)} disabled={isImporting} className="rounded-xl border border-line-strong px-4 py-2 text-xs font-bold text-ink disabled:opacity-50 ">
                رفض الاستيراد
              </button>
              <button type="button" onClick={() => void acceptImport()} disabled={isImporting || pendingImport.preview.newRows + pendingImport.preview.conflictRows === 0} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
                {isImporting ? 'جاري الاستيراد...' : 'قبول الاستبدال واستيراد الجديد'}
              </button>
            </div>
          </div>
        </div>
      )}

      {integrity && (
        <div className={`rounded-2xl border p-4 text-xs font-bold ${integrity.every((l) => l.toLowerCase() === 'ok') ? 'border-success-border bg-success-soft text-success dark:border-success/30 dark:bg-success/10 dark:text-success' : 'border-danger-border bg-danger-soft text-danger dark:border-danger/30 dark:bg-danger/10 dark:text-danger'}`}>
          نتيجة فحص السلامة: {integrity.join(' | ')}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
        <div className="max-h-[60vh] overflow-y-auto rounded-2xl border border-line bg-surface ">
          {filteredTables.map((table) => (
            <div
              key={table.name}
              className={`flex items-center gap-2 border-b border-line px-3 py-2 text-xs last:border-0 ${
 selected?.name === table.name ? 'bg-accent-soft dark:bg-primary/10' : 'hover:bg-surface-muted dark:hover:bg-primary/60'
 }`}
            >
              <Table2 className="h-3.5 w-3.5 text-muted" />
              <button onClick={() => view(table)} className="min-w-0 flex-1 truncate text-right font-mono font-bold text-ink ">{table.name}</button>
              <span className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-[10px] text-muted ">{table.rows}</span>
              <button onClick={() => view(table)} className="rounded p-1 text-muted hover:text-primary" title="عرض">
                <Eye className="h-3.5 w-3.5" />
              </button>
              {canExport && <button onClick={() => exportTable(table)} className="rounded p-1 text-muted hover:text-success" title="تصدير">
                <Download className="h-3.5 w-3.5" />
              </button>}
            </div>
          ))}
          {filteredTables.length === 0 && <div className="p-6 text-center text-xs text-muted">لا توجد جداول مطابقة.</div>}
        </div>

        <div className="overflow-hidden rounded-2xl border border-line bg-surface ">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div className="text-xs font-extrabold text-ink ">
              {selected ? <span className="font-mono">{selected.name}</span> : 'اختر جدولاً للعرض'}
            </div>
            {selected && <span className="text-[11px] text-muted">أول 50 سجل</span>}
          </div>
          <div className="max-h-[54vh] overflow-auto">
            {selected ? (
              rows.length > 0 ? (
                <AdminDataTable rows={rows} columns={columns} />
              ) : (
                <div className="p-8 text-center text-xs text-muted">الجدول فارغ.</div>
              )
            ) : (
              <div className="p-8 text-center text-xs text-muted">اختر جدولاً من القائمة لعرض بياناته.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const Stat: React.FC<{ icon: React.ElementType; label: string; value: string }> = ({ icon: Icon, label, value }) => (
  <div className="rounded-2xl border border-line bg-surface p-4">
    <div className="flex items-center gap-2 text-muted">
      <Icon className="h-4 w-4" />
      <span className="text-[11px] font-bold">{label}</span>
    </div>
    <div className="mt-1 font-mono text-lg font-black text-ink ">{value}</div>
  </div>
);
