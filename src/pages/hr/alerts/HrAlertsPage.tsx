import React, { useCallback, useEffect, useState } from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Bell, RefreshCw, Loader2, AlertTriangle, Clock, CheckCircle2 } from 'lucide-react';
import { HrAlertsService } from '../../../services/domains/hr/HrAlertsService';
import { NotificationService } from '../../../services/domains/notifications/NotificationService';
import { usePermission } from '../../../hooks/domains/auth/usePermission';

const TYPE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  HR_CONTRACT_EXPIRY: { label: 'انتهاء عقد', color: 'text-danger', bg: 'bg-danger-soft' },
  HR_PROBATION_END: { label: 'انتهاء فترة اختبار', color: 'text-warning', bg: 'bg-warning-soft' },
  HR_DOCUMENT_EXPIRY: { label: 'انتهاء مستند', color: 'text-primary', bg: 'bg-accent-soft' },
  HR_LEAVE_BALANCE: { label: 'رصيد إجازات', color: 'text-success', bg: 'bg-success-soft' },
  HR_LOAN_DUE: { label: 'قسط قرض', color: 'text-primary', bg: 'bg-accent-soft' },
  HR_PAYROLL_DUE: { label: 'صرف رواتب قريب', color: 'text-primary', bg: 'bg-accent-soft' },
  HR_PAYROLL_OVERDUE: { label: 'صرف رواتب متأخر', color: 'text-danger', bg: 'bg-danger-soft' },
  SYSTEM: { label: 'نظام', color: 'text-ink', bg: 'bg-surface-muted' },
};

export const HrAlertsPage: React.FC = () => {
  const can = usePermission();
  const canView = can('hr.contracts.view') || can('hr.documents.view') || can('hr.leave.view') || can('employees.payroll.view') || can('employees.view');

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

  if (!canView) {
    return (
      <div className="h-full flex items-center justify-center text-muted">
        ليس لديك صلاحية عرض تنبيهات الموارد البشرية.
      </div>
    );
  }

  const unreadCount = alerts.filter((a) => !a.isRead).length;

  const typeMeta = (type: string) => TYPE_LABELS[type] ?? { label: type, color: 'text-ink-secondary', bg: 'bg-surface-muted' };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6 bg-surface-muted text-ink">
      <div className="bg-surface px-6 pt-4 pb-1 flex-shrink-0">
        <PageHeader
          icon={<Bell className="h-5 w-5" />}
          title="تنبيهات الموارد البشرية"
          description="عقود، فترات اختبار، مستندات، إجازات، أقساط قروض، صرف الرواتب"
          actions={<>
            <span className={`px-2.5 py-1 rounded text-xs font-bold ${unreadCount > 0 ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success'}`}>
              {unreadCount} غير مقروءة
            </span>
            <button onClick={runChecks} disabled={loading} className="px-3 py-2 rounded-lg bg-surface-sunken hover:bg-surface-sunken text-ink font-medium text-xs transition disabled:opacity-50 flex items-center gap-1.5">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} تشغيل الفحص الآن
            </button>
          </>}
        />
      </div>

      {error && (
        <div className="mx-6 px-4 py-3 bg-danger-soft border border-danger-border rounded-xl text-danger text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      <div className="mx-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-success" />
          </div>
        ) : alerts.length === 0 ? (
          <div className="bg-surface rounded-2xl border border-line p-12 text-center">
            <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-3" />
            <h3 className="text-sm font-black text-ink">لا توجد تنبيهات</h3>
            <p className="text-xs text-muted mt-1">جميع العقود والمستندات والإجازات والأقساط في وضع طبيعي.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-line bg-surface overflow-hidden">
            <DataTable
              ariaLabel="تنبيهات الموارد البشرية"
              rows={alerts}
              rowKey={(alert: any) => String(alert.id)}
              onRowClick={(alert: any) => markRead(alert.id)}
              tableClassName="text-sm"
              rowClassName={(alert: any) => {
                const isUrgent = alert.type.startsWith('HR_') && !alert.isRead;
                return `transition-colors border-b border-line/50 last:border-0 ${isUrgent ? 'bg-danger-soft' : ''}`;
              }}
              columns={[
                {
                  key: 'type', header: 'النوع',
                  render: (alert: any) => {
                    const meta = typeMeta(alert.type);
                    return (
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-bold ${meta.bg} ${meta.color}`}>
                        <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                        {meta.label}
                      </span>
                    );
                  },
                },
                { key: 'title', header: 'العنوان', render: (alert: any) => <span className="font-medium text-ink">{alert.title}</span> },
                { key: 'details', header: 'التفاصيل', render: (alert: any) => <span className="text-ink-secondary">{alert.message}</span> },
                {
                  key: 'date', header: 'التاريخ',
                  render: (alert: any) => <span className="text-muted">{new Date(alert.createdAt).toLocaleDateString('ar-EG', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>,
                },
                {
                  key: 'status', header: 'الحالة',
                  render: (alert: any) => (
                    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-bold ${alert.isRead ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'}`}>
                      {alert.isRead ? <CheckCircle2 className="h-2.5 w-2.5" /> : <Clock className="h-2.5 w-2.5" />}
                      {alert.isRead ? 'مقروءة' : 'جديدة'}
                    </span>
                  ),
                },
              ]}
            />
          </div>
        )}
      </div>

      <div className="mx-6 text-xs text-muted">
        يتم تشغيل الفحص التلقائي لهذه التنبيهات كل 30 ثانية عند تشغيل النظام، ويشمل: العقود المنتهية أو القريبة من الانتهاء، فترات الاختبار، مستندات الموظفين المنتهية الصلاحية، أرصدة الإجازات المنخفضة، وأقساط القروض المستحقة، ومواعيد صرف الرواتب.
      </div>
    </div>
  );
};
