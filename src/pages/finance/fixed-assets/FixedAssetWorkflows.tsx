import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, ExternalLink, FileUp, Printer, X } from 'lucide-react';
import QRCode from 'qrcode';
import { AuthService } from '../../../services/auth/AuthService';
import {
  FinanceExtrasService, type FixedAsset, type FixedAssetCountCampaign,
  type FixedAssetCountAudit, type FixedAssetCountObservation, type FixedAssetCountSnapshot,
  type FixedAssetAttachment, type FixedAssetDepreciationPeriod, type FixedAssetDepreciationRequest,
  type FixedAssetDisposal, type FixedAssetSettlementSource,
  type FixedAssetMaintenance, type FixedAssetTimelineEvent, type FixedAssetTransfer,
} from '../../../services/finance/FinanceExtrasService';
import { localDateString } from '../../../utils/shared/date';
import { exportToExcel, exportToPdf } from '../../../utils/export/export';

type Workflow = 'timeline' | 'transfer' | 'maintenance' | 'disposal' | 'depreciation' | 'count' | 'attachments';
const workflowTitles: Record<Workflow, string> = {
  timeline: 'الخط الزمني',
  transfer: 'نقل الأصل', maintenance: 'الصيانة والتحسينات', disposal: 'الاستبعاد والبيع',
  depreciation: 'طلب مراجعة الإهلاك', count: 'الجرد الفعلي',
  attachments: 'مستندات الأصل',
};
const attachmentTypeLabels: Record<FixedAssetAttachment['documentType'], string> = {
  INVOICE: 'فاتورة', WARRANTY: 'ضمان', PURCHASE_CONTRACT: 'عقد شراء', OWNERSHIP: 'ملكية', OTHER: 'أخرى',
};
const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

interface Props {
  service: FinanceExtrasService;
  assets: FixedAsset[];
  initialAssetId?: string;
  initialWorkflow?: Workflow;
  canManage: boolean;
  canExport: boolean;
  onClose: () => void;
  onChanged: () => void;
}

