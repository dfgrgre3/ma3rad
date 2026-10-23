import React, { useState, useEffect } from 'react';
import { BookOpen, Search, Filter, Download, TrendingUp, TrendingDown, ArrowRight, Package } from 'lucide-react';
import { DatabaseManager } from '../../database/db';
import { format } from 'date-fns';

interface LedgerEntry {
  id: string;
  date: string;
  product: string;
  warehouse: string;
  type: string;
  qtyIn: number;
  qtyOut: number;
  balance: number;
  ref: string;
  user: string;
  notes: string;
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  PURCHASE:         { label: 'شراء', color: 'text-emerald-600' },
  SALE:             { label: 'بيع', color: 'text-sky-600' },
  RETURN_IN:        { label: 'مرتجع وارد', color: 'text-violet-600' },
  RETURN_OUT:       { label: 'مرتجع صادر', color: 'text-amber-600' },
  TRANSFER_IN:      { label: 'تحويل وارد', color: 'text-teal-600' },
  TRANSFER_OUT:     { label: 'تحويل صادر', color: 'text-orange-600' },
  ADJUSTMENT:       { label: 'تسوية', color: 'text-yellow-400' },
  OPENING_BALANCE:  { label: 'رصيد افتتاحي', color: 'text-slate-500' },
  DAMAGED:          { label: 'تالف', color: 'text-rose-600' },
};

export const StockLedgerPage: React.FC = () => {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  useEffect(() => {
    try {
      const wRows = DatabaseManager.getInstance().query<{ id: string; name: string }>('SELECT id, name FROM warehouses WHERE is_active = 1 ORDER BY name');
      setWarehouses(wRows);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    setPage(1);
    loadData();
  }, [search, typeFilter, warehouseFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = () => {
    setLoading(true);
    try {
      let sql = `
        SELECT it.id, it.created_at as date, p.name as product,
               w.name as warehouse, it.type,
               CASE WHEN it.quantity_m2 > 0 THEN it.quantity_m2 ELSE 0 END as qty_in,
               CASE WHEN it.quantity_m2 < 0 THEN ABS(it.quantity_m2) ELSE 0 END as qty_out,
               0 as balance,
               COALESCE(it.transaction_number,'') as ref,
               COALESCE(u.full_name,'النظام') as user,
               COALESCE(it.notes,'') as notes
        FROM inventory_transactions it
        JOIN products p ON p.id = it.product_id
        JOIN warehouses w ON w.id = it.warehouse_id
        LEFT JOIN users u ON u.id = it.performed_by
        WHERE 1=1
      `;
      const params: string[] = [];

      if (search) {
        sql += ` AND (p.name LIKE ? OR it.transaction_number LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`);
      }
      if (typeFilter) {
        sql += ` AND it.type = ?`;
        params.push(typeFilter);
      }
      if (warehouseFilter) {
        sql += ` AND it.warehouse_id = ?`;
        params.push(warehouseFilter);
      }

      sql += ` ORDER BY it.created_at DESC LIMIT 200`;

      const rows = DatabaseManager.getInstance().query<any>(sql, params);
      const data: LedgerEntry[] = rows.map(r => ({
        id: r.id,
        date: format(new Date(r.date), 'dd/MM/yyyy HH:mm'),
        product: r.product,
        warehouse: r.warehouse,
        type: r.type,
        qtyIn: r.qtyIn || 0,
        qtyOut: r.qtyOut || 0,
        balance: r.balance || 0,
        ref: r.ref,
        user: r.user,
        notes: r.notes,
      }));

      setEntries(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const paginated = entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(entries.length / PAGE_SIZE);

  const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(n);

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <BookOpen className="w-5 h-5 text-violet-600" />
          <h1 className="text-base font-black text-slate-900">سجل المخزون (Stock Ledger)</h1>
          <span className="text-xs bg-violet-500/20 text-violet-600 px-2 py-0.5 rounded-full font-bold">
            {entries.length} حركة
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition">
            <Download className="w-3.5 h-3.5" />
            تصدير
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="بحث بالمنتج أو رقم المرجع..."
            className="w-full pr-9 pl-4 py-2 bg-slate-100 text-sm text-slate-900 placeholder-slate-400 rounded-lg border border-slate-300 focus:border-sky-500 focus:outline-none"
          />
        </div>

        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-2 bg-slate-100 text-sm text-slate-700 rounded-lg border border-slate-300 focus:border-sky-500 focus:outline-none"
        >
          <option value="">كل الأنواع</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        <select
          value={warehouseFilter}
          onChange={e => setWarehouseFilter(e.target.value)}
          className="px-3 py-2 bg-slate-100 text-sm text-slate-700 rounded-lg border border-slate-300 focus:border-sky-500 focus:outline-none"
        >
          <option value="">كل المخازن</option>
          {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 bg-sky-600 rounded-lg animate-bounce" />
          </div>
        ) : paginated.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-slate-500">
            <BookOpen className="w-10 h-10 opacity-30" />
            <p className="text-sm">لا توجد حركات مطابقة</p>
          </div>
        ) : (
          <table className="w-full text-xs min-w-[900px]">
            <thead className="bg-white sticky top-0 z-10">
              <tr>
                {['التاريخ', 'المنتج', 'المخزن', 'النوع', 'وارد م²', 'صادر م²', 'المرجع', 'المستخدم'].map(h => (
                  <th key={h} className="px-4 py-3 text-right font-bold text-slate-500 border-b border-slate-200">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/50">
              {paginated.map((r) => {
                const typeInfo = TYPE_LABELS[r.type] ?? { label: r.type, color: 'text-slate-500' };
                return (
                  <tr key={r.id} className="hover:bg-white transition">
                    <td className="px-4 py-3 text-slate-500 font-mono whitespace-nowrap">{r.date}</td>
                    <td className="px-4 py-3 text-slate-900 font-medium max-w-[200px] truncate">{r.product}</td>
                    <td className="px-4 py-3 text-slate-700">{r.warehouse}</td>
                    <td className="px-4 py-3">
                      <span className={`font-bold ${typeInfo.color}`}>{typeInfo.label}</span>
                    </td>
                    <td className="px-4 py-3 text-emerald-600 font-bold">
                      {r.qtyIn > 0 ? `+${fmt(r.qtyIn)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-rose-600 font-bold">
                      {r.qtyOut > 0 ? `-${fmt(r.qtyOut)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-mono">{r.ref || '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{r.user}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="bg-white border-t border-slate-200 px-6 py-3 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            صفحة {page} من {totalPages} — {entries.length} نتيجة
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs disabled:opacity-40 hover:bg-slate-200 transition"
            >
              السابق
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs disabled:opacity-40 hover:bg-slate-200 transition"
            >
              التالي
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
