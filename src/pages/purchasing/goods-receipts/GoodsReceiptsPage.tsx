import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { ActivityGate } from '../../../components/ui/ActivityGate';
import { PageHeader } from '../../../components/ui/PageHeader';
import { useBusinessTerm } from '../../../hooks/domains/config/useBusinessTerm';
import {
  PackageCheck, Plus, Search, CheckCircle2,
  AlertTriangle, ShieldAlert, ChevronDown, X,
  Clock, Sparkles
} from 'lucide-react';
import {
  ProcurementService, GoodsReceiptRow, GoodsReceiptItem
} from '../../../services/domains/procurement/ProcurementService';
import { PurchaseOrderService } from '../../../services/domains/purchases/PurchaseOrderService';
import { SupplierService } from '../../../services/domains/suppliers/SupplierService';
import { OperationsService } from '../../../services/domains/operations/OperationsService';
import { ProductService } from '../../../services/domains/products/ProductService';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { useToast } from '../../../components/ui/Toast';
import { ProductPicker } from '../../../components/products/ProductPicker';
import { useNavigate } from 'react-router-dom';
import type { Supplier, Product } from '../../../types';
import { formatProductQuantity, getProductUnitLabel } from '../../../utils/products/productUnits';

const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0);

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  ACCEPTED: { label: 'استلام مطابق بالكامل', color: 'bg-success-soft text-success border-success-border', icon: CheckCircle2 },
  ACCEPTED_WITH_REMARKS: { label: 'استلام به عيوب/نقص', color: 'bg-warning-soft text-warning border-warning-border', icon: AlertTriangle },
  REJECTED: { label: 'مرفوض كلياً', color: 'bg-danger-soft text-danger border-danger-border', icon: ShieldAlert },
  PENDING_INSPECTION: { label: 'قيد الفحص المخزني', color: 'bg-accent-soft text-primary border-accent-border', icon: Clock },
};

