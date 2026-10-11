import React, { useState, useEffect } from 'react';
import { ScanLine, Plus, Search, CheckCircle2, AlertTriangle, FileText, ChevronRight, X, Play, ClipboardList } from 'lucide-react';
import { DatabaseManager } from '../../database/db';
import { v4 as uuidv4 } from 'uuid';

interface CountSession {
  id: string;
  code: string;
  warehouseId: string;
  warehouse: string;
  status: 'DRAFT' | 'COUNTING' | 'REVIEW' | 'POSTED' | 'CANCELLED';
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
  systemQuantityM2: number;
  countedQuantityM2: number | null;
  varianceM2: number;
  unitCost: number;
  varianceValue: number;
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
  const [countType, setCountType] = useState<'FULL' | 'PARTIAL' | 'SPOT'>('FULL');
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

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
      const rows = db.query<any>(sql);
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

  const handleStartSession = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!selectedWarehouseId) {
      setErrorMsg('الرجاء اختيار مستودع الجرد.');
      return;
    }

    const db = DatabaseManager.getInstance();
    try {
      db.executeTransaction((txDb) => {
        const countId = `cnt_${uuidv4().substring(0, 8)}`;
        const countNum = txDb.nextNumber('CNT');
        const today = new Date().toISOString().split('T')[0];

        // 1. Get all active products & their current stocks in this warehouse
        const productsSql = `
          SELECT 
            p.id as productId,
            p.name as productName,
            COALESCE(ws.quantity_m2, 0) as systemQuantityM2,
            p.cost_price as costPrice
          FROM products p
          LEFT JOIN warehouse_stock ws ON p.id = ws.product_id AND ws.warehouse_id = ?
          WHERE p.is_active = 1
        `;
        const products = txDb.query<any>(productsSql, [selectedWarehouseId]);

        if (products.length === 0) {
          throw new Error('لا توجد منتجات مسجلة في النظام لبدء الجرد.');
        }

        // 2. Insert master session into stock_counts
        txDb.run(`
          INSERT INTO stock_counts (
            id, count_number, warehouse_id, date, count_type, status,
            total_items, items_with_variance, total_variance_value, created_by, created_at
          ) VALUES (?, ?, ?, ?, ?, 'COUNTING', ?, 0, 0, 'usr_admin', CURRENT_TIMESTAMP)
        `, [
          countId, countNum, selectedWarehouseId, today, countType, products.length
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
          id,
          product_id as productId,
          product_name as productName,
          system_quantity_m2 as systemQuantityM2,
          counted_quantity_m2 as countedQuantityM2,
          variance_m2 as varianceM2,
          unit_cost as unitCost,
          variance_value as varianceValue,
          COALESCE(notes, '') as notes
        FROM stock_count_items
        WHERE count_id = ?
      `;
      const items = db.query<any>(sql, [session.id]);
      setActiveSession(session);
      setSessionItems(items);
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

  const handleSaveDraft = () => {
    if (!activeSession) return;
    const db = DatabaseManager.getInstance();
    try {
      db.executeTransaction((txDb) => {
        for (const item of sessionItems) {
          txDb.run(`
            UPDATE stock_count_items
            SET counted_quantity_m2 = ?, variance_m2 = ?, variance_value = ?
            WHERE id = ?
          `, [item.countedQuantityM2, item.varianceM2, item.varianceValue, item.id]);
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

    // Check if all items are counted
    const uncounted = sessionItems.some(i => i.countedQuantityM2 === null);
    if (uncounted) {
      if (!confirm('بعض الأصناف لم يتم إدخال جردها بعد. الأصناف غير المجرودة لن يتأثر مخزونها. هل تريد المتابعة وترحيل الجرد الحالي؟')) {
        return;
      }
    }

    const db = DatabaseManager.getInstance();
    try {
      db.executeTransaction((txDb) => {
        let varianceCount = 0;
        let totalVarianceVal = 0;

        for (const item of sessionItems) {
          if (item.countedQuantityM2 === null) continue;

          // 1. Update items in DB
          txDb.run(`
            UPDATE stock_count_items
            SET counted_quantity_m2 = ?, variance_m2 = ?, variance_value = ?
            WHERE id = ?
          `, [item.countedQuantityM2, item.varianceM2, item.varianceValue, item.id]);

          const diffM2 = item.varianceM2;
          if (diffM2 !== 0) {
            varianceCount++;
            totalVarianceVal += Math.abs(item.varianceValue);

            // 2. Adjust warehouse stock quantity to the counted quantity
            txDb.run(`
              UPDATE warehouse_stock
              SET quantity_m2 = ?, last_updated = CURRENT_TIMESTAMP
              WHERE warehouse_id = ? AND product_id = ?
            `, [item.countedQuantityM2, activeSession.warehouseId, item.productId]);

            // 3. Write record into inventory_transactions
            const txId = `tx_${uuidv4().substring(0, 8)}`;
            const txType = diffM2 > 0 ? 'ADJUSTMENT_ADD' : 'ADJUSTMENT_SUB';
            const boxesCount = Number((diffM2 / 1.44).toFixed(2)); // Default approximation

            txDb.run(`
              INSERT INTO inventory_transactions (
                id, transaction_number, type, product_id, warehouse_id,
                quantity_m2, boxes_count, unit_cost, total_cost, reference_type, reference_id,
                notes, performed_by, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'STOCK_COUNT', ?, ?, 'usr_admin', CURRENT_TIMESTAMP)
            `, [
              txId, activeSession.code, txType, item.productId, activeSession.warehouseId,
              diffM2, boxesCount, item.unitCost, Math.abs(item.varianceValue), activeSession.id,
              `تسوية فروقات الجرد (${activeSession.code})`
            ]);
          }
        }

        // 4. Close session status
        txDb.run(`
          UPDATE stock_counts
          SET status = 'POSTED', posted_at = CURRENT_TIMESTAMP, posted_by = 'usr_admin',
              items_with_variance = ?, total_variance_value = ?
          WHERE id = ?
        `, [varianceCount, totalVarianceVal, activeSession.id]);
      });

      setShowSessionModal(false);
      loadSessions();
    } catch (e: any) {
      console.error(e);
      alert('فشل ترحيل الجرد: ' + e.message);
    }
  };

  const filtered = sessions.filter(s =>
    s.code.toLowerCase().includes(search.toLowerCase()) ||
    s.warehouse.includes(search)
  );

  const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(Math.round(n)) + ' ج';

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <ScanLine className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-base font-black text-white">جرد المخزون (Inventory Count)</h1>
            <p className="text-xs text-slate-400 font-medium">متابعة ومطابقة الجرد الدوري والمفاجئ للمخازن والمعارض</p>
          </div>
        </div>
        <button
          onClick={() => { setErrorMsg(''); setShowCreateModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm font-semibold transition shrink-0"
        >
          <Plus className="w-4 h-4" />
          بدء جلسة جرد جديدة
        </button>
      </div>

      {/* Toolbar */}
      <div className="p-4 bg-slate-900/50 border-b border-slate-900 flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="بحث برقم الجلسة، المخزن، أو القائم بالجرد..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-4 pr-10 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500/50 transition"
          />
        </div>
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
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-850 border-b border-slate-800">
                <tr>
                  {['كود الجلسة', 'المخزن المستهدف', 'التاريخ', 'المسؤول', 'الأصناف', 'الفروقات', 'قيمة الفروقات', 'الحالة', 'الخيارات'].map(h => (
                    <th key={h} className="px-4 py-3 text-right text-xs font-bold text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filtered.map((session) => (
                  <tr key={session.id} className="hover:bg-slate-800/30 transition">
                    <td className="px-4 py-3 font-mono text-sky-400 font-bold">{session.code}</td>
                    <td className="px-4 py-3 text-white font-medium">{session.warehouse}</td>
                    <td className="px-4 py-3 text-slate-400">{session.startDate}</td>
                    <td className="px-4 py-3 text-slate-300">{session.countedBy}</td>
                    <td className="px-4 py-3 text-slate-300 font-bold">{session.itemsCount} صنف</td>
                    <td className="px-4 py-3 text-slate-405">
                      {session.status === 'POSTED' ? `${session.itemsWithVariance} أصناف` : '—'}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {session.status === 'POSTED' ? (
                        session.totalVarianceValue > 0 ? (
                          <span className="text-rose-450 font-bold">{fmt(session.totalVarianceValue)}</span>
                        ) : (
                          <span className="text-emerald-450">مطابق</span>
                        )
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {session.status === 'POSTED' ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1 w-fit">
                          <CheckCircle2 className="w-3 h-3" /> مطابق ومرحل
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-500/10 text-amber-450 border border-amber-550/20 flex items-center gap-1 w-fit animate-pulse">
                          قيد الجرد والتعبئة
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleOpenSession(session)}
                        className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 font-bold transition"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <form onSubmit={handleStartSession} className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="bg-slate-850 px-6 py-4 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2">
                <ScanLine className="w-5 h-5 text-violet-400" />
                <h3 className="text-base font-black text-white">بدء جلسة جرد مخازن جديدة</h3>
              </div>
              <button type="button" onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {errorMsg && (
                <div className="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold rounded-xl">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs text-slate-450 font-bold block">المخزن المراد جرده</label>
                <select
                  value={selectedWarehouseId}
                  onChange={(e) => setSelectedWarehouseId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-violet-500"
                >
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-slate-455 font-bold block">نوع الجرد</label>
                <select
                  value={countType}
                  onChange={(e) => setCountType(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-violet-500"
                >
                  <option value="FULL">جرد كلي (لكل المنتجات)</option>
                  <option value="PARTIAL">جرد جزئي</option>
                  <option value="SPOT">جرد مفاجئ سريع</option>
                </select>
              </div>

              <div className="text-xs text-slate-400 bg-violet-500/5 p-3 rounded-lg border border-violet-550/10 leading-relaxed">
                * عند الضغط على "بدء الجرد"، سيقوم النظام بتثبيت وحفظ الأرصدة الدفترية الحالية للأصناف لمقارنتها لاحقاً مع الكميات التي ستقوم بعدّها وإدخالها.
              </div>
            </div>

            <div className="bg-slate-850 px-6 py-4 flex justify-end gap-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 bg-slate-850 hover:bg-slate-800 text-slate-350 rounded-xl text-xs font-bold transition border border-slate-800"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden shadow-2xl flex flex-col">
            <div className="bg-slate-850 px-6 py-4 flex items-center justify-between border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-violet-400" />
                <h3 className="text-base font-black text-white">
                  جلسة الجرد: {activeSession.code} ({activeSession.warehouse})
                </h3>
              </div>
              <button onClick={() => setShowSessionModal(false)} className="text-slate-400 hover:text-white transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-400 bg-slate-950/40 p-3 rounded-lg border border-slate-800">
                <div>النوع: <span className="text-white font-bold">{activeSession.status === 'POSTED' ? 'مرحل ومعتمد' : 'قيد الجرد الفعلي'}</span></div>
                <div>القائم بالجرد: <span className="text-white font-bold">{activeSession.countedBy}</span></div>
                <div>التاريخ: <span className="text-white font-bold font-mono">{activeSession.startDate}</span></div>
              </div>

              <div className="border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-850 sticky top-0">
                    <tr>
                      {['اسم الصنف السيراميك', 'الرصيد الدفتري للنظام', 'الجرد الفعلي م²', 'الفارق م²', 'سعر التكلفة', 'الفارق المالي'].map(h => (
                        <th key={h} className="px-4 py-3 text-right font-bold text-slate-400 border-b border-slate-800">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {sessionItems.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-850/40 transition">
                        <td className="px-4 py-3 text-white font-semibold">{item.productName}</td>
                        <td className="px-4 py-3 font-mono text-slate-400">{item.systemQuantityM2} م²</td>
                        <td className="px-4 py-2">
                          {activeSession.status === 'POSTED' ? (
                            <span className="font-mono text-white font-bold">{item.countedQuantityM2} م²</span>
                          ) : (
                            <input
                              type="number"
                              step="0.01"
                              value={item.countedQuantityM2 ?? ''}
                              onChange={(e) => handleItemCountChange(idx, e.target.value)}
                              placeholder="أدخل الجرد الفعلي"
                              className="px-2 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono w-32 focus:outline-none focus:border-violet-500 text-white"
                            />
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono font-bold">
                          {item.countedQuantityM2 !== null ? (
                            item.varianceM2 > 0 ? (
                              <span className="text-emerald-450">+{item.varianceM2} م²</span>
                            ) : item.varianceM2 < 0 ? (
                              <span className="text-rose-450">{item.varianceM2} م²</span>
                            ) : (
                              <span className="text-slate-500">مطابق</span>
                            )
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-405">{fmt(item.unitCost)}</td>
                        <td className="px-4 py-3 font-mono font-bold">
                          {item.countedQuantityM2 !== null ? (
                            item.varianceValue > 0 ? (
                              <span className="text-emerald-450">+{fmt(item.varianceValue)}</span>
                            ) : item.varianceValue < 0 ? (
                              <span className="text-rose-455">{fmt(item.varianceValue)}</span>
                            ) : (
                              <span className="text-slate-500">0 ج</span>
                            )
                          ) : (
                            <span className="text-slate-650">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-slate-850 px-6 py-4 border-t border-slate-800 flex justify-between shrink-0">
              <div>
                {activeSession.status !== 'POSTED' && (
                  <button
                    onClick={handleSaveDraft}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition border border-slate-700"
                  >
                    حفظ كمسودة
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowSessionModal(false)}
                  className="px-4 py-2 bg-slate-850 hover:bg-slate-800 text-slate-350 rounded-xl text-xs font-bold transition border border-slate-800"
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