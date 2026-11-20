import React, { useCallback, useEffect, useState } from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { PageHeader } from '../../../components/ui/PageHeader';
import {
  Settings, Loader2, AlertTriangle, CheckCircle2, Bell, BellOff,
  Calendar, Clock, Building2, RefreshCw, Shield,
} from 'lucide-react';
import { PayrollNotificationSettingsService, PayrollNotificationSettings } from '../../../services/domains/hr/PayrollNotificationSettingsService';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';

export const PayrollNotificationSettingsPage: React.FC = () => {
  const actor = AuthService.getCurrentUser();
  const canView = PermissionService.canAny(actor, [
    'employees.payroll.view', 'employees.payroll.manage', 'employees.payroll.approve', 'employees.view',
  ]);

  const [settings, setSettings] = useState<PayrollNotificationSettings[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    try {
      const data = PayrollNotificationSettingsService.getAllSettings();
      setSettings(data);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل الإعدادات.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = useCallback(async (branchId: string, updates: Partial<PayrollNotificationSettings>) => {
    setSaving(branchId);
    setError(null);
    setSuccess(null);
    try {
      PayrollNotificationSettingsService.upsertSettings({ branchId, ...updates });
      setSettings((prev) => prev.map((s) => (s.branchId === branchId ? { ...s, ...updates } : s)));
      setSuccess('تم حفظ الإعدادات بنجاح.');
    } catch (e: any) {
      setError(e?.message || 'تعذر حفظ الإعدادات.');
    } finally {
      setSaving(null);
    }
  }, []);

  const toggleEnabled = (branchId: string, current: boolean) => {
    handleSave(branchId, { enabled: !current });
  };

  const toggleNotifyDue = (branchId: string, current: boolean) => {
    handleSave(branchId, { notifyDue: !current });
  };

  const toggleNotifyOverdue = (branchId: string, current: boolean) => {
    handleSave(branchId, { notifyOverdue: !current });
  };

  const handleDueDaysChange = (branchId: string, value: string) => {
    const days = Math.max(1, Math.min(30, Number(value) || 1));
    handleSave(branchId, { dueHorizonDays: days });
  };

  const handleOverdueDaysChange = (branchId: string, value: string) => {
    const days = Math.max(0, Math.min(30, Number(value) || 0));
    handleSave(branchId, { overdueHorizonDays: days });
  };

  if (!canView) {
    return (
      <div className="h-full flex items-center justify-center text-muted">
        ليس لديك صلاحية عرض إعدادات إشعارات الرواتب.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6 bg-surface-muted text-ink">
      <div className="bg-surface border-b border-line px-6 pt-4 pb-1 flex-shrink-0">
        <PageHeader
          icon={<Settings className="h-5 w-5" />}
          title="إعدادات إشعارات مواعيد صرف الرواتب"
          description="تحكم كامل في تنبيهات استحقاق وتأخر صرف الرواتب لكل فرع"
          actions={
            <button onClick={load} disabled={loading} className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-bold text-ink">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} تحديث
            </button>
          }
        />
      </div>

      {error && (
        <div className="mx-6 px-4 py-3 bg-danger-soft border border-danger-border rounded-xl text-danger text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {success && (
        <div className="mx-6 px-4 py-3 bg-success-soft border border-success-border rounded-xl text-success text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" /> {success}
        </div>
      )}

      <div className="mx-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-success" />
          </div>
        ) : settings.length === 0 ? (
          <div className="bg-surface rounded-2xl border border-line p-12 text-center">
            <BellOff className="w-12 h-12 text-muted mx-auto mb-3" />
            <h3 className="text-sm font-black text-ink">لا توجد فروع مُعدة</h3>
            <p className="text-xs text-muted mt-1">تأكد من وجود فروع نشطة وصلاحية عرض الرواتب.</p>
          </div>
        ) : (
          <>
            {/* بطاقات الملخص */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              <SummaryCard label="إجمالي الفروع" value={settings.length} icon={<Building2 className="w-4 h-4" />} color="text-ink-secondary" bg="bg-surface-muted" />
              <SummaryCard label="مُفعّلة" value={settings.filter((s) => s.enabled).length} icon={<Bell className="w-4 h-4" />} color="text-success" bg="bg-success-soft" />
              <SummaryCard label="تنبيه مستحق" value={settings.filter((s) => s.enabled && s.notifyDue).length} icon={<Calendar className="w-4 h-4" />} color="text-primary" bg="bg-accent-soft" />
              <SummaryCard label="تنبيه متأخر" value={settings.filter((s) => s.enabled && s.notifyOverdue).length} icon={<Clock className="w-4 h-4" />} color="text-danger" bg="bg-danger-soft" />
            </div>

            {/* جدول الإعدادات */}
            <div className="bg-surface border border-line rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-line bg-surface-muted flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black flex items-center gap-2">
                    <Shield className="w-4 h-4 text-muted" /> إعدادات الفروع
                  </h3>
                  <p className="text-[10px] text-muted mt-1">كل فرع له إعدادات مستقلة. التغييرات تُحفظ فوراً.</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <DataTable
                  ariaLabel="إعدادات إشعارات الرواتب لكل فرع"
                  rows={settings}
                  rowKey={(s: any) => s.branchId}
                  minWidth={1200}
                  tableClassName="text-sm"
                  rowClassName={(s: any) => `hover:bg-surface-muted/70 ${!s.enabled ? 'bg-surface-muted' : ''}`}
                  columns={[
                    { key: 'branch', header: 'الفرع', render: (s: any) => <span className="font-bold text-ink">{s.branchName}</span> },
                    {
                      key: 'enabled', header: 'الحالة',
                      render: (s: any) => (
                        <label className="inline-flex cursor-pointer items-center gap-2">
                          <input type="checkbox" checked={s.enabled} onChange={() => toggleEnabled(s.branchId, s.enabled)} disabled={saving === s.branchId} className="h-4 w-4 rounded border-line-strong text-primary focus:ring-primary" />
                          <span className="text-xs font-medium">{s.enabled ? 'مُفعّلة' : 'مُعطّلة'}</span>
                        </label>
                      ),
                    },
                    {
                      key: 'notifyDue', header: 'تنبيه مستحق',
                      render: (s: any) => (
                        <label className="inline-flex cursor-pointer items-center gap-2">
                          <input type="checkbox" checked={s.enabled && s.notifyDue} onChange={() => toggleNotifyDue(s.branchId, s.notifyDue)} disabled={!s.enabled || saving === s.branchId} className="h-4 w-4 rounded border-line-strong text-primary focus:ring-primary" />
                          <span className={`text-xs ${s.enabled && s.notifyDue ? 'text-success' : 'text-muted'}`}>{s.enabled && s.notifyDue ? 'مُفعّلة' : 'مُعطّلة'}</span>
                        </label>
                      ),
                    },
                    {
                      key: 'dueDays', header: 'أيام قبل الاستحقاق',
                      render: (s: any) => (
                        <input type="number" min="1" max="30" value={s.dueHorizonDays} onChange={(e) => handleDueDaysChange(s.branchId, e.target.value)} disabled={!s.enabled || !s.notifyDue || saving === s.branchId} className="w-20 rounded-lg border border-line bg-surface px-2 py-1.5 text-center font-mono text-xs disabled:cursor-not-allowed disabled:bg-surface-muted" />
                      ),
                    },
                    {
                      key: 'notifyOverdue', header: 'تنبيه متأخر',
                      render: (s: any) => (
                        <label className="inline-flex cursor-pointer items-center gap-2">
                          <input type="checkbox" checked={s.enabled && s.notifyOverdue} onChange={() => toggleNotifyOverdue(s.branchId, s.notifyOverdue)} disabled={!s.enabled || saving === s.branchId} className="h-4 w-4 rounded border-line-strong text-primary focus:ring-primary" />
                          <span className={`text-xs ${s.enabled && s.notifyOverdue ? 'text-danger' : 'text-muted'}`}>{s.enabled && s.notifyOverdue ? 'مُفعّلة' : 'مُعطّلة'}</span>
                        </label>
                      ),
                    },
                    {
                      key: 'overdueDays', header: 'أيام بعد الاستحقاق',
                      render: (s: any) => (
                        <input type="number" min="0" max="30" value={s.overdueHorizonDays} onChange={(e) => handleOverdueDaysChange(s.branchId, e.target.value)} disabled={!s.enabled || !s.notifyOverdue || saving === s.branchId} className="w-20 rounded-lg border border-line bg-surface px-2 py-1.5 text-center font-mono text-xs disabled:cursor-not-allowed disabled:bg-surface-muted" />
                      ),
                    },
                    {
                      key: 'updated', header: 'آخر تعديل',
                      render: (s: any) => (
                        <span className="font-mono text-[10px] text-muted">{new Date(s.updatedAt).toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                      ),
                    },
                    { key: 'by', header: 'تم التعديل بواسطة', render: (s: any) => <span className="text-xs text-muted">{s.updatedByName || '—'}</span> },
                    {
                      key: 'actions', header: 'إجراءات',
                      render: (s: any) => saving === s.branchId ? <Loader2 className="mx-auto h-4 w-4 animate-spin text-primary" /> : null,
                    },
                  ]}
                />
              </div>
            </div>

            {/* دليل الإعدادات */}
            <div className="mt-6 bg-surface border border-line rounded-xl p-5 space-y-3">
              <h4 className="text-sm font-bold text-ink flex items-center gap-2">
                <Shield className="w-4 h-4 text-muted" /> دليل الإعدادات
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-ink-secondary">
                <SettingGuideItem
                  title="تفعيل الإشعارات"
                  description="تعطيل هذا الخيار يوقف جميع إشعارات الرواتب لهذا الفرع."
                />
                <SettingGuideItem
                  title="تنبيه مستحق قريباً"
                  description="يرسل إشعار قبل تاريخ الاستحقاق بعدد الأيام المحدد (1-30 يوم)."
                />
                <SettingGuideItem
                  title="أيام قبل الاستحقاق"
                  description="عدد الأيام قبل تاريخ صرف الرواتب الذي يُرسل فيه التنبيه المبكر."
                />
                <SettingGuideItem
                  title="تنبيه متأخر"
                  description="يرسل إشعار عند تجاوز تاريخ الاستحقاق دون صرف كامل للرواتب."
                />
                <SettingGuideItem
                  title="أيام بعد الاستحقاق"
                  description="عدد الأيام بعد تاريخ الاستحقاق التي يُعتبر فيها الصرف متأخراً (0 = نفس اليوم)."
                />
                <SettingGuideItem
                  title="نطاق الفرع"
                  description="كل فرع له إعدادات مستقلة. المستخدم يرى فقط الفروع المصرح له بها."
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

function SummaryCard({ label, value, icon: Icon, color: _color, bg }: {
  label: string; value: number; icon: React.ReactNode; color: string; bg: string;
}) {
  return (
    <div className={`${bg} rounded-xl border border-line p-3`}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] font-bold text-muted uppercase">{label}</p>
        <div className="w-6 h-6 rounded flex items-center justify-center {bg.replace('bg-', 'bg-opacity-50')}">{Icon}</div>
      </div>
      <p className="text-lg font-black text-ink">{value}</p>
    </div>
  );
}

function SettingGuideItem({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-line p-3 bg-surface-muted">
      <p className="font-bold text-ink mb-1">{title}</p>
      <p className="text-muted">{description}</p>
    </div>
  );
}