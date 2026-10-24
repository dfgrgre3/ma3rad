import React, { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Loader2, CheckCheck, Users, Search } from 'lucide-react';
import { EmployeeService, Employee, AttendanceStatus } from '../../services/EmployeeService';
import { AuthService } from '../../services/AuthService';
import { localDateString } from '../../utils/date';

const STATUS_LABELS: Record<AttendanceStatus, string> = { PRESENT: 'حاضر', LATE: 'متأخر', ABSENT: 'غائب', LEAVE: 'إجازة' };
const STATUS_COLORS: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  LATE: 'bg-amber-50 text-amber-700 border-amber-200',
  ABSENT: 'bg-rose-50 text-rose-700 border-rose-200',
  LEAVE: 'bg-sky-50 text-sky-700 border-sky-200',
};
const today = () => localDateString();

export const AttendancePage: React.FC = () => {
  const [date, setDate] = useState(today());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    try {
      const list = EmployeeService.getAll().filter((e) => e.status !== 'SUSPENDED');
      setEmployees(list);
      const records = EmployeeService.getAttendanceByDate(date);
      const map: Record<string, AttendanceStatus> = {};
      records.forEach((r) => { map[r.employeeId] = r.status; });
      setStatuses(map);
      setError(null);
    } catch (e: any) { setError(e?.message || 'تعذر تحميل الحضور.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [date]);

  const filtered = employees.filter((e) => !search.trim() || e.name.includes(search) || e.role.includes(search));

  const counts = useMemo(() => {
    const result: Record<AttendanceStatus, number> = { PRESENT: 0, LATE: 0, ABSENT: 0, LEAVE: 0 };
    employees.forEach((e) => { const s = statuses[e.id]; if (s) result[s] += 1; });
    return result;
  }, [employees, statuses]);

  const setStatus = (employee: Employee, status: AttendanceStatus) => {
    setSavingId(employee.id);
    try {
      EmployeeService.upsertAttendance({
        employeeId: employee.id,
        date,
        status,
        recordedBy: AuthService.getCurrentUser()?.id || 'usr_admin',
      });
      setStatuses((prev) => ({ ...prev, [employee.id]: status }));
    } catch (err: any) { alert(err?.message || 'تعذر تسجيل الحضور.'); }
    finally { setSavingId(null); }
  };

  const markAllPresent = () => {
    if (!confirm(`تسجيل جميع الموظفين الحاضرين (${filtered.length}) بتاريخ ${date}؟`)) return;
    try {
      filtered.forEach((employee) => {
        EmployeeService.upsertAttendance({ employeeId: employee.id, date, status: 'PRESENT', recordedBy: AuthService.getCurrentUser()?.id || 'usr_admin' });
      });
      load();
    } catch (err: any) { alert(err?.message || 'تعذر تسجيل الحضور الجماعي.'); }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center"><CalendarCheck className="w-5 h-5 text-emerald-600" /></div>
          <div>
            <h1 className="text-base font-black">الحضور والانصراف</h1>
            <p className="text-xs text-slate-500 font-medium">تسجيل الحضور اليومي للموظفين ومتابعة الغياب والتأخير</p>
          </div>
        </div>
        <button onClick={markAllPresent} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition shrink-0">
          <CheckCheck className="w-4 h-4" /> تسجيل الكل حاضراً
        </button>
      </div>

      <div className="px-6 py-3 bg-white border-b border-slate-200 flex flex-wrap items-center gap-3">
        <div>
          <label className="block text-[10px] font-bold text-slate-500 mb-1">تاريخ اليوم</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold" />
        </div>
        <form onSubmit={(e) => e.preventDefault()} className="relative flex-1 min-w-[220px] max-w-sm sm:mt-4">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث باسم الموظف أو الوظيفة..." className="w-full pl-4 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-400" />
        </form>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-6 py-3 bg-white border-b border-slate-200">
        {(Object.keys(STATUS_LABELS) as AttendanceStatus[]).map((s) => (
          <div key={s} className={`rounded-xl border px-4 py-2 ${STATUS_COLORS[s]}`}>
            <div className="text-[10px] font-bold">{STATUS_LABELS[s]}</div>
            <div className="text-lg font-black mt-0.5">{counts[s]}</div>
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-6">
        {error && <div className="mb-3 px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{error}</div>}
        {loading ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /></div> : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm text-right">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>{['الموظف', 'الوظيفة', 'الموقع', 'الحالة المسجلة', 'تسجيل الحالة'].map((h) => <th key={h} className="px-4 py-3 text-xs font-bold text-slate-500">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((employee) => {
                  const status = statuses[employee.id];
                  return (
                    <tr key={employee.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500"><Users className="w-4 h-4" /></div>
                          <div>
                            <div className="font-bold text-slate-800">{employee.name}</div>
                            <div className="text-[10px] text-slate-400">{employee.phone}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{employee.role}</td>
                      <td className="px-4 py-3 text-slate-500">{employee.location || '—'}</td>
                      <td className="px-4 py-3">
                        {status ? <span className={`text-[10px] px-2 py-1 rounded border font-bold ${STATUS_COLORS[status]}`}>{STATUS_LABELS[status]}</span> : <span className="text-[10px] text-slate-400">لم يسجل</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {(Object.keys(STATUS_LABELS) as AttendanceStatus[]).map((s) => (
                            <button key={s} onClick={() => setStatus(employee, s)} disabled={savingId === employee.id}
                              className={`text-[10px] px-2 py-1 rounded-lg border font-bold transition ${status === s ? STATUS_COLORS[s] : 'bg-white border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-50'}`}>
                              {STATUS_LABELS[s]}
                            </button>
                          ))}
                          {savingId === employee.id && <Loader2 className="w-3 h-3 animate-spin text-emerald-500 mr-1" />}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && <tr><td colSpan={5} className="py-16 text-center text-slate-400">لا يوجد موظفون مطابقون</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
