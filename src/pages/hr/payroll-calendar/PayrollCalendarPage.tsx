import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calendar, Printer, FileDown, Loader2, AlertTriangle, ChevronRight, Wallet,
  CheckCircle2, Clock, Plus, Banknote, RotateCw, Activity, X,
} from 'lucide-react';
import { PayrollCalendarService, PayrollCalendarEventView, PayrollCalendarMonthView } from '../../../services/domains/hr/PayrollCalendarService';
import { EmployeeService, PayrollRun } from '../../../services/domains/hr/EmployeeService';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { fmt } from '../../../pages/operations/payroll/payrollDisplay';
import { localDateString, addLocalDays } from '../../../utils/shared/date';

const MONTH_NAMES_AR: Record<number, string> = {
  1: 'يناير', 2: 'فبراير', 3: 'مارس', 4: 'أبريل', 5: 'مايو', 6: 'يونيو',
  7: 'يوليو', 8: 'أغسطس', 9: 'سبتمبر', 10: 'أكتوبر', 11: 'نوفمبر', 12: 'ديسمبر',
};

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  SCHEDULED: { label: 'مُدرج للصرف', color: 'text-slate-700', bg: 'bg-slate-100' },
  PARTIALLY_PAID: { label: 'دفعة جزئية', color: 'text-amber-700', bg: 'bg-amber-100' },
  PAID: { label: 'مُصرف بالكامل', color: 'text-emerald-700', bg: 'bg-emerald-100' },
  OVERDUE: { label: 'متأخر', color: 'text-rose-700', bg: 'bg-rose-100' },
  CANCELLED: { label: 'ملغي', color: 'text-slate-500', bg: 'bg-slate-200' },
};

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function parsePeriod(period: string): { year: number; month: number } {
  const [y, m] = period.split('-').map(Number);
  return { year: y, month: m };
}