export const FixedAssetWorkflows: React.FC<Props> = ({
  service, assets, initialAssetId, initialWorkflow, canManage, canExport, onClose, onChanged,
}) => {
  const [workflow, setWorkflow] = useState<Workflow>(initialWorkflow || 'timeline');
  const [assetId, setAssetId] = useState(initialAssetId || assets[0]?.id || '');
  const [branchId, setBranchId] = useState('');
  const [branches, setBranches] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [responsibleUsers, setResponsibleUsers] = useState<Array<{ id: string; name: string }>>([]);
  const [transfers, setTransfers] = useState<FixedAssetTransfer[]>([]);
  const [timeline, setTimeline] = useState<FixedAssetTimelineEvent[]>([]);
  const [maintenance, setMaintenance] = useState<FixedAssetMaintenance[]>([]);
  const [depreciation, setDepreciation] = useState<FixedAssetDepreciationPeriod[]>([]);
  const [depreciationRequests, setDepreciationRequests] = useState<FixedAssetDepreciationRequest[]>([]);
  const [schedule, setSchedule] = useState<Array<{ period: string; amount: number; status: string }>>([]);
  const [disposal, setDisposal] = useState<FixedAssetDisposal | null>(null);
  const [settlementSources, setSettlementSources] = useState<FixedAssetSettlementSource[]>([]);
  const [settlementSelection, setSettlementSelection] = useState('');
  const [attachments, setAttachments] = useState<FixedAssetAttachment[]>([]);
  const [attachmentType, setAttachmentType] = useState<FixedAssetAttachment['documentType']>('INVOICE');
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [campaigns, setCampaigns] = useState<FixedAssetCountCampaign[]>([]);
  const [campaignId, setCampaignId] = useState('');
  const [observations, setObservations] = useState<FixedAssetCountObservation[]>([]);
  const [snapshots, setSnapshots] = useState<FixedAssetCountSnapshot[]>([]);
  const [countAudit, setCountAudit] = useState<FixedAssetCountAudit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [period, setPeriod] = useState(localDateString().slice(0, 7));
  const [usage, setUsage] = useState('');

  const asset = useMemo(() => assets.find((item) => item.id === assetId), [assets, assetId]);
  const currentActorId = AuthService.getCurrentUser()?.id;
  const refresh = useCallback(() => {
    setLoading(true);
    setError('');
    try {
      if (assetId) {
        setTimeline(service.getFixedAssetTimeline(assetId));
        setTransfers(service.getFixedAssetTransfers(assetId));
        setMaintenance(service.getFixedAssetMaintenance(assetId));
        setDepreciation(service.getFixedAssetDepreciationPeriods(assetId));
        setDepreciationRequests(service.getFixedAssetDepreciationRequests(assetId));
        setSchedule(service.getDepreciationSchedule(assetId, period, usage === '' ? undefined : Number(usage)));
        setDisposal(service.getFixedAssetDisposal(assetId));
        const sources = service.getFixedAssetSettlementSources(assetId);
        setSettlementSources(sources);
        setSettlementSelection((current) => sources.some((source) => `${source.type}:${source.id}` === current)
          ? current : (sources[0] ? `${sources[0].type}:${sources[0].id}` : ''));
        setAttachments(service.getFixedAssetAttachments(assetId));
      }
      const nextCampaigns = service.getFixedAssetCountCampaigns();
      setCampaigns(nextCampaigns);
      setCampaignId((current) => nextCampaigns.some((item) => item.id === current) ? current : nextCampaigns[0]?.id || '');
      const nextBranches = service.getFixedAssetBranches();
      setBranches(nextBranches);
      const selectedBranch = branchId && nextBranches.some((item) => item.id === branchId)
        ? branchId : service.getFixedAssetCurrentBranch();
      setBranchId(selectedBranch);
      setResponsibleUsers(service.getFixedAssetResponsibleUsers(selectedBranch));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل بيانات العمليات.');
    } finally {
      setLoading(false);
    }
  }, [assetId, branchId, period, service, usage]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!branchId) { setDepartments([]); return; }
    try {
      setDepartments(service.getFixedAssetDepartments(branchId));
      setResponsibleUsers(service.getFixedAssetResponsibleUsers(branchId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل بيانات الفرع.');
    }
  }, [branchId, service]);
  useEffect(() => {
    if (!campaignId) { setObservations([]); return; }
    try {
      setObservations(service.getFixedAssetCountObservations(campaignId));
      setSnapshots(service.getFixedAssetCountSnapshots(campaignId));
      setCountAudit(service.getFixedAssetCountAudit(campaignId));
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر تحميل سجل الجرد.'); }
  }, [campaignId, service]);

  const run = (action: () => void, success: string) => {
    setError('');
    setMessage('');
    try {
      action();
      setMessage(success);
      refresh();
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تنفيذ العملية.');
    }
  };

  const exportRows = workflow === 'timeline' ? timeline
    : workflow === 'transfer' ? transfers
    : workflow === 'maintenance' ? maintenance
      : workflow === 'depreciation' ? depreciation
        : workflow === 'attachments' ? attachments
          : observations;
  const exportReport = (pdf: boolean) => {
    const columns = exportRows.length
      ? Object.keys(exportRows[0]).map((key) => ({ key, label: key }))
      : [{ key: 'message', label: 'النتيجة' }];
    const options = {
      title: `الأصول الثابتة — ${workflowTitles[workflow]}`,
      subtitle: asset ? `${asset.code} — ${asset.name}` : `الحملة ${campaignId || '—'}`,
      fileName: `fixed-assets-${workflow}-${localDateString()}`,
      permission: 'finance.export' as const,
      columns,
      rows: exportRows.length ? exportRows : [{ message: 'لا توجد سجلات' }],
    };
    if (pdf) exportToPdf(options); else exportToExcel(options);
  };

  const selectedCampaign = campaigns.find((item) => item.id === campaignId);
  const formShell = 'space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/50';
  const importAttachment = async () => {
    setError('');
    setMessage('');
    setAttachmentBusy(true);
    try {
      const importer = window.ceramisys?.documents?.importFile;
      if (!importer) throw new Error('إرفاق الملفات يتطلب تطبيق سطح المكتب والتخزين المحلي الآمن.');
      const file = await importer();
      if (!file?.ok) {
        if (file?.error) throw new Error(file.error);
        return;
      }
      if (!file.storageName || !file.fileName || !file.fileSize) throw new Error('لم يُرجع التخزين المحلي بيانات ملف مكتملة.');
      service.addFixedAssetAttachment({
        assetId, documentType: attachmentType, fileName: file.fileName,
        mimeType: file.mimeType, fileSize: file.fileSize, checksum: file.checksum, storageName: file.storageName,
      });
      setMessage('تم إرفاق المستند من التخزين المحلي وتسجيله في سجل الأصل.');
      refresh();
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر إرفاق المستند.');
    } finally {
      setAttachmentBusy(false);
    }
  };
  const openAttachment = async (storageName: string) => {
    setError('');
    try {
      const opener = window.ceramisys?.documents?.openFile;
      if (!opener) throw new Error('فتح الملفات متاح من تطبيق سطح المكتب فقط.');
      const result = await opener(storageName);
      if (!result?.ok) throw new Error(result?.error || 'تعذر فتح الملف المحلي.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر فتح الملف المحلي.');
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-2 backdrop-blur-sm sm:p-5" dir="rtl" role="dialog" aria-modal="true" aria-label="عمليات الأصول الثابتة">
      <section className="flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-[var(--cerami-surface)]">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700 sm:px-6">
          <div><h2 className="font-black">عمليات الأصول الثابتة</h2><p className="mt-1 text-xs text-slate-500">سجلات محفوظة ومؤرخة — دون تعديل كميات المخزون</p></div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="إغلاق"><X className="h-4 w-4" /></button>
        </header>
        <div className="flex flex-wrap gap-1 border-b border-slate-200 p-2 dark:border-slate-700">
          {(Object.keys(workflowTitles) as Workflow[]).map((key) => (
            <button type="button" key={key} onClick={() => setWorkflow(key)}
              aria-pressed={workflow === key}
              className={`rounded-lg px-3 py-2 text-xs font-bold ${workflow === key ? 'bg-violet-700 text-white' : 'text-slate-600 hover:bg-violet-50 dark:text-slate-300'}`}>
              {workflowTitles[key]}
            </button>
          ))}
          {canExport && <div className="mr-auto flex gap-1">
            <button type="button" onClick={() => exportReport(false)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-bold"><Download className="h-3 w-3" /> Excel</button>
            <button type="button" onClick={() => exportReport(true)} className="rounded-lg border px-3 py-2 text-xs font-bold">PDF</button>
          </div>}
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4 sm:p-6">
          {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
          {message && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>}
          {loading && <div role="status" className="text-sm text-slate-500">جارٍ تحميل السجلات…</div>}
          {workflow !== 'count' && <label className="block max-w-xl text-xs font-bold">الأصل
            <select className={`${inputClass} mt-1`} value={assetId} onChange={(event) => setAssetId(event.target.value)}>
              {assets.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}
            </select>
          </label>}
          {workflow === 'timeline' && (
            <section aria-label="الخط الزمني لتاريخ الأصل">
              <div className="mb-3 rounded-xl border border-violet-200 bg-violet-50/70 p-3 dark:border-violet-900 dark:bg-violet-950/30">
                <h3 className="text-sm font-black text-violet-950 dark:text-violet-100">السجل الموحد للأصل</h3>
                <p className="mt-1 text-xs leading-5 text-violet-800 dark:text-violet-200">
                  اقتناء ونقل وصيانة وإهلاك مرحّل واستبعاد من السجلات المعتمدة، مرتبة زمنيًا لأغراض المراجعة.
                </p>
              </div>
              {loading ? <p role="status" className="py-6 text-center text-sm text-slate-500">جارٍ تحميل الخط الزمني…</p>
                : timeline.length
                  ? <AssetTimeline events={timeline} />
                  : <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
                    لا توجد أحداث محفوظة لهذا الأصل حتى الآن.
                  </div>}
            </section>
          )}
          {workflow === 'transfer' && <form className={formShell} onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            run(() => service.transferFixedAsset({
              assetId, transferDate: String(data.get('date')), branchId: String(data.get('branch')),
              departmentId: String(data.get('department') || '') || undefined, location: String(data.get('location') || ''),
              responsibleUserId: String(data.get('responsible') || '') || undefined, notes: String(data.get('notes') || ''),
            }), 'تم نقل الأصل وتسجيل سجل النقل.');
          }}>
            <h3 className="text-sm font-black">تحديث الفرع والمسؤول والموقع مع حفظ القيم السابقة</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="تاريخ النقل" name="date" type="date" defaultValue={localDateString()} required />
              <label className="text-xs font-bold">الفرع الوجهة<select name="branch" className={`${inputClass} mt-1`} value={branchId} onChange={(event) => setBranchId(event.target.value)} required>{branches.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
              <label className="text-xs font-bold">القسم<select name="department" defaultValue={asset?.departmentId || ''} className={`${inputClass} mt-1`}>
                <option value="">دون قسم</option>{departments.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
              </select></label>
              <Field label="الموقع" name="location" defaultValue={asset?.location || ''} />
              <label className="text-xs font-bold">المسؤول<select name="responsible" defaultValue={asset?.responsibleUserId || ''} className={`${inputClass} mt-1`}>
                <option value="">دون مسؤول</option>{responsibleUsers.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
              </select></label>
              <Field label="ملاحظات" name="notes" />
            </div>
            <Submit canManage={canManage} label="حفظ النقل" />
          </form>}
          {workflow === 'maintenance' && <form className={formShell} onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            run(() => service.recordFixedAssetMaintenance({
              assetId, date: String(data.get('date')), type: String(data.get('type')), description: String(data.get('description')),
              cost: Number(data.get('cost')), treatment: String(data.get('treatment')) as 'OPERATIONAL' | 'CAPITALIZED',
              vendor: String(data.get('vendor') || ''), nextDate: String(data.get('nextDate') || '') || undefined,
            }), 'تم حفظ الصيانة وترحيل قيد متوازن إلى الحسابات المستحقة ذات الصلة.');
          }}>
            <h3 className="text-sm font-black">سجل مستقل لكل زيارة صيانة</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="تاريخ الصيانة" name="date" type="date" defaultValue={localDateString()} required />
              <Field label="النوع" name="type" required />
              <Field label="الوصف" name="description" required />
              <Field label="التكلفة" name="cost" type="number" min="0" step="0.01" defaultValue="0" required />
              <label className="text-xs font-bold">المعالجة<select name="treatment" className={`${inputClass} mt-1`}><option value="OPERATIONAL">مصروف تشغيلي — مدين 5201 ودائن 2201</option><option value="CAPITALIZED">تحسين رأسمالي — زيادة الأصل ودائن موردين</option></select></label>
              <Field label="المورد" name="vendor" />
              <Field label="موعد الصيانة التالية" name="nextDate" type="date" />
            </div>
            <Submit canManage={canManage} label="حفظ الصيانة" />
          </form>}
          {workflow === 'disposal' && (disposal
            ? <History title="سجل الاستبعاد المعتمد" rows={[`${disposal.disposalDate}: ${disposal.reason}; المتحصلات ${disposal.saleProceeds}; المصروفات ${disposal.expenses}; القيمة الدفترية ${disposal.bookValue}; الربح/الخسارة ${disposal.gainLoss}; المعتمد ${disposal.approvedBy}`]} />
            : <form className={formShell} onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            if (!window.confirm('اعتماد الاستبعاد؟ سيتم إنشاء قيد محاسبي وترحيل حالة الأصل إلى مستبعد.')) return;
            run(() => {
              const result = service.disposeFixedAsset({
                assetId, date: String(data.get('date')), reason: String(data.get('reason')),
                proceeds: Number(data.get('proceeds')), expenses: Number(data.get('expenses') || 0), buyer: String(data.get('buyer') || ''),
                settlementType: String(data.get('settlement')).split(':')[0] as 'CASH_REGISTER' | 'BANK_ACCOUNT',
                settlementId: String(data.get('settlement')).split(':').slice(1).join(':'),
              });
              setMessage(`تم اعتماد الاستبعاد. صافي الربح/الخسارة قبل مصروفات الاستبعاد: ${result.gainLoss.toFixed(2)}.`);
            }, 'تم اعتماد الاستبعاد وتسجيل القيد المتوازن.');
          }}>
            <h3 className="text-sm font-black">الاستبعاد نهائي وغير قابل للتكرار. مجمع الإهلاك المستخدم هو المبلغ المسجل حتى الآن.</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="تاريخ الاستبعاد" name="date" type="date" defaultValue={localDateString()} required />
              <Field label="سبب الاستبعاد" name="reason" required />
              <Field label="متحصلات البيع" name="proceeds" type="number" min="0" step="0.01" defaultValue="0" required />
              <Field label="مصروفات الاستبعاد" name="expenses" type="number" min="0" step="0.01" defaultValue="0" />
              <Field label="المشتري" name="buyer" />
              <label className="text-xs font-bold">قناة التسوية
                <select className={`${inputClass} mt-1`} name="settlement" value={settlementSelection}
                  onChange={(event) => setSettlementSelection(event.target.value)} required>
                  {settlementSources.map((source) => (
                    <option key={`${source.type}:${source.id}`} value={`${source.type}:${source.id}`}>
                      {source.type === 'CASH_REGISTER' ? 'خزينة' : 'بنك'} — {source.name} (الرصيد: {Number(source.currentBalance).toFixed(2)})
                    </option>
                  ))}
                </select>
                {!settlementSources.length && <span className="mt-1 block font-normal text-rose-700">لا توجد خزينة أو حساب بنكي نشط لهذا الفرع.</span>}
              </label>
            </div>
            {asset && <p className="text-xs text-slate-600">القيمة الدفترية المسجلة: {(Math.max(0, Number(asset.purchaseCost) - Number(asset.accumulatedDepreciation))).toFixed(2)}</p>}
            <Submit canManage={canManage} label="اعتماد الاستبعاد" />
          </form>)}
          {workflow === 'depreciation' && <div className={formShell}>
            <h3 className="text-sm font-black">طلب مراجعة إهلاك ثم اعتماد منفصل</h3>
            <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">لن يُنشأ قيد يومية أو صف إهلاك مرحّل حتى يوافق مستخدم آخر على الطلب.</p>
            <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => {
              event.preventDefault();
              run(() => { service.requestFixedAssetDepreciation(assetId, period, usage === '' ? undefined : Number(usage)); },
                `تم حفظ طلب إهلاك الفترة ${period} بحالة قيد المراجعة دون قيد يومية.`);
            }}>
              <label className="text-xs font-bold">الفترة<input className={`${inputClass} mt-1`} type="month" value={period} onChange={(event) => setPeriod(event.target.value)} required /></label>
              {asset?.depreciationMethod === 'UNITS_OF_PRODUCTION' && <label className="text-xs font-bold">كمية الاستخدام للفترة<input className={`${inputClass} mt-1`} type="number" min="0" step="0.01" value={usage} onChange={(event) => setUsage(event.target.value)} required /></label>}
              <div className="sm:col-span-2"><Submit canManage={canManage} label="إرسال للمراجعة" /></div>
            </form>
            <History title="الجدول المحسوب حتى الفترة المختارة" rows={schedule.map((row) => `${row.period}: ${row.amount} — ${row.status}`)} />
            <History title="الفترات المرحلة" rows={depreciation.map((row) => `${row.period}: ${row.amount} — ${row.status}`)} />
            <section aria-label="طلبات مراجعة الإهلاك" className="space-y-2">
              <h4 className="text-xs font-black">سجل الطلبات والمراجعة</h4>
              {!depreciationRequests.length && <p className="rounded-lg border border-dashed p-4 text-xs text-slate-500">لا توجد طلبات إهلاك لهذا الأصل.</p>}
              {depreciationRequests.map((request) => (
                <div key={request.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{request.period} — {Number(request.amount).toFixed(2)} — {request.status === 'PENDING' ? 'قيد المراجعة' : 'معتمد ومرحّل'}</p>
                    <p className="mt-1 text-slate-500">مقدم الطلب: {request.requesterName}؛ المعتمد: {request.approverName || '—'}{request.journalEntryId ? `؛ القيد: ${request.journalEntryId}` : ''}</p>
                  </div>
                  {request.status === 'PENDING' && (() => {
                    const ownRequest = Boolean(currentActorId && request.requestedBy === currentActorId);
                    const actorUnavailable = !currentActorId;
                    return <button type="button" disabled={!canManage || ownRequest || actorUnavailable}
                    onClick={() => run(() => { service.approveFixedAssetDepreciationRequest(request.id); }, 'تم اعتماد الطلب وترحيل القيد والفترة ذريًا.')}
                    title={ownRequest ? 'يجب أن يعتمد الطلب مستخدم مختلف عن مقدمه.' : undefined}
                    className="rounded-lg bg-emerald-700 px-3 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
                    {ownRequest ? 'لا يمكنك اعتماد طلبك' : actorUnavailable ? 'تعذر التحقق من المعتمد' : 'مراجعة واعتماد'}
                  </button>;
                  })()}
                </div>
              ))}
            </section>
          </div>}
          {workflow === 'attachments' && <section className={formShell} aria-label="مرفقات الأصل">
            <h3 className="text-sm font-black">مستندات محفوظة محليًا للأصل</h3>
            <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">تُنسخ الملفات إلى مخزن المستندات المحلي داخل التطبيق، ولا تُرفع إلى خدمة خارجية. الحد الأقصى 25 ميجابايت.</p>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <label className="text-xs font-bold">تصنيف المستند
                <select className={`${inputClass} mt-1`} value={attachmentType}
                  onChange={(event) => setAttachmentType(event.target.value as FixedAssetAttachment['documentType'])}>
                  <option value="INVOICE">فاتورة</option><option value="WARRANTY">ضمان</option>
                  <option value="PURCHASE_CONTRACT">عقد شراء</option><option value="OWNERSHIP">ملكية</option>
                  <option value="OTHER">أخرى</option>
                </select>
              </label>
              <button type="button" onClick={importAttachment} disabled={!canManage || attachmentBusy}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-violet-700 px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
                <FileUp className="h-4 w-4" />{attachmentBusy ? 'جارٍ حفظ الملف…' : 'إرفاق من الجهاز'}
              </button>
            </div>
            <div className="space-y-2">
              {!attachments.length && <p className="rounded-lg border border-dashed border-slate-300 p-5 text-center text-xs text-slate-500">لا توجد مستندات مرفقة.</p>}
              {attachments.map((item) => (
                <div key={item.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{item.fileName}</p>
                    <p className="mt-1 text-slate-500">{attachmentTypeLabels[item.documentType]} — {(Number(item.fileSize) / 1024 / 1024).toFixed(2)} م.ب — {item.uploadedByName} — {item.createdAt}</p>
                  </div>
                  <button type="button" onClick={() => openAttachment(item.storageName)}
                    className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300 px-3 py-2 font-bold hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600 dark:border-slate-700 dark:hover:bg-slate-800">
                    <ExternalLink className="h-3.5 w-3.5" /> فتح محليًا
                  </button>
                </div>
              ))}
            </div>
            {asset && <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
              <AssetPrintCard asset={asset} />
            </div>}
          </section>}
          {workflow === 'count' && <div className={formShell}>
            <h3 className="text-sm font-black">حملات الجرد الفعلي</h3>
            <form className="grid gap-3 sm:grid-cols-3" onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              run(() => {
                const id = service.createFixedAssetCountCampaign({ branchId: String(data.get('branch')), location: String(data.get('location') || ''), date: String(data.get('date')) });
                setCampaignId(id);
              }, 'تم إنشاء حملة الجرد وحفظ لقطة الأصول المسجلة.');
            }}>
              <label className="text-xs font-bold">الفرع<select name="branch" className={`${inputClass} mt-1`} value={branchId} onChange={(event) => setBranchId(event.target.value)} required>{branches.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
              <Field label="الموقع (فارغ = كل المواقع)" name="location" />
              <Field label="تاريخ الجرد" name="date" type="date" defaultValue={localDateString()} required />
              <div className="sm:col-span-3"><Submit canManage={canManage} label="إنشاء حملة" /></div>
            </form>
            <label className="mt-4 block text-xs font-bold">الحملة<select className={`${inputClass} mt-1`} value={campaignId} onChange={(event) => setCampaignId(event.target.value)}>{campaigns.map((row) => <option key={row.id} value={row.id}>{row.countDate} — {row.location || 'كل المواقع'} — {row.status}</option>)}</select></label>
            {selectedCampaign?.status === 'OPEN' && <form className="mt-3 grid gap-3 sm:grid-cols-3" onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              run(() => service.recordFixedAssetCountObservation({
                campaignId, code: String(data.get('code')), condition: String(data.get('condition') || ''), notes: String(data.get('notes') || ''),
              }), 'تم تسجيل ملاحظة جرد. الأصل غير المسجل لا يغير المخزون.');
            }}>
              <Field label="مسح أو إدخال كود الأصل" name="code" required />
              <Field label="الحالة / الجودة" name="condition" />
              <Field label="ملاحظات" name="notes" />
              <div className="flex flex-wrap gap-2 sm:col-span-3">
                <Submit canManage={canManage} label="تسجيل نتيجة" />
                {canManage && <button type="button" onClick={() => run(() => service.finalizeFixedAssetCountCampaign(campaignId), 'تم اعتماد نتائج الحملة وحفظ الأصول المفقودة.')} className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white">إنهاء واعتماد الجرد</button>}
              </div>
            </form>}
            {selectedCampaign?.status === 'FINALIZED' && <p className="mt-3 text-xs font-bold text-emerald-700">الحملة معتمدة ومقفلة.</p>}
            <section className="mt-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950/40">
              <h4 className="text-xs font-black">الأصول المسجلة ضمن نطاق الحملة</h4>
              {snapshots.length ? <ul className="mt-2 max-h-36 space-y-1 overflow-auto text-xs">{snapshots.map((row) =>
                <li key={row.assetId} className="flex justify-between gap-2 border-b border-slate-100 py-1 dark:border-slate-800">
                  <span>{row.assetCode} — {row.assetName} ({row.registeredStatus}؛ {row.registeredLocation || 'دون موقع'})</span>
                  <strong className={row.observed ? 'text-emerald-700' : 'text-amber-700'}>{row.observed ? 'تمت المعاينة' : 'لم تتم المعاينة'}</strong>
                </li>)}</ul> : <p className="mt-2 text-xs text-slate-400">لا توجد أصول مسجلة في هذا النطاق.</p>}
            </section>
            <History title="نتائج وملاحظات الحملة" rows={observations.map((row) => `${row.scannedCode} — ${row.countStatus}${row.condition ? ` — ${row.condition}` : ''}${row.notes ? ` — ${row.notes}` : ''}`)} />
            <History title="أثر تدقيق الحملة" rows={countAudit.map((row) => `${row.createdAt} — ${row.action} — ${row.actorName}${row.details ? ` — ${row.details}` : ''}`)} />
          </div>}
          {workflow === 'transfer' && <History title="سجل النقل السابق (غير قابل للتعديل)" rows={transfers.map((row) => `${row.transferDate}: ${row.fromLocation || '—'} ← ${row.toLocation || '—'}; ${row.fromBranchId || '—'} ← ${row.toBranchId || '—'} — ${row.notes || ''} — المسؤول عن النقل: ${row.actorName}`)} />}
          {workflow === 'maintenance' && <History title="سجل الصيانة" rows={maintenance.map((row) => `${row.maintenanceDate}: ${row.maintenanceType} — ${row.cost} — ${row.costTreatment === 'CAPITALIZED' ? 'رأسمالي' : 'تشغيلي'} — ${row.vendor || ''} — سجله: ${row.actorName}`)} />}
          {!loading && workflow === 'count' && !campaigns.length && <p className="text-sm text-slate-500">لا توجد حملات جرد بعد.</p>}
          {!loading && workflow !== 'count' && !asset && <p className="text-sm text-slate-500">لا توجد أصول متاحة.</p>}
        </div>
      </section>
    </div>
  );
};

