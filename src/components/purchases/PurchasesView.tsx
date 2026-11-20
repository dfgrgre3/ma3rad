import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { DataTable } from '../ui/DataTable';
import {
  Truck, Plus, Search,
  Sparkles,
  ChevronDown,
  Printer
} from 'lucide-react';
import { PurchaseService } from '../../services/domains/purchases/PurchaseService';
import { SupplierService } from '../../services/domains/suppliers/SupplierService';
import { ProductService } from '../../services/domains/products/ProductService';
import { InventoryService } from '../../services/domains/inventory/InventoryService';
import { ProcurementService } from '../../services/domains/procurement/ProcurementService';
import { PurchaseOrderService } from '../../services/domains/purchases/PurchaseOrderService';
import { AuthService } from '../../services/domains/auth/AuthService';
import { PermissionService } from '../../services/domains/auth/PermissionService';
import { PurchaseInvoice, Supplier, Product, Warehouse } from '../../types';
import { formatProductQuantity } from '../../utils/products/productUnits';
import { useBusinessProfileMeta, useBusinessTerm } from '../../hooks/domains/config/useBusinessTerm';
import { PurchaseInvoiceModal } from './PurchaseInvoiceModal';
import { PageHeader } from '../ui/PageHeader';
import { Button } from '../ui/Button';
import { FilterToolbar } from '../ui/FilterToolbar';
import { useToast } from '../ui/Toast';
import { PurchaseInvoiceDto } from '../../types/purchasing/components';
import { OperationalFieldService, type OperationalFieldDefinition } from '../../services/domains/products/OperationalFieldService';
import { OperationalFieldsSummary } from '../products/OperationalFieldsSummary';
import { OperationalFieldsChips } from '../products/OperationalFieldsChips';
import { OperationalFieldsRecordEditor } from '../products/OperationalFieldsRecordEditor';
import { OperationalFieldsFilter, matchesOperationalFieldFilters, type OperationalFieldFilters } from '../products/OperationalFieldsFilter';
import { PrintService } from '../../services/shared/PrintService';
import { ActivityGate } from '../ui/ActivityGate';
import { useDocElements } from '../../hooks/domains/config/useActivityUi';

const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0) + ' ج.م';

const getBoxesCount = (product: Product | undefined, quantity: number): number => {
  if (product?.productType === 'GENERAL') return product.baseUnit === 'BOX' ? quantity : 0;
  return Number((quantity / (product?.metersPerBox || 1.44)).toFixed(2));
};

