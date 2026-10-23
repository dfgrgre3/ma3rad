import React, { useEffect, useState } from 'react';
import { Boxes, Plus, Calendar, User, DollarSign, Search, Loader2, X, Wallet, TrendingUp, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ProjectService, Project, ProjectStatus } from '../../services/ProjectService';
import { CustomerService } from '../../services/CustomerService';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import type { Customer } from '../../types';

const STATUS: Record<ProjectStatus, { label: string; color: string; bg: string }> = {
  PLANNED:   { label: 'قيد التخطيط', color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200' },
  ACTIVE:    { label: 'جاري التنفيذ', color: 'text-sky-700',    bg: 'bg-sky-50 border-sky-200' },
  ON_HOLD:   { label: 'متوقف',        color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' },
  COMPLETED: { label: 'مكتمل',        color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
  CANCELLED: { label: 'ملغي',         color: 'text-rose-700',   bg: 'bg-rose-50 border-rose-200' },
};

const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(Math.round(n)) + ' ج';

export const ProjectsPage: React.FC = () => {
  const service = new ProjectService();
  const navigate = useNavigate();
  const user = AuthService.getCurrentUser();
  const canCreate = PermissionService.can(user, 'projects.create');

  const [projects, setProjects] = useState<Project[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', customerId: '', projectType: 'BUILDING', contractorName: '',
    engineerName: '', city: '', startDate: '', expectedEndDate: '', contractValue: '', notes: '',
  });

  const load = () => {
    setLoading(true);
    try {
      setProjects(service.getProjects(search));
      setCustomers(new CustomerService().getAllCustomers());
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل المشاريع.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const filtered = projects.filter((p) => statusFilter === 'ALL' || p.status === statusFilter);
  const active = projects.filter((p) => p.status === 'ACTIVE').length;
  const totalValue = projects.reduce((s, p) => s + (p.contractValue || 0), 0);
  const totalSold = projects.reduce((s, p) => s + (p.totalSold || 0), 0);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const project = service.createProject({
        name: form.name,
        customerId: form.customerId,
        projectType: form.projectType as any,
        contractorName: form.contractorName || undefined,
        engineerName: form.engineerName || undefined,
        city: form.city || undefined,
        startDate: form.startDate || undefined,
        expectedEndDate: form.expectedEndDate || undefined,
        contractValue: Number(form.contractValue) || 0,
        notes: form.notes || undefined,
      });
      setModalOpen(false);
      setForm({ name: '', customerId: '', projectType: 'BUILDING', contractorName: '', engineerName: '', city: '', startDate: '', expectedEndDate: '', contractValue: '', notes: '' });
      navigate(`/projects/${project.id}`);
    } catch (err: any) {
      alert(err?.message || 'تعذر إنشاء المشروع.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Boxes className="w-5 h-5 text-violet-600" />
          <h1 className="text-base font-black text-slate-900">مشاريع المقاولين والعملاء</h1>
          <span className="text-xs bg-violet-50 text-violet-600 px-2 py-0.5 rounded-full font-bold border border-violet-200">{projects.length}</span>
        </div>
        {canCreate && (
          <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-sm font-semibold transition self-start sm:self-auto">
            <Plus className="w-4 h-4" /> مشروع جديد
          </button>
        )}
      </div>

      <div className="p-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'إجمالي المشاريع', value: String(projects.length), icon: Boxes, color: 'text-violet-600 bg-violet-50' },
          { label: 'مشاريع جارية', value: String(active), icon: Calendar, color: 'text-sky-600 bg-sky-50' },
          { label: 'قيمة العقود', value: fmt(totalValue), icon: Wallet, color: 'text-emerald-600 bg-emerald-50' },
          { label: 'إجمالي المبيعات', value: fmt(totalSold), icon: TrendingUp, color: 'text-amber-600 bg-amber-50' },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${card.color} flex items-center justify-center`}><Icon className="w-5 h-5" /></div>
              <div>
                <p className="text-[10px] text-slate-500 font-bold">{card.label}</p>
                <p className="text-sm font-black text-slate-900">{card.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-4 pb-3 flex flex-col md:flex-row gap-3">
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="relative flex-1">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم، الكود أو العميل ثم Enter..." className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-sky-400" />
        </form>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:border-sky-400 min-w-[160px]">
          <option value="ALL">جميع الحالات</option>
          {Object.entries(STATUS).map(([key, st]) => <option key={key} value={key}>{st.label}</option>)}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {error && <div className="mb-3 px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{error}</div>}
        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-sky-500" /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((project) => {
              const st = STATUS[project.status];
              return (
                <div key={project.id} onClick={() => navigate(`/projects/${project.id}`)} className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 p-5 cursor-pointer transition-all hover:shadow-lg group">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="font-bold text-slate-900 text-sm leading-snug group-hover:text-sky-600 transition">{project.name}</h3>
                    <span className={`text-[10px] px-2 py-1 rounded-lg font-bold whitespace-nowrap border ${st.bg} ${st.color}`}>{st.label}</span>
                  </div>
                  <p className="text-[10px] font-mono text-slate-400 mb-3">{project.code}</p>
                  <div className="space-y-2 text-xs text-slate-500">
                    <div className="flex items-center gap-2"><User className="w-3.5 h-3.5" />{project.customerName}</div>
                    <div className="flex items-center gap-2"><DollarSign className="w-3.5 h-3.5" /><span className="text-sky-600 font-bold">{fmt(project.contractValue)}</span></div>
                    <div className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5" />{project.startDate || '—'}</div>
                    {project.unitsCount ? (
                      <div className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5" />{project.deliveredUnits || 0} / {project.unitsCount} وحدة</div>
                    ) : null}
                  </div>
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1.5">
                      <span>التقدم</span><span className="font-bold text-slate-900">{project.progress || 0}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${project.progress === 100 ? 'bg-emerald-500' : 'bg-sky-500'}`} style={{ width: `${project.progress || 0}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="col-span-full py-16 text-center text-slate-500 border-2 border-dashed border-slate-200 rounded-2xl bg-white">
                <Boxes className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-sm">لا توجد مشاريع مطابقة</p>
              </div>
            )}
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold text-slate-900">مشروع جديد</h3>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="font-bold text-slate-700 block mb-1">اسم المشروع *</label>
                  <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-semibold" />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">العميل *</label>
                  <select required value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                    <option value="">— اختر العميل —</option>
                    {customers.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>)}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">نوع المشروع</label>
                  <select value={form.projectType} onChange={(e) => setForm({ ...form, projectType: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                    <option value="BUILDING">عمارة</option>
                    <option value="VILLA">فيلا</option>
                    <option value="APARTMENT">شقة</option>
                    <option value="COMPOUND">كومباوند</option>
                    <option value="COMMERCIAL">تجاري</option>
                    <option value="OTHER">أخرى</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">المقاول</label>
                  <input value={form.contractorName} onChange={(e) => setForm({ ...form, contractorName: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">المهندس المسؤول</label>
                  <input value={form.engineerName} onChange={(e) => setForm({ ...form, engineerName: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">المدينة</label>
                  <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">قيمة العقد (ج)</label>
                  <input type="number" min="0" step="0.01" value={form.contractValue} onChange={(e) => setForm({ ...form, contractValue: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">تاريخ البدء</label>
                  <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">التسليم المتوقع</label>
                  <input type="date" value={form.expectedEndDate} onChange={(e) => setForm({ ...form, expectedEndDate: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" />
                </div>
                <div className="col-span-2">
                  <label className="font-bold text-slate-700 block mb-1">ملاحظات</label>
                  <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl">إلغاء</button>
                <button type="submit" disabled={saving} className="px-5 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-bold rounded-xl flex items-center gap-2">
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} إنشاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
