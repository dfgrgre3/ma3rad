import React, { useEffect, useMemo, useState } from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { PageHeader } from '../../../components/ui/PageHeader';
import { useBusinessTerm } from '../../../hooks/domains/config/useBusinessTerm';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, ChevronRight, FileText, Plus, Search, Wrench } from 'lucide-react';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { BranchAccessService } from '../../../services/domains/auth/BranchAccessService';
import { InventoryService } from '../../../services/domains/inventory/InventoryService';
import { formatProductQuantity, getStockQuantityLabel } from '../../../utils/products/productUnits';
import { AdjustmentModals } from './InventoryAdjustmentModals';

import { useToast } from '../../../components/ui/Toast';
interface Adjustment {
  id: string;
  code: string;
  warehouseId: string;
  warehouse: string;
  reason: string;
  date: string;
  createdBy: string;
  adjustedBy: string;
  approvedByName: string | null;
  postedByName: string | null;
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
  type: 'ADD' | 'SUBTRACT' | 'DAMAGE' | 'OPENING_BALANCE';
  status: string;
  totalQuantityM2: number;
  totalValue: number;
  productType: 'CERAMIC' | 'GENERAL';
  baseUnit?: 'M2' | 'LINEAR_METER' | 'BOX' | 'PIECE' | 'KG' | 'TON' | 'SET' | 'CUSTOM';
  customUnit?: string;
}

interface AdjustmentItem {
  id: string;
  productId: string;
  productName: string;
  productType: 'CERAMIC' | 'GENERAL';
  baseUnit?: 'M2' | 'LINEAR_METER' | 'BOX' | 'PIECE' | 'KG' | 'TON' | 'SET' | 'CUSTOM';
  customUnit?: string;
  quantityM2: number;
  boxesCount: number;
  unitCost: number;
  totalValue: number;
  notes: string;
}

type AdjustmentType = 'ADD' | 'SUBTRACT' | 'DAMAGE';

const branchAccess = new BranchAccessService();
const inventoryService = new InventoryService();

export function loadBranchAdjustments(): Adjustment[] {
  const actor = AuthService.requireAuth();
  PermissionService.requireAny(actor, [
    'inventory.view',
    'inventory.adjust',
    'inventory.adjustment.approve',
    'inventory.adjustment.post',
  ]);
  const db = DatabaseManager.getInstance();
  const scope = branchAccess.warehouseBranchScope('w', undefined, actor);
  return db.query<Adjustment>(`
    SELECT
      sa.id, sa.adjustment_number AS code, sa.warehouse_id AS warehouseId,
      w.name AS warehouse, sa.reason, sa.date, sa.created_by AS createdBy,
      COALESCE(u_created.full_name, 'النظام') AS adjustedBy,
      u_approved.full_name AS approvedByName, u_posted.full_name AS postedByName,
      sa.approval_status AS approvalStatus, sa.adjustment_type AS type, sa.status,
      sa.total_quantity_m2 AS totalQuantityM2, sa.total_value / 100.0 AS totalValue,
      COALESCE((
        SELECT p.product_type FROM stock_adjustment_items sai
        JOIN products p ON p.id = sai.product_id
        WHERE sai.adjustment_id = sa.id LIMIT 1
      ), 'CERAMIC') AS productType,
      (
        SELECT p.base_unit FROM stock_adjustment_items sai
        JOIN products p ON p.id = sai.product_id
        WHERE sai.adjustment_id = sa.id LIMIT 1
      ) AS baseUnit,
      (
        SELECT p.custom_unit FROM stock_adjustment_items sai
        JOIN products p ON p.id = sai.product_id
        WHERE sai.adjustment_id = sa.id LIMIT 1
      ) AS customUnit
    FROM stock_adjustments sa
    JOIN warehouses w ON sa.warehouse_id = w.id
    LEFT JOIN users u_created ON sa.created_by = u_created.id
    LEFT JOIN users u_approved ON sa.approved_by = u_approved.id
    LEFT JOIN users u_posted ON sa.posted_by = u_posted.id
    WHERE ${scope.clause}
    ORDER BY sa.date DESC, sa.adjustment_number DESC
  `, scope.params);
}

