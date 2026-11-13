import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Clock3, Coffee, Download, FileUp, Loader2, Search, Settings2, ShieldCheck, Users } from 'lucide-react';
import type { AttendanceStatus } from '../../../services/domains/hr/EmployeeService';
import {
  AttendanceService,
  type AttendanceCorrection,
  type AttendanceCorrectionHistory,
  type AttendanceAuditEntry,
  type AttendanceBreakEntry,
  type AttendanceEmployee,
  type AttendanceEntry,
  type AttendanceShift,
  type AttendanceReportRow,
} from '../../../services/domains/hr/AttendanceService';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { localDateString } from '../../../utils/shared/date';

type Tab = 'daily' | 'schedules' | 'report' | 'corrections' | 'import';
type ManualForm = { status: AttendanceStatus; checkIn: string; checkOut: string; late: string; overtime: string; notes: string };
const WEEKDAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const STATUS_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: 'حاضر', LATE: 'متأخر', ABSENT: 'غائب', LEAVE: 'إجازة',
  HOLIDAY: 'عطلة', WEEKEND: 'راحة أسبوعية',
};
const STATUS_COLORS: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  LATE: 'bg-amber-50 text-amber-700 border-amber-200',
  ABSENT: 'bg-rose-50 text-rose-700 border-rose-200',
  LEAVE: 'bg-sky-50 text-sky-700 border-sky-200',
  HOLIDAY: 'bg-violet-50 text-violet-700 border-violet-200',
  WEEKEND: 'bg-slate-100 text-slate-600 border-slate-200',
};
const EDITABLE_STATUSES: AttendanceStatus[] = ['PRESENT', 'LATE', 'ABSENT', 'LEAVE'];
const today = () => localDateString();
const emptyShift = () => ({
  name: '', startTime: '09:00', endTime: '17:00', breakMinutes: 0,
  graceMinutes: 0, overtimeAfterMinutes: 0, workdays: [0, 1, 2, 3, 4],
});
const csvCell = (value: unknown) => {
  const text = String(value ?? '');
  const safe = typeof value === 'string' && /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted && character === '"' && source[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (!quoted && character === ',') {
      row.push(cell.trim());
      cell = '';
    } else if (!quoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      row.push(cell.trim());
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }
  row.push(cell.trim());
  if (row.some((value) => value !== '')) rows.push(row);
  if (quoted) throw new Error('ملف CSV يحتوي على علامة اقتباس غير مكتملة.');
  return rows;
}

function formatClock(value: string | null | undefined): string {
  return value ? value.slice(11, 16) : '—';
}

function formatMinutes(value: number): string {
  return `${Math.floor(value / 60)}س ${value % 60}د`;
}

function addOneDay(date: string): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

export const AttendancePage: React.FC = () => {
  const [date, setDate] = useState(today());
  const [period, setPeriod] = useState(today().slice(0, 7));
  const [employees, setEmployees] = useState<AttendanceEmployee[]>([]);
  const [records, setRecords] = useState<AttendanceEntry[]>([]);
  const [report, setReport] = useState<AttendanceReportRow[]>([]);
  const [shifts, setShifts] = useState<AttendanceShift[]>([]);
  const [assignments, setAssignments] = useState<ReturnType<typeof AttendanceService.getAssignments>>([]);
  const [holidays, setHolidays] = useState<Array<{ id: string; date: string; name: string }>>([]);
  const [requests, setRequests] = useState<AttendanceCorrection[]>([]);
  const [correctionHistory, setCorrectionHistory] = useState<AttendanceCorrectionHistory[]>([]);
  const [auditHistory, setAuditHistory] = useState<AttendanceAuditEntry[]>([]);
  const [breaks, setBreaks] = useState<AttendanceBreakEntry[]>([]);
  const [forms, setForms] = useState<Record<string, ManualForm>>({});
  const [newShift, setNewShift] = useState(emptyShift);
  const [assignment, setAssignment] = useState({ employeeId: '', shiftId: '', from: today(), to: '' });
  const [holiday, setHoliday] = useState({ date: today(), name: '' });
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('daily');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  const load = useCallback(() => {
    setLoading(true);
    try {
      const currentEmployees = AttendanceService.getEmployees();
      setEmployees(currentEmployees);
      setRecords(AttendanceService.getAttendanceByDate(date));
      setBreaks(AttendanceService.getBreaksByDate(date));
      setReport(AttendanceService.getMonthlyReport(period));
      setShifts(AttendanceService.getShifts());
      setAssignments(AttendanceService.getAssignments());
      setHolidays(AttendanceService.getHolidays(period));
      setRequests(AttendanceService.getCorrectionRequests());
      setCorrectionHistory(AttendanceService.getCorrectionHistory(period));
      setAuditHistory(AttendanceService.getAuditHistory(period));
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'تعذر تحميل بيانات الحضور.');
    } finally {
      setLoading(false);
    }
  }, [date, period]);
  useEffect(() => { load(); }, [load]);

  const recordsByEmployee = useMemo(() => new Map(records.map((record) => [record.employeeId, record])), [records]);
  const filtered = employees.filter((employee) => !search.trim()
    || employee.name.includes(search) || employee.role.includes(search));
  const canManage = PermissionService.can(AuthService.getCurrentUser(), 'employees.attendance.manage')
    || PermissionService.can(AuthService.getCurrentUser(), 'ui.employees.employees.manage');
  const canApprove = PermissionService.can(AuthService.getCurrentUser(), 'employees.attendance.approve')
    || PermissionService.can(AuthService.getCurrentUser(), 'employees.payroll.approve')
    || PermissionService.can(AuthService.getCurrentUser(), 'ui.employees.employees.manage');
  const canExport = PermissionService.can(AuthService.getCurrentUser(), 'employees.attendance.export');

  const runAction = (key: string, action: () => void, message?: string) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      action();
      if (message) setNotice(message);
      load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'تعذر تنفيذ العملية.');
    } finally {
      setBusy(null);
    }
  };

  const updateForm = (employeeId: string, record: AttendanceEntry | undefined, field: keyof ManualForm, value: string) => {
    setForms((previous) => {
      const base = previous[employeeId] ?? {
        status: record && EDITABLE_STATUSES.includes(record.status) ? record.status : 'PRESENT',
        checkIn: formatClock(record?.checkInAt) === '—' ? '' : formatClock(record?.checkInAt),
        checkOut: formatClock(record?.checkOutAt) === '—' ? '' : formatClock(record?.checkOutAt),
        late: String(record?.lateMinutes ?? 0),
        overtime: String(record?.overtimeMinutes ?? 0),
        notes: record?.notes ?? '',
      };
      return { ...previous, [employeeId]: { ...base, [field]: value } };
    });
  };

  const getForm = (employeeId: string, record?: AttendanceEntry): ManualForm => forms[employeeId] ?? ({
    status: record && EDITABLE_STATUSES.includes(record.status) ? record.status : 'PRESENT',
    checkIn: formatClock(record?.checkInAt) === '—' ? '' : formatClock(record?.checkInAt),
    checkOut: formatClock(record?.checkOutAt) === '—' ? '' : formatClock(record?.checkOutAt),
    late: String(record?.lateMinutes ?? 0),
    overtime: String(record?.overtimeMinutes ?? 0),
    notes: record?.notes ?? '',
  });

  const saveManual = (employee: AttendanceEmployee, record?: AttendanceEntry) => {
    const form = getForm(employee.id, record);
    const checkInAt = form.checkIn ? `${date}T${form.checkIn}:00` : null;
    const checkOutDate = form.checkIn && form.checkOut && form.checkOut < form.checkIn ? addOneDay(date) : date;
    const result = AttendanceService.saveManualRecord({
      employeeId: employee.id,
      date,
      status: form.status,
      lateMinutes: Number(form.late),
      overtimeMinutes: Number(form.overtime),
      checkInAt,
      checkOutAt: form.checkOut ? `${checkOutDate}T${form.checkOut}:00` : null,
      notes: form.notes,
    });
    setNotice(result.pendingApproval ? 'أُرسل التصحيح للموافقة؛ لن تتغير بيانات السجل قبل اعتماده.' : 'تم حفظ سجل الحضور.');
    load();
  };

  const filteredCount = useMemo(() => {
    const counts: Record<AttendanceStatus, number> = {
      PRESENT: 0, LATE: 0, ABSENT: 0, LEAVE: 0, HOLIDAY: 0, WEEKEND: 0,
    };
    records.forEach((record) => { counts[record.status] += 1; });
    return counts;
  }, [records]);

  const changeTab = (next: Tab) => { setTab(next); setError(null); setNotice(null); };

  const downloadTemplate = () => {
    const file = new Blob(['\uFEFFemployee_code,date,check_in,check_out\r\nEMP-001,2026-11-09,09:00,17:00\r\n'], {
      type: 'text/csv;charset=utf-8',
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(file);
    link.download = 'attendance-template.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const handleImport = async (file?: File) => {
    if (!file) return;
    setError(null);
    setNotice(null);
    setImportErrors([]);
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('حجم ملف الاستيراد يتجاوز 10 ميجابايت.');
      const parsed = parseCsv(await file.text());
      if (parsed.length < 2) throw new Error('يجب أن يحتوي الملف على العناوين وسجل واحد على الأقل.');
      if (parsed.length > 5001) throw new Error('يسمح باستيراد 5000 سجل كحد أقصى في الملف الواحد.');
      const headers = parsed[0].map((header) => header.trim().toLowerCase());
      const indices = {
        employeeCode: headers.findIndex((header) => ['employee_code', 'كود الموظف'].includes(header)),
        date: headers.findIndex((header) => ['date', 'التاريخ'].includes(header)),
        checkIn: headers.findIndex((header) => ['check_in', 'وقت الدخول'].includes(header)),
        checkOut: headers.findIndex((header) => ['check_out', 'وقت الخروج', 'وقت الانصراف'].includes(header)),
      };
      if (Object.values(indices).some((index) => index < 0)) {
        throw new Error('العناوين المطلوبة: employee_code,date,check_in,check_out.');
      }
      const rows = parsed.slice(1).map((cells) => ({
        employeeCode: cells[indices.employeeCode] ?? '',
        date: cells[indices.date] ?? '',
        checkIn: cells[indices.checkIn] ?? '',
        checkOut: cells[indices.checkOut] ?? '',
      }));
      const result = AttendanceService.importPunches(rows);
      setNotice(`تم استيراد ${result.imported} سجل، وأُرسل ${result.pendingApproval} سجل للموافقة.`);
      setImportErrors(result.errors);
      load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'تعذر قراءة ملف الاستيراد.');
    }
  };

  const exportReport = () => {
    try {
      const exportRowsData = AttendanceService.getMonthlyReportForExport(period);
      const header = ['التاريخ', 'كود الموظف', 'اسم الموظف', 'الوردية', 'الحالة', 'الدخول', 'الخروج',
        'ساعات العمل بالدقائق', 'التأخير بالدقائق', 'الانصراف المبكر بالدقائق', 'الاستراحة بالدقائق',
        'الإضافي بالدقائق', 'اعتماد الإضافي', 'المصدر', 'ملاحظات'];
      const rows = exportRowsData.map((record) => [
        record.date, record.employeeCode, record.employeeName, record.shiftName ?? '',
        STATUS_LABELS[record.status], formatClock(record.checkInAt), formatClock(record.checkOutAt),
        record.workedMinutes, record.lateMinutes, record.earlyLeaveMinutes, record.breakMinutes,
        record.overtimeMinutes, record.overtimeApproved ? 'معتمد' : 'غير معتمد', record.source, record.notes,
      ]);
      const content = `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
      const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `attendance-${period}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'تعذر تصدير تقرير الحضور.');
    }
  };

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'daily', label: 'اليومي' }, { id: 'schedules', label: 'الورديات والجداول' },
    { id: 'report', label: 'الكشف الشهري' }, { id: 'corrections', label: `التصحيحات والتدقيق (${requests.length})` },
    { id: 'import', label: 'استيراد البصمة' },
  ];

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center">
            <CalendarCheck className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-base font-black">الحضور والانصراف</h1>
            <p className="text-xs text-slate-500 font-medium">سجل زمني، ورديات، استراحات وتصحيحات معتمدة</p>
          </div>
        </div>
        {tab === 'daily' && canManage && (
          <button onClick={() => filtered.filter((employee) => !recordsByEmployee.has(employee.id)).forEach((employee) => {
            try { AttendanceService.saveManualRecord({ employeeId: employee.id, date, status: 'PRESENT' }); }
            catch (reason) { setError(reason instanceof Error ? reason.message : 'تعذر تسجيل الموظفين.'); }
          })} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold">
            تسجيل غير المسجلين حاضرين
          </button>
        )}
      </div>

      <div className="bg-white border-b border-slate-200 px-6 flex gap-2 overflow-auto">
        {tabs.map((item) => (
          <button key={item.id} onClick={() => changeTab(item.id)}
            className={`px-4 py-3 text-xs font-bold border-b-2 whitespace-nowrap ${tab === item.id ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {item.label}
          </button>
        ))}
      </div>

      {(error || notice) && (
        <div className={`mx-6 mt-3 px-4 py-2.5 rounded-xl border text-xs font-semibold ${error ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
          {error || notice}
        </div>
      )}

      {tab === 'daily' && (
        <>
          <div className="px-6 py-3 bg-white border-b border-slate-200 flex flex-wrap items-end gap-3">
            <label className="text-[10px] font-bold text-slate-500">التاريخ
              <input type="date" value={date} onChange={(event) => {
                setDate(event.target.value);
                setPeriod(event.target.value.slice(0, 7));
              }} className="mt-1 block px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold" />
            </label>
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="بحث باسم الموظف أو الوظيفة..."
                className="w-full pl-4 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm" />
            </div>
            <p className="text-xs text-amber-700">لا يوجد دوام مفروض تلقائيًا؛ يلزم تعيين وردية للموظف لحساب التأخير والانصراف المبكر.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-3 bg-white border-b border-slate-200">
            {(Object.keys(STATUS_LABELS) as AttendanceStatus[]).map((status) => (
              <div key={status} className={`rounded-xl border px-4 py-2 ${STATUS_COLORS[status]}`}>
                <div className="text-[10px] font-bold">{STATUS_LABELS[status]}</div>
                <div className="text-lg font-black mt-0.5">{filteredCount[status]}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="flex-1 overflow-auto p-6">
        {loading ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /></div> : (
          <>
            {tab === 'daily' && (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-right min-w-[1100px]">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>{['الموظف', 'الحالة', 'الدخول / الخروج', 'العمل والاستراحة', 'التأخير / المبكر', 'العمل الإضافي', 'إجراءات الوقت', 'تصحيح يدوي'].map((heading) =>
                        <th key={heading} className="px-3 py-3 text-xs font-bold text-slate-500">{heading}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filtered.map((employee) => {
                        const record = recordsByEmployee.get(employee.id);
                        const form = getForm(employee.id, record);
                        return (
                          <tr key={employee.id} className="align-top hover:bg-slate-50/70">
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-2">
                                <span className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500"><Users className="w-4 h-4" /></span>
                                <span><b className="block text-slate-800">{employee.name}</b><small className="text-slate-400">{employee.role}</small></span>
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              {record ? <span className={`text-[10px] px-2 py-1 rounded border font-bold ${STATUS_COLORS[record.status]}`}>{STATUS_LABELS[record.status]}</span>
                                : <span className="text-xs text-slate-400">لم يسجل</span>}
                              <div className="mt-1 text-[10px] text-slate-400">{record?.source ?? ''}</div>
                            </td>
                            <td className="px-3 py-3 font-mono text-xs">
                              <div>دخول: {formatClock(record?.checkInAt)}</div><div>خروج: {formatClock(record?.checkOutAt)}</div>
                            </td>
                            <td className="px-3 py-3 text-xs">
                              <div>{record ? formatMinutes(record.workedMinutes) : '—'} عمل</div>
                              <div className="text-slate-500">{record ? formatMinutes(record.breakMinutes) : '—'} استراحة</div>
                              {record && breaks.some((item) => item.attendanceId === record.id) && <details className="mt-1">
                                <summary className="cursor-pointer text-[10px] text-sky-700">تفاصيل الاستراحات</summary>
                                {breaks.filter((item) => item.attendanceId === record.id).map((item) => (
                                  <div key={item.id} className="mt-1 text-[10px] text-slate-500">
                                    {item.startedAt.slice(11, 16)}–{item.endedAt?.slice(11, 16) ?? 'مفتوحة'} ({item.minutes} د)
                                  </div>
                                ))}
                              </details>}
                            </td>
                            <td className="px-3 py-3 text-xs">
                              <div>{record?.lateMinutes ?? 0} د تأخير</div><div className="text-slate-500">{record?.earlyLeaveMinutes ?? 0} د مبكر</div>
                            </td>
                            <td className="px-3 py-3 text-xs">
                              <div>{record?.overtimeMinutes ?? 0} د</div>
                              {record?.overtimeMinutes ? record.overtimeApproved
                                ? <span className="text-emerald-700">معتمد للرواتب</span>
                                : <span className="text-amber-700">بانتظار الاعتماد</span> : null}
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex flex-wrap gap-1">
                                {!record?.checkInAt && <button disabled={!canManage || date !== today() || busy === employee.id}
                                  onClick={() => runAction(employee.id, () => AttendanceService.punchIn(employee.id))}
                                  className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-[10px] font-bold disabled:opacity-40"><Clock3 className="inline w-3 h-3 ml-1" />دخول</button>}
                                {!!record?.checkInAt && !record.checkOutAt && <button disabled={!canManage || date !== today() || busy === employee.id}
                                  onClick={() => runAction(employee.id, () => AttendanceService.punchOut(employee.id))}
                                  className="px-2 py-1 rounded-lg bg-rose-50 text-rose-700 text-[10px] font-bold disabled:opacity-40">انصراف</button>}
                                {!!record?.checkInAt && !record.checkOutAt && !record.activeBreak && <button disabled={!canManage || date !== today()}
                                  onClick={() => runAction(employee.id, () => AttendanceService.startBreak(employee.id))}
                                  className="px-2 py-1 rounded-lg bg-sky-50 text-sky-700 text-[10px] font-bold disabled:opacity-40"><Coffee className="inline w-3 h-3 ml-1" />استراحة</button>}
                                {!!record?.activeBreak && <button disabled={!canManage || date !== today()}
                                  onClick={() => runAction(employee.id, () => AttendanceService.endBreak(employee.id))}
                                  className="px-2 py-1 rounded-lg bg-amber-50 text-amber-700 text-[10px] font-bold disabled:opacity-40">إنهاء الاستراحة</button>}
                                {!!record?.overtimeMinutes && !record.overtimeApproved && canApprove && <button disabled={busy === record.id}
                                  onClick={() => runAction(record.id, () => AttendanceService.approveOvertime(record.id))}
                                  className="px-2 py-1 rounded-lg bg-violet-50 text-violet-700 text-[10px] font-bold">اعتماد الإضافي</button>}
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <details>
                                <summary className="cursor-pointer text-xs text-sky-700 font-bold">طلب تعديل</summary>
                                <div className="mt-2 grid grid-cols-2 gap-1.5 min-w-[230px]">
                                  <select value={form.status} onChange={(event) => updateForm(employee.id, record, 'status', event.target.value)}
                                    className="col-span-2 rounded border p-1 text-xs">
                                    {EDITABLE_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
                                  </select>
                                  <input aria-label="وقت الدخول" type="time" value={form.checkIn} onChange={(event) => updateForm(employee.id, record, 'checkIn', event.target.value)} className="rounded border p-1 text-xs" />
                                  <input aria-label="وقت الخروج" type="time" value={form.checkOut} onChange={(event) => updateForm(employee.id, record, 'checkOut', event.target.value)} className="rounded border p-1 text-xs" />
                                  <input aria-label="دقائق التأخير" type="number" min={0} value={form.late} onChange={(event) => updateForm(employee.id, record, 'late', event.target.value)} className="rounded border p-1 text-xs" placeholder="التأخير" />
                                  <input aria-label="دقائق الإضافي" type="number" min={0} value={form.overtime} onChange={(event) => updateForm(employee.id, record, 'overtime', event.target.value)} className="rounded border p-1 text-xs" placeholder="الإضافي" />
                                  <input value={form.notes} onChange={(event) => updateForm(employee.id, record, 'notes', event.target.value)} className="col-span-2 rounded border p-1 text-xs" placeholder="ملاحظات" />
                                  <button disabled={!canManage} onClick={() => runAction(employee.id, () => saveManual(employee, record))}
                                    className="col-span-2 rounded-lg bg-slate-900 px-2 py-1.5 text-xs font-bold text-white disabled:opacity-40">إرسال للموافقة</button>
                                </div>
                              </details>
                            </td>
                          </tr>
                        );
                      })}
                      {!filtered.length && <tr><td colSpan={8} className="py-12 text-center text-slate-400">لا يوجد موظفون مطابقون</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {tab === 'schedules' && (
              <div className="space-y-5">
                <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                  <h2 className="font-black flex items-center gap-2"><Settings2 className="w-4 h-4" />إنشاء وردية</h2>
                  <div className="grid md:grid-cols-3 gap-3">
                    <label className="text-xs text-slate-500">اسم الوردية<input value={newShift.name} onChange={(e) => setNewShift((s) => ({ ...s, name: e.target.value }))} className="mt-1 block w-full rounded-lg border p-2 text-slate-900" /></label>
                    <label className="text-xs text-slate-500">بداية<input type="time" value={newShift.startTime} onChange={(e) => setNewShift((s) => ({ ...s, startTime: e.target.value }))} className="mt-1 block w-full rounded-lg border p-2 text-slate-900" /></label>
                    <label className="text-xs text-slate-500">نهاية<input type="time" value={newShift.endTime} onChange={(e) => setNewShift((s) => ({ ...s, endTime: e.target.value }))} className="mt-1 block w-full rounded-lg border p-2 text-slate-900" /></label>
                    <label className="text-xs text-slate-500">مدة الاستراحة المتوقعة (دقيقة)<input type="number" min={0} value={newShift.breakMinutes} onChange={(e) => setNewShift((s) => ({ ...s, breakMinutes: Number(e.target.value) }))} className="mt-1 block w-full rounded-lg border p-2 text-slate-900" /></label>
                    <label className="text-xs text-slate-500">السماح بالتأخير (دقيقة)<input type="number" min={0} value={newShift.graceMinutes} onChange={(e) => setNewShift((s) => ({ ...s, graceMinutes: Number(e.target.value) }))} className="mt-1 block w-full rounded-lg border p-2 text-slate-900" /></label>
                    <label className="text-xs text-slate-500">مهلة بدء الإضافي (دقيقة)<input type="number" min={0} value={newShift.overtimeAfterMinutes} onChange={(e) => setNewShift((s) => ({ ...s, overtimeAfterMinutes: Number(e.target.value) }))} className="mt-1 block w-full rounded-lg border p-2 text-slate-900" /></label>
                  </div>
                  <div className="flex flex-wrap gap-3">{WEEKDAYS.map((day, index) => (
                    <label key={day} className="text-xs flex items-center gap-1"><input type="checkbox" checked={newShift.workdays.includes(index)}
                      onChange={(event) => setNewShift((s) => ({ ...s, workdays: event.target.checked ? [...s.workdays, index].sort() : s.workdays.filter((value) => value !== index) }))} />{day}</label>
                  ))}</div>
                  <button disabled={!canManage} onClick={() => runAction('shift', () => {
                    AttendanceService.saveShift(newShift);
                    setNewShift(emptyShift());
                  }, 'تم حفظ الوردية.')} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">حفظ الوردية</button>
                  <div className="divide-y">{shifts.map((shift) => (
                    <div key={shift.id} className="py-2 text-sm"><b>{shift.name}</b> · {shift.startTime}–{shift.endTime} · سماح {shift.graceMinutes} د · أيام: {shift.workdays.map((day) => WEEKDAYS[day]).join('، ')}</div>
                  ))}</div>
                </section>

                <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                  <h2 className="font-black">تعيين وردية لموظف</h2>
                  <div className="grid md:grid-cols-4 gap-2">
                    <select value={assignment.employeeId} onChange={(e) => setAssignment((s) => ({ ...s, employeeId: e.target.value }))} className="rounded-lg border p-2 text-xs">
                      <option value="">اختر الموظف</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
                    </select>
                    <select value={assignment.shiftId} onChange={(e) => setAssignment((s) => ({ ...s, shiftId: e.target.value }))} className="rounded-lg border p-2 text-xs">
                      <option value="">اختر الوردية</option>{shifts.filter((shift) => shift.isActive).map((shift) => <option key={shift.id} value={shift.id}>{shift.name}</option>)}
                    </select>
                    <input type="date" value={assignment.from} onChange={(e) => setAssignment((s) => ({ ...s, from: e.target.value }))} className="rounded-lg border p-2 text-xs" />
                    <input type="date" value={assignment.to} onChange={(e) => setAssignment((s) => ({ ...s, to: e.target.value }))} className="rounded-lg border p-2 text-xs" aria-label="تاريخ نهاية التعيين اختياري" />
                  </div>
                  <button disabled={!canManage} onClick={() => runAction('assignment', () => {
                    AttendanceService.assignShift(assignment.employeeId, assignment.shiftId, assignment.from, assignment.to || undefined);
                    setAssignment((s) => ({ ...s, employeeId: '', shiftId: '', to: '' }));
                  }, 'تم تعيين الوردية.')} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">تعيين الوردية</button>
                  <div className="divide-y">{assignments.map((item) => <div key={item.id} className="py-2 text-xs">{item.employeeName} · {item.shiftName} · {item.effectiveFrom} – {item.effectiveTo || 'مستمر'}</div>)}</div>
                </section>

                <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                  <h2 className="font-black">العطلات الرسمية للفرع</h2>
                  <div className="flex flex-wrap gap-2">
                    <input aria-label="تاريخ العطلة" type="date" value={holiday.date} onChange={(e) => setHoliday((s) => ({ ...s, date: e.target.value }))} className="rounded-lg border p-2 text-xs" />
                    <input aria-label="اسم العطلة" value={holiday.name} onChange={(e) => setHoliday((s) => ({ ...s, name: e.target.value }))} placeholder="اسم العطلة" className="rounded-lg border p-2 text-xs" />
                    <button disabled={!canManage} onClick={() => runAction('holiday', () => {
                      AttendanceService.addHoliday(holiday.date, holiday.name);
                      setHoliday((s) => ({ ...s, name: '' }));
                    }, 'تم تسجيل العطلة.')} className="rounded-lg bg-sky-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">إضافة عطلة</button>
                  </div>
                  {holidays.map((item) => <div key={item.id} className="flex items-center justify-between gap-2 text-xs text-slate-600">
                    <span>{item.date} · {item.name}</span>
                    {canManage && <button onClick={() => runAction(item.id, () => AttendanceService.removeHoliday(item.id), 'تم حذف العطلة.')} className="text-rose-700">حذف</button>}
                  </div>)}
                </section>
              </div>
            )}

            {tab === 'report' && (
              <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="p-4 flex flex-wrap items-center justify-between gap-3 border-b">
                  <label className="text-xs font-bold">الشهر<input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="mr-2 rounded-lg border p-2" /></label>
                  <div className="flex gap-2"><button onClick={exportReport} disabled={!canExport} title={canExport ? undefined : 'لا تملك صلاحية تصدير تقارير الحضور'} className="rounded-lg bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700 disabled:opacity-40"><Download className="inline w-3 h-3 ml-1" />تصدير CSV</button>
                    <button onClick={() => window.print()} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold">طباعة الكشف</button></div>
                  <div className="text-xs text-slate-500">{report.length} سجل · العطلات المسجلة: {holidays.length}</div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1000px] text-right text-xs">
                    <thead className="bg-slate-50"><tr>{['التاريخ', 'الموظف', 'الوردية', 'الحالة', 'الدخول', 'الخروج', 'العمل', 'التأخير', 'الانصراف المبكر', 'الاستراحة', 'الإضافي / الاعتماد'].map((label) => <th key={label} className="p-3">{label}</th>)}</tr></thead>
                    <tbody className="divide-y">{report.map((row) => <tr key={row.id}>
                      <td className="p-3">{row.date}</td><td className="p-3">{row.employeeName}</td><td className="p-3">{row.shiftName || '—'}</td>
                      <td className="p-3">{STATUS_LABELS[row.status]}</td><td className="p-3 font-mono">{formatClock(row.checkInAt)}</td><td className="p-3 font-mono">{formatClock(row.checkOutAt)}</td>
                      <td className="p-3">{formatMinutes(row.workedMinutes)}</td><td className="p-3">{row.lateMinutes} د</td><td className="p-3">{row.earlyLeaveMinutes} د</td>
                      <td className="p-3">{row.breakMinutes} د</td><td className="p-3">{row.overtimeMinutes} د · {row.overtimeApproved ? 'معتمد' : 'غير معتمد'}</td>
                    </tr>)}</tbody>
                  </table>
                  {!report.length && <div className="p-10 text-center text-slate-400">لا توجد سجلات لهذا الشهر.</div>}
                </div>
              </section>
            )}

            {tab === 'corrections' && (
              <div className="space-y-5">
                <section className="space-y-3">
                  <h2 className="font-black">طلبات التصحيح المعلقة</h2>
                  {requests.map((request) => {
                    const proposed = JSON.parse(request.proposedJson) as {
                      status: AttendanceStatus; checkInAt: string | null; checkOutAt: string | null; notes: string;
                    };
                    return <div key={request.id} className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="text-sm"><b>{request.employeeName}</b> · {request.attendanceDate}
                        <div className="text-xs text-slate-500 mt-1">الطلب من {request.requestedByName} · الدخول {formatClock(proposed.checkInAt)} · الخروج {formatClock(proposed.checkOutAt)} · {STATUS_LABELS[proposed.status]}</div>
                        {proposed.notes && <div className="text-xs text-slate-500">{proposed.notes}</div>}
                      </div>
                      {canApprove ? <div className="flex gap-2">
                        <button onClick={() => runAction(request.id, () => AttendanceService.decideCorrection(request.id, true), 'تم اعتماد التصحيح.')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white"><ShieldCheck className="inline w-3 h-3 ml-1" />اعتماد</button>
                        <button onClick={() => runAction(request.id, () => AttendanceService.decideCorrection(request.id, false), 'تم رفض التصحيح.')} className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">رفض</button>
                      </div> : <span className="text-xs text-amber-700">يتطلب اعتماد مستخدم مخول</span>}
                    </div>;
                  })}
                  {!requests.length && <div className="rounded-xl bg-white p-6 text-center text-slate-400">لا توجد طلبات معلقة.</div>}
                </section>
                <section className="space-y-3">
                  <h2 className="font-black">قرارات التصحيح للشهر المحدد</h2>
                  {correctionHistory.map((item) => {
                    const previous = item.beforeJson ? JSON.parse(item.beforeJson) as { checkInAt: string | null; checkOutAt: string | null; status: AttendanceStatus } : null;
                    const next = JSON.parse(item.proposedJson) as { checkInAt: string | null; checkOutAt: string | null; status: AttendanceStatus };
                    return <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-4 text-xs">
                      <b>{item.employeeName}</b> · {item.attendanceDate} ·
                      <span className={item.status === 'APPROVED' ? 'text-emerald-700' : 'text-rose-700'}>{item.status === 'APPROVED' ? 'معتمد' : 'مرفوض'}</span>
                      <div className="mt-1 text-slate-600">قبل: {previous ? `${STATUS_LABELS[previous.status]}، ${formatClock(previous.checkInAt)}–${formatClock(previous.checkOutAt)}` : 'لا يوجد سجل'} · بعد: {STATUS_LABELS[next.status]}، {formatClock(next.checkInAt)}–{formatClock(next.checkOutAt)}</div>
                      <div className="mt-1 text-slate-400">طلب {item.requestedByName} · قرار {item.decidedByName || '—'} · {item.decisionNotes || ''}</div>
                    </div>;
                  })}
                  {!correctionHistory.length && <div className="rounded-xl bg-white p-6 text-center text-slate-400">لا توجد قرارات تصحيح لهذا الشهر.</div>}
                </section>
                <section className="space-y-3">
                  <h2 className="font-black">سجل أحداث الحضور</h2>
                  {auditHistory.map((item) => (
                    <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-3 text-xs">
                      <b>{item.employeeName}</b> · {item.date} · {item.action} · بواسطة {item.actorName}
                      <div className="mt-1 text-slate-500">{item.createdAt}</div>
                    </div>
                  ))}
                  {!auditHistory.length && <div className="rounded-xl bg-white p-6 text-center text-slate-400">لا توجد أحداث مسجلة لهذا الشهر.</div>}
                </section>
              </div>
            )}

            {tab === 'import' && (
              <section className="max-w-3xl bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <h2 className="text-base font-black flex items-center gap-2"><FileUp className="w-5 h-5 text-sky-600" />استيراد سجلات جهاز البصمة</h2>
                <p className="text-sm text-slate-600">الملف CSV بترميز UTF-8 ويحتوي على الأعمدة employee_code,date,check_in,check_out. صيغة التاريخ YYYY-MM-DD والوقت HH:mm. السجلات السابقة أو المكررة تُرسل كطلبات تصحيح للموافقة، ولا يُعتمد الإضافي للرواتب تلقائيًا.</p>
                <button onClick={downloadTemplate} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold"><Download className="inline w-3 h-3 ml-1" />تنزيل القالب</button>
                <label className="block rounded-xl border-2 border-dashed border-slate-300 p-8 text-center cursor-pointer hover:border-sky-400">
                  <span className="block text-sm font-bold">اختر ملف CSV للاستيراد</span>
                  <input type="file" accept=".csv,text/csv" className="mt-3 text-xs" onChange={(event) => { void handleImport(event.target.files?.[0]); event.currentTarget.value = ''; }} />
                </label>
                {!!importErrors.length && <div className="max-h-64 overflow-auto rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{importErrors.map((item) => <div key={item}>{item}</div>)}</div>}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
};
