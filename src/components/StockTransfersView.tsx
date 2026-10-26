import React, { useState, useEffect } from 'react';
import { 
  ArrowLeftRight, Search, Plus, Filter, Package, 
  ArrowUpRight, ArrowDownRight, Calendar, CheckCircle2,
  Clock, Truck, AlertTriangle, XCircle, ChevronRight, X,
  Building2, Check, RefreshCw
} from 'lucide-react';
import { InventoryService } from '../services/InventoryService';
import { ProductService } from '../services/ProductService';
import { Warehouse } from '../types';
import { formatProductQuantity, getProductUnitLabel } from '../utils/productUnits';
import { useToast } from './ui/Toast';

export const StockTransfersView: React.FC = () => {
  const inventoryService = new InventoryService();
  const productService = new ProductService();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<'workflow' | 'history' | 'summary'>('workflow');
  const [transfers, setTransfers] = useState<any[]>([]);
  const [workflowTransfers, setWorkflowTransfers] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [warehouseSummary, setWarehouseSummary] = useState<any[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);

  // New Transfer Request Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [fromWhId, setFromWhId] = useState('');
  const [toWhId, setToWhId] = useState('');
  const [requestNotes, setRequestNotes] = useState('');
  const [requestItems, setRequestItems] = useState<Array<{ productId: string; quantityM2: number; notes: string }>>([]);

  // Receiving Modal
  const [receivingTransfer, setReceivingTransfer] = useState<any | null>(null);
  const [receivingItems, setReceivingItems] = useState<any[]>([]);
  const [receiptInputs, setReceiptInputs] = useState<Record<string, { receivedM2: number; lostM2: number; damagedM2: number; notes: string }>>({});

  // View Details Modal
  const [detailTransfer, setDetailTransfer] = useState<any | null>(null);
  const [detailItems, setDetailItems] = useState<any[]>([]);

  const loadData = () => {
    setLoading(true);
    try {
      const whs = inventoryService.getAllWarehouses();
      setWarehouses(whs);
      if (whs.length > 1 && !fromWhId) {
        setFromWhId(whs[0].id);
        setToWhId(whs[1].id);
      }
      setAllProducts(productService.getAllProducts());

      // 1. Workflow transfers
      const wfList = inventoryService.getTransfersWithDetails(
        statusFilter === 'ALL' ? undefined : statusFilter,
        selectedWarehouse || undefined
      );
      setWorkflowTransfers(wfList.map((transfer) => {
        const items = inventoryService.getTransferItems(transfer.id);
        const summarize = (key: 'quantityM2' | 'shippedM2' | 'receivedM2' | 'lostM2') => {
          const totals = new Map<string, { product: any; quantity: number }>();
          for (const item of items) {
            const quantity = Number(item[key] || 0);
            if (!quantity) continue;
            const unit = getProductUnitLabel(item);
            const entry = totals.get(unit) || { product: item, quantity: 0 };
            entry.quantity += quantity;
            totals.set(unit, entry);
          }
          return [...totals.values()].map((entry) => formatProductQuantity(entry.quantity, entry.product)).join('، ') || '—';
        };
        return {
          ...transfer,
          quantitySummary: summarize('quantityM2'),
          shippedSummary: summarize('shippedM2'),
          receivedSummary: summarize('receivedM2'),
          lostSummary: summarize('lostM2'),
        };
      }));

      // 2. Historical ledger movements
      const txList = inventoryService.getTransfersList(
        dateFrom || undefined,
        dateTo || undefined,
        selectedWarehouse || undefined
      );
      setTransfers(txList);

      // 3. Summary
      const summaryRows = inventoryService.getTransferSummaryByWarehouse();
      const groupedSummary = new Map<string, any>();
      for (const row of summaryRows) {
        const warehouse = groupedSummary.get(row.warehouseId) || {
          warehouseId: row.warehouseId,
          warehouseName: row.warehouseName,
          unitTotals: [],
        };
        if (row.unitLabel) warehouse.unitTotals.push(row);
        groupedSummary.set(row.warehouseId, warehouse);
      }
      setWarehouseSummary([...groupedSummary.values()]);
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تحميل بيانات التحويلات.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedWarehouse, statusFilter, dateFrom, dateTo]);

  const handleOpenCreate = () => {
    setRequestItems([{ productId: allProducts[0]?.id || '', quantityM2: 10, notes: '' }]);
    setShowCreateModal(true);
  };

  const handleAddItemRow = () => {
    setRequestItems([...requestItems, { productId: allProducts[0]?.id || '', quantityM2: 10, notes: '' }]);
  };

  const handleRemoveItemRow = (idx: number) => {
    setRequestItems(requestItems.filter((_, i) => i !== idx));
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (fromWhId === toWhId) {
      toast.error('لا يمكن التحويل لنفس المخزن.');
      return;
    }
    if (requestItems.length === 0) {
      toast.error('أضف صنفاً واحداً على الأقل.');
      return;
    }
    try {
      inventoryService.createTransferRequest({
        fromWarehouseId: fromWhId,
        toWarehouseId: toWhId,
        items: requestItems,
        notes: requestNotes
      });
      toast.success('تم إنشاء طلب التحويل المخزني بنجاح وبانتظار الاعتماد.');
      setShowCreateModal(false);
      setRequestNotes('');
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'فشلت العملية.');
    }
  };

  const handleApprove = (trfId: string) => {
    if (!confirm('هل تريد اعتماد أمر التحويل؟')) return;
    try {
      inventoryService.approveTransfer(trfId);
      toast.success('تم اعتماد التحويل.');
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر الاعتماد.');
    }
  };

  const handlePrepare = (trfId: string) => {
    try {
      inventoryService.prepareTransfer(trfId);
      toast.success('تم بدء تجهيز البضاعة بالمخزن المصدر.');
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر التحديث.');
    }
  };

  const handleDispatch = (trfId: string) => {
    if (!confirm('هل تأكدت من تحميل البضاعة وخروجها؟ سيتم خصم الكميات من المخزن المصدر.')) return;
    try {
      inventoryService.dispatchTransfer(trfId);
      toast.success('تم إرسال الشحنة وخصمها من رصيد المصدر، وهي قيد النقل الآن.');
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر الإرسال.');
    }
  };

  const handleOpenReceive = (trf: any) => {
    setReceivingTransfer(trf);
    try {
      const items = inventoryService.getTransferItems(trf.id);
      setReceivingItems(items);
      const initialMap: Record<string, any> = {};
      items.forEach(i => {
        initialMap[i.id] = {
          receivedM2: i.shippedM2 || i.quantityM2,
          lostM2: 0,
          damagedM2: 0,
          notes: ''
        };
      });
      setReceiptInputs(initialMap);
    } catch (err: any) {
      toast.error(err?.message || 'تعذر تحميل أصناف التحويل.');
    }
  };

  const handleReceiveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!receivingTransfer) return;
    try {
      const receipts = Object.entries(receiptInputs).map(([itemId, val]) => ({
        itemId,
        receivedM2: Number(val.receivedM2 || 0),
        lostM2: Number(val.lostM2 || 0),
        damagedM2: Number(val.damagedM2 || 0),
        notes: val.notes
      }));

      inventoryService.receiveTransfer(receivingTransfer.id, receipts);
      toast.success('تم تأكيد استلام الشحنة وإضافتها لمخزن الوجهة.');
      setReceivingTransfer(null);
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'فشل تأكيد الاستلام.');
    }
  };

  const handleReject = (trfId: string) => {
    const reason = prompt('أدخل سبب رفض أو إلغاء التحويل:');
    if (!reason || !reason.trim()) return;
    try {
      inventoryService.rejectTransfer(trfId, reason.trim());
      toast.success('تم رفض التحويل وإعادة البضاعة للمخزن المصدر إن كانت قد خرجت.');
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر الرفض.');
    }
  };

  const handleViewDetails = (trf: any) => {
    setDetailTransfer(trf);
    try {
      const items = inventoryService.getTransferItems(trf.id);
      setDetailItems(items);
    } catch (err: any) {
      toast.error(err?.message || 'تعذر جلب تفاصيل التحويل.');
    }
  };

  const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0);

  const getStatusBadge = (st: string) => {
    switch (st) {
      case 'REQUESTED':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-amber-100 text-amber-800 border border-amber-300">طلب جديد (بانتظار الاعتماد)</span>;
      case 'APPROVED':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-blue-100 text-blue-800 border border-blue-300">معتمد (جاهز للتجهيز)</span>;
      case 'PREPARING':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-indigo-100 text-indigo-800 border border-indigo-300">قيد التجهيز والتحميل</span>;
      case 'IN_TRANSIT':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-purple-100 text-purple-800 border border-purple-300 animate-pulse">قيد النقل والتوصيل 🚚</span>;
      case 'RECEIVED_FULL':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">مستلم بالكامل</span>;
      case 'RECEIVED_PARTIAL':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-orange-100 text-orange-800 border border-orange-300">استلام جزئي (يوجد فقد/عجز)</span>;
      case 'REJECTED':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-rose-100 text-rose-800 border border-rose-300">مرفوض / ملغي</span>;
      default:
        return <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-slate-100">{st}</span>;
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-sky-500/20">
            <ArrowLeftRight className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-black">التحويلات المخزنية ودورة الحياة الكاملة</h1>
            <p className="text-xs text-slate-500 font-medium">طلب، اعتماد، تجهيز، إرسال، واستلام جزئي/كامل مع توثيق الفقد أو الرفض</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-black shadow-md shadow-sky-600/20 transition active:scale-95"
          >
            <Plus className="w-4 h-4" />
            طلب تحويل مخزني جديد
          </button>

          <button
            onClick={loadData}
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition"
            title="تحديث"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 pt-4 bg-white border-b border-slate-200 flex items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('workflow')}
            className={`pb-3 px-3 text-xs font-black border-b-2 transition ${
              activeTab === 'workflow'
                ? 'border-sky-600 text-sky-600'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            أوامر التحويل النشطة ({workflowTransfers.length})
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`pb-3 px-3 text-xs font-black border-b-2 transition ${
              activeTab === 'history'
                ? 'border-sky-600 text-sky-600'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            سجل حركات التحويل المنفذة ({transfers.length})
          </button>
          <button
            onClick={() => setActiveTab('summary')}
            className={`pb-3 px-3 text-xs font-black border-b-2 transition ${
              activeTab === 'summary'
                ? 'border-sky-600 text-sky-600'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            ملخص حركة المخازن
          </button>
        </div>

        {activeTab === 'workflow' && (
          <div className="pb-2 flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
            >
              <option value="ALL">جميع الحالات</option>
              <option value="REQUESTED">طلبات جديدة</option>
              <option value="APPROVED">معتمدة</option>
              <option value="PREPARING">قيد التجهيز</option>
              <option value="IN_TRANSIT">قيد النقل</option>
              <option value="RECEIVED_FULL">مستلمة بالكامل</option>
              <option value="RECEIVED_PARTIAL">استلام جزئي</option>
              <option value="REJECTED">مرفوضة</option>
            </select>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'workflow' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3.5">رقم التحويل / التاريخ</th>
                  <th className="p-3.5">من مخزن</th>
                  <th className="p-3.5">إلى مخزن</th>
                  <th className="p-3.5 text-center">عدد الأصناف</th>
                  <th className="p-3.5 text-center">الكمية المطلوبة</th>
                  <th className="p-3.5 text-center">المشحون / المستلم</th>
                  <th className="p-3.5 text-center">الحالة</th>
                  <th className="p-3.5 text-center">الإجراءات والمراحل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {workflowTransfers.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/80 transition">
                    <td className="p-3.5">
                      <div className="font-mono font-black text-slate-900">{t.transferNumber}</div>
                      <div className="text-[10px] text-slate-400 font-bold">{t.date}</div>
                    </td>
                    <td className="p-3.5">
                      <span className="font-bold text-slate-800">{t.fromWarehouseName}</span>
                    </td>
                    <td className="p-3.5">
                      <span className="font-bold text-sky-700">{t.toWarehouseName}</span>
                    </td>
                    <td className="p-3.5 text-center font-bold text-slate-600">
                      {t.itemsCount} صنف
                    </td>
                    <td className="p-3.5 text-center font-mono font-black text-slate-900">
                      {t.quantitySummary}
                    </td>
                    <td className="p-3.5 text-center font-mono">
                      <div>مشحون: {t.shippedSummary}</div>
                      <div className="text-emerald-700 font-bold">مستلم: {t.receivedSummary}</div>
                      {t.totalLostM2 > 0 && (
                        <div className="text-rose-600 font-bold text-[10px]">فقد: {t.lostSummary}</div>
                      )}
                    </td>
                    <td className="p-3.5 text-center">
                      {getStatusBadge(t.status)}
                    </td>
                    <td className="p-3.5 text-center">
                      <div className="flex items-center justify-center gap-1.5 flex-wrap">
                        <button
                          onClick={() => handleViewDetails(t)}
                          className="px-2.5 py-1 rounded-lg text-slate-600 hover:bg-slate-100 text-xs font-bold border border-slate-200"
                        >
                          التفاصيل
                        </button>

                        {t.status === 'REQUESTED' && (
                          <>
                            <button
                              onClick={() => handleApprove(t.id)}
                              className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold"
                            >
                              اعتماد
                            </button>
                            <button
                              onClick={() => handleReject(t.id)}
                              className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold"
                            >
                              رفض
                            </button>
                          </>
                        )}

                        {t.status === 'APPROVED' && (
                          <button
                            onClick={() => handlePrepare(t.id)}
                            className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
                          >
                            بدء التجهيز
                          </button>
                        )}

                        {t.status === 'PREPARING' && (
                          <button
                            onClick={() => handleDispatch(t.id)}
                            className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold"
                          >
                            إرسال وشحن
                          </button>
                        )}

                        {t.status === 'IN_TRANSIT' && (
                          <>
                            <button
                              onClick={() => handleOpenReceive(t)}
                              className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                            >
                              استلام البضاعة
                            </button>
                            <button
                              onClick={() => handleReject(t.id)}
                              className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 text-xs font-bold"
                              title="رفض وإرجاع للمصدر"
                            >
                              رفض
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {workflowTransfers.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      لا توجد أوامر تحويل في هذه الحالة
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3.5">رقم الحركة</th>
                    <th className="p-3.5">التاريخ</th>
                    <th className="p-3.5">الصنف</th>
                    <th className="p-3.5">من مخزن</th>
                    <th className="p-3.5">إلى مخزن</th>
                    <th className="p-3.5 text-center">الكمية</th>
                    <th className="p-3.5 text-center">الكراتين</th>
                    <th className="p-3.5 text-center">التكلفة</th>
                    <th className="p-3.5">المنفذ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transfers.map((t, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-3.5 font-mono font-bold text-slate-900">{t.transferNumber}</td>
                      <td className="p-3.5 font-mono text-slate-500">{t.transferDate?.slice(0, 10)}</td>
                      <td className="p-3.5">
                        <div className="font-bold text-slate-900">{t.productName}</div>
                        <div className="text-[10px] text-slate-500">{t.productSku}</div>
                      </td>
                      <td className="p-3.5">
                        <span className="px-2 py-1 bg-red-50 text-red-600 rounded-lg font-bold text-[10px] flex items-center gap-1 w-fit">
                          <ArrowUpRight className="w-3 h-3" />
                          {t.fromWarehouse}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <span className="px-2 py-1 bg-emerald-50 text-emerald-600 rounded-lg font-bold text-[10px] flex items-center gap-1 w-fit">
                          <ArrowDownRight className="w-3 h-3" />
                          {t.toWarehouse}
                        </span>
                      </td>
                      <td className="p-3.5 text-center font-black text-sky-600">{formatProductQuantity(Number(t.quantityM2), t)}</td>
                      <td className="p-3.5 text-center font-bold text-slate-700">{t.productType === 'GENERAL' ? '—' : t.boxesCount}</td>
                      <td className="p-3.5 text-center font-mono font-black text-slate-900">{fmt(t.totalCost)} ج.م</td>
                      <td className="p-3.5 text-slate-600">{t.performedByName || 'النظام'}</td>
                    </tr>
                  ))}
                  {transfers.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        لا توجد حركات تحويل منفذة سابقة
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'summary' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {warehouseSummary.map(w => (
              <div key={w.warehouseId} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <span className="font-black text-base text-slate-900">{w.warehouseName}</span>
                  <Building2 className="w-5 h-5 text-slate-400" />
                </div>
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-3">
                    <div className="text-[10px] text-emerald-800 font-bold mb-1">إجمالي الوارد</div>
                    <div className="font-mono text-sm font-black text-emerald-700">
                      {w.unitTotals.map((unit: any) => <div key={unit.unitLabel}>{fmt(unit.totalIn)} {unit.unitLabel}</div>)}
                    </div>
                  </div>
                  <div className="bg-rose-50/60 border border-rose-200 rounded-xl p-3">
                    <div className="text-[10px] text-rose-800 font-bold mb-1">إجمالي الصادر</div>
                    <div className="font-mono text-sm font-black text-rose-700">
                      {w.unitTotals.map((unit: any) => <div key={unit.unitLabel}>{fmt(unit.totalOut)} {unit.unitLabel}</div>)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Transfer Request Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-xl shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <h3 className="font-black text-slate-900 text-sm">طلب تحويل مخزني جديد</h3>
              <button onClick={() => setShowCreateModal(false)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="mt-4 space-y-4 flex-1 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">من مخزن (المصدر)</label>
                  <select
                    value={fromWhId}
                    onChange={(e) => setFromWhId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-sky-500"
                    required
                  >
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">إلى مخزن (الوجهة)</label>
                  <select
                    value={toWhId}
                    onChange={(e) => setToWhId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-sky-500"
                    required
                  >
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-700">الأصناف المراد تحويلها</label>
                  <button
                    type="button"
                    onClick={handleAddItemRow}
                    className="text-xs text-sky-600 font-bold hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> إضافة صنف
                  </button>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto border border-slate-200 rounded-xl p-3 bg-slate-50/50">
                  {requestItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-white p-2.5 rounded-xl border border-slate-200">
                      <select
                        value={item.productId}
                        onChange={(e) => {
                          const next = [...requestItems];
                          next[idx].productId = e.target.value;
                          setRequestItems(next);
                        }}
                        className="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                        required
                      >
                        {allProducts.map(p => (
                          <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                        ))}
                      </select>

                      <input
                        type="number"
                        min="0.1"
                        step={(() => {
                          const product = allProducts.find((entry) => entry.id === item.productId);
                          return product?.productType === 'GENERAL' && ['BOX', 'PIECE', 'SET'].includes(product.baseUnit) ? 1 : 0.01;
                        })()}
                        placeholder={`الكمية ${getProductUnitLabel(allProducts.find((entry) => entry.id === item.productId) || { productType: 'CERAMIC' })}`}
                        value={item.quantityM2}
                        onChange={(e) => {
                          const next = [...requestItems];
                          next[idx].quantityM2 = parseFloat(e.target.value) || 0;
                          setRequestItems(next);
                        }}
                        className="w-24 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-center"
                        required
                      />

                      {requestItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItemRow(idx)}
                          className="p-1 rounded text-rose-500 hover:bg-rose-50"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">ملاحظات التحويل</label>
                <textarea
                  rows={2}
                  value={requestNotes}
                  onChange={(e) => setRequestNotes(e.target.value)}
                  placeholder="سبب التحويل أو بيانات السائق..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex gap-2 justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-black shadow-md shadow-sky-600/20"
                >
                  إرسال الطلب للاعتماد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Receiving Modal */}
      {receivingTransfer && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-2xl shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div>
                <h3 className="font-black text-slate-900 text-sm">
                  استلام شحنة التحويل ({receivingTransfer.transferNumber})
                </h3>
                <p className="text-xs text-slate-500">
                  من: {receivingTransfer.fromWarehouseName} ← إلى: {receivingTransfer.toWarehouseName}
                </p>
              </div>
              <button onClick={() => setReceivingTransfer(null)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleReceiveSubmit} className="mt-4 space-y-4 flex-1 overflow-y-auto">
              <div className="space-y-3">
                {receivingItems.map((item) => {
                  const input = receiptInputs[item.id] || { receivedM2: 0, lostM2: 0, damagedM2: 0, notes: '' };
                  return (
                    <div key={item.id} className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-black text-slate-900 text-xs">{item.productName} ({item.sku})</span>
                        <span className="font-mono text-xs text-slate-500 font-bold">
                          المشحون: {formatProductQuantity(Number(item.shippedM2 || item.quantityM2), item)}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[10px] font-bold text-emerald-700 mb-1">المستلم صالح ({getProductUnitLabel(item)})</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={input.receivedM2}
                            onChange={(e) => {
                              setReceiptInputs({
                                ...receiptInputs,
                                [item.id]: { ...input, receivedM2: parseFloat(e.target.value) || 0 }
                              });
                            }}
                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-center"
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-rose-700 mb-1">فقد وعجز ({getProductUnitLabel(item)})</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={input.lostM2}
                            onChange={(e) => {
                              setReceiptInputs({
                                ...receiptInputs,
                                [item.id]: { ...input, lostM2: parseFloat(e.target.value) || 0 }
                              });
                            }}
                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-center"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-amber-700 mb-1">كسر وتالف ({getProductUnitLabel(item)})</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={input.damagedM2}
                            onChange={(e) => {
                              setReceiptInputs({
                                ...receiptInputs,
                                [item.id]: { ...input, damagedM2: parseFloat(e.target.value) || 0 }
                              });
                            }}
                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-center"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-3 border-t border-slate-100 flex gap-2 justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => setReceivingTransfer(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-md shadow-emerald-600/20"
                >
                  تأكيد الاستلام وإضافة الرصيد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {detailTransfer && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-black text-slate-900 text-sm">
                تفاصيل أمر التحويل ({detailTransfer.transferNumber})
              </h3>
              <button onClick={() => setDetailTransfer(null)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-3 space-y-3">
              <div className="bg-slate-50 p-3 rounded-xl text-xs space-y-1">
                <div>الحالة: {getStatusBadge(detailTransfer.status)}</div>
                <div>المصدر: {detailTransfer.fromWarehouseName} ← الوجهة: {detailTransfer.toWarehouseName}</div>
                <div>المنشئ: {detailTransfer.createdByName || 'النظام'} ({detailTransfer.date})</div>
                {detailTransfer.approvedByName && <div>المعتمد: {detailTransfer.approvedByName} ({detailTransfer.approvedAt})</div>}
                {detailTransfer.dispatchedByName && <div>المسؤول عن الإرسال: {detailTransfer.dispatchedByName} ({detailTransfer.dispatchedAt})</div>}
                {detailTransfer.receivedByName && <div>المستلم: {detailTransfer.receivedByName} ({detailTransfer.receivedAt})</div>}
                {detailTransfer.rejectionReason && <div className="text-rose-600 font-bold">سبب الرفض: {detailTransfer.rejectionReason}</div>}
              </div>

              <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 text-slate-500 font-bold">
                    <tr>
                      <th className="p-2">الصنف</th>
                      <th className="p-2 text-center">المطلوب</th>
                      <th className="p-2 text-center">المشحون</th>
                      <th className="p-2 text-center">المستلم</th>
                      <th className="p-2 text-center">الفقد</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detailItems.map(i => (
                      <tr key={i.id}>
                        <td className="p-2 font-bold">{i.productName}</td>
                        <td className="p-2 text-center font-mono">{fmt(i.quantityM2)}</td>
                        <td className="p-2 text-center font-mono">{fmt(i.shippedM2)}</td>
                        <td className="p-2 text-center font-mono text-emerald-700 font-bold">{fmt(i.receivedM2)}</td>
                        <td className="p-2 text-center font-mono text-rose-600">{fmt(i.lostM2 + i.damagedM2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setDetailTransfer(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-xs font-bold text-slate-700"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
