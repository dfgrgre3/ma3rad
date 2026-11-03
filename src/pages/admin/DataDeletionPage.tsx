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
  { id: 'all', label: 'ØªØµÙÙŠØ± Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù†Ø¸Ø§Ù…', icon: Database, hint: 'Ø­Ø°Ù Ø¨ÙŠØ§Ù†Ø§Øª ÙƒÙ„ Ø§Ù„Ø¬Ø¯Ø§ÙˆÙ„ Ø§Ù„Ù…Ø­Ø¯Ø¯Ø© Ù…Ø¹ Ø§Ù„Ø¥Ø¨Ù‚Ø§Ø¡ Ø¹Ù„Ù‰ Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù…ÙŠÙ† ÙˆØ§Ù„ØµÙ„Ø§Ø­ÙŠØ§Øª.' },
  { id: 'table', label: 'Ø­Ø°Ù Ø¨ÙŠØ§Ù†Ø§Øª Ø¬Ø¯ÙˆÙ„ Ù…Ø­Ø¯Ø¯', icon: Table2, hint: 'ØªÙØ±ÙŠØº Ø¬Ø¯ÙˆÙ„ ÙˆØ§Ø­Ø¯ Ø¨Ø§Ù„ÙƒØ§Ù…Ù„ Ø¯ÙˆÙ† Ø­Ø°Ù Ø§Ù„Ø¬Ø¯ÙˆÙ„ Ù†ÙØ³Ù‡.' },
  { id: 'rows', label: 'Ø­Ø°Ù Ø³Ø¬Ù„Ø§Øª Ù…Ø­Ø¯Ø¯Ø©', icon: Rows3, hint: 'Ø§Ø®ØªÙŠØ§Ø± ØµÙÙˆÙ Ø¨Ø¹ÙŠÙ†Ù‡Ø§ Ù…Ù† Ø¬Ø¯ÙˆÙ„ ÙˆØ­Ø°ÙÙ‡Ø§.' },
  { id: 'range', label: 'Ø­Ø°Ù Ø­Ø³Ø¨ Ø§Ù„Ù†Ø·Ø§Ù‚ Ø§Ù„Ø²Ù…Ù†ÙŠ', icon: CalendarRange, hint: 'Ø­Ø°Ù Ø§Ù„Ø³Ø¬Ù„Ø§Øª Ø§Ù„ÙˆØ§Ù‚Ø¹Ø© Ø¨ÙŠÙ† ØªØ§Ø±ÙŠØ®ÙŠÙ† Ø¨ØªØ±ØªÙŠØ¨ ØªØµØ§Ø¹Ø¯ÙŠ.' },
];

const RANGE_PREVIEW_LIMIT = 100;
const ROW_PAGE_SIZE = 50;

