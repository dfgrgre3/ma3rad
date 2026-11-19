import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type OperationShiftAssignmentRow,
  type OperationShiftDefinition,
  type OperationShiftDetail,
  type OperationShiftInstance,
  type OperationShiftReportRow,
  type OperationShiftSwapRequest,
  type OperationEmployee,
  type OperationsWorkMode,
} from '../../../../services/domains/operations/OperationsShiftService';
import { AuthService } from '../../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../../services/domains/auth/PermissionService';
import { localDateString } from '../../../../utils/shared/date';
import { service } from './service';
import { offsetDate, schedulePeriod, type Tab } from './constants';
import {
  emptyDefinition,
  initialAssignmentForm,
  initialHandoverForm,
  initialIncidentForm,
  initialOpenForm,
  initialProductionForm,
  initialReplacementForm,
  initialSwapForm,
  type AssignmentFormState,
  type DefinitionFormState,
  type HandoverFormState,
  type IncidentFormState,
  type OpenFormState,
  type ProductionFormState,
  type ReplacementFormState,
  type SwapFormState,
} from './types';

/**
 * All state, data loading and action handlers for the operations shifts page.
 * Pure extraction — behavior is identical to the previous inline component.
 */
export function useOperationsShifts() {
  const currentUser = AuthService.getCurrentUser();
  const canManage = PermissionService.can(currentUser, 'operations.update')
    || PermissionService.can(currentUser, 'cashier.manage')
    || PermissionService.can(currentUser, 'employees.attendance.manage')
    || PermissionService.can(currentUser, 'manufacturing.manage')
    || PermissionService.can(currentUser, 'ui.employees.employees.manage');

  const [tab, setTab] = useState<Tab>('board');
  const [scheduleMode, setScheduleMode] = useState<'week' | 'month'>('week');
  const [scheduleAnchor, setScheduleAnchor] = useState(localDateString());
  const [scheduleShifts, setScheduleShifts] = useState<OperationShiftInstance[]>([]);
  const [swapRequests, setSwapRequests] = useState<OperationShiftSwapRequest[]>([]);
  const [scheduleResult, setScheduleResult] = useState<{
    shiftsCreated: number;
    staffAssigned: number;
    shortages: Array<{ shiftId: string; name: string; date: string; shortageCount: number }>;
  } | null>(null);
  const [from, setFrom] = useState(offsetDate(-1));
  const [to, setTo] = useState(offsetDate(7));
  const [shifts, setShifts] = useState<OperationShiftInstance[]>([]);
  const [detail, setDetail] = useState<OperationShiftDetail | null>(null);
  const [employees, setEmployees] = useState<OperationEmployee[]>([]);
  const [definitions, setDefinitions] = useState<OperationShiftDefinition[]>([]);
  const [assignments, setAssignments] = useState<OperationShiftAssignmentRow[]>([]);
  const [workMode, setWorkMode] = useState<OperationsWorkMode>('CONTINUOUS');
  const [report, setReport] = useState<OperationShiftReportRow[]>([]);
  const [reportFrom, setReportFrom] = useState(localDateString().slice(0, 8) + '01');
  const [reportTo, setReportTo] = useState(localDateString());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [definitionForm, setDefinitionForm] = useState<DefinitionFormState>(emptyDefinition);
  const [assignmentForm, setAssignmentForm] = useState<AssignmentFormState>(initialAssignmentForm);
  const [replacementForm, setReplacementForm] = useState<ReplacementFormState>(initialReplacementForm);
  const [swapForm, setSwapForm] = useState<SwapFormState>(initialSwapForm);
  const [openForm, setOpenForm] = useState<OpenFormState>(initialOpenForm);
  const [staffToAdd, setStaffToAdd] = useState('');
  const [handoverForm, setHandoverForm] = useState<HandoverFormState>(initialHandoverForm);
  const [incidentForm, setIncidentForm] = useState<IncidentFormState>(initialIncidentForm);
  const [productionForm, setProductionForm] = useState<ProductionFormState>(initialProductionForm);

  const notify = useCallback((message: string, isError = false) => {
    if (isError) {
      setError(message);
      setNotice(null);
    } else {
      setNotice(message);
      setError(null);
    }
    window.setTimeout(() => {
      setError(null);
      setNotice(null);
    }, 5000);
  }, []);

  const loadBoard = useCallback(() => {
    const rows = service.getShiftBoard({ from, to });
    setShifts(rows);
  }, [from, to]);

  const loadSettings = useCallback(() => {
    setDefinitions(service.getShiftDefinitions());
    setEmployees(service.getEmployees());
    setAssignments(service.getAssignments());
    setWorkMode(service.getWorkMode());
  }, []);

  const currentScheduleRange = useMemo(
    () => schedulePeriod(scheduleMode, scheduleAnchor),
    [scheduleAnchor, scheduleMode]
  );
  const loadSchedule = useCallback(() => {
    const rows = service.getShiftBoard({
      from: currentScheduleRange.from,
      to: currentScheduleRange.to,
    });
    setScheduleShifts(rows);
    setSwapRequests(service.getShiftSwapRequests(currentScheduleRange.from, currentScheduleRange.to));
  }, [currentScheduleRange]);

  const loadAll = useCallback(() => {
    try {
      setLoading(true);
      service.syncShiftLifecycle();
      loadBoard();
      loadSettings();
    } catch (e: any) {
      notify(e.message || 'تعذر تحميل بيانات الورديات.', true);
    } finally {
      setLoading(false);
    }
  }, [loadBoard, loadSettings, notify]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);
  useEffect(() => {
    if (tab !== 'schedule') return;
    try { loadSchedule(); }
    catch (reason) { notify(reason instanceof Error ? reason.message : 'تعذر تحميل الجدول.', true); }
  }, [loadSchedule, notify, tab]);

  const run = useCallback(async (key: string, action: () => void, success: string) => {
    try {
      setBusy(key);
      action();
      notify(success);
      loadBoard();
      loadSettings();
      if (tab === 'schedule') loadSchedule();
      if (detail) setDetail(service.getShiftDetail(detail.shift.id));
    } catch (e: any) {
      notify(e.message || 'تعذر تنفيذ العملية.', true);
    } finally {
      setBusy(null);
    }
  }, [detail, loadBoard, loadSchedule, loadSettings, notify, tab]);

  const openDetail = useCallback((id: string) => {
    try {
      const value = service.getShiftDetail(id);
      setDetail(value);
      setOpenForm({ supervisorId: value.shift.supervisorId || '', notes: '' });
      setHandoverForm({
        expectedCash: value.cashSummary.expected,
        actualCash: value.cashSummary.expected,
        cashDelivered: value.cashSummary.expected,
        pendingOrders: '',
        inventoryStatus: '',
        equipmentStatus: '',
        notes: '',
        nextStaffIds: [],
      });
      setError(null);
    } catch (e: any) {
      notify(e.message || 'تعذر فتح تفاصيل الوردية.', true);
    }
  }, [notify]);

  const grouped = useMemo(() => {
    const today = localDateString();
    const current: OperationShiftInstance[] = [];
    const upcoming: OperationShiftInstance[] = [];
    const past: OperationShiftInstance[] = [];
    for (const shift of shifts) {
      if (['OPEN', 'HANDOVER_PENDING'].includes(shift.status)) current.push(shift);
      else if (shift.businessDate >= today && shift.status !== 'CLOSED') upcoming.push(shift);
      else past.push(shift);
    }
    return { current, upcoming, past };
  }, [shifts]);

  const kpis = useMemo(() => ({
    open: shifts.filter((row) => ['OPEN', 'HANDOVER_PENDING'].includes(row.status)).length,
    upcoming: shifts.filter((row) => row.status === 'PLANNED').length,
    cash: shifts.reduce((total, row) => total + Number(row.expectedCash || 0), 0),
    produced: shifts.reduce((total, row) => total + Number(row.producedQty || 0), 0),
  }), [shifts]);

  const saveDefinition = () => {
    run('definition', () => {
      service.saveShiftDefinition({
        id: definitionForm.id || undefined,
        name: definitionForm.name,
        department: definitionForm.department,
        location: definitionForm.location,
        shiftCode: definitionForm.shiftCode,
        color: definitionForm.color,
        startTime: definitionForm.startTime,
        endTime: definitionForm.endTime,
        breakMinutes: Number(definitionForm.breakMinutes) || 0,
        graceMinutes: Number(definitionForm.graceMinutes) || 0,
        overtimeAfterMinutes: Number(definitionForm.overtimeAfterMinutes) || 0,
        minimumStaffCount: Number(definitionForm.minimumStaffCount) || 0,
        requiredRestMinutes: Number(definitionForm.requiredRestMinutes) || 0,
        workdays: definitionForm.workdays,
        shiftOrder: Number(definitionForm.shiftOrder) || 0,
      });
      setDefinitionForm(emptyDefinition());
    }, 'تم حفظ وردية التشغيل.');
  };

  const saveAssignment = () => {
    run('assignment', () => {
      service.assignEmployee({
        definitionId: assignmentForm.definitionId,
        employeeId: assignmentForm.employeeId,
        role: assignmentForm.role,
        effectiveFrom: assignmentForm.effectiveFrom,
        effectiveTo: assignmentForm.effectiveTo || null,
      });
      setAssignmentForm((current) => ({ ...current, employeeId: '', effectiveTo: '' }));
    }, 'تم تعيين الموظف على الوردية.');
  };

  const generateSchedule = () => run('schedule', () => {
    setScheduleResult(service.generateWorkforceSchedule(
      currentScheduleRange.from,
      currentScheduleRange.to
    ));
  }, 'تم إنشاء الجدول. راجع تنبيهات نقص العمالة قبل بداية الورديات.');

  const replaceAbsentStaff = () => {
    if (!detail || !replacementForm.absentEmployeeId || !replacementForm.replacementEmployeeId) return;
    run('replacement', () => {
      service.replaceAbsentStaff(
        detail.shift.id,
        replacementForm.absentEmployeeId,
        replacementForm.replacementEmployeeId,
        replacementForm.notes
      );
      setReplacementForm(initialReplacementForm());
    }, 'تم تعيين البديل وربط حضوره بالوردية.');
  };

  const submitSwapRequest = () => run('swap-request', () => {
    service.requestShiftSwap(swapForm);
    setSwapForm(initialSwapForm());
  }, 'تم إرسال طلب التبديل للموافقة.');

  return {
    service,
    currentUser,
    canManage,
    tab,
    setTab,
    scheduleMode,
    setScheduleMode,
    scheduleAnchor,
    setScheduleAnchor,
    scheduleShifts,
    swapRequests,
    scheduleResult,
    from,
    setFrom,
    to,
    setTo,
    shifts,
    detail,
    setDetail,
    employees,
    definitions,
    assignments,
    workMode,
    setWorkMode,
    report,
    setReport,
    reportFrom,
    setReportFrom,
    reportTo,
    setReportTo,
    loading,
    busy,
    error,
    notice,
    definitionForm,
    setDefinitionForm,
    assignmentForm,
    setAssignmentForm,
    replacementForm,
    setReplacementForm,
    swapForm,
    setSwapForm,
    openForm,
    setOpenForm,
    staffToAdd,
    setStaffToAdd,
    handoverForm,
    setHandoverForm,
    incidentForm,
    setIncidentForm,
    productionForm,
    setProductionForm,
    notify,
    loadBoard,
    loadSettings,
    loadSchedule,
    loadAll,
    currentScheduleRange,
    run,
    openDetail,
    grouped,
    kpis,
    saveDefinition,
    saveAssignment,
    generateSchedule,
    replaceAbsentStaff,
    submitSwapRequest,
  };
}

export type OperationsShiftsState = ReturnType<typeof useOperationsShifts>;