const AssetPrintCard: React.FC<{ asset: FixedAsset }> = ({ asset }) => {
  const value = asset.code;
  const [result, setResult] = useState<
    { value: string; status: 'loading' } |
    { value: string; status: 'ready'; imageUrl: string } |
    { value: string; status: 'error' }
  >({ value, status: 'loading' });
  const [printError, setPrintError] = useState('');

  useEffect(() => {
    let active = true;
    setResult({ value, status: 'loading' });

    QRCode.toDataURL(value, { errorCorrectionLevel: 'M', margin: 2, width: 192 })
      .then((imageUrl) => {
        if (active) setResult({ value, status: 'ready', imageUrl });
      })
      .catch(() => {
        if (active) setResult({ value, status: 'error' });
      });

    return () => { active = false; };
  }, [value]);

  const currentResult = result.value === value ? result : { value, status: 'loading' as const };
  const canPrint = currentResult.status === 'ready';
  const printCard = () => {
    if (!canPrint) {
      setPrintError('لا يمكن الطباعة قبل نجاح إنشاء رمز QR للأصل.');
      return;
    }
    setPrintError('');
    window.print();
  };

  return (
    <div>
      <button type="button" onClick={printCard} disabled={!canPrint}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800">
        <Printer className="h-4 w-4" />{canPrint ? 'طباعة بطاقة تعريف الأصل' : 'الطباعة غير متاحة حتى جاهزية رمز QR'}
      </button>
      {printError && <p role="alert" className="mt-2 text-xs font-bold text-rose-700">{printError}</p>}
      <div className="asset-print-card mt-3 rounded-lg border border-slate-300 bg-white p-4 text-slate-900">
        <p className="text-xs font-bold">سجل الأصول الثابتة</p>
        <p className="mt-2 text-xl font-black">{asset.code}</p>
        <p className="mt-1 font-bold">{asset.name}</p>
        <p className="mt-2 text-xs">معرّف الأصل: {asset.id}</p>
        <figure className="mt-4 flex w-fit flex-col items-center gap-2 border-t border-slate-200 pt-4">
          {currentResult.status === 'ready'
            ? <img
              src={currentResult.imageUrl}
              alt={`رمز QR للتعرّف على الأصل ${value}؛ يحتوي على كود الأصل فقط`}
              width={192}
              height={192}
              className="h-48 w-48 bg-white object-contain"
            />
            : currentResult.status === 'error'
              ? <p role="alert" className="max-w-xs text-center text-sm font-bold text-rose-700">
                تعذر إنشاء رمز QR محليًا. الطباعة متوقفة حتى ينجح إنشاء الرمز.
              </p>
              : <p role="status" className="text-xs text-slate-500">جارٍ إنشاء رمز QR محليًا؛ الطباعة متوقفة…</p>}
          <figcaption className="text-xs font-bold">رمز QR — كود الأصل فقط</figcaption>
        </figure>
      </div>
    </div>
  );
};

