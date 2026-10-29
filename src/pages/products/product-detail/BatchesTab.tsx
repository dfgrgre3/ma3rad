import React, { useEffect, useState } from 'react';
import { Palette, Plus, X, Trash2, Loader2 } from 'lucide-react';
import { DatabaseManager } from '../../../database/db';
import { BatchService } from '../../../services/BatchService';
import { ProductBatch } from '../../../types';

interface BatchesTabProps {
  productId: string;
  canEdit: boolean;
  canViewCosts: boolean;
  canUpdatePricing: boolean;
}

export const BatchesTab: React.FC<BatchesTabProps> = ({ productId, canEdit, canViewCosts, canUpdatePricing }) => {
  const batchService = new BatchService();
  const db = DatabaseManager.getInstance();
  const [batches, setBatches] = useState<ProductBatch[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({
    warehouseId: '',
    batchNumber: '',
    toneShade: '',
    caliber: '0',
    quantityM2: '',
    costPrice: '',
    receivedDate: '',
    productionDate: '',
    notes: '',
  });
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () => {
    try {
      setBatches(batchService.getBatchesForProduct(productId));
      setWarehouses(db.query<{ id: string; name: string }>(`SELECT id, name FROM warehouses WHERE is_active = 1 ORDER BY name`));
    } catch (e) { console.error(e); }
  };

  useEffect(() => { load(); }, [productId]);

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
        quantityM2:      Number(form.quantityM2),
        costPrice:       canUpdatePricing ? Number(form.costPrice) || 0 : undefined,
        receivedDate:    form.receivedDate   || undefined,
        productionDate:  form.productionDate  || undefined,
        notes:           form.notes.trim()    || undefined,
      });
      setForm({ warehouseId: form.warehouseId, batchNumber: '', toneShade: '', caliber: '0', quantityM2: '', costPrice: '', receivedDate: '', productionDate: '', notes: '' });
      setFormOpen(false);
      load();
    } catch (err: any) { alert(err?.message || 'تعذر إضافة الدفعة'); }
    finally { setSaving(false); }
  };

  const handleDelete = (id: string, batchNumber: string) => {
    if (!confirm(`حذف الدفعة "${batchNumber}"؟`)) return;
    try { batchService.deleteBatch(id); load(); } catch (err: any) { alert(err?.message); }
  };

  // تجميع الدفعات حسب مجموعات النغمة/العيار لعرض الملخص
  const toneGroups = batches.reduce<Record<string, { tone: string; caliber: string; totalM2: number; remainingM2: number }>>((acc, b) => {
    const key = `${b.toneShade}||${b.caliber}`;
    if (!acc[key]) acc[key] = { tone: b.toneShade, caliber: b.caliber, totalM2: 0, remainingM2: 0 };
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.values(toneGroups).map((g) => (
              <div key={`${g.tone}-${g.caliber}`} className="p-3 rounded-xl border border-slate-100 bg-slate-50">
                <div className="text-xs font-bold text-slate-700 mb-1">
                  نغمة: <span className="text-violet-600">{g.tone}</span>
                  {g.caliber && g.caliber !== '0' && <span className="mr-2 text-amber-600">عيار: {g.caliber}</span>}
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
              <Plus className="w-4 h-4" /> تسجيل دفعة / تشغيلة جديدة
            </button>
          ) : (
            <form onSubmit={handleAdd} className="bg-white border border-sky-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Palette className="w-4 h-4 text-sky-500" /> تسجيل دفعة / تشغيلة جديدة</h4>
                <button type="button" onClick={() => setFormOpen(false)} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
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
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} حفظ الدفعة
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
            <p className="text-xs text-slate-400 mt-1">سجّل أول دفعة عند استلام الشحنة لتفعيل التتبع وتحذيرات خلط النغمات</p>
          </div>
        ) : (
          <table className="w-full text-sm text-right">
            <thead className="bg-slate-50">
              <tr>
                {['المخزن', 'رقم الدفعة', 'نغمة اللون', 'العيار', 'تاريخ الاستلام', 'الكمية (م²)', 'المتبقي (م²)', ...(canViewCosts ? ['التكلفة/م²'] : []), ...(canEdit ? ['حذف'] : [])].map((h) => (
                  <th key={h} className="px-4 py-3 text-xs font-bold text-slate-500 text-right">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {batches.map((b) => {
                const consumedPct = b.quantityM2 > 0 ? ((b.quantityM2 - b.quantityRemainingM2) / b.quantityM2) * 100 : 0;
                const isEmpty = b.quantityRemainingM2 <= 0.001;
                return (
                  <tr key={b.id} className={`hover:bg-slate-50/70 ${isEmpty ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 text-slate-600 text-xs">{b.warehouseName || '—'}</td>
                    <td className="px-4 py-3 font-mono font-bold text-slate-800 text-xs">{b.batchNumber}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-violet-100 text-violet-700">
                        <Palette className="w-3 h-3" /> {b.toneShade}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-amber-700 font-bold">{b.caliber || '0'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{b.receivedDate ? new Date(b.receivedDate).toLocaleDateString('ar-EG') : (b.createdAt ? new Date(b.createdAt).toLocaleDateString('ar-EG') : '—')}</td>
                    <td className="px-4 py-3 font-mono text-slate-700">{fmtM2(b.quantityM2)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`font-mono font-bold ${isEmpty ? 'text-slate-400' : 'text-emerald-600'}`}>{fmtM2(b.quantityRemainingM2)}</span>
                        {!isEmpty && (
                          <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.max(0, 100 - consumedPct)}%` }} />
                          </div>
                        )}
                        {isEmpty && <span className="text-[10px] text-slate-400 font-bold">مُستهلكة</span>}
                      </div>
                    </td>
                    {canViewCosts && <td className="px-4 py-3 font-mono text-rose-600 text-xs">{b.costPrice > 0 ? `${b.costPrice.toFixed(2)} ج.م` : '—'}</td>}
                    {canEdit && (
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleDelete(b.id, b.batchNumber)}
                          disabled={!isEmpty}
                          title={isEmpty ? 'حذف الدفعة' : 'لا يمكن الحذف — يوجد رصيد'}
                          className={`p-1.5 rounded-lg transition ${isEmpty ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50' : 'text-slate-200 cursor-not-allowed'}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
