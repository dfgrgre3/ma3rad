import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowRightLeft, CalendarClock, CheckCircle2, Clock3, Factory,
  Loader2, PauseCircle, PlayCircle, Plus, RefreshCw, Settings2, Users, Wallet,
} from 'lucide-react';
import {
  OperationsShiftService,
  type OperationShiftDefinition,
  type OperationShiftDetail,
  type OperationShiftInstance,
  type OperationShiftReportRow,
  type OperationShiftStaff,
  type OperationShiftAssignmentRow,
  type OperationEmployee,
  type OperationShiftSwapRequest,
  type OperationsWorkMode,
} from '../../../services/domains/operations/OperationsShiftService';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { localDateString } from '../../../utils/shared/date';

type Tab = 'board' | 'schedule' | 'settings' | 'reports';

const service = new OperationsShiftService();
const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const STATUS_LABELS: Record<string, string> = {
  PLANNED: 'مخططة', OPEN: 'مفتوحة', HANDOVER_PENDING: 'بانتظار الاستلام',
  CLOSED: 'مغلقة', MISSED: 'فائتة', CANCELLED: 'ملغاة',
};
const STATUS_STYLES: Record<string, string> = {
  PLANNED: 'bg-slate-100 text-slate-700 border-slate-200',
  OPEN: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  HANDOVER_PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  CLOSED: 'bg-sky-50 text-sky-700 border-sky-200',
  MISSED: 'bg-rose-50 text-rose-700 border-rose-200',
  CANCELLED: 'bg-slate-100 text-slate-500 border-slate-200',
};
const WORK_MODES: Array<{ value: OperationsWorkMode; label: string }> = [
  { value: 'NORMAL', label: 'وردية واحدة' },
  { value: 'TWO_SHIFTS', label: 'ورديتان' },
  { value: 'THREE_SHIFTS', label: 'ثلاث ورديات' },
  { value: 'CONTINUOUS', label: 'تشغيل متواصل 24/7' },
];
const money = (value: number) => `${Number(value || 0).toLocaleString('en-US', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
})}`;
const timeOf = (value: string | null | undefined) => String(value || '').slice(11, 16);
const _dateOf = (value: string | null | undefined) => String(value || '').slice(0, 10);
const offsetDate = (days: number) => {
  const date = new Date(`${localDateString()}T00:00:00`);
  date.setDate(date.getDate() + days);
  return localDateString(date);
};
const schedulePeriod = (mode: 'week' | 'month', anchor: string) => {
  const date = new Date(`${anchor}T00:00:00Z`);
  if (mode === 'week') {
    const start = new Date(date);
    start.setUTCDate(start.getUTCDate() - start.getUTCDay());
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
  }
  const from = `${anchor.slice(0, 7)}-01`;
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  return { from, to: end.toISOString().slice(0, 10) };
};
const emptyDefinition = () => ({
  id: '',
  name: '',
  department: '',
  location: '',
  shiftCode: '',
  color: '#0f766e',
  startTime: '08:00',
  endTime: '16:00',
  breakMinutes: 0,
  graceMinutes: 0,
  overtimeAfterMinutes: 0,
  minimumStaffCount: 0,
  requiredRestMinutes: 480,
  workdays: [0, 1, 2, 3, 4, 5, 6] as number[],
  shiftOrder: 0,
});

