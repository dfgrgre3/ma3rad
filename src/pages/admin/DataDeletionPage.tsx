import React, { useEffect, useMemo, useState } from 'react';
import {
  Trash2, AlertTriangle, Database, CalendarRange, Rows3, ShieldAlert,
  RefreshCw, CheckCircle2, Table2, Search,
} from 'lucide-react';
import {
  DataAdminService, RESET_KEEP_BY_DEFAULT,
  type TableInfo, type ColumnInfo, type DeleteResult,
} from '../../services/DataAdminService';
import { usePermission } from '../../hooks/usePermission';
import { useToast } from '../../components/ui/Toast';

type Mode = 'all' | 'table' | 'rows' | 'range';

const MODES: { id: Mode; label: string; icon: React.ElementType; hint: string }[] = [
  { id: 'all', label: 'تصفير بيانات النظام', icon: Database, hint: 'حذف بيانات كل الجداول المحددة مع الإبقاء على المستخدمين والصلاحيات.' },
  { id: 'table', label: 'حذف بيانات جدول محدد', icon: Table2, hint: 'تفريغ جدول واحد بالكامل دون حذف الجدول نفسه.' },
  { id: 'rows', label: 'حذف سجلات محددة', icon: Rows3, hint: 'اختيار صفوف بعينها من جدول وحذفها.' },
  { id: 'range', label: 'حذف حسب النطاق الزمني', icon: CalendarRange, hint: 'حذف السجلات الواقعة بين تاريخين بترتيب تصاعدي.' },
];

const RANGE_PREVIEW_LIMIT = 100;
const ROW_PAGE_SIZE = 50;

