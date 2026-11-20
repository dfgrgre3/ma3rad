import React, { useEffect, useState } from 'react';
import { UserRound, Plus, Search, Filter, Phone, Mail, Building2, Tag, Calendar, X, Loader2, ArrowLeftRight, Trash2 } from 'lucide-react';
import { CrmService, Lead, LeadStage } from '../../../services/domains/crm/CrmService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { OperationalFieldService, type OperationalFieldDefinition } from '../../../services/domains/products/OperationalFieldService';
import { OperationalFieldsForm } from '../../../components/products/OperationalFieldsForm';
import { OperationalFieldsFilter, matchesOperationalFieldFilters, type OperationalFieldFilters } from '../../../components/products/OperationalFieldsFilter';
import { PageHeader } from '../../../components/ui/PageHeader';
import { OperationalFieldsSummary } from '../../../components/products/OperationalFieldsSummary';
import { OperationalFieldsRecordEditor } from '../../../components/products/OperationalFieldsRecordEditor';

import { useToast } from '../../../components/ui/Toast';
import { useBusinessTerm } from '../../../hooks/domains/config/useBusinessTerm';
const STATUS_LABELS: Record<LeadStage, { label: string; color: string }> = {
  NEW: { label: 'عميل محتمل جديد', color: 'bg-surface-sunken text-ink-secondary border-line-strong' },
  CONTACTED: { label: 'تم التواصل', color: 'bg-accent-soft text-primary border-accent-border' },
  QUALIFIED: { label: 'مؤهل للشراء', color: 'bg-accent-soft text-primary border-accent-border' },
  QUOTATION: { label: 'تم تقديم عرض', color: 'bg-warning-soft text-warning border-warning-border' },
  NEGOTIATION: { label: 'مرحلة التفاوض', color: 'bg-warning-soft text-warning border-warning-border' },
  WON: { label: 'كسبت الفرصة', color: 'bg-success-soft text-success border-success-border' },
  LOST: { label: 'فرصة ضائعة', color: 'bg-danger-soft text-danger border-danger-border' },
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
  const toast = useToast();
  const newLeadLabel = useBusinessTerm('actions.newLead');
  const service = new CrmService();
  const fieldService = new OperationalFieldService();
  const user = AuthService.getCurrentUser();
  const canCreate = PermissionService.can(user, 'ui.crm.leads.create');
  const canUpdate = PermissionService.can(user, 'ui.crm.leads.update');
  const canDelete = PermissionService.can(user, 'ui.crm.leads.delete');

  const [leads, setLeads] = useState<Lead[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState<OperationalFieldDefinition[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [valuesByLead, setValuesByLead] = useState<Record<string, Record<string, string>>>({});
  const [fieldFilters, setFieldFilters] = useState<OperationalFieldFilters>({});
  const [form, setForm] = useState({
    name: '', phone: '', email: '', city: '', source: 'WALK_IN',
    leadType: 'RETAIL', estimatedValue: '', notes: '',
  });

  const load = () => {
    setLoading(true);
    try {
      const currentLeads = service.getLeads(search);
      setLeads(currentLeads);
      setFields(fieldService.getDefinitions('leads'));
      const valueMap = fieldService.getRecordValuesForRecords('leads', currentLeads.map((lead) => lead.id));
      setValuesByLead(valueMap);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل البيانات.');
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const filtered = leads.filter((lead) =>
    (statusFilter === 'ALL' || lead.stage === statusFilter)
    && matchesOperationalFieldFilters(lead.id, valuesByLead, fieldFilters),
  );

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      fieldService.validateRecordValues('leads', values, 'create');
      const created = service.createLead({
        name: form.name,
        phone: form.phone,
        email: form.email || undefined,
        city: form.city || undefined,
        source: form.source,
        leadType: form.leadType,
        estimatedValue: Number(form.estimatedValue) || 0,
        notes: form.notes || undefined,
      });
      fieldService.setRecordValues('leads', created.id, values, 'create');
      setModalOpen(false);
      setValues({});
      setForm({ name: '', phone: '', email: '', city: '', source: 'WALK_IN', leadType: 'RETAIL', estimatedValue: '', notes: '' });
      load();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر إضافة العميل المحتمل.');
    } finally {
      setSaving(false);
    }
  };

  const handleStage = (lead: Lead, stage: LeadStage) => {
    try {
      service.updateLead(lead.id, { stage });
      load();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر تحديث المرحلة.');
    }
  };

  const handleDelete = (lead: Lead) => {
    if (!confirm(`هل أنت متأكد من حذف العميل المحتمل "${lead.name}"؟`)) return;
    try {
      service.deleteLead(lead.id);
      load();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر حذف العميل.');
    }
  };

  const handleConvert = (lead: Lead) => {
    if (!confirm(`تحويل "${lead.name}" إلى عميل مسجل؟`)) return;
    try {
      service.convertLeadToCustomer(lead.id);
      load();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر تحويل العميل.');
    }
  };

  return (
    <div className="h-full flex flex-col bg-surface-muted text-ink overflow-hidden">
      <div className="bg-surface border-b border-line px-6 pt-4">
        <PageHeader
          icon={<UserRound className="w-5 h-5" />}
          title="العملاء المحتملون (Leads)"
          description="متابعة الفرص التسويقية والمهتمين بالمعرض"
          actions={canCreate && (
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary text-white rounded-xl text-sm font-semibold transition shrink-0 self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" /> إضافة {newLeadLabel}
            </button>
          )}
        />
      </div>

      <div className="p-4 bg-surface border-b border-line flex flex-col md:flex-row gap-3">
        <form
          onSubmit={(e) => { e.preventDefault(); load(); }}
          className="relative flex-1"
        >
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            placeholder="بحث بالاسم، الهاتف، البريد أو الكود ثم اضغط إدخال..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-4 pr-10 py-2.5 bg-surface border border-line rounded-xl text-sm focus:outline-none focus:border-primary transition"
          />
        </form>
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="appearance-none pl-10 pr-4 py-2.5 bg-surface border border-line rounded-xl text-sm text-ink font-medium focus:outline-none focus:border-primary transition cursor-pointer min-w-[170px]"
          >
            <option value="ALL">جميع المراحل</option>
            {Object.entries(STATUS_LABELS).map(([key, value]) => (
              <option key={key} value={key}>{value.label}</option>
            ))}
          </select>
          <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
        </div>
        <OperationalFieldsFilter fields={fields} values={fieldFilters} onChange={setFieldFilters} />
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {error && <div className="mb-3 px-4 py-2.5 rounded-xl bg-danger-soft border border-danger-border text-danger text-xs font-semibold">{error}</div>}
        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((lead) => {
              const statusInfo = STATUS_LABELS[lead.stage];
              return (
                <div key={lead.id} className="bg-surface border border-line hover:border-line-strong rounded-xl p-5 transition flex flex-col justify-between group">
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold border ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                      <span className="text-[10px] text-muted flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {lead.createdAt?.slice(0, 10)}
                      </span>
                    </div>

                    <h3 className="font-extrabold text-ink group-hover:text-primary transition">{lead.name}</h3>
                    <div className="flex items-center gap-1.5 text-xs text-muted mt-1">
                      <Building2 className="w-3.5 h-3.5" />
                      <span className="font-mono">{lead.code}</span>
                      {lead.city && <span>• {lead.city}</span>}
                    </div>

                    <div className="bg-surface-muted rounded-lg p-3 mt-3 border border-line">
                      <div className="text-[10px] text-primary font-extrabold flex items-center gap-1 mb-1">
                        <Tag className="w-3 h-3" /> القيمة التقديرية
                      </div>
                      <OperationalFieldsSummary fields={fields} values={valuesByLead[lead.id] || {}} />
                      <OperationalFieldsRecordEditor
                        recordLabel={lead.name}
                        fields={fields}
                        initialValues={valuesByLead[lead.id] || {}}
                        canEdit={canUpdate}
                        onSave={(next) => {
                          fieldService.setRecordValues('leads', lead.id, next, 'update');
                          setValuesByLead((previous) => ({ ...previous, [lead.id]: next }));
                        }}
                      />
                      <p className="text-sm font-black text-ink">{fmt(lead.estimatedValue || 0)}</p>
                    </div>

                    {canUpdate && lead.stage !== 'WON' && (
                      <div className="mt-3 flex items-center gap-2">
                        <select
                          value={lead.stage}
                          onChange={(e) => handleStage(lead, e.target.value as LeadStage)}
                          className="flex-1 px-2 py-1.5 text-[11px] font-bold bg-surface border border-line rounded-lg focus:outline-none focus:border-primary"
                        >
                          {Object.entries(STATUS_LABELS).map(([key, value]) => (
                            <option key={key} value={key}>{value.label}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleConvert(lead)}
                          title="تحويل إلى عميل مسجل"
                          className="p-1.5 rounded-lg bg-success-soft text-success border border-success-border hover:bg-success-soft transition"
                        >
                          <ArrowLeftRight className="w-4 h-4" />
                        </button>
                        {canDelete && (
                          <button
                            onClick={() => handleDelete(lead)}
                            title="حذف العميل المحتمل"
                            className="p-1.5 rounded-lg bg-danger-soft text-danger border border-danger-border hover:bg-danger-soft transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 pt-4 border-t border-line flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <a href={`tel:${lead.phone}`} className="p-2 rounded-lg bg-surface-muted border border-line hover:border-accent-border text-muted hover:text-primary transition" title="اتصال هاتف">
                        <Phone className="w-4 h-4" />
                      </a>
                      {lead.email && (
                        <a href={`mailto:${lead.email}`} className="p-2 rounded-lg bg-surface-muted border border-line hover:border-accent-border text-muted hover:text-primary transition" title="إرسال بريد">
                          <Mail className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                    <span className="text-[11px] font-mono text-muted" dir="ltr">{lead.phone}</span>
                  </div>
                </div>
              );
            })}

            {filtered.length === 0 && (
              <div className="col-span-full py-16 flex flex-col items-center justify-center text-muted bg-surface border-2 border-dashed border-line rounded-2xl">
                <UserRound className="w-12 h-12 text-muted mb-3" />
                <p className="text-sm">لا توجد نتائج مطابقة للبحث أو التصفية</p>
              </div>
            )}
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl border border-line shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold text-ink">{newLeadLabel}</h3>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg text-muted hover:bg-surface-sunken"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="lead-name" className="font-bold text-ink block mb-1">الاسم *</label>
                  <input id="lead-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line font-semibold" />
                </div>
                <OperationalFieldsForm fields={fields} values={values} onChange={setValues} title="بيانات إضافية للفرصة" />
                <div>
                  <label htmlFor="lead-phone" className="font-bold text-ink block mb-1">الهاتف *</label>
                  <input id="lead-phone" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line font-mono" />
                </div>
                <div>
                  <label htmlFor="lead-email" className="font-bold text-ink block mb-1">البريد الإلكتروني</label>
                  <input id="lead-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line" />
                </div>
                <div>
                  <label htmlFor="lead-city" className="font-bold text-ink block mb-1">المدينة</label>
                  <input id="lead-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line" />
                </div>
                <div>
                  <label htmlFor="lead-source" className="font-bold text-ink block mb-1">المصدر</label>
                  <select id="lead-source" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line font-bold">
                    {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="lead-type" className="font-bold text-ink block mb-1">نوع العميل</label>
                  <select id="lead-type" value={form.leadType} onChange={(e) => setForm({ ...form, leadType: e.target.value })} className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line font-bold">
                    {LEAD_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label htmlFor="lead-estimated-value" className="font-bold text-ink block mb-1">القيمة التقديرية (ج)</label>
                  <input id="lead-estimated-value" type="number" min="0" step="0.01" value={form.estimatedValue} onChange={(e) => setForm({ ...form, estimatedValue: e.target.value })} className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line font-mono" />
                </div>
                <div className="col-span-2">
                  <label htmlFor="lead-notes" className="font-bold text-ink block mb-1">ملاحظات</label>
                  <textarea id="lead-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-line">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 bg-surface-sunken text-ink font-bold rounded-xl">إلغاء</button>
                <button type="submit" disabled={saving} className="px-5 py-2 bg-primary hover:bg-primary disabled:opacity-60 text-white font-bold rounded-xl flex items-center gap-2">
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
