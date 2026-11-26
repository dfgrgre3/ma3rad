import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useDashboardRefresh } from '../../../contexts/DashboardRefreshContext';
import { useDashboardEmbed } from '../../../contexts/DashboardEmbedContext';
import {
  Users, Wallet, Calendar, Award, AlertCircle, Loader2, BriefcaseBusiness,
  RefreshCw, UserCheck, BarChart3, HardHat, Clock, UserX, CheckCircle2,
  DollarSign, Building2,
} from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { useNavigate } from 'react-router-dom';
import { EmployeeService, Employee, AttendanceStatus } from '../../../services/domains/hr/EmployeeService';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { BranchAccessService } from '../../../services/domains/auth/BranchAccessService';
import { localDateString } from '../../../utils/shared/date';
import { StatCard as UiStatCard } from '../../../components/ui/Card';


const statTone = (cls: string): 'default' | 'success' | 'danger' | 'warning' =>
  /rose|red|danger/.test(cls) ? 'danger' : /amber|orange/.test(cls) ? 'warning' : /emerald|green|success/.test(cls) ? 'success' : 'default';

function StatCard({ label, value, sub, icon: Icon, color, bg }: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color: string; bg: string;
}) {
  return (
    <UiStatCard
      label={label}
      value={value}
      hint={sub}
      icon={Icon ? <Icon className="h-5 w-5" /> : undefined}
      tone={statTone(color || bg || '')}
    />
  );
}
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

