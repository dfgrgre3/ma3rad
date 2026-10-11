import React, { useState, useEffect } from 'react';
import { 
  Receipt, Search, Printer, RotateCcw, 
  CheckCircle, AlertCircle, FileText
} from 'lucide-react';
import { SalesService } from '../services/SalesService';
import { PrintService } from '../services/PrintService';
import { SalesInvoice } from '../types';
import { CeramicMath } from '../utils/ceramicMath';

export const SalesView: React.FC = () => {
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [search, setSearch] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  
  // Return Modal State
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [returnItems, setReturnItems] = useState<{ productId: string; quantityM2: number; boxesCount: number; unitPrice: number; unitCost: number; reason: string }[]>([]);

  const salesService = new SalesService();
  const printService = new PrintService();

  const loadInvoices = () => {
    try {
      const data = salesService.getAllInvoices(search);
      setInvoices(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadInvoices();
  }, [search]);

  const handleOpenInvoiceDetails = (id: string) => {
    const full = salesService.getInvoiceById(id);
    setSelectedInvoice(full);
  };

  const handleOpenReturnModal = (inv: any) => {
    const full = salesService.getInvoiceById(inv.id);
    if (!full) return;

    setSelectedInvoice(full);
    setReturnItems(full.items.map(item => ({
      productId: item.productId,
      quantityM2: item.quantityM2,
      boxesCount: item.boxesCount,
      unitPrice: item.unitPrice,
      unitCost: item.unitCost,
      reason: 'فائض عن حاجة العميل'
    })));
    setIsReturnModalOpen(true);
  };

  const handleProcessReturn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;
    try {
      salesService.returnSale(selectedInvoice.id, returnItems, true);
      setIsReturnModalOpen(false);
      loadInvoices();
      alert('تم تسجيل مرتجع المبيعات بنجاح واسترجاع الكميات للمخزن.');
    } catch (err: any) {
      alert(`خطأ: ${err.message || err}`);
    }
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      {/* Header Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">سجل فواتير المبيعات والمرتجع</h2>
          <p className="text-xs text-slate-500">استعراض الفواتير السابقة، إعادة الطباعة، ومعالجة المرتجعات واسترداد المخزون</p>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="بحث برقم الفاتورة، اسم العميل، أو الهاتف..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-4 pr-9 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium focus:outline-none"
          />
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="p-3.5">رقم الفاتورة</th>
                <th className="p-3.5">العميل</th>
                <th className="p-3.5">المخزن</th>
                <th className="p-3.5">التاريخ</th>
                <th className="p-3.5">الإجمالي</th>
                <th className="p-3.5">المدفوع</th>
                <th className="p-3.5">المتبقي (آجل)</th>
                <th className="p-3.5">حالة الدفع</th>
                <th className="p-3.5 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    لا توجد فواتير مبيعات مسجلة حتى الآن.
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition">
                    <td className="p-3.5 font-mono font-bold text-slate-900 dark:text-white">{inv.invoiceNumber}</td>
                    <td className="p-3.5 font-bold text-slate-900 dark:text-white">{inv.customerName}</td>
                    <td className="p-3.5 text-sky-600 font-semibold">{inv.warehouseName}</td>
                    <td className="p-3.5 font-mono text-slate-500">{inv.date}</td>
                    <td className="p-3.5 font-black text-slate-900 dark:text-white">{CeramicMath.formatCurrency(inv.totalAmount)}</td>
                    <td className="p-3.5 font-bold text-emerald-600">{CeramicMath.formatCurrency(inv.paidAmount)}</td>
                    <td className="p-3.5 font-bold text-amber-600">{CeramicMath.formatCurrency(inv.remainingAmount)}</td>
                    <td className="p-3.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        inv.paymentStatus === 'PAID' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'
                      }`}>
                        {inv.paymentStatus === 'PAID' ? 'مسددة بالكامل' : (inv.paymentStatus === 'PARTIAL' ? 'مسدد جزء' : 'آجل')}
                      </span>
                    </td>
                    <td className="p-3.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => {
                            const full = salesService.getInvoiceById(inv.id);
                            if (full) printService.printInvoice(full);
                          }}
                          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                          title="طباعة الفاتورة"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleOpenReturnModal(inv)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition"
                          title="إجراء مرتجع مبيعات"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Return Modal */}
      {isReturnModalOpen && selectedInvoice && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">إجراء مرتجع مبيعات للفاتورة ({selectedInvoice.invoiceNumber})</h3>

            <form onSubmit={handleProcessReturn} className="space-y-3 text-xs">
              <div className="space-y-2">
                {returnItems.map((item, idx) => (
                  <div key={idx} className="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl space-y-2">
                    <div className="font-bold text-slate-900 dark:text-white">الصنف {idx + 1}</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-500 font-bold">الكمية المرتجعة بالمتر (م²)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={item.quantityM2}
                          onChange={(e) => {
                            const q = parseFloat(e.target.value) || 0;
                            const updated = [...returnItems];
                            updated[idx].quantityM2 = q;
                            updated[idx].boxesCount = Number((q / 1.44).toFixed(2));
                            setReturnItems(updated);
                          }}
                          className="w-full px-2 py-1 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 font-bold"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 font-bold">سعر المتر المعتمد</label>
                        <div className="py-1 font-bold">{CeramicMath.formatCurrency(item.unitPrice)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">سبب الإرجاع</label>
                <input
                  type="text"
                  value={returnItems[0]?.reason || ''}
                  onChange={(e) => {
                    const updated = returnItems.map(it => ({ ...it, reason: e.target.value }));
                    setReturnItems(updated);
                  }}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 font-medium"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsReturnModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-lg shadow-amber-600/30"
                >
                  اعتماد المرتجع واستعادة الرصيد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
