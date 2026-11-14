import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, ChevronRight, FileText, Plus, Search, Wrench } from 'lucide-react';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { BranchAccessService } from '../../../services/domains/auth/BranchAccessService';
import { InventoryService } from '../../../services/domains/inventory/InventoryService';
import { formatProductQuantity, getStockQuantityLabel } from '../../../utils/products/productUnits';
import { AdjustmentModals } from './InventoryAdjustmentModals';

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
      sa.total_quantity_m2 AS totalQuantityM2, sa.total_value AS totalValue,
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
        SELECT id, name, sku, cost_price AS costPrice, meters_per_box AS metersPerBox,
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
          sai.unit_cost AS unitCost, sai.total_value AS totalValue,
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
      alert(error instanceof Error ? error.message : 'تعذر تحميل تفاصيل التسوية.');
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
      alert(error instanceof Error ? error.message : 'تعذر تنفيذ إجراء التسوية.');
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
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
            <Wrench className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h1 className="text-base font-black text-slate-900">تسويات المخزون</h1>
            <p className="text-xs text-slate-500 font-medium">طلب ← اعتماد من مستخدم آخر ← ترحيل مخزني ومالي</p>
          </div>
        </div>
        {canCreate && (
          <button
            onClick={() => { setErrorMsg(''); setShowCreateModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-sm font-semibold transition shrink-0"
          >
            <Plus className="w-4 h-4" />
            طلب تسوية جديد
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-amber-50 px-6 py-2 text-xs text-amber-900">
        <span className="rounded-full bg-amber-200 px-2 py-1 font-black">{pendingCount}</span>
        <span>طلب تسوية بانتظار الاعتماد أو الترحيل</span>
        {pendingCount > 0 && (!canApprove || !canPost) && (
          <span className="text-amber-800">{!canApprove && 'اعتماد: تحتاج صلاحية inventory.adjustment.approve. '}{!canPost && 'ترحيل: تحتاج صلاحية inventory.adjustment.post.'}</span>
        )}
      </div>

      <div className="p-4 bg-white border-b border-slate-200 flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="بحث برقم التسوية، المخزن، أو السبب..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-500/50 transition"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {errorMsg && !showCreateModal && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{errorMsg}</div>
        )}
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 bg-orange-600 rounded-lg animate-bounce" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-slate-500">
            <Wrench className="w-10 h-10 opacity-30" />
            <p className="text-sm">لا توجد تسويات مسجلة</p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {['رقم التسوية', 'المخزن', 'نوع التسوية', 'سبب التسوية', 'الكمية', 'القيمة', 'الحالة', 'منشئ الطلب / المعتمد / المرحّل', 'الخيارات'].map((heading) => (
                    <th key={heading} className="px-4 py-3 text-right text-xs font-bold text-slate-500">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filtered.map((adjustment) => (
                  <tr key={adjustment.id} className="hover:bg-slate-100 transition">
                    <td className="px-4 py-3 font-mono text-sky-600 font-bold">{adjustment.code}</td>
                    <td className="px-4 py-3 text-slate-900 font-medium">{adjustment.warehouse}</td>
                    <td className="px-4 py-3 text-xs">{adjustment.type === 'DAMAGE' ? 'تالف (-)' : adjustment.type === 'SUBTRACT' ? 'عجز / صرف (-)' : 'زيادة / إضافة (+)'}</td>
                    <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate">{adjustment.reason}</td>
                    <td className="px-4 py-3 text-slate-900 font-mono font-bold">{formatProductQuantity(adjustment.totalQuantityM2, adjustment)}</td>
                    <td className="px-4 py-3 text-slate-700 font-mono">{fmt(adjustment.totalValue)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${adjustment.status === 'POSTED' ? 'bg-emerald-100 text-emerald-700' : adjustment.approvalStatus === 'APPROVED' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>
                        {adjustment.status === 'POSTED' ? 'مرحّلة' : adjustment.approvalStatus === 'APPROVED' ? 'معتمدة - بانتظار الترحيل' : 'بانتظار الاعتماد'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[10px] text-slate-600 leading-5">
                      <div>الإنشاء: {adjustment.adjustedBy}</div>
                      <div>الاعتماد: {adjustment.approvedByName || '—'}</div>
                      <div>الترحيل: {adjustment.postedByName || '—'}</div>
                    </td>
                    <td className="px-4 py-3 min-w-40">
                      <button
                        onClick={() => handleViewDetails(adjustment)}
                        className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700 font-bold transition"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>عرض البنود</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                      {canApprove && adjustment.status === 'PENDING_APPROVAL'
                        && adjustment.approvalStatus !== 'APPROVED'
                        && adjustment.createdBy !== actor?.id && (
                          <button
                            onClick={() => runWorkflowAction('approve', adjustment)}
                            className="mt-2 flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-800 font-bold"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            اعتماد
                          </button>
                      )}
                      {canPost && adjustment.status === 'PENDING_APPROVAL' && adjustment.approvalStatus === 'APPROVED' && (
                        <button
                          onClick={() => runWorkflowAction('post', adjustment)}
                          className="mt-2 flex items-center gap-1 text-xs text-orange-700 hover:text-orange-800 font-bold"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          ترحيل
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
