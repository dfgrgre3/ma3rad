import React, { useState, useEffect } from 'react';
import { Scale, Download, TrendingUp, DollarSign, Layers, PieChart } from 'lucide-react';
import { DatabaseManager } from '../../database/db';

interface WarehouseValuation {
  id: string;
  name: string;
  itemsCount: number;
  totalQtyM2: number;
  costValue: number;
  retailValue: number;
}

export const InventoryValuationPage: React.FC = () => {
  const [data, setData] = useState<WarehouseValuation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadValuation();
  }, []);

  const loadValuation = () => {
    const db = DatabaseManager.getInstance();
    try {
      const sql = `
        SELECT 
          w.id,
          w.name,
          COALESCE(COUNT(DISTINCT ws.product_id), 0) as items_count,
          COALESCE(SUM(ws.quantity_m2), 0) as total_qty_m2,
          COALESCE(SUM(ws.quantity_m2 * p.cost_price), 0) as cost_value,
          COALESCE(SUM(ws.quantity_m2 * p.selling_price_m2), 0) as retail_value
        FROM warehouses w
        LEFT JOIN warehouse_stock ws ON w.id = ws.warehouse_id
        LEFT JOIN products p ON ws.product_id = p.id AND p.is_active = 1
        WHERE w.is_active = 1
        GROUP BY w.id, w.name
        ORDER BY w.name
      `;
      const rows = db.query<any>(sql);
      const mapped: WarehouseValuation[] = rows.map(r => ({
        id: r.id,
        name: r.name,
        itemsCount: r.itemsCount || 0,
        totalQtyM2: r.totalQtyM2 || 0,
        costValue: r.costValue || 0,
        retailValue: r.retailValue || 0
      }));
      setData(mapped);
    } catch (e) {
      console.error('Error fetching inventory valuation:', e);
    } finally {
      setLoading(false);
    }
  };

  const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(Math.round(n)) + ' ج';
  const fmtQty = (n: number) => new Intl.NumberFormat('ar-EG').format(Math.round(n)) + ' م²';

  const totalCost = data.reduce((s, w) => s + w.costValue, 0);
  const totalRetail = data.reduce((s, w) => s + w.retailValue, 0);
  const potentialProfit = totalRetail - totalCost;

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <Scale className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-base font-black text-slate-900">تقييم المخزون (Inventory Valuation)</h1>
            <p className="text-xs text-slate-500 font-medium">حساب القيمة المالية الحالية للبضائع المتاحة بسعر التكلفة وسعر البيع</p>
          </div>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold transition shrink-0">
          <Download className="w-4 h-4" />
          تصدير التقرير المالي (Excel)
        </button>
      </div>

      {/* Summary Cards */}
      <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6 shrink-0 bg-white border-b border-slate-200">
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-bold mb-1">إجمالي قيمة التكلفة (COGS)</div>
            <div className="text-xl font-black text-slate-900">{fmt(totalCost)}</div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
            <Layers className="w-5 h-5 text-sky-600" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-bold mb-1">إجمالي قيمة البيع (سعر المعرض)</div>
            <div className="text-xl font-black text-emerald-600">{fmt(totalRetail)}</div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-emerald-600" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-bold mb-1">الربح المتوقع للمخزون بالكامل</div>
            <div className="text-xl font-black text-violet-600">{fmt(potentialProfit)}</div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-violet-600" />
          </div>
        </div>
      </div>

      {/* Breakdown per Warehouse */}
      <div className="flex-1 overflow-auto p-6">
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center gap-2">
            <PieChart className="w-4 h-4 text-slate-500" />
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">توزيع وتقييم البضاعة حسب المخازن</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                {['المخزن', 'عدد الأصناف', 'إجمالي الكمية م²', 'القيمة بسعر الشراء', 'القيمة بسعر البيع', 'الربح المتوقع'].map(h => (
                  <th key={h} className="px-4 py-3 text-right text-xs font-bold text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {data.map((w) => (
                <tr key={w.id} className="hover:bg-slate-100 transition">
                  <td className="px-4 py-3 text-slate-900 font-medium">{w.name}</td>
                  <td className="px-4 py-3 text-slate-700 font-semibold">{w.itemsCount} صنف</td>
                  <td className="px-4 py-3 text-sky-600 font-bold">{fmtQty(w.totalQtyM2)}</td>
                  <td className="px-4 py-3 text-slate-600">{fmt(w.costValue)}</td>
                  <td className="px-4 py-3 text-emerald-600 font-bold">{fmt(w.retailValue)}</td>
                  <td className="px-4 py-3 text-violet-600 font-bold">{fmt(w.retailValue - w.costValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};