import React, { useEffect, useState } from 'react';
import { UserRound, Plus, Search, Filter, Phone, Mail, Building2, Tag, Calendar, X, Loader2, ArrowLeftRight } from 'lucide-react';
import { CrmService, Lead, LeadStage } from '../../services/CrmService';
import { PermissionService } from '../../services/PermissionService';
import { AuthService } from '../../services/AuthService';

const STATUS_LABELS: Record<LeadStage, { label: string; color: string }> = {
  NEW: { label: 'عميل محتمل جديد', color: 'bg-slate-100 text-slate-600 border-slate-300' },
  CONTACTED: { label: 'تم التواصل', color: 'bg-sky-50 text-sky-600 border-sky-200' },
  QUALIFIED: { label: 'مؤهل للشراء', color: 'bg-violet-50 text-violet-600 border-violet-200' },
  QUOTATION: { label: 'تم تقديم عرض', color: 'bg-amber-50 text-amber-600 border-amber-200' },
  NEGOTIATION: { label: 'مرحلة التفاوض', color: 'bg-orange-50 text-orange-600 border-orange-200' },
  WON: { label: 'كسبت الفرصة', color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
  LOST: { label: 'فرصة ضائعة', color: 'bg-rose-50 text-rose-600 border-rose-200' },
};

const SOURCES = [
  { value: 'WALK_IN', label: 'زيارة المعرض' },
  { value: 'PHONE', label: 'اتصال هاتفي' },
  { value: 'WHATSAPP', label: 'واتساب' },
  { value: 'REFERRAL', label: 'توصية عميل' },
  { value: 'SOCIAL', label: 'سوشيال ميديا' },
  { value: 'CAMPAIGN', label: 'حملة تسويقية' },
  { value: 'ENGINEER', label: 'مهندس' },
  { value: 'CONTRACTOR', label: 'مقاول' },
  { value: 'OTHER', label: 'أخرى' },
];

const LEAD_TYPES = [
  { value: 'RETAIL', label: 'قطاعي' },
  { value: 'WHOLESALE', label: 'جملة' },
  { value: 'CONTRACTOR', label: 'مقاول' },
  { value: 'ENGINEER', label: 'مهندس' },
  { value: 'PROJECT', label: 'مشروع' },
];

const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(n) + ' ج';

export const LeadsPage: React.FC = () => {
  const service = new CrmService();
  const user = AuthService.getCurrentUser();
  const canCreate = PermissionService.can(user, 'crm.create');
  const canUpdate = PermissionService.can(user, 'crm.update');

  const [leads, setLeads] = useState<Lead[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', phone: '', email: '', city: '', source: 'WALK_IN',
    leadType: 'RETAIL', estimatedValue: '', notes: '',
  });

  const load = () => {
    setLoading(true);
    try {
      setLeads(service.getLeads(search));
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل البيانات.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const filtered = leads.filter((l) => statusFilter === 'ALL' || l.stage === statusFilter);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      service.createLead({
        name: form.name,
        phone: form.phone,
        email: form.email || undefined,
        city: form.city || undefined,
        source: form.source,
        leadType: form.leadType,
        estimatedValue: Number(form.estimatedValue) || 0,
        notes: form.notes || undefined,
      });
      setModalOpen(false);
      setForm({ name: '', phone: '', email: '', city: '', source: 'WALK_IN', leadType: 'RETAIL', estimatedValue: '', notes: '' });
      load();
    } catch (err: any) {
      alert(err?.message || 'تعذر إضافة العميل المحتمل.');
    } finally {
      setSaving(false);
    }
  };

  const handleStage = (lead: Lead, stage: LeadStage) => {
    try {
      service.updateLead(lead.id, { stage });
      load();
    } catch (err: any) {
      alert(err?.message || 'تعذر تحديث المرحلة.');
    }
  };

  const handleConvert = (lead: Lead) => {
    if (!confirm(`تحويل "${lead.name}" إلى عميل مسجل؟`)) return;
    try {
      service.convertLeadToCustomer(lead.id);
      load();
    } catch (err: any) {
      alert(err?.message || 'تعذر تحويل العميل.');
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-pink-50 border border-pink-200 flex items-center justify-center">
            <UserRound className="w-5 h-5 text-pink-600" />
          </div>
          <div>
            <h1 className="text-base font-black text-slate-900">العملاء المحتملون (Leads)</h1>
            <p className="text-xs text-slate-500">متابعة الفرص التسويقية والمهتمين بالمعرض</p>
          </div>
        </div>
        {canCreate && (
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-xl text-sm font-semibold transition shrink-0 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" /> إضافة عميل محتمل
          </button>
        )}
      </div>

      <div className="p-4 bg-white border-b border-slate-200 flex flex-col md:flex-row gap-3">
        <form
          onSubmit={(e) => { e.preventDefault(); load(); }}
          className="relative flex-1"
        >
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="بحث بالاسم، الهاتف، البريد أو الكود ثم Enter..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-pink-400 transition"
          />
        </form>
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="appearance-none pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 font-medium focus:outline-none focus:border-pink-400 transition cursor-pointer min-w-[170px]"
          >
            <option value="ALL">جميع المراحل</option>
            {Object.entries(STATUS_LABELS).map(([key, value]) => (
              <option key={key} value={key}>{value.label}</option>
            ))}
          </select>
          <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {error && <div className="mb-3 px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{error}</div>}
        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-pink-500" /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((lead) => {
              const statusInfo = STATUS_LABELS[lead.stage];
              return (
                <div key={lead.id} className="bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-5 transition flex flex-col justify-between group">
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold border ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                      <span className="text-[10px] text-slate-500 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {lead.createdAt?.slice(0, 10)}
                      </span>
                    </div>

                    <h3 className="font-extrabold text-slate-900 group-hover:text-pink-600 transition">{lead.name}</h3>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
                      <Building2 className="w-3.5 h-3.5" />
                      <span className="font-mono">{lead.code}</span>
                      {lead.city && <span>• {lead.city}</span>}
                    </div>

                    <div className="bg-slate-50 rounded-lg p-3 mt-3 border border-slate-100">
                      <div className="text-[10px] text-pink-600 font-extrabold flex items-center gap-1 mb-1">
                        <Tag className="w-3 h-3" /> القيمة التقديرية
                      </div>
                      <p className="text-sm font-black text-slate-800">{fmt(lead.estimatedValue || 0)}</p>
                    </div>

                    {canUpdate && lead.stage !== 'WON' && (
                      <div className="mt-3 flex items-center gap-2">
                        <select
                          value={lead.stage}
                          onChange={(e) => handleStage(lead, e.target.value as LeadStage)}
                          className="flex-1 px-2 py-1.5 text-[11px] font-bold bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-pink-400"
                        >
                          {Object.entries(STATUS_LABELS).map(([key, value]) => (
                            <option key={key} value={key}>{value.label}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleConvert(lead)}
                          title="تحويل إلى عميل مسجل"
                          className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 transition"
                        >
                          <ArrowLeftRight className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <a href={`tel:${lead.phone}`} className="p-2 rounded-lg bg-slate-50 border border-slate-200 hover:border-sky-300 text-slate-500 hover:text-sky-600 transition" title="اتصال هاتف">
                        <Phone className="w-4 h-4" />
                      </a>
                      {lead.email && (
                        <a href={`mailto:${lead.email}`} className="p-2 rounded-lg bg-slate-50 border border-slate-200 hover:border-purple-300 text-slate-500 hover:text-purple-600 transition" title="إرسال بريد">
                          <Mail className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                    <span className="text-[11px] font-mono text-slate-500" dir="ltr">{lead.phone}</span>
                  </div>
                </div>
              );
            })}

            {filtered.length === 0 && (
              <div className="col-span-full py-16 flex flex-col items-center justify-center text-slate-500 bg-white border-2 border-dashed border-slate-200 rounded-2xl">
                <UserRound className="w-12 h-12 text-slate-300 mb-3" />
                <p className="text-sm">لا توجد نتائج مطابقة للبحث أو التصفية</p>
              </div>
            )}
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold text-slate-900">إضافة عميل محتمل جديد</h3>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">الاسم *</label>
                  <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-semibold" />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">الهاتف *</label>
                  <input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">البريد الإلكتروني</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">المدينة</label>
                  <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">المصدر</label>
                  <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                    {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">نوع العميل</label>
                  <select value={form.leadType} onChange={(e) => setForm({ ...form, leadType: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                    {LEAD_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="font-bold text-slate-700 block mb-1">القيمة التقديرية (ج)</label>
                  <input type="number" min="0" step="0.01" value={form.estimatedValue} onChange={(e) => setForm({ ...form, estimatedValue: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" />
                </div>
                <div className="col-span-2">
                  <label className="font-bold text-slate-700 block mb-1">ملاحظات</label>
                  <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl">إلغاء</button>
                <button type="submit" disabled={saving} className="px-5 py-2 bg-pink-600 hover:bg-pink-700 disabled:opacity-60 text-white font-bold rounded-xl flex items-center gap-2">
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} حفظ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
