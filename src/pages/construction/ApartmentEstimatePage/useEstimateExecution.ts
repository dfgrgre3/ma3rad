import { useCallback, useEffect } from 'react';
import { PurchaseRequestService } from '../../../services/domains/purchases/PurchaseRequestService';
import { fmt } from './estimateModel';
import type { ApartmentEstimateState } from './useApartmentEstimateState';

export const useEstimateExecution = (s: ApartmentEstimateState) => {
  const {
    projectId, selectedEstimateId, versions, executionService,
    executionDraft, executionContracts, canViewProjects, canViewPurchaseRequests,
    setExecutionSummary, setExecutionContracts, setExecutionCertificates,
    setExecutionCosts, setExecutionPurchases, setDataError, setExecutionDraft,
  } = s;

  const refreshExecution = useCallback((id = projectId) => {
    if (!id || !canViewProjects) { setExecutionSummary(null); setExecutionContracts([]); setExecutionCertificates([]); setExecutionCosts([]); setExecutionPurchases([]); return; }
    try {
      setExecutionSummary(executionService.getSummary(id));
      setExecutionContracts(executionService.getContracts(id));
      setExecutionCertificates(executionService.getCertificates(id));
      setExecutionCosts(executionService.getActualCosts(id));
      setExecutionPurchases(canViewPurchaseRequests ? new PurchaseRequestService().getProjectRequests(id) : []);
    } catch (error) { setDataError(error instanceof Error ? error.message : 'تعذر تحميل دورة تنفيذ المشروع.'); }
  }, [projectId, canViewProjects, canViewPurchaseRequests, executionService]);

  useEffect(() => { refreshExecution(); }, [projectId, canViewProjects, canViewPurchaseRequests, executionService, refreshExecution]);

  const initializeExecution = () => {
    if (!selectedEstimateId || !projectId) return;
    try {
      const result = executionService.initializeFromApprovedEstimate(selectedEstimateId, projectId);
      refreshExecution();
      setDataError('');
      window.alert(result.created ? `تم إنشاء ${result.taskCount} مرحلة و${result.budgetCount} بندًا مخططًا من الإصدار المعتمد.` : 'تم إعداد التنفيذ لهذا الإصدار مسبقًا.');
    } catch (error) { setDataError(error instanceof Error ? error.message : 'تعذر إعداد مراحل التنفيذ.'); }
  };

  const createProjectContract = () => {
    if (!selectedEstimateId || !projectId) return;
    try {
      executionService.initializeFromApprovedEstimate(selectedEstimateId, projectId, versions[0]?.id);
      const contract = executionService.createContract({ estimateId: selectedEstimateId, projectId, versionId: versions[0]?.id, contractDate: executionDraft.contractDate, terms: executionDraft.terms, quotationId: executionDraft.quotationId || undefined });
      refreshExecution(); setDataError('');
      window.alert(`تم إنشاء العقد رقم ${contract.contractNumber} بقيمة ${fmt(contract.contractValue)} ج.`);
    } catch (error) { setDataError(error instanceof Error ? error.message : 'تعذر إنشاء العقد.'); }
  };

  const createProjectCertificate = () => {
    if (!selectedEstimateId || !projectId) return;
    try {
      const contractId = executionContracts.find((item) => item.status !== 'CANCELLED')?.id;
      const result = executionService.createCertificate({ projectId, estimateId: selectedEstimateId, versionId: versions[0]?.id, contractId, date: executionDraft.certificateDate, periodStart: executionDraft.periodStart, periodEnd: executionDraft.periodEnd, description: executionDraft.certificateDescription, progressPercent: executionDraft.progressPercent, amount: executionDraft.certificateAmount });
      refreshExecution(); setExecutionDraft((current) => ({ ...current, certificateDescription: '', certificateAmount: 0 })); setDataError('');
      window.alert(`تم إنشاء المستخلص ${result.certificateNumber} بحالة مسودة.`);
    } catch (error) { setDataError(error instanceof Error ? error.message : 'تعذر إنشاء المستخلص.'); }
  };

  const createActualCost = () => {
    if (!projectId) return;
    try {
      executionService.addActualCost({ projectId, versionId: versions.find((version) => version.status === 'APPROVED')?.id, date: executionDraft.costDate, category: executionDraft.costCategory, description: executionDraft.costDescription, amount: executionDraft.costAmount });
      refreshExecution(); setExecutionDraft((current) => ({ ...current, costDescription: '', costAmount: 0 })); setDataError('');
    } catch (error) { setDataError(error instanceof Error ? error.message : 'تعذر تسجيل التكلفة الفعلية.'); }
  };

  return { refreshExecution, initializeExecution, createProjectContract, createProjectCertificate, createActualCost };
};
