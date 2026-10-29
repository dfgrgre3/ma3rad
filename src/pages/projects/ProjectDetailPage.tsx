import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight, Boxes, Building2, Calendar, CheckCircle2, DollarSign, Loader2,
  MapPin, Package, Plus, Trash2, User, Wallet, X, Activity,
} from 'lucide-react';
import { ProjectService, Project, ProjectUnit, ProjectProduct, ProjectStatus } from '../../services/ProjectService';
import { ProjectControlsPanel } from '../../components/ProjectControlsPanel';
import { ProductService } from '../../services/ProductService';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import type { Product } from '../../types';

const STATUS: Record<ProjectStatus, { label: string; color: string }> = {
  PLANNED: { label: 'قيد التخطيط', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  ACTIVE: { label: 'جاري التنفيذ', color: 'text-sky-700 bg-sky-50 border-sky-200' },
  ON_HOLD: { label: 'متوقف', color: 'text-orange-700 bg-orange-50 border-orange-200' },
  COMPLETED: { label: 'مكتمل', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  CANCELLED: { label: 'ملغي', color: 'text-rose-700 bg-rose-50 border-rose-200' },
};

const UNIT_TYPES: Record<string, string> = {
  BUILDING: 'عمارة', FLOOR: 'طابق', APARTMENT: 'شقة', ROOM: 'غرفة',
};

const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(Math.round(n)) + ' ج';

export const ProjectDetailPage: React.FC = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const service = new ProjectService();
  const user = AuthService.getCurrentUser();
  const canUpdate = PermissionService.can(user, 'projects.update');
  const canApprove = PermissionService.can(user, 'projects.approve');

  const [project, setProject] = useState<Project | null>(null);
  const [units, setUnits] = useState<ProjectUnit[]>([]);
  const [products, setProducts] = useState<ProjectProduct[]>([]);
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'units' | 'products' | 'controls' | 'info'>('units');

  const [unitForm, setUnitForm] = useState({ name: '', unitType: 'APARTMENT', areaM2: '', parentId: '' });
  const [productForm, setProductForm] = useState({ productId: '', unitId: '', plannedQuantityM2: '', agreedPriceM2: '' });
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    try {
      const p = service.getProjectById(id);
      if (!p) { setError('المشروع غير موجود.'); return; }
      setProject(p);
      setUnits(service.getUnits(id));
      setProducts(service.getProjectProducts(id));
      setCatalog(new ProductService().getAllProducts());
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل بيانات المشروع.');
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [id]);

  const changeStatus = (status: ProjectStatus) => {
    try { service.updateProject(id, { status }); load(); } catch (e: any) { alert(e?.message); }
  };

  const addUnit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      service.createUnit({
        projectId: id,
        name: unitForm.name,
        unitType: unitForm.unitType as any,
        areaM2: Number(unitForm.areaM2) || 0,
        parentId: unitForm.parentId || undefined,
      });
      setUnitForm({ name: '', unitType: 'APARTMENT', areaM2: '', parentId: '' });
      load();
    } catch (err: any) {
      alert(err?.message || 'تعذر إضافة الوحدة.');
    } finally {
      setSaving(false);
    }
  };

  const setUnitStatus = (unit: ProjectUnit, status: ProjectUnit['status']) => {
    try { service.updateUnit(unit.id, { status }); load(); } catch (e: any) { alert(e?.message); }
  };

  const removeUnit = (unit: ProjectUnit) => {
    if (!confirm(`حذف الوحدة "${unit.name}"؟`)) return;
    try { service.deleteUnit(unit.id); load(); } catch (e: any) { alert(e?.message); }
  };

  const addProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productForm.productId) { alert('اختر المنتج.'); return; }
    setSaving(true);
    try {
      service.addProjectProduct({
        projectId: id,
        productId: productForm.productId,
        unitId: productForm.unitId || undefined,
        plannedQuantityM2: Number(productForm.plannedQuantityM2) || 0,
        agreedPriceM2: Number(productForm.agreedPriceM2) || 0,
      });
      setProductForm({ productId: '', unitId: '', plannedQuantityM2: '', agreedPriceM2: '' });
      load();
    } catch (err: any) {
      alert(err?.message || 'تعذر إضافة البند.');
    } finally {
      setSaving(false);
    }
  };

  const removeProduct = (item: ProjectProduct) => {
    if (!confirm(`حذف البند "${item.productName}"؟`)) return;
    try { service.deleteProjectProduct(item.id); load(); } catch (e: any) { alert(e?.message); }
  };

  if (loading) {
    return <div className="h-full flex items-center justify-center bg-slate-50"><Loader2 className="w-7 h-7 animate-spin text-sky-500" /></div>;
  }

  if (error || !project) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 bg-slate-50" dir="rtl">
        <Boxes className="w-12 h-12 text-slate-300" />
        <p className="text-sm text-slate-600">{error || 'المشروع غير موجود.'}</p>
        <button onClick={() => navigate('/projects')} className="px-4 py-2 bg-sky-600 text-white rounded-xl text-sm font-bold">العودة للمشاريع</button>
      </div>
    );
  }

  const st = STATUS[project.status];
  const plannedTotal = products.reduce((s, p) => s + p.plannedQuantityM2 * p.agreedPriceM2, 0);
  const deliveredTotal = products.reduce((s, p) => s + p.deliveredQuantityM2 * p.agreedPriceM2, 0);

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => navigate('/projects')} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition shrink-0" title="رجوع">
              <ArrowRight className="w-4 h-4" />
            </button>
            <div className="w-11 h-11 rounded-xl bg-violet-50 border border-violet-200 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5 text-violet-600" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-black text-slate-900 truncate">{project.name}</h1>
              <p className="text-xs text-slate-500 font-mono">{project.code} • {project.customerName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-[11px] px-3 py-1.5 rounded-lg font-bold border ${st.color}`}>{st.label}</span>
            {canUpdate && (
              <select value={project.status} onChange={(e) => changeStatus(e.target.value as ProjectStatus)} className="px-3 py-1.5 text-xs font-bold bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-sky-400">
                {Object.entries(STATUS).map(([key, s]) => <option key={key} value={key}>{s.label}</option>)}
              </select>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'قيمة العقد', value: fmt(project.contractValue), icon: Wallet, color: 'text-emerald-600 bg-emerald-50' },
          { label: 'إجمالي المبيعات', value: fmt(project.totalSold), icon: DollarSign, color: 'text-sky-600 bg-sky-50' },
          { label: 'المسدد', value: fmt(project.totalPaid), icon: CheckCircle2, color: 'text-teal-600 bg-teal-50' },
          { label: 'المتبقي', value: fmt(project.outstandingAmount), icon: Activity, color: 'text-rose-600 bg-rose-50' },
          { label: 'التقدم', value: `${project.progress || 0}%`, icon: Boxes, color: 'text-violet-600 bg-violet-50' },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="bg-white rounded-xl border border-slate-200 p-3.5 flex items-center gap-2.5">
              <div className={`w-9 h-9 rounded-lg ${card.color} flex items-center justify-center shrink-0`}><Icon className="w-4 h-4" /></div>
              <div className="min-w-0">
                <p className="text-[10px] text-slate-500 font-bold">{card.label}</p>
                <p className="text-sm font-black text-slate-900 truncate">{card.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-4">
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1.5">
            <span>نسبة الإنجاز (الوحدات المسلّمة)</span>
            <span className="font-bold text-slate-900">{project.progress || 0}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${(project.progress || 0) === 100 ? 'bg-emerald-500' : 'bg-sky-500'}`} style={{ width: `${project.progress || 0}%` }} />
          </div>
        </div>
      </div>

      <div className="px-4 mt-3 flex gap-1 border-b border-slate-200">
        {[
          { key: 'units', label: `الوحدات (${units.length})` },
          { key: 'products', label: `بنود المنتجات (${products.length})` },
          { key: 'controls', label: 'المتابعة والميزانية' },
          { key: 'info', label: 'بيانات المشروع' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            className={`px-4 py-2 text-xs font-bold rounded-t-lg transition ${tab === t.key ? 'bg-white border border-slate-200 border-b-white text-sky-600 -mb-px' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'units' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="p-3 font-bold">الوحدة</th>
                    <th className="p-3 font-bold">النوع</th>
                    <th className="p-3 font-bold">المساحة</th>
                    <th className="p-3 font-bold">الحالة</th>
                    <th className="p-3 font-bold"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {units.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="p-3 font-bold text-slate-800">
                        {u.name}
                        {u.parentId && <span className="text-[10px] text-slate-400"> (تابعة)</span>}
                      </td>
                      <td className="p-3 text-slate-500">{UNIT_TYPES[u.unitType]}</td>
                      <td className="p-3 font-mono text-slate-600">{u.areaM2} م²</td>
                      <td className="p-3">
                        {canUpdate ? (
                          <select value={u.status} onChange={(e) => setUnitStatus(u, e.target.value as any)} className={`text-[10px] font-bold px-2 py-1 rounded-lg border focus:outline-none ${u.status === 'DELIVERED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : u.status === 'IN_PROGRESS' ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                            <option value="PENDING">بالانتظار</option>
                            <option value="IN_PROGRESS">جاري</option>
                            <option value="DELIVERED">تم التسليم</option>
                          </select>
                        ) : (
                          <span className="text-[10px] font-bold">{u.status}</span>
                        )}
                      </td>
                      <td className="p-3">
                        {canUpdate && (
                          <button onClick={() => removeUnit(u)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition" title="حذف">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {units.length === 0 && (
                    <tr><td colSpan={5} className="p-8 text-center text-slate-400">لا توجد وحدات مسجلة بعد</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {canUpdate && (
              <form onSubmit={addUnit} className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 text-xs h-fit">
                <h3 className="font-black text-slate-900 flex items-center gap-1.5"><Plus className="w-4 h-4 text-violet-600" /> إضافة وحدة</h3>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">الاسم *</label>
                  <input required value={unitForm.name} onChange={(e) => setUnitForm({ ...unitForm, name: e.target.value })} placeholder="مثال: شقة 101" className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">النوع</label>
                    <select value={unitForm.unitType} onChange={(e) => setUnitForm({ ...unitForm, unitType: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                      {Object.entries(UNIT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">المساحة (م²)</label>
                    <input type="number" min="0" step="0.01" value={unitForm.areaM2} onChange={(e) => setUnitForm({ ...unitForm, areaM2: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" />
                  </div>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">تابعة لـ</label>
                  <select value={unitForm.parentId} onChange={(e) => setUnitForm({ ...unitForm, parentId: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                    <option value="">بدون (مستوى أول)</option>
                    {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <button type="submit" disabled={saving} className="w-full py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-bold rounded-xl flex items-center justify-center gap-2">
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} إضافة
                </button>
              </form>
            )}
          </div>
        )}

        {tab === 'products' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="p-3 font-bold">المنتج</th>
                    <th className="p-3 font-bold">الوحدة</th>
                    <th className="p-3 font-bold">المخطط (م²)</th>
                    <th className="p-3 font-bold">المسلّم (م²)</th>
                    <th className="p-3 font-bold">السعر/م²</th>
                    <th className="p-3 font-bold">الإجمالي</th>
                    <th className="p-3 font-bold"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {products.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="p-3 font-bold text-slate-800">{p.productName}</td>
                      <td className="p-3 text-slate-500">{p.unitName || '—'}</td>
                      <td className="p-3 font-mono">{p.plannedQuantityM2}</td>
                      <td className="p-3 font-mono">
                        {canUpdate ? (
                          <input
                            type="number" min="0" step="0.01" defaultValue={p.deliveredQuantityM2}
                            onBlur={(e) => {
                              const v = Number(e.target.value);
                              if (v !== p.deliveredQuantityM2) {
                                try { service.updateProjectProduct(p.id, { deliveredQuantityM2: v }); load(); } catch (err: any) { alert(err?.message); }
                              }
                            }}
                            className="w-20 px-2 py-1 bg-white border border-slate-200 rounded-lg font-mono"
                          />
                        ) : p.deliveredQuantityM2}
                      </td>
                      <td className="p-3 font-mono">{fmt(p.agreedPriceM2)}</td>
                      <td className="p-3 font-bold text-sky-600">{fmt(p.plannedQuantityM2 * p.agreedPriceM2)}</td>
                      <td className="p-3">
                        {canUpdate && (
                          <button onClick={() => removeProduct(p)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition" title="حذف">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {products.length === 0 && (
                    <tr><td colSpan={7} className="p-8 text-center text-slate-400">لا توجد بنود منتجات</td></tr>
                  )}
                </tbody>
                {products.length > 0 && (
                  <tfoot className="bg-slate-50 border-t border-slate-200 text-xs">
                    <tr>
                      <td colSpan={5} className="p-3 font-bold text-slate-600">الإجمالي المخطط / المسلّم</td>
                      <td className="p-3 font-black text-slate-900">{fmt(plannedTotal)}</td>
                      <td className="p-3 font-bold text-emerald-600">{fmt(deliveredTotal)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {canUpdate && (
              <form onSubmit={addProduct} className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 text-xs h-fit">
                <h3 className="font-black text-slate-900 flex items-center gap-1.5"><Package className="w-4 h-4 text-sky-600" /> إضافة بند منتج</h3>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">المنتج *</label>
                  <select required value={productForm.productId} onChange={(e) => setProductForm({ ...productForm, productId: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                    <option value="">— اختر المنتج —</option>
                    {catalog.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.size})</option>)}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">الوحدة</label>
                  <select value={productForm.unitId} onChange={(e) => setProductForm({ ...productForm, unitId: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                    <option value="">بدون تحديد</option>
                    {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">الكمية (م²) *</label>
                    <input type="number" required min="0.01" step="0.01" value={productForm.plannedQuantityM2} onChange={(e) => setProductForm({ ...productForm, plannedQuantityM2: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">السعر/م²</label>
                    <input type="number" min="0" step="0.01" value={productForm.agreedPriceM2} onChange={(e) => setProductForm({ ...productForm, agreedPriceM2: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" />
                  </div>
                </div>
                <button type="submit" disabled={saving} className="w-full py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-bold rounded-xl flex items-center justify-center gap-2">
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} إضافة
                </button>
              </form>
            )}
          </div>
        )}

        {tab === 'controls' && (
          <ProjectControlsPanel projectId={id} canUpdate={canUpdate} canApprove={canApprove} />
        )}

        {tab === 'info' && (
          <div className="bg-white rounded-xl border border-slate-200 p-5 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm">
            {[
              { label: 'كود المشروع', value: project.code, icon: Boxes },
              { label: 'العميل', value: project.customerName || '—', icon: User },
              { label: 'هاتف العميل', value: project.customerPhone || '—', icon: User },
              { label: 'نوع المشروع', value: project.projectType, icon: Building2 },
              { label: 'المقاول', value: project.contractorName || '—', icon: User },
              { label: 'هاتف المقاول', value: project.contractorPhone || '—', icon: User },
              { label: 'المهندس', value: project.engineerName || '—', icon: User },
              { label: 'هاتف المهندس', value: project.engineerPhone || '—', icon: User },
              { label: 'العنوان', value: project.address || '—', icon: MapPin },
              { label: 'المدينة', value: project.city || '—', icon: MapPin },
              { label: 'تاريخ البدء', value: project.startDate || '—', icon: Calendar },
              { label: 'التسليم المتوقع', value: project.expectedEndDate || '—', icon: Calendar },
              { label: 'تاريخ التسليم الفعلي', value: project.actualEndDate || '—', icon: Calendar },
              { label: 'ملاحظات', value: project.notes || '—', icon: Activity },
            ].map((row) => {
              const Icon = row.icon;
              return (
                <div key={row.label} className="flex items-start gap-3 border-b border-slate-100 pb-3">
                  <Icon className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[10px] text-slate-500 font-bold">{row.label}</p>
                    <p className="text-sm font-semibold text-slate-800">{row.value}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
