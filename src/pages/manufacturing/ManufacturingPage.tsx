import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Factory, Loader2, Plus, RefreshCw } from 'lucide-react';
import { ManufacturingService } from '../../services/ManufacturingService';
import { ProductService } from '../../services/ProductService';
import { BranchService } from '../../services/BranchService';
import { usePermission } from '../../hooks/usePermission';
import { useToast } from '../../components/ui/Toast';

export const ManufacturingPage: React.FC = () => {
  const service = useMemo(() => new ManufacturingService(), []);
  const toast = useToast();
  const can = usePermission();
  const canManage = can('manufacturing.manage');

  const [tab, setTab] = useState<'workCenters' | 'boms' | 'orders'>('workCenters');
  const [workCenters, setWorkCenters] = useState<any[]>([]);
  const [boms, setBoms] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [wcForm, setWcForm] = useState({ code: '', name: '', branchId: '' });
  const [bomForm, setBomForm] = useState({ productId: '', name: '', version: '1.0', componentProductId: '', quantity: '' });
  const [orderForm, setOrderForm] = useState({ productId: '', bomId: '', quantity: '', branchId: '' });

  const load = useCallback(() => {
    setLoading(true);
    try {
      setWorkCenters(service.getWorkCenters());
      setBoms(service.getBoms());
      setOrders(service.getProductionOrders());
      setProducts(new ProductService().getAllProducts());
      setBranches(new BranchService().getAllBranches());
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تحميل بيانات التصنيع.');
    } finally {
      setLoading(false);
    }
  }, [service, toast]);

  useEffect(() => { load(); }, [load]);

  const createWorkCenter = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      service.createWorkCenter({ code: wcForm.code, name: wcForm.name, branchId: wcForm.branchId || undefined });
      setWcForm({ code: '', name: '', branchId: '' });
      toast.success('تم إضافة مركز العمل.');
      load();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر إضافة مركز العمل.');
    }
  };

  const createBom = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      service.createBom({
        productId: bomForm.productId,
        name: bomForm.name,
        version: bomForm.version,
        items: [{ componentProductId: bomForm.componentProductId, quantity: Number(bomForm.quantity) || 0 }],
      });
      setBomForm({ productId: '', name: '', version: '1.0', componentProductId: '', quantity: '' });
      toast.success('تم إنشاء BOM.');
      load();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر إنشاء BOM.');
    }
  };

  const createOrder = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      service.createProductionOrder({
        productId: orderForm.productId,
        bomId: orderForm.bomId,
        quantity: Number(orderForm.quantity) || 0,
        branchId: orderForm.branchId || undefined,
      });
      setOrderForm({ productId: '', bomId: '', quantity: '', branchId: '' });
      toast.success('تم إنشاء أمر الإنتاج.');
      load();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر إنشاء أمر الإنتاج.');
    }
  };

  const release = (id: string) => {
    try { service.releaseOrder(id); toast.success('تم إصدار الأمر.'); load(); }
    catch (error: any) { toast.error(error?.message || 'تعذر إصدار الأمر.'); }
  };

  const start = (id: string) => {
    try { service.startOrder(id); toast.success('تم بدء الأمر.'); load(); }
    catch (error: any) { toast.error(error?.message || 'تعذر بدء الأمر.'); }
  };

  const complete = (id: string) => {
    if (!window.confirm('إكمال أمر الإنتاج؟ سيتم صرف جميع المواد.')) return;
    try { service.completeOrder(id); toast.success('تم إكمال الأمر.'); load(); }
    catch (error: any) { toast.error(error?.message || 'تعذر إكمال الأمر.'); }
  };

  const cancel = (id: string) => {
    if (!window.confirm('إلغاء أمر الإنتاج؟')) return;
    try { service.cancelOrder(id); toast.success('تم إلغاء الأمر.'); load(); }
    catch (error: any) { toast.error(error?.message || 'تعذر إلغاء الأمر.'); }
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800">
            <Factory className="h-5 w-5 text-sky-600" /> التصنيع
          </h1>
          <p className="text-sm text-slate-500">BOM، مراكز عمل، وأوامر إنتاج مع تتبع المواد والعمليات.</p>
        </div>
        <button className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600" onClick={load} title="تحديث">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {[
          { key: 'workCenters', label: 'مراكز العمل' },
          { key: 'boms', label: 'BOM' },
          { key: 'orders', label: 'أوامر الإنتاج' },
        ].map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key as any)}
            className={`px-4 py-2 text-xs font-bold rounded-t-lg transition ${tab === item.key ? 'bg-white border border-slate-200 border-b-white text-sky-600 -mb-px' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white p-10">
          <Loader2 className="h-6 w-6 animate-spin text-sky-500" />
        </div>
      ) : (
        <>
          {tab === 'workCenters' && (
            <div className="grid gap-3 lg:grid-cols-3">
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white lg:col-span-2">
                <table className="w-full text-right text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="p-3">الرمز</th>
                      <th className="p-3">الاسم</th>
                      <th className="p-3">التكلفة/ساعة</th>
                      <th className="p-3">السعة/يوم</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workCenters.map((row) => (
                      <tr key={row.id} className="border-t border-slate-100">
                        <td className="p-3 font-mono text-xs">{row.code}</td>
                        <td className="p-3">{row.name}</td>
                        <td className="p-3">{row.costPerHour}</td>
                        <td className="p-3">{row.capacityPerDay}</td>
                      </tr>
                    ))}
                    {workCenters.length === 0 && (
                      <tr><td colSpan={4} className="p-8 text-center text-slate-400">لا توجد مراكز عمل.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {canManage && (
                <form onSubmit={createWorkCenter} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-xs">
                  <h3 className="font-black text-slate-900">إضافة مركز عمل</h3>
                  <input required placeholder="الرمز" value={wcForm.code} onChange={(e) => setWcForm({ ...wcForm, code: e.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5" />
                  <input required placeholder="الاسم" value={wcForm.name} onChange={(e) => setWcForm({ ...wcForm, name: e.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5" />
                  <select value={wcForm.branchId} onChange={(e) => setWcForm({ ...wcForm, branchId: e.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5">
                    <option value="">الفرع الافتراضي</option>
                    {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                  </select>
                  <button type="submit" className="flex w-full items-center justify-center gap-1 rounded-lg bg-sky-600 py-1.5 font-bold text-white">
                    <Plus className="h-3.5 w-3.5" /> إضافة
                  </button>
                </form>
              )}
            </div>
          )}

          {tab === 'boms' && (
            <div className="grid gap-3 lg:grid-cols-3">
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white lg:col-span-2">
                <table className="w-full text-right text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="p-3">المنتج</th>
                      <th className="p-3">الاسم</th>
                      <th className="p-3">الإصدار</th>
                      <th className="p-3">الحالة</th>
                      <th className="p-3">المكوّنات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {boms.map((bom) => (
                      <tr key={bom.id} className="border-t border-slate-100">
                        <td className="p-3">{bom.productName}</td>
                        <td className="p-3">{bom.name}</td>
                        <td className="p-3">{bom.version}</td>
                        <td className="p-3">{bom.status}</td>
                        <td className="p-3 text-xs text-slate-500">{(bom.items || []).map((item: any) => `${item.componentName || item.componentProductId} × ${item.quantity}`).join('، ')}</td>
                      </tr>
                    ))}
                    {boms.length === 0 && (
                      <tr><td colSpan={5} className="p-8 text-center text-slate-400">لا توجد BOM.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {canManage && (
                <form onSubmit={createBom} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-xs">
                  <h3 className="font-black text-slate-900">إنشاء BOM</h3>
                  <select required value={bomForm.productId} onChange={(e) => setBomForm({ ...bomForm, productId: e.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5">
                    <option value="">المنتج المصنّع</option>
                    {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                  </select>
                  <input required placeholder="اسم BOM" value={bomForm.name} onChange={(e) => setBomForm({ ...bomForm, name: e.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5" />
                  <input placeholder="الإصدار" value={bomForm.version} onChange={(e) => setBomForm({ ...bomForm, version: e.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5" />
                  <select required value={bomForm.componentProductId} onChange={(e) => setBomForm({ ...bomForm, componentProductId: e.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5">
                    <option value="">مكوّن</option>
                    {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                  </select>
                  <input required type="number" min="0.001" step="0.001" placeholder="الكمية" value={bomForm.quantity} onChange={(e) => setBomForm({ ...bomForm, quantity: e.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5" />
                  <button type="submit" className="flex w-full items-center justify-center gap-1 rounded-lg bg-sky-600 py-1.5 font-bold text-white">
                    <Plus className="h-3.5 w-3.5" /> إنشاء
                  </button>
                </form>
              )}
            </div>
          )}

          {tab === 'orders' && (
            <div className="grid gap-3 lg:grid-cols-3">
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white lg:col-span-2">
                <table className="w-full text-right text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="p-3">الرقم</th>
                      <th className="p-3">المنتج</th>
                      <th className="p-3">الكمية</th>
                      <th className="p-3">الحالة</th>
                      <th className="p-3">الإجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.id} className="border-t border-slate-100">
                        <td className="p-3 font-mono text-xs">{order.orderNumber}</td>
                        <td className="p-3">{order.productName}</td>
                        <td className="p-3">{order.quantity}</td>
                        <td className="p-3">{order.status}</td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1">
                            {canManage && order.status === 'PLANNED' && (
                              <button className="rounded bg-sky-50 px-2 py-1 text-xs text-sky-700" onClick={() => release(order.id)}>إصدار</button>
                            )}
                            {canManage && order.status === 'RELEASED' && (
                              <button className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-700" onClick={() => start(order.id)}>بدء</button>
                            )}
                            {canManage && order.status === 'IN_PROGRESS' && (
                              <>
                                <button className="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-700" onClick={() => complete(order.id)}>إكمال</button>
                                <button className="rounded bg-rose-50 px-2 py-1 text-xs text-rose-700" onClick={() => cancel(order.id)}>إلغاء</button>
                              </>
                            )}
                            {canManage && order.status === 'PLANNED' && (
                              <button className="rounded bg-rose-50 px-2 py-1 text-xs text-rose-700" onClick={() => cancel(order.id)}>إلغاء</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {orders.length === 0 && (
                      <tr><td colSpan={5} className="p-8 text-center text-slate-400">لا توجد أوامر إنتاج.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {canManage && (
                <form onSubmit={createOrder} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-xs">
                  <h3 className="font-black text-slate-900">إنشاء أمر إنتاج</h3>
                  <select required value={orderForm.productId} onChange={(e) => setOrderForm({ ...orderForm, productId: e.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5">
                    <option value="">المنتج</option>
                    {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                  </select>
                  <select required value={orderForm.bomId} onChange={(e) => setOrderForm({ ...orderForm, bomId: e.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5">
                    <option value="">BOM نشط</option>
                    {boms.filter((bom) => bom.status === 'ACTIVE').map((bom) => <option key={bom.id} value={bom.id}>{bom.name} ({bom.version})</option>)}
                  </select>
                  <input required type="number" min="0.001" step="0.001" placeholder="الكمية" value={orderForm.quantity} onChange={(e) => setOrderForm({ ...orderForm, quantity: e.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5" />
                  <select value={orderForm.branchId} onChange={(e) => setOrderForm({ ...orderForm, branchId: e.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5">
                    <option value="">الفرع الافتراضي</option>
                    {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                  </select>
                  <button type="submit" className="flex w-full items-center justify-center gap-1 rounded-lg bg-sky-600 py-1.5 font-bold text-white">
                    <Plus className="h-3.5 w-3.5" /> إنشاء
                  </button>
                </form>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