export const PayrollCalendarPage: React.FC = () => {
  const actor = AuthService.getCurrentUser();
  const canView = PermissionService.canAny(actor, [
    'employees.payroll.view', 'employees.payroll.manage', 'employees.payroll.approve', 'employees.view',
  ]);
  const canManage = PermissionService.canAny(actor, [
    'employees.payroll.manage', 'employees.payroll.approve', 'employees.manage',
  ]);

  const now = new Date();
  const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [period, setPeriod] = useState<string>(defaultPeriod);
  const [view, setView] = useState<PayrollCalendarMonthView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overdue, setOverdue] = useState<{
    overdueEvents: PayrollCalendarEventView[];
    missingPayments: Array<{
      period: string; employeeId: string; employeeName: string;
      expectedAmount: number; paidAmount: number; difference: number;
      dueDate: string; daysOverdue: number;
    }>;
    totals: { expected: number; paid: number; missing: number };
  } | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [runDetail, setRunDetail] = useState<PayrollRun | null>(null);

  const { year, month } = useMemo(() => parsePeriod(period), [period]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    try {
      const svc = new PayrollCalendarService();
      const monthView = svc.getCalendarMonth(year, month);
      setView(monthView);
      try {
        setOverdue(svc.getOverdueAndMissing());
      } catch (overdueErr) {
        console.warn('Failed to load overdue data:', overdueErr);
        setOverdue(null);
      }
    } catch (e: any) {
      console.error('PayrollCalendar load error:', e);
      setError(e?.message || 'تعذر تحميل تقويم الرواتب.');
      setView(null);
      setOverdue(null);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    load();
  }, [load]);

  const prevMonth = useCallback(() => {
    setPeriod(current => {
      const [y, m] = current.split('-').map(Number);
      const newMonth = m === 1 ? 12 : m - 1;
      const newYear = m === 1 ? y - 1 : y;
      return `${newYear}-${String(newMonth).padStart(2, '0')}`;
    });
  }, []);

  const nextMonth = useCallback(() => {
    setPeriod(current => {
      const [y, m] = current.split('-').map(Number);
      const newMonth = m === 12 ? 1 : m + 1;
      const newYear = m === 12 ? y + 1 : y;
      return `${newYear}-${String(newMonth).padStart(2, '0')}`;
    });
  }, []);

  const goToToday = useCallback(() => {
    const today = new Date();
    setPeriod(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`);
  }, []);

  const currentPeriod = period;
  const [monthName] = [MONTH_NAMES_AR[month]];

  const runForPeriod = useMemo(() => {
    if (!view) return null;
    return view.events.find((e) => e.period === currentPeriod) ?? null;
  }, [view, currentPeriod]);

  const formatMoney = (n: number) => `${Number(n || 0).toLocaleString('ar-EG')} ج.م`;

  const openRunDetail = useCallback((targetPeriod: string) => {
    setSelectedPeriod(targetPeriod);
    try {
      setRunDetail(EmployeeService.getPayrollRun(targetPeriod)!);
    } catch {
      setRunDetail(null);
    }
  }, []);

  const closeRunDetail = useCallback(() => {
    setSelectedPeriod(null);
    setRunDetail(null);
  }, []);

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6 bg-slate-50 text-slate-900" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-sky-100 flex items-center justify-center text-sky-600">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-black text-slate-900">تقويم الرواتب وجدول الصرف الشهري</h1>
            <p className="text-xs text-slate-400">جدولة دفع الرواتب، تتبع حالات الصرف، والدفعات الناقصة</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} disabled={loading} className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-50">
            <ChevronRight className="w-4 h-4 rotate-180" />
          </button>
          <span className="font-bold text-slate-900 whitespace-nowrap">
            {monthName} {year}
          </span>
          <button onClick={nextMonth} disabled={loading} className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-50">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={goToToday} className="text-xs font-bold text-sky-600 hover:text-sky-700">اليوم</button>
        </div>
      </div>

      {error && (
        <div className="mx-6 px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {!canView && (
        <div className="mx-6 bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500">
          ليس لديك صلاحية عرض تقويم الرواتب.
        </div>
      )}

      {canView && !loading && (
        <>
          {/* ملخص الشهر */}
          <div className="mx-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <StatCard label="الفترة" value={`${monthName} ${year}`} icon={<Calendar className="w-4 h-4" />} color="text-slate-600" bg="bg-slate-50" />
            <StatCard label="المستحق إجمالياً" value={formatMoney(view?.totalExpected ?? 0)} icon={<Wallet className="w-4 h-4" />} color="text-sky-700" bg="bg-sky-50" />
            <StatCard label="المصروف" value={formatMoney(view?.totalPaid ?? 0)} icon={<CheckCircle2 className="w-4 h-4" />} color="text-emerald-700" bg="bg-emerald-50" />
            <StatCard label="المتبقي" value={formatMoney(view?.totalRemaining ?? 0)} icon={<Clock className="w-4 h-4" />} color="text-amber-700" bg="bg-amber-50" />
            <StatCard label="الأحداث المتأخرة" value={view?.overdueCount ?? 0} icon={<AlertTriangle className="w-4 h-4" />} color="text-rose-700" bg="bg-rose-50" />
            <StatCard label="دفعات موظفين ناقصة" value={view?.missingPaymentsCount ?? 0} icon={<Activity className="w-4 h-4" />} color="text-rose-700" bg="bg-rose-50" />
          </div>

          {/* أحداث الشهر */}
          <div className="mx-6 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black flex items-center gap-2">
                  <Activity className="w-4 h-4 text-slate-400" /> أحداث الرواتب في {monthName} {year}
                </h3>
                <p className="text-[10px] text-slate-500 mt-1">كل دورة رواتب تمثل حدثاً في التقويم المالي مع تاريخ الاستحقاق وحالة الصرف</p>
              </div>
              {canManage && (
                <button onClick={load} disabled={loading} className="flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                  {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCw className="w-3 h-3" />} تحديث
                </button>
              )}
            </div>

            {view?.events.length === 0 ? (
              <div className="px-6 py-12 text-center text-slate-500">
                <Clock className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                <p className="text-sm font-medium">لا توجد دورات رواتب لهذه الفترة</p>
                <p className="text-xs text-slate-400 mt-1">يمكن احتساب دورة رواتب جديدة من صفحة الرواتب.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1300px] text-right text-xs">
                  <thead className="border-b border-slate-200 bg-white sticky top-0">
                    <tr>
                      {['الفترة', 'تاريخ الاستحقاق', 'المستحق', 'المصروف', 'المتبقي', 'حالة الصرف', 'الموظفون', 'إجراءات'].map((h) => (
                        <th key={h} className="px-3 py-3 font-bold text-slate-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {view.events.map((event) => {
                      const meta = STATUS_LABELS[event.status];
                      return (
                        <tr key={event.id} className={`hover:bg-slate-50/70 transition-colors ${event.isOverdue ? 'bg-rose-25' : ''}`}>
                          <td className="px-3 py-3 font-bold text-slate-800">
                            {event.period}
                            <div className="mt-1 text-[10px] text-slate-500">{event.runStatus === 'DRAFT' ? 'مسودة' : event.runStatus === 'APPROVED' ? 'معتمد' : event.runStatus === 'PAID' ? 'مصرف' : 'مغلق'}</div>
                          </td>
                          <td className="px-3 py-3 font-mono text-slate-600">
                            {event.dueDate}
                            {event.isOverdue && <span className="ml-1 text-[10px] text-rose-600 font-bold">متأخر</span>}
                          </td>
                          <td className="px-3 py-3 font-mono">{formatMoney(event.expectedAmount)}</td>
                          <td className="px-3 py-3 font-mono text-emerald-700">{formatMoney(event.paidAmount)}</td>
                          <td className="px-3 py-3 font-mono font-bold text-amber-700">{formatMoney(event.remainingAmount)}</td>
                          <td className="px-3 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${meta.bg} ${meta.color} border border-slate-200`}>
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-3 py-3 font-mono text-slate-600">
                            {event.paidEmployeeCount} / {event.employeeCount}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex gap-1">
                              {canManage && (
                                <button
                                  onClick={() => openRunDetail(event.period)}
                                  className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 font-bold text-slate-600"
                                >
                                  <Banknote className="w-3 h-3" /> تفصيل
                                </button>
                              )}
                              {event.missingPayments.length > 0 && (
                                <button
                                  onClick={() => openRunDetail(event.period)}
                                  className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 font-bold text-rose-700"
                                >
                                  <AlertTriangle className="w-3 h-3" /> ناقص
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* التنبيهات المتأخرة والدفعات الناقصة */}
          {overdue && (overdue.overdueEvents.length > 0 || overdue.missingPayments.length > 0) && (
            <div className="mx-6 bg-rose-50 border border-rose-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-rose-200 bg-rose-100 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <h3 className="text-sm font-bold text-rose-800">تنبيهات متأخرة ودفعات ناقصة</h3>
                </div>
                <span className="text-[10px] font-bold text-rose-700 bg-rose-200 px-2 py-0.5 rounded">
                  {overdue.totals.missing > 0 ? formatMoney(overdue.totals.missing) : '0'} ج.م مستحقة
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">
                {overdue.overdueEvents.length > 0 && (
                  <div className="col-span-1 lg:col-span-1 border-r border-rose-200 lg:border-r lg:border-b-0 lg:border-r-0 pb-4 lg:pb-0">
                    <h4 className="text-[10px] font-bold text-rose-600 mb-2 uppercase">الأحداث المتأخرة</h4>
                    <div className="space-y-2 max-h-[240px] overflow-y-auto">
                      {overdue.overdueEvents.map((ev) => (
                        <div key={ev.id} className="rounded-lg border border-rose-200 bg-white p-2 text-xs">
                          <div className="font-bold text-rose-800">شهر {ev.period}</div>
                          <div className="text-slate-600">تاريخ الاستحقاق: {ev.dueDate}</div>
                          <div className="text-slate-600">مُتأخر منذ {ev.isOverdue ? 'أكثر من شهر' : 'لم يُصرف بعد'}</div>
                          <div className="mt-1 text-slate-600">المتبقي: {formatMoney(ev.remainingAmount)}</div>
                          <div className="mt-1 text-slate-600">{ev.paidEmployeeCount} / {ev.employeeCount} موظفاً مصروفاً</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {overdue.missingPayments.length > 0 && (
                  <div className="lg:col-span-1">
                    <h4 className="text-[10px] font-bold text-rose-600 mb-2 uppercase">دفعات موظفين ناقصة</h4>
                    <div className="space-y-2 max-h-[240px] overflow-y-auto">
                      {overdue.missingPayments.map((mp) => (
                        <div key={`${mp.period}-${mp.employeeId}`} className="rounded-lg border border-rose-200 bg-white p-2 text-xs">
                          <div className="font-bold text-rose-800">{mp.employeeName}</div>
                          <div className="text-slate-600">دورة {mp.period}</div>
                          <div className="text-slate-600">المستحق: {formatMoney(mp.expectedAmount)} • المدفوع: {formatMoney(mp.paidAmount)}</div>
                          <div className="mt-1 text-rose-700 font-bold">ناقص: {formatMoney(mp.difference)}</div>
                          {mp.daysOverdue > 0 && <div className="text-[10px] text-rose-600">متأخر منذ {mp.daysOverdue} يوم</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* تفاصيل الدورة المختارة */}
          {selectedPeriod && runDetail && (
            <div className="mx-6 bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black flex items-center gap-2">
                    <Banknote className="w-4 h-4 text-slate-400" /> تفاصيل دورة رواتب {runDetail.period}
                  </h3>
                  <p className="text-[10px] text-slate-500 mt-1">حالة الصرف لكل موظف والمبالغ المستحقة والمصروفة</p>
                </div>
                <button onClick={closeRunDetail} className="rounded-lg p-1.5 hover:bg-slate-100 text-slate-500">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="overflow-x-auto p-4">
                <table className="w-full text-right text-xs">
                  <thead className="border-b border-slate-200 bg-white sticky top-0">
                    <tr>
                      {['الموظف', 'المستحق', 'المدفوع', 'المتبقي', 'حالة الصرف', 'طريقة الصرف', 'المرجع'].map((h) => (
                        <th key={h} className="px-3 py-3 font-bold text-slate-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {runDetail.items.map((item) => {
                      const paid = Number(item.paidAmount || 0);
                      const remaining = round2(item.netAmount - paid);
                      const isPaid = item.payoutStatus === 'PAID';
                      return (
                        <tr key={item.id} className={`hover:bg-slate-50/70 ${!isPaid && remaining > 0.009 ? 'bg-rose-25' : ''}`}>
                          <td className="px-3 py-3 font-bold text-slate-800">{item.employeeName}</td>
                          <td className="px-3 py-3 font-mono">{formatMoney(item.netAmount)}</td>
                          <td className={`px-3 py-3 font-mono ${isPaid ? 'text-emerald-700' : 'text-slate-600'}`}>{formatMoney(paid)}</td>
                          <td className={`px-3 py-3 font-mono font-bold ${remaining > 0.009 ? 'text-rose-700' : 'text-slate-600'}`}>{formatMoney(Math.max(0, remaining))}</td>
                          <td className="px-3 py-3">
                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                              isPaid ? 'bg-emerald-100 text-emerald-700' : remaining > 0.009 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-700'
                            }`}>
                              {isPaid ? 'مصرف' : remaining > 0.009 ? 'ناقص' : '—'}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-slate-600 font-mono">
                            {item.paymentMethod === 'CASH' ? 'نقدي' : item.paymentMethod === 'BANK_TRANSFER' ? 'تحويل بنكي' : 'محفظة'}
                          </td>
                          <td className="px-3 py-3 text-slate-400 text-[10px] truncate max-w-[120px]">{item.paymentReference || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

function StatCard({ label, value, icon: Icon, color, bg }: {
  label: string; value: string | number; icon: React.ReactNode; color: string; bg: string;
}) {
  return (
    <div className={`${bg} rounded-xl border border-slate-200 p-3`}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] font-bold text-slate-500 uppercase">{label}</p>
        <div className={`w-6 h-6 rounded flex items-center justify-center ${bg.replace('bg-', 'bg-opacity-50')}`}>{Icon}</div>
      </div>
      <p className="text-sm font-black text-slate-900">{value}</p>
    </div>
  );
}
