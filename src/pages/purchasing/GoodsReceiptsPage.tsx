import React, { useEffect, useMemo, useState } from 'react';
import {
  PackageCheck, Plus, Search, Truck, Warehouse, CheckCircle2,
  AlertTriangle, ShieldAlert, FileText, ChevronDown, Check, X,
  Clock, Hash, Sparkles, Building2, User
} from 'lucide-react';
import {
  ProcurementService, GoodsReceiptRow, GoodsReceiptItem
} from '../../services/ProcurementService';
import { PurchaseOrderService } from '../../services/PurchaseOrderService';
import { SupplierService } from '../../services/SupplierService';
import { OperationsService } from '../../services/OperationsService';
import { ProductService } from '../../services/ProductService';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import { useToast } from '../../components/ui/Toast';
import { useNavigate } from 'react-router-dom';
import type { Supplier, Product, Warehouse as WarehouseType } from '../../types';
import { formatProductQuantity, getProductUnitLabel } from '../../utils/productUnits';

const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0);

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  ACCEPTED: { label: 'استلام مطابق بالكامل', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  ACCEPTED_WITH_REMARKS: { label: 'استلام به عيوب/نقص', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: AlertTriangle },
  REJECTED: { label: 'مرفوض كلياً', color: 'bg-rose-50 text-rose-700 border-rose-200', icon: ShieldAlert },
  PENDING_INSPECTION: { label: 'قيد الفحص المخزني', color: 'bg-sky-50 text-sky-700 border-sky-200', icon: Clock },
};

