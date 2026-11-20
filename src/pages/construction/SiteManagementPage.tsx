import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, ChevronDown, ChevronUp, ClipboardList, FileCheck2, HardHat, Loader2, Plus, Printer, UserCheck, Users,
} from 'lucide-react';
import { buildExportHtml, printHtml } from '../../utils/export/export';
import { PageHeader } from '../../components/ui/PageHeader';
import { useToast } from '../../components/ui/Toast';
import { AuthService } from '../../services/domains/auth/AuthService';
import { PermissionService } from '../../services/domains/auth/PermissionService';
import { ProjectService, type Project } from '../../services/domains/projects/ProjectService';
import {
  SiteManagementService,
  type SiteReportItemInput,
  type SiteReportItemType,
  type SubcontractorStatus,
} from '../../services/domains/projects/SiteManagementService';

const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(Math.round(Number(n) || 0)) + ' ج';
const fmtDate = (value?: string | null) => (value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('ar-EG') : '—');

const REPORT_STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'مسودة', cls: 'bg-surface-sunken text-ink-secondary' },
  SUBMITTED: { label: 'مقدم', cls: 'bg-warning-soft text-warning' },
  APPROVED: { label: 'معتمد', cls: 'bg-success-soft text-success' },
};

const SUBCONTRACTOR_STATUS: Record<SubcontractorStatus, { label: string; cls: string }> = {
  ACTIVE: { label: 'نشط', cls: 'bg-success-soft text-success' },
  INACTIVE: { label: 'موقوف', cls: 'bg-surface-sunken text-ink-secondary' },
  COMPLETED: { label: 'منتهي', cls: 'bg-accent-soft text-primary' },
};

const ITEM_TYPES: Record<SiteReportItemType, string> = {
  MATERIAL: 'مواد',
  LABOR: 'عمالة',
  EQUIPMENT: 'معدات',
  WORK: 'أعمال منفذة',
};

const WEATHERS = ['مشمس', 'غائم جزئيًا', 'غائم', 'ماطر', 'رياح قوية', 'أخرى'];

const fieldClass = () => 'w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none';

type TabKey = 'reports' | 'subcontractors' | 'subcerts';

interface SubCertRow {
  id: string; subcontractor_id: string; project_id: string;
  certificate_number: string; period_start?: string | null; period_end?: string | null;
  description: string; amount?: number; retention_percent?: number;
  retention_amount?: number; net_amount?: number; paid_amount?: number;
  status: string; payment_reference?: string | null; projectName?: string;
  subcontractorName?: string; subcontractContractNumber?: string | null;
  subcontractContractValue?: number;
}

interface ReportRow {
  id: string; project_id: string; projectName?: string; report_date: string;
  weather?: string | null; workers_count?: number; supervisor_name?: string | null;
  summary?: string | null; status: string; itemsCount?: number; itemsTotal?: number;
  createdByName?: string | null; approvedByName?: string | null;
}

interface SubcontractorRow {
  id: string; project_id: string; projectName?: string; name: string; phone?: string | null;
  specialty?: string | null; contract_value?: number; status: SubcontractorStatus; notes?: string | null;
  contract_number?: string | null; contract_date?: string | null; scope?: string | null;
  retention_percent?: number;
}

interface ItemDraft {
  itemType: SiteReportItemType;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
}

