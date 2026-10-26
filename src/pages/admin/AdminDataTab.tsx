import React, { useEffect, useMemo, useState } from 'react';
import { Database, Download, HardDrive, Table2, RefreshCw, ShieldCheck, Wrench, Eye, Search } from 'lucide-react';
import { DataAdminService, type StorageStats, type TableInfo } from '../../services/DataAdminService';
import { usePermission } from '../../hooks/usePermission';
import { useToast } from '../../components/ui/Toast';

import { download, formatBytes } from './adminDataUtils';
import { AdminDataTable } from './AdminDataTable';

export const AdminDataTab: React.FC = () => {
  const toast = useToast();
  const can = usePermission();
  const allowed = can('admin.data');
  const canExport = can('admin.data.export');
  const service = useMemo(() => new DataAdminService(), []);
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<TableInfo | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [integrity, setIntegrity] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

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
      const result = service.exportTableJson(table.name);
      download(result.fileName, result.content);
      toast.success('تم تصدير الجدول.');
    } catch (error: any) {
      toast.error('تعذر التصدير', error?.message);
    }
  };

  const exportAll = () => {
    try {
      const result = service.exportAllJson();
      download(result.fileName, result.content);
      toast.success('تم تصدير كل البيانات.');
    } catch (error: any) {
      toast.error('تعذر التصدير', error?.message);
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
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm font-bold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
        لا تملك صلاحية أدوات البيانات (admin.data).
      </div>
    );
  }

  const filteredTables = tables.filter((table) => !search.trim() || table.name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Database} label="حجم قاعدة البيانات" value={stats ? formatBytes(stats.databaseBytes) : '—'} />
        <Stat icon={HardDrive} label="حجم التخزين المحلي" value={stats ? formatBytes(stats.localStorageBytes) : '—'} />
        <Stat icon={Table2} label="عدد الجداول" value={stats ? String(stats.tableCount) : '—'} />
        <Stat icon={Table2} label="إجمالي السجلات" value={stats ? stats.totalRows.toLocaleString('en-US') : '—'} />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث عن جدول..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 pr-9 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
        <button onClick={load} className="rounded-xl border border-slate-200 dark:border-slate-700 p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="تحديث">
          <RefreshCw className="h-4 w-4" />
        </button>
        {canExport && <button onClick={exportAll} className="flex items-center gap-1.5 rounded-xl bg-sky-600 px-3 py-2 text-xs font-bold text-white hover:bg-sky-700">
          <Download className="h-4 w-4" /> تصدير كل البيانات JSON
        </button>}
        <button onClick={runIntegrity} className="flex items-center gap-1.5 rounded-xl border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/30 dark:hover:bg-emerald-500/10">
          <ShieldCheck className="h-4 w-4" /> فحص السلامة
        </button>
        <button onClick={runVacuum} disabled={busy} className="flex items-center gap-1.5 rounded-xl border border-amber-200 px-3 py-2 text-xs font-bold text-amber-700 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-500/30 dark:hover:bg-amber-500/10">
          <Wrench className="h-4 w-4" /> VACUUM
        </button>
      </div>

      {integrity && (
        <div className={`rounded-2xl border p-4 text-xs font-bold ${integrity.every((l) => l.toLowerCase() === 'ok') ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300' : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300'}`}>
          نتيجة فحص السلامة: {integrity.join(' | ')}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
        <div className="max-h-[60vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          {filteredTables.map((table) => (
            <div
              key={table.name}
              className={`flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 px-3 py-2 text-xs last:border-0 ${
                selected?.name === table.name ? 'bg-sky-50 dark:bg-sky-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
              }`}
            >
              <Table2 className="h-3.5 w-3.5 text-slate-400" />
              <button onClick={() => view(table)} className="min-w-0 flex-1 truncate text-right font-mono font-bold text-slate-700 dark:text-slate-200">{table.name}</button>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">{table.rows}</span>
              <button onClick={() => view(table)} className="rounded p-1 text-slate-400 hover:text-sky-600" title="عرض">
                <Eye className="h-3.5 w-3.5" />
              </button>
              {canExport && <button onClick={() => exportTable(table)} className="rounded p-1 text-slate-400 hover:text-emerald-600" title="تصدير">
                <Download className="h-3.5 w-3.5" />
              </button>}
            </div>
          ))}
          {filteredTables.length === 0 && <div className="p-6 text-center text-xs text-slate-400">لا توجد جداول مطابقة.</div>}
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-4 py-3">
            <div className="text-xs font-extrabold text-slate-900 dark:text-slate-100">
              {selected ? <span className="font-mono">{selected.name}</span> : 'اختر جدولاً للعرض'}
            </div>
            {selected && <span className="text-[11px] text-slate-400">أول 50 سجل</span>}
          </div>
          <div className="max-h-[54vh] overflow-auto">
            {selected ? (
              rows.length > 0 ? (
                <AdminDataTable rows={rows} columns={columns} />
              ) : (
                <div className="p-8 text-center text-xs text-slate-400">الجدول فارغ.</div>
              )
            ) : (
              <div className="p-8 text-center text-xs text-slate-400">اختر جدولاً من القائمة لعرض بياناته.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const Stat: React.FC<{ icon: React.ElementType; label: string; value: string }> = ({ icon: Icon, label, value }) => (
  <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
    <div className="flex items-center gap-2 text-slate-400">
      <Icon className="h-4 w-4" />
      <span className="text-[11px] font-bold">{label}</span>
    </div>
    <div className="mt-1 font-mono text-lg font-black text-slate-900 dark:text-slate-100">{value}</div>
  </div>
);
