import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Hash, PackageSearch, Plus, RefreshCw, ShieldAlert, Wrench } from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card, StatCard } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { FormField } from '../../../components/ui/FormField';
import { useToast } from '../../../components/ui/Toast';
import { usePermission } from '../../../hooks/domains/auth/usePermission';
import { ProductSerialService } from '../../../services/domains/inventory/ProductSerialService';
import { InventoryService } from '../../../services/domains/inventory/InventoryService';
import { ProductPicker } from '../../../components/products/ProductPicker';
import type { Product, ProductSerial, Warehouse } from '../../../types';

const inputCls = 'w-full rounded-lg border border-[var(--cerami-border)] bg-[var(--cerami-surface)] px-3 py-2 text-sm';
const selectCls = inputCls;

const STATUS_LABEL: Record<ProductSerial['status'], string> = {
  IN_STOCK: 'متاح',
  SOLD: 'مباع',
  DAMAGED: 'تالف / محجر',
  RETURNED: 'مُرجع',
};

const STATUS_TONE: Record<ProductSerial['status'], string> = {
  IN_STOCK: 'bg-success-soft text-success',
  SOLD: 'bg-primary/10 text-primary',
  DAMAGED: 'bg-danger-soft text-danger',
  RETURNED: 'bg-warning-soft text-warning',
};

