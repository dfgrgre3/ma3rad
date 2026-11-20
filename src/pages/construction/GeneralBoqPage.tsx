import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, ClipboardList, Loader2, Plus, Printer, Save, Send, Trash2,
} from 'lucide-react';
import { ActivityGate } from '../../components/ui/ActivityGate';
import { PageHeader } from '../../components/ui/PageHeader';
import { useToast } from '../../components/ui/Toast';
import { AuthService } from '../../services/domains/auth/AuthService';
import { PermissionService } from '../../services/domains/auth/PermissionService';
import { ProjectService, type Project } from '../../services/domains/projects/ProjectService';
import { ProjectBoqService, boqLineTotal, type BoqEstimateSummary, type BoqLineInput } from '../../services/domains/projects/ProjectBoqService';
import { ApartmentEstimateService } from '../../services/domains/projects/ApartmentEstimateService';
import { buildExportHtml, printHtml } from '../../utils/export/export';
import type { EstimateLine } from '../../types/projects/estimateMeasurement';

const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(Math.round(Number(n) || 0)) + ' ج';
const fmtDate = (value?: string | null) => (value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('ar-EG') : '—');

const VERSION_STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'مسودة', cls: 'bg-surface-sunken text-ink-secondary' },
  PENDING: { label: 'بانتظار المراجعة', cls: 'bg-warning-soft text-warning' },
  APPROVED: { label: 'معتمد', cls: 'bg-success-soft text-success' },
  RETURNED: { label: 'معاد', cls: 'bg-danger-soft text-danger' },
};

const fieldClass = () => 'w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-xs focus:border-primary focus:outline-none';

interface LineDraft {
  id?: string;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  materialRate: number;
  laborRate: number;
  equipmentRate: number;
  expenseRate: number;
  wastePercent: number;
  discountPercent: number;
  profitPercent: number;
}

const emptyLine = (): LineDraft => ({
  name: '', category: '', unit: 'م', quantity: 0,
  materialRate: 0, laborRate: 0, equipmentRate: 0, expenseRate: 0,
  wastePercent: 0, discountPercent: 0, profitPercent: 0,
});

const lineToDraft = (line: EstimateLine, quantity: number): LineDraft => ({
  id: line.id,
  name: line.name,
  category: line.category || '',
  unit: line.unit || '',
  quantity,
  materialRate: Number(line.materialRate) || 0,
  laborRate: Number(line.laborRate) || 0,
  equipmentRate: Number(line.equipmentRate) || 0,
  expenseRate: Number(line.expenseRate) || 0,
  wastePercent: Number(line.wastePercent) || 0,
  discountPercent: Number(line.discountPercent) || 0,
  profitPercent: Number(line.profitPercent) || 0,
});