async function buildHrStats(): Promise<HrStats> {
  const employees = await EmployeeService.getAllAsync();
  const active = employees.filter(e => e.status === 'ACTIVE');
  const today = localDateString();

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
    `SELECT COALESCE(SUM(pt.amount), 0) / 100.0 AS total
     FROM payroll_transactions pt JOIN employees e ON e.id = pt.employee_id
     WHERE pt.type = 'ADVANCE' AND ${scope.clause}`, scope.params
  )[0];
  const payoutRow = db.query<{ total: number }>(
    `SELECT COALESCE(SUM(pt.amount), 0) / 100.0 AS total
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

function AttendanceMeter({ present, late, absent }: { present: number; late: number; absent: number }) {
  const total = present + late + absent;
  if (total === 0) return (
    <div className="bg-surface rounded-2xl border border-line p-5">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-black text-ink">حضور اليوم</h3>
      </div>
      <p className="text-xs text-muted text-center py-6">لم يتم تسجيل الحضور بعد</p>
    </div>
  );
  const pPct = Math.round((present / total) * 100);
  const lPct = Math.round((late / total) * 100);
  const aPct = 100 - pPct - lPct;

  return (
    <div className="bg-surface rounded-2xl border border-line p-5">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-black text-ink">حضور اليوم</h3>
        <span className="text-xs bg-accent-soft text-primary border border-accent-border px-2 py-0.5 rounded-full font-bold">{total} موظف</span>
      </div>
      {/* Bar */}
      <div className="h-6 rounded-full overflow-hidden flex mb-4">
        {pPct > 0 && <div className="bg-success h-full transition-all duration-700" style={{ width: `${pPct}%` }} />}
        {lPct > 0 && <div className="bg-warning h-full transition-all duration-700" style={{ width: `${lPct}%` }} />}
        {aPct > 0 && <div className="bg-danger h-full transition-all duration-700" style={{ width: `${aPct}%` }} />}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: 'حضر', count: present, color: 'text-success', dot: 'bg-success' },
          { label: 'متأخر', count: late, color: 'text-warning', dot: 'bg-warning' },
          { label: 'غائب', count: absent, color: 'text-danger', dot: 'bg-danger' },
        ].map(item => (
          <div key={item.label} className="text-center">
            <div className={`w-3 h-3 rounded-full ${item.dot} mx-auto mb-1`} />
            <p className={`text-lg font-black ${item.color}`}>{item.count}</p>
            <p className="text-xs text-muted">{item.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoleBreakdown({ roles }: { roles: { role: string; count: number; salary: number }[] }) {
  const max = Math.max(...roles.map(r => r.count), 1);
  const colors = ['bg-primary', 'bg-primary', 'bg-success', 'bg-warning', 'bg-warning', 'bg-primary'];

  return (
    <div className="bg-surface rounded-2xl border border-line p-5">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-black text-ink">الموظفون حسب الدور الوظيفي</h3>
      </div>
      {roles.length === 0 ? (
        <p className="text-xs text-muted text-center py-6">لا توجد بيانات</p>
      ) : (
        <div className="space-y-3">
          {roles.map((r, i) => {
            const pct = Math.round((r.count / max) * 100);
            return (
              <div key={r.role} className="flex items-center gap-3">
                <span className="text-xs text-ink-secondary w-24 shrink-0 font-medium truncate">{r.role}</span>
                <div className="flex-1 bg-surface-sunken rounded-full h-4 overflow-hidden">
                  <div className={`h-full rounded-full ${colors[i % colors.length]} transition-all duration-700`}
                    style={{ width: `${Math.max(pct, 5)}%` }} />
                </div>
                <span className="text-xs font-bold text-ink w-6 text-center">{r.count}</span>
                <span className="text-xs text-muted w-20 text-left">{fmtK(r.salary)} ج/ش</span>
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
  const colors = ['bg-primary', 'bg-primary', 'bg-success', 'bg-warning', 'bg-warning', 'bg-primary'];
  const textColors = ['text-primary', 'text-primary', 'text-success', 'text-warning', 'text-warning', 'text-primary'];

  return (
    <div className="bg-surface rounded-2xl border border-line p-5">
      <div className="flex items-center gap-2 mb-4">
        <Building2 className="w-4 h-4 text-success" />
        <h3 className="text-sm font-black text-ink">توزيع الموظفين حسب الفرع/الموقع</h3>
      </div>
      {locations.length === 0 ? (
        <p className="text-xs text-muted text-center py-6">لا توجد بيانات</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {locations.slice(0, 6).map((l, i) => {
            const pct = total > 0 ? Math.round((l.count / total) * 100) : 0;
            return (
              <div key={l.location} className="flex items-center gap-2.5 p-3 bg-surface-muted rounded-xl border border-line">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${colors[i % colors.length]} bg-opacity-10`}>
                  <Building2 className={`w-4 h-4 ${textColors[i % textColors.length]}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-ink truncate">{l.location}</p>
                  <p className={`text-sm font-black ${textColors[i % textColors.length]}`}>{l.count} <span className="text-xs text-muted font-normal">({pct}%)</span></p>
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
  const refreshToken = useDashboardRefresh()?.refreshToken;
  const embedded = useDashboardEmbed();
  const initialRef = useRef(true);
  const navigate = useNavigate();
  const user = AuthService.getCurrentUser();
  const _canManage = PermissionService.can(user, 'ui.employees.employees.manage');
  const canViewRecruitment = PermissionService.can(user, 'ui.hr.recruitment.view');
  const [stats, setStats] = useState<HrStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStats(await buildHrStats());
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل إحصاءات الموارد البشرية.');
    } finally {
      setLoading(false);
    }
  }, [setLoading, setStats, setError]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (refreshToken === undefined) return;
    if (initialRef.current) { initialRef.current = false; return; }
    load();
  }, [refreshToken, load]);

  return (
    <div className="h-full flex flex-col bg-surface-muted text-ink overflow-hidden">
      {/* Header */}
      {embedded ? (
        <div className="flex flex-wrap items-center justify-end gap-2 px-4 pt-3 flex-shrink-0">
          <button onClick={() => navigate('/employees')} className="text-xs font-bold text-white bg-success hover:bg-success transition px-3 py-1.5 rounded-lg flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> إدارة الموظفين
          </button>
          <button onClick={() => navigate('/employees/attendance')} className="text-xs font-bold text-primary bg-accent-soft hover:bg-accent-soft transition px-3 py-1.5 rounded-lg flex items-center gap-1.5 border border-accent-border">
            <Clock className="w-3.5 h-3.5" /> الحضور
          </button>
          {canViewRecruitment && (
            <button onClick={() => navigate('/employees/recruitment')} className="text-xs font-bold text-primary bg-accent-soft hover:bg-accent-soft transition px-3 py-1.5 rounded-lg flex items-center gap-1.5 border border-accent-border">
              <BriefcaseBusiness className="w-3.5 h-3.5" /> التوظيف
            </button>
          )}
          <button onClick={load} className="p-1.5 hover:bg-surface-sunken rounded-lg transition">
            <RefreshCw className={`w-4 h-4 text-muted ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      ) : (
      <div className="bg-surface px-6 pt-4 flex-shrink-0">
        <PageHeader
          icon={<HardHat className="h-5 w-5" />}
          title="لوحة تحكم الموارد البشرية"
          description="الموظفون والرواتب والحضور والأداء"
          actions={<>
            <button onClick={() => navigate('/employees')} className="text-xs font-bold text-white bg-success hover:bg-success transition px-3 py-2 rounded-lg flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> إدارة الموظفين
            </button>
            <button onClick={() => navigate('/employees/attendance')} className="text-xs font-bold text-primary bg-accent-soft hover:bg-accent-soft transition px-3 py-2 rounded-lg flex items-center gap-1.5 border border-accent-border">
              <Clock className="w-3.5 h-3.5" /> الحضور
            </button>
            {canViewRecruitment && (
              <button onClick={() => navigate('/employees/recruitment')} className="text-xs font-bold text-primary bg-accent-soft hover:bg-accent-soft transition px-3 py-2 rounded-lg flex items-center gap-1.5 border border-accent-border">
                <BriefcaseBusiness className="w-3.5 h-3.5" /> التوظيف
              </button>
            )}
            <button onClick={load} className="p-2 hover:bg-surface-sunken rounded-lg transition">
              <RefreshCw className={`w-4 h-4 text-muted ${loading ? 'animate-spin' : ''}`} />
            </button>
          </>}
        />
      </div>
      )}

      {error && (
        <div className="mx-6 mt-3 px-4 py-3 bg-danger-soft border border-danger-border rounded-xl text-danger text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-success" />
        </div>
      ) : stats ? (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* KPI Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="إجمالي الموظفين"
              value={fmt(stats.total)}
              sub={`${stats.active} نشط • ${stats.onLeave} إجازة`}
              icon={Users} color="text-success" bg="bg-success-soft"
            />
            <StatCard
              label="إجمالي الرواتب الشهرية"
              value={fmtK(stats.totalMonthlySalary) + ' ج'}
              sub={`للموظفين النشطين`}
              icon={Wallet} color="text-success" bg="bg-success-soft"
            />
            <StatCard
              label="معدل الحضور اليوم"
              value={stats.attendanceRate + '%'}
              sub={`${stats.todayPresent} حضر • ${stats.todayAbsent} غائب`}
              icon={CheckCircle2} color="text-primary" bg="bg-accent-soft"
            />
            <StatCard
              label="سلف مُسجَّلة"
              value={fmtK(stats.advancesPending) + ' ج'}
              sub={`إجمالي السلف`}
              icon={DollarSign} color="text-warning" bg="bg-warning-soft"
            />
          </div>

          {/* Status Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'موظفون نشطون', value: stats.active, color: 'text-success bg-success-soft border-success-border', icon: UserCheck, to: '/employees' },
              { label: 'في إجازة', value: stats.onLeave, color: 'text-warning bg-warning-soft border-warning-border', icon: Calendar, to: '/employees/attendance' },
              { label: 'موقوفون', value: stats.suspended, color: 'text-danger bg-danger-soft border-danger-border', icon: UserX, to: '/employees' },
              { label: 'حضروا اليوم', value: stats.todayPresent + stats.todayLate, color: 'text-primary bg-accent-soft border-accent-border', icon: Clock, to: '/employees/attendance' },
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'الموظفون', desc: 'إضافة وإدارة بيانات الموظفين', icon: Users, to: '/employees', color: 'from-success to-success' },
              { label: 'الحضور والانصراف', desc: 'تسجيل ومتابعة الحضور', icon: Clock, to: '/employees/attendance', color: 'from-primary to-primary' },
              { label: 'الرواتب والمسحوبات', desc: 'صرف الرواتب والسلف والحسومات', icon: Wallet, to: '/employees/payroll', color: 'from-success to-success' },
              { label: 'عمولات المبيعات', desc: 'حساب وتوزيع العمولات', icon: Award, to: '/employees/commissions', color: 'from-warning to-warning' },
              ...(canViewRecruitment ? [{ label: 'التوظيف والمرشحون', desc: 'الوظائف الشاغرة حتى ربط الموظف الجديد', icon: BriefcaseBusiness, to: '/employees/recruitment', color: 'from-primary to-primary' }] : []),
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