export const DataDeletionPage: React.FC = () => {
  const toast = useToast();
  const can = usePermission();
  const allowed = can('admin.data.delete');
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
      toast.error('ØªØ¹Ø°Ø± ØªØ­Ù…ÙŠÙ„ Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø¬Ø¯Ø§ÙˆÙ„', error?.message);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  const clearConfirm = () => setConfirmText('');

  const report = (result: DeleteResult, message: string) => {
    toast.success(message, `ØªÙ… Ø­Ø°Ù ${result.deleted.toLocaleString('en-US')} Ø³Ø¬Ù„.`);
    clearConfirm();
    load();
    setRows([]);
    setSelectedRows(new Set());
    setRangeCount(null);
  };

  // â”€â”€ mode: all â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  const runReset = async () => {
    if (resetTargets.length === 0) return toast.warning('Ù„Ù… ØªØ­Ø¯Ø¯ Ø£ÙŠ Ø¬Ø¯ÙˆÙ„.');
    if (confirmText.trim() !== 'Ø­Ø°Ù') return toast.warning('Ø§ÙƒØªØ¨ ÙƒÙ„Ù…Ø© "Ø­Ø°Ù" Ù„Ù„ØªØ£ÙƒÙŠØ¯.');
    const reason = window.prompt('Ø§ÙƒØªØ¨ Ø³Ø¨Ø¨ Ø­Ø°Ù Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª (Ø³ÙŠÙØ­ÙØ¸ ÙÙŠ Ø³Ø¬Ù„ Ø§Ù„ØªØ¯Ù‚ÙŠÙ‚):');
    if (!reason?.trim()) return toast.warning('Ø³Ø¨Ø¨ Ø§Ù„Ø­Ø°Ù Ù…Ø·Ù„ÙˆØ¨.');
    if (!window.confirm(`Ø³ÙŠØªÙ… Ø­Ø°Ù ${resetRowTotal.toLocaleString('en-US')} Ø³Ø¬Ù„ Ù…Ù† ${resetTargets.length} Ø¬Ø¯ÙˆÙ„. Ù„Ø§ ÙŠÙ…ÙƒÙ† Ø§Ù„ØªØ±Ø§Ø¬Ø¹. Ù…ØªØ§Ø¨Ø¹Ø©ØŸ`)) return;
    setBusy(true);
    try {
      report(await service.deleteTableData(resetTargets.map((t) => t.name), reason), 'ØªÙ… ØªØµÙÙŠØ± Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…Ø­Ø¯Ø¯Ø©.');
    } catch (error: any) {
      toast.error('ØªØ¹Ø°Ø± Ø§Ù„Ø­Ø°Ù', error?.message);
    } finally {
      setBusy(false);
    }
  };

  // â”€â”€ mode: table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const singleTable = tables.find((t) => t.name === tableTarget) || null;

  const runTableDelete = async () => {
    if (!singleTable) return toast.warning('Ø§Ø®ØªØ± Ø¬Ø¯ÙˆÙ„Ø§Ù‹ Ø£ÙˆÙ„Ø§Ù‹.');
    if (confirmText.trim() !== singleTable.name) return toast.warning(`Ø§ÙƒØªØ¨ Ø§Ø³Ù… Ø§Ù„Ø¬Ø¯ÙˆÙ„ "${singleTable.name}" Ù„Ù„ØªØ£ÙƒÙŠØ¯.`);
    const reason = window.prompt('Ø§ÙƒØªØ¨ Ø³Ø¨Ø¨ Ø­Ø°Ù Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª (Ø³ÙŠÙØ­ÙØ¸ ÙÙŠ Ø³Ø¬Ù„ Ø§Ù„ØªØ¯Ù‚ÙŠÙ‚):');
    if (!reason?.trim()) return toast.warning('Ø³Ø¨Ø¨ Ø§Ù„Ø­Ø°Ù Ù…Ø·Ù„ÙˆØ¨.');
    if (!window.confirm(`Ø³ÙŠØªÙ… Ø­Ø°Ù ÙƒÙ„ Ø³Ø¬Ù„Ø§Øª Ø§Ù„Ø¬Ø¯ÙˆÙ„ ${singleTable.name} (${singleTable.rows}). Ù…ØªØ§Ø¨Ø¹Ø©ØŸ`)) return;
    setBusy(true);
    try {
      report(await service.deleteTableData([singleTable.name], reason), `ØªÙ… ØªÙØ±ÙŠØº Ø§Ù„Ø¬Ø¯ÙˆÙ„ ${singleTable.name}.`);
    } catch (error: any) {
      toast.error('ØªØ¹Ø°Ø± Ø§Ù„Ø­Ø°Ù', error?.message);
    } finally {
      setBusy(false);
    }
  };

  // â”€â”€ mode: rows â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const loadRows = (table: string, offset = 0) => {
    if (!table) return;
    try {
      const data = service.getRows(table, { limit: ROW_PAGE_SIZE, offset });
      setRows(data);
      setRowColumns(data[0] ? Object.keys(data[0]) : service.getColumns(table).map((c) => c.name));
      setSelectedRows(new Set());
      setRowOffset(offset);
    } catch (error: any) {
      toast.error('ØªØ¹Ø°Ø± ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ø³Ø¬Ù„Ø§Øª', error?.message);
    }
  };

  const runRowsDelete = async () => {
    if (!rowsTable) return toast.warning('Ø§Ø®ØªØ± Ø¬Ø¯ÙˆÙ„Ø§Ù‹ Ø£ÙˆÙ„Ø§Ù‹.');
    if (selectedRows.size === 0) return toast.warning('Ø­Ø¯Ø¯ Ø³Ø¬Ù„Ø§Ù‹ ÙˆØ§Ø­Ø¯Ø§Ù‹ Ø¹Ù„Ù‰ Ø§Ù„Ø£Ù‚Ù„.');
    const keys = service.getPrimaryKeyColumns(rowsTable);
    if (keys.length === 0) return toast.error('Ù‡Ø°Ø§ Ø§Ù„Ø¬Ø¯ÙˆÙ„ Ù„Ø§ ÙŠØ­ØªÙˆÙŠ Ù…ÙØªØ§Ø­Ø§Ù‹ Ø£Ø³Ø§Ø³ÙŠØ§Ù‹ ÙŠÙ…ÙƒÙ† Ø§Ù„Ø§Ø¹ØªÙ…Ø§Ø¯ Ø¹Ù„ÙŠÙ‡.');
    const payload = [...selectedRows].map((index) => {
      const row = rows[index];
      const key: Record<string, unknown> = {};
      keys.forEach((k) => { key[k] = row[k]; });
      return key;
    });
    const reason = window.prompt('Ø§ÙƒØªØ¨ Ø³Ø¨Ø¨ Ø­Ø°Ù Ø§Ù„Ø³Ø¬Ù„Ø§Øª (Ø³ÙŠÙØ­ÙØ¸ ÙÙŠ Ø³Ø¬Ù„ Ø§Ù„ØªØ¯Ù‚ÙŠÙ‚):');
    if (!reason?.trim()) return toast.warning('Ø³Ø¨Ø¨ Ø§Ù„Ø­Ø°Ù Ù…Ø·Ù„ÙˆØ¨.');
    if (!window.confirm(`Ø³ÙŠØªÙ… Ø­Ø°Ù ${payload.length} Ø³Ø¬Ù„ Ù…Ù† ${rowsTable}. Ù…ØªØ§Ø¨Ø¹Ø©ØŸ`)) return;
    setBusy(true);
    try {
      report(await service.deleteRows(rowsTable, payload, reason), 'ØªÙ… Ø­Ø°Ù Ø§Ù„Ø³Ø¬Ù„Ø§Øª Ø§Ù„Ù…Ø­Ø¯Ø¯Ø©.');
    } catch (error: any) {
      toast.error('ØªØ¹Ø°Ø± Ø§Ù„Ø­Ø°Ù', error?.message);
    } finally {
      setBusy(false);
    }
  };

  // â”€â”€ mode: range â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const loadRangeColumns = (table: string) => {
    setRangeTable(table);
    setRangeColumn('');
    setRangeCount(null);
    if (!table) return setRangeColumns([]);
    try {
      setRangeColumns(service.getColumns(table));
    } catch (error: any) {
      toast.error('ØªØ¹Ø°Ø± Ù‚Ø±Ø§Ø¡Ø© Ø£Ø¹Ù…Ø¯Ø© Ø§Ù„Ø¬Ø¯ÙˆÙ„', error?.message);
      setRangeColumns([]);
    }
  };

  const dateColumns = rangeColumns.filter(
    (c) => /date|_at|time/i.test(c.type) || /(date|_at|time|day)/i.test(c.name)
  );

  const previewRange = () => {
    if (!rangeTable || !rangeColumn) return toast.warning('Ø§Ø®ØªØ± Ø§Ù„Ø¬Ø¯ÙˆÙ„ ÙˆØ§Ù„Ø¹Ù…ÙˆØ¯ Ø§Ù„Ø²Ù…Ù†ÙŠ.');
    if (!rangeFrom || !rangeTo) return toast.warning('Ø­Ø¯Ø¯ ØªØ§Ø±ÙŠØ® Ø§Ù„Ø¨Ø¯Ø§ÙŠØ© ÙˆØ§Ù„Ù†Ù‡Ø§ÙŠØ©.');
    try {
      setRangeCount(service.countByDateRange(rangeTable, rangeColumn, rangeFrom, rangeTo));
    } catch (error: any) {
      toast.error('ØªØ¹Ø°Ø± Ø§Ù„Ø­Ø³Ø§Ø¨', error?.message);
    }
  };

  const runRangeDelete = async () => {
    if (!rangeTable || !rangeColumn) return toast.warning('Ø§Ø®ØªØ± Ø§Ù„Ø¬Ø¯ÙˆÙ„ ÙˆØ§Ù„Ø¹Ù…ÙˆØ¯ Ø§Ù„Ø²Ù…Ù†ÙŠ.');
    if (rangeCount === null) return toast.warning('Ø§Ø¹Ø±Ø¶ Ø¹Ø¯Ø¯ Ø§Ù„Ø³Ø¬Ù„Ø§Øª Ø£ÙˆÙ„Ø§Ù‹.');
    if (rangeCount === 0) return toast.info('Ù„Ø§ ØªÙˆØ¬Ø¯ Ø³Ø¬Ù„Ø§Øª ÙÙŠ Ù‡Ø°Ø§ Ø§Ù„Ù†Ø·Ø§Ù‚.');
    if (confirmText.trim() !== 'Ø­Ø°Ù') return toast.warning('Ø§ÙƒØªØ¨ ÙƒÙ„Ù…Ø© "Ø­Ø°Ù" Ù„Ù„ØªØ£ÙƒÙŠØ¯.');
    const reason = window.prompt('Ø§ÙƒØªØ¨ Ø³Ø¨Ø¨ Ø­Ø°Ù Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª (Ø³ÙŠÙØ­ÙØ¸ ÙÙŠ Ø³Ø¬Ù„ Ø§Ù„ØªØ¯Ù‚ÙŠÙ‚):');
    if (!reason?.trim()) return toast.warning('Ø³Ø¨Ø¨ Ø§Ù„Ø­Ø°Ù Ù…Ø·Ù„ÙˆØ¨.');
    if (!window.confirm(`Ø³ÙŠØªÙ… Ø­Ø°Ù ${rangeCount} Ø³Ø¬Ù„ Ù…Ù† ${rangeTable} Ø¨ÙŠÙ† ${rangeFrom} Ùˆ ${rangeTo}. Ù…ØªØ§Ø¨Ø¹Ø©ØŸ`)) return;
    setBusy(true);
    try {
      report(await service.deleteByDateRange(rangeTable, rangeColumn, rangeFrom, rangeTo, reason), 'ØªÙ… Ø­Ø°Ù Ø³Ø¬Ù„Ø§Øª Ø§Ù„Ù†Ø·Ø§Ù‚ Ø§Ù„Ø²Ù…Ù†ÙŠ.');
    } catch (error: any) {
      toast.error('ØªØ¹Ø°Ø± Ø§Ù„Ø­Ø°Ù', error?.message);
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
          <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">Ø§Ù„ØµÙØ­Ø© ØºÙŠØ± Ù…ØªØ§Ø­Ø©</h2>
          <p className="text-sm text-slate-500">ØªØ­ØªØ§Ø¬ ØµÙ„Ø§Ø­ÙŠØ© Ø­Ø°Ù Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù†Ø¸Ø§Ù… (admin.data.delete) Ù„Ù„ÙˆØµÙˆÙ„ Ø¥Ù„Ù‰ Ø£Ø¯ÙˆØ§Øª Ø§Ù„Ø­Ø°Ù.</p>
        </div>
      </div>
    );
  }

  const filteredTables = tables.filter((t) => !tableSearch.trim() || t.name.toLowerCase().includes(tableSearch.trim().toLowerCase()));

  return (
    <div className="h-full overflow-y-auto bg-slate-100 p-4 dark:bg-slate-950 lg:p-6">
      <div className="w-full space-y-5">
        {/* Header */}
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-rose-500 to-red-600 text-white shadow-lg shadow-rose-500/25">
              <Trash2 className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 dark:text-slate-100">Ø­Ø°Ù Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ø­Ø°Ù ÙƒØ§Ù…Ù„ Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù†Ø¸Ø§Ù… Ø£Ùˆ Ø¨ÙŠØ§Ù†Ø§Øª Ø¬Ø¯ÙˆÙ„ Ù…Ø¹ÙŠÙ‘Ù† Ø£Ùˆ Ø³Ø¬Ù„Ø§Øª Ù…Ø­Ø¯Ø¯Ø© Ø£Ùˆ Ù†Ø·Ø§Ù‚ Ø²Ù…Ù†ÙŠ
              </p>
            </div>
          </div>
          <button onClick={load} className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
            <RefreshCw className="h-4 w-4" /> ØªØ­Ø¯ÙŠØ« Ø§Ù„Ø£Ø¹Ø¯Ø§Ø¯
          </button>
        </div>

        <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Ø¹Ù…Ù„ÙŠØ© Ø§Ù„Ø­Ø°Ù Ù†Ù‡Ø§Ø¦ÙŠØ© ÙˆÙ„Ø§ ÙŠÙ…ÙƒÙ† Ø§Ù„ØªØ±Ø§Ø¬Ø¹ Ø¹Ù†Ù‡Ø§ Ø¥Ù„Ø§ Ù…Ù† Ù†Ø³Ø®Ø© Ø§Ø­ØªÙŠØ§Ø·ÙŠØ©. Ø¬Ø¯ÙˆÙ„Ø§ Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù…ÙŠÙ† ÙˆØ§Ù„ØµÙ„Ø§Ø­ÙŠØ§Øª ÙˆØ§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø§Ù„Ø£Ø³Ø§Ø³ÙŠØ© Ù…Ø­Ù…ÙŠØ§Ù† ÙˆÙ„Ø§ ÙŠÙ…ÙƒÙ† ØªÙØ±ÙŠØºÙ‡Ù…Ø§.
            ÙŠÙÙ†ØµØ­ Ø¨ØªØµØ¯ÙŠØ± Ù†Ø³Ø®Ø© Ø§Ø­ØªÙŠØ§Ø·ÙŠØ© Ù‚Ø¨Ù„ Ø§Ù„Ù…ØªØ§Ø¨Ø¹Ø©.
          </span>
        </div>

        {/* Mode switcher */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 lg:grid-cols-4">
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
                Ø§Ù„Ø¬Ø¯Ø§ÙˆÙ„ Ø§Ù„Ù…Ø­Ø¯Ø¯Ø© Ù„Ù„Ø­Ø°Ù ({resetTargets.length}) â€” Ø¥Ø¬Ù…Ø§Ù„ÙŠ {resetRowTotal.toLocaleString('en-US')} Ø³Ø¬Ù„
              </div>
              <div className="flex gap-2">
                <button onClick={() => setResetSelection(new Set(tables.map((t) => t.name)))} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">ØªØ­Ø¯ÙŠØ¯ Ø§Ù„ÙƒÙ„</button>
                <button onClick={() => setResetSelection(new Set())} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Ø¥Ù„ØºØ§Ø¡ Ø§Ù„ÙƒÙ„</button>
                <button onClick={() => setResetSelection(new Set(tables.filter((t) => t.rows > 0).map((t) => t.name)))} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Ø§Ù„Ø¬Ø¯Ø§ÙˆÙ„ ØºÙŠØ± Ø§Ù„ÙØ§Ø±ØºØ©</button>
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
              {tables.length === 0 && <div className="col-span-full p-4 text-center text-xs text-slate-400">Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¬Ø¯Ø§ÙˆÙ„ Ù‚Ø§Ø¨Ù„Ø© Ù„Ù„Ø­Ø°Ù.</div>}
            </div>

            <ConfirmBar
              hint={'Ø§ÙƒØªØ¨ ÙƒÙ„Ù…Ø© "Ø­Ø°Ù" Ù„Ù„ØªØ£ÙƒÙŠØ¯'}
              expected="Ø­Ø°Ù"
              value={confirmText}
              onChange={setConfirmText}
              disabled={busy || resetTargets.length === 0 || resetRowTotal === 0}
              onRun={runReset}
              runLabel={`Ø­Ø°Ù Ø¨ÙŠØ§Ù†Ø§Øª ${resetTargets.length} Ø¬Ø¯ÙˆÙ„`}
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
                placeholder="Ø¨Ø­Ø« Ø¹Ù† Ø¬Ø¯ÙˆÙ„..."
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
              {filteredTables.length === 0 && <div className="p-4 text-center text-xs text-slate-400">Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¬Ø¯Ø§ÙˆÙ„ Ù…Ø·Ø§Ø¨Ù‚Ø©.</div>}
            </div>

            <ConfirmBar
              hint={singleTable ? `Ø§ÙƒØªØ¨ Ø§Ø³Ù… Ø§Ù„Ø¬Ø¯ÙˆÙ„ "${singleTable.name}" Ù„Ù„ØªØ£ÙƒÙŠØ¯` : 'Ø§Ø®ØªØ± Ø¬Ø¯ÙˆÙ„Ø§Ù‹ Ø£ÙˆÙ„Ø§Ù‹'}
              expected={singleTable?.name || ''}
              value={confirmText}
              onChange={setConfirmText}
              disabled={busy || !singleTable || singleTable.rows === 0}
              onRun={runTableDelete}
              runLabel={singleTable ? `Ø­Ø°Ù Ø¨ÙŠØ§Ù†Ø§Øª ${singleTable.name}` : 'Ø­Ø°Ù Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø¬Ø¯ÙˆÙ„'}
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
                Ø¹Ø±Ø¶ Ø§Ù„Ø³Ø¬Ù„Ø§Øª
              </button>
              {rows.length > 0 && <span className="text-[11px] text-slate-400">ØªÙ… ØªØ­Ø¯ÙŠØ¯ {selectedRows.size} Ù…Ù† {rows.length} Ø³Ø¬Ù„ Ù…Ø¹Ø±ÙˆØ¶</span>}
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
                              {row[column] == null ? <span className="text-slate-300">ÙØ§Ø±Øº</span> : String(row[column])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    <button onClick={() => loadRows(rowsTable, Math.max(0, rowOffset - ROW_PAGE_SIZE))} disabled={rowOffset === 0} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Ø§Ù„Ø³Ø§Ø¨Ù‚</button>
                    <button onClick={() => loadRows(rowsTable, rowOffset + ROW_PAGE_SIZE)} disabled={rows.length < ROW_PAGE_SIZE} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Ø§Ù„ØªØ§Ù„ÙŠ</button>
                  </div>
                  <button
                    onClick={runRowsDelete}
                    disabled={busy || selectedRows.size === 0}
                    className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" /> Ø­Ø°Ù Ø§Ù„Ø³Ø¬Ù„Ø§Øª Ø§Ù„Ù…Ø­Ø¯Ø¯Ø© ({selectedRows.size})
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
              <Field label="Ø§Ù„Ø¬Ø¯ÙˆÙ„">
                <TableSelect tables={tables} value={rangeTable} onChange={loadRangeColumns} full />
              </Field>
              <Field label="Ø§Ù„Ø¹Ù…ÙˆØ¯ Ø§Ù„Ø²Ù…Ù†ÙŠ">
                <select
                  value={rangeColumn}
                  onChange={(e) => { setRangeColumn(e.target.value); setRangeCount(null); }}
                  disabled={!rangeTable}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500/30 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="">Ø§Ø®ØªØ± Ø§Ù„Ø¹Ù…ÙˆØ¯...</option>
                  {(dateColumns.length > 0 ? dateColumns : rangeColumns).map((column) => (
                    <option key={column.name} value={column.name}>{column.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Ù…Ù† ØªØ§Ø±ÙŠØ®">
                <input type="date" value={rangeFrom} onChange={(e) => { setRangeFrom(e.target.value); setRangeCount(null); }} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
              </Field>
              <Field label="Ø¥Ù„Ù‰ ØªØ§Ø±ÙŠØ®">
                <input type="date" value={rangeTo} onChange={(e) => { setRangeTo(e.target.value); setRangeCount(null); }} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
              </Field>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button onClick={previewRange} disabled={!rangeTable || !rangeColumn} className="rounded-xl bg-slate-800 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-700 dark:hover:bg-slate-600">
                Ø¹Ø±Ø¶ Ø¹Ø¯Ø¯ Ø§Ù„Ø³Ø¬Ù„Ø§Øª
              </button>
              {rangeCount !== null && (
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" /> {rangeCount.toLocaleString('en-US')} Ø³Ø¬Ù„ Ù…Ø·Ø§Ø¨Ù‚
                </span>
              )}
              <span className="text-[10px] text-slate-400">(Ø§Ù„Ù…Ø¹Ø§ÙŠÙ†Ø© ØªØ¹Ø±Ø¶ Ø£ÙˆÙ„ {RANGE_PREVIEW_LIMIT} Ø³Ø¬Ù„ Ø¹Ù†Ø¯ Ø§Ù„Ø­Ø°Ù)</span>
            </div>

            <ConfirmBar
              hint={'Ø§ÙƒØªØ¨ ÙƒÙ„Ù…Ø© "Ø­Ø°Ù" Ù„Ù„ØªØ£ÙƒÙŠØ¯'}
              expected="Ø­Ø°Ù"
              value={confirmText}
              onChange={setConfirmText}
              disabled={busy || rangeCount === null || rangeCount === 0}
              onRun={runRangeDelete}
              runLabel="Ø­Ø°Ù Ø§Ù„Ø³Ø¬Ù„Ø§Øª ÙÙŠ Ø§Ù„Ù†Ø·Ø§Ù‚"
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
    <option value="">Ø§Ø®ØªØ± Ø¬Ø¯ÙˆÙ„Ø§Ù‹...</option>
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