const timelineLabels: Record<FixedAssetTimelineEvent['eventType'], string> = {
  ACQUISITION: 'اقتناء',
  TRANSFER: 'نقل',
  MAINTENANCE: 'صيانة / تحسين',
  DEPRECIATION: 'إهلاك',
  DISPOSAL: 'استبعاد',
};

const AssetTimeline: React.FC<{ events: FixedAssetTimelineEvent[] }> = ({ events }) => (
  <ol className="relative space-y-3 before:absolute before:bottom-4 before:right-[11px] before:top-4 before:w-px before:bg-violet-200 dark:before:bg-violet-900">
    {events.map((event) => (
      <li key={`${event.eventType}-${event.referenceId}`} className="relative pr-8">
        <span className="absolute right-0 top-4 h-6 w-6 rounded-full border-4 border-white bg-violet-600 ring-1 ring-violet-200 dark:border-[var(--cerami-surface)] dark:ring-violet-900" />
        <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-950/40 sm:p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-black text-violet-800 dark:bg-violet-950/50 dark:text-violet-200">
                {timelineLabels[event.eventType]}
              </span>
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">{event.label}</h4>
            </div>
            <time className="text-xs font-semibold tabular-nums text-slate-500" dir="ltr">{event.eventDate}</time>
          </div>
          {event.details && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600 dark:text-slate-300">{event.details}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-2 text-xs text-slate-500 dark:border-slate-800">
            {event.amount !== null && <span className="font-bold tabular-nums text-slate-800 dark:text-slate-100" dir="ltr">
              المبلغ: {new Intl.NumberFormat('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(event.amount)} ج.م
            </span>}
            <span>بواسطة: {event.actorName || 'غير متاح'}</span>
            <span className="font-mono text-[11px]" dir="ltr">مرجع: {event.referenceId}</span>
          </div>
        </article>
      </li>
    ))}
  </ol>
);

const Field: React.FC<{
  label: string; name: string; type?: string; min?: string; step?: string; defaultValue?: string; required?: boolean;
}> = ({ label, name, type = 'text', min, step, defaultValue, required }) => (
  <label className="block text-xs font-bold">{label}<input className={`${inputClass} mt-1`} name={name} type={type}
    min={min} step={step} defaultValue={defaultValue} required={required} /></label>
);

const Submit: React.FC<{ canManage: boolean; label: string }> = ({ canManage, label }) => (
  <button type="submit" disabled={!canManage} className="rounded-lg bg-violet-700 px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{label}</button>
);

const History: React.FC<{ title: string; rows: string[] }> = ({ title, rows }) => (
  <section className="mt-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950/40">
    <h4 className="text-xs font-black">{title}</h4>
    {rows.length ? <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-xs text-slate-600 dark:text-slate-300">{rows.map((row, index) => <li key={`${index}-${row}`} className="border-b border-slate-100 py-1 dark:border-slate-800">{row}</li>)}</ul>
      : <p className="mt-2 text-xs text-slate-400">لا توجد سجلات.</p>}
  </section>
);
