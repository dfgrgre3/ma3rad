import React, { useState, useEffect } from 'react';
import { 
  Scale, CheckCircle2, AlertTriangle, RefreshCw, BookmarkCheck,
  FileText, ShieldCheck, Database, Layers, ArrowLeftRight, Building2,
  Calendar, Check, X
} from 'lucide-react';
import { InventoryService } from '../../services/InventoryService';
import { useToast } from '../../components/ui/Toast';

export const InventoryReconciliationPage: React.FC = () => {
  const inventoryService = new InventoryService();
  const toast = useToast();

  const [reconciliation, setReconciliation] = useState<any | null>(null);
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [loading, setLoading] = useState(true);
  const [reconciling, setReconciling] = useState(false);

  // Notes modal for formal audit saving
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveNotes, setSaveNotes] = useState('');

  const loadData = () => {
    setLoading(true);
    try {
      const whs = inventoryService.getAllWarehouses();
      setWarehouses(whs);

      const result = inventoryService.reconcileInventoryWithGL(selectedWarehouseId || undefined);
      setReconciliation(result);

      const logs = inventoryService.getReconciliationLogs();
      setHistoryLogs(logs);
    } catch (e: any) {
      toast.error(e?.message || 'تعذر استخراج بيانات المطابقة المحاسبية.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedWarehouseId]);

  const handleSaveAuditStamp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reconciliation) return;
    setReconciling(true);
    try {
      inventoryService.saveReconciliationLog({
        warehouseId: selectedWarehouseId || undefined,
        totalPhysicalCost: reconciliation.totalPhysicalCost,
        totalFifoLayerCost: reconciliation.totalFifoLayerCost,
        totalGlInventoryCost: reconciliation.totalGlInventoryCost,
        variancePhysicalVsFifo: reconciliation.variancePhysicalVsFifo,
        varianceFifoVsGl: reconciliation.varianceFifoVsGl,
        status: reconciliation.status,
        notes: saveNotes.trim() || undefined
      });
      toast.success('تم توثيق محضر المطابقة الدوري وسجله في سجل التدقيق المالي.');
      setShowSaveModal(false);
      setSaveNotes('');
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'فشل حفظ محضر المطابقة.');
    } finally {
      setReconciling(false);
    }
  };

  const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0) + ' ج.م';
  const isBalanced = reconciliation?.status === 'BALANCED';

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-600 flex items-center justify-center text-white shadow-md shadow-emerald-600/20">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-black">مطابقة المخزون مع الأستاذ العام ودفتر التكلفة</h1>
            <p className="text-xs text-slate-500 font-medium">المطابقة الثلاثية الدورية بين رصيد المخزون الفعلي، طبقات تكلفة FIFO، ورصيد حساب المخزون (1104)</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedWarehouseId}
            onChange={(e) => setSelectedWarehouseId(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">جميع المخازن الموحدة</option>
            {warehouses.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>

          <button
            onClick={() => setShowSaveModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-md shadow-emerald-600/20 transition active:scale-95"
          >
            <BookmarkCheck className="w-4 h-4" />
            توثيق محضر مطابقة دوري
          </button>

          <button
            onClick={loadData}
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition"
            title="إعادة الفحص والمطابقة"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Triangular Status Card */}
        <div className={`p-6 rounded-3xl border shadow-sm transition ${
          isBalanced 
            ? 'bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border-emerald-300' 
            : 'bg-gradient-to-br from-amber-500/10 via-rose-500/5 to-transparent border-amber-300'
        }`}>
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {isBalanced ? (
                <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-600/30">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-2xl bg-amber-600 text-white flex items-center justify-center shadow-lg shadow-amber-600/30">
                  <AlertTriangle className="w-7 h-7" />
                </div>
              )}
              <div>
                <h2 className="text-lg font-black text-slate-900">
                  {isBalanced ? 'المطابقة الثلاثية متطابقة بالكامل وموزونة 100%' : 'تنبيه: تم رصد فروقات بين سجلات المخزون والحسابات'}
                </h2>
                <p className="text-xs text-slate-600 font-medium">
                  {isBalanced
                    ? 'لا توجد فروقات بين أرصدة البضاعة الفعلية ودفتر طبقات التكلفة FIFO وحساب الأستاذ العام (1104).'
                    : 'يوجد تباين يحتاج إلى تدقيق الحركات غير المرحلة أو تسوية جردية لتطابق دفتر الأستاذ العام.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs font-bold">
              <span className="text-slate-500">تاريخ آخر مطابقة: {reconciliation?.reconciliationDate}</span>
              <span className="text-slate-500">المحقق: {reconciliation?.performedByName || 'النظام'}</span>
            </div>
          </div>

          {/* Three Pillars */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            {/* Pillar 1: Physical Stock */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500">1. قيمة المخزون الفعلي (Physical)</span>
                <Database className="w-4 h-4 text-sky-600" />
              </div>
              <div className="text-2xl font-black text-slate-900">{fmt(reconciliation?.totalPhysicalCost || 0)}</div>
              <div className="text-xs text-slate-400 font-bold mt-1">تُعرض كميات الأصناف بوحدة كل صنف على حدة.</div>
              <div className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded-xl mt-3 font-medium">
                محسوب من جداول أرصدة المخازن الحالية مضروباً في سعر التكلفة لكل صنف.
              </div>
            </div>

            {/* Pillar 2: FIFO Cost Ledger */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500">2. دفتر طبقات التكلفة (FIFO Layers)</span>
                <Layers className="w-4 h-4 text-violet-600" />
              </div>
              <div className="text-2xl font-black text-slate-900">{fmt(reconciliation?.totalFifoLayerCost || 0)}</div>
              <div className="text-xs text-slate-400 font-bold mt-1">تُعرض كميات الطبقات بوحدة كل صنف على حدة.</div>
              <div className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded-xl mt-3 font-medium">
                مجموع الدفعات الواردة غير المنصرفة (الوارد أولاً يصرف أولاً).
              </div>
            </div>

            {/* Pillar 3: General Ledger */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500">3. حساب المخزون بالأستاذ العام (GL 1104)</span>
                <Building2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-black text-slate-900">{fmt(reconciliation?.totalGlInventoryCost || 0)}</div>
              <div className="text-xs text-slate-400 font-bold mt-1">
                رصيد قيود اليومية المرحل لحساب 1104
              </div>
              <div className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded-xl mt-3 font-medium">
                الرصيد الدفتري المالي المحاسبي المعتمد في الميزانية العمومية.
              </div>
            </div>
          </div>

          {/* Variance Breakdown */}
          <div className="mt-6 pt-4 border-t border-slate-200/60 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between bg-white/80 border border-slate-200 p-3.5 rounded-xl">
              <span className="text-xs font-bold text-slate-700">الفارق بين الفعلي وطبقات FIFO:</span>
              <span className={`font-mono font-black text-sm ${Math.abs(reconciliation?.variancePhysicalVsFifo || 0) < 0.05 ? 'text-emerald-600' : 'text-amber-600'}`}>
                {fmt(reconciliation?.variancePhysicalVsFifo || 0)}
              </span>
            </div>

            <div className="flex items-center justify-between bg-white/80 border border-slate-200 p-3.5 rounded-xl">
              <span className="text-xs font-bold text-slate-700">الفارق بين طبقات FIFO والأستاذ العام (1104):</span>
              <span className={`font-mono font-black text-sm ${Math.abs(reconciliation?.varianceFifoVsGl || 0) < 0.05 ? 'text-emerald-600' : 'text-amber-600'}`}>
                {fmt(reconciliation?.varianceFifoVsGl || 0)}
              </span>
            </div>
          </div>
        </div>

        {/* Historical Reconciliation Logs */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-black text-slate-900 text-sm">سجل محاضر المطابقة الدورية المعتمدة</h3>
              <p className="text-xs text-slate-400">سجل تدقيق رقابي تاريخي غير قابل للمحو لمحاضر المطابقة الشهرية والسنوية</p>
            </div>
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-sm text-right">
              <thead className="bg-slate-50 text-[11px] font-black text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-3">تاريخ المحضر</th>
                  <th className="px-3 py-3">المستودع</th>
                  <th className="px-3 py-3 text-center">المخزون الفعلي</th>
                  <th className="px-3 py-3 text-center">طبقات FIFO</th>
                  <th className="px-3 py-3 text-center">الأستاذ العام (1104)</th>
                  <th className="px-3 py-3 text-center">الفروقات</th>
                  <th className="px-3 py-3 text-center">الحالة</th>
                  <th className="px-3 py-3">المحقق / ملاحظات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {historyLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70 transition">
                    <td className="px-3 py-2.5 font-bold text-slate-900">{log.reconciliationDate}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-600 font-bold">{log.warehouseName || 'جميع المخازن'}</td>
                    <td className="px-3 py-2.5 text-center font-mono font-bold text-slate-900">{fmt(log.totalPhysicalCost)}</td>
                    <td className="px-3 py-2.5 text-center font-mono font-bold text-violet-700">{fmt(log.totalFifoLayerCost)}</td>
                    <td className="px-3 py-2.5 text-center font-mono font-bold text-emerald-700">{fmt(log.totalGlInventoryCost)}</td>
                    <td className="px-3 py-2.5 text-center font-mono text-xs font-black">
                      {Math.abs(log.varianceFifoVsGl) < 0.05 ? (
                        <span className="text-emerald-600 font-bold">0.00 ج.م</span>
                      ) : (
                        <span className="text-amber-600 font-black">{fmt(log.varianceFifoVsGl)}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {log.status === 'BALANCED' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                          <Check className="w-3 h-3" /> مطابق وموزون
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-black text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                          <AlertTriangle className="w-3 h-3" /> يوجد فروقات
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      <div className="font-bold text-slate-700">{log.performedByName || 'المشرف المالي'}</div>
                      {log.notes && <div className="text-[11px] text-slate-500 mt-0.5">{log.notes}</div>}
                    </td>
                  </tr>
                ))}
                {historyLogs.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-400 text-xs">
                      لا توجد محاضر مطابقة مؤرشفة سابقة. اضغط "توثيق محضر مطابقة دوري" لحفظ أول محضر.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Save Audit Stamp Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-100 animate-in fade-in zoom-in duration-150">
            <h3 className="font-black text-slate-900 text-sm mb-2">توثيق محضر مطابقة دوري رسمي</h3>
            <p className="text-xs text-slate-500 mb-4">
              سيتم حفظ الأرصدة الحالية في سجل التدقيق المحاسبي غير القابل للتعديل لأغراض الرقابة وإعداد القوائم المالية.
            </p>

            <form onSubmit={handleSaveAuditStamp} className="space-y-3">
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">المخزون الفعلي:</span>
                  <span className="font-black">{fmt(reconciliation?.totalPhysicalCost || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">طبقات تكلفة FIFO:</span>
                  <span className="font-black">{fmt(reconciliation?.totalFifoLayerCost || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">الأستاذ العام (1104):</span>
                  <span className="font-black">{fmt(reconciliation?.totalGlInventoryCost || 0)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-1.5 font-bold">
                  <span>حالة المطابقة:</span>
                  <span className={isBalanced ? 'text-emerald-700' : 'text-amber-700'}>
                    {isBalanced ? 'متطابق بالكامل' : 'توجد فروقات'}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">ملاحظات المحضر وتوقيع المشرف المالي</label>
                <textarea
                  rows={3}
                  value={saveNotes}
                  onChange={(e) => setSaveNotes(e.target.value)}
                  placeholder="تمت مطابقة أرصدة نهاية الشهر وتبين تطابق الأرصدة..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-3 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowSaveModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={reconciling}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-md shadow-emerald-600/20 disabled:opacity-50"
                >
                  {reconciling ? 'جارٍ التوثيق...' : 'اعتماد وتوثيق المحضر'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