export const InventoryAdjustmentsPage: React.FC = () => {
  const newAdjustmentLabel = useBusinessTerm('actions.newAdjustment');
  const toast = useToast();
  const actor = AuthService.getCurrentUser();
  const canCreate = PermissionService.can(actor, 'inventory.adjust');
  const canApprove = PermissionService.can(actor, 'inventory.adjustment.approve');
  const canPost = PermissionService.can(actor, 'inventory.adjustment.post');
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedAdjustment, setSelectedAdjustment] = useState<Adjustment | null>(null);
  const [selectedItems, setSelectedItems] = useState<AdjustmentItem[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<{
    id: string; name: string; sku: string; costPrice: number; metersPerBox: number;
    productType: 'CERAMIC' | 'GENERAL'; baseUnit: NonNullable<AdjustmentItem['baseUnit']>; customUnit?: string;
  }[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [adjType, setAdjType] = useState<AdjustmentType>('ADD');
  const [qtyM2, setQtyM2] = useState(0);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    loadData();
    loadFormOptions();
  }, []);

  const loadData = () => {
    setLoading(true);
    try {
      setAdjustments(loadBranchAdjustments());
      setErrorMsg('');
    } catch (error) {
      console.error('Error loading adjustments:', error);
      setErrorMsg(error instanceof Error ? error.message : 'تعذر تحميل التسويات.');
    } finally {
      setLoading(false);
    }
  };

  const loadFormOptions = () => {
    const db = DatabaseManager.getInstance();
    try {
      const actorForScope = AuthService.requireAuth();
      const scope = branchAccess.warehouseBranchScope('w', undefined, actorForScope);
      const warehouseRows = db.query<{ id: string; name: string }>(
        `SELECT w.id, w.name FROM warehouses w WHERE w.is_active = 1 AND ${scope.clause} ORDER BY w.name`,
        scope.params
      );
      setWarehouses(warehouseRows);
      if (warehouseRows.length > 0) setSelectedWarehouseId(warehouseRows[0].id);

      const productRows = db.query<{
        id: string; name: string; sku: string; costPrice: number; metersPerBox: number;
        productType: 'CERAMIC' | 'GENERAL'; baseUnit: NonNullable<AdjustmentItem['baseUnit']>; customUnit?: string;
      }>(`
        SELECT id, name, sku, cost_price / 100.0 AS costPrice, meters_per_box AS metersPerBox,
          product_type AS productType, COALESCE(base_unit, 'M2') AS baseUnit, custom_unit AS customUnit
        FROM products WHERE is_active = 1 ORDER BY name
      `);
      setProducts(productRows);
      if (productRows.length > 0) setSelectedProductId(productRows[0].id);
    } catch (error) {
      console.error('Error loading adjustment options:', error);
      setErrorMsg(error instanceof Error ? error.message : 'تعذر تحميل خيارات التسوية.');
    }
  };

  const handleViewDetails = (adjustment: Adjustment) => {
    const db = DatabaseManager.getInstance();
    try {
      branchAccess.requireWarehouseAccess(adjustment.warehouseId);
      const items = db.query<AdjustmentItem>(`
        SELECT sai.id, sai.product_id AS productId, sai.product_name AS productName,
          sai.quantity_m2 AS quantityM2, sai.boxes_count AS boxesCount,
          sai.unit_cost / 100.0 AS unitCost, sai.total_value / 100.0 AS totalValue,
          COALESCE(sai.notes, '') AS notes,
          COALESCE(p.product_type, 'CERAMIC') AS productType,
          p.base_unit AS baseUnit, p.custom_unit AS customUnit
        FROM stock_adjustment_items sai
        LEFT JOIN products p ON p.id = sai.product_id
        WHERE sai.adjustment_id = ?
      `, [adjustment.id]);
      setSelectedAdjustment(adjustment);
      setSelectedItems(items);
      setShowDetailModal(true);
    } catch (error) {
      console.error('Error loading adjustment items:', error);
      toast.error(error instanceof Error ? error.message : 'تعذر تحميل تفاصيل التسوية.');
    }
  };

  const handleCreateAdjustment = (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMsg('');
    if (!selectedWarehouseId || !selectedProductId || qtyM2 <= 0 || !reason.trim()) {
      setErrorMsg('الرجاء تعبئة كافة الحقول المطلوبة وإدخال كمية أكبر من الصفر.');
      return;
    }

    try {
      inventoryService.createAdjustment({
        warehouseId: selectedWarehouseId,
        productId: selectedProductId,
        type: adjType,
        quantity: qtyM2,
        reason,
        notes,
      });
      setShowCreateModal(false);
      setQtyM2(0);
      setReason('');
      setNotes('');
      loadData();
    } catch (error) {
      console.error('Error creating adjustment:', error);
      setErrorMsg(`حدث خطأ أثناء حفظ طلب التسوية: ${error instanceof Error ? error.message : error}`);
    }
  };

  const runWorkflowAction = (action: 'approve' | 'post', adjustment: Adjustment) => {
    try {
      if (action === 'approve') inventoryService.approveAdjustment(adjustment.id);
      else inventoryService.postAdjustment(adjustment.id);
      loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تنفيذ إجراء التسوية.');
    }
  };

  const filtered = adjustments.filter((adjustment) =>
    adjustment.code.toLowerCase().includes(search.toLowerCase()) ||
    adjustment.warehouse.includes(search) ||
    adjustment.reason.includes(search)
  );
  const pendingCount = useMemo(() => adjustments.filter((adjustment) => adjustment.status === 'PENDING_APPROVAL').length, [adjustments]);
  const requestedAdjustmentId = searchParams.get('adjustmentId');

  useEffect(() => {
    if (!requestedAdjustmentId || !adjustments.length) return;
    const requested = adjustments.find((adjustment) => adjustment.id === requestedAdjustmentId);
    if (requested) {
      setSearch(requested.code);
      handleViewDetails(requested);
      setSearchParams((current) => { const next = new URLSearchParams(current); next.delete('adjustmentId'); return next; }, { replace: true });
    }
  }, [requestedAdjustmentId, adjustments]);
  const fmt = (value: number) => new Intl.NumberFormat('ar-EG').format(Math.round(value)) + ' ج';
  const selectedProduct = products.find((product) => product.id === selectedProductId);
  const selectedUnit = selectedProduct ? getStockQuantityLabel(selectedProduct) : 'م²';

  return (
    <div className="h-full flex flex-col bg-surface-muted text-ink overflow-hidden">
      <div className="bg-surface px-6 pt-4">
        <PageHeader
          icon={<Wrench className="w-5 h-5" />}
          title="تسويات المخزون"
          description="طلب ← اعتماد من مستخدم آخر ← ترحيل مخزني ومالي"
          actions={canCreate && (
            <button
              onClick={() => { setErrorMsg(''); setShowCreateModal(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-warning hover:bg-warning text-white rounded-xl text-sm font-semibold transition shrink-0"
            >
              <Plus className="w-4 h-4" />
              {newAdjustmentLabel}
            </button>
          )}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-warning-soft px-6 py-2 text-xs text-warning">
        <span className="rounded-full bg-warning px-2 py-1 font-black">{pendingCount}</span>
        <span>طلب تسوية بانتظار الاعتماد أو الترحيل</span>
        {pendingCount > 0 && (!canApprove || !canPost) && (
          <span className="text-warning">{!canApprove && 'اعتماد: تحتاج صلاحية inventory.adjustment.approve. '}{!canPost && 'ترحيل: تحتاج صلاحية inventory.adjustment.post.'}</span>
        )}
      </div>

      <div className="p-4 bg-surface border-b border-line flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            placeholder="بحث برقم التسوية، المخزن، أو السبب..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full pl-4 pr-10 py-2.5 bg-surface border border-line rounded-xl text-sm text-ink placeholder-muted focus:outline-none focus:border-warning/50 transition"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {errorMsg && !showCreateModal && (
          <div className="mb-4 rounded-xl border border-danger-border bg-danger-soft p-3 text-xs text-danger">{errorMsg}</div>
        )}
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 bg-warning rounded-lg animate-bounce" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted">
            <Wrench className="w-10 h-10 opacity-30" />
            <p className="text-sm">لا توجد تسويات مسجلة</p>
          </div>
        ) : (
          <div className="bg-surface border border-line rounded-xl overflow-hidden">
            <DataTable
              ariaLabel="تسويات المخزون"
              rows={filtered}
              rowKey={(adjustment: any) => String(adjustment.id)}
              tableClassName="text-sm"
              columns={[
                { key: 'code', header: 'رقم التسوية', render: (adjustment: any) => <span className="font-mono font-bold text-primary">{adjustment.code}</span> },
                { key: 'wh', header: 'المخزن', render: (adjustment: any) => <span className="font-medium text-ink">{adjustment.warehouse}</span> },
                {
                  key: 'type', header: 'نوع التسوية',
                  render: (adjustment: any) => <span className="text-xs">{adjustment.type === 'DAMAGE' ? 'تالف (-)' : adjustment.type === 'SUBTRACT' ? 'عجز / صرف (-)' : 'زيادة / إضافة (+)'}</span>,
                },
                { key: 'reason', header: 'سبب التسوية', render: (adjustment: any) => <span className="block max-w-[200px] truncate text-ink-secondary">{adjustment.reason}</span> },
                { key: 'qty', header: 'الكمية', render: (adjustment: any) => <span className="font-mono font-bold text-ink">{formatProductQuantity(adjustment.totalQuantityM2, adjustment)}</span> },
                { key: 'val', header: 'القيمة', render: (adjustment: any) => <span className="font-mono text-ink">{fmt(adjustment.totalValue)}</span> },
                {
                  key: 'status', header: 'الحالة',
                  render: (adjustment: any) => (
                    <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${adjustment.status === 'POSTED' ? 'bg-success-soft text-success' : adjustment.approvalStatus === 'APPROVED' ? 'bg-accent-soft text-primary' : 'bg-warning-soft text-warning'}`}>
                      {adjustment.status === 'POSTED' ? 'مرحّلة' : adjustment.approvalStatus === 'APPROVED' ? 'معتمدة - بانتظار الترحيل' : 'بانتظار الاعتماد'}
                    </span>
                  ),
                },
                {
                  key: 'actors', header: 'منشئ الطلب / المعتمد / المرحّل',
                  render: (adjustment: any) => (
                    <span className="block text-[10px] leading-5 text-ink-secondary">
                      <span className="block">الإنشاء: {adjustment.adjustedBy}</span>
                      <span className="block">الاعتماد: {adjustment.approvedByName || '—'}</span>
                      <span className="block">الترحيل: {adjustment.postedByName || '—'}</span>
                    </span>
                  ),
                },
                {
                  key: 'actions', header: 'الخيارات',
                  render: (adjustment: any) => (
                    <span className="block min-w-40">
                      <button onClick={() => handleViewDetails(adjustment)} className="flex items-center gap-1 text-xs font-bold text-primary transition hover:text-primary">
                        <FileText className="h-3.5 w-3.5" />
                        <span>عرض البنود</span>
                        <ChevronRight className="h-3 w-3" />
                      </button>
                      {canApprove && adjustment.status === 'PENDING_APPROVAL'
                        && adjustment.approvalStatus !== 'APPROVED'
                        && adjustment.createdBy !== actor?.id && (
                          <button onClick={() => runWorkflowAction('approve', adjustment)} className="mt-2 flex items-center gap-1 text-xs font-bold text-success">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            اعتماد
                          </button>
                        )}
                      {canPost && adjustment.status === 'PENDING_APPROVAL' && adjustment.approvalStatus === 'APPROVED' && (
                        <button onClick={() => runWorkflowAction('post', adjustment)} className="mt-2 flex items-center gap-1 text-xs font-bold text-warning">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          ترحيل
                        </button>
                      )}
                    </span>
                  ),
                },
              ]}
            />
          </div>
        )}
      </div>

      <AdjustmentModals
        showDetailModal={showDetailModal}
        setShowDetailModal={setShowDetailModal}
        selectedAdjustment={selectedAdjustment}
        selectedItems={selectedItems}
        fmt={fmt}
        showCreateModal={showCreateModal}
        setShowCreateModal={setShowCreateModal}
        errorMsg={errorMsg}
        warehouses={warehouses}
        selectedWarehouseId={selectedWarehouseId}
        setSelectedWarehouseId={setSelectedWarehouseId}
        adjType={adjType}
        setAdjType={setAdjType}
        products={products}
        selectedProductId={selectedProductId}
        setSelectedProductId={setSelectedProductId}
        selectedProduct={selectedProduct}
        selectedUnit={selectedUnit}
        qtyM2={qtyM2}
        setQtyM2={setQtyM2}
        reason={reason}
        setReason={setReason}
        notes={notes}
        setNotes={setNotes}
        handleCreateAdjustment={handleCreateAdjustment}
      />
    </div>
  );
};
