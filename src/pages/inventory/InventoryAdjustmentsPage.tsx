import React, { useState, useEffect } from 'react';
import { Wrench, Plus, Search, FileText, CheckCircle2, ChevronRight, X, AlertTriangle } from 'lucide-react';
import { DatabaseManager } from '../../database/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import { localDateString } from '../../utils/date';
import { postLedgerEntry } from '../../database/ledger';
import { InventoryCostingService } from '../../services/InventoryCostingService';
import { BranchAccessService } from '../../services/BranchAccessService';
import { formatProductQuantity, getProductUnitLabel, getStockQuantityLabel } from '../../utils/productUnits';

const branchAccess = new BranchAccessService();

interface Adjustment {
  id: string;
  code: string;
  warehouseId: string;
  warehouse: string;
  reason: string;
  date: string;
  adjustedBy: string;
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

export function loadBranchAdjustments(): Adjustment[] {
  const db = DatabaseManager.getInstance();
  const scope = branchAccess.warehouseBranchScope('w');
  return db.query<Adjustment>(`
    SELECT 
      sa.id,
      sa.adjustment_number as code,
      sa.warehouse_id as warehouseId,
      w.name as warehouse,
      sa.reason,
      sa.date,
      COALESCE(u.full_name, 'النظام') as adjustedBy,
      sa.adjustment_type as type,
      sa.status,
      sa.total_quantity_m2 as totalQuantityM2,
      sa.total_value as totalValue,
      COALESCE(p.product_type, 'CERAMIC') as productType,
      p.base_unit as baseUnit, p.custom_unit as customUnit
    FROM stock_adjustments sa
    JOIN warehouses w ON sa.warehouse_id = w.id
    LEFT JOIN users u ON sa.created_by = u.id
    LEFT JOIN stock_adjustment_items sai ON sai.adjustment_id = sa.id
    LEFT JOIN products p ON p.id = sai.product_id
    WHERE ${scope.clause}
    ORDER BY sa.date DESC, sa.adjustment_number DESC
  `, scope.params);
}

type AdjustmentType = 'ADD' | 'SUBTRACT' | 'DAMAGE';

interface AdjustmentProduct {
  id: string;
  name: string;
  costPrice: number;
  metersPerBox: number;
  productType: 'CERAMIC' | 'GENERAL';
  baseUnit: 'M2' | 'LINEAR_METER' | 'BOX' | 'PIECE' | 'KG' | 'TON' | 'SET' | 'CUSTOM';
}

interface AdjustmentTransactionInput {
  actorId: string;
  product: AdjustmentProduct;
  productId: string;
  warehouseId: string;
  type: AdjustmentType;
  quantity: number;
  reason: string;
  notes: string;
}

interface AdjustmentValues {
  fifoEnabled: boolean;
  fifoPlan: ReturnType<typeof InventoryCostingService.planFifo> | null;
  unitCost: number;
  totalValue: number;
  boxesCount: number;
}

function calculateAdjustmentValues(
  txDb: DatabaseManager,
  input: AdjustmentTransactionInput
): AdjustmentValues {
  const fifoEnabled = InventoryCostingService.costingMethod(txDb) === 'FIFO';
  const fifoPlan = fifoEnabled && input.type !== 'ADD'
    ? InventoryCostingService.planFifo(txDb, input.productId, input.warehouseId, input.quantity)
    : null;
  const unitCost = fifoPlan?.unitCost ?? (input.product.costPrice || 0);
  const totalValue = input.quantity * unitCost;

  if (!(totalValue > 0)) {
    throw new Error('Set a positive product cost before posting an inventory adjustment.');
  }

  const boxesCount = input.product.productType === 'GENERAL'
    ? input.product.baseUnit === 'BOX' ? input.quantity : 0
    : Number((input.quantity / (input.product.metersPerBox || 1.44)).toFixed(2));

  return { fifoEnabled, fifoPlan, unitCost, totalValue, boxesCount };
}

function validateAvailableStock(txDb: DatabaseManager, input: AdjustmentTransactionInput): void {
  const stockBefore = txDb.query<{ quantityM2: number; reservedM2: number }>(
    'SELECT quantity_m2 AS quantityM2,reserved_m2 AS reservedM2 FROM warehouse_stock WHERE warehouse_id=? AND product_id=?',
    [input.warehouseId, input.productId]
  )[0];

  if (
    input.type !== 'ADD' &&
    Number(stockBefore?.quantityM2 || 0) - Number(stockBefore?.reservedM2 || 0) < input.quantity
  ) {
    throw new Error(
      `The adjustment cannot reduce available stock below the reserved quantity (${getStockQuantityLabel(input.product)}).`
    );
  }
}

function insertAdjustmentRecords(
  txDb: DatabaseManager,
  input: AdjustmentTransactionInput,
  values: AdjustmentValues,
  adjustmentId: string,
  adjustmentNumber: string,
  date: string
): void {
  txDb.run(`
    INSERT INTO stock_adjustments (
      id, adjustment_number, warehouse_id, date, adjustment_type,
      reason, status, total_quantity_m2, total_value, notes, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'POSTED', ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `, [
    adjustmentId, adjustmentNumber, input.warehouseId, date, input.type,
    input.reason, input.quantity, values.totalValue, input.notes, input.actorId
  ]);

  txDb.run(`
    INSERT INTO stock_adjustment_items (
      id, adjustment_id, product_id, product_name, quantity_m2,
      boxes_count, unit_cost, total_value, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    `adji_${uuidv4().substring(0, 8)}`, adjustmentId, input.productId, input.product.name,
    input.quantity, values.boxesCount, values.unitCost, values.totalValue, input.notes
  ]);
}

function updateWarehouseStock(txDb: DatabaseManager, input: AdjustmentTransactionInput): void {
  const stock = txDb.query<{ quantityM2: number }>(
    'SELECT id, quantity_m2 AS quantityM2 FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?',
    [input.warehouseId, input.productId]
  )[0];
  const adjustmentQuantity = input.type === 'ADD' ? input.quantity : -input.quantity;

  if (stock) {
    txDb.run(`
      UPDATE warehouse_stock
      SET quantity_m2 = ?, last_updated = CURRENT_TIMESTAMP
      WHERE warehouse_id = ? AND product_id = ?
    `, [stock.quantityM2 + adjustmentQuantity, input.warehouseId, input.productId]);
    return;
  }

  txDb.run(`
    INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
    VALUES (?, ?, ?, ?, 0)
  `, [
    `stk_${uuidv4().substring(0, 8)}`, input.warehouseId, input.productId, adjustmentQuantity
  ]);
}

function recordInventoryTransaction(
  txDb: DatabaseManager,
  input: AdjustmentTransactionInput,
  values: AdjustmentValues,
  adjustmentId: string,
  adjustmentNumber: string
): string {
  const transactionId = `tx_${uuidv4().substring(0, 8)}`;
  const isAddition = input.type === 'ADD';
  const transactionType = isAddition
    ? 'ADJUSTMENT_ADD'
    : input.type === 'DAMAGE' ? 'DAMAGE' : 'ADJUSTMENT_SUB';
  const sign = isAddition ? 1 : -1;

  txDb.run(`
    INSERT INTO inventory_transactions (
      id, transaction_number, type, product_id, warehouse_id,
      quantity_m2, boxes_count, unit_cost, total_cost, reference_type, reference_id,
      notes, performed_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ADJUSTMENT', ?, ?, '${input.actorId}', CURRENT_TIMESTAMP)
  `, [
    transactionId, adjustmentNumber, transactionType, input.productId, input.warehouseId,
    input.quantity * sign, values.boxesCount * sign, values.unitCost, values.totalValue, adjustmentId,
    `تسوية مخزنية (${input.reason})`
  ]);

  return transactionId;
}

function updateCostLayers(
  txDb: DatabaseManager,
  input: AdjustmentTransactionInput,
  values: AdjustmentValues,
  transactionId: string,
  adjustmentId: string,
  date: string
): void {
  if (values.fifoPlan) {
    InventoryCostingService.consumeFifo(txDb, transactionId, values.fifoPlan);
  } else if (values.fifoEnabled && input.type === 'ADD') {
    InventoryCostingService.addLayer(txDb, {
      productId: input.productId,
      warehouseId: input.warehouseId,
      sourceTransactionId: transactionId,
      sourceType: 'INVENTORY_ADJUSTMENT',
      sourceId: adjustmentId,
      date,
      quantity: input.quantity,
      unitCost: values.unitCost,
    });
  }
}

function postAdjustmentLedgerEntry(
  txDb: DatabaseManager,
  input: AdjustmentTransactionInput,
  adjustmentId: string,
  adjustmentNumber: string,
  date: string,
  totalValue: number
): void {
  const lines = input.type === 'ADD'
    ? [{ accountCode: '1104', debit: totalValue, credit: 0 }, { accountCode: '5201', debit: 0, credit: totalValue }]
    : [{ accountCode: '5201', debit: totalValue, credit: 0 }, { accountCode: '1104', debit: 0, credit: totalValue }];

  postLedgerEntry(txDb.getDatabase(), {
    date,
    description: `Inventory adjustment ${adjustmentNumber}: ${input.reason}`,
    referenceType: 'INVENTORY_ADJUSTMENT',
    referenceId: adjustmentId,
    createdBy: input.actorId,
    lines,
  });
}

function saveAdjustmentTransaction(txDb: DatabaseManager, input: AdjustmentTransactionInput): void {
  const values = calculateAdjustmentValues(txDb, input);
  validateAvailableStock(txDb, input);

  const adjustmentId = `adj_${uuidv4().substring(0, 8)}`;
  const adjustmentNumber = txDb.nextNumber('ADJ');
  const date = localDateString();
  insertAdjustmentRecords(txDb, input, values, adjustmentId, adjustmentNumber, date);
  updateWarehouseStock(txDb, input);

  const transactionId = recordInventoryTransaction(
    txDb, input, values, adjustmentId, adjustmentNumber
  );
  updateCostLayers(txDb, input, values, transactionId, adjustmentId, date);
  if (values.totalValue > 0) {
    postAdjustmentLedgerEntry(
      txDb, input, adjustmentId, adjustmentNumber, date, values.totalValue
    );
  }
}

export const InventoryAdjustmentsPage: React.FC = () => {
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedAdjustment, setSelectedAdjustment] = useState<Adjustment | null>(null);
  const [selectedItems, setSelectedItems] = useState<AdjustmentItem[]>([]);

  // Form state
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<{
    id: string; name: string; sku: string; costPrice: number; metersPerBox: number;
    productType: 'CERAMIC' | 'GENERAL'; baseUnit: 'M2' | 'LINEAR_METER' | 'BOX' | 'PIECE' | 'KG' | 'TON' | 'SET' | 'CUSTOM'; customUnit?: string;
  }[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [adjType, setAdjType] = useState<'ADD' | 'SUBTRACT' | 'DAMAGE'>('ADD');
  const [qtyM2, setQtyM2] = useState<number>(0);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    loadData();
    loadFormOptions();
  }, []);

  const loadData = () => {
    setLoading(true);
    try {
      setAdjustments(loadBranchAdjustments());
    } catch (e) {
      console.error('Error loading adjustments:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadFormOptions = () => {
    const db = DatabaseManager.getInstance();
    try {
      const scope = branchAccess.warehouseBranchScope('w');
      const wRows = db.query<any>(
        `SELECT w.id, w.name FROM warehouses w WHERE w.is_active = 1 AND ${scope.clause} ORDER BY w.name`,
        scope.params
      );
      setWarehouses(wRows);
      if (wRows.length > 0) setSelectedWarehouseId(wRows[0].id);

      const pRows = db.query<any>('SELECT id, name, sku, cost_price as costPrice, meters_per_box as metersPerBox, product_type as productType, base_unit as baseUnit, custom_unit as customUnit FROM products WHERE is_active = 1 ORDER BY name');
      setProducts(pRows);
      if (pRows.length > 0) setSelectedProductId(pRows[0].id);
    } catch (e) {
      console.error('Error loading warehouses/products:', e);
    }
  };

  const handleViewDetails = (adj: Adjustment) => {
    const db = DatabaseManager.getInstance();
    try {
      branchAccess.requireWarehouseAccess(adj.warehouseId);
      const sql = `
        SELECT 
          sai.id,
          sai.product_id as productId,
          sai.product_name as productName,
          sai.quantity_m2 as quantityM2,
          sai.boxes_count as boxesCount,
          sai.unit_cost as unitCost,
          sai.total_value as totalValue,
          COALESCE(sai.notes, '') as notes,
          COALESCE(p.product_type, 'CERAMIC') as productType,
          p.base_unit as baseUnit, p.custom_unit as customUnit
        FROM stock_adjustment_items sai
        LEFT JOIN products p ON p.id = sai.product_id
        WHERE sai.adjustment_id = ?
      `;
      const items = db.query<AdjustmentItem>(sql, [adj.id]);
      setSelectedAdjustment(adj);
      setSelectedItems(items);
      setShowDetailModal(true);
    } catch (e) {
      console.error('Error loading items:', e);
      alert(e instanceof Error ? e.message : 'تعذر تحميل تفاصيل التسوية.');
    }
  };

  const handleCreateAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!selectedWarehouseId || !selectedProductId || qtyM2 <= 0 || !reason.trim()) {
      setErrorMsg('الرجاء تعبئة كافة الحقول المطلوبة وإدخال كمية أكبر من الصفر.');
      return;
    }

    const prod = products.find(p => p.id === selectedProductId);
    if (!prod) return;

    const db = DatabaseManager.getInstance();
    try {
      const actor = AuthService.requireAuth();
      PermissionService.require(actor, 'inventory.adjust');
      branchAccess.requireWarehouseAccess(selectedWarehouseId, actor);
      db.executeTransaction(txDb => saveAdjustmentTransaction(txDb, {
        actorId: actor.id,
        product: prod,
        productId: selectedProductId,
        warehouseId: selectedWarehouseId,
        type: adjType,
        quantity: qtyM2,
        reason,
        notes,
      }));

      // Reset form & Close
      setShowCreateModal(false);
      setQtyM2(0);
      setReason('');
      setNotes('');
      loadData();
    } catch (err: any) {
      console.error(err);
      setErrorMsg('حدث خطأ أثناء حفظ التسوية: ' + err.message);
    }
  };

  const filtered = adjustments.filter(adj =>
    adj.code.toLowerCase().includes(search.toLowerCase()) ||
    adj.warehouse.includes(search) ||
    adj.reason.includes(search)
  );

  const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(Math.round(n)) + ' ج';
  const selectedProduct = products.find((product) => product.id === selectedProductId);
  const selectedUnit = selectedProduct ? getStockQuantityLabel(selectedProduct) : 'م²';

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
            <Wrench className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h1 className="text-base font-black text-slate-900">تسويات المخزون (Inventory Adjustments)</h1>
            <p className="text-xs text-slate-500 font-medium">تسجيل كميات الفقد أو التلف أو الزيادة مع تدوين الأسباب والاعتماد</p>
          </div>
        </div>
        <button
          onClick={() => { setErrorMsg(''); setShowCreateModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-sm font-semibold transition shrink-0"
        >
          <Plus className="w-4 h-4" />
          طلب تسوية جديد
        </button>
      </div>

      {/* Toolbar */}
      <div className="p-4 bg-white border-b border-slate-200 flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="بحث برقم التسوية، المخزن، أو السبب..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-500/50 transition"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto p-6">
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
                  {['رقم التسوية', 'المخزن', 'نوع التسوية', 'سبب التسوية', 'الكمية', 'القيمة', 'التاريخ', 'القائم بالتسوية', 'الخيارات'].map(h => (
                    <th key={h} className="px-4 py-3 text-right text-xs font-bold text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filtered.map((adj) => (
                  <tr key={adj.id} className="hover:bg-slate-100 transition">
                    <td className="px-4 py-3 font-mono text-sky-600 font-bold">{adj.code}</td>
                    <td className="px-4 py-3 text-slate-900 font-medium">{adj.warehouse}</td>
                    <td className="px-4 py-3">
                      {adj.type === 'SUBTRACT' ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-rose-500/10 text-rose-600 border border-rose-500/20">
                          عجز / صرف (- )
                        </span>
                      ) : adj.type === 'DAMAGE' ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20">
                          تالف (- )
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                          زيادة / إضافة (+ )
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate">{adj.reason}</td>
                    <td className="px-4 py-3 text-slate-900 font-mono font-bold">{formatProductQuantity(adj.totalQuantityM2, adj)}</td>
                    <td className="px-4 py-3 text-slate-700 font-mono">{fmt(adj.totalValue)}</td>
                    <td className="px-4 py-3 text-slate-500">{adj.date}</td>
                    <td className="px-4 py-3 text-slate-700">{adj.adjustedBy}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleViewDetails(adj)}
                        className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700 font-bold transition"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>عرض البنود</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedAdjustment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-white backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl">
            <div className="bg-slate-50 px-6 py-4 flex items-center justify-between border-b border-slate-200">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-orange-600" />
                <h3 className="text-base font-black text-slate-900">تفاصيل تسوية المخزون: {selectedAdjustment.code}</h3>
              </div>
              <button onClick={() => setShowDetailModal(false)} className="text-slate-500 hover:text-slate-900 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs bg-white p-4 rounded-xl border border-slate-200/60">
                <div>
                  <div className="text-slate-500 mb-0.5">المستودع</div>
                  <div className="font-bold text-slate-900">{selectedAdjustment.warehouse}</div>
                </div>
                <div>
                  <div className="text-slate-500 mb-0.5">نوع التسوية</div>
                  <div className="font-bold text-slate-900">
                    {selectedAdjustment.type === 'ADD' ? 'زيادة / إضافة (+)' : selectedAdjustment.type === 'DAMAGE' ? 'تالف (-)' : 'عجز / صرف (-)'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 mb-0.5">السبب</div>
                  <div className="font-bold text-slate-900">{selectedAdjustment.reason}</div>
                </div>
                <div>
                  <div className="text-slate-500 mb-0.5">التاريخ</div>
                  <div className="font-bold text-slate-900 font-mono">{selectedAdjustment.date}</div>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      {['الصنف', 'الكمية', 'عدد الصناديق', 'سعر التكلفة', 'القيمة الإجمالية'].map(h => (
                        <th key={h} className="px-4 py-2 text-right font-bold text-slate-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {selectedItems.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-3 text-slate-900 font-medium">{item.productName}</td>
                        <td className="px-4 py-3 font-mono font-bold text-sky-600">{formatProductQuantity(item.quantityM2, item)}</td>
                        <td className="px-4 py-3 font-mono text-slate-700">{item.boxesCount} صندوق</td>
                        <td className="px-4 py-3 font-mono text-slate-500">{fmt(item.unitCost)}</td>
                        <td className="px-4 py-3 font-mono font-bold text-emerald-600">{fmt(item.totalValue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="bg-slate-50 px-6 py-4 flex justify-end gap-2 border-t border-slate-200">
              <button
                onClick={() => setShowDetailModal(false)}
                className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-bold transition border border-slate-200"
              >
                إغلاق التفاصيل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal Form */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-white backdrop-blur-sm">
          <form onSubmit={handleCreateAdjustment} className="bg-white border border-slate-200 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl">
            <div className="bg-slate-50 px-6 py-4 flex items-center justify-between border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Wrench className="w-5 h-5 text-orange-600" />
                <h3 className="text-base font-black text-slate-900">طلب تسوية مخزنية جديدة</h3>
              </div>
              <button type="button" onClick={() => setShowCreateModal(false)} className="text-slate-500 hover:text-slate-900 transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {errorMsg && (
                <div className="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-600 text-xs font-semibold rounded-xl">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs text-slate-500 font-bold block">المخزن المستهدف</label>
                <select
                  value={selectedWarehouseId}
                  onChange={(e) => setSelectedWarehouseId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-orange-500"
                >
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-slate-455 font-bold block">نوع التسوية</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjType('ADD')}
                    className={`px-3 py-2 text-xs font-bold rounded-xl border transition ${adjType === 'ADD' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/50' : 'bg-slate-50 border-slate-200 hover:bg-white text-slate-500'}`}
                  >
                    إضافة رصيد (+)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjType('SUBTRACT')}
                    className={`px-3 py-2 text-xs font-bold rounded-xl border transition ${adjType === 'SUBTRACT' ? 'bg-rose-500/10 text-rose-600 border-rose-500/50' : 'bg-slate-50 border-slate-200 hover:bg-white text-slate-500'}`}
                  >
                    عجز / سحب (-)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjType('DAMAGE')}
                    className={`px-3 py-2 text-xs font-bold rounded-xl border transition ${adjType === 'DAMAGE' ? 'bg-amber-500/10 text-amber-600 border-amber-500/50' : 'bg-slate-50 border-slate-200 hover:bg-white text-slate-500'}`}
                  >
                    تالف (-)
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-slate-455 font-bold block">الصنف المراد تسويته</label>
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-orange-500"
                >
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-455 font-bold block">الكمية ({selectedUnit})</label>
                  <input
                    type="number"
                    step={selectedProduct?.productType === 'GENERAL' && ['BOX', 'PIECE', 'SET'].includes(selectedProduct.baseUnit) ? 1 : 0.01}
                    min="0.01"
                    value={qtyM2 || ''}
                    onChange={(e) => setQtyM2(Number.parseFloat(e.target.value) || 0)}
                    placeholder={`كمية ${selectedUnit}`}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-455 font-bold block">سبب التسوية</label>
                  <input
                    type="text"
                    required
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="مثال: تلف أثناء الترتيب، زيادة في الشحنة"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-slate-455 font-bold block">ملاحظات إضافية</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="ملاحظات أو تفاصيل أكثر..."
                  rows={2}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-orange-500 resize-none"
                />
              </div>
            </div>

            <div className="bg-slate-50 px-6 py-4 flex justify-end gap-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-bold transition border border-slate-200"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-bold transition"
              >
                حفظ التسوية
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
