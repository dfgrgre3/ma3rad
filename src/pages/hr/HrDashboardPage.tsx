import React, { useEffect, useMemo, useState } from 'react';
import {
  Users, TrendingUp, Wallet, Clock, Calendar, Award, AlertCircle, Loader2,
  RefreshCw, UserCheck, UserX, BarChart3, Activity, ArrowUpRight, HardHat,
  DollarSign, CheckCircle2, Percent, Building2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { EmployeeService, Employee, AttendanceStatus } from '../../services/EmployeeService';
import { DatabaseManager } from '../../database/db';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import { BranchAccessService } from '../../services/BranchAccessService';

const db = DatabaseManager.getInstance();
const branchAccess = new BranchAccessService();
const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 0 }).format(n);
const fmtK = (n: number) => n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + 'م' : n >= 1000 ? (n / 1000).toFixed(1) + 'ك' : fmt(n);

interface HrStats {
  total: number;
  active: number;
  onLeave: number;
  suspended: number;
  totalMonthlySalary: number;
  todayPresent: number;
  todayAbsent: number;
  todayLate: number;
  attendanceRate: number;
  byLocation: { location: string; count: number }[];
  byRole: { role: string; count: number; salary: number }[];
  recentEmployees: Employee[];
  advancesPending: number;
  salaryDue: number;
}

function buildHrStats(): HrStats {
  const employees = EmployeeService.getAll();
  const active = employees.filter(e => e.status === 'ACTIVE');
  const today = new Date().toISOString().split('T')[0];

  const scope = branchAccess.sqlScope('e.branch_id');
  const todayAttendance = db.query<{ status: AttendanceStatus; count: number }>(
    `SELECT a.status, COUNT(*) AS count
     FROM attendance a JOIN employees e ON e.id = a.employee_id
     WHERE a.date = ? AND ${scope.clause} GROUP BY a.status`, [today, ...scope.params]
  );
  const todayPresent = todayAttendance.find(r => r.status === 'PRESENT')?.count || 0;
  const todayAbsent = todayAttendance.find(r => r.status === 'ABSENT')?.count || 0;
  const todayLate = todayAttendance.find(r => r.status === 'LATE')?.count || 0;
  const totalTracked = todayPresent + todayAbsent + todayLate;
  const attendanceRate = totalTracked > 0 ? Math.round(((todayPresent + todayLate) / totalTracked) * 100) : 0;

  const totalMonthlySalary = active.reduce((s, e) => s + (e.baseSalary || 0), 0);

  // Advances pending
  const advanceRow = db.query<{ total: number }>(
    `SELECT COALESCE(SUM(pt.amount), 0) AS total
     FROM payroll_transactions pt JOIN employees e ON e.id = pt.employee_id
     WHERE pt.type = 'ADVANCE' AND ${scope.clause}`, scope.params
  )[0];
  const payoutRow = db.query<{ total: number }>(
    `SELECT COALESCE(SUM(pt.amount), 0) AS total
     FROM payroll_transactions pt JOIN employees e ON e.id = pt.employee_id
     WHERE pt.type = 'SALARY_PAYOUT' AND ${scope.clause}`, scope.params
  )[0];
  const advancesPending = (advanceRow?.total || 0);

  // By location
  const locMap: Record<string, number> = {};
  employees.forEach(e => {
    const loc = e.location || 'غير محدد';
    locMap[loc] = (locMap[loc] || 0) + 1;
  });
  const byLocation = Object.entries(locMap).map(([location, count]) => ({ location, count })).sort((a, b) => b.count - a.count);

  // By role
  const roleMap: Record<string, { count: number; salary: number }> = {};
  active.forEach(e => {
    const r = e.role || 'غير محدد';
    if (!roleMap[r]) roleMap[r] = { count: 0, salary: 0 };
    roleMap[r].count++;
    roleMap[r].salary += e.baseSalary || 0;
  });
  const byRole = Object.entries(roleMap).map(([role, d]) => ({ role, ...d })).sort((a, b) => b.count - a.count).slice(0, 6);

  return {
    total: employees.length,
    active: active.length,
    onLeave: employees.filter(e => e.status === 'ON_LEAVE').length,
    suspended: employees.filter(e => e.status === 'SUSPENDED').length,
    totalMonthlySalary,
    todayPresent,
    todayAbsent,
    todayLate,
    attendanceRate,
    byLocation,
    byRole,
    recentEmployees: employees.slice(0, 6),
    advancesPending,
    salaryDue: payoutRow?.total || 0,
  };
}