export const ProductSerialsPage: React.FC = () => {
  const service = useMemo(() => new ProductSerialService(), []);
  const toast = useToast();
  const can = usePermission();
  const canView = can('inventory.serials.view') || can('inventory.view');
  const canManage = can('inventory.serials.manage');

  const [serials, setSerials] = useState<ProductSerial[]>([]);
  const [stats, setStats] = useState<ReturnType<ProductSerialService['getStats']> | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | ProductSerial['status']>('ALL');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [registerOpen, setRegisterOpen] = useState(false);
  const [regProductId, setRegProductId] = useState('');
  const [regProduct, setRegProduct] = useState<Product | null>(null);
  const [regWarehouseId, setRegWarehouseId] = useState('');
  const [regSerialsText, setRegSerialsText] = useState('');
  const [regPurchaseInvoice, setRegPurchaseInvoice] = useState('');
  const [regNotes, setRegNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!canView) { setLoading(false); return; }
    setLoading(true);
    try {
      setSerials(service.listSerials({
        status: statusFilter,
        warehouseId: warehouseFilter || undefined,
        productId: productFilter || undefined,
        search: search || undefined,
        limit: 500,
      }));
      setStats(service.getStats());
      setWarehouses(can('inventory.view') ? new InventoryService().getAllWarehouses() : []);
    } catch (e: any) {
      toast.error('تعذر تحميل الأرقام التسلسلية', e?.message || 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, [service, canView, can, statusFilter, warehouseFilter, productFilter, search, toast]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => serials, [serials]);

  const openRegister = () => {
    setRegProductId(''); setRegProduct(null); setRegWarehouseId(warehouses[0]?.id || '');
    setRegSerialsText(''); setRegPurchaseInvoice(''); setRegNotes('');
    setRegisterOpen(true);
  };

  const submitRegister = () => {
    const numbers = regSerialsText.split(/\r?\n|[,،]/).map((n) => n.trim()).filter(Boolean);
    if (!regProductId) { toast.warning('اختر المنتج أولاً.'); return; }
    if (!regWarehouseId) { toast.warning('اختر المخزن.'); return; }
    if (!numbers.length) { toast.warning('أدخل رقماً تسلسلياً واحداً على الأقل — رقماً في كل سطر.'); return; }
    setBusy(true);
    try {
      const created = service.registerSerials({
        productId: regProductId,
        warehouseId: regWarehouseId,
        serialNumbers: numbers,
        purchaseInvoiceNumber: regPurchaseInvoice.trim() || undefined,
        notes: regNotes.trim() || undefined,
      });
      // تفعيل التتبع تلقائياً عند تسجيل أول أرقام للمنتج.
      if (regProduct && !regProduct.trackSerials) {
        try { service.setTracking(regProductId, true); } catch { /* الصلاحية قد تمنع التفعيل — التسلسل يبقى صالحاً */ }
      }
      toast.success(`تم تسجيل ${created.length} رقم تسلسلي`, regProduct?.name);
      setRegisterOpen(false);
      load();
    } catch (e: any) {
      toast.error('تعذر تسجيل الأرقام', e?.message || 'حدث خطأ');
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = (serial: ProductSerial, status: 'IN_STOCK' | 'DAMAGED') => {
    try {
      service.setStatus(serial.id, status, status === 'DAMAGED' ? 'وُسم تالفاً من صفحة الأرقام التسلسلية' : 'أُعيد للإتاحة');
      toast.success(status === 'DAMAGED' ? 'تم تعليم الرقم كتالف' : 'أُعيد الرقم للإتاحة', serial.serialNumber);
      load();
    } catch (e: any) {
      toast.error('تعذر تغيير الحالة', e?.message || 'حدث خطأ');
    }
  };

  if (!canView) {
    return (
      <Card className="p-8 text-center text-sm text-muted">
        لا تملك صلاحية عرض الأرقام التسلسلية. اطلب من المدير منحك «عرض الأرقام التسلسلية».
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="الأرقام التسلسلية والـ IMEI"
        description="تتبع كل وحدة منتج برقم تسلسلي/IMEI: الاستلام، البيع على الفاتورة، المرتجع، والتالف. فعّل «تتبع بالأرقام التسلسلية» من تعديل المنتج."
        icon={<Hash className="w-6 h-6" />}
        actions={<div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={load} leadingIcon={<RefreshCw className="w-4 h-4" />}>تحديث</Button>
          {canManage && <Button size="sm" onClick={openRegister} leadingIcon={<Plus className="w-4 h-4" />}>تسجيل أرقام</Button>}
        </div>}
      />

      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatCard label="الإجمالي" value={stats.total} icon={<Hash className="w-4 h-4" />} />
          <StatCard label="متاح" value={stats.inStock} tone="success" icon={<PackageSearch className="w-4 h-4" />} />
          <StatCard label="مباع" value={stats.sold} icon={<Hash className="w-4 h-4" />} />
          <StatCard label="تالف / محجر" value={stats.damaged} tone="danger" icon={<ShieldAlert className="w-4 h-4" />} />
          <StatCard label="مُرجع" value={stats.returned} tone="warning" icon={<Wrench className="w-4 h-4" />} />
        </div>
      )}

      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث برقم تسلسلي / اسم المنتج / كود الصنف…"
            className={inputCls}
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className={selectCls} aria-label="تصفية بالحالة">
            <option value="ALL">كل الحالات</option>
            {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select value={warehouseFilter} onChange={(e) => setWarehouseFilter(e.target.value)} className={selectCls} aria-label="تصفية بالمخزن">
            <option value="">كل المخازن</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <div>
            <ProductPicker
              value={productFilter}
              onChange={(id) => setProductFilter(id)}
              placeholder="تصفية بمنتج معين"
            />
          </div>
        </div>

        {loading ? (
          <p className="py-10 text-center text-sm text-muted">جارٍ التحميل…</p>
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">
            لا توجد أرقام تسلسلية مسجلة{canManage ? ' — ابدأ بـ«تسجيل أرقام»' : ''}.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-right text-[11px] font-black text-muted">
                  <th className="px-2 py-2">الرقم التسلسلي</th>
                  <th className="px-2 py-2">المنتج</th>
                  <th className="px-2 py-2">المخزن</th>
                  <th className="px-2 py-2">الحالة</th>
                  <th className="px-2 py-2">فاتورة البيع</th>
                  <th className="px-2 py-2">التواريخ</th>
                  {canManage && <th className="px-2 py-2">إجراءات</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} className="border-b border-line/60 last:border-0">
                    <td className="px-2 py-2 font-mono font-black text-ink" dir="ltr">{s.serialNumber}</td>
                    <td className="px-2 py-2 font-bold text-ink">{s.productName}</td>
                    <td className="px-2 py-2 text-muted">{s.warehouseName || '—'}</td>
                    <td className="px-2 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${STATUS_TONE[s.status]}`}>
                        {STATUS_LABEL[s.status] ?? s.status}
                      </span>
                    </td>
                    <td className="px-2 py-2 font-mono text-[11px] text-muted">{s.saleInvoiceNumber || '—'}</td>
                    <td className="px-2 py-2 text-[10px] text-muted">
                      {s.soldAt ? `بيع ${String(s.soldAt).slice(0, 10)}` : s.receivedAt ? `استلام ${String(s.receivedAt).slice(0, 10)}` : '—'}
                    </td>
                    {canManage && (
                      <td className="px-2 py-2">
                        {s.status === 'IN_STOCK' && (
                          <Button variant="secondary" size="sm" onClick={() => changeStatus(s, 'DAMAGED')}>تالف</Button>
                        )}
                        {s.status === 'DAMAGED' && (
                          <Button variant="secondary" size="sm" onClick={() => changeStatus(s, 'IN_STOCK')}>إعادة للإتاحة</Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={registerOpen}
        onClose={() => !busy && setRegisterOpen(false)}
        title="تسجيل أرقام تسلسلية / IMEI"
        description="أدخل رقماً في كل سطر. سيُفعَّل «تتبع الأرقام التسلسلية» على المنتج تلقائياً إن لم يكن مفعّلاً."
        size="lg"
        busy={busy}
        footer={<div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setRegisterOpen(false)} disabled={busy}>إلغاء</Button>
          <Button onClick={submitRegister} disabled={busy} leadingIcon={<Plus className="w-4 h-4" />}>تسجيل</Button>
        </div>}
      >
        <div className="space-y-3">
          <FormField label="المنتج" required>
            <ProductPicker
              value={regProductId}
              onChange={(id, product) => { setRegProductId(id); setRegProduct(product); }}
              placeholder="اختر المنتج"
            />
          </FormField>
          <FormField label="المخزن" required>
            <select value={regWarehouseId} onChange={(e) => setRegWarehouseId(e.target.value)} className={selectCls}>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </FormField>
          <FormField label="الأرقام التسلسلية" required hint="رقم واحد في كل سطر — مثال: IMEI أو Serial">
            <textarea
              value={regSerialsText}
              onChange={(e) => setRegSerialsText(e.target.value)}
              rows={8}
              dir="ltr"
              className={`${inputCls} font-mono text-left`}
              placeholder={'350123456789012\n350123456789013\n350123456789014'}
            />
          </FormField>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="رقم فاتورة الشراء (اختياري)" hint="لربط الأرقام بفاتورة التوريد">
              <input value={regPurchaseInvoice} onChange={(e) => setRegPurchaseInvoice(e.target.value)} className={inputCls} placeholder="مثال: PINV-000123" dir="ltr" />
            </FormField>
            <FormField label="ملاحظات (اختياري)">
              <input value={regNotes} onChange={(e) => setRegNotes(e.target.value)} className={inputCls} />
            </FormField>
          </div>
        </div>
      </Modal>
    </div>
  );
};
