import React from 'react';
import {
  Building2, Printer, RotateCcw, Save, AlertTriangle, FolderOpen, Trash2, FileSpreadsheet, MessageCircle,
} from 'lucide-react';
import { ActivityGate } from '../../components/ui/ActivityGate';
import { PageHeader } from '../../components/ui/PageHeader';
import { fieldClass, fmt, initialLines, initialRooms } from './ApartmentEstimatePage/estimateModel';
import { useApartmentEstimateState } from './ApartmentEstimatePage/useApartmentEstimateState';
import { useEstimateInitialLoad } from './ApartmentEstimatePage/useEstimateInitialLoad';
import { useEstimateRecovery } from './ApartmentEstimatePage/useEstimateRecovery';
import { useEstimateProjectSync } from './ApartmentEstimatePage/useEstimateProjectSync';
import { useEstimateStock } from './ApartmentEstimatePage/useEstimateStock';
import { useEstimateEditing } from './ApartmentEstimatePage/useEstimateEditing';
import { useEstimatePersistence } from './ApartmentEstimatePage/useEstimatePersistence';
import { useEstimateExecution } from './ApartmentEstimatePage/useEstimateExecution';
import { useEstimateDocuments } from './ApartmentEstimatePage/useEstimateDocuments';
import { EstimateVersionsSection } from './ApartmentEstimatePage/EstimateVersionsSection';
import { EstimateExecutionSection } from './ApartmentEstimatePage/EstimateExecutionSection';
import { RoomsSection } from './ApartmentEstimatePage/RoomsSection';
import { EstimateLinesSection } from './ApartmentEstimatePage/EstimateLinesSection';
import { EstimateSummarySection } from './ApartmentEstimatePage/EstimateSummarySection';

