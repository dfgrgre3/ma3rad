import React, { useState, useEffect, useMemo } from 'react';
import { 
  Truck, Plus, Search, FileText, 
  Calendar, CheckCircle, AlertCircle, Layers,
  DollarSign, Sparkles, CheckCircle2,
  AlertTriangle, ShieldAlert, ChevronDown, PackageCheck
} from 'lucide-react';
import { PurchaseService, CreatePurchaseDTO } from '../../services/purchases/PurchaseService';
import { SupplierService } from '../../services/suppliers/SupplierService';
import { ProductService } from '../../services/products/ProductService';
import { InventoryService } from '../../services/inventory/InventoryService';
import { ProcurementService } from '../../services/procurement/ProcurementService';
import { PurchaseOrderService } from '../../services/purchases/PurchaseOrderService';
import { AuthService } from '../../services/auth/AuthService';
import { PermissionService } from '../../services/auth/PermissionService';
import { PurchaseInvoice, Supplier, Product, Warehouse } from '../../types';
import { CeramicMath } from '../../utils/products/ceramicMath';
import { formatProductQuantity } from '../../utils/products/productUnits';
import { useBusinessProfileMeta, useBusinessTerm } from '../../hooks/config/useBusinessTerm';
import { PurchaseInvoiceModal } from './PurchaseInvoiceModal';
import { PurchaseInvoiceDto } from '../../types/purchasing/components';
import { OperationalFieldService, type OperationalFieldDefinition } from '../../services/products/OperationalFieldService';
import { OperationalFieldsForm } from '../products/OperationalFieldsForm';
import { OperationalFieldsSummary } from '../products/OperationalFieldsSummary';
import { OperationalFieldsRecordEditor } from '../products/OperationalFieldsRecordEditor';
import { OperationalFieldsFilter, matchesOperationalFieldFilters, type OperationalFieldFilters } from '../products/OperationalFieldsFilter';

const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0) + ' ج.م';

const getBoxesCount = (product: Product | undefined, quantity: number): number => {
  if (product?.productType === 'GENERAL') return product.baseUnit === 'BOX' ? quantity : 0;
  return Number((quantity / (product?.metersPerBox || 1.44)).toFixed(2));
};

export const PurchasesView: React.FC = () => {
  const purchasingLabel = useBusinessTerm('modules.purchasing');
  const { label: businessProfileLabel } = useBusinessProfileMeta();
  const purchaseService = useMemo(() => new PurchaseService(), []);
  const supplierService = useMemo(() => new SupplierService(), []);
  const productService = useMemo(() => new ProductService(), []);
  const inventoryService = useMemo(() => new InventoryService(), []);
  const procurementService = useMemo(() => new ProcurementService(), []);
  const poService = useMemo(() => new PurchaseOrderService(), []);
  const fieldService = useMemo(() => new OperationalFieldService(), []);
  const currentUser = AuthService.getCurrentUser();
  const canCreatePurchase = PermissionService.can(currentUser, 'ui.purchases.invoices.create');
  const canUpdatePurchase = PermissionService.can(currentUser, 'ui.purchases.invoices.update');

  const [purchases, setPurchases] = useState<PurchaseInvoice[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [grns, setGrns] = useState<any[]>([]);
  const [openPos, setOpenPos] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedDetails, setExpandedDetails] = useState<any | null>(null);
  const [operationalFields, setOperationalFields] = useState<OperationalFieldDefinition[]>([]);
  const [operationalFieldValues, setOperationalFieldValues] = useState<Record<string, string>>({});
  const [valuesByPurchase, setValuesByPurchase] = useState<Record<string, Record<string, string>>>({});
  const [fieldFilters, setFieldFilters] = useState<OperationalFieldFilters>({});

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [dto, setDto] = useState<PurchaseInvoiceDto>({
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
      setOperationalFields(fieldService.getDefinitions('purchase_invoices'));
      const fieldValues = fieldService.getRecordValuesForRecords('purchase_invoices', purs.map((purchase) => purchase.id));
      setValuesByPurchase(fieldValues);
      const sups = supplierService.getAllSuppliers();
      const prods = productService.getAllProducts();
      const whs = inventoryService.getAllWarehouses();
      const grnList = procurementService.getAllGoodsReceipts('', 'ALL');
      const poList = poService.getAllOrders('', 'ALL').filter(p => ['SENT', 'CONFIRMED', 'PARTIAL', 'RECEIVED'].includes(p.status));

      setPurchases(purs.filter((purchase) => matchesOperationalFieldFilters(purchase.id, fieldValues, fieldFilters)));
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
      fieldService.validateRecordValues('purchase_invoices', operationalFieldValues, 'create');
      const created = purchaseService.createPurchase({
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

      fieldService.setRecordValues('purchase_invoices', created.id, operationalFieldValues, 'create');
      setIsModalOpen(false);
      setOperationalFieldValues({});
      loadData();
      alert('تم تسجيل فاتورة الشراء وتوزيع تكاليف الوصول وتحديث متوسطات التكلفة بنجاح.');
    } catch (err: any) {
      alert(`خطأ: ${err.message || err}`);
    }
  };

  return (
    <div className="erp-page text-slate-900" dir="rtl">
      {/* Header Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-orange-50 border border-orange-200 flex items-center justify-center">
            <Truck className="w-6 h-6 text-orange-600" />
          </div>
          <OperationalFieldsFilter fields={operationalFields} values={fieldFilters} onChange={setFieldFilters} />
          <div>
            <h2 className="text-lg font-black text-slate-900">
              فواتير {purchasingLabel} وتكاليف الوصول (Landed Cost)
              <span className="ml-2 text-sm font-bold text-sky-700">· {businessProfileLabel}</span>
            </h2>
            <p className="text-xs text-slate-500 font-medium">تسجيل فواتير المصانع، توزيع مصاريف النقل والتفريغ، والمطابقة مع أوامر الشراء وأذونات الاستلام</p>
          </div>
        </div>

        {canCreatePurchase && <button
          onClick={() => { setOperationalFieldValues({}); setIsModalOpen(true); }}
          className="px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl flex items-center gap-2 shadow-md shadow-orange-600/20 transition text-sm shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>فاتورة توريد / مشتريات جديدة</span>
        </button>}
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
                            <OperationalFieldsSummary fields={operationalFields} values={valuesByPurchase[inv.id] || {}} />
                            <OperationalFieldsRecordEditor recordLabel={inv.invoiceNumber} fields={operationalFields} initialValues={valuesByPurchase[inv.id] || {}} canEdit={canUpdatePurchase} onSave={(next) => {
                              fieldService.setRecordValues('purchase_invoices', inv.id, next, 'update');
                              setValuesByPurchase((previous) => ({ ...previous, [inv.id]: next }));
                            }} />
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
      {isModalOpen && canCreatePurchase && (
        <PurchaseInvoiceModal
          dto={dto}
          setDto={setDto}
          suppliers={suppliers}
          products={products}
          warehouses={warehouses}
          grns={grns}
          openPos={openPos}
          onSelectGrn={handleSelectGrn}
          duplicateCheck={duplicateCheck}
          subtotal={subtotal}
          totalLandedExpenses={totalLandedExpenses}
          finalTotal={finalTotal}
          canCreate={canCreatePurchase}
          onClose={() => setIsModalOpen(false)}
          onSubmit={handleCreatePurchase}
          operationalFields={operationalFields}
          operationalFieldValues={operationalFieldValues}
          onOperationalFieldValuesChange={setOperationalFieldValues}
        />
      )}
    </div>
  );
};