export const PurchasesView: React.FC = () => {
  const purchaseDoc = useDocElements('/doc/purchase_invoice');
  const purchasingLabel = useBusinessTerm('modules.purchasing');
  const newPurchaseLabel = useBusinessTerm('actions.newPurchaseInvoice');
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
  const toast = useToast();

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
  const loadData = useCallback(() => {
    (async () => {
      try {
        const [purs, sups, prods, whs] = await Promise.all([
          purchaseService.getAllPurchasesAsync(search),
          supplierService.getAllSuppliersAsync(),
          productService.getAllProductsAsync(),
          inventoryService.getAllWarehousesAsync(),
        ]);
        setOperationalFields(fieldService.getDefinitions('purchase_invoices'));
        const fieldValues = fieldService.getRecordValuesForRecords('purchase_invoices', purs.map((purchase) => purchase.id));
        setValuesByPurchase(fieldValues);
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
    })();
  }, [search, dto, fieldFilters, fieldService, inventoryService, poService, procurementService, productService, purchaseService, supplierService]);

  useEffect(() => {
    loadData();
  }, [search, loadData]);

  const toggleDetails = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedDetails(null);
      return;
    }
    purchaseService.getPurchaseByIdAsync(id).then((det) => {
      setExpandedDetails(det);
      setExpandedId(id);
    });
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
      toast.error('فاتورة مورد مكررة', duplicateCheck.message);
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
      toast.success('تم تسجيل فاتورة الشراء', 'تم توزيع تكاليف الوصول وتحديث متوسطات التكلفة.');
    } catch (err: any) {
      toast.error('تعذر تسجيل الفاتورة', err?.message || String(err));
    }
  };

  return (
    <div className="erp-page">
      <PageHeader
        title={<>فواتير {purchasingLabel} وتكاليف الوصول (Landed Cost)</>}
        description={<>تسجيل فواتير المصانع، توزيع مصاريف النقل والتفريغ، والمطابقة مع أوامر الشراء وأذونات الاستلام · {businessProfileLabel}</>}
        icon={<Truck className="h-5 w-5" />}
        actions={
          canCreatePurchase ? (
            <ActivityGate element="new-invoice">
            <Button
              variant="primary"
              leadingIcon={<Plus className="h-4 w-4" />}
              onClick={() => { setOperationalFieldValues({}); setIsModalOpen(true); }}
            >
              {newPurchaseLabel}
            </Button>
            </ActivityGate>
          ) : undefined
        }
      />

      <FilterToolbar ariaLabel="بحث وفلاتر فواتير المشتريات" className="flex flex-col gap-3">
        <OperationalFieldsFilter fields={operationalFields} values={fieldFilters} onChange={setFieldFilters} />
        <div className="relative w-full">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--cerami-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث برقم الفاتورة، اسم المورد، أو رقم فاتورة المورد..."
            className="ui-input w-full pe-9"
          />
        </div>
      </FilterToolbar>

      <div className="ui-table-scroll">
        <DataTable
          ariaLabel="فواتير المشتريات"
          rows={purchases}
          rowKey={(inv: any) => String(inv.id)}
          isRowExpanded={(inv: any) => expandedId === inv.id && !!expandedDetails}
          renderExpandedRow={(inv: any) => (
            <div className="rounded-[var(--win-radius)] border border-[var(--win-border)] bg-[var(--win-surface)] p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-black flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-[var(--cerami-primary-readable)]" />
                  أصناف الفاتورة وتوزيع تكلفة الوصول الحقيقية (Landed Cost):
                </h4>
                <ActivityGate element="print">
                {purchaseDoc['print']?.visible !== false && (<Button
                  variant="secondary"
                  size="sm"
                  leadingIcon={<Printer className="h-3.5 w-3.5" />}
                  onClick={() => new PrintService().printPurchaseInvoice(expandedDetails)}
                >
                  طباعة الفاتورة
                </Button>)}
                </ActivityGate>
              </div>
              <DataTable
                ariaLabel="أصناف أمر الشراء وتكلفة الوصول"
                rows={expandedDetails?.items || []}
                rowKey={(it: any) => String(it.id)}
                dense
                tableClassName="border rounded-lg text-[11px]"
                columns={[
                  { key: 'product', header: 'الصنف', render: (it: any) => <span className="font-bold">{it.productName || it.product_name}</span> },
                  { key: 'qty', header: 'الكمية', render: (it: any) => <span className="font-mono">{formatProductQuantity(it.quantityM2, it)}</span> },
                  { key: 'price', header: 'سعر شراء الصنف', render: (it: any) => <span className="font-mono">{fmt(it.unitCost)}</span> },
                  {
                    key: 'share', header: <span className="font-bold text-[var(--cerami-primary-readable)]">نصيب الوحدة من النقل والمصاريف</span>,
                    render: (it: any) => {
                      const sharePerM2 = it.quantityM2 > 0 ? ((it.landedCostShare || 0) / it.quantityM2) : 0;
                      return <span className="font-mono font-bold text-[var(--cerami-primary-readable)]">+{sharePerM2.toFixed(2)} ج.م</span>;
                    },
                  },
                  {
                    key: 'effective', header: <span className="font-black text-[var(--cerami-success)]">تكلفة الوصول الحقيقية للوحدة</span>,
                    render: (it: any) => <span className="font-mono font-black text-[var(--cerami-success)]">{fmt(it.effectiveUnitCost || it.unitCost)}</span>,
                  },
                  { key: 'total', header: 'الإجمالي', render: (it: any) => <span className="font-bold">{fmt(it.totalCost)}</span> },
                ]}
              />

              {expandedDetails?.notes && (
                <div className="text-[11px] text-[var(--cerami-muted)]"><strong>ملاحظات:</strong> {expandedDetails.notes}</div>
              )}
              <OperationalFieldsSummary fields={operationalFields} values={valuesByPurchase[inv.id] || {}} />
              <OperationalFieldsRecordEditor recordLabel={inv.invoice_number} fields={operationalFields} initialValues={valuesByPurchase[inv.id] || {}} canEdit={canUpdatePurchase} onSave={(next) => {
                fieldService.setRecordValues('purchase_invoices', inv.id, next, 'update');
                setValuesByPurchase((previous) => ({ ...previous, [inv.id]: next }));
              }} />
            </div>
          )}
          expandedRowClassName="bg-[var(--cerami-surface-muted)]"
          columns={[
            { key: 'num', header: 'رقم الفاتورة', render: (inv: any) => <span className="font-mono font-bold text-[var(--cerami-primary-readable)]">{inv.invoice_number}</span> },
            { key: 'supplierNum', header: 'رقم فاتورة المورد', render: (inv: any) => <span className="font-bold">{inv.supplier_invoice_number || '—'}</span> },
            { key: 'supplier', header: 'المورد / الشركة المصنعة', render: (inv: any) => <span className="font-bold">{inv.supplierName}</span> },
            { key: 'warehouse', header: 'المخزن', render: (inv: any) => inv.warehouseName },
            { key: 'date', header: 'التاريخ', render: (inv: any) => <span className="text-[var(--cerami-muted)]">{inv.date}</span> },
            { key: 'subtotal', header: 'إجمالي البضاعة', render: (inv: any) => <span className="font-mono">{fmt(inv.subtotal)}</span> },
            {
              key: 'landed', header: 'تكاليف الوصول (Landed)',
              render: (inv: any) => {
                const landedTotal = Number(inv.landed_freight || 0) + Number(inv.landed_loading || 0) + Number(inv.landed_customs_taxes || 0) + Number(inv.landed_insurance || 0) + Number(inv.landed_other || 0) || Number(inv.shipping_cost || 0);
                return <span className="font-mono font-bold text-[var(--cerami-text-secondary)]">{landedTotal > 0 ? fmt(landedTotal) : '0 ج'}</span>;
              },
            },
            { key: 'total', header: 'الإجمالي النهائي', render: (inv: any) => <span className="font-black">{fmt(inv.total_amount)}</span> },
            ...(operationalFields.length > 0 ? [{
              key: 'activityFields', header: 'بيانات النشاط',
              render: (inv: any) => <OperationalFieldsChips fields={operationalFields} values={valuesByPurchase[inv.id]} />,
            }] : []),
            {
              key: 'paid', header: 'المسدد / المتبقي',
              render: (inv: any) => {
                const isPaid = inv.remaining_amount <= 0.01;
                return <span className={`erp-badge ${isPaid ? 'erp-badge--success' : 'erp-badge--danger'}`}>{isPaid ? 'مسدد' : `متبقي: ${fmt(inv.remaining_amount)}`}</span>;
              },
            },
            {
              key: 'matching', header: 'حالة المطابقة',
              render: (inv: any) => (
                <span className={`erp-badge ${inv.matching_status === 'PRICE_VARIANCE' || inv.matching_status === 'QTY_VARIANCE' || inv.matching_status === 'BOTH_VARIANCE' ? 'erp-badge--warning' : 'erp-badge--success'}`}>
                  {inv.matching_status === 'BOTH_VARIANCE' ? 'فروق سعر وكمية' : inv.matching_status === 'PRICE_VARIANCE' ? 'فرق سعر' : inv.matching_status === 'QTY_VARIANCE' ? 'فرق كمية' : 'مطابقة متوافقة'}
                </span>
              ),
            },
            {
              key: 'details', header: 'التفاصيل',
              render: (inv: any) => {
                const isExpanded = expandedId === inv.id;
                return (
                  <Button
                    variant="secondary"
                    size="sm"
                    iconOnly
                    onClick={() => toggleDetails(inv.id)}
                    aria-label="عرض التفاصيل"
                    aria-expanded={isExpanded}
                  >
                    <ChevronDown className={`h-3.5 w-3.5 transition ${isExpanded ? 'rotate-180' : ''}`} />
                  </Button>
                );
              },
            },
          ]}
          emptyTitle="لا توجد فواتير مشتريات مسجلة"
        />
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