export const ApartmentEstimatePage: React.FC = () => {
  const s = useApartmentEstimateState();
  const {
    customers, projects, projectId, setProjectId, projectEstimates,
    versions, quotationLinks, versionChangeSummary, setVersionChangeSummary,
    compareVersionIds, setCompareVersionIds, selectedEstimateId, setSelectedEstimateId,
    warehouses, rooms, setRooms, lines, setLines,
    lineTemplates, apartmentName, setApartmentName, apartmentArea, setApartmentArea,
    documentTerms, setDocumentTerms, customerId, setCustomerId, warehouseId, setWarehouseId,
    dataError, setDataError, productError, stockError, priceHistory,
    materialActionBusy, materialActionsCreated, saving,
    recoveryDraft, recoveryDismissed, draftSaveStatus, draftSavedAt,
    preservedDraftProjectId, localEstimates,
    contingencyPercent, setContingencyPercent, taxPercent, setTaxPercent,
    paidAmount, setPaidAmount, payments, setPayments, paymentDraft, setPaymentDraft,
    executionSummary, executionContracts, executionCertificates, executionCosts, executionPurchases,
    executionDraft, setExecutionDraft,
    canViewProjects, canUpdateProjects, canApproveProject,
    canExportEstimate,
    roomTotals, estimateTotal, totalCost, grossProfit, totalPaid, totalArea,
    contingencyAmount, taxAmount, grandTotal, remainingAmount,
    compareA, compareB, compareLines,
  } = s;
  useEstimateInitialLoad(s);
  const { restoreEstimateDraft, discardEstimateRecovery } = useEstimateRecovery(s);
  useEstimateProjectSync(s);
  useEstimateStock(s);
  const {
    patchRoom, patchLine, saveLineTemplate, applyLineTemplate, addLineAttachment,
    loadLinkedStock, loadPurchasePriceHistory, setLineMaterialProduct,
    createPurchaseRequestForShortages, createStockIssueRequests,
  } = useEstimateEditing(s);
  const {
    saveProjectEstimate, selectProjectEstimate, submitVersionForReview, reviewEstimateVersion,
    persistLocalEstimates, saveLocalEstimate, loadLocalEstimate,
  } = useEstimatePersistence(s);
  const {
    refreshExecution, initializeExecution, createProjectContract, createProjectCertificate, createActualCost,
  } = useEstimateExecution(s);
  const {
    createQuotation, exportEstimateExcel, saveEstimatePdf, shareEstimateWithCustomer,
  } = useEstimateDocuments(s);

  return (
    <div className="h-full overflow-y-auto bg-surface-muted p-4 md:p-6">
      <PageHeader
        title="حاسبة الشقة والمقايسة الهندسية"
        description="احسب مساحات الغرف وكميات التشطيب وتكلفتها، ثم أصدر عرض سعر قابلًا للتعديل والطباعة."
        eyebrow="التشطيبات والمشروعات"
        icon={<Building2 className="h-5 w-5" />}
        actions={<div className="flex flex-wrap gap-2">
          {canExportEstimate && <>
            <button type="button" onClick={() => void saveEstimatePdf('detailed')} className="inline-flex items-center gap-1 rounded-xl border border-danger-border bg-surface px-3 py-2 text-xs font-bold text-danger">حفظ PDF تفصيلي</button>
            <button type="button" onClick={() => void saveEstimatePdf('summary')} className="inline-flex items-center gap-1 rounded-xl border border-danger-border bg-surface px-3 py-2 text-xs font-bold text-danger">PDF ملخص</button>
            <button type="button" onClick={() => exportEstimateExcel('detailed')} className="inline-flex items-center gap-1 rounded-xl border border-success-border bg-surface px-3 py-2 text-xs font-bold text-success"><FileSpreadsheet className="h-4 w-4" /> Excel تفصيلي</button>
            <button type="button" onClick={() => exportEstimateExcel('summary')} className="inline-flex items-center gap-1 rounded-xl border border-success-border bg-surface px-3 py-2 text-xs font-bold text-success">Excel ملخص</button>
            <button type="button" onClick={() => shareEstimateWithCustomer('summary')} className="inline-flex items-center gap-1 rounded-xl border border-success-border bg-surface px-3 py-2 text-xs font-bold text-success"><MessageCircle className="h-4 w-4" /> إرسال للعميل</button>
          </>}
          {!projectId && <button type="button" onClick={saveLocalEstimate} className="inline-flex items-center gap-2 rounded-xl border border-accent-border bg-surface px-4 py-2.5 text-sm font-bold text-primary"><Save className="h-4 w-4" /> حفظ المقايسة</button>}
          <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-bold text-ink"><Printer className="h-4 w-4" /> طباعة</button>
          <button type="button" onClick={() => { setSelectedEstimateId(''); setProjectId(''); setApartmentName(''); setApartmentArea(''); setRooms(initialRooms()); setLines(initialLines()); setCustomerId(''); setContingencyPercent(0); setTaxPercent(0); setPaidAmount(0); }} className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-bold text-ink"><RotateCcw className="h-4 w-4" /> مقاولة جديدة</button>
          {projectId && canUpdateProjects && <button type="button" onClick={() => {
            try {
              const estimate = saveProjectEstimate();
              if (estimate) window.alert('تم حفظ تصميم الشقة والمقايسة على المشروع.');
            } catch (error) {
              setDataError(error instanceof Error ? error.message : 'تعذر حفظ تصميم المشروع.');
            }
          }} disabled={saving} className="inline-flex items-center gap-2 rounded-xl border border-accent-border bg-surface px-4 py-2.5 text-sm font-bold text-primary disabled:opacity-50"><Save className="h-4 w-4" /> حفظ على المشروع</button>}
          <button type="button" onClick={createQuotation} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary disabled:opacity-50"><Save className="h-4 w-4" /> إصدار عرض سعر</button>
        </div>}
      />

      {dataError && <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-danger-border bg-danger-soft p-3 text-sm text-danger"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{dataError}</div>}
      {recoveryDraft && !recoveryDismissed && <section role="status" className="mb-4 flex flex-col gap-3 rounded-xl border border-warning-border bg-warning-soft p-3 sm:flex-row sm:items-center sm:justify-between"><div><b className="text-sm text-warning">عُثر على مسودة محفوظة تلقائيًا</b><p className="mt-1 text-xs text-warning">آخر حفظ: {new Date(recoveryDraft.savedAt).toLocaleString('ar-EG')} · {recoveryDraft.apartmentName || 'مقايسة جديدة'}{recoveryDraft.projectId ? ' · مرتبطة بمشروع' : ''}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={restoreEstimateDraft} className="rounded-lg bg-warning px-3 py-2 text-xs font-bold text-white">استعادة المسودة</button><button type="button" onClick={discardEstimateRecovery} className="rounded-lg border border-warning bg-surface px-3 py-2 text-xs font-bold text-warning">تجاهل المسودة</button></div></section>}
      {!recoveryDraft || recoveryDismissed ? <div role="status" className={`mb-3 text-[10px] ${draftSaveStatus === 'ERROR' ? 'text-danger' : 'text-muted'}`}>{draftSaveStatus === 'ERROR' ? 'تعذر حفظ نسخة الاستعادة. قد تكون مساحة التخزين ممتلئة؛ صدّر المقايسة أو احفظها على المشروع.' : draftSavedAt ? `نسخة استعادة محلية محفوظة ${new Date(draftSavedAt).toLocaleTimeString('ar-EG')}` : ''}</div> : null}
      {productError && <div role="status" className="mb-4 flex items-start gap-2 rounded-xl border border-warning-border bg-warning-soft p-3 text-xs text-warning">تعذر تحميل قائمة أصناف المخزون: {productError}</div>}
      {stockError && <div role="status" className="mb-4 flex items-start gap-2 rounded-xl border border-warning-border bg-warning-soft p-3 text-xs text-warning"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />تعذر ربط المخزون: {stockError}</div>}

      <section className="mb-5 grid grid-cols-1 gap-4 rounded-2xl border border-line bg-surface p-4 shadow-sm md:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs font-bold text-ink-secondary">المشروع القائم
          <select value={projectId} onChange={(event) => { preservedDraftProjectId.current = null; setProjectId(event.target.value); }} className={`${fieldClass()} mt-1`}>
            <option value="">— بدون ربط بمشروع —</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.code} — {project.name}</option>)}
          </select>
        </label>
        {projectId && <label className="text-xs font-bold text-ink-secondary">التصميم المحفوظ
          <select value={selectedEstimateId} onChange={(event) => selectProjectEstimate(event.target.value)} className={`${fieldClass()} mt-1`}>
            <option value="">تصميم جديد للمشروع</option>
            {projectEstimates.map((estimate) => <option key={estimate.id} value={estimate.id}>{estimate.name} — {fmt(estimate.areaM2)} م²</option>)}
          </select>
        </label>}
        <label className="text-xs font-bold text-ink-secondary">اسم المشروع / الشقة<input value={apartmentName} onChange={(event) => setApartmentName(event.target.value)} className={`${fieldClass()} mt-1`} placeholder="مثال: شقة الأستاذ محمد" /></label>
        <label className="text-xs font-bold text-ink-secondary">مساحة الشقة (م²)<input type="number" min={0} step="0.1" value={apartmentArea} onChange={(event) => setApartmentArea(event.target.value)} className={`${fieldClass()} mt-1`} placeholder={`محسوبة تلقائيًا: ${fmt(totalArea)}`} /></label>
        <label className="text-xs font-bold text-ink-secondary">العميل لعرض السعر<select value={customerId} onChange={(event) => setCustomerId(event.target.value)} disabled={!!projectId} className={`${fieldClass()} mt-1 disabled:bg-surface-sunken`}><option value="">— اختر العميل —</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} {customer.phone ? `(${customer.phone})` : ''}</option>)}</select></label>
        <label className="text-xs font-bold text-ink-secondary">المستودع لحساب المتاح<select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} className={`${fieldClass()} mt-1`}><option value="">— اختر المستودع —</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
      </section>

      {!projectId && localEstimates.length > 0 && <section className="mb-5 rounded-2xl border border-accent-border bg-accent-soft/70 p-4">
        <div className="mb-3 flex items-center gap-2 font-black text-primary"><FolderOpen className="h-4 w-4" /> سجل المقايسات المحفوظة على هذا الجهاز</div>
        <div className="flex flex-wrap gap-2">{localEstimates.map((estimate) => <div key={estimate.id} className="flex items-center gap-1 rounded-lg border border-accent-border bg-surface p-1">
          <button type="button" onClick={() => loadLocalEstimate(estimate.id)} className="px-2 py-1 text-xs font-bold text-ink">{estimate.name} · {fmt(estimate.area)} م²</button>
          <button type="button" aria-label={`حذف ${estimate.name}`} onClick={() => persistLocalEstimates(localEstimates.filter((item) => item.id !== estimate.id))} className="rounded p-1 text-muted hover:bg-danger-soft hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>)}</div>
      </section>}

      {projectId && selectedEstimateId && (
        <EstimateVersionsSection
          versions={versions}
          versionChangeSummary={versionChangeSummary}
          setVersionChangeSummary={setVersionChangeSummary}
          compareVersionIds={compareVersionIds}
          setCompareVersionIds={setCompareVersionIds}
          compareA={compareA}
          compareB={compareB}
          compareLines={compareLines}
          quotationLinks={quotationLinks}
          canUpdateProjects={canUpdateProjects}
          canApproveProject={canApproveProject}
          submitVersionForReview={submitVersionForReview}
          reviewEstimateVersion={reviewEstimateVersion}
        />
      )}

      {projectId && selectedEstimateId && canViewProjects && (
        <EstimateExecutionSection
          executionService={s.executionService}
          versions={versions}
          quotationLinks={quotationLinks}
          paidAmount={paidAmount}
          executionSummary={executionSummary}
          executionContracts={executionContracts}
          executionCertificates={executionCertificates}
          executionCosts={executionCosts}
          executionPurchases={executionPurchases}
          executionDraft={executionDraft}
          setExecutionDraft={setExecutionDraft}
          canUpdateProjects={canUpdateProjects}
          canApproveProject={canApproveProject}
          refreshExecution={refreshExecution}
          initializeExecution={initializeExecution}
          createProjectContract={createProjectContract}
          createProjectCertificate={createProjectCertificate}
          createActualCost={createActualCost}
          setDataError={s.setDataError}
        />
      )}

      <RoomsSection rooms={rooms} setRooms={setRooms} patchRoom={patchRoom} />

      <EstimateLinesSection
        products={s.products}
        rooms={rooms}
        lines={lines}
        setLines={setLines}
        lineTemplates={lineTemplates}
        warehouseId={warehouseId}
        stockError={stockError}
        priceHistory={priceHistory}
        materialActionBusy={materialActionBusy}
        materialActionsCreated={materialActionsCreated}
        patchLine={patchLine}
        saveLineTemplate={saveLineTemplate}
        applyLineTemplate={applyLineTemplate}
        addLineAttachment={addLineAttachment}
        loadLinkedStock={loadLinkedStock}
        loadPurchasePriceHistory={loadPurchasePriceHistory}
        setLineMaterialProduct={setLineMaterialProduct}
        createPurchaseRequestForShortages={createPurchaseRequestForShortages}
        createStockIssueRequests={createStockIssueRequests}
        getLineQuantity={s.getLineQuantity}
        setDataError={s.setDataError}
      />

      <EstimateSummarySection
        rooms={rooms}
        roomTotals={roomTotals}
        documentTerms={documentTerms}
        setDocumentTerms={setDocumentTerms}
        saving={saving}
        contingencyPercent={contingencyPercent}
        setContingencyPercent={setContingencyPercent}
        taxPercent={taxPercent}
        setTaxPercent={setTaxPercent}
        paidAmount={paidAmount}
        setPaidAmount={setPaidAmount}
        payments={payments}
        setPayments={setPayments}
        paymentDraft={paymentDraft}
        setPaymentDraft={setPaymentDraft}
        estimateTotal={estimateTotal}
        totalCost={totalCost}
        grossProfit={grossProfit}
        totalArea={totalArea}
        contingencyAmount={contingencyAmount}
        taxAmount={taxAmount}
        grandTotal={grandTotal}
        totalPaid={totalPaid}
        remainingAmount={remainingAmount}
        createQuotation={createQuotation}
        setDataError={s.setDataError}
      />
    </div>
  );
};

export default ApartmentEstimatePage;