export const OperationsShiftsPage: React.FC = () => {
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

  const [definitionForm, setDefinitionForm] = useState(emptyDefinition);
  const [assignmentForm, setAssignmentForm] = useState({
    definitionId: '', employeeId: '', role: 'STAFF' as 'STAFF' | 'SUPERVISOR',
    effectiveFrom: localDateString(), effectiveTo: '',
  });
  const [replacementForm, setReplacementForm] = useState({
    absentEmployeeId: '', replacementEmployeeId: '', notes: '',
  });
  const [swapForm, setSwapForm] = useState({
    requesterEmployeeId: '', targetEmployeeId: '', requesterShiftId: '', targetShiftId: '',
  });
  const [openForm, setOpenForm] = useState({ supervisorId: '', notes: '' });
  const [staffToAdd, setStaffToAdd] = useState('');
  const [handoverForm, setHandoverForm] = useState({
    expectedCash: 0, actualCash: 0, cashDelivered: 0, pendingOrders: '',
    inventoryStatus: '', equipmentStatus: '', notes: '', nextStaffIds: [] as string[],
  });
  const [incidentForm, setIncidentForm] = useState<{
    type: 'NOTE' | 'BREAKDOWN' | 'SAFETY' | 'QUALITY' | 'OTHER';
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    title: string;
    description: string;
  }>({
    type: 'NOTE', severity: 'MEDIUM', title: '', description: '',
  });
  const [productionForm, setProductionForm] = useState({
    productionOrderId: '', productId: '', workCenterId: '', targetQty: 0,
    producedQty: 0, goodQty: 0, scrapQty: 0, downtimeMinutes: 0,
    downtimeReason: '', notes: '',
  });

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
      setReplacementForm({ absentEmployeeId: '', replacementEmployeeId: '', notes: '' });
    }, 'تم تعيين البديل وربط حضوره بالوردية.');
  };

  const submitSwapRequest = () => run('swap-request', () => {
    service.requestShiftSwap(swapForm);
    setSwapForm({ requesterEmployeeId: '', targetEmployeeId: '', requesterShiftId: '', targetShiftId: '' });
  }, 'تم إرسال طلب التبديل للموافقة.');

  const renderShiftCard = (shift: OperationShiftInstance) => (
    <button
      key={shift.id}
      type="button"
      onClick={() => openDetail(shift.id)}
      className={`w-full text-right rounded-xl border p-4 transition hover:shadow-md ${
        detail?.shift.id === shift.id ? 'border-teal-500 ring-2 ring-teal-100' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: shift.definitionName ? '#0f766e' : '#94a3b8' }} />
            <span className="font-bold text-slate-800">{shift.definitionName}</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full border ${STATUS_STYLES[shift.status] || STATUS_STYLES.PLANNED}`}>
              {STATUS_LABELS[shift.status] || shift.status}
            </span>
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {shift.businessDate} · {timeOf(shift.scheduledStart)} - {timeOf(shift.scheduledEnd)}
            {shift.department ? ` · ${shift.department}` : ''}
          </div>
        </div>
        <div className="text-left text-xs text-slate-500">
          <div className="flex items-center gap-1 justify-end"><Users className="w-3.5 h-3.5" /> {shift.presentCount}/{shift.staffCount}</div>
          <div className="flex items-center gap-1 justify-end mt-1"><Wallet className="w-3.5 h-3.5" /> {money(shift.expectedCash)}</div>
          {shift.shortageCount > 0 && (
            <div className="text-rose-700 font-bold mt-1">نقص {shift.shortageCount}</div>
          )}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        <span className="rounded-lg bg-slate-50 p-2 text-slate-600">إنتاج: {shift.producedQty}</span>
        <span className="rounded-lg bg-slate-50 p-2 text-slate-600">هالك: {shift.scrapQty}</span>
        <span className={`rounded-lg p-2 ${shift.openIncidents ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-600'}`}>
          ملاحظات: {shift.openIncidents}
        </span>
      </div>
    </button>
  );

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full relative" dir="rtl">
      {notice && (
        <div className="fixed top-6 left-6 z-[60] px-4 py-3 rounded-xl shadow-2xl bg-emerald-600 text-white flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5" /> <span className="text-sm font-bold">{notice}</span>
        </div>
      )}
      {error && (
        <div className="fixed top-6 left-6 z-[60] px-4 py-3 rounded-xl shadow-2xl bg-rose-600 text-white flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" /> <span className="text-sm font-bold">{error}</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Clock3 className="w-7 h-7 text-teal-600" /> إدارة ورديات التشغيل 24/7
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            ورديات التشغيل المستقلة عن ورديات الكاشير، مع الحضور والتسليم الإلكتروني والإنتاج.
          </p>
        </div>
        <button
          type="button"
          onClick={loadAll}
          className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-bold flex items-center gap-2 hover:bg-slate-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> تحديث
        </button>
      </div>

      <div className="flex gap-2 bg-slate-100 p-1 rounded-xl w-fit">
        {([
          ['board', 'لوحة الورديات', CalendarClock],
          ['schedule', 'الجدولة والموارد', Users],
          ['settings', 'إعدادات الورديات', Settings2],
          ['reports', 'تقارير الورديات', Factory],
        ] as Array<[Tab, string, React.ComponentType<{ className?: string }>]>).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setTab(id);
              if (id === 'settings') loadSettings();
              if (id === 'schedule') loadSchedule();
              if (id === 'reports') setReport(service.getShiftReport(reportFrom, reportTo));
            }}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 ${
              tab === id ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'board' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ['ورديات مفتوحة', kpis.open, 'text-emerald-700'],
              ['ورديات قادمة', kpis.upcoming, 'text-teal-700'],
              ['النقدية المتوقعة', money(kpis.cash), 'text-amber-700'],
              ['الإنتاج المسجل', kpis.produced, 'text-indigo-700'],
            ].map(([label, value, color]) => (
              <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-xs text-slate-500">{label}</div>
                <div className={`text-xl font-black mt-1 ${color}`}>{value}</div>
              </div>
            ))}
          </div>

          <div className="flex items-end gap-3 flex-wrap rounded-xl border border-slate-200 bg-white p-4">
            <label className="text-xs font-bold text-slate-600">
              من
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                className="block mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-bold text-slate-600">
              إلى
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                className="block mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </label>
            <button type="button" onClick={loadBoard}
              className="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-bold">عرض</button>
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            {([
              ['الوردية الحالية', grouped.current, 'border-emerald-200 bg-emerald-50/40'],
              ['الورديات القادمة', grouped.upcoming, 'border-teal-200 bg-teal-50/30'],
              ['الورديات السابقة', grouped.past, 'border-slate-200 bg-white'],
            ] as Array<[string, OperationShiftInstance[], string]>).map(([title, list, style]) => (
              <section key={title} className={`rounded-2xl border p-3 space-y-3 ${style}`}>
                <h2 className="font-black text-slate-700 text-sm px-1">{title} ({list.length})</h2>
                {list.length === 0 && <div className="text-xs text-slate-400 p-4 text-center">لا توجد ورديات في هذه الفترة.</div>}
                {list.map(renderShiftCard)}
              </section>
            ))}
          </div>

          {detail && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-black text-slate-800">{detail.shift.definitionName}</h2>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border ${STATUS_STYLES[detail.shift.status]}`}>
                      {STATUS_LABELS[detail.shift.status]}
                    </span>
                    <span className="text-xs text-slate-500">{detail.shift.shiftNumber}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {detail.shift.businessDate} · {timeOf(detail.shift.scheduledStart)} - {timeOf(detail.shift.scheduledEnd)}
                    {detail.shift.supervisorName ? ` · المشرف: ${detail.shift.supervisorName}` : ''}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {canManage && ['PLANNED', 'MISSED'].includes(detail.shift.status) && (
                    <button type="button" disabled={busy === 'open'}
                      onClick={() => run('open', () => service.openShift(detail.shift.id, {
                        supervisorId: openForm.supervisorId || null,
                        notes: openForm.notes,
                      }), 'تم فتح وردية التشغيل.')}
                      className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold flex items-center gap-1">
                      <PlayCircle className="w-4 h-4" /> فتح الوردية
                    </button>
                  )}
                  {canManage && detail.shift.status === 'OPEN' && (
                    <button type="button" disabled={busy === 'close'}
                      onClick={() => run('close', () => service.closeShift(detail.shift.id), 'تم إغلاق وردية التشغيل.')}
                      className="px-3 py-2 rounded-lg bg-slate-700 text-white text-xs font-bold flex items-center gap-1">
                      <PauseCircle className="w-4 h-4" /> إغلاق مباشر
                    </button>
                  )}
                  <button type="button" onClick={() => setDetail(null)}
                    className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-600">إغلاق اللوحة</button>
                </div>
              </div>

              <div className="grid md:grid-cols-4 gap-3 text-sm">
                <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">النقدية المتوقعة</div><div className="font-black">{money(detail.cashSummary.expected)}</div></div>
                <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">النقدية الفعلية</div><div className="font-black">{money(detail.cashSummary.actual)}</div></div>
                <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">الفرق</div><div className="font-black">{money(detail.cashSummary.difference)}</div></div>
                <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">ورديات الكاشير</div><div className="font-black">{detail.cashSummary.openShifts} مفتوحة / {detail.cashSummary.closedShifts} مغلقة</div></div>
              </div>

              {canManage && ['PLANNED', 'MISSED'].includes(detail.shift.status) && (
                <div className="grid md:grid-cols-3 gap-3 rounded-xl border border-slate-200 p-3">
                  <label className="text-xs font-bold text-slate-600">المشرف
                    <select value={openForm.supervisorId} onChange={(e) => setOpenForm({ ...openForm, supervisorId: e.target.value })}
                      className="block w-full mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                      <option value="">بدون مشرف</option>
                      {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-bold text-slate-600 md:col-span-2">ملاحظات الافتتاح
                    <input value={openForm.notes} onChange={(e) => setOpenForm({ ...openForm, notes: e.target.value })}
                      className="block w-full mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  </label>
                </div>
              )}

              <div className="grid lg:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2"><Users className="w-4 h-4" /> الحضور والأطقم</h3>
                    {canManage && ['OPEN', 'HANDOVER_PENDING'].includes(detail.shift.status) && (
                      <div className="flex gap-2">
                        <select value={staffToAdd} onChange={(e) => setStaffToAdd(e.target.value)}
                          className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
                          <option value="">إضافة موظف</option>
                          {employees.filter((emp) => !detail.staff.some((row) => row.employeeId === emp.id))
                            .map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                        </select>
                        <button type="button" disabled={!staffToAdd || busy === 'staff'}
                          onClick={() => run('staff', () => service.addStaff(detail.shift.id, staffToAdd), 'تمت إضافة الموظف.')}
                          className="px-2 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-bold"><Plus className="w-3.5 h-3.5" /></button>
                      </div>
                    )}
                  </div>
                  <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
                    {detail.staff.length === 0 && <div className="p-4 text-xs text-slate-400 text-center">لم يتم تسجيل موظفين بعد.</div>}
                    {detail.staff.map((row: OperationShiftStaff) => (
                      <div key={row.id} className="p-3 flex items-center justify-between gap-3 text-sm">
                        <div>
                          <div className="font-bold text-slate-700">{row.employeeName}
                            <span className="text-[10px] text-slate-400 font-normal mr-2">{row.employeeCode} · {row.role === 'SUPERVISOR' ? 'مشرف' : 'موظف'}</span>
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            دخول {timeOf(row.checkInAt) || '—'} · خروج {timeOf(row.checkOutAt) || '—'}
                            {row.lateMinutes > 0 ? ` · تأخير ${row.lateMinutes} د` : ''}
                            {row.overtimeMinutes > 0 ? ` · إضافي ${row.overtimeMinutes} د` : ''}
                          </div>
                        </div>
                        {canManage && detail.shift.status === 'OPEN' && (
                          <div className="flex gap-1">
                            {!row.checkInAt && (
                              <button type="button" onClick={() => run(`in-${row.employeeId}`,
                                () => service.recordStaffPresence(detail.shift.id, row.employeeId, 'IN'), 'تم تسجيل الحضور.')}
                                className="px-2 py-1 rounded bg-emerald-50 text-emerald-700 text-[11px] font-bold">دخول</button>
                            )}
                            {row.checkInAt && !row.checkOutAt && (
                              <button type="button" onClick={() => run(`out-${row.employeeId}`,
                                () => service.recordStaffPresence(detail.shift.id, row.employeeId, 'OUT'), 'تم تسجيل الانصراف.')}
                                className="px-2 py-1 rounded bg-amber-50 text-amber-700 text-[11px] font-bold">خروج</button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {detail.attendancePeriods.some((period) => period.overtimeMinutes > 0) && (
                    <div className="rounded-xl border border-slate-200 p-3 space-y-2">
                      <h4 className="text-xs font-bold text-slate-700">اعتماد الإضافي وربطه بالرواتب</h4>
                      {detail.attendancePeriods.filter((period) => period.overtimeMinutes > 0).map((period) => (
                        <div key={period.id} className="flex items-center justify-between gap-2 text-xs">
                          <span>{period.employeeName} · {period.overtimeMinutes} دقيقة</span>
                          {period.overtimeApproved ? (
                            <span className="text-emerald-700 font-bold">معتمد</span>
                          ) : canManage && period.status === 'CLOSED' ? (
                            <button type="button" disabled={busy === `overtime-${period.id}`}
                              onClick={() => run(`overtime-${period.id}`,
                                () => service.approveShiftOvertime(period.id),
                                'تم اعتماد الإضافي وسيظهر في دورة الرواتب.')}
                              className="rounded-lg bg-emerald-50 px-2 py-1 text-emerald-700 font-bold">اعتماد</button>
                          ) : (
                            <span className="text-amber-700">بانتظار إغلاق الفترة</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2 pt-2"><Wallet className="w-4 h-4" /> ورديات الكاشير المرتبطة</h3>
                  <div className="rounded-xl border border-slate-200 overflow-hidden text-xs">
                    {detail.cashShifts.length === 0 && <div className="p-3 text-slate-400 text-center">لا توجد ورديات كاشير مرتبطة.</div>}
                    {detail.cashShifts.map((row, index) => (
                      <div key={String(row.id || index)} className="p-2 flex justify-between border-b border-slate-100 last:border-0">
                        <span>{String(row.userName || '')} · {String(row.registerName || '')}</span>
                        <span className={row.status === 'OPEN' ? 'text-emerald-700 font-bold' : 'text-slate-500'}>
                          {row.status === 'OPEN' ? 'مفتوحة' : 'مغلقة'} · {money(Number(row.expectedEndingCash || 0))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> الأعطال والملاحظات</h3>
                  {canManage && (
                    <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 p-3">
                      <select value={incidentForm.type}
                        onChange={(e) => setIncidentForm({ ...incidentForm, type: e.target.value as typeof incidentForm.type })}
                        className="rounded-lg border border-slate-200 px-2 py-2 text-xs">
                        <option value="NOTE">ملاحظة</option><option value="BREAKDOWN">عطل</option>
                        <option value="SAFETY">سلامة</option><option value="QUALITY">جودة</option><option value="OTHER">أخرى</option>
                      </select>
                      <select value={incidentForm.severity}
                        onChange={(e) => setIncidentForm({ ...incidentForm, severity: e.target.value as typeof incidentForm.severity })}
                        className="rounded-lg border border-slate-200 px-2 py-2 text-xs">
                        <option value="LOW">منخفضة</option><option value="MEDIUM">متوسطة</option>
                        <option value="HIGH">عالية</option><option value="CRITICAL">حرجة</option>
                      </select>
                      <input value={incidentForm.title} onChange={(e) => setIncidentForm({ ...incidentForm, title: e.target.value })}
                        placeholder="عنوان الملاحظة" className="col-span-2 rounded-lg border border-slate-200 px-2 py-2 text-xs" />
                      <textarea value={incidentForm.description} onChange={(e) => setIncidentForm({ ...incidentForm, description: e.target.value })}
                        placeholder="الوصف" rows={2} className="col-span-2 rounded-lg border border-slate-200 px-2 py-2 text-xs" />
                      <button type="button" disabled={!incidentForm.title || busy === 'incident'}
                        onClick={() => run('incident', () => {
                          service.addIncident(detail.shift.id, incidentForm);
                          setIncidentForm({ type: 'NOTE', severity: 'MEDIUM', title: '', description: '' });
                        }, 'تم تسجيل الملاحظة.')}
                        className="col-span-2 rounded-lg bg-slate-800 text-white text-xs font-bold py-2">تسجيل</button>
                    </div>
                  )}
                  <div className="space-y-2">
                    {detail.incidents.map((incident) => (
                      <div key={incident.id} className="rounded-xl border border-slate-200 p-3 text-xs">
                        <div className="flex justify-between gap-2">
                          <span className="font-bold text-slate-700">{incident.title}</span>
                          <span className={incident.resolvedAt ? 'text-emerald-600' : 'text-amber-600'}>
                            {incident.resolvedAt ? 'معالجة' : 'مفتوحة'}
                          </span>
                        </div>
                        {incident.description && <div className="text-slate-500 mt-1">{incident.description}</div>}
                        {canManage && !incident.resolvedAt && (
                          <button type="button" onClick={() => run(`resolve-${incident.id}`,
                            () => service.resolveIncident(incident.id), 'تمت معالجة الملاحظة.')}
                            className="mt-2 text-[11px] font-bold text-teal-700">تحديد كمعالجة</button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid lg:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2"><Factory className="w-4 h-4" /> إنتاج الوردية</h3>
                  {canManage && (
                    <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 p-3">
                      <select value={productionForm.productionOrderId}
                        onChange={(e) => setProductionForm({ ...productionForm, productionOrderId: e.target.value })}
                        className="col-span-2 rounded-lg border border-slate-200 px-2 py-2 text-xs">
                        <option value="">بدون أمر إنتاج</option>
                        {detail.openProductionOrders.map((order) => (
                          <option key={String(order.id)} value={String(order.id)}>
                            {String(order.orderNumber)} · {String(order.productName || '')}
                          </option>
                        ))}
                      </select>
                      {([
                        ['targetQty', 'المستهدف'], ['producedQty', 'المنتج'], ['goodQty', 'السليم'],
                        ['scrapQty', 'الهالك'], ['downtimeMinutes', 'دقائق التوقف'],
                      ] as Array<[keyof typeof productionForm, string]>).map(([key, label]) => (
                        <label key={key} className="text-[11px] text-slate-500">{label}
                          <input type="number" min={0} value={Number(productionForm[key])}
                            onChange={(e) => setProductionForm({ ...productionForm, [key]: Number(e.target.value) })}
                            className="block w-full mt-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
                        </label>
                      ))}
                      <input value={productionForm.downtimeReason}
                        onChange={(e) => setProductionForm({ ...productionForm, downtimeReason: e.target.value })}
                        placeholder="سبب التوقف" className="col-span-2 rounded-lg border border-slate-200 px-2 py-2 text-xs" />
                      <button type="button" disabled={busy === 'production'}
                        onClick={() => run('production', () => {
                          service.recordProduction(detail.shift.id, productionForm);
                          setProductionForm({ ...productionForm, productionOrderId: '', targetQty: 0, producedQty: 0, goodQty: 0, scrapQty: 0, downtimeMinutes: 0, downtimeReason: '', notes: '' });
                        }, 'تم تسجيل إنتاج الوردية.')}
                        className="col-span-2 rounded-lg bg-indigo-600 text-white text-xs font-bold py-2">تسجيل الإنتاج</button>
                    </div>
                  )}
                  <div className="rounded-xl border border-slate-200 overflow-hidden text-xs">
                    {detail.production.length === 0 && <div className="p-3 text-slate-400 text-center">لا يوجد إنتاج مسجل.</div>}
                    {detail.production.map((row) => (
                      <div key={row.id} className="p-2 border-b border-slate-100 last:border-0 flex justify-between gap-2">
                        <span>{row.productName || row.orderNumber || 'إنتاج'}</span>
                        <span className="text-slate-500">منتج {row.producedQty} · هالك {row.scrapQty} · توقف {row.downtimeMinutes}د</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2"><ArrowRightLeft className="w-4 h-4" /> التسليم والاستلام الإلكتروني</h3>
                  {detail.handover ? (
                    <div className="rounded-xl border border-slate-200 p-3 text-xs space-y-2">
                      <div className="flex justify-between"><span>الحالة</span><span className="font-bold">{detail.handover.status === 'RECEIVED' ? 'مستلم' : 'بانتظار الاستلام'}</span></div>
                      <div className="flex justify-between"><span>المتوقع</span><span>{money(detail.handover.expectedCash)}</span></div>
                      <div className="flex justify-between"><span>الفعلي</span><span>{money(detail.handover.actualCash)}</span></div>
                      <div className="flex justify-between"><span>الفرق</span><span>{money(detail.handover.cashDifference)}</span></div>
                      <div className="flex justify-between"><span>المسلّم للخزينة</span><span>{money(detail.handover.cashDelivered)}</span></div>
                      {detail.handover.inventoryStatus && <div><span className="text-slate-500">المخزون: </span>{detail.handover.inventoryStatus}</div>}
                      {detail.handover.equipmentStatus && <div><span className="text-slate-500">المعدات: </span>{detail.handover.equipmentStatus}</div>}
                      {canManage && detail.handover.status !== 'RECEIVED' && (
                        <button type="button" onClick={() => run('receive',
                          () => service.confirmHandover(detail.shift.id), 'تم استلام الوردية وإغلاقها.')}
                          className="w-full rounded-lg bg-emerald-600 text-white text-xs font-bold py-2">استلام وتأكيد الوردية</button>
                      )}
                    </div>
                  ) : canManage && ['OPEN', 'HANDOVER_PENDING'].includes(detail.shift.status) ? (
                    <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 p-3">
                      <div className="col-span-2 text-[11px] text-slate-500">
                        يجب إغلاق كل ورديات الكاشير المرتبطة قبل التسليم.
                      </div>
                      <label className="text-[11px] text-slate-500">النقدية الفعلية
                        <input type="number" min={0} value={handoverForm.actualCash}
                          onChange={(e) => setHandoverForm({ ...handoverForm, actualCash: Number(e.target.value) })}
                          className="block w-full mt-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
                      </label>
                      <label className="text-[11px] text-slate-500">المسلّم للخزينة
                        <input type="number" min={0} value={handoverForm.cashDelivered}
                          onChange={(e) => setHandoverForm({ ...handoverForm, cashDelivered: Number(e.target.value) })}
                          className="block w-full mt-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
                      </label>
                      <input value={handoverForm.inventoryStatus}
                        onChange={(e) => setHandoverForm({ ...handoverForm, inventoryStatus: e.target.value })}
                        placeholder="حالة المخزون" className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
                      <input value={handoverForm.equipmentStatus}
                        onChange={(e) => setHandoverForm({ ...handoverForm, equipmentStatus: e.target.value })}
                        placeholder="حالة المعدات" className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
                      <input value={handoverForm.pendingOrders}
                        onChange={(e) => setHandoverForm({ ...handoverForm, pendingOrders: e.target.value })}
                        placeholder="طلبات معلقة (مفصولة بفاصلة)" className="col-span-2 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
                      <textarea value={handoverForm.notes}
                        onChange={(e) => setHandoverForm({ ...handoverForm, notes: e.target.value })}
                        placeholder="ملاحظات التسليم" rows={2} className="col-span-2 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
                      <div className="col-span-2">
                        <div className="text-[11px] font-bold text-slate-500 mb-1">طاقم الوردية القادمة</div>
                        <div className="max-h-28 overflow-y-auto rounded-lg border border-slate-100 p-2 space-y-1">
                          {employees.map((employee) => (
                            <label key={employee.id} className="flex items-center gap-2 text-[11px] text-slate-600">
                              <input type="checkbox" checked={handoverForm.nextStaffIds.includes(employee.id)}
                                onChange={(e) => setHandoverForm({
                                  ...handoverForm,
                                  nextStaffIds: e.target.checked
                                    ? [...handoverForm.nextStaffIds, employee.id]
                                    : handoverForm.nextStaffIds.filter((id) => id !== employee.id),
                                })} />
                              {employee.name}
                            </label>
                          ))}
                        </div>
                      </div>
                      <button type="button" disabled={busy === 'handover'}
                        onClick={() => run('handover', () => service.submitHandover(detail.shift.id, {
                          ...handoverForm,
                          pendingOrders: handoverForm.pendingOrders.split(',').map((item) => item.trim()).filter(Boolean),
                        }), 'تم إرسال التسليم الإلكتروني.')}
                        className="col-span-2 rounded-lg bg-teal-600 text-white text-xs font-bold py-2">إرسال التسليم</button>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-slate-200 p-4 text-xs text-slate-400 text-center">لا يوجد تسليم لهذه الوردية.</div>
                  )}
                </div>
              </div>
            </section>
          )}
        </>
      )}

      {tab === 'schedule' && (
        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex items-end gap-3 flex-wrap">
              <label className="text-xs font-bold text-slate-600">نوع الجدول
                <select value={scheduleMode} onChange={(e) => setScheduleMode(e.target.value as 'week' | 'month')}
                  className="block mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <option value="week">أسبوعي</option>
                  <option value="month">شهري</option>
                </select>
              </label>
              <label className="text-xs font-bold text-slate-600">
                {scheduleMode === 'week' ? 'اختر يوماً من الأسبوع' : 'الشهر'}
                <input type={scheduleMode === 'week' ? 'date' : 'month'}
                  value={scheduleMode === 'week' ? scheduleAnchor : scheduleAnchor.slice(0, 7)}
                  onChange={(e) => setScheduleAnchor(scheduleMode === 'week' ? e.target.value : `${e.target.value}-01`)}
                  className="block mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </label>
              <div className="text-xs text-slate-500 pb-2">
                الفترة: {currentScheduleRange.from} — {currentScheduleRange.to}
              </div>
              <button type="button" disabled={!canManage || busy === 'schedule'} onClick={generateSchedule}
                className="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-bold">
                إنشاء / توزيع الجدول تلقائياً
              </button>
              <button type="button" onClick={loadSchedule}
                className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-bold">تحديث</button>
            </div>
            {scheduleResult && (
              <div className="rounded-xl bg-teal-50 p-3 text-xs text-teal-800">
                أُنشئت {scheduleResult.shiftsCreated} وردية وأضيف {scheduleResult.staffAssigned} تعيين تلقائي.
                {scheduleResult.shortages.length > 0
                  ? ` يوجد نقص في ${scheduleResult.shortages.length} وردية؛ راجع القائمة قبل بدايتها.`
                  : ' تمت تغطية الحد الأدنى للعمالة في جميع الورديات.'}
              </div>
            )}
            {scheduleShifts.some((shift) => shift.shortageCount > 0) && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                <div className="font-bold flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> نقص عمالة قبل بداية الوردية</div>
                <div className="mt-1 space-y-1">
                  {scheduleShifts.filter((shift) => shift.shortageCount > 0).map((shift) => (
                    <div key={shift.id}>{shift.businessDate} · {shift.definitionName}: ينقص {shift.shortageCount} موظف</div>
                  ))}
                </div>
              </div>
            )}
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
              {scheduleShifts.map((shift) => (
                <button key={shift.id} type="button" onClick={() => openDetail(shift.id)}
                  className={`rounded-xl border p-3 text-right ${
                    detail?.shift.id === shift.id ? 'border-teal-500 ring-2 ring-teal-100' : 'border-slate-200'
                  }`}>
                  <div className="flex justify-between gap-2">
                    <span className="font-bold text-slate-800">{shift.definitionName}</span>
                    <span className="text-xs text-slate-500">{shift.businessDate}</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {timeOf(shift.scheduledStart)}–{timeOf(shift.scheduledEnd)} · {shift.staffCount}/{shift.minimumStaffCount} موظف
                  </div>
                  {shift.shortageCount > 0 && (
                    <div className="mt-2 text-xs font-bold text-rose-700">ينقص {shift.shortageCount} قبل البداية</div>
                  )}
                </button>
              ))}
              {scheduleShifts.length === 0 && (
                <div className="col-span-full rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
                  لا توجد ورديات معرفة في الفترة المحددة.
                </div>
              )}
            </div>
          </section>

          {detail && scheduleShifts.some((shift) => shift.id === detail.shift.id) && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
              <h2 className="font-black text-slate-800">{detail.shift.definitionName} · طاقم {detail.shift.businessDate}</h2>
              <div className="grid md:grid-cols-2 gap-2">
                {detail.staff.map((member) => (
                  <div key={member.id} className="rounded-lg border border-slate-100 p-2 text-sm flex justify-between">
                    <span>{member.employeeName}</span>
                    <span className={member.status === 'ABSENT' ? 'text-rose-700' : 'text-slate-500'}>
                      {member.status === 'ABSENT' ? 'غائب' : member.status === 'LEAVE' ? 'إجازة' : member.checkInAt ? 'حاضر' : 'مجدول'}
                    </span>
                  </div>
                ))}
              </div>
              {canManage && ['PLANNED', 'MISSED'].includes(detail.shift.status) && (
                <div className="grid md:grid-cols-4 gap-2 rounded-xl bg-slate-50 p-3">
                  <select value={replacementForm.absentEmployeeId}
                    onChange={(e) => setReplacementForm({ ...replacementForm, absentEmployeeId: e.target.value })}
                    className="rounded-lg border border-slate-200 px-2 py-2 text-xs">
                    <option value="">الموظف الغائب</option>
                    {detail.staff.filter((member) => !member.checkInAt && member.status !== 'ABSENT')
                      .map((member) => <option key={member.employeeId} value={member.employeeId}>{member.employeeName}</option>)}
                  </select>
                  <select value={replacementForm.replacementEmployeeId}
                    onChange={(e) => setReplacementForm({ ...replacementForm, replacementEmployeeId: e.target.value })}
                    className="rounded-lg border border-slate-200 px-2 py-2 text-xs">
                    <option value="">الموظف البديل</option>
                    {employees.filter((employee) => !detail.staff.some((member) => member.employeeId === employee.id))
                      .map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
                  </select>
                  <input value={replacementForm.notes}
                    onChange={(e) => setReplacementForm({ ...replacementForm, notes: e.target.value })}
                    placeholder="سبب الغياب أو ملاحظة" className="rounded-lg border border-slate-200 px-2 py-2 text-xs" />
                  <button type="button" disabled={!replacementForm.absentEmployeeId || !replacementForm.replacementEmployeeId}
                    onClick={replaceAbsentStaff}
                    className="rounded-lg bg-amber-600 text-white text-xs font-bold">تعيين بديل</button>
                </div>
              )}
            </section>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <h2 className="font-black text-slate-800 flex items-center gap-2"><ArrowRightLeft className="h-4 w-4" /> طلب تبديل وردية بموافقة المدير</h2>
            {canManage && (
              <div className="grid md:grid-cols-5 gap-2">
                <select value={swapForm.requesterEmployeeId}
                  onChange={(e) => setSwapForm({ ...swapForm, requesterEmployeeId: e.target.value })}
                  className="rounded-lg border border-slate-200 px-2 py-2 text-xs">
                  <option value="">الموظف الطالب</option>
                  {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
                </select>
                <select value={swapForm.requesterShiftId}
                  onChange={(e) => setSwapForm({ ...swapForm, requesterShiftId: e.target.value })}
                  className="rounded-lg border border-slate-200 px-2 py-2 text-xs">
                  <option value="">وردية الموظف</option>
                  {scheduleShifts.filter((shift) => shift.status === 'PLANNED').map((shift) => (
                    <option key={shift.id} value={shift.id}>{shift.businessDate} · {shift.definitionName}</option>
                  ))}
                </select>
                <select value={swapForm.targetEmployeeId}
                  onChange={(e) => setSwapForm({ ...swapForm, targetEmployeeId: e.target.value })}
                  className="rounded-lg border border-slate-200 px-2 py-2 text-xs">
                  <option value="">الموظف البديل</option>
                  {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
                </select>
                <select value={swapForm.targetShiftId}
                  onChange={(e) => setSwapForm({ ...swapForm, targetShiftId: e.target.value })}
                  className="rounded-lg border border-slate-200 px-2 py-2 text-xs">
                  <option value="">وردية الموظف البديل</option>
                  {scheduleShifts.filter((shift) => shift.status === 'PLANNED').map((shift) => (
                    <option key={shift.id} value={shift.id}>{shift.businessDate} · {shift.definitionName}</option>
                  ))}
                </select>
                <button type="button" disabled={busy === 'swap-request' || !swapForm.requesterEmployeeId
                  || !swapForm.targetEmployeeId || !swapForm.requesterShiftId || !swapForm.targetShiftId}
                  onClick={submitSwapRequest}
                  className="rounded-lg bg-slate-800 text-white text-xs font-bold">إرسال للموافقة</button>
              </div>
            )}
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {swapRequests.length === 0 && <div className="p-4 text-xs text-slate-400 text-center">لا توجد طلبات تبديل.</div>}
              {swapRequests.map((request) => (
                <div key={request.id} className="p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span>{request.requesterEmployeeName} ({request.requesterShiftDate} · {request.requesterShiftName})
                    {' ↔ '}{request.targetEmployeeName} ({request.targetShiftDate} · {request.targetShiftName})</span>
                  <span className="font-bold">{request.status === 'PENDING' ? 'بانتظار المدير'
                    : request.status === 'APPROVED' ? 'معتمد' : 'مرفوض'}</span>
                  {canManage && request.status === 'PENDING' && (
                    <span className="flex gap-2">
                      <button type="button" onClick={() => run(`swap-${request.id}`,
                        () => service.decideShiftSwap(request.id, true), 'تم اعتماد التبديل.')}
                        className="rounded bg-emerald-50 px-2 py-1 text-emerald-700 font-bold">اعتماد</button>
                      <button type="button" onClick={() => run(`swap-${request.id}`,
                        () => service.decideShiftSwap(request.id, false), 'تم رفض الطلب.')}
                        className="rounded bg-rose-50 px-2 py-1 text-rose-700 font-bold">رفض</button>
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {tab === 'settings' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="font-black text-slate-800">نظام العمل</h2>
              <div className="flex items-center gap-2">
                <select value={workMode} onChange={(e) => setWorkMode(e.target.value as OperationsWorkMode)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  {WORK_MODES.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
                </select>
                <button type="button" disabled={!canManage || busy === 'mode'}
                  onClick={() => run('mode', () => service.saveWorkMode(workMode), 'تم حفظ نظام العمل.')}
                  className="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-bold">حفظ</button>
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-black text-slate-800">تعريفات الورديات</h2>
                {canManage && <button type="button" onClick={() => setDefinitionForm(emptyDefinition())}
                  className="text-xs font-bold text-teal-700 flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> جديد</button>}
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {definitions.map((definition) => (
                  <button key={definition.id} type="button"
                    onClick={() => setDefinitionForm({
                      id: definition.id, name: definition.name, department: definition.department || '',
                      location: definition.location || '', shiftCode: definition.shiftCode || '',
                      color: definition.color || '#0f766e', startTime: definition.startTime.slice(0, 5),
                      endTime: definition.endTime.slice(0, 5), breakMinutes: definition.breakMinutes,
                      graceMinutes: definition.graceMinutes, overtimeAfterMinutes: definition.overtimeAfterMinutes,
                      minimumStaffCount: definition.minimumStaffCount,
                      requiredRestMinutes: definition.requiredRestMinutes,
                      workdays: definition.workdays, shiftOrder: definition.shiftOrder,
                    })}
                    className="w-full text-right rounded-xl border border-slate-200 p-3 hover:bg-slate-50">
                    <div className="flex justify-between gap-2">
                      <span className="font-bold text-slate-700 text-sm">{definition.name}</span>
                      <span className="text-xs text-slate-500">{definition.startTime.slice(0, 5)} - {definition.endTime.slice(0, 5)}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      {definition.department || 'بدون قسم'} · {definition.assignedCount} موظف
                      · الحد الأدنى {definition.minimumStaffCount}
                      {definition.crossesMidnight ? ' · تمتد بعد منتصف الليل' : ''}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
              <h2 className="font-black text-slate-800">{definitionForm.id ? 'تعديل وردية' : 'وردية جديدة'}</h2>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['name', 'اسم الوردية'], ['department', 'القسم'], ['location', 'الموقع'], ['shiftCode', 'كود الوردية'],
                ] as Array<[keyof typeof definitionForm, string]>).map(([key, label]) => (
                  <label key={key} className="text-[11px] font-bold text-slate-500">{label}
                    <input value={String(definitionForm[key] || '')}
                      onChange={(e) => setDefinitionForm({ ...definitionForm, [key]: e.target.value })}
                      className="block w-full mt-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
                  </label>
                ))}
                <label className="text-[11px] font-bold text-slate-500">البداية
                  <input type="time" value={definitionForm.startTime}
                    onChange={(e) => setDefinitionForm({ ...definitionForm, startTime: e.target.value })}
                    className="block w-full mt-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
                </label>
                <label className="text-[11px] font-bold text-slate-500">النهاية
                  <input type="time" value={definitionForm.endTime}
                    onChange={(e) => setDefinitionForm({ ...definitionForm, endTime: e.target.value })}
                    className="block w-full mt-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
                </label>
                {([
                  ['breakMinutes', 'استراحة (د)'], ['graceMinutes', 'سماحية تأخير (د)'],
                  ['overtimeAfterMinutes', 'إضافي بعد (د)'], ['minimumStaffCount', 'الحد الأدنى للعاملين'],
                  ['requiredRestMinutes', 'الراحة بين الورديات (د)'], ['shiftOrder', 'الترتيب'],
                ] as Array<[keyof typeof definitionForm, string]>).map(([key, label]) => (
                  <label key={key} className="text-[11px] font-bold text-slate-500">{label}
                    <input type="number" min={0} value={Number(definitionForm[key] || 0)}
                      onChange={(e) => setDefinitionForm({ ...definitionForm, [key]: Number(e.target.value) })}
                      className="block w-full mt-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
                  </label>
                ))}
                <label className="text-[11px] font-bold text-slate-500">اللون
                  <input type="color" value={definitionForm.color}
                    onChange={(e) => setDefinitionForm({ ...definitionForm, color: e.target.value })}
                    className="block w-full mt-1 h-9 rounded-lg border border-slate-200 px-1 py-1" />
                </label>
                <div className="col-span-2">
                  <div className="text-[11px] font-bold text-slate-500 mb-1">أيام العمل</div>
                  <div className="flex gap-1 flex-wrap">
                    {WEEKDAYS.map((label, day) => (
                      <button key={label} type="button"
                        onClick={() => setDefinitionForm({
                          ...definitionForm,
                          workdays: definitionForm.workdays.includes(day)
                            ? definitionForm.workdays.filter((value) => value !== day)
                            : [...definitionForm.workdays, day],
                        })}
                        className={`px-2 py-1 rounded-lg text-[11px] font-bold border ${
                          definitionForm.workdays.includes(day)
                            ? 'bg-teal-600 text-white border-teal-600'
                            : 'bg-white text-slate-500 border-slate-200'
                        }`}>{label}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" disabled={!canManage || !definitionForm.name || busy === 'definition'}
                  onClick={saveDefinition}
                  className="flex-1 rounded-lg bg-teal-600 text-white text-sm font-bold py-2">حفظ الوردية</button>
                {definitionForm.id && (
                  <button type="button" disabled={!canManage}
                    onClick={() => run('deactivate', () => service.deactivateShiftDefinition(definitionForm.id), 'تم إيقاف الوردية.')}
                    className="px-3 rounded-lg border border-rose-200 text-rose-600 text-sm font-bold">إيقاف</button>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <h2 className="font-black text-slate-800">تعيين الموظفين على الورديات</h2>
            {canManage && (
              <div className="grid md:grid-cols-6 gap-2">
                <select value={assignmentForm.definitionId}
                  onChange={(e) => setAssignmentForm({ ...assignmentForm, definitionId: e.target.value })}
                  className="rounded-lg border border-slate-200 px-2 py-2 text-xs">
                  <option value="">الوردية</option>
                  {definitions.map((definition) => <option key={definition.id} value={definition.id}>{definition.name}</option>)}
                </select>
                <select value={assignmentForm.employeeId}
                  onChange={(e) => setAssignmentForm({ ...assignmentForm, employeeId: e.target.value })}
                  className="rounded-lg border border-slate-200 px-2 py-2 text-xs">
                  <option value="">الموظف</option>
                  {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
                </select>
                <select value={assignmentForm.role}
                  onChange={(e) => setAssignmentForm({ ...assignmentForm, role: e.target.value as 'STAFF' | 'SUPERVISOR' })}
                  className="rounded-lg border border-slate-200 px-2 py-2 text-xs">
                  <option value="STAFF">موظف</option><option value="SUPERVISOR">مشرف</option>
                </select>
                <input type="date" value={assignmentForm.effectiveFrom}
                  onChange={(e) => setAssignmentForm({ ...assignmentForm, effectiveFrom: e.target.value })}
                  className="rounded-lg border border-slate-200 px-2 py-2 text-xs" />
                <input type="date" value={assignmentForm.effectiveTo}
                  onChange={(e) => setAssignmentForm({ ...assignmentForm, effectiveTo: e.target.value })}
                  className="rounded-lg border border-slate-200 px-2 py-2 text-xs" />
                <button type="button" disabled={!assignmentForm.definitionId || !assignmentForm.employeeId || busy === 'assignment'}
                  onClick={saveAssignment}
                  className="rounded-lg bg-slate-800 text-white text-xs font-bold py-2">تعيين</button>
              </div>
            )}
            <div className="rounded-xl border border-slate-200 overflow-hidden max-h-64 overflow-y-auto">
              {assignments.map((row) => (
                <div key={row.id} className="p-2 text-xs flex justify-between gap-2 border-b border-slate-100 last:border-0">
                  <span>{row.employeeName} <span className="text-slate-400">({row.employeeCode})</span> · {row.definitionName}</span>
                  <span className="text-slate-500">{row.role === 'SUPERVISOR' ? 'مشرف' : 'موظف'} · من {row.effectiveFrom}{row.effectiveTo ? ` إلى ${row.effectiveTo}` : ''}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'reports' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-end gap-3 flex-wrap">
            <label className="text-xs font-bold text-slate-600">من
              <input type="date" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)}
                className="block mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-bold text-slate-600">إلى
              <input type="date" value={reportTo} onChange={(e) => setReportTo(e.target.value)}
                className="block mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </label>
            <button type="button"
              onClick={() => {
                try { setReport(service.getShiftReport(reportFrom, reportTo)); }
                catch (e: any) { notify(e.message || 'تعذر تحميل التقرير.', true); }
              }}
              className="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-bold">تشغيل التقرير</button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-xs text-right">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  {['الوردية', 'التاريخ', 'الحالة', 'المشرف', 'الموظفون', 'المتوقع', 'الفعلي', 'الفرق', 'المسلّم', 'إنتاج جيد', 'هالك', 'توقف', 'ملاحظات', 'تكلفة العمالة', 'إضافي معتمد (د)', 'إنتاج/ساعة عمل', 'تكلفة/وحدة'].map((head) => (
                    <th key={head} className="p-2 font-bold whitespace-nowrap">{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.length === 0 && <tr><td colSpan={17} className="p-6 text-center text-slate-400">لا توجد بيانات.</td></tr>}
                {report.map((row) => (
                  <tr key={row.shiftId} className="border-t border-slate-100">
                    <td className="p-2 font-bold text-slate-700 whitespace-nowrap">{row.definitionName}</td>
                    <td className="p-2 whitespace-nowrap">{row.businessDate}</td>
                    <td className="p-2 whitespace-nowrap">{STATUS_LABELS[row.status] || row.status}</td>
                    <td className="p-2 whitespace-nowrap">{row.supervisorName || '—'}</td>
                    <td className="p-2">{row.staffCount}</td>
                    <td className="p-2">{money(row.expectedCash)}</td>
                    <td className="p-2">{money(row.actualCash)}</td>
                    <td className="p-2">{money(row.cashDifference)}</td>
                    <td className="p-2">{money(row.cashDelivered)}</td>
                    <td className="p-2">{row.producedQty}</td>
                    <td className="p-2">{row.scrapQty}</td>
                    <td className="p-2">{row.downtimeMinutes}</td>
                    <td className="p-2">{row.incidents}</td>
                    <td className="p-2">{money(row.laborCost)}</td>
                    <td className="p-2">{row.approvedOvertimeMinutes}</td>
                    <td className="p-2">{row.productivityPerLaborHour.toFixed(2)}</td>
                    <td className="p-2">{money(row.costPerGoodUnit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {loading && (
        <div className="fixed inset-0 bg-white/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
        </div>
      )}
    </div>
  );
};

export default OperationsShiftsPage;