function StatCard({ label, value, sub, icon: Icon, color, bg }: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color: string; bg: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-start gap-4 hover:shadow-md transition-shadow">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${bg}`}>
        <Icon className={`w-6 h-6 ${color}`} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 font-medium">{label}</p>
        <p className="text-2xl font-black text-slate-900 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function AttendanceMeter({ present, late, absent }: { present: number; late: number; absent: number }) {
  const total = present + late + absent;
  if (total === 0) return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-4 h-4 text-sky-500" />
        <h3 className="text-sm font-black text-slate-900">حضور اليوم</h3>
      </div>
      <p className="text-xs text-slate-400 text-center py-6">لم يتم تسجيل الحضور بعد</p>
    </div>
  );
  const pPct = Math.round((present / total) * 100);
  const lPct = Math.round((late / total) * 100);
  const aPct = 100 - pPct - lPct;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-4 h-4 text-sky-500" />
        <h3 className="text-sm font-black text-slate-900">حضور اليوم</h3>
        <span className="text-xs bg-sky-50 text-sky-600 border border-sky-200 px-2 py-0.5 rounded-full font-bold">{total} موظف</span>
      </div>
      {/* Bar */}
      <div className="h-6 rounded-full overflow-hidden flex mb-4">
        {pPct > 0 && <div className="bg-emerald-500 h-full transition-all duration-700" style={{ width: `${pPct}%` }} />}
        {lPct > 0 && <div className="bg-amber-400 h-full transition-all duration-700" style={{ width: `${lPct}%` }} />}
        {aPct > 0 && <div className="bg-rose-400 h-full transition-all duration-700" style={{ width: `${aPct}%` }} />}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'حضر', count: present, color: 'text-emerald-600', dot: 'bg-emerald-500' },
          { label: 'متأخر', count: late, color: 'text-amber-600', dot: 'bg-amber-400' },
          { label: 'غائب', count: absent, color: 'text-rose-600', dot: 'bg-rose-400' },
        ].map(item => (
          <div key={item.label} className="text-center">
            <div className={`w-3 h-3 rounded-full ${item.dot} mx-auto mb-1`} />
            <p className={`text-lg font-black ${item.color}`}>{item.count}</p>
            <p className="text-xs text-slate-400">{item.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoleBreakdown({ roles }: { roles: { role: string; count: number; salary: number }[] }) {
  const max = Math.max(...roles.map(r => r.count), 1);
  const colors = ['bg-sky-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500', 'bg-orange-500', 'bg-pink-500'];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-4 h-4 text-violet-500" />
        <h3 className="text-sm font-black text-slate-900">الموظفون حسب الدور الوظيفي</h3>
      </div>
      {roles.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-6">لا توجد بيانات</p>
      ) : (
        <div className="space-y-3">
          {roles.map((r, i) => {
            const pct = Math.round((r.count / max) * 100);
            return (
              <div key={r.role} className="flex items-center gap-3">
                <span className="text-xs text-slate-600 w-24 shrink-0 font-medium truncate">{r.role}</span>
                <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
                  <div className={`h-full rounded-full ${colors[i % colors.length]} transition-all duration-700`}
                    style={{ width: `${Math.max(pct, 5)}%` }} />
                </div>
                <span className="text-xs font-bold text-slate-700 w-6 text-center">{r.count}</span>
                <span className="text-xs text-slate-400 w-20 text-left">{fmtK(r.salary)} ج/ش</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LocationChart({ locations }: { locations: { location: string; count: number }[] }) {
  const total = locations.reduce((s, l) => s + l.count, 0);
  const colors = ['bg-sky-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500', 'bg-orange-500', 'bg-pink-500'];
  const textColors = ['text-sky-600', 'text-violet-600', 'text-emerald-600', 'text-amber-600', 'text-orange-600', 'text-pink-600'];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Building2 className="w-4 h-4 text-emerald-500" />
        <h3 className="text-sm font-black text-slate-900">توزيع الموظفين حسب الفرع/الموقع</h3>
      </div>
      {locations.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-6">لا توجد بيانات</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {locations.slice(0, 6).map((l, i) => {
            const pct = total > 0 ? Math.round((l.count / total) * 100) : 0;
            return (
              <div key={l.location} className="flex items-center gap-2.5 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${colors[i % colors.length]} bg-opacity-10`}>
                  <Building2 className={`w-4 h-4 ${textColors[i % textColors.length]}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 truncate">{l.location}</p>
                  <p className={`text-sm font-black ${textColors[i % textColors.length]}`}>{l.count} <span className="text-xs text-slate-400 font-normal">({pct}%)</span></p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export const HrDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const user = AuthService.getCurrentUser();
  const canManage = PermissionService.can(user, 'employees.manage');
  const [stats, setStats] = useState<HrStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    try {
      setStats(buildHrStats());
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل إحصاءات الموارد البشرية.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center shadow">
            <HardHat className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-black text-slate-900">لوحة تحكم الموارد البشرية</h1>
            <p className="text-xs text-slate-400">الموظفون والرواتب والحضور والأداء</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/employees')} className="text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 transition px-3 py-2 rounded-lg flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> إدارة الموظفين
          </button>
          <button onClick={() => navigate('/employees/attendance')} className="text-xs font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 transition px-3 py-2 rounded-lg flex items-center gap-1.5 border border-sky-200">
            <Clock className="w-3.5 h-3.5" /> الحضور
          </button>
          <button onClick={load} className="p-2 hover:bg-slate-100 rounded-lg transition">
            <RefreshCw className={`w-4 h-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-3 px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
        </div>
      ) : stats ? (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* KPI Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="إجمالي الموظفين"
              value={fmt(stats.total)}
              sub={`${stats.active} نشط • ${stats.onLeave} إجازة`}
              icon={Users} color="text-teal-600" bg="bg-teal-50"
            />
            <StatCard
              label="إجمالي الرواتب الشهرية"
              value={fmtK(stats.totalMonthlySalary) + ' ج'}
              sub={`للموظفين النشطين`}
              icon={Wallet} color="text-emerald-600" bg="bg-emerald-50"
            />
            <StatCard
              label="معدل الحضور اليوم"
              value={stats.attendanceRate + '%'}
              sub={`${stats.todayPresent} حضر • ${stats.todayAbsent} غائب`}
              icon={CheckCircle2} color="text-sky-600" bg="bg-sky-50"
            />
            <StatCard
              label="سلف مُسجَّلة"
              value={fmtK(stats.advancesPending) + ' ج'}
              sub={`إجمالي السلف`}
              icon={DollarSign} color="text-amber-600" bg="bg-amber-50"
            />
          </div>

          {/* Status Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'موظفون نشطون', value: stats.active, color: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: UserCheck, to: '/employees' },
              { label: 'في إجازة', value: stats.onLeave, color: 'text-amber-700 bg-amber-50 border-amber-200', icon: Calendar, to: '/employees/attendance' },
              { label: 'موقوفون', value: stats.suspended, color: 'text-rose-700 bg-rose-50 border-rose-200', icon: UserX, to: '/employees' },
              { label: 'حضروا اليوم', value: stats.todayPresent + stats.todayLate, color: 'text-sky-700 bg-sky-50 border-sky-200', icon: Clock, to: '/employees/attendance' },
            ].map(item => (
              <button
                key={item.label}
                onClick={() => navigate(item.to)}
                className={`flex items-center gap-3 p-4 rounded-2xl border text-right hover:shadow-md transition-shadow ${item.color}`}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                <div>
                  <p className="text-xl font-black">{item.value}</p>
                  <p className="text-xs font-medium opacity-80">{item.label}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Middle Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <AttendanceMeter present={stats.todayPresent} late={stats.todayLate} absent={stats.todayAbsent} />
            <RoleBreakdown roles={stats.byRole} />
          </div>

          <LocationChart locations={stats.byLocation} />

          {/* Navigation Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'الموظفون', desc: 'إضافة وإدارة بيانات الموظفين', icon: Users, to: '/employees', color: 'from-teal-500 to-emerald-600' },
              { label: 'الحضور والانصراف', desc: 'تسجيل ومتابعة الحضور', icon: Clock, to: '/employees/attendance', color: 'from-sky-500 to-blue-600' },
              { label: 'الرواتب والمسحوبات', desc: 'صرف الرواتب والسلف والحسومات', icon: Wallet, to: '/employees/payroll', color: 'from-emerald-500 to-green-600' },
              { label: 'عمولات المبيعات', desc: 'حساب وتوزيع العمولات', icon: Award, to: '/employees/commissions', color: 'from-amber-500 to-orange-600' },
            ].map(card => (
              <button
                key={card.to}
                onClick={() => navigate(card.to)}
                className={`bg-gradient-to-br ${card.color} text-white rounded-2xl p-4 text-right hover:opacity-90 hover:shadow-lg transition-all`}
              >
                <card.icon className="w-6 h-6 mb-2 opacity-90" />
                <p className="text-sm font-black">{card.label}</p>
                <p className="text-xs opacity-70 mt-0.5">{card.desc}</p>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};