export const DataDeletionPage: React.FC = () => {
  const toast = useToast();
  const can = usePermission();
  const allowed = can('admin.data');
  const service = useMemo(() => new DataAdminService(), []);

  const [mode, setMode] = useState<Mode>('all');
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  // mode: all
  const [resetSelection, setResetSelection] = useState<Set<string>>(new Set());

  // mode: table
  const [tableTarget, setTableTarget] = useState('');
  const [tableSearch, setTableSearch] = useState('');

  // mode: rows
  const [rowsTable, setRowsTable] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [rowColumns, setRowColumns] = useState<string[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [rowOffset, setRowOffset] = useState(0);

  // mode: range
  const [rangeTable, setRangeTable] = useState('');
  const [rangeColumns, setRangeColumns] = useState<ColumnInfo[]>([]);
  const [rangeColumn, setRangeColumn] = useState('');
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [rangeCount, setRangeCount] = useState<number | null>(null);

  const load = () => {
    if (!allowed) return;
    try {
      const list = service.listDeletableTables();
      setTables(list);
      setResetSelection(
        new Set(list.filter((t) => t.rows > 0 && !RESET_KEEP_BY_DEFAULT.includes(t.name)).map((t) => t.name))
      );
    } catch (error: any) {
      toast.error('تعذر تحميل قائمة الجداول', error?.message);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  const clearConfirm = () => setConfirmText('');

  const report = (result: DeleteResult, message: string) => {
    toast.success(message, `تم حذف ${result.deleted.toLocaleString('en-US')} سجل.`);
    clearConfirm();
    load();
    setRows([]);
    setSelectedRows(new Set());
    setRangeCount(null);
  };

  // ── mode: all ──────────────────────────────────────────────────────────────
  const resetTargets = tables.filter((t) => resetSelection.has(t.name));
  const resetRowTotal = resetTargets.reduce((sum, t) => sum + t.rows, 0);

  const toggleResetTable = (name: string) => {
    setResetSelection((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const runReset = () => {
    if (resetTargets.length === 0) return toast.warning('لم تحدد أي جدول.');
    if (confirmText.trim() !== 'حذف') return toast.warning('اكتب كلمة "حذف" للتأكيد.');
    if (!window.confirm(`سيتم حذف ${resetRowTotal.toLocaleString('en-US')} سجل من ${resetTargets.length} جدول. لا يمكن التراجع. متابعة؟`)) return;
    setBusy(true);
    try {
      report(service.deleteTableData(resetTargets.map((t) => t.name)), 'تم تصفير البيانات المحددة.');
    } catch (error: any) {
      toast.error('تعذر الحذف', error?.message);
    } finally {
      setBusy(false);
    }
  };

  // ── mode: table ────────────────────────────────────────────────────────────
  const singleTable = tables.find((t) => t.name === tableTarget) || null;

  const runTableDelete = () => {
    if (!singleTable) return toast.warning('اختر جدولاً أولاً.');
    if (confirmText.trim() !== singleTable.name) return toast.warning(`اكتب اسم الجدول "${singleTable.name}" للتأكيد.`);
    if (!window.confirm(`سيتم حذف كل سجلات الجدول ${singleTable.name} (${singleTable.rows}). متابعة؟`)) return;
    setBusy(true);
    try {
      report(service.deleteTableData([singleTable.name]), `تم تفريغ الجدول ${singleTable.name}.`);
    } catch (error: any) {
      toast.error('تعذر الحذف', error?.message);
    } finally {
      setBusy(false);
    }
  };

  // ── mode: rows ─────────────────────────────────────────────────────────────
  const loadRows = (table: string, offset = 0) => {
    if (!table) return;
    try {
      const data = service.getRows(table, { limit: ROW_PAGE_SIZE, offset });
      setRows(data);
      setRowColumns(data[0] ? Object.keys(data[0]) : service.getColumns(table).map((c) => c.name));
      setSelectedRows(new Set());
      setRowOffset(offset);
    } catch (error: any) {
      toast.error('تعذر تحميل السجلات', error?.message);
    }
  };

  const runRowsDelete = () => {
    if (!rowsTable) return toast.warning('اختر جدولاً أولاً.');
    if (selectedRows.size === 0) return toast.warning('حدد سجلاً واحداً على الأقل.');
    const keys = service.getPrimaryKeyColumns(rowsTable);
    if (keys.length === 0) return toast.error('هذا الجدول لا يحتوي مفتاحاً أساسياً يمكن الاعتماد عليه.');
    const payload = [...selectedRows].map((index) => {
      const row = rows[index];
      const key: Record<string, unknown> = {};
      keys.forEach((k) => { key[k] = row[k]; });
      return key;
    });
    if (!window.confirm(`سيتم حذف ${payload.length} سجل من ${rowsTable}. متابعة؟`)) return;
    setBusy(true);
    try {
      report(service.deleteRows(rowsTable, payload), 'تم حذف السجلات المحددة.');
    } catch (error: any) {
      toast.error('تعذر الحذف', error?.message);
    } finally {
      setBusy(false);
    }
  };

  // ── mode: range ────────────────────────────────────────────────────────────
  const loadRangeColumns = (table: string) => {
    setRangeTable(table);
    setRangeColumn('');
    setRangeCount(null);
    if (!table) return setRangeColumns([]);
    try {
      setRangeColumns(service.getColumns(table));
    } catch (error: any) {
      toast.error('تعذر قراءة أعمدة الجدول', error?.message);
      setRangeColumns([]);
    }
  };

  const dateColumns = rangeColumns.filter(
    (c) => /date|_at|time/i.test(c.type) || /(date|_at|time|day)/i.test(c.name)
  );

  const previewRange = () => {
    if (!rangeTable || !rangeColumn) return toast.warning('اختر الجدول والعمود الزمني.');
    if (!rangeFrom || !rangeTo) return toast.warning('حدد تاريخ البداية والنهاية.');
    try {
      setRangeCount(service.countByDateRange(rangeTable, rangeColumn, rangeFrom, rangeTo));
    } catch (error: any) {
      toast.error('تعذر الحساب', error?.message);
    }
  };

  const runRangeDelete = () => {
    if (!rangeTable || !rangeColumn) return toast.warning('اختر الجدول والعمود الزمني.');
    if (rangeCount === null) return toast.warning('اعرض عدد السجلات أولاً.');
    if (rangeCount === 0) return toast.info('لا توجد سجلات في هذا النطاق.');
    if (confirmText.trim() !== 'حذف') return toast.warning('اكتب كلمة "حذف" للتأكيد.');
    if (!window.confirm(`سيتم حذف ${rangeCount} سجل من ${rangeTable} بين ${rangeFrom} و ${rangeTo}. متابعة؟`)) return;
    setBusy(true);
    try {
      report(service.deleteByDateRange(rangeTable, rangeColumn, rangeFrom, rangeTo), 'تم حذف سجلات النطاق الزمني.');
    } catch (error: any) {
      toast.error('تعذر الحذف', error?.message);
    } finally {
      setBusy(false);
    }
  };

  if (!allowed) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="flex max-w-md flex-col items-center gap-3 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10">
            <ShieldAlert className="h-8 w-8 text-rose-500" />
          </div>
          <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">الصفحة غير متاحة</h2>
          <p className="text-sm text-slate-500">تحتاج صلاحية أدوات البيانات (admin.data) للوصول إلى أدوات الحذف.</p>
        </div>
      </div>
    );
  }

  const filteredTables = tables.filter((t) => !tableSearch.trim() || t.name.toLowerCase().includes(tableSearch.trim().toLowerCase()));

  return (
    <div className="h-full overflow-y-auto bg-slate-100 p-4 dark:bg-slate-950 lg:p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        {/* Header */}
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-rose-500 to-red-600 text-white shadow-lg shadow-rose-500/25">
              <Trash2 className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 dark:text-slate-100">حذف البيانات</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                حذف كامل لبيانات النظام أو بيانات جدول معيّن أو سجلات محددة أو نطاق زمني
              </p>
            </div>
          </div>
          <button onClick={load} className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
            <RefreshCw className="h-4 w-4" /> تحديث الأعداد
          </button>
        </div>

        <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            عملية الحذف نهائية ولا يمكن التراجع عنها إلا من نسخة احتياطية. جدولا المستخدمين والصلاحيات والإعدادات الأساسية محميان ولا يمكن تفريغهما.
            يُنصح بتصدير نسخة احتياطية قبل المتابعة.
          </span>
        </div>

        {/* Mode switcher */}
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {MODES.map((item) => {
            const Icon = item.icon;
            const active = mode === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { setMode(item.id); clearConfirm(); }}
                className={`flex flex-col gap-1 rounded-2xl border p-4 text-right transition ${
                  active
                    ? 'border-rose-500 bg-rose-50 dark:border-rose-500/50 dark:bg-rose-500/10'
                    : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800'
                }`}
              >
                <span className={`flex items-center gap-2 text-xs font-extrabold ${active ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-200'}`}>
                  <Icon className="h-4 w-4" /> {item.label}
                </span>
                <span className="text-[10px] font-medium text-slate-400">{item.hint}</span>
              </button>
            );
          })}
        </div>

        {/* mode: all */}
        {mode === 'all' && (
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-extrabold text-slate-900 dark:text-slate-100">
                الجداول المحددة للحذف ({resetTargets.length}) — إجمالي {resetRowTotal.toLocaleString('en-US')} سجل
              </div>
              <div className="flex gap-2">
                <button onClick={() => setResetSelection(new Set(tables.map((t) => t.name)))} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">تحديد الكل</button>
                <button onClick={() => setResetSelection(new Set())} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">إلغاء الكل</button>
                <button onClick={() => setResetSelection(new Set(tables.filter((t) => t.rows > 0).map((t) => t.name)))} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">الجداول غير الفارغة</button>
              </div>
            </div>

            <div className="grid max-h-[46vh] grid-cols-1 gap-1 overflow-y-auto rounded-xl border border-slate-200 p-2 dark:border-slate-700 sm:grid-cols-2 lg:grid-cols-3">
              {tables.map((table) => (
                <label
                  key={table.name}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                >
                  <input
                    type="checkbox"
                    checked={resetSelection.has(table.name)}
                    onChange={() => toggleResetTable(table.name)}
                    className="h-4 w-4 accent-rose-600"
                  />
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-bold text-slate-700 dark:text-slate-200">{table.name}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">{table.rows}</span>
                </label>
              ))}
              {tables.length === 0 && <div className="col-span-full p-4 text-center text-xs text-slate-400">لا توجد جداول قابلة للحذف.</div>}
            </div>

            <ConfirmBar
              hint={'اكتب كلمة "حذف" للتأكيد'}
              expected="حذف"
              value={confirmText}
              onChange={setConfirmText}
              disabled={busy || resetTargets.length === 0 || resetRowTotal === 0}
              onRun={runReset}
              runLabel={`حذف بيانات ${resetTargets.length} جدول`}
            />
          </div>
        )}

        {/* mode: table */}
        {mode === 'table' && (
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                placeholder="بحث عن جدول..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 pr-9 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <div className="max-h-[42vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700">
              {filteredTables.map((table) => (
                <button
                  key={table.name}
                  onClick={() => { setTableTarget(table.name); clearConfirm(); }}
                  className={`flex w-full items-center gap-2 border-b border-slate-100 px-3 py-2 text-xs last:border-0 dark:border-slate-800 ${
                    tableTarget === table.name ? 'bg-rose-50 dark:bg-rose-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <Table2 className="h-3.5 w-3.5 text-slate-400" />
                  <span className="min-w-0 flex-1 truncate text-right font-mono font-bold text-slate-700 dark:text-slate-200">{table.name}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">{table.rows}</span>
                </button>
              ))}
              {filteredTables.length === 0 && <div className="p-4 text-center text-xs text-slate-400">لا توجد جداول مطابقة.</div>}
            </div>

            <ConfirmBar
              hint={singleTable ? `اكتب اسم الجدول "${singleTable.name}" للتأكيد` : 'اختر جدولاً أولاً'}
              expected={singleTable?.name || ''}
              value={confirmText}
              onChange={setConfirmText}
              disabled={busy || !singleTable || singleTable.rows === 0}
              onRun={runTableDelete}
              runLabel={singleTable ? `حذف بيانات ${singleTable.name}` : 'حذف بيانات الجدول'}
            />
          </div>
        )}

        {/* mode: rows */}
        {mode === 'rows' && (
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-2">
              <TableSelect tables={tables} value={rowsTable} onChange={(v) => { setRowsTable(v); setRows([]); setSelectedRows(new Set()); }} />
              <button
                onClick={() => loadRows(rowsTable, 0)}
                disabled={!rowsTable}
                className="rounded-xl bg-slate-800 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-700 dark:hover:bg-slate-600"
              >
                عرض السجلات
              </button>
              {rows.length > 0 && <span className="text-[11px] text-slate-400">تم تحديد {selectedRows.size} من {rows.length} سجل معروض</span>}
            </div>

            {rows.length > 0 && (
              <>
                <div className="max-h-[42vh] overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
                  <table className="w-full text-right text-[11px]">
                    <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800">
                      <tr>
                        <th className="border-b border-slate-200 px-2 py-1.5 dark:border-slate-700">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 accent-rose-600"
                            checked={selectedRows.size === rows.length}
                            onChange={(e) => setSelectedRows(e.target.checked ? new Set(rows.map((_, i) => i)) : new Set())}
                          />
                        </th>
                        {rowColumns.map((column) => (
                          <th key={column} className="whitespace-nowrap border-b border-slate-200 px-2 py-1.5 font-mono font-bold text-slate-600 dark:border-slate-700 dark:text-slate-300">{column}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, index) => (
                        <tr key={index} className="odd:bg-white even:bg-slate-50 dark:odd:bg-slate-900 dark:even:bg-slate-800/40">
                          <td className="border-b border-slate-100 px-2 py-1.5 dark:border-slate-800">
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5 accent-rose-600"
                              checked={selectedRows.has(index)}
                              onChange={() => setSelectedRows((prev) => {
                                const next = new Set(prev);
                                if (next.has(index)) next.delete(index);
                                else next.add(index);
                                return next;
                              })}
                            />
                          </td>
                          {rowColumns.map((column) => (
                            <td key={column} className="max-w-[200px] truncate whitespace-nowrap border-b border-slate-100 px-2 py-1.5 font-mono text-slate-600 dark:border-slate-800 dark:text-slate-400" title={String(row[column] ?? '')}>
                              {row[column] == null ? <span className="text-slate-300">NULL</span> : String(row[column])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    <button onClick={() => loadRows(rowsTable, Math.max(0, rowOffset - ROW_PAGE_SIZE))} disabled={rowOffset === 0} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">السابق</button>
                    <button onClick={() => loadRows(rowsTable, rowOffset + ROW_PAGE_SIZE)} disabled={rows.length < ROW_PAGE_SIZE} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">التالي</button>
                  </div>
                  <button
                    onClick={runRowsDelete}
                    disabled={busy || selectedRows.size === 0}
                    className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" /> حذف السجلات المحددة ({selectedRows.size})
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* mode: range */}
        {mode === 'range' && (
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
              <Field label="الجدول">
                <TableSelect tables={tables} value={rangeTable} onChange={loadRangeColumns} full />
              </Field>
              <Field label="العمود الزمني">
                <select
                  value={rangeColumn}
                  onChange={(e) => { setRangeColumn(e.target.value); setRangeCount(null); }}
                  disabled={!rangeTable}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500/30 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="">اختر العمود...</option>
                  {(dateColumns.length > 0 ? dateColumns : rangeColumns).map((column) => (
                    <option key={column.name} value={column.name}>{column.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="من تاريخ">
                <input type="date" value={rangeFrom} onChange={(e) => { setRangeFrom(e.target.value); setRangeCount(null); }} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
              </Field>
              <Field label="إلى تاريخ">
                <input type="date" value={rangeTo} onChange={(e) => { setRangeTo(e.target.value); setRangeCount(null); }} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
              </Field>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button onClick={previewRange} disabled={!rangeTable || !rangeColumn} className="rounded-xl bg-slate-800 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-700 dark:hover:bg-slate-600">
                عرض عدد السجلات
              </button>
              {rangeCount !== null && (
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" /> {rangeCount.toLocaleString('en-US')} سجل مطابق
                </span>
              )}
              <span className="text-[10px] text-slate-400">(المعاينة تعرض أول {RANGE_PREVIEW_LIMIT} سجل عند الحذف)</span>
            </div>

            <ConfirmBar
              hint={'اكتب كلمة "حذف" للتأكيد'}
              expected="حذف"
              value={confirmText}
              onChange={setConfirmText}
              disabled={busy || rangeCount === null || rangeCount === 0}
              onRun={runRangeDelete}
              runLabel="حذف السجلات في النطاق"
            />
          </div>
        )}
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1">
    <span className="block text-[11px] font-bold text-slate-500 dark:text-slate-400">{label}</span>
    {children}
  </div>
);

const TableSelect: React.FC<{ tables: TableInfo[]; value: string; onChange: (value: string) => void; full?: boolean }> = ({ tables, value, onChange, full }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className={`rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 ${full ? 'w-full' : 'min-w-[200px]'}`}
  >
    <option value="">اختر جدولاً...</option>
    {tables.map((table) => (
      <option key={table.name} value={table.name}>{table.name} ({table.rows})</option>
    ))}
  </select>
);

const ConfirmBar: React.FC<{
  hint: string;
  expected: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  onRun: () => void;
  runLabel: string;
}> = ({ hint, expected, value, onChange, disabled, onRun, runLabel }) => (
  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-rose-50/60 p-3 dark:border-rose-500/30 dark:bg-rose-500/5">
    <span className="text-[11px] font-bold text-rose-700 dark:text-rose-300">{hint}</span>
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={expected || '...'}
      className="min-w-[160px] flex-1 rounded-lg border border-rose-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500/30 dark:border-rose-500/30 dark:bg-slate-900 dark:text-slate-100"
    />
    <button
      onClick={onRun}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" /> {runLabel}
    </button>
  </div>
);
