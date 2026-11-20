import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, BadgeCheck, Boxes, ClipboardList, FileSignature, Loader2,
  Plus, Printer, Receipt, Ruler, Wallet, BarChart3,
} from 'lucide-react';
import { buildExportHtml, printHtml } from '../../utils/export/export';
import { PageHeader } from '../../components/ui/PageHeader';
import { useToast } from '../../components/ui/Toast';
import { AuthService } from '../../services/domains/auth/AuthService';
import { PermissionService } from '../../services/domains/auth/PermissionService';
import type { Project } from '../../services/domains/projects/ProjectService';
import { ProjectExecutionService } from '../../services/domains/projects/ProjectExecutionService';
import { PurchaseRequestService, type PurchaseRequest } from '../../services/domains/purchases/PurchaseRequestService';

const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(Math.round(Number(n) || 0)) + ' ج';
const fmtDate = (value?: string | null) => (value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('ar-EG') : '—');

const CONTRACT_STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'مسودة', cls: 'bg-surface-sunken text-ink-secondary' },
  SIGNED: { label: 'موقّع', cls: 'bg-success-soft text-success' },
  CANCELLED: { label: 'ملغي', cls: 'bg-danger-soft text-danger' },
};

const CERTIFICATE_STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'مسودة', cls: 'bg-surface-sunken text-ink-secondary' },
  SUBMITTED: { label: 'بانتظار المراجعة', cls: 'bg-warning-soft text-warning' },
  APPROVED: { label: 'معتمد', cls: 'bg-success-soft text-success' },
  RETURNED: { label: 'معاد', cls: 'bg-danger-soft text-danger' },
  PAID: { label: 'مدفوع', cls: 'bg-accent-soft text-primary' },
};

const REQUEST_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'بانتظار الاعتماد', cls: 'bg-warning-soft text-warning' },
  APPROVED: { label: 'معتمد', cls: 'bg-success-soft text-success' },
  REJECTED: { label: 'مرفوض', cls: 'bg-danger-soft text-danger' },
  ORDERED: { label: 'تم الطلب', cls: 'bg-accent-soft text-primary' },
  CANCELLED: { label: 'ملغي', cls: 'bg-surface-sunken text-ink-secondary' },
};

type TabKey = 'contracts' | 'certificates' | 'costs' | 'purchases' | 'progress' | 'reports';

type ApprovedEstimateOption = { estimateId: string; estimateName: string; versionId: string; versionNumber: number };

const fieldClass = () => 'w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none';