export const GoodsReceiptsPage: React.FC = () => {
  const newReceiptLabel = useBusinessTerm('actions.newGoodsReceipt');
  const service = useMemo(() => new ProcurementService(), []);
  const poService = useMemo(() => new PurchaseOrderService(), []);
  const toast = useToast();
  const navigate = useNavigate();
  const canCreate = PermissionService.can(AuthService.getCurrentUser(), 'ui.purchases.receipts.create');
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

  const loadData = useCallback(() => {
    setLoading(true);
    (async () => {
      try {
        const rows = await service.getAllGoodsReceiptsAsync(search, statusFilter);
        setReceipts(rows);
      } catch (e: any) {
        toast.error(e?.message || 'تعذر تحميل أذونات الاستلام.');
      } finally {
        setLoading(false);
      }
    })();
  }, [search, statusFilter, service, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleDetails = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedDetails(null);
      return;
    }
    service.getGoodsReceiptByIdAsync(id).then((details) => {
      setExpandedDetails(details);
      setExpandedId(id);
    }).catch((e: any) => toast.error(e?.message));
  };

  const openNewReceiptModal = () => {
    (async () => {
      try {
        const [sups, prods] = await Promise.all([
          new SupplierService().getAllSuppliersAsync(),
          new ProductService().getAllProductsAsync(),
        ]);
        const whs = new OperationsService().getWarehouses();
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
    })();
  };

  const handleSelectPo = (poId: string) => {
    setSelectedPoId(poId);
    if (!poId) return;
    poService.getOrderByIdAsync(poId).then((po) => {
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
    });
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
    <div className="h-full flex flex-col bg-surface-muted text-ink overflow-hidden">
      {/* Header */}
      <div className="bg-surface px-6 pt-4">
        <PageHeader
          icon={<PackageCheck className="w-5 h-5" />}
          title="إذن استلام مخزني وفحص الجودة والدفعة (GRN)"
          description="استلام مستقل عن فاتورة المورد، فحص الشيد والكاليبر، حصر التالف والعجز وزيادة رصيد المخزن"
          actions={canCreate && (
            <ActivityGate element="new-receipt"><button
              onClick={openNewReceiptModal}
              className="flex items-center gap-2 px-4 py-2.5 bg-warning hover:bg-warning text-white rounded-xl text-sm font-bold shadow-md shadow-warning/20 transition shrink-0"
            >
              <Plus className="w-4 h-4" /> {newReceiptLabel}
            </button></ActivityGate>
          )}
        />
      </div>

      {/* Filter bar */}
      <div className="p-4 bg-surface border-b border-line flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث برقم إذن الاستلام، المورد، رقم إذن التسليم، أو أمر الشراء..."
            className="w-full pl-4 pr-10 py-2.5 bg-surface border border-line rounded-xl text-sm focus:outline-none focus:border-warning"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2.5 bg-surface-muted border border-line rounded-xl text-xs font-bold"
        >
          <option value="ALL">جميع حالات الفحص</option>
          <option value="ACCEPTED">مطابق بالكامل</option>
          <option value="ACCEPTED_WITH_REMARKS">به عيوب أو نقص</option>
          <option value="REJECTED">مرفوض</option>
          <option value="PENDING_INSPECTION">قيد الفحص</option>
        </select>
        <button onClick={loadData} className="px-4 py-2.5 border border-line rounded-xl text-xs font-bold bg-surface-muted hover:bg-surface-sunken">
          تحديث
        </button>
      </div>

      {/* Receipts List */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {receipts.map((r) => {
          const cfg = STATUS_CONFIG[r.status] || { label: r.status, color: 'bg-surface-sunken', icon: CheckCircle2 };
          const Icon = cfg.icon;
          const isExpanded = expandedId === r.id;

          return (
            <article key={r.id} className="bg-surface border border-line rounded-2xl overflow-hidden shadow-sm hover:border-line-strong transition">
              <div className="p-5 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-surface-muted border border-line flex items-center justify-center font-black text-xs text-ink">
                    GRN
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-base text-ink">{r.grnNumber}</span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border flex items-center gap-1 ${cfg.color}`}>
                        <Icon className="w-3 h-3" /> {cfg.label}
                      </span>
                    </div>
                    <div className="text-xs text-muted mt-1 flex flex-wrap gap-x-4 gap-y-1">
                      <span>المورد: <strong className="text-ink">{r.supplierName}</strong></span>
                      <span>المخزن: <strong className="text-ink">{r.warehouseName}</strong></span>
                      <span>تاريخ الاستلام: <strong>{r.date}</strong></span>
                      {r.orderNumber && <span>أمر الشراء: <strong className="text-warning">{r.orderNumber}</strong></span>}
                      {r.deliveryNoteNumber && <span>رقم إذن التسليم: <strong>{r.deliveryNoteNumber}</strong></span>}
                    </div>
                  </div>
                </div>

                {/* Totals & inspection breakdown */}
                <div className="flex items-center gap-3">
                  <div className="text-left bg-surface-muted p-2.5 rounded-xl border border-line text-xs">
                    <div className="text-muted">المستلم: <strong className="text-ink">{formatReceiptTotals(r, 'totalReceived')}</strong></div>
                    <div className="text-success font-bold">المقبول السليم: <strong>{formatReceiptTotals(r, 'totalAccepted')}</strong></div>
                    {(r.totalDamagedM2 > 0 || r.totalShortageM2 > 0) && (
                      <div className="text-danger font-black">تالف: {formatReceiptTotals(r, 'totalDamaged')} · عجز: {formatReceiptTotals(r, 'totalShortage')}</div>
                    )}
                  </div>
                  <button
                    onClick={() => toggleDetails(r.id)}
                    className="p-2 border border-line rounded-xl text-ink-secondary hover:bg-surface-muted transition"
                  >
                    <ChevronDown className={`w-4 h-4 transition ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Expanded details */}
              {isExpanded && expandedDetails && (
                <div className="border-t border-line bg-surface-muted/70 p-5">
                  <h4 className="text-xs font-black text-ink mb-3 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-warning" /> تقرير الفحص المخزني وتفاصيل الدفعات والتشغيلات:
                  </h4>
                  <div className="overflow-x-auto bg-surface border border-line rounded-xl">
                    <DataTable
                      ariaLabel="أصناف إذن الاستلام"
                      rows={expandedDetails.items}
                      rowKey={(it: any) => String(it.id)}
                      dense
                      tableClassName="text-xs"
                      rowClassName={() => 'transition hover:bg-surface-muted'}
                      columns={[
                        { key: 'product', header: 'الصنف', render: (it: any) => <span className="font-bold text-ink">{it.productName}</span> },
                        { key: 'lot', header: 'رقم التشغيلة (Lot)', render: (it: any) => <span className="font-mono font-bold text-ink">{it.batchNumber || '—'}</span> },
                        { key: 'tone', header: 'الشيد (Tone)', render: (it: any) => <span className="font-bold text-primary">{it.toneShade || 'STD'}</span> },
                        { key: 'cal', header: 'الكاليبر', render: (it: any) => <span className="font-bold text-ink">{it.caliber || '0'}</span> },
                        { key: 'grade', header: 'الفرز', render: (it: any) => <span>{it.grade}</span> },
                        { key: 'recv', header: 'المستلم', render: (it: any) => <span className="font-semibold">{formatProductQuantity(Number(it.receivedQuantityM2), it)}</span> },
                        { key: 'ok', header: 'السليم (المقبول)', render: (it: any) => <span className="font-black text-success">{formatProductQuantity(Number(it.acceptedQuantityM2), it)}</span> },
                        { key: 'dmg', header: 'التالف', render: (it: any) => <span className="font-bold text-danger">{it.damagedQuantityM2 > 0 ? formatProductQuantity(Number(it.damagedQuantityM2), it) : '—'}</span> },
                        { key: 'short', header: 'العجز', render: (it: any) => <span className="font-bold text-warning">{it.shortageQuantityM2 > 0 ? formatProductQuantity(Number(it.shortageQuantityM2), it) : '—'}</span> },
                        { key: 'notes', header: 'ملاحظات الفحص', render: (it: any) => <span className="text-muted">{it.inspectionNotes || '—'}</span> },
                      ]}
                    />
                  </div>

                  {/* Claim Button if defects */}
                  {(expandedDetails.totalDamagedM2 > 0 || expandedDetails.totalShortageM2 > 0) && (
                    <div className="mt-4 flex items-center justify-between p-3 bg-danger-soft border border-danger-border rounded-xl text-xs">
                      <div className="text-danger font-bold flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-danger" />
                        يوجد كسر/تلف أو عجز توريد موثق في هذا الإذن. يمكنك رفع مطالبة رسمية لخصم القيمة من رصيد المورد.
                      </div>
                      <button
                        onClick={() => navigate('/purchases/claims')}
                        className="px-3 py-1.5 bg-danger hover:bg-danger text-white rounded-lg font-bold shadow-sm"
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
          <div className="p-16 text-center text-muted border border-dashed border-line rounded-2xl">
            لا توجد أذونات استلام مخزني مسجلة مطابقة للبحث
          </div>
        )}
      </div>

      {/* Modal: Create GRN */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-center justify-center p-4">
          <section className="bg-surface rounded-2xl shadow-2xl max-w-4xl w-full p-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-line">
              <div>
                <h2 className="text-base font-black text-ink">إذن استلام مخزني وفحص جودة (GRN)</h2>
                <p className="text-xs text-muted">فحص وتوريد بضاعة السيراميك لمخازن المعرض وتوثيق الشيد واللوت</p>
              </div>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-surface-sunken"><X className="w-5 h-5 text-muted" /></button>
            </div>

            <form onSubmit={handleCreateReceipt} className="mt-4 space-y-4">
              {/* Linked PO & Supplier */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="grn-po" className="block text-xs font-bold text-ink mb-1">ربط بأمر شراء مفتوح (اختياري)</label>
                  <select
                    id="grn-po"
                    value={selectedPoId}
                    onChange={(e) => handleSelectPo(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl text-xs font-bold bg-surface"
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
                  <label htmlFor="grn-supplier" className="block text-xs font-bold text-ink mb-1">المورد / المصنع</label>
                  <select
                    id="grn-supplier"
                    value={selectedSupplierId}
                    onChange={(e) => setSelectedSupplierId(e.target.value)}
                    required
                    disabled={Boolean(selectedPoId)}
                    className="w-full px-3 py-2 border rounded-xl text-xs font-bold bg-surface"
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="grn-warehouse" className="block text-xs font-bold text-ink mb-1">المخزن المستلم للبضاعة</label>
                  <select
                    id="grn-warehouse"
                    value={selectedWarehouseId}
                    onChange={(e) => setSelectedWarehouseId(e.target.value)}
                    required
                    className="w-full px-3 py-2 border rounded-xl text-xs font-bold bg-surface"
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
                  <label htmlFor="grn-delivery-note" className="block text-xs font-bold text-ink mb-1">رقم إذن تسليم / بوليصة المورد</label>
                  <input
                    id="grn-delivery-note"
                    type="text"
                    value={deliveryNoteNumber}
                    onChange={(e) => setDeliveryNoteNumber(e.target.value)}
                    placeholder="رقم بوليصة الشحن..."
                    className="w-full px-3 py-2 border rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label htmlFor="grn-vehicle-number" className="block text-xs font-bold text-ink mb-1">رقم سيارة التوريد</label>
                  <input
                    id="grn-vehicle-number"
                    type="text"
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value)}
                    placeholder="أ ب ج 1234"
                    className="w-full px-3 py-2 border rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label htmlFor="grn-driver-name" className="block text-xs font-bold text-ink mb-1">اسم السائق الموصل</label>
                  <input
                    id="grn-driver-name"
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
                  <div className="text-xs font-black text-ink">الأصناف وفحص الجودة والدفعة:</div>
                  {!selectedPoId && (
                    <button type="button" onClick={handleAddItem} className="text-xs text-warning font-bold hover:underline">
                      + إضافة صنف
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  {items.map((it, idx) => (
                    <div key={idx} className="p-3 bg-surface-muted border border-line rounded-xl space-y-2 text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                        <div className="sm:col-span-4">
                          <label htmlFor={`grn-item-${idx}-product`} className="block text-[10px] text-muted font-bold mb-0.5">الصنف</label>
                          <ProductPicker
                            id={`grn-item-${idx}-product`}
                            value={it.productId}
                            selectedLabel={it.productName || products.find((product) => product.id === it.productId)?.name}
                            ariaLabel={`استعراض أصناف إذن الاستلام للسطر ${idx + 1}`}
                            onChange={(productId, product) => {
                              handleItemChange(idx, { productId, productName: product.name, grade: product.grade || '' });
                            }}
                            disabled={Boolean(selectedPoId)}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label htmlFor={`grn-item-${idx}-received`} className="block text-[10px] text-muted font-bold mb-0.5">المستلم ({unitForProduct(it.productId)})</label>
                          <input
                            id={`grn-item-${idx}-received`}
                            type="number"
                            step="0.01"
                            value={it.receivedQuantityM2}
                            onChange={(e) => handleItemChange(idx, { receivedQuantityM2: Number(e.target.value) })}
                            className="w-full bg-surface border rounded-lg px-2 py-1.5 text-center font-bold"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label htmlFor={`grn-item-${idx}-damaged`} className="block text-[10px] text-danger font-bold mb-0.5">التالف/مكسور ({unitForProduct(it.productId)})</label>
                          <input
                            id={`grn-item-${idx}-damaged`}
                            type="number"
                            step="0.01"
                            value={it.damagedQuantityM2}
                            onChange={(e) => handleItemChange(idx, { damagedQuantityM2: Number(e.target.value) })}
                            className="w-full bg-surface border rounded-lg px-2 py-1.5 text-center font-bold text-danger"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label htmlFor={`grn-item-${idx}-shortage`} className="block text-[10px] text-warning font-bold mb-0.5">العجز/نقص ({unitForProduct(it.productId)})</label>
                          <input
                            id={`grn-item-${idx}-shortage`}
                            type="number"
                            step="0.01"
                            value={it.shortageQuantityM2}
                            onChange={(e) => handleItemChange(idx, { shortageQuantityM2: Number(e.target.value) })}
                            className="w-full bg-surface border rounded-lg px-2 py-1.5 text-center font-bold text-warning"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <div className="block text-[10px] text-success font-bold mb-0.5">السليم (المضاف للمخزن)</div>
                          <div className="w-full py-1.5 px-2 bg-success-soft border border-success-border rounded-lg text-center font-black text-success">
                            {formatProductQuantity(it.acceptedQuantityM2, products.find((product) => product.id === it.productId) || { productType: 'CERAMIC' })}
                          </div>
                        </div>
                      </div>

                      {/* Batch & Shade info */}
                      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-1 border-t border-line">
                        <div>
                          <label htmlFor={`grn-item-${idx}-batch`} className="block text-[10px] text-muted">رقم التشغيلة / اللوت</label>
                          <input
                            id={`grn-item-${idx}-batch`}
                            type="text"
                            value={it.batchNumber}
                            onChange={(e) => handleItemChange(idx, { batchNumber: e.target.value })}
                            className="w-full bg-surface border rounded-lg px-2 py-1 text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label htmlFor={`grn-item-${idx}-tone`} className="block text-[10px] text-muted">الشيد / درجة اللون (Tone)</label>
                          <input
                            id={`grn-item-${idx}-tone`}
                            type="text"
                            value={it.toneShade}
                            onChange={(e) => handleItemChange(idx, { toneShade: e.target.value })}
                            className="w-full bg-surface border rounded-lg px-2 py-1 text-xs font-bold"
                          />
                        </div>
                        <div>
                          <label htmlFor={`grn-item-${idx}-caliber`} className="block text-[10px] text-muted">الكاليبر (المقاس)</label>
                          <input
                            id={`grn-item-${idx}-caliber`}
                            type="text"
                            value={it.caliber}
                            onChange={(e) => handleItemChange(idx, { caliber: e.target.value })}
                            className="w-full bg-surface border rounded-lg px-2 py-1 text-xs"
                          />
                        </div>
                        <div>
                          <label htmlFor={`grn-item-${idx}-grade`} className="block text-[10px] text-muted">الفرز / الدرجة</label>
                          <input
                            id={`grn-item-${idx}-grade`}
                            type="text"
                            value={it.grade}
                            onChange={(e) => handleItemChange(idx, { grade: e.target.value })}
                            placeholder="GRADE_1"
                            className="w-full bg-surface border rounded-lg px-2 py-1 text-xs font-bold"
                          />
                        </div>
                        <div>
                          <label htmlFor={`grn-item-${idx}-inspection-note`} className="block text-[10px] text-muted">ملاحظات الفحص</label>
                          <input
                            id={`grn-item-${idx}-inspection-note`}
                            type="text"
                            value={it.inspectionNotes}
                            onChange={(e) => handleItemChange(idx, { inspectionNotes: e.target.value })}
                            placeholder="حالة الصناديق والطبليات..."
                            className="w-full bg-surface border rounded-lg px-2 py-1 text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="grn-notes" className="block text-xs font-bold text-ink mb-1">ملاحظات عامة على الاستلام</label>
                <textarea
                  id="grn-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="ملاحظات الحراسة، التفريغ، أو حالة الشحنة..."
                  className="w-full px-3 py-2 border rounded-xl text-xs"
                  rows={2}
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-line">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 bg-surface-sunken rounded-xl text-xs font-bold text-ink">
                  إلغاء
                </button>
                <button type="submit" className="px-5 py-2 bg-warning text-white rounded-xl text-xs font-black shadow-md shadow-warning/20">
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
