import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, PackageX, Plus, RefreshCw, ShieldAlert } from 'lucide-react';
import { ActivityGate } from '../../../components/ui/ActivityGate';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card, StatCard } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { FormField } from '../../../components/ui/FormField';
import { useToast } from '../../../components/ui/Toast';
import { usePermission } from '../../../hooks/domains/auth/usePermission';
import { ProductService } from '../../../services/domains/products/ProductService';
import { InventoryService } from '../../../services/domains/inventory/InventoryService';
import type { Product, Warehouse } from '../../../types';
import { ExpiryService, type ExpiryLot } from '../../../services/domains/inventory/ExpiryService';
import { useActivityControlHidden } from '../../../hooks/domains/config/useActivityUi';

const currency = new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 });
const inputCls = 'w-full rounded-lg border border-[var(--cerami-border)] bg-[var(--cerami-surface)] px-3 py-2 text-sm';
const selectCls = inputCls;

export const ExpiryPage: React.FC = () => {
  const service = useMemo(() => new ExpiryService(), []);
  const toast = useToast();
  const can = usePermission();
  const canManage = can('inventory.adjust');
  const expiryBatchesHidden = useActivityControlHidden('inventory.expiry-batches');

  const [lots, setLots] = useState<ExpiryLot[]>([]);
  const [stats, setStats] = useState<ReturnType<ExpiryService['getDashboardStats']> | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [trackedProducts, setTrackedProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'expired' | 'expiring' | 'ok'>('all');
  const [lotModal, setLotModal] = useState(false);
  const [trackModal, setTrackModal] = useState(false);
  const [lotForm, setLotForm] = useState({ productId: '', warehouseId: '', lotNumber: '', expiryDate: '', quantity: '', receivedDate: '', costPrice: '' });
  const [trackForm, setTrackForm] = useState({ productId: '', alertDays: '30' });

  const run = useCallback((fn: () => void) => {
    try { fn(); } catch (e: any) { toast.error('خطأ', e?.message || 'حدث خطأ'); }
  }, [toast]);

  const load = useCallback(() => {
    setLoading(true);
    try {
      setLots(service.getLots(filter === 'all' ? undefined : { status: filter }));
      setStats(service.getDashboardStats());
      setTrackedProducts(service.getExpiryTrackedProducts());
      setProducts(can('products.view') ? new ProductService().getAllProducts() : []);
      setWarehouses(can('inventory.view') ? new InventoryService().getAllWarehouses() : []);
    } catch (e: any) {
      toast.error('تعذر تحميل بيانات الصلاحية', e?.message);
    } finally {
      setLoading(false);
    }
  }, [service, filter, can, toast]);

  useEffect(() => { load(); }, [load]);

  const lotTone = (l: ExpiryLot) => l.isExpired ? 'bg-danger-soft text-danger' : l.isExpiringSoon ? 'bg-warning-soft text-warning' : 'bg-success-soft text-success';
  const lotLabel = (l: ExpiryLot) => l.isExpired ? `منتهي منذ ${Math.abs(l.daysToExpiry)} يوم` : l.daysToExpiry === 0 ? 'ينتهي اليوم' : `متبقي ${l.daysToExpiry} يوم`;

  return (
    <div className="space-y-4">
      <PageHeader
        title="تتبع الصلاحية والدفعات"
        description="تشغيلات المنتجات، تواريخ انتهاء الصلاحية، تنبيهات القرب من الانتهاء وحظر بيع المنتهي."
        icon={<CalendarClock className="w-6 h-6" />}
        actions={<div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={load} leadingIcon={<RefreshCw className="w-4 h-4" />}>تحديث</Button>
          {canManage && !expiryBatchesHidden && <ActivityGate element="new-batch"><Button size="sm" onClick={() => { setLotForm({ productId: '', warehouseId: '', lotNumber: '', expiryDate: '', quantity: '', receivedDate: '', costPrice: '' }); setLotModal(true); }} leadingIcon={<Plus className="w-4 h-4" />}>تشغيلة جديدة</Button></ActivityGate>}
        </div>}
      />

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="تشغيلات منتهية" value={stats.expiredCount} tone="danger" icon={<PackageX className="w-4 h-4" />} hint={currency.format(stats.expiredValue)} />
          <StatCard label="قاربت على الانتهاء" value={stats.expiringCount} tone="warning" icon={<AlertTriangle className="w-4 h-4" />} hint={currency.format(stats.expiringValue)} />
          <StatCard label="منتجات مُتتبعة" value={stats.trackedProducts} />
          <StatCard label="إجمالي التشغيلات" value={stats.totalLots} />
          <StatCard label="حالة البيع" value="محظور للمنتهي" tone="success" icon={<ShieldAlert className="w-4 h-4" />} />
        </div>
      )}

      <div className="flex gap-2 items-center flex-wrap">
        {([['all', 'الكل'], ['expired', 'منتهية'], ['expiring', 'قاربت على الانتهاء'], ['ok', 'سليمة']] as const).map(([k, v]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium ${filter === k ? 'bg-[var(--cerami-primary)] text-white' : 'bg-[var(--cerami-bg)] text-[var(--cerami-muted)]'}`}>{v}</button>
        ))}
        {canManage && <Button size="sm" variant="ghost" className="mr-auto" onClick={() => { setTrackForm({ productId: '', alertDays: '30' }); setTrackModal(true); }}>تفعيل التتبع لمنتج</Button>}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-line border-primary rounded-full animate-spin" /></div>
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-right text-[var(--cerami-muted)] border-b border-[var(--cerami-border)]">
                <th className="p-3">المنتج</th><th className="p-3">المخزن</th><th className="p-3">رقم التشغيلة</th>
                <th className="p-3">انتهاء الصلاحية</th><th className="p-3">الكمية</th><th className="p-3">المتبقي</th>
                <th className="p-3">التكلفة</th><th className="p-3">الحالة</th>{canManage && <th className="p-3"></th>}
              </tr></thead>
              <tbody>
                {lots.map((l) => (
                  <tr key={l.id} className="border-b border-[var(--cerami-border)] last:border-0 hover:bg-[var(--cerami-bg)]">
                    <td className="p-3 font-medium">{l.productName}</td>
                    <td className="p-3 text-xs">{l.warehouseName || '—'}</td>
                    <td className="p-3 font-mono text-xs">{l.lotNumber || '—'}</td>
                    <td className="p-3">{l.expiryDate}</td>
                    <td className="p-3">{l.quantity}</td>
                    <td className="p-3 font-semibold">{l.quantityRemaining}</td>
                    <td className="p-3">{currency.format(l.costPrice)}</td>
                    <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-[11px] ${lotTone(l)}`}>{lotLabel(l)}</span></td>
                    {canManage && <td className="p-3"><Button size="sm" variant="ghost" onClick={() => run(() => { service.deleteLot(l.id); load(); })}>حذف</Button></td>}
                  </tr>
                ))}
                {lots.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-[var(--cerami-muted)]">لا توجد تشغيلات — أضف تشغيلة بصلاحية لتفعيل الحظر التلقائي في نقطة البيع.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Lot modal */}
      <Modal open={lotModal} onClose={() => setLotModal(false)} title="تشغيلة / دفعة جديدة" size="md"
        footer={<div className="flex gap-2 justify-end"><Button variant="ghost" onClick={() => setLotModal(false)}>إلغاء</Button><Button onClick={() => run(() => { service.createLot({ productId: lotForm.productId, warehouseId: lotForm.warehouseId || undefined, lotNumber: lotForm.lotNumber || undefined, expiryDate: lotForm.expiryDate, quantity: Number(lotForm.quantity), receivedDate: lotForm.receivedDate || undefined, costPrice: lotForm.costPrice ? Number(lotForm.costPrice) : undefined }); setLotModal(false); load(); })}>حفظ</Button></div>}>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="المنتج" required><select className={selectCls} value={lotForm.productId} onChange={(e) => setLotForm({ ...lotForm, productId: e.target.value })}><option value="">اختر...</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></FormField>
          <FormField label="المخزن"><select className={selectCls} value={lotForm.warehouseId} onChange={(e) => setLotForm({ ...lotForm, warehouseId: e.target.value })}><option value="">—</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></FormField>
          <FormField label="رقم التشغيلة / الدفعة"><input className={inputCls} value={lotForm.lotNumber} onChange={(e) => setLotForm({ ...lotForm, lotNumber: e.target.value })} /></FormField>
          <FormField label="تاريخ انتهاء الصلاحية" required><input type="date" className={inputCls} value={lotForm.expiryDate} onChange={(e) => setLotForm({ ...lotForm, expiryDate: e.target.value })} /></FormField>
          <FormField label="الكمية" required><input type="number" step="0.01" className={inputCls} value={lotForm.quantity} onChange={(e) => setLotForm({ ...lotForm, quantity: e.target.value })} /></FormField>
          <FormField label="تاريخ الاستلام"><input type="date" className={inputCls} value={lotForm.receivedDate} onChange={(e) => setLotForm({ ...lotForm, receivedDate: e.target.value })} /></FormField>
          <FormField label="تكلفة الوحدة"><input type="number" step="0.01" className={inputCls} value={lotForm.costPrice} onChange={(e) => setLotForm({ ...lotForm, costPrice: e.target.value })} /></FormField>
        </div>
        <p className="text-[11px] text-[var(--cerami-muted)] mt-3">إنشاء تشغيلة سيُفعّل تتبع الصلاحية للمنتج تلقائياً ويحظر بيع الكمية المنتهية في نقطة البيع.</p>
      </Modal>

      {/* Track modal */}
      <Modal open={trackModal} onClose={() => setTrackModal(false)} title="تفعيل تتبع الصلاحية" size="sm"
        footer={<div className="flex gap-2 justify-end"><Button variant="ghost" onClick={() => setTrackModal(false)}>إلغاء</Button><Button onClick={() => run(() => { service.setExpiryTracking(trackForm.productId, true, Number(trackForm.alertDays)); setTrackModal(false); load(); })}>تفعيل</Button></div>}>
        <div className="space-y-3">
          <FormField label="المنتج" required><select className={selectCls} value={trackForm.productId} onChange={(e) => setTrackForm({ ...trackForm, productId: e.target.value })}><option value="">اختر...</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></FormField>
          <FormField label="أيام التنبيه قبل الانتهاء"><input type="number" className={inputCls} value={trackForm.alertDays} onChange={(e) => setTrackForm({ ...trackForm, alertDays: e.target.value })} /></FormField>
          <p className="text-[11px] text-[var(--cerami-muted)]">المنتجات المفعّلة: {trackedProducts.map((p) => p.productName).join('، ') || 'لا يوجد'}</p>
        </div>
      </Modal>
    </div>
  );
};

export default ExpiryPage;
