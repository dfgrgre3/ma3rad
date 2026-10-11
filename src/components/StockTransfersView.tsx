import React, { useState, useEffect } from 'react';
import { 
  ArrowLeftRight, Search, Filter, Package, 
  ArrowUpRight, ArrowDownRight, Calendar
} from 'lucide-react';
import { InventoryService } from '../services/InventoryService';
import { Warehouse } from '../types';
import { CeramicMath } from '../utils/ceramicMath';

export const StockTransfersView: React.FC = () => {
  const [transfers, setTransfers] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseSummary, setWarehouseSummary] = useState<any[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [activeTab, setActiveTab] = useState<'transfers' | 'summary'>('transfers');

  const inventoryService = new InventoryService();

  const loadData = () => {
    try {
      const whs = inventoryService.getAllWarehouses();
      const txList = inventoryService.getTransfersList(
        dateFrom || undefined,
        dateTo || undefined,
        selectedWarehouse || undefined
      );
      const summary = inventoryService.getTransferSummaryByWarehouse();
      setWarehouses(whs);
      setTransfers(txList);
      setWarehouseSummary(summary);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedWarehouse, dateFrom, dateTo]);

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">التحويلات المخزنية</h2>
          <p className="text-xs text-slate-500">نقل البضائع بين المعارض والمخازن</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('transfers')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
            activeTab === 'transfers'
              ? 'bg-white dark:bg-slate-900 text-sky-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          سجل التحويلات
        </button>
        <button
          onClick={() => setActiveTab('summary')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
            activeTab === 'summary'
              ? 'bg-white dark:bg-slate-900 text-sky-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          ملخص المخازن
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap items-center gap-4 text-xs font-bold">
        <div className="flex items-center gap-2">
          <span className="text-slate-500">المخزن:</span>
          <select
            value={selectedWarehouse}
            onChange={(e) => setSelectedWarehouse(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700"
          >
            <option value="">جميع المخازن</option>
            {warehouses.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400" />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700"
          />
          <span className="text-slate-400">إلى</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700"
          />
        </div>
        <button
          onClick={() => { setDateFrom(''); setDateTo(''); setSelectedWarehouse(''); }}
          className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-400"
        >
          إعادة ضبط
        </button>
      </div>

      {activeTab === 'transfers' ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="p-3.5">رقم التحويل</th>
                  <th className="p-3.5">التاريخ</th>
                  <th className="p-3.5">الصنف</th>
                  <th className="p-3.5">من مخزن</th>
                  <th className="p-3.5">إلى مخزن</th>
                  <th className="p-3.5">الكمية (م²)</th>
                  <th className="p-3.5">الكراتين</th>
                  <th className="p-3.5">التكلفة</th>
                  <th className="p-3.5">منفذ العملية</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {transfers.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      لا توجد تحويلات مخزنية خلال الفترة المحددة.
                    </td>
                  </tr>
                ) : (
                  transfers.map((t, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="p-3.5 font-mono font-bold text-slate-900 dark:text-white">{t.transferNumber}</td>
                      <td className="p-3.5 font-mono text-slate-500">{t.transferDate?.slice(0, 10)}</td>
                      <td className="p-3.5">
                        <div className="font-bold text-slate-900 dark:text-white">{t.productName}</div>
                        <div className="text-[10px] text-slate-400">{t.productSku}</div>
                      </td>
                      <td className="p-3.5">
                        <span className="px-2 py-1 bg-red-50 dark:bg-red-950/30 text-red-600 rounded-lg font-bold text-[10px] flex items-center gap-1 w-fit">
                          <ArrowUpRight className="w-3 h-3" />
                          {t.fromWarehouse}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <span className="px-2 py-1 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 rounded-lg font-bold text-[10px] flex items-center gap-1 w-fit">
                          <ArrowDownRight className="w-3 h-3" />
                          {t.toWarehouse}
                        </span>
                      </td>
                      <td className="p-3.5 font-black text-sky-600">{CeramicMath.formatM2(t.quantityM2)}</td>
                      <td className="p-3.5 font-bold text-slate-700 dark:text-slate-300">{t.boxesCount}</td>
                      <td className="p-3.5 font-mono text-slate-600 dark:text-slate-400">{CeramicMath.formatCurrency(t.totalCost)}</td>
                      <td className="p-3.5 text-slate-500">{t.performedByName}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {warehouseSummary.map((ws) => (
            <div key={ws.warehouseId} className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-600 flex items-center justify-center">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-sm text-slate-900 dark:text-white">{ws.warehouseName}</div>
                  <div className="text-[11px] text-slate-400">ملخص التحويلات</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-emerald-50 dark:bg-emerald-950/30 p-3 rounded-xl">
                  <div className="text-[10px] font-bold text-emerald-600 mb-1">وارد (تحويل إلى)</div>
                  <div className="text-lg font-black text-emerald-700 dark:text-emerald-400">{CeramicMath.formatM2(ws.totalIn)}</div>
                </div>
                <div className="bg-red-50 dark:bg-red-950/30 p-3 rounded-xl">
                  <div className="text-[10px] font-bold text-red-600 mb-1">صادر (تحويل من)</div>
                  <div className="text-lg font-black text-red-700 dark:text-red-400">{CeramicMath.formatM2(ws.totalOut)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
