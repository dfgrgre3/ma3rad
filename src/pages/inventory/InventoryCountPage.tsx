import React, { useState, useEffect } from 'react';
import { ScanLine, Plus, Search, CheckCircle2, AlertTriangle, FileText, ChevronRight, X, Play, ClipboardList } from 'lucide-react';
import { DatabaseManager } from '../../database/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../../services/AuthService';
import { postLedgerEntry } from '../../database/ledger';
import { localDateString } from '../../utils/date';
import { InventoryCostingService } from '../../services/InventoryCostingService';
import { PermissionService } from '../../services/PermissionService';
import { formatProductQuantity, getStockQuantityLabel } from '../../utils/productUnits';

interface CountSession {
  id: string;
  code: string;
  warehouseId: string;
  warehouse: string;
  status: 'DRAFT' | 'COUNTING' | 'REVIEW' | 'POSTED' | 'CANCELLED';
  countType?: string;
  isBlind?: boolean;
  approvalStatus?: string;
  startDate: string;
  countedBy: string;
  itemsCount: number;
  itemsWithVariance: number;
  totalVarianceValue: number;
}

interface CountItem {
  id: string;
  productId: string;
  productName: string;
  productType: 'CERAMIC' | 'GENERAL';
  baseUnit?: 'M2' | 'LINEAR_METER' | 'BOX' | 'PIECE' | 'KG' | 'TON' | 'SET' | 'CUSTOM';
  customUnit?: string;
  systemQuantityM2: number;
  countedQuantityM2: number | null;
  varianceM2: number;
  unitCost: number;
  varianceValue: number;
  discrepancyReason?: string;
  notes: string;
}

