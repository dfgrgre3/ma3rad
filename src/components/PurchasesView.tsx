import React, { useState, useEffect, useMemo } from 'react';
import { 
  Truck, Plus, Search, FileText, 
  Calendar, CheckCircle, AlertCircle, Layers,
  DollarSign, Sparkles, Scale, Trash2, CheckCircle2,
  AlertTriangle, ShieldAlert, ChevronDown, PackageCheck
} from 'lucide-react';
import { PurchaseService, CreatePurchaseDTO } from '../services/PurchaseService';
import { SupplierService } from '../services/SupplierService';
import { ProductService } from '../services/ProductService';
import { InventoryService } from '../services/InventoryService';
import { ProcurementService } from '../services/ProcurementService';
import { PurchaseOrderService } from '../services/PurchaseOrderService';
import { PurchaseInvoice, Supplier, Product, Warehouse, PaymentType } from '../types';
import { CeramicMath } from '../utils/ceramicMath';
import { formatProductQuantity, getProductUnitLabel } from '../utils/productUnits';

const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0) + ' ج.م';

const getBoxesCount = (product: Product | undefined, quantity: number): number => {
  if (product?.productType === 'GENERAL') return product.baseUnit === 'BOX' ? quantity : 0;
  return Number((quantity / (product?.metersPerBox || 1.44)).toFixed(2));
};