export const ProjectExecutionPage: React.FC = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const executionService = useMemo(() => new ProjectExecutionService(), []);
  const purchaseService = useMemo(() => new PurchaseRequestService(), []);
  const user = AuthService.getCurrentUser();
  const canUpdate = PermissionService.can(user, 'ui.projects.list.update');
  const canApprove = PermissionService.can(user, 'ui.projects.list.approve');
  const canViewPurchases = PermissionService.can(user, 'ui.purchases.requests.view');

  const [tab, setTab] = useState<TabKey>('certificates');
  const [projects, setProjects] = useState<Project[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [certificates, setCertificates] = useState<any[]>([]);
  const [costs, setCosts] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRequest[]>([]);
  const [portfolio, setPortfolio] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const [showContractForm, setShowContractForm] = useState(false);
  const [showCertificateForm, setShowCertificateForm] = useState(false);
  const [showCostForm, setShowCostForm] = useState(false);
  const [estimateOptions, setEstimateOptions] = useState<ApprovedEstimateOption[]>([]);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [contractForm, setContractForm] = useState({ projectId: '', contractDate: new Date().toISOString().slice(0, 10), terms: '' });
  const [certificateForm, setCertificateForm] = useState({ projectId: '', contractId: '', date: new Date().toISOString().slice(0, 10), periodStart: '', periodEnd: '', description: '', progressPercent: 0, amount: 0 });
  const [costForm, setCostForm] = useState({ projectId: '', date: new Date().toISOString().slice(0, 10), category: '', description: '', amount: 0 });

  const [progressProjectId, setProgressProjectId] = useState('');
  const [progressOptions, setProgressOptions] = useState<ApprovedEstimateOption[]>([]);
  const [progressSelection, setProgressSelection] = useState('');
  const [progressLines, setProgressLines] = useState<any[]>([]);
  const [progressDrafts, setProgressDrafts] = useState<Record<string, number>>({});
  const [progressLoading, setProgressLoading] = useState(false);
  const [certificateSuggestion, setCertificateSuggestion] = useState<any | null>(null);
  const [reportProjectId, setReportProjectId] = useState('');
  const [reportSummary, setReportSummary] = useState<any | null>(null);

  const projectName = useCallback((id?: string | null) => projects.find((p) => p.id === id)?.name || '—', [projects]);

  const load = useCallback(() => {
    setLoading(true);
    try {
      const visible = executionService.getVisibleProjects();
      setProjects(visible);
      setContracts(executionService.getContractsAcrossProjects());
      setCertificates(executionService.getCertificatesAcrossProjects());
      setCosts(executionService.getActualCostsAcrossProjects());
      setPortfolio(executionService.getPortfolioSummary());
      if (canViewPurchases) {
        const names = new Map(visible.map((p) => [p.id, p.name]));
        setPurchases(purchaseService.getRequests().filter((r) => r.projectId).map((r) => ({ ...r, projectName: names.get(r.projectId!) })) as any);
      } else {
        setPurchases([]);
      }
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل بيانات تنفيذ المشاريع.');
    } finally {
      setLoading(false);
    }
  }, [executionService, purchaseService, canViewPurchases]);

  useEffect(() => { load(); }, [load]);

  const loadEstimateOptions = async (projectId: string, target: 'contract' | 'certificate' = 'contract') => {
    setEstimateOptions([]);
    setCertificateSuggestion(null);
    if (!projectId) return;
    setEstimateLoading(true);
    try {
      setEstimateOptions(executionService.getApprovedEstimateOptions(projectId));
      if (target === 'certificate') {
        const options = executionService.getApprovedEstimateOptions(projectId);
        const first = options[0];
        if (first) setCertificateSuggestion(executionService.getCertificateSuggestion(first.estimateId, projectId, first.versionId));
      }
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل المقايسات المعتمدة.');
    } finally {
      setEstimateLoading(false);
    }
  };

  const activeContracts = contracts.filter((c) => c.status !== 'CANCELLED');
  const contractValue = activeContracts.reduce((s, c) => s + (Number(c.contract_value ?? c.contractValue) || 0), 0);
  const approvedCertificates = certificates.filter((c) => ['APPROVED', 'PAID'].includes(c.status));
  const certifiedAmount = approvedCertificates.reduce((s, c) => s + (Number(c.approved_amount ?? c.approvedAmount) || 0), 0);
  const paidAmount = certificates.reduce((s, c) => s + (Number(c.paid_amount ?? c.paidAmount) || 0), 0);
  const actualCostTotal = costs.reduce((s, c) => s + (Number(c.amount) || 0), 0);

  const run = async <T,>(action: () => T, successMessage?: string): Promise<T | undefined> => {
    setSaving(true);
    setNotice('');
    try {
      const result = action();
      if (successMessage) {
        setNotice(successMessage);
        toast.success(successMessage);
      }
      load();
      return result;
    } catch (e: any) {
      const message = e?.message || 'تعذر تنفيذ العملية.';
      setError(message);
      toast.error(message);
      return undefined;
    } finally {
      setSaving(false);
    }
  };

  const createContract = async () => {
    const option = estimateOptions[0];
    if (!contractForm.projectId || !option) { toast.error('اختر مشروعًا لديه إصدار مقايَسة معتمد.'); return; }
    const result = await run(() => {
      const created = executionService.createContract({
        estimateId: option.estimateId, projectId: contractForm.projectId, versionId: option.versionId,
        contractDate: contractForm.contractDate, terms: contractForm.terms,
      });
      setShowContractForm(false);
      setContractForm({ projectId: '', contractDate: new Date().toISOString().slice(0, 10), terms: '' });
      setTab('contracts');
      return created;
    });
    if (result) toast.success(`تم إنشاء العقد رقم ${result.contractNumber} بقيمة ${fmt(result.contractValue)}.`);
  };

  const createCertificate = async () => {
    const option = estimateOptions[0];
    if (!certificateForm.projectId || !option) { toast.error('اختر مشروعًا لديه إصدار مقايَسة معتمد.'); return; }
    if (!certificateForm.description.trim() || !certificateForm.date) { toast.error('وصف المستخلص وتاريخه مطلوبان.'); return; }
    const projectContracts = contracts.filter((c) => c.project_id === certificateForm.projectId && c.status !== 'CANCELLED');
    const contractId = certificateForm.contractId || projectContracts[0]?.id;
    const result = await run(() => {
      const created = executionService.createCertificate({
        projectId: certificateForm.projectId, estimateId: option.estimateId, versionId: option.versionId,
        contractId, date: certificateForm.date, periodStart: certificateForm.periodStart || undefined,
        periodEnd: certificateForm.periodEnd || undefined, description: certificateForm.description,
        progressPercent: Number(certificateForm.progressPercent) || 0, amount: Number(certificateForm.amount) || 0,
      });
      setShowCertificateForm(false);
      setCertificateForm({ projectId: '', contractId: '', date: new Date().toISOString().slice(0, 10), periodStart: '', periodEnd: '', description: '', progressPercent: 0, amount: 0 });
      return created;
    });
    if (result) toast.success(`تم إنشاء المستخلص ${result.certificateNumber} بحالة مسودة.`);
  };

  const createCost = async () => {
    if (!costForm.projectId) { toast.error('اختر المشروع.'); return; }
    if (!costForm.category.trim() || !costForm.description.trim()) { toast.error('التصنيف والوصف مطلوبان.'); return; }
    await run(() => {
      executionService.addActualCost({
        projectId: costForm.projectId, date: costForm.date, category: costForm.category,
        description: costForm.description, amount: Number(costForm.amount) || 0,
      });
      setShowCostForm(false);
      setCostForm({ projectId: '', date: new Date().toISOString().slice(0, 10), category: '', description: '', amount: 0 });
    }, 'تم تسجيل التكلفة الفعلية.');
  };

  const loadProgressOptions = async (projectId: string) => {
    setProgressProjectId(projectId);
    setProgressOptions([]);
    setProgressSelection('');
    setProgressLines([]);
    if (!projectId) return;
    setProgressLoading(true);
    try {
      const options = executionService.getApprovedEstimateOptions(projectId);
      setProgressOptions(options);
      if (options.length) {
        const key = `${options[0].estimateId}|${options[0].versionId}`;
        setProgressSelection(key);
        setProgressLines(executionService.getLineProgress(options[0].estimateId, projectId, options[0].versionId));
      }
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تحميل الإصدارات المعتمدة.');
    } finally {
      setProgressLoading(false);
    }
  };

  const selectProgressVersion = (key: string) => {
    setProgressSelection(key);
    const option = progressOptions.find((item) => `${item.estimateId}|${item.versionId}` === key);
    if (!option || !progressProjectId) return;
    try {
      setProgressLines(executionService.getLineProgress(option.estimateId, progressProjectId, option.versionId));
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تحميل بنود المقايسة.');
    }
  };

  const saveLineProgress = async (line: any) => {
    const option = progressOptions.find((item) => `${item.estimateId}|${item.versionId}` === progressSelection);
    if (!option || !progressProjectId) return;
    const executed = Number(progressDrafts[line.lineId] ?? line.executedQuantity) || 0;
    await run(() => {
      executionService.recordLineProgress({
        estimateId: option.estimateId, projectId: progressProjectId, versionId: option.versionId,
        lineId: line.lineId, executedQuantity: executed,
      });
      setProgressLines(executionService.getLineProgress(option.estimateId, progressProjectId, option.versionId));
    }, 'تم تسجيل الكمية المنفذة.');
  };

  const tabs: Array<{ key: TabKey; label: string; icon: React.ReactNode; count: number }> = [
    { key: 'certificates', label: 'المستخلصات', icon: <BadgeCheck size={15} />, count: certificates.length },
    { key: 'contracts', label: 'العقود', icon: <FileSignature size={15} />, count: contracts.length },
    { key: 'progress', label: 'الكميات المنفذة', icon: <Ruler size={15} />, count: progressLines.length },
    { key: 'costs', label: 'التكاليف الفعلية', icon: <Wallet size={15} />, count: costs.length },
    { key: 'purchases', label: 'مشتريات المشاريع', icon: <ClipboardList size={15} />, count: purchases.length },
    { key: 'reports', label: 'التقارير', icon: <BarChart3 size={15} />, count: 0 },
  ];

  const printCertificate = (c: any) => {
    const status = CERTIFICATE_STATUS[c.status] || { label: c.status };
    const fieldCols = [
      { key: 'field', label: 'البند' },
      { key: 'value', label: 'القيمة' },
    ];
    const rows = [
      { field: 'رقم المستخلص', value: c.certificate_number },
      { field: 'المشروع', value: c.projectName || projectName(c.project_id) },
      { field: 'تاريخ المستخلص', value: fmtDate(c.certificate_date) },
      { field: 'فترة العمل', value: `${fmtDate(c.period_start)} ← ${fmtDate(c.period_end)}` },
      { field: 'وصف الأعمال المنفذة', value: c.description },
      { field: 'نسبة الإنجاز', value: `${c.progress_percent ?? 0}%` },
      { field: 'القيمة المطلوبة', value: fmt(c.requested_amount) },
      { field: 'القيمة المعتمدة', value: fmt(c.approved_amount ?? 0) },
      { field: 'المدفوع', value: fmt(c.paid_amount ?? 0) },
      { field: 'الحالة', value: status.label },
    ];
    const notes = [
      c.review_notes ? `ملاحظة المراجعة: ${c.review_notes}` : '',
      c.payment_reference ? `مرجع الدفع: ${c.payment_reference}` : '',
    ].filter(Boolean);
    try {
      printHtml(buildExportHtml({
        title: 'مستخلص أعمال',
        subtitle: `${c.certificate_number} — ${c.projectName || projectName(c.project_id)}`,
        columns: fieldCols,
        rows,
        fileName: `certificate-${c.certificate_number || c.id}`,
        notes,
        permission: 'projects.print',
      }));
    } catch (e: any) {
      toast.error(e?.message || 'تعذر طباعة المستخلص.');
    }
  };

  const printContract = (c: any) => {
    const status = CONTRACT_STATUS[c.status] || { label: c.status };
    const fieldCols = [
      { key: 'field', label: 'البند' },
      { key: 'value', label: 'القيمة' },
    ];
    const rows = [
      { field: 'رقم العقد', value: c.contract_number },
      { field: 'المشروع', value: c.projectName || projectName(c.project_id) },
      { field: 'تاريخ العقد', value: fmtDate(c.contract_date) },
      { field: 'قيمة العقد', value: fmt(c.contract_value) },
      { field: 'إصدار المقايسة', value: `v${c.versionNumber ?? '—'}` },
      { field: 'الحالة', value: status.label },
      { field: 'الشروط والأحكام', value: c.terms || '—' },
    ];
    try {
      printHtml(buildExportHtml({
        title: 'عقد أعمال',
        subtitle: `${c.contract_number} — ${c.projectName || projectName(c.project_id)}`,
        columns: fieldCols,
        rows,
        fileName: `contract-${c.contract_number || c.id}`,
        permission: 'projects.print',
      }));
    } catch (e: any) {
      toast.error(e?.message || 'تعذر طباعة العقد.');
    }
  };

  const loadReportSummary = (projectId: string) => {
    setReportProjectId(projectId);
    setReportSummary(null);
    if (!projectId) return;
    try {
      setReportSummary(executionService.getSummary(projectId));
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تحميل ملخص المشروع.');
    }
  };

  const renderEstimatePicker = (projectId: string) => (
    <div className="rounded-lg border border-line bg-surface-muted p-3 text-xs text-ink-secondary">
      {estimateLoading && <span className="inline-flex items-center gap-1"><Loader2 size={13} className="animate-spin" /> جارٍ تحميل الإصدارات المعتمدة…</span>}
      {!estimateLoading && projectId && estimateOptions.length === 0 && <span>لا يوجد إصدار مقايَسة معتمد لهذا المشروع — اعتمد إصدارًا من صفحة المقايسة أولًا.</span>}
      {!estimateLoading && estimateOptions.length > 0 && (
        <span>سيتم استخدام الإصدار المعتمد: <b>{estimateOptions[0].estimateName}</b> — إصدار {estimateOptions[0].versionNumber}</span>
      )}
    </div>
  );

  return (
    <div className="space-y-5 p-4 md:p-6" dir="rtl">
      <PageHeader
        title="تنفيذ المشاريع والمستخلصات"
        description="العقود والمستخلصات والتكاليف الفعلية ومشتريات مواقع التنفيذ — مجمّعة من كل المشروعات."
        icon={<Boxes size={22} />}
        actions={
          <button type="button" onClick={() => navigate('/projects')} className="inline-flex items-center gap-1 rounded-lg border border-line-strong bg-surface px-3 py-2 text-xs font-bold text-ink hover:bg-surface-muted">
            <ArrowRight size={14} /> المشاريع
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          { label: 'قيمة العقود', value: fmt(contractValue), icon: <FileSignature size={16} /> },
          { label: 'المستخلصات المعتمدة', value: fmt(certifiedAmount), icon: <BadgeCheck size={16} /> },
          { label: 'المدفوع للمستخلصات', value: fmt(paidAmount), icon: <Receipt size={16} /> },
          { label: 'التكاليف الفعلية', value: fmt(actualCostTotal), icon: <Wallet size={16} /> },
          { label: 'فجوة التحصيل', value: fmt(certifiedAmount - paidAmount), icon: <ClipboardList size={16} /> },
        ].map((metric) => (
          <div key={metric.label} className="rounded-xl border border-line bg-surface p-3 shadow-sm">
            <div className="flex items-center gap-2 text-[11px] font-bold text-muted">{metric.icon}{metric.label}</div>
            <div className="mt-1 text-lg font-black text-ink">{metric.value}</div>
          </div>
        ))}
      </div>

      {error && <div className="rounded-xl border border-danger-border bg-danger-soft px-4 py-3 text-sm font-bold text-danger">{error}</div>}
      {notice && <div className="rounded-xl border border-success-border bg-success-soft px-4 py-3 text-sm font-bold text-success">{notice}</div>}

      {/* ===== نظرة عامة على المشاريع ===== */}
      {portfolio.length > 0 && (
        <div className="rounded-2xl border border-line bg-surface shadow-sm">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h3 className="text-sm font-black text-ink">نظرة عامة على المشاريع</h3>
            <span className="text-[11px] text-muted">{portfolio.length} مشروع</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-right text-[11px] font-bold text-muted">
                  <th className="py-2 pe-3">المشروع</th><th className="py-2 pe-3">العميل</th><th className="py-2 pe-3">الحالة</th>
                  <th className="py-2 pe-3">قيمة العقد</th><th className="py-2 pe-3">المعتمد</th><th className="py-2 pe-3">المدفوع</th>
                  <th className="py-2 pe-3">فجوة التحصيل</th><th className="py-2 pe-3">التكلفة الفعلية</th>
                  <th className="py-2 pe-3">انحراف التكلفة</th><th className="py-2 pe-3">الإنجاز</th><th className="py-2">تنبيهات</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.map((p) => (
                  <tr key={p.id} className={`border-b border-line ${p.isOverdue ? 'bg-danger-soft/40' : ''}`}>
                    <td className="py-2.5 pe-3">
                      <button type="button" onClick={() => navigate(`/projects/${p.id}`)} className="text-right">
                        <b className="text-xs text-primary hover:underline">{p.name}</b>
                        <div className="text-[10px] text-muted">{p.code} · {p.customerName}</div>
                      </button>
                    </td>
                    <td className="py-2.5 pe-3 text-xs text-muted">{p.customerName}</td>
                    <td className="py-2.5 pe-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${p.status === 'ACTIVE' ? 'bg-accent-soft text-primary' : p.status === 'COMPLETED' ? 'bg-success-soft text-success' : p.status === 'ON_HOLD' ? 'bg-warning-soft text-warning' : 'bg-surface-sunken text-ink-secondary'}`}>{({ ACTIVE: 'جاري', COMPLETED: 'مكتمل', ON_HOLD: 'متوقف', PLANNED: 'مخطط', CANCELLED: 'ملغي' } as Record<string,string>)[p.status] || p.status}</span></td>
                    <td className="py-2.5 pe-3 text-xs font-bold">{fmt(p.contractValue)}</td>
                    <td className="py-2.5 pe-3 text-xs font-bold text-success">{fmt(p.certifiedAmount)}</td>
                    <td className="py-2.5 pe-3 text-xs font-bold text-primary">{fmt(p.paidAmount)}</td>
                    <td className="py-2.5 pe-3 text-xs font-bold text-danger">{fmt(p.collectionGap)}</td>
                    <td className="py-2.5 pe-3 text-xs">{fmt(p.actualCost)}</td>
                    <td className={`py-2.5 pe-3 text-xs font-bold ${p.costVariance < 0 ? 'text-danger' : 'text-success'}`}>{fmt(p.costVariance)}</td>
                    <td className="py-2.5 pe-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-sunken"><div className="h-full bg-primary" style={{ width: `${Math.min(100, p.completionPercent)}%` }} /></div>
                        <span className="text-[10px] font-bold text-muted">{Math.round(p.completionPercent)}%</span>
                      </div>
                    </td>
                    <td className="py-2.5 text-[10px]">
                      <div className="flex flex-col gap-1">
                        {p.isOverdue && <span className="rounded-full bg-danger-soft px-2 py-0.5 font-bold text-danger">متأخر عن موعده</span>}
                        {p.pendingCertificates > 0 && <span className="rounded-full bg-warning-soft px-2 py-0.5 font-bold text-warning">{p.pendingCertificates} مستخلص بانتظار المراجعة</span>}
                        {p.todayReports > 0 && <span className="rounded-full bg-success-soft px-2 py-0.5 font-bold text-success">تقرير موقع اليوم</span>}
                        {!p.isOverdue && !p.pendingCertificates && !p.todayReports && <span className="text-muted">—</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
          {/* ===== المستخلصات ===== */}
          {tab === 'certificates' && (
            <div className="p-4">
              {canUpdate && (
                <div className="mb-4">
                  {!showCertificateForm ? (
                    <button type="button" onClick={() => setShowCertificateForm(true)} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white"><Plus size={14} /> مستخلص جديد</button>
                  ) : (
                    <div className="grid gap-3 rounded-xl border border-accent-border bg-accent-soft/60 p-4 md:grid-cols-2 xl:grid-cols-4">
                      <label className="text-xs font-bold text-ink-secondary">المشروع
                        <select className={`${fieldClass()} mt-1`} value={certificateForm.projectId} onChange={(e) => { setCertificateForm((c) => ({ ...c, projectId: e.target.value })); void loadEstimateOptions(e.target.value, 'certificate'); }}>
                          <option value="">— اختر —</option>
                          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </label>
                      <label className="text-xs font-bold text-ink-secondary">تاريخ المستخلص
                        <input type="date" className={`${fieldClass()} mt-1`} value={certificateForm.date} onChange={(e) => setCertificateForm((c) => ({ ...c, date: e.target.value }))} />
                      </label>
                      <label className="text-xs font-bold text-ink-secondary">بداية الفترة
                        <input type="date" className={`${fieldClass()} mt-1`} value={certificateForm.periodStart} onChange={(e) => setCertificateForm((c) => ({ ...c, periodStart: e.target.value }))} />
                      </label>
                      <label className="text-xs font-bold text-ink-secondary">نهاية الفترة
                        <input type="date" className={`${fieldClass()} mt-1`} value={certificateForm.periodEnd} onChange={(e) => setCertificateForm((c) => ({ ...c, periodEnd: e.target.value }))} />
                      </label>
                      <label className="text-xs font-bold text-ink-secondary md:col-span-2">وصف الأعمال المنفذة
                        <input className={`${fieldClass()} mt-1`} value={certificateForm.description} onChange={(e) => setCertificateForm((c) => ({ ...c, description: e.target.value }))} placeholder="مثال: أعمال اللياسة والكهرباء — الدور الثاني" />
                      </label>
                      <label className="text-xs font-bold text-ink-secondary">إنجاز الفترة %
                        <input type="number" min={0} max={100} className={`${fieldClass()} mt-1`} value={certificateForm.progressPercent} onChange={(e) => setCertificateForm((c) => ({ ...c, progressPercent: Number(e.target.value) }))} />
                      </label>
                      <label className="text-xs font-bold text-ink-secondary">قيمة المستخلص
                        <input type="number" min={0} className={`${fieldClass()} mt-1`} value={certificateForm.amount} onChange={(e) => setCertificateForm((c) => ({ ...c, amount: Number(e.target.value) }))} />
                      </label>
                      {certificateSuggestion && (
                        <div className="rounded-lg border border-success-border bg-success-soft/70 p-3 text-[11px] text-success md:col-span-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span>
                              المستحق من الكميات المنفذة: <b>{fmt(certificateSuggestion.earnedAmount)}</b>
                              {' '}· المعتمد سابقًا: <b>{fmt(certificateSuggestion.certifiedAmount)}</b>
                              {' '}· الإنجاز: <b>{Math.round(certificateSuggestion.earnedPercent)}%</b>
                            </span>
                            <button
                              type="button"
                              onClick={() => setCertificateForm((c) => ({ ...c, amount: certificateSuggestion.suggestedAmount }))}
                              className="rounded-lg bg-success px-3 py-1.5 text-[11px] font-bold text-white"
                            >استخدام القيمة المقترحة ({fmt(certificateSuggestion.suggestedAmount)})</button>
                          </div>
                        </div>
                      )}
                      <div className="md:col-span-2">{renderEstimatePicker(certificateForm.projectId)}</div>
                      <div className="flex items-end gap-2 md:col-span-2">
                        <button type="button" disabled={saving} onClick={createCertificate} className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-40">إنشاء مستخلص</button>
                        <button type="button" onClick={() => setShowCertificateForm(false)} className="rounded-lg border border-line-strong bg-surface px-4 py-2 text-xs font-bold text-ink-secondary">إلغاء</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-right text-[11px] font-bold text-muted">
                      <th className="py-2 pe-3">المستخلص</th><th className="py-2 pe-3">المشروع</th><th className="py-2 pe-3">الفترة</th>
                      <th className="py-2 pe-3">الإنجاز</th><th className="py-2 pe-3">مطلوب</th><th className="py-2 pe-3">معتمد</th>
                      <th className="py-2 pe-3">مدفوع</th><th className="py-2 pe-3">الحالة</th><th className="py-2">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {certificates.map((c) => {
                      const status = CERTIFICATE_STATUS[c.status] || { label: c.status, cls: 'bg-surface-sunken text-ink-secondary' };
                      return (
                        <tr key={c.id} className="border-b border-line align-top">
                          <td className="py-2.5 pe-3"><b>{c.certificate_number}</b><div className="text-[11px] text-muted">{fmtDate(c.certificate_date)} · {c.description}</div>{c.review_notes && <div className="text-[11px] text-danger">ملاحظة: {c.review_notes}</div>}</td>
                          <td className="py-2.5 pe-3 text-xs">{c.projectName || projectName(c.project_id)}<div className="text-[10px] text-muted">إصدار {c.versionNumber}</div></td>
                          <td className="py-2.5 pe-3 text-xs text-muted">{fmtDate(c.period_start)} ← {fmtDate(c.period_end)}</td>
                          <td className="py-2.5 pe-3 text-xs">{c.progress_percent ?? 0}%</td>
                          <td className="py-2.5 pe-3 text-xs font-bold">{fmt(c.requested_amount)}</td>
                          <td className="py-2.5 pe-3 text-xs font-bold text-success">{fmt(c.approved_amount ?? 0)}</td>
                          <td className="py-2.5 pe-3 text-xs font-bold text-primary">{fmt(c.paid_amount ?? 0)}</td>
                          <td className="py-2.5 pe-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${status.cls}`}>{status.label}</span></td>
                          <td className="py-2.5">
                            <div className="flex flex-wrap gap-1.5">
                              <button type="button" onClick={() => printCertificate(c)} title="طباعة المستخلص" className="rounded border border-line-strong bg-surface px-2 py-1 text-muted hover:text-ink"><Printer size={12} /></button>
                              {canUpdate && ['DRAFT', 'RETURNED'].includes(c.status) && (
                                <button type="button" onClick={() => run(() => { executionService.submitCertificate(c.id); }, 'تم إرسال المستخلص للمراجعة.')} className="rounded border border-line-strong bg-surface px-2 py-1 text-[11px] font-bold">إرسال</button>
                              )}
                              {canApprove && c.status === 'SUBMITTED' && (
                                <>
                                  <button type="button" onClick={() => run(() => { executionService.reviewCertificate(c.id, 'APPROVED'); }, 'تم اعتماد المستخلص.')} className="rounded bg-success px-2 py-1 text-[11px] font-bold text-white">اعتماد</button>
                                  <button type="button" onClick={() => { const notes = window.prompt('سبب إعادة المستخلص:'); if (!notes?.trim()) return; run(() => { executionService.reviewCertificate(c.id, 'RETURNED', notes); }, 'تمت إعادة المستخلص.'); }} className="rounded border border-danger-border bg-surface px-2 py-1 text-[11px] font-bold text-danger">إعادة</button>
                                </>
                              )}
                              {canUpdate && ['APPROVED', 'PAID'].includes(c.status) && (
                                <button type="button" onClick={() => {
                                  const remaining = Number(c.approved_amount ?? 0) - Number(c.paid_amount ?? 0);
                                  const raw = window.prompt(`المتبقي ${fmt(remaining)}. أدخل قيمة الدفعة:`, String(remaining));
                                  if (raw === null) return;
                                  const reference = window.prompt('مرجع الدفع (اختياري):') || '';
                                  run(() => { executionService.recordCertificatePayment(c.id, Number(raw), reference); }, 'تم تسجيل الدفعة.');
                                }} className="rounded border border-accent-border bg-surface px-2 py-1 text-[11px] font-bold text-primary">دفعة</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!certificates.length && <tr><td colSpan={9} className="py-10 text-center text-sm text-muted">لا توجد مستخلصات بعد — أنشئ أول مستخلص من projects ذات إصدار معتمد.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===== العقود ===== */}
          {tab === 'contracts' && (
            <div className="p-4">
              {canUpdate && (
                <div className="mb-4">
                  {!showContractForm ? (
                    <button type="button" onClick={() => setShowContractForm(true)} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white"><Plus size={14} /> عقد جديد</button>
                  ) : (
                    <div className="grid gap-3 rounded-xl border border-accent-border bg-accent-soft/60 p-4 md:grid-cols-2 xl:grid-cols-4">
                      <label className="text-xs font-bold text-ink-secondary">المشروع
                        <select className={`${fieldClass()} mt-1`} value={contractForm.projectId} onChange={(e) => { setContractForm((c) => ({ ...c, projectId: e.target.value })); void loadEstimateOptions(e.target.value); }}>
                          <option value="">— اختر —</option>
                          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </label>
                      <label className="text-xs font-bold text-ink-secondary">تاريخ العقد
                        <input type="date" className={`${fieldClass()} mt-1`} value={contractForm.contractDate} onChange={(e) => setContractForm((c) => ({ ...c, contractDate: e.target.value }))} />
                      </label>
                      <label className="text-xs font-bold text-ink-secondary md:col-span-2">الشروط والأحكام
                        <input className={`${fieldClass()} mt-1`} value={contractForm.terms} onChange={(e) => setContractForm((c) => ({ ...c, terms: e.target.value }))} placeholder="دفعات شهرية حسب المستخلصات المعتمدة…" />
                      </label>
                      <div className="md:col-span-2">{renderEstimatePicker(contractForm.projectId)}</div>
                      <div className="flex items-end gap-2 md:col-span-2">
                        <button type="button" disabled={saving} onClick={createContract} className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-40">إنشاء العقد</button>
                        <button type="button" onClick={() => setShowContractForm(false)} className="rounded-lg border border-line-strong bg-surface px-4 py-2 text-xs font-bold text-ink-secondary">إلغاء</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-right text-[11px] font-bold text-muted">
                      <th className="py-2 pe-3">العقد</th><th className="py-2 pe-3">المشروع</th><th className="py-2 pe-3">تاريخ التوقيع</th>
                      <th className="py-2 pe-3">قيمة العقد</th><th className="py-2 pe-3">الإصدار</th><th className="py-2 pe-3">الحالة</th><th className="py-2">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contracts.map((c) => {
                      const status = CONTRACT_STATUS[c.status] || { label: c.status, cls: 'bg-surface-sunken text-ink-secondary' };
                      return (
                        <tr key={c.id} className="border-b border-line">
                          <td className="py-2.5 pe-3"><b>{c.contract_number}</b>{c.terms && <div className="max-w-xs truncate text-[11px] text-muted">{c.terms}</div>}</td>
                          <td className="py-2.5 pe-3 text-xs">{c.projectName || projectName(c.project_id)}</td>
                          <td className="py-2.5 pe-3 text-xs text-muted">{fmtDate(c.contract_date)}</td>
                          <td className="py-2.5 pe-3 text-xs font-black">{fmt(c.contract_value)}</td>
                          <td className="py-2.5 pe-3 text-xs text-muted">v{c.versionNumber}</td>
                          <td className="py-2.5 pe-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${status.cls}`}>{status.label}</span></td>
                          <td className="py-2.5">
                            <div className="flex flex-wrap gap-1.5">
                              <button type="button" onClick={() => printContract(c)} title="طباعة العقد" className="rounded border border-line-strong bg-surface px-2 py-1 text-muted hover:text-ink"><Printer size={12} /></button>
                              {canApprove && c.status !== 'SIGNED' && c.status !== 'CANCELLED' && (
                                <button type="button" onClick={() => run(() => { executionService.updateContractStatus(c.id, 'SIGNED'); }, 'تم تسجيل توقيع العقد.')} className="rounded bg-success px-2 py-1 text-[11px] font-bold text-white">توقيع</button>
                              )}
                              {canApprove && c.status !== 'CANCELLED' && (
                                <button type="button" onClick={() => { if (!window.confirm('إلغاء هذا العقد؟')) return; run(() => { executionService.updateContractStatus(c.id, 'CANCELLED'); }, 'تم إلغاء العقد.'); }} className="rounded border border-danger-border bg-surface px-2 py-1 text-[11px] font-bold text-danger">إلغاء</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!contracts.length && <tr><td colSpan={7} className="py-10 text-center text-sm text-muted">لا توجد عقود — أنشئ عقدًا من إصدار مقايَسة معتمد.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===== التكاليف الفعلية ===== */}
          {tab === 'costs' && (
            <div className="p-4">
              {canUpdate && (
                <div className="mb-4">
                  {!showCostForm ? (
                    <button type="button" onClick={() => setShowCostForm(true)} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white"><Plus size={14} /> تكلفة فعلية</button>
                  ) : (
                    <div className="grid gap-3 rounded-xl border border-accent-border bg-accent-soft/60 p-4 md:grid-cols-2 xl:grid-cols-4">
                      <label className="text-xs font-bold text-ink-secondary">المشروع
                        <select className={`${fieldClass()} mt-1`} value={costForm.projectId} onChange={(e) => setCostForm((c) => ({ ...c, projectId: e.target.value }))}>
                          <option value="">— اختر —</option>
                          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </label>
                      <label className="text-xs font-bold text-ink-secondary">التاريخ
                        <input type="date" className={`${fieldClass()} mt-1`} value={costForm.date} onChange={(e) => setCostForm((c) => ({ ...c, date: e.target.value }))} />
                      </label>
                      <label className="text-xs font-bold text-ink-secondary">التصنيف
                        <input className={`${fieldClass()} mt-1`} value={costForm.category} onChange={(e) => setCostForm((c) => ({ ...c, category: e.target.value }))} placeholder="مواد / عمالة / معدات" />
                      </label>
                      <label className="text-xs font-bold text-ink-secondary">المبلغ
                        <input type="number" min={0} className={`${fieldClass()} mt-1`} value={costForm.amount} onChange={(e) => setCostForm((c) => ({ ...c, amount: Number(e.target.value) }))} />
                      </label>
                      <label className="text-xs font-bold text-ink-secondary md:col-span-3">الوصف
                        <input className={`${fieldClass()} mt-1`} value={costForm.description} onChange={(e) => setCostForm((c) => ({ ...c, description: e.target.value }))} placeholder="وصف التكلفة…" />
                      </label>
                      <div className="flex items-end gap-2">
                        <button type="button" disabled={saving} onClick={createCost} className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-40">تسجيل</button>
                        <button type="button" onClick={() => setShowCostForm(false)} className="rounded-lg border border-line-strong bg-surface px-4 py-2 text-xs font-bold text-ink-secondary">إلغاء</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-right text-[11px] font-bold text-muted">
                      <th className="py-2 pe-3">التاريخ</th><th className="py-2 pe-3">المشروع</th><th className="py-2 pe-3">التصنيف</th>
                      <th className="py-2 pe-3">الوصف</th><th className="py-2 pe-3">المصدر</th><th className="py-2">المبلغ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costs.map((c) => (
                      <tr key={c.id} className="border-b border-line">
                        <td className="py-2.5 pe-3 text-xs text-muted">{fmtDate(c.cost_date)}</td>
                        <td className="py-2.5 pe-3 text-xs">{c.projectName || projectName(c.project_id)}</td>
                        <td className="py-2.5 pe-3"><span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[10px] font-bold text-ink-secondary">{c.category}</span></td>
                        <td className="py-2.5 pe-3 text-xs text-ink-secondary">{c.description}</td>
                        <td className="py-2.5 pe-3 text-[11px] text-muted">{{ MANUAL: 'يدوي', PURCHASE: 'شراء', LABOR: 'عمالة', OTHER: 'أخرى' }[c.source_type as string] || c.source_type}</td>
                        <td className="py-2.5 text-xs font-black text-danger">{fmt(c.amount)}</td>
                      </tr>
                    ))}
                    {!costs.length && <tr><td colSpan={6} className="py-10 text-center text-sm text-muted">لا توجد تكاليف فعلية مسجلة.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===== الكميات المنفذة ===== */}
          {tab === 'progress' && (
            <div className="p-4">
              <div className="mb-4 grid gap-3 md:grid-cols-2">
                <label className="text-xs font-bold text-ink-secondary">المشروع
                  <select className={`${fieldClass()} mt-1`} value={progressProjectId} onChange={(e) => void loadProgressOptions(e.target.value)}>
                    <option value="">— اختر مشروعًا —</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
                <label className="text-xs font-bold text-ink-secondary">إصدار المقايسة المعتمد
                  <select className={`${fieldClass()} mt-1`} value={progressSelection} onChange={(e) => selectProgressVersion(e.target.value)} disabled={!progressOptions.length}>
                    {progressOptions.map((option) => (
                      <option key={`${option.estimateId}|${option.versionId}`} value={`${option.estimateId}|${option.versionId}`}>
                        {option.estimateName} — إصدار {option.versionNumber}
                      </option>
                    ))}
                    {!progressOptions.length && <option value="">— لا يوجد إصدار معتمد —</option>}
                  </select>
                </label>
              </div>
              {progressLoading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-muted"><Loader2 className="animate-spin" size={16} /> جارٍ التحميل…</div>
              ) : progressProjectId && progressSelection ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line text-right text-[11px] font-bold text-muted">
                        <th className="py-2 pe-3">البند</th><th className="py-2 pe-3">المرحلة</th><th className="py-2 pe-3">الوحدة</th>
                        <th className="py-2 pe-3">الكمية المخططة</th><th className="py-2 pe-3">المنفذة</th><th className="py-2 pe-3">%</th>
                        <th className="py-2 pe-3">آخر قياس</th><th className="py-2">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {progressLines.map((line) => {
                        const draft = progressDrafts[line.lineId];
                        const executed = draft ?? line.executedQuantity;
                        return (
                          <tr key={line.lineId} className="border-b border-line">
                            <td className="py-2.5 pe-3"><b className="text-xs">{line.name}</b>{line.category && <div className="text-[10px] text-muted">{line.category}</div>}</td>
                            <td className="py-2.5 pe-3 text-[11px] text-muted">{line.phase || '—'}</td>
                            <td className="py-2.5 pe-3 text-xs">{line.unit || '—'}</td>
                            <td className="py-2.5 pe-3 text-xs font-bold">{line.plannedQuantity}</td>
                            <td className="py-2.5 pe-3">
                              {canUpdate ? (
                                <input
                                  type="number" min={0} className="w-24 rounded-lg border border-line-strong px-2 py-1 text-xs"
                                  value={executed}
                                  onChange={(e) => setProgressDrafts((current) => ({ ...current, [line.lineId]: Number(e.target.value) }))}
                                />
                              ) : (
                                <span className="text-xs font-bold">{line.executedQuantity}</span>
                              )}
                            </td>
                            <td className="py-2.5 pe-3">
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-sunken">
                                  <div className="h-full bg-primary" style={{ width: `${Math.min(100, line.plannedQuantity > 0 ? (executed / line.plannedQuantity) * 100 : 0)}%` }} />
                                </div>
                                <span className="text-[10px] font-bold text-muted">{line.plannedQuantity > 0 ? Math.round((executed / line.plannedQuantity) * 100) : 0}%</span>
                              </div>
                            </td>
                            <td className="py-2.5 pe-3 text-[11px] text-muted">{fmtDate(line.measuredAt)}</td>
                            <td className="py-2.5">
                              {canUpdate && (
                                <button
                                  type="button"
                                  disabled={saving || draft === undefined}
                                  onClick={() => void saveLineProgress(line)}
                                  className="rounded border border-accent-border bg-surface px-2 py-1 text-[11px] font-bold text-primary disabled:opacity-40"
                                >حفظ</button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {!progressLines.length && <tr><td colSpan={8} className="py-10 text-center text-sm text-muted">لا توجد بنود في الإصدار المعتمد.</td></tr>}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="py-10 text-center text-sm text-muted">اختر مشروعًا لديه إصدار مقايَسة معتمد لعرض بنوده وكمياته المنفذة.</p>
              )}
            </div>
          )}

          {/* ===== مشتريات المشاريع ===== */}
          {tab === 'purchases' && (
            <div className="p-4">
              {!canViewPurchases ? (
                <p className="py-10 text-center text-sm text-muted">لا تملك صلاحية عرض طلبات الشراء.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line text-right text-[11px] font-bold text-muted">
                        <th className="py-2 pe-3">طلب الشراء</th><th className="py-2 pe-3">المشروع</th><th className="py-2 pe-3">التاريخ</th>
                        <th className="py-2 pe-3">الأولوية</th><th className="py-2 pe-3">البنود</th><th className="py-2 pe-3">التقدير</th>
                        <th className="py-2 pe-3">مقدم الطلب</th><th className="py-2 pe-3">الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchases.map((r) => {
                        const status = REQUEST_STATUS[r.status] || { label: r.status, cls: 'bg-surface-sunken text-ink-secondary' };
                        return (
                          <tr key={r.id} className="border-b border-line">
                            <td className="py-2.5 pe-3"><b>{r.requestNumber}</b>{r.notes && <div className="max-w-xs truncate text-[11px] text-muted">{r.notes}</div>}</td>
                            <td className="py-2.5 pe-3 text-xs">{(r as any).projectName || projectName(r.projectId)}</td>
                            <td className="py-2.5 pe-3 text-xs text-muted">{fmtDate(r.date)}</td>
                            <td className="py-2.5 pe-3 text-[11px] font-bold text-ink-secondary">{{ LOW: 'منخفضة', NORMAL: 'عادية', HIGH: 'عالية', URGENT: 'عاجلة' }[r.priority] || r.priority}</td>
                            <td className="py-2.5 pe-3 text-xs">{r.itemsCount ?? '—'}</td>
                            <td className="py-2.5 pe-3 text-xs font-bold">{fmt(r.estimatedTotal ?? 0)}</td>
                            <td className="py-2.5 pe-3 text-xs text-muted">{r.requesterName || '—'}</td>
                            <td className="py-2.5 pe-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${status.cls}`}>{status.label}</span></td>
                          </tr>
                        );
                      })}
                      {!purchases.length && <tr><td colSpan={8} className="py-10 text-center text-sm text-muted">لا توجد طلبات شراء مرتبطة بمشاريع.</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ===== التقارير ===== */}
          {tab === 'reports' && (
            <div className="space-y-5 p-4">
              <div>
                <h3 className="mb-2 text-sm font-black text-ink">المستخلصات والتحصيل حسب المشروع</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line text-right text-[11px] font-bold text-muted">
                        <th className="py-2 pe-3">المشروع</th><th className="py-2 pe-3">عدد المستخلصات</th>
                        <th className="py-2 pe-3">معتمد</th><th className="py-2 pe-3">مدفوع</th><th className="py-2 pe-3">فجوة التحصيل</th>
                        <th className="py-2 pe-3">نسبة التحصيل</th>
                      </tr>
                    </thead>
                    <tbody>
                      {portfolio.map((p) => {
                        const certs = certificates.filter((c) => (c.project_id === p.id || c.projectId === p.id));
                        const approved = certs.filter((c) => ['APPROVED', 'PAID'].includes(c.status)).reduce((s, c) => s + (Number(c.approved_amount ?? 0) || 0), 0);
                        const paid = certs.reduce((s, c) => s + (Number(c.paid_amount ?? 0) || 0), 0);
                        const gap = approved - paid;
                        const rate = approved > 0 ? Math.round((paid / approved) * 100) : 0;
                        return (
                          <tr key={p.id} className="border-b border-line">
                            <td className="py-2.5 pe-3 text-xs font-bold">{p.name}</td>
                            <td className="py-2.5 pe-3 text-xs">{certs.length}</td>
                            <td className="py-2.5 pe-3 text-xs font-bold text-success">{fmt(approved)}</td>
                            <td className="py-2.5 pe-3 text-xs font-bold text-primary">{fmt(paid)}</td>
                            <td className="py-2.5 pe-3 text-xs font-bold text-danger">{fmt(gap)}</td>
                            <td className="py-2.5 pe-3">
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-sunken"><div className="h-full bg-success" style={{ width: `${rate}%` }} /></div>
                                <span className="text-[10px] font-bold text-muted">{rate}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {!portfolio.length && <tr><td colSpan={6} className="py-8 text-center text-sm text-muted">لا توجد بيانات.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <div className="mb-2 flex flex-wrap items-center gap-3">
                  <h3 className="text-sm font-black text-ink">انحراف التكلفة حسب البند — تقرير مشروع</h3>
                  <select className={`${fieldClass()} w-64`} value={reportProjectId} onChange={(e) => loadReportSummary(e.target.value)}>
                    <option value="">— اختر المشروع —</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                {reportProjectId && !reportSummary ? (
                  <div className="flex items-center gap-2 py-6 text-xs text-muted"><Loader2 size={14} className="animate-spin" /> جارٍ التحميل…</div>
                ) : reportSummary ? (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="overflow-x-auto rounded-xl border border-line">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-line bg-surface-muted text-right font-bold text-muted">
                            <th className="py-2 pe-3">البند / المرحلة</th><th className="py-2 pe-3">مخطط</th><th className="py-2 pe-3">فعلي</th><th className="py-2">الانحراف</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(reportSummary.schedule || []).map((row: any) => (
                            <tr key={row.title} className="border-b border-line">
                              <td className="py-2 pe-3 font-bold">{row.title}</td>
                              <td className="py-2 pe-3">{fmt(row.plannedAmount)}</td>
                              <td className="py-2 pe-3">{fmt(row.actualAmount)}</td>
                              <td className={`py-2 font-bold ${(row.plannedAmount - row.actualAmount) < 0 ? 'text-danger' : 'text-success'}`}>{fmt(row.plannedAmount - row.actualAmount)}</td>
                            </tr>
                          ))}
                          {!(reportSummary.schedule || []).length && <tr><td colSpan={4} className="py-6 text-center text-muted">لا توجد بنود ميزانية.</td></tr>}
                        </tbody>
                      </table>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: 'قيمة العقد', value: fmt(reportSummary.contractValue) },
                        { label: 'التكلفة المخططة', value: fmt(reportSummary.plannedCost) },
                        { label: 'التكلفة الفعلية', value: fmt(reportSummary.actualCost) },
                        { label: 'انحراف التكلفة', value: fmt(reportSummary.costVariance), warn: reportSummary.costVariance < 0 },
                        { label: 'المستخلص المعتمد', value: fmt(reportSummary.certifiedAmount) },
                        { label: 'المدفوع', value: fmt(reportSummary.paidAmount) },
                        { label: 'نسبة الإنجاز', value: `${Math.round(reportSummary.completionPercent)}%` },
                        { label: 'المتبقي من العقد', value: fmt(reportSummary.remainingContract) },
                      ].map((metric) => (
                        <div key={metric.label} className={`rounded-xl border p-3 ${metric.warn ? 'border-danger-border bg-danger-soft/60' : 'border-line bg-surface'}`}>
                          <div className="text-[10px] font-bold text-muted">{metric.label}</div>
                          <div className="mt-1 text-sm font-black text-ink">{metric.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="py-6 text-center text-sm text-muted">اختر مشروعًا لعرض انحراف تكلفته حسب بنود الميزانية.</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ProjectExecutionPage;
