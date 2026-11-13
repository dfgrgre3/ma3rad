import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, RefreshCw, Loader2, AlertTriangle, Clock, FileText, CheckCircle2, ChevronRight } from 'lucide-react';
import { HrAlertsService } from '../../../services/domains/hr/HrAlertsService';
import { NotificationService } from '../../../services/domains/notifications/NotificationService';
import { usePermission } from '../../../hooks/domains/auth/usePermission';
import { localDateString } from '../../../utils/shared/date';

const TYPE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  HR_CONTRACT_EXPIRY: { label: 'انتهاء عقد', color: 'text-rose-700', bg: 'bg-rose-50' },
  HR_PROBATION_END: { label: 'انتهاء فترة اختبار', color: 'text-amber-700', bg: 'bg-amber-50' },
  HR_DOCUMENT_EXPIRY: { label: 'انتهاء مستند', color: 'text-violet-700', bg: 'bg-violet-50' },
  HR_LEAVE_BALANCE: { label: 'رصيد إجازات', color: 'text-emerald-700', bg: 'bg-emerald-50' },
  HR_LOAN_DUE: { label: 'قسط قرض', color: 'text-sky-700', bg: 'bg-sky-50' },
  HR_PAYROLL_DUE: { label: 'صرف رواتب قريب', color: 'text-sky-700', bg: 'bg-sky-50' },
  HR_PAYROLL_OVERDUE: { label: 'صرف رواتب متأخر', color: 'text-rose-700', bg: 'bg-rose-50' },
  SYSTEM: { label: 'نظام', color: 'text-slate-700', bg: 'bg-slate-50' },
};

export const HrAlertsPage: React.FC = () => {
  const can = usePermission();
  const canView = can('hr.contracts.view') || can('hr.documents.view') || can('hr.leave.view') || can('employees.payroll.view') || can('employees.view');
  if (!canView) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500">
        ليس لديك صلاحية عرض تنبيهات الموارد البشرية.
      </div>
    );
  }

  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<Array<{
    id: string; type: string; title: string; message: string; isRead: boolean;
    referenceType?: string; referenceId?: string; createdAt: string;
  }>>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    try {
      const svc = new NotificationService();
      const all = svc.getNotifications(undefined, true);
      const hrAlerts = all.filter((n) =>
        n.type.startsWith('HR_') || n.type === 'SYSTEM'
      );
      setAlerts(hrAlerts);
      setError(null);
    } catch (e: any) {
      console.error('HrAlertsPage load error:', e);
      setError(e?.message || 'تعذر تحميل التنبيهات.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      load();
    } catch (e: any) {
      console.error('HrAlertsPage useEffect error:', e);
      setError(e?.message || 'خطأ غير متوقع في تحميل الصفحة.');
      setLoading(false);
    }
  }, [load]);

  const runChecks = useCallback(() => {
    setLoading(true);
    try {
      const svc = new HrAlertsService();
      const result = svc.runHrAlerts();
      load();
      if (result.created > 0) {
        // eslint-disable-next-line no-alert
        window.alert(`تم إنشاء ${result.created} تنبيه جديد للموارد البشرية.\n${result.details.join('\n')}`);
      } else {
        window.alert('لا توجد تنبيهات جديدة للموارد البشرية في الوقت الحالي.');
      }
    } catch (e: any) {
      console.error('HrAlertsPage runChecks error:', e);
      setError(e?.message || 'تعذر تشغيل فحص التنبيهات.');
    } finally {
      setLoading(false);
    }
  }, [load]);

  const markRead = useCallback((id: string) => {
    try {
      new NotificationService().markAsRead(id);
      setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, isRead: true } : a)));
    } catch { /* ignore */ }
  }, []);

  const today = localDateString();
  const unreadCount = alerts.filter((a) => !a.isRead).length;

  const typeMeta = (type: string) => TYPE_LABELS[type] ?? { label: type, color: 'text-slate-600', bg: 'bg-slate-50' };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6 bg-slate-50 text-slate-900" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center text-rose-600">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-black text-slate-900">تنبيهات الموارد البشرية</h1>
            <p className="text-xs text-slate-400">عقود، فترات اختبار، مستندات، إجازات، أقساط قروض، صرف الرواتب</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded text-xs font-bold ${unreadCount > 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
            {unreadCount} غير مقروءة
          </span>
          <button onClick={runChecks} disabled={loading} className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs transition disabled:opacity-50 flex items-center gap-1.5">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} تشغيل الفحص الآن
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-6 px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      <div className="mx-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
          </div>
        ) : alerts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
            <h3 className="text-sm font-black text-slate-900">لا توجد تنبيهات</h3>
            <p className="text-xs text-slate-500 mt-1">جميع العقود والمستندات والإجازات والأقساط في وضع طبيعي.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">النوع</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">العنوان</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">التفاصيل</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">التاريخ</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {alerts.map((alert) => {
                  const meta = typeMeta(alert.type);
                  const isUrgent = alert.type.startsWith('HR_') && !alert.isRead;
                  return (
                    <tr
                      key={alert.id}
                      className={`hover:bg-slate-50 transition-colors border-b border-slate-50/50 last:border-0 ${isUrgent ? 'bg-rose-25' : ''}`}
                      onClick={() => markRead(alert.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="px-4 py-3 text-sm">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-bold ${meta.bg} ${meta.color}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-800">{alert.title}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{alert.message}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">
                        {new Date(alert.createdAt).toLocaleDateString('ar-EG', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-bold ${
                          alert.isRead ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {alert.isRead ? <CheckCircle2 className="w-2.5 h-2.5" /> : <Clock className="w-2.5 h-2.5" />}
                          {alert.isRead ? 'مقروءة' : 'جديدة'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mx-6 text-xs text-slate-500">
        يتم تشغيل الفحص التلقائي لهذه التنبيهات كل 30 ثانية عند تشغيل النظام، ويشمل: العقود المنتهية أو القريبة من الانتهاء، فترات الاختبار، مستندات الموظفين المنتهية الصلاحية، أرصدة الإجازات المنخفضة، وأقساط القروض المستحقة، ومواعيد صرف الرواتب.
      </div>
    </div>
  );
};