export const InventoryCountPage: React.FC = () => {
  const [sessions, setSessions] = useState<CountSession[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [activeSession, setActiveSession] = useState<CountSession | null>(null);
  const [sessionItems, setSessionItems] = useState<CountItem[]>([]);

  // Form states
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [countType, setCountType] = useState<'FULL' | 'PARTIAL' | 'SPOT' | 'PERIODIC' | 'SURPRISE' | 'BLIND'>('FULL');
  const [isBlindCount, setIsBlindCount] = useState(false);
  const [products, setProducts] = useState<{
    id: string;
    name: string;
    sku: string;
    quantityM2: number;
    productType: 'CERAMIC' | 'GENERAL';
    baseUnit?: CountItem['baseUnit'];
    customUnit?: string;
  }[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  useEffect(() => {
    loadSessions();
    loadWarehouses();
  }, []);

  const loadSessions = () => {
    setLoading(true);
    const db = DatabaseManager.getInstance();
    try {
      const sql = `
        SELECT 
          sc.id,
          sc.count_number as code,
          sc.warehouse_id as warehouseId,
          w.name as warehouse,
          sc.status,
          sc.count_type as countType,
          COALESCE(sc.is_blind, 0) as isBlind,
          COALESCE(sc.approval_status, 'PENDING') as approvalStatus,
          sc.date as startDate,
          COALESCE(u.full_name, 'النظام') as countedBy,
          sc.total_items as itemsCount,
          sc.items_with_variance as itemsWithVariance,
          sc.total_variance_value as totalVarianceValue
        FROM stock_counts sc
        JOIN warehouses w ON sc.warehouse_id = w.id
        LEFT JOIN users u ON sc.created_by = u.id
        ORDER BY sc.date DESC, sc.count_number DESC
      `;
      const rows = db.query<any>(sql).map(r => ({
        ...r,
        isBlind: Boolean(r.isBlind)
      }));
      setSessions(rows);
    } catch (e) {
      console.error('Error loading sessions:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadWarehouses = () => {
    const db = DatabaseManager.getInstance();
    try {
      const rows = db.query<any>('SELECT id, name FROM warehouses WHERE is_active = 1 ORDER BY name');
      setWarehouses(rows);
      if (rows.length > 0) setSelectedWarehouseId(rows[0].id);
    } catch (e) {
      console.error(e);
    }
  };

  const loadProducts = (warehouseId = selectedWarehouseId) => {
    if (!warehouseId) return;
    try {
      const rows = DatabaseManager.getInstance().query<any>(`
        SELECT p.id, p.name, p.sku, COALESCE(ws.quantity_m2, 0) AS quantityM2,
          p.product_type AS productType, p.base_unit AS baseUnit, p.custom_unit AS customUnit
        FROM products p
        LEFT JOIN warehouse_stock ws ON ws.product_id = p.id AND ws.warehouse_id = ?
        WHERE p.is_active = 1
        ORDER BY p.name
      `, [warehouseId]);
      setProducts(rows);
    } catch (e) {
      console.error('Error loading products for count:', e);
    }
  };

  const handleStartSession = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    try {
      PermissionService.require(AuthService.requireAuth(), 'inventory.count');
    } catch (error: any) {
      setErrorMsg(error?.message || 'ليس لديك صلاحية بدء جلسة جرد.');
      return;
    }

    if (!selectedWarehouseId) {
      setErrorMsg('الرجاء اختيار مستودع الجرد.');
      return;
    }

    if (countType !== 'FULL' && selectedProductIds.length === 0) {
      setErrorMsg('اختر صنفًا واحدًا على الأقل للجرد الجزئي أو المفاجئ.');
      return;
    }

    const db = DatabaseManager.getInstance();
    try {
      db.executeTransaction((txDb) => {
        const countId = `cnt_${uuidv4().substring(0, 8)}`;
        const countNum = txDb.nextNumber('CNT');
        const today = localDateString();

        // 1. Get all active products & their current stocks in this warehouse
        const productsSql = `
          SELECT 
            p.id as productId,
            p.name as productName,
            COALESCE(ws.quantity_m2, 0) as systemQuantityM2,
            p.cost_price as costPrice,
            p.product_type as productType, p.base_unit as baseUnit, p.custom_unit as customUnit
          FROM products p
          LEFT JOIN warehouse_stock ws ON p.id = ws.product_id AND ws.warehouse_id = ?
          WHERE p.is_active = 1
        `;
        const selectedIds = countType === 'FULL' ? [] : selectedProductIds;
        const products = txDb.query<any>(countType === 'FULL'
          ? productsSql
          : productsSql.replace('WHERE p.is_active = 1', `WHERE p.is_active = 1 AND p.id IN (${selectedIds.map(() => '?').join(',')})`),
        countType === 'FULL' ? [selectedWarehouseId] : [selectedWarehouseId, ...selectedIds]);

        if (products.length === 0) {
          throw new Error('لا توجد منتجات مسجلة في النظام لبدء الجرد.');
        }

        // 2. Insert master session into stock_counts
        txDb.run(`
          INSERT INTO stock_counts (
            id, count_number, warehouse_id, date, count_type, status,
            is_blind, approval_status,
            total_items, items_with_variance, total_variance_value, notes, created_by, created_at
          ) VALUES (?, ?, ?, ?, ?, 'COUNTING', ?, 'PENDING', ?, 0, 0, ?, ?, CURRENT_TIMESTAMP)
        `, [
          countId, countNum, selectedWarehouseId, today, countType, (isBlindCount || countType === 'BLIND') ? 1 : 0, products.length, notes.trim() || null, AuthService.requireAuth().id
        ]);

        // 3. Insert items into stock_count_items
        for (const p of products) {
          const itemId = `cnti_${uuidv4().substring(0, 8)}`;
          txDb.run(`
            INSERT INTO stock_count_items (
              id, count_id, product_id, product_name, system_quantity_m2,
              counted_quantity_m2, variance_m2, unit_cost, variance_value
            ) VALUES (?, ?, ?, ?, ?, NULL, 0, ?, 0)
          `, [
            itemId, countId, p.productId, p.productName, p.systemQuantityM2, p.costPrice
          ]);
        }
      });

      setShowCreateModal(false);
      setNotes('');
      loadSessions();
    } catch (err: any) {
      console.error(err);
      setErrorMsg('حدث خطأ أثناء بدء جلسة الجرد: ' + err.message);
    }
  };

  const handleOpenSession = (session: CountSession) => {
    const db = DatabaseManager.getInstance();
    try {
      const sql = `
        SELECT 
          sci.id,
          sci.product_id as productId,
          sci.product_name as productName,
          sci.system_quantity_m2 as systemQuantityM2,
          sci.counted_quantity_m2 as countedQuantityM2,
          sci.variance_m2 as varianceM2,
          sci.unit_cost as unitCost,
          sci.variance_value as varianceValue,
          COALESCE(sci.discrepancy_reason, '') as discrepancyReason,
          COALESCE(sci.notes, '') as notes,
          COALESCE(p.product_type, 'CERAMIC') as productType,
          p.base_unit as baseUnit, p.custom_unit as customUnit
        FROM stock_count_items sci
        LEFT JOIN products p ON p.id = sci.product_id
        WHERE sci.count_id = ?
      `;
      const items = db.query<any>(sql, [session.id]);
      setActiveSession(session);
      setSessionItems(items);
      setItemSearch('');
      setShowSessionModal(true);
    } catch (e) {
      console.error(e);
    }
  };

  const handleItemCountChange = (index: number, valStr: string) => {
    const next = [...sessionItems];
    const val = valStr === '' ? null : parseFloat(valStr);
    next[index].countedQuantityM2 = val;

    if (val !== null) {
      const variance = Number((val - next[index].systemQuantityM2).toFixed(3));
      next[index].varianceM2 = variance;
      next[index].varianceValue = Number((variance * next[index].unitCost).toFixed(2));
    } else {
      next[index].varianceM2 = 0;
      next[index].varianceValue = 0;
    }

    setSessionItems(next);
  };

  const handleItemNoteChange = (index: number, value: string) => {
    const next = [...sessionItems];
    next[index] = { ...next[index], notes: value };
    setSessionItems(next);
  };

  const handleItemDiscrepancyReasonChange = (index: number, value: string) => {
    const next = [...sessionItems];
    next[index] = { ...next[index], discrepancyReason: value };
    setSessionItems(next);
  };

  const handleSaveDraft = () => {
    if (!activeSession) return;
    const db = DatabaseManager.getInstance();
    try {
      PermissionService.require(AuthService.requireAuth(), 'inventory.count');
      if (activeSession.status !== 'COUNTING') throw new Error('لا يمكن تعديل جلسة جرد غير مفتوحة.');
      db.executeTransaction((txDb) => {
        for (const item of sessionItems) {
          txDb.run(`
            UPDATE stock_count_items
            SET counted_quantity_m2 = ?, variance_m2 = ?, variance_value = ?,
                discrepancy_reason = ?, notes = ?, counted_by = ?,
                counted_at = CASE WHEN ? IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END
            WHERE id = ?
          `, [
            item.countedQuantityM2, item.varianceM2, item.varianceValue,
            item.discrepancyReason || null, item.notes || null,
            item.countedQuantityM2 === null ? null : AuthService.requireAuth().id,
            item.countedQuantityM2, item.id
          ]);
        }
      });
      alert('تم حفظ المسودة بنجاح.');
    } catch (e) {
      console.error(e);
      alert('فشل حفظ المسودة.');
    }
  };

  const handlePostSession = () => {
    if (!activeSession) return;
    if (activeSession.status === 'POSTED' || activeSession.status === 'CANCELLED') return;

    // Check if all items are counted
    const uncounted = sessionItems.some(i => i.countedQuantityM2 === null);
    if (uncounted) {
      if (!confirm('بعض الأصناف لم يتم إدخال جردها بعد. الأصناف غير المجرودة لن يتأثر مخزونها. هل تريد المتابعة وترحيل الجرد الحالي؟')) {
        return;
      }
    }

    const db = DatabaseManager.getInstance();
    try {
      const actor = AuthService.requireAuth();
      PermissionService.require(actor, 'inventory.count');
      db.executeTransaction((txDb) => {
        const currentSession = txDb.query<{ status: string }>('SELECT status FROM stock_counts WHERE id = ?', [activeSession.id])[0];
        if (!currentSession || currentSession.status !== 'COUNTING') {
          throw new Error('تم ترحيل الجلسة أو إغلاقها بالفعل. أعد تحميل البيانات قبل المتابعة.');
        }
        let varianceCount = 0;
        let totalVarianceVal = 0;

        for (const item of sessionItems) {
          if (item.countedQuantityM2 === null) continue;

          // 1. Validate that counted quantity is not less than reserved quantity
          const stockRow = txDb.query(
            `SELECT ws.reserved_m2 AS reservedM2, p.meters_per_box AS metersPerBox FROM warehouse_stock ws
             JOIN products p ON p.id = ws.product_id
             WHERE ws.product_id = ? AND ws.warehouse_id = ?`,
            [item.productId, activeSession.warehouseId]
          )[0] as any;
          const reservedM2 = stockRow ? Number(stockRow.reservedM2 || 0) : 0;
          const metersPerBox = stockRow ? Number(stockRow.metersPerBox || 1.44) : 1.44;

          if (item.countedQuantityM2 < reservedM2) {
            const unit = getStockQuantityLabel(item);
            throw new Error(`الكمية المعدودة للصنف "${item.productName}" (${item.countedQuantityM2} ${unit}) أقل من الكمية المحجوزة (${reservedM2} ${unit}). يجب فك الحجز أو تصحيح الكمية قبل الترحيل.`);
          }

          // 2. Update items in DB
          txDb.run(`
            UPDATE stock_count_items
            SET counted_quantity_m2 = ?, variance_m2 = ?, variance_value = ?,
                discrepancy_reason = ?, notes = ?, counted_by = ?, counted_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `, [
            item.countedQuantityM2, item.varianceM2, item.varianceValue,
            item.discrepancyReason || null, item.notes || null, actor.id, item.id
          ]);

          const diffM2 = item.varianceM2;
          if (diffM2 !== 0) {
            varianceCount++;
            totalVarianceVal += Math.abs(item.varianceValue);

            // 3. Calculate FIFO plan BEFORE updating stock quantity
            const fifoEnabled = InventoryCostingService.costingMethod(txDb) === 'FIFO';
            const fifoPlan = fifoEnabled && diffM2 < 0
              ? InventoryCostingService.planFifo(txDb, item.productId, activeSession.warehouseId, Math.abs(diffM2))
              : null;
            const unitCost = fifoPlan?.unitCost ?? Number(item.unitCost);
            const value = Math.round(Math.abs(diffM2 * unitCost) * 100) / 100;

            // 4. Adjust warehouse stock quantity to the counted quantity
            const stockExists = txDb.query<any>(
              'SELECT id FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?',
              [activeSession.warehouseId, item.productId]
            )[0];
            if (stockExists) {
              txDb.run(`UPDATE warehouse_stock SET quantity_m2 = ?, last_updated = CURRENT_TIMESTAMP WHERE warehouse_id = ? AND product_id = ?`,
                [item.countedQuantityM2, activeSession.warehouseId, item.productId]);
            } else {
              txDb.run(`INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2) VALUES (?, ?, ?, ?, 0)`,
                [`stk_${uuidv4().substring(0, 8)}`, activeSession.warehouseId, item.productId, item.countedQuantityM2]);
            }

            // 5. Write record into inventory_transactions
            const txId = `tx_${uuidv4().substring(0, 8)}`;
            const txNum = txDb.nextNumber('TX-CNT');
            const txType = diffM2 > 0 ? 'ADJUSTMENT_ADD' : 'ADJUSTMENT_SUB';
            const boxesCount = Number((diffM2 / metersPerBox).toFixed(2));

            txDb.run(`
              INSERT INTO inventory_transactions (
                id, transaction_number, type, product_id, warehouse_id,
                quantity_m2, boxes_count, unit_cost, total_cost, reference_type, reference_id,
                notes, performed_by, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'STOCK_COUNT', ?, ?, ?, CURRENT_TIMESTAMP)
            `, [
              txId, txNum, txType, item.productId, activeSession.warehouseId,
              diffM2, boxesCount, unitCost, value, activeSession.id,
              `تسوية فروقات الجرد (${activeSession.code}): ${item.discrepancyReason || 'فارق جرد'}`, actor.id,
            ]);
            if (fifoPlan) InventoryCostingService.consumeFifo(txDb, txId, fifoPlan);
            else if (fifoEnabled && diffM2 > 0) InventoryCostingService.addLayer(txDb, {
              productId: item.productId, warehouseId: activeSession.warehouseId, sourceTransactionId: txId,
              sourceType: 'STOCK_COUNT_GAIN', sourceId: activeSession.id, date: localDateString(),
              quantity: diffM2, unitCost,
            });
            if (value > 0) {
              postLedgerEntry(txDb.getDatabase(), {
                date: localDateString(),
                description: `Stock count adjustment ${activeSession.code} - ${item.discrepancyReason || ''}`,
                referenceType: 'INVENTORY_ADJUSTMENT',
                referenceId: txId,
                createdBy: actor.id,
                lines: diffM2 > 0
                  ? [{ accountCode: '1104', debit: value, credit: 0 }, { accountCode: '5201', debit: 0, credit: value }]
                  : [{ accountCode: '5201', debit: value, credit: 0 }, { accountCode: '1104', debit: 0, credit: value }],
              });
            }
          }
        }

        // 6. Close session status
        txDb.run(`
          UPDATE stock_counts
          SET status = 'POSTED', approval_status = 'APPROVED', approved_by = ?, approved_at = CURRENT_TIMESTAMP,
              posted_at = CURRENT_TIMESTAMP, posted_by = ?,
              items_with_variance = ?, total_variance_value = ?
          WHERE id = ?
        `, [actor.id, actor.id, varianceCount, totalVarianceVal, activeSession.id]);
      });

      setShowSessionModal(false);
      loadSessions();
    } catch (e: any) {
      console.error(e);
      alert('فشل ترحيل الجرد: ' + e.message);
    }
  };

  const filtered = sessions.filter(s => (statusFilter === 'ALL' || s.status === statusFilter) && (
    s.code.toLowerCase().includes(search.toLowerCase()) ||
    s.warehouse.includes(search)
  ));
  const visibleSessionItems = sessionItems.map((item, index) => ({ item, index })).filter(({ item }) =>
    `${item.productName} ${item.notes}`.toLowerCase().includes(itemSearch.toLowerCase())
  );
  const countedItems = sessionItems.filter(item => item.countedQuantityM2 !== null).length;
  const varianceItems = sessionItems.filter(item => item.countedQuantityM2 !== null && item.varianceM2 !== 0).length;

  const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(Math.round(n)) + ' ج';

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <ScanLine className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-base font-black text-slate-900">جرد المخزون (Inventory Count)</h1>
            <p className="text-xs text-slate-500 font-medium">متابعة ومطابقة الجرد الدوري والمفاجئ للمخازن والمعارض</p>
          </div>
        </div>
        <button
          onClick={() => { setErrorMsg(''); setSelectedProductIds([]); setProductSearch(''); loadProducts(); setShowCreateModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm font-semibold transition shrink-0"
        >
          <Plus className="w-4 h-4" />
          بدء جلسة جرد جديدة
        </button>
      </div>

      {/* Toolbar */}
      <div className="p-4 bg-white border-b border-slate-200 flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="بحث برقم الجلسة، المخزن، أو القائم بالجرد..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-500/50 transition"
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-700">
          <option value="ALL">{'\u0643\u0644 \u0627\u0644\u062d\u0627\u0644\u0627\u062a'}</option><option value="COUNTING">{'\u0642\u064a\u062f \u0627\u0644\u062c\u0631\u062f'}</option><option value="POSTED">{'\u0645\u0631\u062d\u0644'}</option><option value="CANCELLED">{'\u0645\u0644\u063a\u0649'}</option>
        </select>
      </div>

      {/* Table Content */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 bg-violet-600 rounded-lg animate-bounce" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-slate-500">
            <ScanLine className="w-10 h-10 opacity-30" />
            <p className="text-sm">لا توجد جلسات جرد سابقة</p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['كود الجلسة', 'المخزن المستهدف', 'التاريخ', 'المسؤول', 'الأصناف', 'الفروقات', 'قيمة الفروقات', 'الحالة', 'الخيارات'].map(h => (
                    <th key={h} className="px-4 py-3 text-right text-xs font-bold text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filtered.map((session) => (
                  <tr key={session.id} className="hover:bg-slate-100 transition">
                    <td className="px-4 py-3 font-mono text-sky-600 font-bold">{session.code}</td>
                    <td className="px-4 py-3 text-slate-900 font-medium">{session.warehouse}</td>
                    <td className="px-4 py-3 text-slate-500">{session.startDate}</td>
                    <td className="px-4 py-3 text-slate-700">{session.countedBy}</td>
                    <td className="px-4 py-3 text-slate-700 font-bold">{session.itemsCount} صنف</td>
                    <td className="px-4 py-3 text-slate-405">
                      {session.status === 'POSTED' ? `${session.itemsWithVariance} أصناف` : '—'}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {session.status === 'POSTED' ? (
                        session.totalVarianceValue > 0 ? (
                          <span className="text-rose-600 font-bold">{fmt(session.totalVarianceValue)}</span>
                        ) : (
                          <span className="text-emerald-600">مطابق</span>
                        )
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {session.status === 'POSTED' ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 flex items-center gap-1 w-fit">
                          <CheckCircle2 className="w-3 h-3" /> مطابق ومرحل
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20 flex items-center gap-1 w-fit animate-pulse">
                          قيد الجرد والتعبئة
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleOpenSession(session)}
                        className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700 font-bold transition"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>{session.status === 'POSTED' ? 'عرض التقرير' : 'إدخال الجرد'}</span>
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

      {/* Start Session Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-white backdrop-blur-sm">
          <form onSubmit={handleStartSession} className="bg-white border border-slate-200 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="bg-slate-50 px-6 py-4 flex items-center justify-between border-b border-slate-200">
              <div className="flex items-center gap-2">
                <ScanLine className="w-5 h-5 text-violet-600" />
                <h3 className="text-base font-black text-slate-900">بدء جلسة جرد مخازن جديدة</h3>
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
                <label className="text-xs text-slate-500 font-bold block">المخزن المراد جرده</label>
                <select
                  value={selectedWarehouseId}
                  onChange={(e) => { setSelectedWarehouseId(e.target.value); setSelectedProductIds([]); loadProducts(e.target.value); }}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-violet-500"
                >
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-slate-500 font-bold block">ملاحظات الجلسة</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={500} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" placeholder="ملاحظات لفريق الجرد" />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-slate-700 font-bold block">نوع الجرد</label>
                <select
                  value={countType}
                  onChange={(e) => setCountType(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-violet-500 font-bold"
                >
                  <option value="FULL">جرد كلي شامل (لكل المنتجات)</option>
                  <option value="PERIODIC">جرد دوري مجدول</option>
                  <option value="SURPRISE">جرد مفاجئ</option>
                  <option value="BLIND">عدّ أعمى (Blind Count)</option>
                  <option value="PARTIAL">جرد جزئي</option>
                  <option value="SPOT">جرد عشوائي سريع</option>
                </select>
              </div>

              <div className="p-3 bg-violet-50/60 rounded-xl border border-violet-200">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isBlindCount || countType === 'BLIND'}
                    onChange={(e) => setIsBlindCount(e.target.checked)}
                    className="accent-violet-600 rounded"
                  />
                  <span>تفعيل العد الأعمى (Blind Count)</span>
                </label>
                <p className="text-[10px] text-slate-500 mt-1 font-medium mr-5">
                  إخفاء كميات النظام الدفترية عن فريق الجرد أثناء الإدخال لمنع الانحياز وضمان دقة ونزاهة الحصر الفعلي.
                </p>
              </div>

              {countType !== 'FULL' && (
                <div className="space-y-2">
                  <label className="text-xs text-slate-700 font-bold block">الأصناف المطلوب جردها</label>
                  <div className="relative">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      placeholder="ابحث باسم الصنف أو الكود..."
                      className="w-full pr-9 pl-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm"
                    />
                  </div>
                  <div className="max-h-44 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                    {products.filter(p => `${p.name} ${p.sku}`.toLowerCase().includes(productSearch.toLowerCase())).map(product => {
                      const selected = selectedProductIds.includes(product.id);
                      return (
                        <label key={product.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-violet-50 cursor-pointer text-xs">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => setSelectedProductIds(current => selected
                              ? current.filter(id => id !== product.id)
                              : [...current, product.id])}
                            className="accent-violet-600"
                          />
                          <span className="flex-1 font-semibold text-slate-800">{product.name}<span className="mr-2 text-slate-400 font-mono">{product.sku}</span></span>
                          <span className="text-slate-500">رصيد: {formatProductQuantity(Number(product.quantityM2 || 0), product)}</span>
                        </label>
                      );
                    })}
                    {products.length === 0 && <p className="p-3 text-xs text-slate-500">لا توجد أصناف نشطة في النظام.</p>}
                  </div>
                  <p className="text-[11px] text-slate-500">تم اختيار {selectedProductIds.length} صنف</p>
                </div>
              )}

              <div className="text-xs text-slate-500 bg-violet-500/5 p-3 rounded-lg border border-violet-500/10 leading-relaxed">
                * عند الضغط على "بدء الجرد"، سيقوم النظام بتثبيت وحفظ الأرصدة الدفترية الحالية للأصناف لمقارنتها لاحقاً مع الكميات التي ستقوم بعدّها وإدخالها.
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
                className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-bold transition"
              >
                توليد جلسة وبدء الجرد
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Session Counting & View Modal */}
      {showSessionModal && activeSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-white backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden shadow-2xl flex flex-col">
            <div className="bg-slate-50 px-6 py-4 flex items-center justify-between border-b border-slate-200 shrink-0">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-violet-600" />
                <h3 className="text-base font-black text-slate-900">
                  جلسة الجرد: {activeSession.code} ({activeSession.warehouse})
                </h3>
              </div>
              <button onClick={() => setShowSessionModal(false)} className="text-slate-500 hover:text-slate-900 transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto space-y-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-lg font-black text-slate-900">{countedItems}/{sessionItems.length}</div><div className="text-[11px] text-slate-500">أصناف تم جردها</div></div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-lg font-black text-amber-600">{Math.max(0, sessionItems.length - countedItems)}</div><div className="text-[11px] text-slate-500">أصناف متبقية</div></div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-lg font-black text-violet-600">{varianceItems}</div><div className="text-[11px] text-slate-500">فروقات مسجلة</div></div>
              </div>
              <div className="relative"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} placeholder="بحث داخل أصناف الجرد..." className="w-full pr-9 pl-3 py-2 bg-white border border-slate-200 rounded-xl text-sm" /></div>
              <div className="flex items-center justify-between text-xs text-slate-500 bg-white p-3 rounded-lg border border-slate-200">
                <div>النوع: <span className="text-slate-900 font-bold">{activeSession.status === 'POSTED' ? 'مرحل ومعتمد' : 'قيد الجرد الفعلي'}</span></div>
                <div>القائم بالجرد: <span className="text-slate-900 font-bold">{activeSession.countedBy}</span></div>
                <div>التاريخ: <span className="text-slate-900 font-bold font-mono">{activeSession.startDate}</span></div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      {['اسم الصنف', 'رصيد النظام', 'الجرد الفعلي', 'الفارق', 'سبب الفارق', 'سعر التكلفة', 'الفارق المالي', 'ملاحظات'].map(h => (
                        <th key={h} className="px-4 py-3 text-right font-bold text-slate-500 border-b border-slate-200">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {visibleSessionItems.map(({ item, index: idx }) => (
                      <tr key={item.id} className="hover:bg-slate-100 transition">
                        <td className="px-4 py-3 text-slate-900 font-semibold">{item.productName}</td>
                        <td className="px-4 py-3 font-mono text-slate-500 font-bold">
                          {activeSession.isBlind && activeSession.status === 'COUNTING' ? (
                            <span className="text-violet-600 bg-violet-50 px-2 py-0.5 rounded text-[10px] border border-violet-200">🔒 مخفي (عدّ أعمى)</span>
                          ) : (
                            formatProductQuantity(item.systemQuantityM2, item)
                          )}
                        </td>
                        <td className="px-4 py-2">
                          {activeSession.status === 'POSTED' ? (
                            <span className="font-mono text-slate-900 font-bold">{formatProductQuantity(Number(item.countedQuantityM2), item)}</span>
                          ) : (
                            <input
                              type="number"
                              step="0.01"
                              value={item.countedQuantityM2 ?? ''}
                              onChange={(e) => handleItemCountChange(idx, e.target.value)}
                              placeholder="أدخل الجرد الفعلي"
                              className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-mono w-28 focus:outline-none focus:border-violet-500 text-slate-900"
                            />
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono font-bold">
                          {activeSession.isBlind && activeSession.status === 'COUNTING' ? (
                            <span className="text-slate-400 text-[11px]">يحتسب بعد الإدخال</span>
                          ) : item.countedQuantityM2 !== null ? (
                            item.varianceM2 > 0 ? (
                              <span className="text-emerald-600">+{formatProductQuantity(item.varianceM2, item)}</span>
                            ) : item.varianceM2 < 0 ? (
                              <span className="text-rose-600">{formatProductQuantity(item.varianceM2, item)}</span>
                            ) : (
                              <span className="text-slate-500">مطابق</span>
                            )
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          {item.varianceM2 !== 0 && item.countedQuantityM2 !== null ? (
                            activeSession.status === 'POSTED' ? (
                              <span className="text-xs font-bold text-slate-700">{item.discrepancyReason || 'غير محدد'}</span>
                            ) : (
                              <select
                                value={item.discrepancyReason || ''}
                                onChange={(e) => handleItemDiscrepancyReasonChange(idx, e.target.value)}
                                className="w-28 px-2 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-700 focus:outline-none focus:border-violet-500"
                              >
                                <option value="">-- سبب الفارق --</option>
                                <option value="BREAKAGE">كسر وتلف</option>
                                <option value="THEFT">عجز / فقد</option>
                                <option value="MISCOUNT">خطأ في العد</option>
                                <option value="INPUT_ERROR">خطأ إدخال سابق</option>
                                <option value="SUPPLIER_SHORTAGE">عجز توريد</option>
                                <option value="OTHER">أخرى</option>
                              </select>
                            )
                          ) : (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-500">{fmt(item.unitCost)}</td>
                        <td className="px-4 py-3 font-mono font-bold">
                          {activeSession.isBlind && activeSession.status === 'COUNTING' ? (
                            <span className="text-slate-400">—</span>
                          ) : item.countedQuantityM2 !== null ? (
                            item.varianceValue > 0 ? (
                              <span className="text-emerald-600">+{fmt(item.varianceValue)}</span>
                            ) : item.varianceValue < 0 ? (
                              <span className="text-rose-600">{fmt(item.varianceValue)}</span>
                            ) : (
                              <span className="text-slate-500">0 ج</span>
                            )
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <input
                            value={item.notes}
                            disabled={activeSession.status === 'POSTED'}
                            onChange={(e) => handleItemNoteChange(idx, e.target.value)}
                            maxLength={250}
                            placeholder="ملاحظة"
                            className="w-28 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs disabled:border-transparent"
                          />
                        </td>
                      </tr>
                    ))}
                    {visibleSessionItems.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-slate-500">لا توجد أصناف تطابق البحث</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-between shrink-0">
              <div>
                {activeSession.status !== 'POSTED' && (
                  <button
                    onClick={handleSaveDraft}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition border border-slate-300"
                  >
                    حفظ كمسودة
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowSessionModal(false)}
                  className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-bold transition border border-slate-200"
                >
                  إغلاق
                </button>
                {activeSession.status !== 'POSTED' && (
                  <button
                    onClick={handlePostSession}
                    className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    اعتماد وترحيل فروقات الجرد
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
