import React from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import type { ApartmentEstimateQuotationLink, ApartmentEstimateVersion } from '../../../types/projects/apartmentEstimate';
import type { ProjectExecutionService } from '../../../services/domains/projects/ProjectExecutionService';
import { fieldClass, fmt, type ExecutionDraft } from './estimateModel';
import { Metric, NumberInput } from './EstimateUi';

export const EstimateExecutionSection: React.FC<{
  executionService: ProjectExecutionService;
  versions: ApartmentEstimateVersion[];
  quotationLinks: ApartmentEstimateQuotationLink[];
  paidAmount: number;
  executionSummary: ReturnType<ProjectExecutionService['getSummary']> | null;
  executionContracts: any[];
  executionCertificates: any[];
  executionCosts: any[];
  executionPurchases: any[];
  executionDraft: ExecutionDraft;
  setExecutionDraft: React.Dispatch<React.SetStateAction<ExecutionDraft>>;
  canUpdateProjects: boolean;
  canApproveProject: boolean;
  refreshExecution: (id?: string) => void;
  initializeExecution: () => void;
  createProjectContract: () => void;
  createProjectCertificate: () => void;
  createActualCost: () => void;
  setDataError: React.Dispatch<React.SetStateAction<string>>;
}> = ({
  executionService, versions, quotationLinks, paidAmount,
  executionSummary, executionContracts, executionCertificates, executionCosts, executionPurchases,
  executionDraft, setExecutionDraft,
  canUpdateProjects, canApproveProject,
  refreshExecution, initializeExecution, createProjectContract, createProjectCertificate, createActualCost,
  setDataError,
}) => {
  return (
    <section className="mb-5 rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="font-black text-slate-900">دورة تنفيذ المشروع</h2><p className="mt-1 text-xs text-slate-500">العقود والمراحل والمستخلصات والتكاليف الفعلية مرتبطة بإصدار المقايسة المعتمد.</p></div>
          {canUpdateProjects && <button type="button" onClick={initializeExecution} disabled={versions[0]?.status !== 'APPROVED'} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">إنشاء مراحل وميزانية من الإصدار المعتمد</button>}
        </div>
        {executionSummary ? <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
          <Metric label="قيمة العقد" value={`${fmt(executionSummary.contractValue)} ج`} /><Metric label="التكلفة المخططة" value={`${fmt(executionSummary.plannedCost)} ج`} /><Metric label="التكلفة الفعلية" value={`${fmt(executionSummary.actualCost)} ج`} /><Metric label="انحراف التكلفة" value={`${fmt(executionSummary.costVariance)} ج`} /><Metric label="المستخلصات المعتمدة" value={`${fmt(executionSummary.certifiedAmount)} ج`} /><Metric label="المدفوع للمستخلصات" value={`${fmt(executionSummary.paidAmount)} ج`} /><Metric label="استهلاك التكلفة" value={`${fmt(executionSummary.completionPercent)}%`} />
        </div> : <p className="mb-3 text-xs text-slate-500">اختر مشروعًا لعرض دورة التنفيذ.</p>}
        <div className="grid gap-3 xl:grid-cols-2">
          <div className="rounded-xl border border-slate-100 p-3">
            <h3 className="mb-2 text-sm font-black text-slate-800">العقود</h3>
            {canUpdateProjects && <div className="mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4"><input aria-label="تاريخ العقد" type="date" value={executionDraft.contractDate} onChange={(event) => setExecutionDraft((current) => ({ ...current, contractDate: event.target.value }))} className={fieldClass()} /><select aria-label="عرض السعر المرتبط بالعقد" value={executionDraft.quotationId} onChange={(event) => setExecutionDraft((current) => ({ ...current, quotationId: event.target.value }))} className={fieldClass()}><option value="">بدون ربط بعرض سعر</option>{quotationLinks.filter((link) => link.versionId === versions[0]?.id).map((link) => <option key={link.quotationId} value={link.quotationId}>{link.quotationNumber} · الإصدار {link.versionNumber}</option>)}</select><input aria-label="شروط العقد" value={executionDraft.terms} onChange={(event) => setExecutionDraft((current) => ({ ...current, terms: event.target.value }))} placeholder="شروط أو ملاحظات العقد" className={fieldClass()} /><button type="button" disabled={versions[0]?.status !== 'APPROVED'} onClick={createProjectContract} className="rounded-lg bg-sky-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">إنشاء عقد</button></div>}
            <div className="space-y-2">{executionContracts.map((contract) => <div key={contract.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-2 text-xs"><span><b>{contract.contract_number}</b> · {contract.contract_date} · {fmt(contract.contract_value)} ج · إصدار {contract.versionNumber}</span><span className="flex items-center gap-2"><b>{contract.status === 'SIGNED' ? 'موقّع' : contract.status === 'CANCELLED' ? 'ملغى' : 'مسودة'}</b>{canApproveProject && contract.status === 'DRAFT' && <button type="button" onClick={() => { try { executionService.updateContractStatus(contract.id, 'SIGNED'); refreshExecution(); } catch (error) { setDataError(error instanceof Error ? error.message : 'تعذر اعتماد العقد.'); } }} className="rounded bg-emerald-700 px-2 py-1 text-white">تأكيد التوقيع</button>}</span></div>)}{!executionContracts.length && <p className="text-xs text-slate-400">لا توجد عقود لهذا المشروع.</p>}</div>
          </div>
          <div className="rounded-xl border border-slate-100 p-3">
            <h3 className="mb-2 text-sm font-black text-slate-800">المراحل ومقارنة المخطط بالفعلي</h3>
            <div className="overflow-x-auto"><DataTable
              ariaLabel="مقارنة المخطط بالفعلي"
              rows={executionSummary?.schedule || []}
              rowKey={(phase) => phase.title}
              dense
              minWidth={420}
              tableClassName="text-xs"
              columns={[
                { key: 'phase', header: 'المرحلة', render: (phase) => <span className="font-bold">{phase.title}</span> },
                { key: 'planned', header: 'مخطط', render: (phase) => <span>{fmt(phase.plannedAmount)} ج</span> },
                { key: 'actual', header: 'فعلي مسجل', render: (phase) => <span>{fmt(phase.actualAmount)} ج</span> },
                { key: 'diff', header: 'الفرق', render: (phase) => <span>{fmt(phase.plannedAmount - phase.actualAmount)} ج</span> },
              ]}
              emptyTitle="أنشئ المراحل من الإصدار المعتمد لبدء المقارنة."
            /></div>
          </div>
          <div className="rounded-xl border border-slate-100 p-3">
            <h3 className="mb-2 text-sm font-black text-slate-800">المستخلصات والدفعات</h3>
            {canUpdateProjects && <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><input type="date" aria-label="تاريخ المستخلص" value={executionDraft.certificateDate} onChange={(event) => setExecutionDraft((current) => ({ ...current, certificateDate: event.target.value }))} className={fieldClass()} /><input type="date" aria-label="بداية فترة المستخلص" value={executionDraft.periodStart} onChange={(event) => setExecutionDraft((current) => ({ ...current, periodStart: event.target.value }))} className={fieldClass()} /><input type="date" aria-label="نهاية فترة المستخلص" value={executionDraft.periodEnd} onChange={(event) => setExecutionDraft((current) => ({ ...current, periodEnd: event.target.value }))} className={fieldClass()} /><NumberInput label="إنجاز الفترة %" value={executionDraft.progressPercent} min={0} max={100} onChange={(progressPercent) => setExecutionDraft((current) => ({ ...current, progressPercent }))} /><input value={executionDraft.certificateDescription} onChange={(event) => setExecutionDraft((current) => ({ ...current, certificateDescription: event.target.value }))} placeholder="وصف الأعمال المنفذة" className={`${fieldClass()} sm:col-span-2`} /><NumberInput label="قيمة المستخلص" value={executionDraft.certificateAmount} min={0} onChange={(certificateAmount) => setExecutionDraft((current) => ({ ...current, certificateAmount }))} /><button type="button" disabled={versions[0]?.status !== 'APPROVED'} onClick={createProjectCertificate} className="rounded-lg bg-sky-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">إنشاء مستخلص</button></div>}
            <div className="space-y-2">{executionCertificates.map((certificate) => <div key={certificate.id} className="rounded-lg bg-slate-50 p-2 text-xs"><div className="flex flex-wrap items-center justify-between gap-2"><span><b>{certificate.certificate_number}</b> · {certificate.certificate_date} · {certificate.description} · مطلوب {fmt(certificate.requested_amount)} ج · معتمد {fmt(certificate.approved_amount || 0)} ج · مدفوع {fmt(certificate.paid_amount)} ج</span><b>{({ DRAFT: 'مسودة', SUBMITTED: 'بانتظار المراجعة', APPROVED: 'معتمد', RETURNED: 'معاد', PAID: 'مدفوع' } as Record<string,string>)[certificate.status]}</b></div><div className="mt-2 flex flex-wrap gap-2">{certificate.status === 'DRAFT' && canUpdateProjects && <button type="button" onClick={() => { try { executionService.submitCertificate(certificate.id); refreshExecution(); } catch (error) { setDataError(error instanceof Error ? error.message : 'تعذر إرسال المستخلص.'); } }} className="rounded border bg-white px-2 py-1">إرسال للمراجعة</button>}{certificate.status === 'SUBMITTED' && canApproveProject && <><button type="button" onClick={() => { try { executionService.reviewCertificate(certificate.id, 'APPROVED'); refreshExecution(); } catch (error) { setDataError(error instanceof Error ? error.message : 'تعذر اعتماد المستخلص.'); } }} className="rounded bg-emerald-700 px-2 py-1 text-white">اعتماد</button><button type="button" onClick={() => { const notes = window.prompt('سبب إعادة المستخلص للمراجعة:'); if (!notes?.trim()) return; try { executionService.reviewCertificate(certificate.id, 'RETURNED', notes); refreshExecution(); } catch (error) { setDataError(error instanceof Error ? error.message : 'تعذر إعادة المستخلص.'); } }} className="rounded border border-rose-200 bg-white px-2 py-1 text-rose-700">إعادة</button></>}{['APPROVED'].includes(certificate.status) && canUpdateProjects && <button type="button" onClick={() => { const remaining = Number(certificate.approved_amount) - Number(certificate.paid_amount); const raw = window.prompt(`المتبقي ${fmt(remaining)} ج. أدخل قيمة الدفعة:`, String(remaining)); if (raw === null) return; const reference = window.prompt('مرجع الدفع (اختياري):') || ''; try { executionService.recordCertificatePayment(certificate.id, Number(raw), reference); refreshExecution(); } catch (error) { setDataError(error instanceof Error ? error.message : 'تعذر تسجيل الدفعة.'); } }} className="rounded border border-sky-200 bg-white px-2 py-1 text-sky-800">تسجيل دفعة</button>}</div>{certificate.review_notes && <p className="mt-1 text-rose-700">ملاحظة المراجعة: {certificate.review_notes}</p>}</div>)}{!executionCertificates.length && <p className="text-xs text-slate-400">لا توجد مستخلصات.</p>}</div>
          </div>
          <div className="rounded-xl border border-slate-100 p-3">
            <h3 className="mb-2 text-sm font-black text-slate-800">التكاليف الفعلية والمشتريات</h3>
            {canUpdateProjects && <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5"><input type="date" aria-label="تاريخ التكلفة" value={executionDraft.costDate} onChange={(event) => setExecutionDraft((current) => ({ ...current, costDate: event.target.value }))} className={fieldClass()} /><input value={executionDraft.costCategory} onChange={(event) => setExecutionDraft((current) => ({ ...current, costCategory: event.target.value }))} placeholder="المرحلة / التصنيف" className={fieldClass()} /><input value={executionDraft.costDescription} onChange={(event) => setExecutionDraft((current) => ({ ...current, costDescription: event.target.value }))} placeholder="وصف التكلفة" className={fieldClass()} /><NumberInput label="المبلغ الفعلي" value={executionDraft.costAmount} min={0} onChange={(costAmount) => setExecutionDraft((current) => ({ ...current, costAmount }))} /><button type="button" onClick={createActualCost} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white">تسجيل تكلفة</button></div>}
            <div className="space-y-1">{executionCosts.slice(0, 6).map((cost) => <div key={cost.id} className="flex justify-between gap-2 rounded bg-slate-50 p-2 text-xs"><span>{cost.cost_date} · {cost.category} · {cost.description}</span><b>{fmt(cost.amount)} ج</b></div>)}{!executionCosts.length && <p className="text-xs text-slate-400">لا توجد تكاليف فعلية مسجلة.</p>}</div>
            {executionCosts.length > 6 && <p className="mt-2 text-xs text-slate-500">إجمالي سجلات التكلفة: {executionCosts.length}</p>}
            <div className="mt-3 border-t pt-2"><b className="text-xs text-slate-700">طلبات شراء المشروع</b><div className="mt-1 space-y-1">{executionPurchases.slice(0, 4).map((request) => <div key={request.id} className="flex justify-between gap-2 rounded bg-amber-50 p-2 text-xs"><span>{request.requestNumber} · {request.date} · {request.itemsCount || 0} أصناف</span><b>{({ PENDING: 'معلق', APPROVED: 'معتمد', REJECTED: 'مرفوض', ORDERED: 'تم الطلب', CANCELLED: 'ملغي' } as Record<string,string>)[request.status] || request.status}</b></div>)}{!executionPurchases.length && <p className="text-xs text-slate-400">لا توجد طلبات شراء مرتبطة.</p>}</div></div>
          </div>
        </div>
    </section>
  );
};