export const GeneralBoqPage: React.FC = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const boqService = useMemo(() => new ProjectBoqService(), []);
  const estimateService = useMemo(() => new ApartmentEstimateService(), []);
  const projectService = useMemo(() => new ProjectService(), []);
  const user = AuthService.getCurrentUser();
  const canUpdate = PermissionService.can(user, 'ui.projects.list.update');
  const canApprove = PermissionService.can(user, 'ui.projects.list.approve');

  const [projects, setProjects] = useState<Project[]>([]);
  const [estimates, setEstimates] = useState<BoqEstimateSummary[]>([]);
  const [projectId, setProjectId] = useState('');
  const [estimateId, setEstimateId] = useState('');
  const [versions, setVersions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({ name: '', terms: '', contingencyPercent: 0, taxPercent: 0 });
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);

  const loadProjects = useCallback(() => {
    try {
      setProjects(projectService.getProjects());
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل المشاريع.');
    } finally {
      setLoading(false);
    }
  }, [projectService]);

  const loadEstimates = useCallback((pid: string) => {
    if (!pid) { setEstimates([]); return; }
    try {
      setEstimates(boqService.getByProject(pid));
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل المقايسات.');
    }
  }, [boqService]);

  const loadVersions = useCallback((eid: string, pid: string) => {
    if (!eid || !pid) { setVersions([]); return; }
    try {
      setVersions(estimateService.getVersions(eid, pid));
    } catch { setVersions([]); }
  }, [estimateService]);

  useEffect(() => { loadProjects(); }, [loadProjects]);
  useEffect(() => { loadEstimates(projectId); }, [projectId, loadEstimates]);
  useEffect(() => { loadVersions(estimateId, projectId); }, [estimateId, projectId, loadVersions]);

  const selectProject = (pid: string) => {
    setProjectId(pid);
    setEstimateId('');
    resetForm();
  };

  const resetForm = () => {
    setForm({ name: '', terms: '', contingencyPercent: 0, taxPercent: 0 });
    setLines([emptyLine()]);
  };

  const newEstimate = () => {
    setEstimateId('');
    resetForm();
  };

  const selectEstimate = (eid: string) => {
    setEstimateId(eid);
    if (!eid || !projectId) { resetForm(); return; }
    try {
      const snapshot = boqService.getSnapshot(eid, projectId);
      setForm({
        name: snapshot.name || '',
        terms: snapshot.terms || '',
        contingencyPercent: Number(snapshot.contingencyPercent) || 0,
        taxPercent: Number(snapshot.taxPercent) || 0,
      });
      const quantities = snapshot.lineQuantities || {};
      setLines((snapshot.costLines || []).map((line) =>
        lineToDraft(line, Number(quantities[line.id] ?? line.manualQuantity ?? 0) || 0)));
      if (!(snapshot.costLines || []).length) setLines([emptyLine()]);
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تحميل المقايسة.');
    }
  };

  const updateLine = (index: number, patch: Partial<LineDraft>) =>
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  const addLine = () => setLines((current) => [...current, emptyLine()]);
  const removeLine = (index: number) => setLines((current) => current.filter((_, i) => i !== index));

  const lineTotal = (line: LineDraft) => boqLineTotal({
    quantity: line.quantity,
    materialRate: line.materialRate, laborRate: line.laborRate,
    equipmentRate: line.equipmentRate, expenseRate: line.expenseRate,
    wastePercent: line.wastePercent, discountPercent: line.discountPercent, profitPercent: line.profitPercent,
  });
  const grandTotal = lines.reduce((sum, line) => sum + lineTotal(line), 0);
  const contractEstimate = grandTotal
    * (1 + (Number(form.contingencyPercent) || 0) / 100)
    * (1 + (Number(form.taxPercent) || 0) / 100);

  const printBoq = () => {
    const project = projects.find((p) => p.id === projectId);
    const boqLines = lines
      .filter((line) => line.name.trim())
      .map((line, index) => ({
        index: index + 1,
        name: line.name,
        category: line.category || '—',
        unit: line.unit || '—',
        quantity: line.quantity,
        total: fmt(lineTotal(line)),
      }));
    const detailColumns = [
      { key: 'index', label: '#' },
      { key: 'name', label: 'البند' },
      { key: 'category', label: 'التصنيف' },
      { key: 'unit', label: 'الوحدة' },
      { key: 'quantity', label: 'الكمية', type: 'qty' },
      { key: 'total', label: 'الإجمالي', type: 'currency' },
    ];
    try {
      printHtml(buildExportHtml({
        title: 'مقايسة أعمال',
        subtitle: `${form.name || 'مقايسة'} — ${project?.name || ''}`,
        columns: detailColumns,
        rows: boqLines,
        kpis: [
          { label: 'الإجمالي قبل الاحتياطي والضريبة', value: fmt(grandTotal) },
          { label: 'الإجمالي التعاقدي', value: fmt(contractEstimate), hint: `احتياطي ${form.contingencyPercent || 0}% · ضريبة ${form.taxPercent || 0}%` },
          { label: 'عدد البنود', value: boqLines.length },
          { label: 'الشروط', value: form.terms || '—' },
        ],
        fileName: `boq-${form.name || estimateId || 'draft'}`,
        notes: ['أسعار البنود تشمل الخامات والعمالة والمعدات والمصروفات مع الهالك والخصم والربح.'],
        permission: 'projects.print',
      }));
    } catch (e: any) {
      toast.error(e?.message || 'تعذر طباعة المقايسة.');
    }
  };

  const save = async () => {
    if (!projectId) { toast.error('اختر المشروع أولًا.'); return; }
    if (!form.name.trim()) { toast.error('اسم المقايسة مطلوب.'); return; }
    if (!lines.some((line) => line.name.trim())) { toast.error('أضف بندًا واحدًا على الأقل.'); return; }
    setSaving(true);
    try {
      const result = boqService.save({
        id: estimateId || undefined,
        projectId,
        name: form.name,
        terms: form.terms || undefined,
        contingencyPercent: Number(form.contingencyPercent) || 0,
        taxPercent: Number(form.taxPercent) || 0,
        lines: lines.filter((line) => line.name.trim()).map((line): BoqLineInput => ({
          id: line.id,
          name: line.name.trim(),
          category: line.category || undefined,
          unit: line.unit || undefined,
          quantity: Number(line.quantity) || 0,
          materialRate: Number(line.materialRate) || 0,
          laborRate: Number(line.laborRate) || 0,
          equipmentRate: Number(line.equipmentRate) || 0,
          expenseRate: Number(line.expenseRate) || 0,
          wastePercent: Number(line.wastePercent) || 0,
          discountPercent: Number(line.discountPercent) || 0,
          profitPercent: Number(line.profitPercent) || 0,
        })),
      });
      toast.success(`تم حفظ المقايسة — إجمالي ${fmt(result.totalAmount)} (إصدار ${result.versionNumber}).`);
      setEstimateId(result.id);
      loadEstimates(projectId);
      loadVersions(result.id, projectId);
    } catch (e: any) {
      toast.error(e?.message || 'تعذر حفظ المقايسة.');
    } finally {
      setSaving(false);
    }
  };

  const submitVersion = (versionId: string) => {
    if (!estimateId || !projectId) return;
    try {
      estimateService.submitVersionForReview(estimateId, versionId, projectId);
      toast.success('تم إرسال الإصدار للمراجعة.');
      loadVersions(estimateId, projectId);
    } catch (e: any) {
      toast.error(e?.message || 'تعذر إرسال الإصدار.');
    }
  };

  const decideVersion = (versionId: string, decision: 'APPROVED' | 'RETURNED') => {
    if (!estimateId || !projectId) return;
    let notes = '';
    if (decision === 'RETURNED') {
      notes = window.prompt('سبب إعادة الإصدار:') || '';
      if (!notes.trim()) return;
    }
    try {
      estimateService.decideVersion(estimateId, versionId, projectId, decision, notes);
      toast.success(decision === 'APPROVED' ? 'تم اعتماد إصدار المقايسة.' : 'تمت إعادة الإصدار.');
      loadVersions(estimateId, projectId);
      loadEstimates(projectId);
    } catch (e: any) {
      toast.error(e?.message || 'تعذر مراجعة الإصدار.');
    }
  };

  const numericCell = (value: number, onChange: (v: number) => void, width = 'w-20') => (
    <input type="number" min={0} className={`${fieldClass()} ${width}`} value={value} onChange={(e) => onChange(Number(e.target.value))} />
  );

  return (
    <div className="space-y-5 p-4 md:p-6" dir="rtl">
      <PageHeader
        title="مقاييس الأعمال العامة"
        description="مقايسات ببنود حرة للكميات اليدوية — للمشاريع غير السكنية. بعد الاعتماد تُدار العقود والمستخلصات من صفحة تنفيذ المشاريع."
        icon={<ClipboardList size={22} />}
        actions={
          <button type="button" onClick={() => navigate('/projects/execution')} className="inline-flex items-center gap-1 rounded-lg border border-line-strong bg-surface px-3 py-2 text-xs font-bold text-ink hover:bg-surface-muted">
            <ArrowRight size={14} /> تنفيذ المشاريع
          </button>
        }
      />

      {error && <div className="rounded-xl border border-danger-border bg-danger-soft px-4 py-3 text-sm font-bold text-danger">{error}</div>}

      {/* selectors */}
      <div className="grid gap-3 rounded-2xl border border-line bg-surface p-4 shadow-sm md:grid-cols-3">
        <label className="text-xs font-bold text-ink-secondary">المشروع
          <select className={`${fieldClass()} mt-1 !py-2`} value={projectId} onChange={(e) => selectProject(e.target.value)}>
            <option value="">— اختر —</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-ink-secondary">المقايسة
          <select className={`${fieldClass()} mt-1 !py-2`} value={estimateId} onChange={(e) => selectEstimate(e.target.value)} disabled={!projectId}>
            <option value="">— مقايَسة جديدة —</option>
            {estimates.map((estimate) => (
              <option key={estimate.id} value={estimate.id}>
                {estimate.name} — {fmt(estimate.totalAmount)} ({VERSION_STATUS[estimate.currentVersionStatus || '']?.label || estimate.currentVersionStatus || '—'})
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <ActivityGate element="new-item"><button type="button" onClick={newEstimate} disabled={!projectId} className="rounded-lg border border-accent-border bg-surface px-3 py-2 text-xs font-bold text-primary disabled:opacity-40">+ مقايَسة جديدة</button></ActivityGate>
        </div>
      </div>

      {projectId ? (
        <div className="space-y-4">
          {/* header fields */}
          <div className="grid gap-3 rounded-2xl border border-line bg-surface p-4 shadow-sm md:grid-cols-2 xl:grid-cols-5">
            <label className="text-xs font-bold text-ink-secondary xl:col-span-2">اسم المقايسة
              <input className={`${fieldClass()} mt-1 !py-2`} value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} placeholder="مثال: تشطيبات فرع المعادي — دور أرضي" />
            </label>
            <label className="text-xs font-bold text-ink-secondary">الشروط
              <input className={`${fieldClass()} mt-1 !py-2`} value={form.terms} onChange={(e) => setForm((c) => ({ ...c, terms: e.target.value }))} placeholder="دفعات حسب المستخلصات" />
            </label>
            <label className="text-xs font-bold text-ink-secondary">احتياطي %
              <input type="number" min={0} className={`${fieldClass()} mt-1 !py-2`} value={form.contingencyPercent} onChange={(e) => setForm((c) => ({ ...c, contingencyPercent: Number(e.target.value) }))} />
            </label>
            <label className="text-xs font-bold text-ink-secondary">ضريبة %
              <input type="number" min={0} className={`${fieldClass()} mt-1 !py-2`} value={form.taxPercent} onChange={(e) => setForm((c) => ({ ...c, taxPercent: Number(e.target.value) }))} />
            </label>
          </div>

          {/* lines editor */}
          <div className="rounded-2xl border border-line bg-surface shadow-sm">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h3 className="text-sm font-black text-ink">بنود المقايسة</h3>
              <div className="flex items-center gap-2">
                <button type="button" onClick={printBoq} disabled={!lines.some((l) => l.name.trim())} className="inline-flex items-center gap-1 rounded-lg border border-line-strong bg-surface px-2 py-1 text-[11px] font-bold text-ink-secondary disabled:opacity-40"><Printer size={12} /> طباعة</button>
                <button type="button" onClick={addLine} className="inline-flex items-center gap-1 rounded-lg border border-line-strong bg-surface px-2 py-1 text-[11px] font-bold text-ink-secondary"><Plus size={12} /> بند</button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-line bg-surface-muted text-right font-bold text-muted">
                    <th className="px-2 py-2">#</th><th className="px-2 py-2">البند</th><th className="px-2 py-2">التصنيف</th>
                    <th className="px-2 py-2">الوحدة</th><th className="px-2 py-2">الكمية</th>
                    <th className="px-2 py-2">خامات</th><th className="px-2 py-2">عمالة</th><th className="px-2 py-2">معدات</th><th className="px-2 py-2">مصروفات</th>
                    <th className="px-2 py-2">هالك%</th><th className="px-2 py-2">خصم%</th><th className="px-2 py-2">ربح%</th>
                    <th className="px-2 py-2">الإجمالي</th><th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => (
                    <tr key={index} className="border-b border-line">
                      <td className="px-2 py-1.5 text-muted">{index + 1}</td>
                      <td className="px-2 py-1.5"><input className={fieldClass()} value={line.name} onChange={(e) => updateLine(index, { name: e.target.value })} placeholder="اسم البند" /></td>
                      <td className="px-2 py-1.5"><input className={fieldClass()} value={line.category} onChange={(e) => updateLine(index, { category: e.target.value })} placeholder="تصنيف" /></td>
                      <td className="px-2 py-1.5"><input className={`${fieldClass()} w-16`} value={line.unit} onChange={(e) => updateLine(index, { unit: e.target.value })} /></td>
                      <td className="px-2 py-1.5">{numericCell(line.quantity, (v) => updateLine(index, { quantity: v }))}</td>
                      <td className="px-2 py-1.5">{numericCell(line.materialRate, (v) => updateLine(index, { materialRate: v }))}</td>
                      <td className="px-2 py-1.5">{numericCell(line.laborRate, (v) => updateLine(index, { laborRate: v }))}</td>
                      <td className="px-2 py-1.5">{numericCell(line.equipmentRate, (v) => updateLine(index, { equipmentRate: v }))}</td>
                      <td className="px-2 py-1.5">{numericCell(line.expenseRate, (v) => updateLine(index, { expenseRate: v }))}</td>
                      <td className="px-2 py-1.5">{numericCell(line.wastePercent, (v) => updateLine(index, { wastePercent: v }), 'w-14')}</td>
                      <td className="px-2 py-1.5">{numericCell(line.discountPercent, (v) => updateLine(index, { discountPercent: v }), 'w-14')}</td>
                      <td className="px-2 py-1.5">{numericCell(line.profitPercent, (v) => updateLine(index, { profitPercent: v }), 'w-14')}</td>
                      <td className="px-2 py-1.5 font-black text-ink">{fmt(lineTotal(line))}</td>
                      <td className="px-2 py-1.5">
                        <button type="button" onClick={() => removeLine(index)} disabled={lines.length <= 1} className="rounded border border-danger-border bg-surface p-1 text-danger disabled:opacity-30"><Trash2 size={12} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-surface-muted font-black text-ink">
                    <td colSpan={12} className="px-3 py-2 text-left">الإجمالي قبل الاحتياطي والضريبة</td>
                    <td className="px-2 py-2">{fmt(grandTotal)}</td>
                    <td></td>
                  </tr>
                  <tr className="bg-accent-soft font-black text-primary">
                    <td colSpan={12} className="px-3 py-2 text-left">الإجمالي التعاقدي (مع الاحتياطي والضريبة)</td>
                    <td className="px-2 py-2">{fmt(contractEstimate)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {canUpdate && (
              <div className="flex items-center gap-2 border-t border-line px-4 py-3">
                <button type="button" disabled={saving} onClick={() => void save()} className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-40">
                  <Save size={14} /> {saving ? 'جارٍ الحفظ…' : 'حفظ إصدار جديد'}
                </button>
                <span className="text-[10px] text-muted">كل حفظ ينشئ إصدارًا جديدًا قابلًا للمراجعة والاعتماد.</span>
              </div>
            )}
          </div>

          {/* versions */}
          {estimateId && (
            <div className="rounded-2xl border border-line bg-surface shadow-sm">
              <div className="border-b border-line px-4 py-3">
                <h3 className="text-sm font-black text-ink">إصدارات المقايسة</h3>
              </div>
              <div className="divide-y divide-line-strong">
                {versions.map((version) => {
                  const status = VERSION_STATUS[version.status] || { label: version.status, cls: 'bg-surface-sunken text-ink-secondary' };
                  const isLatest = versions[0]?.id === version.id;
                  return (
                    <div key={version.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-xs">
                      <b>إصدار {version.versionNumber}</b>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${status.cls}`}>{status.label}</span>
                      <span className="text-muted">{fmtDate(version.createdAt)} · {version.createdByName}</span>
                      {version.reviewNotes && <span className="text-danger">ملاحظة: {version.reviewNotes}</span>}
                      <span className="flex-1" />
                      {canUpdate && isLatest && ['DRAFT', 'RETURNED'].includes(version.status) && (
                        <button type="button" onClick={() => submitVersion(version.id)} className="inline-flex items-center gap-1 rounded-lg border border-warning bg-surface px-2 py-1 font-bold text-warning"><Send size={11} /> إرسال للمراجعة</button>
                      )}
                      {canApprove && version.status === 'PENDING' && (
                        <>
                          <button type="button" onClick={() => decideVersion(version.id, 'APPROVED')} className="rounded-lg bg-success px-2 py-1 font-bold text-white">اعتماد</button>
                          <button type="button" onClick={() => decideVersion(version.id, 'RETURNED')} className="rounded-lg border border-danger-border bg-surface px-2 py-1 font-bold text-danger">إعادة</button>
                        </>
                      )}
                    </div>
                  );
                })}
                {!versions.length && <p className="px-4 py-6 text-center text-xs text-muted">احفظ المقايسة أولًا لإنشاء إصدار.</p>}
              </div>
              {versions.some((v) => v.status === 'APPROVED') && (
                <div className="border-t border-success-border bg-success-soft/60 px-4 py-3 text-[11px] text-success">
                  يوجد إصدار معتمد — يمكن الآن إنشاء عقد ومستخلصات من <button type="button" onClick={() => navigate('/projects/execution')} className="font-black underline">صفحة تنفيذ المشاريع</button>.
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted"><Loader2 className="animate-spin" size={18} /> جارٍ التحميل…</div>
        ) : (
          <div className="rounded-2xl border border-dashed border-line-strong bg-surface/60 py-16 text-center text-sm text-muted">
            اختر مشروعًا لبدء مقايَسة عامة ببنود حرة.
          </div>
        )
      )}
    </div>
  );
};

export default GeneralBoqPage;
