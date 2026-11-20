import React, { useEffect, useState } from 'react';
import { Activity, Plus, Search, CheckCircle2, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { CrmService, CrmActivity } from '../../../services/domains/crm/CrmService';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';

import { TYPE_CONFIG } from './crmActivityConfig';
import { CrmActivityModal } from './CrmActivityModal';

import { useToast } from '../../../components/ui/Toast';
import { PageHeader } from '../../../components/ui/PageHeader';
export const CrmActivitiesPage: React.FC = () => {
  const toast = useToast();
  const service = new CrmService();
  const user = AuthService.getCurrentUser();
  const canCreate = PermissionService.can(user, 'ui.crm.activities.create');
  const canUpdate = PermissionService.can(user, 'ui.crm.activities.update');

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
    if (!form.leadId) { toast.warning('يرجى اختيار العميل المحتمل.'); return; }
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
      toast.error(err?.message || 'تعذر إضافة النشاط.');
    } finally {
      setSaving(false);
    }
  };

  const markDone = (id: string) => {
    try { service.completeActivity(id); load(); } catch (err: any) { toast.error(err?.message); }
  };

  return (
    <div className="h-full flex flex-col bg-surface-muted text-ink overflow-hidden">
      <div className="bg-surface border-b border-line px-6 pt-4">
        <PageHeader
          icon={<Activity className="w-5 h-5" />}
          title="الأنشطة والمتابعات"
          description="سجل وتخطيط الفعاليات والمتابعات مع العملاء"
          actions={canCreate && (
            <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary text-white rounded-xl text-sm font-semibold transition shrink-0 self-start sm:self-auto">
              <Plus className="w-4 h-4" /> جدولة نشاط جديد
            </button>
          )}
        />
      </div>

      <div className="p-4 bg-surface border-b border-line flex gap-3">
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="relative flex-1">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            placeholder="بحث باسم العميل، الوصف، الملاحظات ثم اضغط إدخال..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-4 pr-10 py-2.5 bg-surface border border-line rounded-xl text-sm focus:outline-none focus:border-primary transition"
          />
        </form>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {error && <div className="max-w-3xl mx-auto mb-3 px-4 py-2.5 rounded-xl bg-danger-soft border border-danger-border text-danger text-xs font-semibold">{error}</div>}
        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-6 relative before:absolute before:right-6 before:top-2 before:bottom-2 before:w-0.5 before:bg-surface-sunken">
            {activities.map((act) => {
              const config = TYPE_CONFIG[act.activityType] || TYPE_CONFIG.NOTE;
              const Icon = config.icon;
              return (
                <div key={act.id} className="relative pr-12 group">
                  <div className={`absolute right-3.5 top-1.5 w-6 h-6 rounded-full border-2 border-white flex items-center justify-center z-10 ${act.status === 'COMPLETED' ? 'bg-success text-white' : 'bg-surface-sunken text-ink-secondary'}`}>
                    {act.status === 'COMPLETED' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                  </div>

                  <div className="bg-surface border border-line hover:border-line-strong rounded-xl p-4 transition">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black text-ink">{act.leadName || '—'}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold border ${config.color} flex items-center gap-1`}>
                          <Icon className="w-3 h-3" /> {config.label}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted font-mono flex items-center gap-1 sm:self-auto self-start">
                        <Clock className="w-3 h-3" />
                        {(act.scheduledAt || act.createdAt)?.replace('T', ' ').slice(0, 16)}
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-ink mb-1.5">{act.subject}</h4>
                    {act.body && (
                      <p className="text-xs text-muted bg-surface-muted p-2.5 rounded-lg border border-line leading-relaxed">{act.body}</p>
                    )}

                    {act.status === 'PENDING' && canUpdate && (
                      <div className="mt-3">
                        <button onClick={() => markDone(act.id)} className="px-3 py-1 bg-success-soft hover:bg-success-soft text-success border border-success-border rounded-lg text-[10px] font-bold transition">
                          تحديد كمكتمل
                        </button>
                      </div>
                    )}
                    {act.status !== 'PENDING' && (
                      <span className={`mt-3 inline-block px-2 py-0.5 rounded-md text-[10px] font-bold ${act.status === 'COMPLETED' ? 'bg-success-soft text-success' : 'bg-surface-sunken text-muted'}`}>
                        {act.status === 'COMPLETED' ? 'مكتمل' : 'ملغي'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {activities.length === 0 && (
              <div className="py-16 text-center text-muted border-2 border-dashed border-line rounded-2xl bg-surface">
                <AlertCircle className="w-12 h-12 text-muted mx-auto mb-3" />
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