export const GoodsReceiptsPage: React.FC = () => {
  const service = useMemo(() => new ProcurementService(), []);
  const poService = useMemo(() => new PurchaseOrderService(), []);
  const toast = useToast();
  const navigate = useNavigate();
  const canCreate = PermissionService.can(AuthService.getCurrentUser(), 'purchases.create');
  const formatReceiptTotals = (receipt: GoodsReceiptRow, key: 'totalReceived' | 'totalAccepted' | 'totalDamaged' | 'totalShortage') =>
    (receipt.quantityBreakdown || []).map((unit) => `${fmt(unit[key])} ${unit.unitLabel}`).join('، ') || fmt(0);
  const unitForProduct = (productId: string) => {
    const product = products.find((entry) => entry.id === productId);
    return product ? getProductUnitLabel(product) : 'وحدة';
  };

  const [receipts, setReceipts] = useState<GoodsReceiptRow[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedDetails, setExpandedDetails] = useState<(GoodsReceiptRow & { items: GoodsReceiptItem[] }) | null>(null);

  // Modal: New Goods Receipt
  const [modalOpen, setModalOpen] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [openPurchaseOrders, setOpenPurchaseOrders] = useState<any[]>([]);

  // Form State
  const [selectedPoId, setSelectedPoId] = useState('');
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [deliveryNoteNumber, setDeliveryNoteNumber] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [driverName, setDriverName] = useState('');
  const [notes, setNotes] = useState('');

  const [items, setItems] = useState<Array<{
    purchaseOrderItemId?: string;
    productId: string;
    productName: string;
    orderedQuantityM2: number;
    receivedQuantityM2: number;
    acceptedQuantityM2: number;
    damagedQuantityM2: number;
    shortageQuantityM2: number;
    batchNumber: string;
    toneShade: string;
    caliber: string;
    grade: string;
    unitCost: number;
    inspectionNotes: string;
  }>>([]);

  const loadData = () => {
    setLoading(true);
    try {
      const rows = service.getAllGoodsReceipts(search, statusFilter);
      setReceipts(rows);
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تحميل أذونات الاستلام.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  const toggleDetails = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedDetails(null);
      return;
    }
    const details = service.getGoodsReceiptById(id);
    setExpandedDetails(details);
    setExpandedId(id);
  };

  const openNewReceiptModal = () => {
    try {
      const sups = new SupplierService().getAllSuppliers();
      const whs = new OperationsService().getWarehouses();
      const prods = new ProductService().getAllProducts();
      const pos = poService.getAllOrders('', 'ALL').filter((o) => ['SENT', 'CONFIRMED', 'PARTIAL'].includes(o.status));

      setSuppliers(sups);
      setWarehouses(whs);
      setProducts(prods);
      setOpenPurchaseOrders(pos);

      setSelectedPoId('');
      setSelectedSupplierId(sups[0]?.id || '');
      setSelectedWarehouseId(whs[0]?.id || 'wh_main');
      setDeliveryNoteNumber(`DN-${Date.now().toString().slice(-6)}`);
      setVehicleNumber('');
      setDriverName('');
      setNotes('');
      setItems([{
        productId: prods[0]?.id || '',
        productName: prods[0]?.name || '',
        orderedQuantityM2: 100,
        receivedQuantityM2: 100,
        acceptedQuantityM2: 100,
        damagedQuantityM2: 0,
        shortageQuantityM2: 0,
        batchNumber: `LOT-${Date.now().toString().slice(-5)}`,
        toneShade: 'A1',
        caliber: '0',
        grade: 'GRADE_1',
        unitCost: prods[0]?.costPrice || 120,
        inspectionNotes: 'فحص سليم مطابق',
      }]);

      setModalOpen(true);
    } catch (e: any) {
      toast.error(e?.message);
    }
  };

  const handleSelectPo = (poId: string) => {
    setSelectedPoId(poId);
    if (!poId) return;
    const po = poService.getOrderById(poId);
    if (!po) return;

    setSelectedSupplierId(po.supplierId);
    setSelectedWarehouseId(po.warehouseId);
    setItems(
      po.items.map((it) => {
        const remaining = Math.max(0, it.quantityM2 - it.receivedM2);
        return {
          purchaseOrderItemId: it.id,
          productId: it.productId,
          productName: it.productName,
          orderedQuantityM2: it.quantityM2,
          receivedQuantityM2: remaining,
          acceptedQuantityM2: remaining,
          damagedQuantityM2: 0,
          shortageQuantityM2: 0,
          batchNumber: `LOT-${Date.now().toString().slice(-4)}`,
          toneShade: 'T1',
          caliber: '0',
          grade: 'GRADE_1',
          unitCost: it.unitCost,
          inspectionNotes: 'فحص استلام مطابق لأمر الشراء',
        };
      })
    );
  };

  const handleItemChange = (idx: number, patch: Partial<typeof items[0]>) => {
    const updated = [...items];
    updated[idx] = { ...updated[idx], ...patch };

    // Auto calculate accepted if received, damaged, or shortage change
    if ('receivedQuantityM2' in patch || 'damagedQuantityM2' in patch || 'shortageQuantityM2' in patch) {
      const rec = Number(updated[idx].receivedQuantityM2 || 0);
      const dam = Number(updated[idx].damagedQuantityM2 || 0);
      const sho = Number(updated[idx].shortageQuantityM2 || 0);
      updated[idx].acceptedQuantityM2 = Math.max(0, rec - dam - sho);
    }
    setItems(updated);
  };

  const handleAddItem = () => {
    const p = products[0];
    setItems([
      ...items,
      {
        productId: p?.id || '',
        productName: p?.name || '',
        orderedQuantityM2: 0,
        receivedQuantityM2: 50,
        acceptedQuantityM2: 50,
        damagedQuantityM2: 0,
        shortageQuantityM2: 0,
        batchNumber: `LOT-${Date.now().toString().slice(-4)}`,
        toneShade: 'A1',
        caliber: '0',
        grade: 'GRADE_1',
        unitCost: p?.costPrice || 100,
        inspectionNotes: '',
      },
    ]);
  };

  const handleCreateReceipt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplierId) return toast.error('اختر المورد.');
    if (!selectedWarehouseId) return toast.error('اختر المخزن المستلم.');
    const validLines = items.filter((it) => it.productId && Number(it.receivedQuantityM2) > 0);
    if (!validLines.length) return toast.error('أدخل صنفاً مستلماً واحداً على الأقل.');

    try {
      const res = service.createGoodsReceipt({
        purchaseOrderId: selectedPoId || undefined,
        supplierId: selectedSupplierId,
        warehouseId: selectedWarehouseId,
        deliveryNoteNumber: deliveryNoteNumber || undefined,
        vehicleNumber: vehicleNumber || undefined,
        driverName: driverName || undefined,
        notes: notes || undefined,
        items: validLines.map((it) => ({
          purchaseOrderItemId: it.purchaseOrderItemId,
          productId: it.productId,
          orderedQuantityM2: it.orderedQuantityM2,
          receivedQuantityM2: Number(it.receivedQuantityM2),
          acceptedQuantityM2: Number(it.acceptedQuantityM2),
          damagedQuantityM2: Number(it.damagedQuantityM2 || 0),
          shortageQuantityM2: Number(it.shortageQuantityM2 || 0),
          batchNumber: it.batchNumber,
          toneShade: it.toneShade,
          caliber: it.caliber,
          grade: it.grade,
          unitCost: Number(it.unitCost),
          inspectionNotes: it.inspectionNotes,
        })),
      });

      toast.success(`تم تسجيل إذن الاستلام المخزني رقم ${res.grn.grnNumber} وإيداع الكميات السليمة في المخزن بنجاح.`);
      setModalOpen(false);
      loadData();

      if (res.hasDiscrepancy) {
        if (confirm(`تنبيه: تم رصد تلف (${fmt(res.damagedTotal)}) أو عجز (${fmt(res.shortageTotal)}) بوحدات الأصناف أثناء الفحص. هل تريد فتح شاشة تسجيل مطالبة مورد فوراً؟`)) {
          navigate('/purchases/claims');
        }
      }
    } catch (err: any) {
      toast.error(err?.message || 'تعذر تسجيل إذن الاستلام.');
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center">
            <PackageCheck className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <h1 className="text-base font-black text-slate-900">إذن استلام مخزني وفحص الجودة والدفعة (GRN)</h1>
            <p className="text-xs text-slate-500 font-medium">استلام مستقل عن فاتورة المورد، فحص الشيد والكاليبر، حصر التالف والعجز وزيادة رصيد المخزن</p>
          </div>
        </div>
        {canCreate && (
          <button
            onClick={openNewReceiptModal}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-bold shadow-md shadow-amber-600/20 transition shrink-0"
          >
            <Plus className="w-4 h-4" /> إذن استلام مخزني جديد
          </button>
        )}
      </header>

      {/* Filter bar */}
      <div className="p-4 bg-white border-b border-slate-200 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث برقم إذن الاستلام، المورد، رقم إذن التسليم، أو أمر الشراء..."
            className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-400"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
        >
          <option value="ALL">جميع حالات الفحص</option>
          <option value="ACCEPTED">مطابق بالكامل</option>
          <option value="ACCEPTED_WITH_REMARKS">به عيوب أو نقص</option>
          <option value="REJECTED">مرفوض</option>
          <option value="PENDING_INSPECTION">قيد الفحص</option>
        </select>
        <button onClick={loadData} className="px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-bold bg-slate-50 hover:bg-slate-100">
          تحديث
        </button>
      </div>

      {/* Receipts List */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {receipts.map((r) => {
          const cfg = STATUS_CONFIG[r.status] || { label: r.status, color: 'bg-slate-100', icon: CheckCircle2 };
          const Icon = cfg.icon;
          const isExpanded = expandedId === r.id;

          return (
            <article key={r.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:border-slate-300 transition">
              <div className="p-5 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center font-black text-xs text-slate-700">
                    GRN
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-base text-slate-900">{r.grnNumber}</span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border flex items-center gap-1 ${cfg.color}`}>
                        <Icon className="w-3 h-3" /> {cfg.label}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                      <span>المورد: <strong className="text-slate-800">{r.supplierName}</strong></span>
                      <span>المخزن: <strong className="text-slate-800">{r.warehouseName}</strong></span>
                      <span>تاريخ الاستلام: <strong>{r.date}</strong></span>
                      {r.orderNumber && <span>أمر الشراء: <strong className="text-orange-700">{r.orderNumber}</strong></span>}
                      {r.deliveryNoteNumber && <span>رقم إذن التسليم: <strong>{r.deliveryNoteNumber}</strong></span>}
                    </div>
                  </div>
                </div>

                {/* Totals & inspection breakdown */}
                <div className="flex items-center gap-3">
                  <div className="text-left bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-xs">
                    <div className="text-slate-500">المستلم: <strong className="text-slate-900">{formatReceiptTotals(r, 'totalReceived')}</strong></div>
                    <div className="text-emerald-700 font-bold">المقبول السليم: <strong>{formatReceiptTotals(r, 'totalAccepted')}</strong></div>
                    {(r.totalDamagedM2 > 0 || r.totalShortageM2 > 0) && (
                      <div className="text-rose-600 font-black">تالف: {formatReceiptTotals(r, 'totalDamaged')} · عجز: {formatReceiptTotals(r, 'totalShortage')}</div>
                    )}
                  </div>
                  <button
                    onClick={() => toggleDetails(r.id)}
                    className="p-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition"
                  >
                    <ChevronDown className={`w-4 h-4 transition ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Expanded details */}
              {isExpanded && expandedDetails && (
                <div className="border-t border-slate-100 bg-slate-50/70 p-5">
                  <h4 className="text-xs font-black text-slate-800 mb-3 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-600" /> تقرير الفحص المخزني وتفاصيل الدفعات والتشغيلات:
                  </h4>
                  <div className="overflow-x-auto bg-white border border-slate-200 rounded-xl">
                    <table className="w-full text-xs text-right">
                      <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                        <tr>
                          <th className="p-3">الصنف</th>
                          <th className="p-3">رقم التشغيلة (Lot)</th>
                          <th className="p-3">الشيد (Tone)</th>
                          <th className="p-3">الكاليبر</th>
                          <th className="p-3">الفرز</th>
                          <th className="p-3">المستلم</th>
                          <th className="p-3">السليم (المقبول)</th>
                          <th className="p-3">التالف</th>
                          <th className="p-3">العجز</th>
                          <th className="p-3">ملاحظات الفحص</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {expandedDetails.items.map((it) => (
                          <tr key={it.id}>
                            <td className="p-3 font-bold text-slate-900">{it.productName}</td>
                            <td className="p-3 font-mono font-bold text-slate-700">{it.batchNumber || '—'}</td>
                            <td className="p-3 font-bold text-indigo-700">{it.toneShade || 'STD'}</td>
                            <td className="p-3 font-bold text-slate-700">{it.caliber || '0'}</td>
                            <td className="p-3">{it.grade}</td>
                            <td className="p-3 font-semibold">{formatProductQuantity(Number(it.receivedQuantityM2), it)}</td>
                            <td className="p-3 font-black text-emerald-700">{formatProductQuantity(Number(it.acceptedQuantityM2), it)}</td>
                            <td className="p-3 font-bold text-rose-600">{it.damagedQuantityM2 > 0 ? formatProductQuantity(Number(it.damagedQuantityM2), it) : '—'}</td>
                            <td className="p-3 font-bold text-amber-600">{it.shortageQuantityM2 > 0 ? formatProductQuantity(Number(it.shortageQuantityM2), it) : '—'}</td>
                            <td className="p-3 text-slate-500">{it.inspectionNotes || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Claim Button if defects */}
                  {(expandedDetails.totalDamagedM2 > 0 || expandedDetails.totalShortageM2 > 0) && (
                    <div className="mt-4 flex items-center justify-between p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs">
                      <div className="text-rose-800 font-bold flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-600" />
                        يوجد كسر/تلف أو عجز توريد موثق في هذا الإذن. يمكنك رفع مطالبة رسمية لخصم القيمة من رصيد المورد.
                      </div>
                      <button
                        onClick={() => navigate('/purchases/claims')}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold shadow-sm"
                      >
                        فتح صفحة المطالبات
                      </button>
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}

        {!receipts.length && !loading && (
          <div className="p-16 text-center text-slate-400 border border-dashed border-slate-200 rounded-2xl">
            لا توجد أذونات استلام مخزني مسجلة مطابقة للبحث
          </div>
        )}
      </div>

      {/* Modal: Create GRN */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <section className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full p-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-black text-slate-900">إذن استلام مخزني وفحص جودة (GRN)</h2>
                <p className="text-xs text-slate-500">فحص وتوريد بضاعة السيراميك لمخازن المعرض وتوثيق الشيد واللوت</p>
              </div>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            <form onSubmit={handleCreateReceipt} className="mt-4 space-y-4">
              {/* Linked PO & Supplier */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">ربط بأمر شراء مفتوح (اختياري)</label>
                  <select
                    value={selectedPoId}
                    onChange={(e) => handleSelectPo(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl text-xs font-bold bg-white"
                  >
                    <option value="">-- استلام مباشر بدون أمر شراء --</option>
                    {openPurchaseOrders.map((po) => (
                      <option key={po.id} value={po.id}>
                        {po.orderNumber} ({po.supplierName} - {po.totalAmount} ج)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">المورد / المصنع</label>
                  <select
                    value={selectedSupplierId}
                    onChange={(e) => setSelectedSupplierId(e.target.value)}
                    required
                    disabled={Boolean(selectedPoId)}
                    className="w-full px-3 py-2 border rounded-xl text-xs font-bold bg-white"
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">المخزن المستلم للبضاعة</label>
                  <select
                    value={selectedWarehouseId}
                    onChange={(e) => setSelectedWarehouseId(e.target.value)}
                    required
                    className="w-full px-3 py-2 border rounded-xl text-xs font-bold bg-white"
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Transport & Note info */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رقم إذن تسليم / بوليصة المورد</label>
                  <input
                    type="text"
                    value={deliveryNoteNumber}
                    onChange={(e) => setDeliveryNoteNumber(e.target.value)}
                    placeholder="رقم بوليصة الشحن..."
                    className="w-full px-3 py-2 border rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رقم سيارة التوريد</label>
                  <input
                    type="text"
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value)}
                    placeholder="أ ب ج 1234"
                    className="w-full px-3 py-2 border rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">اسم السائق الموصل</label>
                  <input
                    type="text"
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                    placeholder="اسم السائق..."
                    className="w-full px-3 py-2 border rounded-xl text-xs"
                  />
                </div>
              </div>

              {/* Items inspection table */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-black text-slate-800">الأصناف وفحص الجودة والدفعة:</label>
                  {!selectedPoId && (
                    <button type="button" onClick={handleAddItem} className="text-xs text-amber-600 font-bold hover:underline">
                      + إضافة صنف
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  {items.map((it, idx) => (
                    <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                        <div className="sm:col-span-4">
                          <label className="block text-[10px] text-slate-500 font-bold mb-0.5">الصنف</label>
                          <select
                            value={it.productId}
                            onChange={(e) => {
                              const prod = products.find((p) => p.id === e.target.value);
                              handleItemChange(idx, { productId: e.target.value, productName: prod?.name || '' });
                            }}
                            disabled={Boolean(selectedPoId)}
                            className="w-full bg-white border rounded-lg px-2 py-1.5 font-bold"
                          >
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                            ))}
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[10px] text-slate-500 font-bold mb-0.5">المستلم ({unitForProduct(it.productId)})</label>
                          <input
                            type="number"
                            step="0.01"
                            value={it.receivedQuantityM2}
                            onChange={(e) => handleItemChange(idx, { receivedQuantityM2: Number(e.target.value) })}
                            className="w-full bg-white border rounded-lg px-2 py-1.5 text-center font-bold"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[10px] text-rose-600 font-bold mb-0.5">التالف/مكسور ({unitForProduct(it.productId)})</label>
                          <input
                            type="number"
                            step="0.01"
                            value={it.damagedQuantityM2}
                            onChange={(e) => handleItemChange(idx, { damagedQuantityM2: Number(e.target.value) })}
                            className="w-full bg-white border rounded-lg px-2 py-1.5 text-center font-bold text-rose-600"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[10px] text-amber-600 font-bold mb-0.5">العجز/نقص ({unitForProduct(it.productId)})</label>
                          <input
                            type="number"
                            step="0.01"
                            value={it.shortageQuantityM2}
                            onChange={(e) => handleItemChange(idx, { shortageQuantityM2: Number(e.target.value) })}
                            className="w-full bg-white border rounded-lg px-2 py-1.5 text-center font-bold text-amber-600"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[10px] text-emerald-700 font-bold mb-0.5">السليم (المضاف للمخزن)</label>
                          <div className="w-full py-1.5 px-2 bg-emerald-50 border border-emerald-200 rounded-lg text-center font-black text-emerald-800">
                            {formatProductQuantity(it.acceptedQuantityM2, products.find((product) => product.id === it.productId) || { productType: 'CERAMIC' })}
                          </div>
                        </div>
                      </div>

                      {/* Batch & Shade info */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-slate-200">
                        <div>
                          <label className="block text-[10px] text-slate-500">رقم التشغيلة / اللوت</label>
                          <input
                            type="text"
                            value={it.batchNumber}
                            onChange={(e) => handleItemChange(idx, { batchNumber: e.target.value })}
                            className="w-full bg-white border rounded-lg px-2 py-1 text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500">الشيد / درجة اللون (Tone)</label>
                          <input
                            type="text"
                            value={it.toneShade}
                            onChange={(e) => handleItemChange(idx, { toneShade: e.target.value })}
                            className="w-full bg-white border rounded-lg px-2 py-1 text-xs font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500">الكاليبر (المقاس)</label>
                          <input
                            type="text"
                            value={it.caliber}
                            onChange={(e) => handleItemChange(idx, { caliber: e.target.value })}
                            className="w-full bg-white border rounded-lg px-2 py-1 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500">ملاحظات الفحص</label>
                          <input
                            type="text"
                            value={it.inspectionNotes}
                            onChange={(e) => handleItemChange(idx, { inspectionNotes: e.target.value })}
                            placeholder="حالة الصناديق والطبليات..."
                            className="w-full bg-white border rounded-lg px-2 py-1 text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات عامة على الاستلام</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="ملاحظات الحراسة، التفريغ، أو حالة الشحنة..."
                  className="w-full px-3 py-2 border rounded-xl text-xs"
                  rows={2}
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 bg-slate-100 rounded-xl text-xs font-bold text-slate-700">
                  إلغاء
                </button>
                <button type="submit" className="px-5 py-2 bg-amber-600 text-white rounded-xl text-xs font-black shadow-md shadow-amber-600/20">
                  اعتماد الاستلام وتحديث المخزون
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
};