export const PurchasesView: React.FC = () => {
  const purchaseService = useMemo(() => new PurchaseService(), []);
  const supplierService = useMemo(() => new SupplierService(), []);
  const productService = useMemo(() => new ProductService(), []);
  const inventoryService = useMemo(() => new InventoryService(), []);
  const procurementService = useMemo(() => new ProcurementService(), []);
  const poService = useMemo(() => new PurchaseOrderService(), []);

  const [purchases, setPurchases] = useState<PurchaseInvoice[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [grns, setGrns] = useState<any[]>([]);
  const [openPos, setOpenPos] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedDetails, setExpandedDetails] = useState<any | null>(null);

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [dto, setDto] = useState<{
    supplierId: string;
    supplierInvoiceNumber: string;
    warehouseId: string;
    grnId?: string;
    purchaseOrderId?: string;
    items: Array<{ productId: string; quantityM2: number; boxesCount: number; unitCost: number; orderedUnitCost?: number; grnAcceptedQty?: number }>;
    discountAmount: number;
    landedFreight: number;
    landedLoading: number;
    landedCustomsTaxes: number;
    landedInsurance: number;
    landedOther: number;
    landedAllocationMethod: 'VALUE' | 'QUANTITY' | 'WEIGHT';
    isNoNumberSupplier: boolean;
    paidAmount: number;
    paymentType: PaymentType;
    notes: string;
  }>({
    supplierId: '',
    supplierInvoiceNumber: '',
    warehouseId: 'wh_main',
    items: [{ productId: '', quantityM2: 100, boxesCount: 69.44, unitCost: 150 }],
    discountAmount: 0,
    landedFreight: 0,
    landedLoading: 0,
    landedCustomsTaxes: 0,
    landedInsurance: 0,
    landedOther: 0,
    landedAllocationMethod: 'VALUE',
    isNoNumberSupplier: false,
    paidAmount: 0,
    paymentType: 'CREDIT',
    notes: '',
  });

  const loadData = () => {
    try {
      const purs = purchaseService.getAllPurchases(search);
      const sups = supplierService.getAllSuppliers();
      const prods = productService.getAllProducts();
      const whs = inventoryService.getAllWarehouses();
      const grnList = procurementService.getAllGoodsReceipts('', 'ALL');
      const poList = poService.getAllOrders('', 'ALL').filter(p => ['SENT', 'CONFIRMED', 'PARTIAL', 'RECEIVED'].includes(p.status));

      setPurchases(purs);
      setSuppliers(sups);
      setProducts(prods);
      setWarehouses(whs);
      setGrns(grnList);
      setOpenPos(poList);

      if (sups.length > 0 && !dto.supplierId) {
        setDto(prev => ({
          ...prev,
          supplierId: sups[0].id,
          warehouseId: whs[0]?.id || 'wh_main',
          items: [{ productId: prods[0]?.id || '', quantityM2: prods[0]?.productType === 'GENERAL' ? 1 : 100, boxesCount: prods[0]?.productType === 'GENERAL' ? (prods[0]?.baseUnit === 'BOX' ? 1 : 0) : Number((100 / (prods[0]?.metersPerBox || 1.44)).toFixed(2)), unitCost: prods[0]?.costPrice || 150 }],
        }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, [search]);

  const toggleDetails = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedDetails(null);
      return;
    }
    const det = purchaseService.getPurchaseById(id);
    setExpandedDetails(det);
    setExpandedId(id);
  };

  const handleSelectGrn = (grnId: string) => {
    const grn = grns.find(g => g.id === grnId);
    if (!grn) {
      setDto(prev => ({ ...prev, grnId: undefined }));
      return;
    }
    const fullGrn = procurementService.getGoodsReceiptById(grnId);
    if (!fullGrn) return;

    setDto(prev => ({
      ...prev,
      grnId,
      supplierId: fullGrn.supplierId,
      warehouseId: fullGrn.warehouseId,
      purchaseOrderId: fullGrn.purchaseOrderId || prev.purchaseOrderId,
      items: fullGrn.items.map(it => ({
        productId: it.productId,
        quantityM2: it.acceptedQuantityM2 || it.receivedQuantityM2,
        boxesCount: getBoxesCount(
          products.find((candidate) => candidate.id === it.productId),
          it.acceptedQuantityM2 || it.receivedQuantityM2
        ),
        unitCost: it.unitCost || 120,
        grnAcceptedQty: it.acceptedQuantityM2,
      })),
      notes: `بموجب إذن استلام رقم ${fullGrn.grnNumber}`,
    }));
  };

  // Landed Cost Live Calculation
  const subtotal = dto.items.reduce((s, it) => s + (it.quantityM2 * it.unitCost), 0);
  const totalLandedExpenses = Number(dto.landedFreight || 0) + Number(dto.landedLoading || 0) +
    Number(dto.landedCustomsTaxes || 0) + Number(dto.landedInsurance || 0) + Number(dto.landedOther || 0);
  const finalTotal = Math.max(0, subtotal - Number(dto.discountAmount || 0) + totalLandedExpenses);

  // Duplicate Check
  const duplicateCheck = procurementService.validateSupplierInvoiceNumber(dto.supplierId, dto.supplierInvoiceNumber);

  const handleCreatePurchase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dto.isNoNumberSupplier && duplicateCheck.isDuplicate) {
      alert(`خطأ: ${duplicateCheck.message}`);
      return;
    }

    try {
      purchaseService.createPurchase({
        supplierId: dto.supplierId,
        supplierInvoiceNumber: dto.supplierInvoiceNumber,
        warehouseId: dto.warehouseId,
        items: dto.items,
        discountAmount: dto.discountAmount,
        shippingCost: dto.landedFreight,
        paidAmount: dto.paidAmount,
        paymentType: dto.paymentType,
        notes: dto.notes,
        performedBy: 'usr_admin',
        grnId: dto.grnId || undefined,
        purchaseOrderId: dto.purchaseOrderId || undefined,
        landedFreight: dto.landedFreight,
        landedLoading: dto.landedLoading,
        landedCustomsTaxes: dto.landedCustomsTaxes,
        landedInsurance: dto.landedInsurance,
        landedOther: dto.landedOther,
        landedAllocationMethod: dto.landedAllocationMethod,
        isNoNumberSupplier: dto.isNoNumberSupplier,
      });

      setIsModalOpen(false);
      loadData();
      alert('تم تسجيل فاتورة الشراء وتوزيع تكاليف الوصول وتحديث متوسطات التكلفة بنجاح.');
    } catch (err: any) {
      alert(`خطأ: ${err.message || err}`);
    }
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full text-slate-900 bg-slate-50" dir="rtl">
      {/* Header Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-orange-50 border border-orange-200 flex items-center justify-center">
            <Truck className="w-6 h-6 text-orange-600" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900">فواتير المشتريات وتكاليف الوصول (Landed Cost)</h2>
            <p className="text-xs text-slate-500 font-medium">تسجيل فواتير المصانع، توزيع مصاريف النقل والتفريغ، والمطابقة مع أوامر الشراء وأذونات الاستلام</p>
          </div>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl flex items-center gap-2 shadow-md shadow-orange-600/20 transition text-sm shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>فاتورة توريد / مشتريات جديدة</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="p-4 bg-white rounded-2xl border border-slate-200 flex gap-3 items-center shadow-sm">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث برقم الفاتورة، اسم المورد، أو رقم فاتورة المورد..."
            className="w-full pr-10 pl-4 py-2.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-orange-400"
          />
        </div>
      </div>

      {/* Purchases Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3.5">رقم الفاتورة</th>
                <th className="p-3.5">رقم فاتورة المورد</th>
                <th className="p-3.5">المورد / الشركة المصنعة</th>
                <th className="p-3.5">المخزن</th>
                <th className="p-3.5">التاريخ</th>
                <th className="p-3.5">إجمالي البضاعة</th>
                <th className="p-3.5">تكاليف الوصول (Landed)</th>
                <th className="p-3.5">الإجمالي النهائي</th>
                <th className="p-3.5">المسدد / المتبقي</th>
                <th className="p-3.5">حالة المطابقة</th>
                <th className="p-3.5">التفاصيل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {purchases.map((inv: any) => {
                const isPaid = inv.remaining_amount <= 0.01;
                const isExpanded = expandedId === inv.id;
                const landedTotal = Number(inv.landed_freight || 0) + Number(inv.landed_loading || 0) + Number(inv.landed_customs_taxes || 0) + Number(inv.landed_insurance || 0) + Number(inv.landed_other || 0) || Number(inv.shipping_cost || 0);

                return (
                  <React.Fragment key={inv.id}>
                    <tr className="hover:bg-slate-50/70 transition">
                      <td className="p-3.5 font-mono font-bold text-orange-600">{inv.invoice_number}</td>
                      <td className="p-3.5 font-bold text-slate-700">{inv.supplier_invoice_number || '—'}</td>
                      <td className="p-3.5 font-bold text-slate-900">{inv.supplierName}</td>
                      <td className="p-3.5 text-slate-600">{inv.warehouseName}</td>
                      <td className="p-3.5 text-slate-500">{inv.date}</td>
                      <td className="p-3.5 font-mono">{fmt(inv.subtotal)}</td>
                      <td className="p-3.5 font-mono font-bold text-indigo-700">{landedTotal > 0 ? fmt(landedTotal) : '0 ج'}</td>
                      <td className="p-3.5 font-black text-slate-900">{fmt(inv.total_amount)}</td>
                      <td className="p-3.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                          isPaid ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}>
                          {isPaid ? 'مسدد' : `متبقي: ${fmt(inv.remaining_amount)}`}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                          inv.matching_status === 'PRICE_VARIANCE' || inv.matching_status === 'QTY_VARIANCE' || inv.matching_status === 'BOTH_VARIANCE'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                          {inv.matching_status === 'BOTH_VARIANCE' ? 'فروق سعر وكمية' : inv.matching_status === 'PRICE_VARIANCE' ? 'فرق سعر' : inv.matching_status === 'QTY_VARIANCE' ? 'فرق كمية' : 'مطابقة متوافقة'}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <button
                          onClick={() => toggleDetails(inv.id)}
                          className="p-1.5 border border-slate-200 rounded-lg hover:bg-slate-100 transition"
                        >
                          <ChevronDown className={`w-3.5 h-3.5 transition ${isExpanded ? 'rotate-180' : ''}`} />
                        </button>
                      </td>
                    </tr>

                    {isExpanded && expandedDetails && (
                      <tr className="bg-slate-50/80">
                        <td colSpan={11} className="p-4">
                          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                            <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                              <Sparkles className="w-4 h-4 text-orange-600" />
                              أصناف الفاتورة وتوزيع تكلفة الوصول الحقيقية (Landed Cost):
                            </h4>
                            <table className="w-full text-right text-[11px] border rounded-lg overflow-hidden">
                              <thead className="bg-slate-50 text-slate-500 font-bold border-b">
                                <tr>
                                  <th className="p-2.5">الصنف</th>
                                  <th className="p-2.5">الكمية</th>
                                  <th className="p-2.5">سعر شراء الصنف</th>
                                  <th className="p-2.5 text-indigo-700 font-bold">نصيب الوحدة من النقل والمصاريف</th>
                                  <th className="p-2.5 text-emerald-800 font-black">تكلفة الوصول الحقيقية للوحدة</th>
                                  <th className="p-2.5">الإجمالي</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {expandedDetails.items?.map((it: any) => {
                                  const effective = it.effectiveUnitCost || it.unitCost;
                                  const sharePerM2 = it.quantityM2 > 0 ? ((it.landedCostShare || 0) / it.quantityM2) : 0;
                                  return (
                                    <tr key={it.id}>
                                      <td className="p-2.5 font-bold text-slate-900">{it.productName || it.product_name}</td>
                                      <td className="p-2.5 font-mono">{formatProductQuantity(it.quantityM2, it)}</td>
                                      <td className="p-2.5 font-mono">{fmt(it.unitCost)}</td>
                                      <td className="p-2.5 font-mono font-bold text-indigo-700">+{sharePerM2.toFixed(2)} ج.م</td>
                                      <td className="p-2.5 font-mono font-black text-emerald-700">{fmt(effective)}</td>
                                      <td className="p-2.5 font-bold">{fmt(it.totalCost)}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>

                            {expandedDetails.notes && (
                              <div className="text-[11px] text-slate-500"><strong>ملاحظات:</strong> {expandedDetails.notes}</div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {purchases.length === 0 && (
                <tr>
                  <td colSpan={11} className="p-12 text-center text-slate-400">لا توجد فواتير مشتريات مسجلة</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Create Purchase Invoice with Landed Cost & Matching */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full p-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-black text-slate-900">تسجيل فاتورة توريد / مشتريات جديدة</h3>
                <p className="text-xs text-slate-500">تحميل النقل والمصاريف الإضافية (Landed Cost) والمطابقة مع إذن الاستلام</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">✕</button>
            </div>

            <form onSubmit={handleCreatePurchase} className="mt-4 space-y-4 text-xs">
              {/* Linked GRN and PO */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-amber-50/60 border border-amber-200 rounded-xl">
                <div>
                  <label htmlFor="purchase-grn" className="font-bold text-amber-900 block mb-1">ربط بإذن استلام مخزني (GRN)</label>
                  <select
                    id="purchase-grn"
                    value={dto.grnId || ''}
                    onChange={(e) => handleSelectGrn(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white rounded-lg border border-amber-300 font-bold"
                  >
                    <option value="">-- إدخال مباشر بدون إذن استلام --</option>
                    {grns.map(g => (
                      <option key={g.id} value={g.id}>{g.grnNumber} ({g.supplierName} - {g.date})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="purchase-po" className="font-bold text-amber-900 block mb-1">أمر الشراء المرتبط (PO)</label>
                  <select
                    id="purchase-po"
                    value={dto.purchaseOrderId || ''}
                    onChange={(e) => setDto({ ...dto, purchaseOrderId: e.target.value || undefined })}
                    className="w-full px-2.5 py-1.5 bg-white rounded-lg border border-amber-300 font-bold"
                  >
                    <option value="">-- بدون ربط بأمر شراء --</option>
                    {openPos.map(po => (
                      <option key={po.id} value={po.id}>{po.orderNumber} ({po.supplierName})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="purchase-warehouse" className="font-bold text-amber-900 block mb-1">المخزن المستلم</label>
                  <select
                    id="purchase-warehouse"
                    value={dto.warehouseId}
                    onChange={(e) => setDto({ ...dto, warehouseId: e.target.value })}
                    required
                    className="w-full px-2.5 py-1.5 bg-white rounded-lg border border-amber-300 font-bold"
                  >
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Supplier & Invoice Number */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="purchase-supplier" className="font-bold text-slate-700 block mb-1">المورد / الشركة المصنعة *</label>
                  <select
                    id="purchase-supplier"
                    value={dto.supplierId}
                    onChange={(e) => setDto({ ...dto, supplierId: e.target.value })}
                    required
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold"
                  >
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="purchase-supplier-invoice-number" className="font-bold text-slate-700 block mb-1">رقم فاتورة المورد</label>
                  <input
                    id="purchase-supplier-invoice-number"
                    type="text"
                    value={dto.supplierInvoiceNumber}
                    disabled={dto.isNoNumberSupplier}
                    onChange={(e) => setDto({ ...dto, supplierInvoiceNumber: e.target.value })}
                    placeholder={dto.isNoNumberSupplier ? 'مورد بدون فواتير رسمية' : 'رقم الفاتورة المطبوعة...'}
                    className={`w-full px-3 py-2 rounded-xl border text-xs font-bold ${
                      duplicateCheck.isDuplicate && !dto.isNoNumberSupplier ? 'border-rose-400 bg-rose-50 text-rose-700' : 'bg-slate-50 border-slate-200'
                    }`}
                  />
                  {duplicateCheck.isDuplicate && !dto.isNoNumberSupplier && (
                    <span className="text-[10px] text-rose-600 block mt-1 font-bold">{duplicateCheck.message}</span>
                  )}
                </div>
                <div className="flex items-center pt-5">
                  <label htmlFor="purchase-no-number-supplier" className="flex items-center gap-2 cursor-pointer font-bold text-slate-700">
                    <input
                      id="purchase-no-number-supplier"
                      type="checkbox"
                      checked={dto.isNoNumberSupplier}
                      onChange={(e) => setDto({ ...dto, isNoNumberSupplier: e.target.checked })}
                      className="w-4 h-4 rounded text-orange-600"
                    />
                    <span>المورد لا يصدر فواتير مرقمة (تجاوز التحقق من التكرار)</span>
                  </label>
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-100 p-2.5 font-black text-slate-800 flex justify-between items-center">
                  <span>أصناف الفاتورة والكميات:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const product = products[0];
                      const quantity = product?.productType === 'GENERAL' ? 1 : 50;
                      const boxes = product?.productType === 'GENERAL'
                        ? product.baseUnit === 'BOX' ? quantity : 0
                        : Number((quantity / (product?.metersPerBox || 1.44)).toFixed(2));
                      setDto({ ...dto, items: [...dto.items, { productId: product?.id || '', quantityM2: quantity, boxesCount: boxes, unitCost: product?.costPrice || 100 }] });
                    }}
                    className="text-xs text-orange-600 hover:underline font-bold"
                  >
                    + إضافة صنف آخر
                  </button>
                </div>
                <div className="divide-y divide-slate-100 p-2">
                  {dto.items.map((it, idx) => {
                    const selectedProduct = products.find((product) => product.id === it.productId);
                    return <div key={idx} className="flex gap-2 items-center py-2">
                      <select
                        value={it.productId}
                        onChange={(e) => {
                          const p = products.find(x => x.id === e.target.value);
                          const items = [...dto.items];
                          items[idx].productId = e.target.value;
                          if (p) {
                            items[idx].unitCost = p.costPrice;
                            items[idx].quantityM2 = p.productType === 'GENERAL' ? 1 : 50;
                            items[idx].boxesCount = p.productType === 'GENERAL'
                              ? p.baseUnit === 'BOX' ? 1 : 0
                              : Number((50 / (p.metersPerBox || 1.44)).toFixed(2));
                          }
                          setDto({ ...dto, items });
                        }}
                        className="flex-1 px-2.5 py-1.5 border rounded-lg bg-slate-50 font-bold"
                      >
                        {products.map(p => (
                          <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                        ))}
                      </select>
                      <div className="w-24">
                        <input
                          type="number"
                          step="0.01"
                          placeholder={`الكمية ${selectedProduct ? getProductUnitLabel(selectedProduct) : 'م²'}`}
                          value={it.quantityM2}
                          onChange={(e) => {
                            const items = [...dto.items];
                            items[idx].quantityM2 = Number(e.target.value);
                            const product = products.find((candidate) => candidate.id === items[idx].productId);
                            items[idx].boxesCount = product?.productType === 'GENERAL'
                              ? product.baseUnit === 'BOX' ? Number(e.target.value) : 0
                              : Number((Number(e.target.value) / (product?.metersPerBox || 1.44)).toFixed(2));
                            setDto({ ...dto, items });
                          }}
                          className="w-full px-2 py-1.5 border rounded-lg text-center font-bold"
                        />
                      </div>
                      <div className="w-24">
                        <input
                          type="number"
                          step="0.01"
                          placeholder={`سعر الشراء / ${selectedProduct ? getProductUnitLabel(selectedProduct) : 'وحدة'}`}
                          value={it.unitCost}
                          onChange={(e) => {
                            const items = [...dto.items];
                            items[idx].unitCost = Number(e.target.value);
                            setDto({ ...dto, items });
                          }}
                          className="w-full px-2 py-1.5 border rounded-lg text-center font-bold text-orange-600"
                        />
                      </div>
                      <div className="w-28 text-left font-black text-slate-800">
                        {fmt(it.quantityM2 * it.unitCost)}
                      </div>
                      {dto.items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setDto({ ...dto, items: dto.items.filter((_, i) => i !== idx) })}
                          className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>;
                  })}
                </div>
              </div>

              {/* Landed Cost Breakdown Box */}
              <div className="p-4 bg-indigo-50/60 border border-indigo-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-black text-indigo-950 flex items-center gap-1.5">
                    <Scale className="w-4 h-4 text-indigo-600" />
                    مصاريف وتكاليف الوصول الإضافية (Landed Cost):
                  </h4>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-indigo-900">طريقة توزيع التكلفة:</span>
                    <select
                      value={dto.landedAllocationMethod}
                      onChange={(e) => setDto({ ...dto, landedAllocationMethod: e.target.value as any })}
                      className="px-2 py-1 bg-white border border-indigo-300 rounded-lg font-bold text-xs"
                    >
                      <option value="VALUE">حسب القيمة المالية للبند</option>
                      <option value="QUANTITY">حسب المساحة بالمتر المربع (م²)</option>
                      <option value="WEIGHT">حسب الوزن التقديري للبضاعة</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <div>
                    <label htmlFor="purchase-landed-freight" className="block text-[11px] text-indigo-900 font-bold mb-0.5">النقل والشحن (ج)</label>
                    <input
                      id="purchase-landed-freight"
                      type="number"
                      step="0.01"
                      value={dto.landedFreight || ''}
                      onChange={(e) => setDto({ ...dto, landedFreight: Number(e.target.value) || 0 })}
                      placeholder="0"
                      className="w-full px-2 py-1.5 bg-white border rounded-lg text-center font-bold"
                    />
                  </div>
                  <div>
                    <label htmlFor="purchase-landed-loading" className="block text-[11px] text-indigo-900 font-bold mb-0.5">العتالة والتفريغ (ج)</label>
                    <input
                      id="purchase-landed-loading"
                      type="number"
                      step="0.01"
                      value={dto.landedLoading || ''}
                      onChange={(e) => setDto({ ...dto, landedLoading: Number(e.target.value) || 0 })}
                      placeholder="0"
                      className="w-full px-2 py-1.5 bg-white border rounded-lg text-center font-bold"
                    />
                  </div>
                  <div>
                    <label htmlFor="purchase-landed-customs-taxes" className="block text-[11px] text-indigo-900 font-bold mb-0.5">جمارك ورسوم (ج)</label>
                    <input
                      id="purchase-landed-customs-taxes"
                      type="number"
                      step="0.01"
                      value={dto.landedCustomsTaxes || ''}
                      onChange={(e) => setDto({ ...dto, landedCustomsTaxes: Number(e.target.value) || 0 })}
                      placeholder="0"
                      className="w-full px-2 py-1.5 bg-white border rounded-lg text-center font-bold"
                    />
                  </div>
                  <div>
                    <label htmlFor="purchase-landed-insurance" className="block text-[11px] text-indigo-900 font-bold mb-0.5">التأمين (ج)</label>
                    <input
                      id="purchase-landed-insurance"
                      type="number"
                      step="0.01"
                      value={dto.landedInsurance || ''}
                      onChange={(e) => setDto({ ...dto, landedInsurance: Number(e.target.value) || 0 })}
                      placeholder="0"
                      className="w-full px-2 py-1.5 bg-white border rounded-lg text-center font-bold"
                    />
                  </div>
                  <div>
                    <label htmlFor="purchase-landed-other" className="block text-[11px] text-indigo-900 font-bold mb-0.5">أخرى (ج)</label>
                    <input
                      id="purchase-landed-other"
                      type="number"
                      step="0.01"
                      value={dto.landedOther || ''}
                      onChange={(e) => setDto({ ...dto, landedOther: Number(e.target.value) || 0 })}
                      placeholder="0"
                      className="w-full px-2 py-1.5 bg-white border rounded-lg text-center font-bold"
                    />
                  </div>
                </div>

                <div className="flex justify-between items-center text-xs font-bold text-indigo-900 pt-1 border-t border-indigo-200">
                  <span>إجمالي مصاريف الوصول المحملة: <strong>{fmt(totalLandedExpenses)}</strong></span>
                </div>
              </div>

              {/* Payment & Totals */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-100 rounded-xl">
                <div>
                  <label htmlFor="purchase-discount-amount" className="font-bold text-slate-700 block mb-1">الخصم المكتسب (ج.م)</label>
                  <input
                    id="purchase-discount-amount"
                    type="number"
                    value={dto.discountAmount || ''}
                    onChange={(e) => setDto({ ...dto, discountAmount: Number(e.target.value) || 0 })}
                    placeholder="0"
                    className="w-full px-3 py-1.5 bg-white rounded-lg border font-bold"
                  />
                </div>
                <div>
                  <label htmlFor="purchase-paid-amount" className="font-bold text-slate-700 block mb-1">المبلغ المسدد نقداً فوراً (ج.م)</label>
                  <input
                    id="purchase-paid-amount"
                    type="number"
                    value={dto.paidAmount}
                    onChange={(e) => setDto({ ...dto, paidAmount: Number(e.target.value) || 0 })}
                    className="w-full px-3 py-1.5 bg-white rounded-lg border font-bold text-emerald-700"
                  />
                </div>
                <div>
                  <label htmlFor="purchase-payment-type" className="font-bold text-slate-700 block mb-1">طريقة السداد</label>
                  <select
                    id="purchase-payment-type"
                    value={dto.paymentType}
                    onChange={(e) => setDto({ ...dto, paymentType: e.target.value as PaymentType })}
                    className="w-full px-3 py-1.5 bg-white rounded-lg border font-bold"
                  >
                    <option value="CREDIT">آجل بالكامل (على الحساب)</option>
                    <option value="CASH">نقدي كاش (من الخزينة)</option>
                    <option value="BANK_TRANSFER">تحويل بنكي / شيك</option>
                  </select>
                </div>
              </div>

              {/* Grand Total Summary */}
              <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl flex items-center justify-between text-xs font-bold">
                <div>
                  <span>قيمة البضاعة: {fmt(subtotal)} + تكاليف الوصول: {fmt(totalLandedExpenses)}</span>
                  <div className="text-orange-950 text-sm font-black mt-0.5">الإجمالي النهائي للفاتورة: {fmt(finalTotal)}</div>
                </div>
                <div className="text-left font-black">
                  <span className="text-rose-700">المتبقي كدين على المعرض: {fmt(Math.max(0, finalTotal - dto.paidAmount))}</span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={duplicateCheck.isDuplicate && !dto.isNoNumberSupplier}
                  className="px-5 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-black rounded-xl shadow-md shadow-orange-600/20"
                >
                  حفظ الفاتورة وتثبيت تكاليف الوصول
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
