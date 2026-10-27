import React, { useEffect, useState } from 'react';
import { Activity, Plus, Search, Calendar, CheckCircle2, Clock, Phone, AlertCircle, User, MessageSquare, X, Loader2 } from 'lucide-react';
import { CrmService, CrmActivity } from '../../services/CrmService';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';

import { TYPE_CONFIG } from './crmActivityConfig';
import { CrmActivityModal } from './CrmActivityModal';

export const CrmActivitiesPage: React.FC = () => {
  const service = new CrmService();
  const user = AuthService.getCurrentUser();
  const canCreate = PermissionService.can(user, 'crm.create');
  const canUpdate = PermissionService.can(user, 'crm.update');

  const [activities, setActivities] = useState<CrmActivity[]>([]);
  const [leads, setLeads] = useState<Array<{ id: string; name: string; phone: string }>>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    leadId: '', activityType: 'CALL', subject: '', scheduledAt: '', body: '',
  });

  const load = () => {
    setLoading(true);
    try {
      setActivities(service.getActivities(search));
      setLeads(service.getActiveLeadsForSelect());
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل الأنشطة.');
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.leadId) { alert('يرجى اختيار العميل المحتمل.'); return; }
    setSaving(true);
    try {
      service.createActivity({
        leadId: form.leadId,
        activityType: form.activityType,
        subject: form.subject,
        body: form.body || undefined,
        scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : undefined,
      });
      setModalOpen(false);
      setForm({ leadId: '', activityType: 'CALL', subject: '', scheduledAt: '', body: '' });
      load();
    } catch (err: any) {
      alert(err?.message || 'تعذر إضافة النشاط.');
    } finally {
      setSaving(false);
    }
  };

  const markDone = (id: string) => {
    try { service.completeActivity(id); load(); } catch (err: any) { alert(err?.message); }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-200 flex items-center justify-center">
            <Activity className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-base font-black text-slate-900">الأنشطة والمتابعات</h1>
            <p className="text-xs text-slate-500">سجل وتخطيط الفعاليات والمتابعات مع العملاء</p>
          </div>
        </div>
        {canCreate && (
          <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold transition shrink-0 self-start sm:self-auto">
            <Plus className="w-4 h-4" /> جدولة نشاط جديد
          </button>
        )}
      </div>

      <div className="p-4 bg-white border-b border-slate-200 flex gap-3">
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="relative flex-1">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="بحث باسم العميل، الوصف، الملاحظات ثم Enter..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-violet-400 transition"
          />
        </form>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {error && <div className="max-w-3xl mx-auto mb-3 px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{error}</div>}
        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-violet-500" /></div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-6 relative before:absolute before:right-6 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
            {activities.map((act) => {
              const config = TYPE_CONFIG[act.activityType] || TYPE_CONFIG.NOTE;
              const Icon = config.icon;
              return (
                <div key={act.id} className="relative pr-12 group">
                  <div className={`absolute right-3.5 top-1.5 w-6 h-6 rounded-full border-2 border-white flex items-center justify-center z-10 ${act.status === 'COMPLETED' ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600'}`}>
                    {act.status === 'COMPLETED' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                  </div>

                  <div className="bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-4 transition">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black text-slate-900">{act.leadName || '—'}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold border ${config.color} flex items-center gap-1`}>
                          <Icon className="w-3 h-3" /> {config.label}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1 sm:self-auto self-start">
                        <Clock className="w-3 h-3" />
                        {(act.scheduledAt || act.createdAt)?.replace('T', ' ').slice(0, 16)}
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-slate-800 mb-1.5">{act.subject}</h4>
                    {act.body && (
                      <p className="text-xs text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-100 leading-relaxed">{act.body}</p>
                    )}

                    {act.status === 'PENDING' && canUpdate && (
                      <div className="mt-3">
                        <button onClick={() => markDone(act.id)} className="px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 rounded-lg text-[10px] font-bold transition">
                          تحديد كمكتمل
                        </button>
                      </div>
                    )}
                    {act.status !== 'PENDING' && (
                      <span className={`mt-3 inline-block px-2 py-0.5 rounded-md text-[10px] font-bold ${act.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                        {act.status === 'COMPLETED' ? 'مكتمل' : 'ملغي'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {activities.length === 0 && (
              <div className="py-16 text-center text-slate-500 border-2 border-dashed border-slate-200 rounded-2xl bg-white">
                <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-sm">لا توجد أنشطة مجدولة أو مسجلة حالياً</p>
              </div>
            )}
          </div>
        )}
      </div>

      {modalOpen && <CrmActivityModal leads={leads} form={form} setForm={setForm} saving={saving} onClose={() => setModalOpen(false)} onSubmit={handleCreate} />}
    </div>
  );
};
