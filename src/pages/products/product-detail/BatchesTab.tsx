import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { Palette, Plus, X, Trash2, Loader2 } from 'lucide-react';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { BatchService } from '../../../services/domains/inventory/BatchService';
import { ProductBatch } from '../../../types';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { BranchAccessService } from '../../../services/domains/auth/BranchAccessService';

import { useToast } from '../../../components/ui/Toast';
interface BatchesTabProps {
  productId: string;
  canEdit: boolean;
  canViewCosts: boolean;
  canUpdatePricing: boolean;
}

export const BatchesTab: React.FC<BatchesTabProps> = ({ productId, canEdit, canViewCosts, canUpdatePricing }) => {
  const toast = useToast();
  const batchService = useMemo(() => new BatchService(), []);
  const db = useMemo(() => DatabaseManager.getInstance(), []);
  const branchAccess = useMemo(() => new BranchAccessService(), []);
  const [batches, setBatches] = useState<ProductBatch[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({
    warehouseId: '',
    batchNumber: '',
    toneShade: '',
    caliber: '0',
    grade: '',
    quantityM2: '',
    costPrice: '',
    receivedDate: '',
    productionDate: '',
    notes: '',
  });
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    try {
      setBatches(batchService.getBatchesForProduct(productId));
      const scope = branchAccess.warehouseBranchScope('w', undefined, AuthService.requireAuth());
      setWarehouses(db.query<{ id: string; name: string }>(`SELECT w.id, w.name FROM warehouses w WHERE w.is_active = 1 AND ${scope.clause} ORDER BY w.name`, scope.params));
    } catch (e) { console.error(e); }
  }, [productId, batchService, branchAccess, db]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.warehouseId || !form.batchNumber.trim() || !form.toneShade.trim() || !Number(form.quantityM2)) return;
    setSaving(true);
    try {
      batchService.createBatch({
        productId,
        warehouseId:     form.warehouseId,
        batchNumber:     form.batchNumber.trim(),
        toneShade:       form.toneShade.trim(),
        caliber:         form.caliber.trim() || '0',
        grade:           form.grade.trim() || undefined,
        quantityM2:      Number(form.quantityM2),
        costPrice:       canUpdatePricing ? Number(form.costPrice) || 0 : undefined,
        receivedDate:    form.receivedDate   || undefined,
        productionDate:  form.productionDate  || undefined,
        notes:           form.notes.trim()    || undefined,
      });
      setForm({ warehouseId: form.warehouseId, batchNumber: '', toneShade: '', caliber: '0', grade: '', quantityM2: '', costPrice: '', receivedDate: '', productionDate: '', notes: '' });
      setFormOpen(false);
      load();
    } catch (err: any) { toast.error(err?.message || 'تعذر إضافة الدفعة'); }
    finally { setSaving(false); }
  };

  const handleDelete = (id: string, batchNumber: string) => {
    if (!confirm(`حذف الدفعة "${batchNumber}"؟`)) return;
    try { batchService.deleteBatch(id); load(); } catch (err: any) { toast.error(err?.message); }
  };

  // تجميع الدفعات حسب مجموعات النغمة/العيار/الفرز لعرض الملخص
  const toneGroups = batches.reduce<Record<string, { tone: string; caliber: string; grade: string; totalM2: number; remainingM2: number }>>((acc, b) => {
    const grade = b.grade || '';
    const key = `${b.toneShade}||${b.caliber}||${grade}`;
    if (!acc[key]) acc[key] = { tone: b.toneShade, caliber: b.caliber, grade, totalM2: 0, remainingM2: 0 };
    acc[key].totalM2     += b.quantityM2;
    acc[key].remainingM2 += b.quantityRemainingM2;
    return acc;
  }, {});

  const fmtM2 = (n: number) => n.toFixed(2);

  return (
    <div className="space-y-5">
      {/* ملخص النغمات */}
      {Object.keys(toneGroups).length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2"><Palette className="w-4 h-4 text-violet-500" /> ملخص النغمات المتاحة</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {Object.values(toneGroups).map((g) => (
              <div key={`${g.tone}-${g.caliber}-${g.grade}`} className="p-3 rounded-xl border border-slate-100 bg-slate-50">
                <div className="text-xs font-bold text-slate-700 mb-1">
                  نغمة: <span className="text-violet-600">{g.tone}</span>
                  {g.caliber && g.caliber !== '0' && <span className="mr-2 text-amber-600">عيار: {g.caliber}</span>}
                  {g.grade && <span className="mr-2 text-sky-600">فرز: {g.grade}</span>}
                </div>
                <div className="text-base font-black text-sky-600">{fmtM2(g.remainingM2)} م²</div>
                <div className="text-[10px] text-slate-400">مستلم: {fmtM2(g.totalM2)} م²</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* زر إضافة دفعة */}
      {canEdit && (
        <div>
          {!formOpen ? (
            <button
              onClick={() => setFormOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition"
            >
              <Plus className="w-4 h-4" /> تسجيل استلام دفعة / تشغيلة
            </button>
          ) : (
            <form onSubmit={handleAdd} className="bg-white border border-sky-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Palette className="w-4 h-4 text-sky-500" /> تسجيل استلام دفعة / تشغيلة</h4>
                <button type="button" onClick={() => setFormOpen(false)} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">المخزن *</label>
                  <select required value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200">
                    <option value="">اختر المخزن</option>
                    {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">رقم التشغيلة / الدفعة *</label>
                  <input required placeholder="مثال: LOT-2024-001" value={form.batchNumber} onChange={(e) => setForm({ ...form, batchNumber: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">نغمة اللون (Shade) *</label>
                  <input required placeholder="مثال: A12 أو Shade-3" value={form.toneShade} onChange={(e) => setForm({ ...form, toneShade: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">العيار (Caliber)</label>
                  <input placeholder="مثال: 0 أو 1" value={form.caliber} onChange={(e) => setForm({ ...form, caliber: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">الفرز / الدرجة</label>
                  <input placeholder="مثال: GRADE_1 أو فرز أول" value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">الكمية (م²) *</label>
                  <input required type="number" min={0.01} step="0.01" placeholder="0.00" value={form.quantityM2} onChange={(e) => setForm({ ...form, quantityM2: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" />
                </div>
                {canUpdatePricing && <div>
                  <label className="block font-bold text-slate-700 mb-1">سعر التكلفة (م²)</label>
                  <input type="number" min={0} step="0.01" placeholder="0.00" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" />
                </div>}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">تاريخ الاستلام</label>
                  <input type="date" value={form.receivedDate} onChange={(e) => setForm({ ...form, receivedDate: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">تاريخ الإنتاج</label>
                  <input type="date" value={form.productionDate} onChange={(e) => setForm({ ...form, productionDate: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" />
                </div>
                <div className="col-span-2 md:col-span-1">
                  <label className="block font-bold text-slate-700 mb-1">ملاحظات</label>
                  <input placeholder="اختياري" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold">إلغاء</button>
                <button type="submit" disabled={saving} className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} تسجيل الاستلام
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* جدول الدفعات */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {batches.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <Palette className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-medium">لا توجد دفعات مسجلة لهذا الصنف</p>
            <p className="text-xs text-slate-400 mt-1">تسجيل الدفعة ينشئ استلاماً مخزنياً ويحدّث الرصيد ودفتر الحركة وطبقة التكلفة تلقائياً</p>
          </div>
        ) : (
          <DataTable
            ariaLabel="دفعات المنتج"
            rows={batches}
            rowKey={(b: any) => String(b.id)}
            tableClassName="text-sm"
            rowClassName={(b: any) => `transition hover:bg-slate-50/70 ${b.quantityRemainingM2 <= 0.001 ? 'opacity-50' : ''}`}
            columns={[
              { key: 'wh', header: 'المخزن', render: (b: any) => <span className="text-xs text-slate-600">{b.warehouseName || '—'}</span> },
              { key: 'num', header: 'رقم الدفعة', render: (b: any) => <span className="font-mono text-xs font-bold text-slate-800">{b.batchNumber}</span> },
              {
                key: 'tone', header: 'نغمة اللون',
                render: (b: any) => <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-700"><Palette className="h-3 w-3" /> {b.toneShade}</span>,
              },
              { key: 'cal', header: 'العيار', render: (b: any) => <span className="font-mono text-xs font-bold text-amber-700">{b.caliber || '0'}</span> },
              {
                key: 'grade', header: 'الفرز',
                render: (b: any) => b.grade ? <span className="inline-flex rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-700">{b.grade}</span> : <span className="text-slate-400">—</span>,
              },
              {
                key: 'date', header: 'تاريخ الاستلام',
                render: (b: any) => <span className="text-xs text-slate-500">{b.receivedDate ? new Date(b.receivedDate).toLocaleDateString('ar-EG') : (b.createdAt ? new Date(b.createdAt).toLocaleDateString('ar-EG') : '—')}</span>,
              },
              { key: 'qty', header: 'الكمية (م²)', render: (b: any) => <span className="font-mono text-slate-700">{fmtM2(b.quantityM2)}</span> },
              {
                key: 'remain', header: 'المتبقي (م²)',
                render: (b: any) => {
                  const consumedPct = b.quantityM2 > 0 ? ((b.quantityM2 - b.quantityRemainingM2) / b.quantityM2) * 100 : 0;
                  const isEmpty = b.quantityRemainingM2 <= 0.001;
                  return (
                    <span className="flex items-center gap-2">
                      <span className={`font-mono font-bold ${isEmpty ? 'text-slate-400' : 'text-emerald-600'}`}>{fmtM2(b.quantityRemainingM2)}</span>
                      {!isEmpty && (
                        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200">
                          <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(0, 100 - consumedPct)}%` }} />
                        </span>
                      )}
                      {isEmpty && <span className="text-[10px] font-bold text-slate-400">مُستهلكة</span>}
                    </span>
                  );
                },
              },
              ...(canViewCosts ? [{ key: 'cost', header: 'التكلفة/م²', render: (b: any) => <span className="font-mono text-xs text-rose-600">{b.costPrice > 0 ? `${b.costPrice.toFixed(2)} ج.م` : '—'}</span> }] : []),
              ...(canEdit ? [{
                key: 'del', header: 'حذف',
                render: (b: any) => {
                  const isEmpty = b.quantityRemainingM2 <= 0.001;
                  return (
                    <button
                      onClick={() => handleDelete(b.id, b.batchNumber)}
                      disabled={!isEmpty}
                      title={isEmpty ? 'حذف الدفعة' : 'لا يمكن الحذف — يوجد رصيد'}
                      className={`rounded-lg p-1.5 transition ${isEmpty ? 'text-slate-400 hover:bg-rose-50 hover:text-rose-600' : 'cursor-not-allowed text-slate-200'}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  );
                },
              }] : []),
            ]}
          />
        )}
      </div>
    </div>
  );
};