export const SiteManagementPage: React.FC = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const service = useMemo(() => new SiteManagementService(), []);
  const projectService = useMemo(() => new ProjectService(), []);
  const user = AuthService.getCurrentUser();
  const canUpdate = PermissionService.can(user, 'ui.projects.list.update');
  const canApprove = PermissionService.can(user, 'ui.projects.list.approve');

  const [tab, setTab] = useState<TabKey>('reports');
  const [projects, setProjects] = useState<Project[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [subcontractors, setSubcontractors] = useState<SubcontractorRow[]>([]);
  const [subCerts, setSubCerts] = useState<SubCertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showReportForm, setShowReportForm] = useState(false);
  const [showSubForm, setShowSubForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const [reportDetail, setReportDetail] = useState<any | null>(null);

  const [reportForm, setReportForm] = useState({
    projectId: '', date: new Date().toISOString().slice(0, 10), weather: '',
    workersCount: 0, supervisorName: '', summary: '',
  });
  const [items, setItems] = useState<ItemDraft[]>([{ itemType: 'WORK', description: '', quantity: 0, unit: '', unitCost: 0 }]);

  const [subForm, setSubForm] = useState({ projectId: '', name: '', phone: '', specialty: '', contractValue: 0, contractNumber: '', contractDate: '', scope: '', retentionPercent: 0, notes: '' });
  const [showCertForm, setShowCertForm] = useState(false);
  const [certForm, setCertForm] = useState({ subcontractorId: '', periodStart: '', periodEnd: '', description: '', amount: 0 });

  const load = useCallback(() => {
    setLoading(true);
    try {
      setProjects(projectService.getProjects());
      setReports(service.getDailyReports() as ReportRow[]);
      setSubcontractors(service.getSubcontractors() as SubcontractorRow[]);
      setSubCerts(service.getSubCertificates() as SubCertRow[]);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل بيانات المواقع.');
    } finally {
      setLoading(false);
    }
  }, [service, projectService]);

  useEffect(() => { load(); }, [load]);

  const toggleReport = async (id: string) => {
    if (expandedReport === id) { setExpandedReport(null); setReportDetail(null); return; }
    setExpandedReport(id);
    setReportDetail(null);
    try {
      setReportDetail(service.getDailyReport(id));
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تحميل التقرير.');
    }
  };

  const addItem = () => setItems((current) => [...current, { itemType: 'WORK', description: '', quantity: 0, unit: '', unitCost: 0 }]);
  const updateItem = (index: number, patch: Partial<ItemDraft>) =>
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const removeItem = (index: number) => setItems((current) => current.filter((_, i) => i !== index));

  const createReport = async () => {
    if (!reportForm.projectId) { toast.error('اختر المشروع.'); return; }
    if (!reportForm.date) { toast.error('تاريخ التقرير مطلوب.'); return; }
    const validItems: SiteReportItemInput[] = items
      .filter((item) => item.description.trim())
      .map((item) => ({
        itemType: item.itemType, description: item.description.trim(),
        quantity: Number(item.quantity) || 0, unit: item.unit || undefined,
        unitCost: Number(item.unitCost) || 0,
      }));
    setSaving(true);
    try {
      service.createDailyReport({ ...reportForm, workersCount: Number(reportForm.workersCount) || 0, items: validItems });
      toast.success('تم إنشاء التقرير اليومي للموقع.');
      setShowReportForm(false);
      setItems([{ itemType: 'WORK', description: '', quantity: 0, unit: '', unitCost: 0 }]);
      setReportForm({ projectId: '', date: new Date().toISOString().slice(0, 10), weather: '', workersCount: 0, supervisorName: '', summary: '' });
      load();
    } catch (e: any) {
      toast.error(e?.message || 'تعذر إنشاء التقرير.');
    } finally {
      setSaving(false);
    }
  };

  const createSubcontractor = async () => {
    if (!subForm.projectId) { toast.error('اختر المشروع.'); return; }
    if (!subForm.name.trim()) { toast.error('اسم المقاول الفرعي مطلوب.'); return; }
    setSaving(true);
    try {
      service.createSubcontractor({
        projectId: subForm.projectId, name: subForm.name, phone: subForm.phone || undefined,
        specialty: subForm.specialty || undefined, contractValue: Number(subForm.contractValue) || 0,
        contractNumber: subForm.contractNumber || undefined, contractDate: subForm.contractDate || undefined,
        scope: subForm.scope || undefined, retentionPercent: Number(subForm.retentionPercent) || 0,
        notes: subForm.notes || undefined,
      });
      toast.success('تمت إضافة المقاول الفرعي.');
      setShowSubForm(false);
      setSubForm({ projectId: '', name: '', phone: '', specialty: '', contractValue: 0, contractNumber: '', contractDate: '', scope: '', retentionPercent: 0, notes: '' });
      load();
    } catch (e: any) {
      toast.error(e?.message || 'تعذر إضافة المقاول الفرعي.');
    } finally {
      setSaving(false);
    }
  };

  const printReport = () => {
    if (!reportDetail) return;
    const columns = [
      { key: 'type', label: 'النوع' },
      { key: 'description', label: 'الوصف' },
      { key: 'quantity', label: 'الكمية', type: 'qty' },
      { key: 'unit', label: 'الوحدة' },
      { key: 'unitCost', label: 'تكلفة الوحدة', type: 'currency' },
      { key: 'amount', label: 'الإجمالي', type: 'currency' },
    ];
    const rows = (reportDetail.items || []).map((item: any) => ({
      type: ITEM_TYPES[item.item_type as SiteReportItemType] || item.item_type,
      description: item.productName ? `${item.productName} — ${item.description}` : item.description,
      quantity: item.quantity,
      unit: item.unit || '—',
      unitCost: fmt(item.unit_cost),
      amount: fmt(item.amount),
    }));
    const total = (reportDetail.items || []).reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0);
    try {
      printHtml(buildExportHtml({
        title: 'تقرير يومي لموقع تنفيذ',
        subtitle: `${reportDetail.projectName || ''} — ${fmtDate(reportDetail.report_date)}`,
        columns,
        rows,
        fileName: `site-report-${reportDetail.id}`,
        kpis: [
          { label: 'التاريخ', value: fmtDate(reportDetail.report_date) },
          { label: 'الطقس', value: reportDetail.weather || '—' },
          { label: 'عدد العمال', value: String(reportDetail.workers_count ?? 0) },
          { label: 'المشرف', value: reportDetail.supervisor_name || '—' },
          { label: 'إجمالي البنود', value: fmt(total) },
        ],
        notes: reportDetail.summary ? [`ملخص: ${reportDetail.summary}`] : [],
        permission: 'projects.print',
      }));
    } catch (e: any) {
      toast.error(e?.message || 'تعذر طباعة التقرير.');
    }
  };

  const printSubcontractor = (s: SubcontractorRow) => {
    const rows = [
      { field: 'رقم العقد', value: s.contract_number || '—' },
      { field: 'تاريخ العقد', value: s.contract_date ? fmtDate(s.contract_date) : '—' },
      { field: 'المشروع', value: s.projectName || '—' },
      { field: 'المقاول الفرعي', value: s.name },
      { field: 'التخصص', value: s.specialty || '—' },
      { field: 'الهاتف', value: s.phone || '—' },
      { field: 'قيمة العقد', value: fmt(s.contract_value ?? 0) },
      { field: 'نسبة الاستقطاع', value: `${s.retention_percent ?? 0}%` },
      { field: 'نطاق العمل', value: s.scope || '—' },
      { field: 'الحالة', value: SUBCONTRACTOR_STATUS[s.status]?.label || s.status },
      { field: 'ملاحظات', value: s.notes || '—' },
    ];
    try {
      printHtml(buildExportHtml({
        title: 'عقد مقاول باطن',
        subtitle: `${s.contract_number || s.name} — ${s.projectName || ''}`,
        columns: [
          { key: 'field', label: 'البند' },
          { key: 'value', label: 'القيمة' },
        ],
        rows,
        fileName: `subcontract-${s.contract_number || s.id}`,
        notes: [
          'يُحتجز نسبة الاستقطاع من كل مستخلص حتى اكتمال الأعمال واستيفاء شروط التسليم.',
          'تُسدد المستحقات للمقاول الباطن وفقًا لشهادات الإنجاز المعتمدة من استشاري المشروع.',
        ],
        permission: 'projects.print',
      }));
    } catch (e: any) {
      toast.error(e?.message || 'تعذر طباعة عقد المقاول الباطن.');
    }
  };

  const approveReport = (id: string) => {
    try {
      service.approveDailyReport(id);
      toast.success('تم اعتماد التقرير.');
      load();
      if (expandedReport === id) setExpandedReport(null);
    } catch (e: any) {
      toast.error(e?.message || 'تعذر اعتماد التقرير.');
    }
  };

  const setSubStatus = (id: string, status: SubcontractorStatus) => {
    try {
      service.updateSubcontractorStatus(id, status);
      toast.success('تم تحديث حالة المقاول.');
      load();
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تحديث الحالة.');
    }
  };

  const createSubCert = async () => {
    if (!certForm.subcontractorId) { toast.error('اختر المقاول الباطن.'); return; }
    if (!certForm.description.trim()) { toast.error('بيان الأعمال مطلوب.'); return; }
    if (!(Number(certForm.amount) > 0)) { toast.error('قيمة المستخلص يجب أن تكون أكبر من صفر.'); return; }
    setSaving(true);
    try {
      service.createSubCertificate({
        subcontractorId: certForm.subcontractorId,
        periodStart: certForm.periodStart || undefined,
        periodEnd: certForm.periodEnd || undefined,
        description: certForm.description,
        amount: Number(certForm.amount) || 0,
      });
      toast.success('تم إنشاء مستخلص المقاول الباطن.');
      setShowCertForm(false);
      setCertForm({ subcontractorId: '', periodStart: '', periodEnd: '', description: '', amount: 0 });
      load();
    } catch (e: any) {
      toast.error(e?.message || 'تعذر إنشاء المستخلص.');
    } finally {
      setSaving(false);
    }
  };

  const subCertAction = (fn: () => void, ok: string, fail: string) => {
    try { fn(); toast.success(ok); load(); }
    catch (e: any) { toast.error(e?.message || fail); }
  };

  const printSubCert = (c: SubCertRow) => {
    const statusLabel: Record<string, string> = { DRAFT: 'مسودة', SUBMITTED: 'مقدم للمراجعة', APPROVED: 'معتمد', PAID: 'مدفوع' };
    const rows = [
      { field: 'رقم المستخلص', value: c.certificate_number },
      { field: 'المشروع', value: c.projectName || '—' },
      { field: 'المقاول الباطن', value: c.subcontractorName || '—' },
      { field: 'عقد الباطن', value: c.subcontractContractNumber || '—' },
      { field: 'فترة العمل', value: `${c.period_start ? fmtDate(c.period_start) : '—'} ← ${c.period_end ? fmtDate(c.period_end) : '—'}` },
      { field: 'بيان الأعمال', value: c.description },
      { field: 'إجمالي قيمة الأعمال', value: fmt(c.amount ?? 0) },
      { field: 'نسبة الاستقطاع', value: `${c.retention_percent ?? 0}%` },
      { field: 'مبلغ الاستقطاع', value: fmt(c.retention_amount ?? 0) },
      { field: 'الصافي المستحق', value: fmt(c.net_amount ?? 0) },
      { field: 'المدفوع', value: fmt(c.paid_amount ?? 0) },
      { field: 'الحالة', value: statusLabel[c.status] || c.status },
      { field: 'مرجع الدفع', value: c.payment_reference || '—' },
    ];
    try {
      printHtml(buildExportHtml({
        title: 'مستخلص مقاول باطن',
        subtitle: `${c.certificate_number} — ${c.projectName || ''}`,
        columns: [
          { key: 'field', label: 'البند' },
          { key: 'value', label: 'القيمة' },
        ],
        rows,
        fileName: `subcert-${c.certificate_number}`,
        notes: ['يُستقطع مبلغ الاستقطاع حتى استيفاء شروط التسليم النهائية للمشروع.'],
        permission: 'projects.print',
      }));
    } catch (e: any) {
      toast.error(e?.message || 'تعذر طباعة المستخلص.');
    }
  };

  const tabs: Array<{ key: TabKey; label: string; icon: React.ReactNode; count: number }> = [
    { key: 'reports', label: 'التقارير اليومية', icon: <HardHat size={15} />, count: reports.length },
    { key: 'subcontractors', label: 'المقاولون الفرعيون', icon: <Users size={15} />, count: subcontractors.length },
    { key: 'subcerts', label: 'مستخلصات الباطن', icon: <FileCheck2 size={15} />, count: subCerts.length },
  ];

  const todayReports = reports.filter((r) => String(r.report_date).slice(0, 10) === new Date().toISOString().slice(0, 10)).length;
  const activeSubs = subcontractors.filter((s) => s.status === 'ACTIVE').length;

  return (
    <div className="space-y-5 p-4 md:p-6" dir="rtl">
      <PageHeader
        title="إدارة المواقع والتقارير اليومية"
        description="تقارير الموقع اليومية للعمالة والمواد والأعمال المنفذة، والمقاولون الفرعيون لكل مشروع."
        icon={<HardHat size={22} />}
        actions={
          <button type="button" onClick={() => navigate('/projects')} className="inline-flex items-center gap-1 rounded-lg border border-line-strong bg-surface px-3 py-2 text-xs font-bold text-ink hover:bg-surface-muted">
            <ArrowRight size={14} /> المشاريع
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'تقارير اليوم', value: String(todayReports), icon: <HardHat size={16} /> },
          { label: 'إجمالي التقارير', value: String(reports.length), icon: <ClipboardList size={16} /> },
          { label: 'مقاولون فرعيون نشطون', value: String(activeSubs), icon: <UserCheck size={16} /> },
          { label: 'إجمالي المقاولين', value: String(subcontractors.length), icon: <Users size={16} /> },
        ].map((metric) => (
          <div key={metric.label} className="rounded-xl border border-line bg-surface p-3 shadow-sm">
            <div className="flex items-center gap-2 text-[11px] font-bold text-muted">{metric.icon}{metric.label}</div>
            <div className="mt-1 text-lg font-black text-ink">{metric.value}</div>
          </div>
        ))}
      </div>

      {error && <div className="rounded-xl border border-danger-border bg-danger-soft px-4 py-3 text-sm font-bold text-danger">{error}</div>}

      <div className="flex flex-wrap gap-2 border-b border-line pb-2">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold transition ${tab === item.key ? 'bg-primary text-white' : 'bg-surface text-ink-secondary border border-line hover:bg-surface-muted'}`}
          >
            {item.icon} {item.label} <span className="rounded-full bg-black/10 px-1.5 text-[10px]">{item.count}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted"><Loader2 className="animate-spin" size={18} /> جارٍ التحميل…</div>
      ) : (
        <div className="rounded-2xl border border-line bg-surface shadow-sm">
          {/* ===== التقارير اليومية ===== */}
          {tab === 'reports' && (
            <div className="p-4">
              {canUpdate && (
                <div className="mb-4">
                  {!showReportForm ? (
                    <button type="button" onClick={() => setShowReportForm(true)} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white"><Plus size={14} /> تقرير يومي جديد</button>
                  ) : (
                    <div className="space-y-3 rounded-xl border border-accent-border bg-accent-soft/60 p-4">
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                        <label className="text-xs font-bold text-ink-secondary xl:col-span-2">المشروع
                          <select className={`${fieldClass()} mt-1`} value={reportForm.projectId} onChange={(e) => setReportForm((c) => ({ ...c, projectId: e.target.value }))}>
                            <option value="">— اختر —</option>
                            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </label>
                        <label className="text-xs font-bold text-ink-secondary">التاريخ
                          <input type="date" className={`${fieldClass()} mt-1`} value={reportForm.date} onChange={(e) => setReportForm((c) => ({ ...c, date: e.target.value }))} />
                        </label>
                        <label className="text-xs font-bold text-ink-secondary">الطقس
                          <select className={`${fieldClass()} mt-1`} value={reportForm.weather} onChange={(e) => setReportForm((c) => ({ ...c, weather: e.target.value }))}>
                            <option value="">—</option>
                            {WEATHERS.map((w) => <option key={w} value={w}>{w}</option>)}
                          </select>
                        </label>
                        <label className="text-xs font-bold text-ink-secondary">عدد العمال
                          <input type="number" min={0} className={`${fieldClass()} mt-1`} value={reportForm.workersCount} onChange={(e) => setReportForm((c) => ({ ...c, workersCount: Number(e.target.value) }))} />
                        </label>
                        <label className="text-xs font-bold text-ink-secondary">المشرف
                          <input className={`${fieldClass()} mt-1`} value={reportForm.supervisorName} onChange={(e) => setReportForm((c) => ({ ...c, supervisorName: e.target.value }))} placeholder="اسم المشرف" />
                        </label>
                      </div>
                      <label className="block text-xs font-bold text-ink-secondary">ملخص الأعمال
                        <textarea className={`${fieldClass()} mt-1`} rows={2} value={reportForm.summary} onChange={(e) => setReportForm((c) => ({ ...c, summary: e.target.value }))} placeholder="ملخص عام لأعمال اليوم…" />
                      </label>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-ink">بنود التقرير (مواد / عمالة / معدات / أعمال)</span>
                          <button type="button" onClick={addItem} className="inline-flex items-center gap-1 rounded-lg border border-line-strong bg-surface px-2 py-1 text-[11px] font-bold text-ink-secondary"><Plus size={12} /> بند</button>
                        </div>
                        {items.map((item, index) => (
                          <div key={index} className="grid gap-2 rounded-lg border border-line bg-surface p-2 md:grid-cols-[110px_1fr_90px_90px_110px_36px]">
                            <select className={fieldClass()} value={item.itemType} onChange={(e) => updateItem(index, { itemType: e.target.value as SiteReportItemType })}>
                              {Object.entries(ITEM_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>
                            <input className={fieldClass()} value={item.description} onChange={(e) => updateItem(index, { description: e.target.value })} placeholder="وصف البند…" />
                            <input type="number" min={0} className={fieldClass()} value={item.quantity} onChange={(e) => updateItem(index, { quantity: Number(e.target.value) })} placeholder="الكمية" title="الكمية" />
                            <input className={fieldClass()} value={item.unit} onChange={(e) => updateItem(index, { unit: e.target.value })} placeholder="الوحدة" title="الوحدة" />
                            <input type="number" min={0} className={fieldClass()} value={item.unitCost} onChange={(e) => updateItem(index, { unitCost: Number(e.target.value) })} placeholder="تكلفة الوحدة" title="تكلفة الوحدة" />
                            <button type="button" onClick={() => removeItem(index)} className="rounded-lg border border-danger-border bg-surface text-danger text-xs font-bold">×</button>
                          </div>
                        ))}
                      </div>

                      <div className="flex gap-2">
                        <button type="button" disabled={saving} onClick={createReport} className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-40">حفظ التقرير</button>
                        <button type="button" onClick={() => setShowReportForm(false)} className="rounded-lg border border-line-strong bg-surface px-4 py-2 text-xs font-bold text-ink-secondary">إلغاء</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                {reports.map((report) => {
                  const status = REPORT_STATUS[report.status] || { label: report.status, cls: 'bg-surface-sunken text-ink-secondary' };
                  const expanded = expandedReport === report.id;
                  return (
                    <div key={report.id} className="rounded-xl border border-line">
                      <button type="button" onClick={() => toggleReport(report.id)} className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-right hover:bg-surface-muted">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <b className="text-sm text-ink">{fmtDate(report.report_date)}</b>
                            <span className="text-xs text-muted">{report.projectName}</span>
                            {report.weather && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-bold text-primary">{report.weather}</span>}
                            <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[10px] font-bold text-ink-secondary">{report.workers_count ?? 0} عامل</span>
                          </div>
                          {report.summary && <p className="mt-1 truncate text-[11px] text-muted">{report.summary}</p>}
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-muted">
                          <span>{report.itemsCount ?? 0} بند · {fmt(report.itemsTotal ?? 0)}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${status.cls}`}>{status.label}</span>
                          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        </div>
                      </button>
                      {expanded && (
                        <div className="border-t border-line px-4 py-3">
                          {!reportDetail ? (
                            <div className="flex items-center gap-2 py-4 text-xs text-muted"><Loader2 size={14} className="animate-spin" /> جارٍ تحميل البنود…</div>
                          ) : (
                            <>
                              <div className="mb-3 grid gap-2 text-[11px] text-muted md:grid-cols-3">
                                <span>المشرف: <b>{reportDetail.supervisor_name || '—'}</b></span>
                                <span>أنشأه: <b>{reportDetail.createdByName || '—'}</b></span>
                                <span>اعتمد: <b>{reportDetail.approvedByName || reportDetail.approved_by || '—'}</b></span>
                              </div>
                              {reportDetail.summary && <p className="mb-3 rounded-lg bg-surface-muted p-2 text-xs text-ink-secondary">{reportDetail.summary}</p>}
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-line text-right font-bold text-muted">
                                    <th className="py-1.5 pe-3">النوع</th><th className="py-1.5 pe-3">الوصف</th><th className="py-1.5 pe-3">الكمية</th>
                                    <th className="py-1.5 pe-3">الوحدة</th><th className="py-1.5 pe-3">تكلفة الوحدة</th><th className="py-1.5">الإجمالي</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(reportDetail.items || []).map((item: any) => (
                                    <tr key={item.id} className="border-b border-line">
                                      <td className="py-1.5 pe-3"><span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[10px] font-bold">{ITEM_TYPES[item.item_type as SiteReportItemType] || item.item_type}</span></td>
                                      <td className="py-1.5 pe-3">{item.productName ? `${item.productName} — ` : ''}{item.description}</td>
                                      <td className="py-1.5 pe-3">{item.quantity}</td>
                                      <td className="py-1.5 pe-3">{item.unit || '—'}</td>
                                      <td className="py-1.5 pe-3">{fmt(item.unit_cost)}</td>
                                      <td className="py-1.5 font-bold">{fmt(item.amount)}</td>
                                    </tr>
                                  ))}
                                  {!(reportDetail.items || []).length && <tr><td colSpan={6} className="py-4 text-center text-muted">لا توجد بنود مسجلة.</td></tr>}
                                </tbody>
                              </table>
                              <div className="mt-3 flex gap-2">
                                <button type="button" onClick={printReport} className="inline-flex items-center gap-1 rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-[11px] font-bold text-ink"><Printer size={12} /> طباعة التقرير</button>
                                {canApprove && report.status !== 'APPROVED' && (
                                  <button type="button" onClick={() => approveReport(report.id)} className="rounded-lg bg-success px-3 py-1.5 text-[11px] font-bold text-white">اعتماد التقرير</button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {!reports.length && <p className="py-10 text-center text-sm text-muted">لا توجد تقارير يومية بعد.</p>}
              </div>
            </div>
          )}

          {/* ===== المقاولون الفرعيون ===== */}
          {tab === 'subcontractors' && (
            <div className="p-4">
              {canUpdate && (
                <div className="mb-4">
                  {!showSubForm ? (
                    <button type="button" onClick={() => setShowSubForm(true)} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white"><Plus size={14} /> مقاول فرعي جديد</button>
                  ) : (
                    <div className="grid gap-3 rounded-xl border border-accent-border bg-accent-soft/60 p-4 md:grid-cols-2 xl:grid-cols-3">
                      <label className="text-xs font-bold text-ink-secondary">المشروع
                        <select className={`${fieldClass()} mt-1`} value={subForm.projectId} onChange={(e) => setSubForm((c) => ({ ...c, projectId: e.target.value }))}>
                          <option value="">— اختر —</option>
                          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </label>
                      <label className="text-xs font-bold text-ink-secondary">الاسم
                        <input className={`${fieldClass()} mt-1`} value={subForm.name} onChange={(e) => setSubForm((c) => ({ ...c, name: e.target.value }))} />
                      </label>
                      <label className="text-xs font-bold text-ink-secondary">الهاتف
                        <input className={`${fieldClass()} mt-1`} value={subForm.phone} onChange={(e) => setSubForm((c) => ({ ...c, phone: e.target.value }))} />
                      </label>
                      <label className="text-xs font-bold text-ink-secondary">التخصص
                        <input className={`${fieldClass()} mt-1`} value={subForm.specialty} onChange={(e) => setSubForm((c) => ({ ...c, specialty: e.target.value }))} placeholder="كهرباء / سباكة / حدادة…" />
                      </label>
                      <label className="text-xs font-bold text-ink-secondary">قيمة العقد
                        <input type="number" min={0} className={`${fieldClass()} mt-1`} value={subForm.contractValue} onChange={(e) => setSubForm((c) => ({ ...c, contractValue: Number(e.target.value) }))} />
                      </label>
                      <label className="text-xs font-bold text-ink-secondary">رقم العقد
                        <input className={`${fieldClass()} mt-1`} value={subForm.contractNumber} onChange={(e) => setSubForm((c) => ({ ...c, contractNumber: e.target.value }))} placeholder="SC-2025-001" />
                      </label>
                      <label className="text-xs font-bold text-ink-secondary">تاريخ العقد
                        <input type="date" className={`${fieldClass()} mt-1`} value={subForm.contractDate} onChange={(e) => setSubForm((c) => ({ ...c, contractDate: e.target.value }))} />
                      </label>
                      <label className="text-xs font-bold text-ink-secondary">نسبة الاستقطاع %
                        <input type="number" min={0} max={100} className={`${fieldClass()} mt-1`} value={subForm.retentionPercent} onChange={(e) => setSubForm((c) => ({ ...c, retentionPercent: Number(e.target.value) }))} />
                      </label>
                      <label className="text-xs font-bold text-ink-secondary md:col-span-2">نطاق العمل
                        <input className={`${fieldClass()} mt-1`} value={subForm.scope} onChange={(e) => setSubForm((c) => ({ ...c, scope: e.target.value }))} placeholder="الأعمال المشمولة بالعقد…" />
                      </label>
                      <label className="text-xs font-bold text-ink-secondary">ملاحظات
                        <input className={`${fieldClass()} mt-1`} value={subForm.notes} onChange={(e) => setSubForm((c) => ({ ...c, notes: e.target.value }))} />
                      </label>
                      <div className="flex items-end gap-2 md:col-span-2 xl:col-span-3">
                        <button type="button" disabled={saving} onClick={createSubcontractor} className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-40">إضافة</button>
                        <button type="button" onClick={() => setShowSubForm(false)} className="rounded-lg border border-line-strong bg-surface px-4 py-2 text-xs font-bold text-ink-secondary">إلغاء</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-right text-[11px] font-bold text-muted">
                      <th className="py-2 pe-3">المقاول</th><th className="py-2 pe-3">المشروع</th><th className="py-2 pe-3">التخصص</th>
                      <th className="py-2 pe-3">الهاتف</th><th className="py-2 pe-3">قيمة العقد</th><th className="py-2 pe-3">الحالة</th><th className="py-2">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subcontractors.map((s) => {
                      const status = SUBCONTRACTOR_STATUS[s.status] || SUBCONTRACTOR_STATUS.ACTIVE;
                      return (
                        <tr key={s.id} className="border-b border-line">
                          <td className="py-2.5 pe-3">
                            <b>{s.name}</b>
                            {s.contract_number && <div className="text-[11px] font-bold text-primary">عقد {s.contract_number}</div>}
                            {s.notes && <div className="max-w-xs truncate text-[11px] text-muted">{s.notes}</div>}
                          </td>
                          <td className="py-2.5 pe-3 text-xs">{s.projectName}</td>
                          <td className="py-2.5 pe-3 text-xs text-ink-secondary">{s.specialty || '—'}</td>
                          <td className="py-2.5 pe-3 text-xs text-muted">{s.phone || '—'}</td>
                          <td className="py-2.5 pe-3 text-xs font-bold">{fmt(s.contract_value ?? 0)}</td>
                          <td className="py-2.5 pe-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${status.cls}`}>{status.label}</span></td>
                          <td className="py-2.5">
                            <div className="flex flex-wrap gap-1.5">
                              <button type="button" onClick={() => printSubcontractor(s)} className="inline-flex items-center gap-1 rounded border border-line bg-surface px-2 py-1 text-[11px] font-bold text-ink-secondary"><Printer size={11} /> العقد</button>
                              {canUpdate && (
                                <>
                                  {s.status !== 'ACTIVE' && <button type="button" onClick={() => setSubStatus(s.id, 'ACTIVE')} className="rounded border border-success-border bg-surface px-2 py-1 text-[11px] font-bold text-success">تفعيل</button>}
                                  {s.status === 'ACTIVE' && <button type="button" onClick={() => setSubStatus(s.id, 'INACTIVE')} className="rounded border border-line bg-surface px-2 py-1 text-[11px] font-bold text-ink-secondary">إيقاف</button>}
                                  {s.status !== 'COMPLETED' && <button type="button" onClick={() => setSubStatus(s.id, 'COMPLETED')} className="rounded border border-accent-border bg-surface px-2 py-1 text-[11px] font-bold text-primary">إنهاء</button>}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!subcontractors.length && <tr><td colSpan={7} className="py-10 text-center text-sm text-muted">لا يوجد مقاولون فرعيون مسجلون.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===== مستخلصات المقاولين الباطنين ===== */}
          {tab === 'subcerts' && (
            <div className="p-4">
              {canUpdate && (
                <div className="mb-4">
                  {!showCertForm ? (
                    <button type="button" onClick={() => setShowCertForm(true)} disabled={!subcontractors.length} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white disabled:opacity-40"><Plus size={14} /> مستخلص باطن جديد</button>
                  ) : (
                    <div className="grid gap-3 rounded-xl border border-accent-border bg-accent-soft/60 p-4 md:grid-cols-2 xl:grid-cols-3">
                      <label className="text-xs font-bold text-ink-secondary">المقاول الباطن
                        <select className={`${fieldClass()} mt-1`} value={certForm.subcontractorId} onChange={(e) => setCertForm((c) => ({ ...c, subcontractorId: e.target.value }))}>
                          <option value="">— اختر —</option>
                          {subcontractors.map((s) => <option key={s.id} value={s.id}>{s.name} — {s.projectName}</option>)}
                        </select>
                      </label>
                      <label className="text-xs font-bold text-ink-secondary">من تاريخ
                        <input type="date" className={`${fieldClass()} mt-1`} value={certForm.periodStart} onChange={(e) => setCertForm((c) => ({ ...c, periodStart: e.target.value }))} />
                      </label>
                      <label className="text-xs font-bold text-ink-secondary">إلى تاريخ
                        <input type="date" className={`${fieldClass()} mt-1`} value={certForm.periodEnd} onChange={(e) => setCertForm((c) => ({ ...c, periodEnd: e.target.value }))} />
                      </label>
                      <label className="text-xs font-bold text-ink-secondary xl:col-span-2">بيان الأعمال المنفذة
                        <input className={`${fieldClass()} mt-1`} value={certForm.description} onChange={(e) => setCertForm((c) => ({ ...c, description: e.target.value }))} placeholder="مثال: أعمال الكهرباء — الدور الأول" />
                      </label>
                      <label className="text-xs font-bold text-ink-secondary">قيمة الأعمال
                        <input type="number" min={0} className={`${fieldClass()} mt-1`} value={certForm.amount} onChange={(e) => setCertForm((c) => ({ ...c, amount: Number(e.target.value) }))} />
                      </label>
                      {(() => {
                        const sub = subcontractors.find((s) => s.id === certForm.subcontractorId);
                        const retentionPct = Number(sub?.retention_percent) || 0;
                        const amount = Number(certForm.amount) || 0;
                        const retention = Math.round(amount * retentionPct) / 100;
                        return amount > 0 ? (
                          <div className="rounded-lg border border-accent-border bg-surface px-3 py-2 text-[11px] font-bold text-ink-secondary md:col-span-2 xl:col-span-3">
                            الاستقطاع ({retentionPct}%): {fmt(retention)} — الصافي المستحق: {fmt(amount - retention)}
                          </div>
                        ) : null;
                      })()}
                      <div className="flex items-end gap-2 md:col-span-2 xl:col-span-3">
                        <button type="button" disabled={saving} onClick={createSubCert} className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-40">إنشاء المستخلص</button>
                        <button type="button" onClick={() => setShowCertForm(false)} className="rounded-lg border border-line-strong bg-surface px-4 py-2 text-xs font-bold text-ink-secondary">إلغاء</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-right text-[11px] font-bold text-muted">
                      <th className="py-2 pe-3">المستخلص</th><th className="py-2 pe-3">الباطن</th><th className="py-2 pe-3">المشروع</th>
                      <th className="py-2 pe-3">الفترة</th><th className="py-2 pe-3">قيمة الأعمال</th><th className="py-2 pe-3">الاستقطاع</th>
                      <th className="py-2 pe-3">الصافي</th><th className="py-2 pe-3">الحالة</th><th className="py-2">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subCerts.map((c) => {
                      const statusLabel: Record<string, { label: string; cls: string }> = {
                        DRAFT: { label: 'مسودة', cls: 'bg-surface-sunken text-ink-secondary' },
                        SUBMITTED: { label: 'مقدم', cls: 'bg-warning-soft text-warning' },
                        APPROVED: { label: 'معتمد', cls: 'bg-success-soft text-success' },
                        PAID: { label: 'مدفوع', cls: 'bg-accent-soft text-primary' },
                      };
                      const st = statusLabel[c.status] || statusLabel.DRAFT;
                      return (
                        <tr key={c.id} className="border-b border-line">
                          <td className="py-2.5 pe-3"><b className="text-xs">{c.certificate_number}</b><div className="max-w-[220px] truncate text-[11px] text-muted">{c.description}</div></td>
                          <td className="py-2.5 pe-3 text-xs">{c.subcontractorName}</td>
                          <td className="py-2.5 pe-3 text-xs text-ink-secondary">{c.projectName}</td>
                          <td className="py-2.5 pe-3 text-[11px] text-muted">{c.period_start || c.period_end ? `${c.period_start ? fmtDate(c.period_start) : '—'} ← ${c.period_end ? fmtDate(c.period_end) : '—'}` : '—'}</td>
                          <td className="py-2.5 pe-3 text-xs font-bold">{fmt(c.amount ?? 0)}</td>
                          <td className="py-2.5 pe-3 text-xs text-muted">{fmt(c.retention_amount ?? 0)} ({c.retention_percent ?? 0}%)</td>
                          <td className="py-2.5 pe-3 text-xs font-bold text-success">{fmt(c.net_amount ?? 0)}</td>
                          <td className="py-2.5 pe-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${st.cls}`}>{st.label}</span></td>
                          <td className="py-2.5">
                            <div className="flex flex-wrap gap-1.5">
                              <button type="button" onClick={() => printSubCert(c)} className="inline-flex items-center gap-1 rounded border border-line bg-surface px-2 py-1 text-[11px] font-bold text-ink-secondary"><Printer size={11} /> طباعة</button>
                              {canUpdate && c.status === 'DRAFT' && <button type="button" onClick={() => subCertAction(() => service.submitSubCertificate(c.id), 'تم إرسال المستخلص.', 'تعذر الإرسال.')} className="rounded border border-warning-border bg-surface px-2 py-1 text-[11px] font-bold text-warning">إرسال</button>}
                              {canApprove && c.status === 'SUBMITTED' && <button type="button" onClick={() => subCertAction(() => service.approveSubCertificate(c.id), 'تم اعتماد المستخلص.', 'تعذر الاعتماد.')} className="rounded border border-success-border bg-surface px-2 py-1 text-[11px] font-bold text-success">اعتماد</button>}
                              {canUpdate && c.status === 'APPROVED' && <button type="button" onClick={() => { const ref = window.prompt('مرجع الدفع (اختياري):') ?? undefined; subCertAction(() => service.paySubCertificate(c.id, ref || undefined), 'تم تسجيل الدفعة.', 'تعذر تسجيل الدفعة.'); }} className="rounded border border-accent-border bg-surface px-2 py-1 text-[11px] font-bold text-primary">تسجيل دفعة</button>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!subCerts.length && <tr><td colSpan={9} className="py-10 text-center text-sm text-muted">لا توجد مستخلصات مقاولين باطنين.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SiteManagementPage;
