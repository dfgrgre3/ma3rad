import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Settings, Loader2, AlertTriangle, CheckCircle2, Save, Bell, BellOff,
  Calendar, Clock, Building2, RefreshCw, Shield,
} from 'lucide-react';
import { PayrollNotificationSettingsService, PayrollNotificationSettings } from '../../../services/domains/hr/PayrollNotificationSettingsService';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { localDateString } from '../../../utils/shared/date';

export const PayrollNotificationSettingsPage: React.FC = () => {
  const actor = AuthService.getCurrentUser();
  const canManage = PermissionService.can(actor, 'employees.payroll.manage');
  const canView = PermissionService.canAny(actor, [
    'employees.payroll.view', 'employees.payroll.manage', 'employees.payroll.approve', 'employees.view',
  ]);

  if (!canView) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500">
        ليس لديك صلاحية عرض إعدادات إشعارات الرواتب.
      </div>
    );
  }

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

  const today = localDateString();

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6 bg-slate-50 text-slate-900" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-sky-100 flex items-center justify-center text-sky-600">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-black text-slate-900">إعدادات إشعارات مواعيد صرف الرواتب</h1>
            <p className="text-xs text-slate-400">تحكم كامل في تنبيهات استحقاق وتأخر صرف الرواتب لكل فرع</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} تحديث
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-6 px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {success && (
        <div className="mx-6 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" /> {success}
        </div>
      )}

      <div className="mx-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
          </div>
        ) : settings.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <BellOff className="w-12 h-12 text-slate-400 mx-auto mb-3" />
            <h3 className="text-sm font-black text-slate-900">لا توجد فروع مُعدة</h3>
            <p className="text-xs text-slate-500 mt-1">تأكد من وجود فروع نشطة وصلاحية عرض الرواتب.</p>
          </div>
        ) : (
          <>
            {/* بطاقات الملخص */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              <SummaryCard label="إجمالي الفروع" value={settings.length} icon={<Building2 className="w-4 h-4" />} color="text-slate-600" bg="bg-slate-50" />
              <SummaryCard label="مُفعّلة" value={settings.filter((s) => s.enabled).length} icon={<Bell className="w-4 h-4" />} color="text-emerald-600" bg="bg-emerald-50" />
              <SummaryCard label="تنبيه مستحق" value={settings.filter((s) => s.enabled && s.notifyDue).length} icon={<Calendar className="w-4 h-4" />} color="text-sky-600" bg="bg-sky-50" />
              <SummaryCard label="تنبيه متأخر" value={settings.filter((s) => s.enabled && s.notifyOverdue).length} icon={<Clock className="w-4 h-4" />} color="text-rose-600" bg="bg-rose-50" />
            </div>

            {/* جدول الإعدادات */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black flex items-center gap-2">
                    <Shield className="w-4 h-4 text-slate-400" /> إعدادات الفروع
                  </h3>
                  <p className="text-[10px] text-slate-500 mt-1">كل فرع له إعدادات مستقلة. التغييرات تُحفظ فوراً.</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1200px] text-right text-sm">
                  <thead className="border-b border-slate-200 bg-white sticky top-0">
                    <tr>
                      {[
                        'الفرع', 'الحالة', 'تنبيه مستحق', 'أيام قبل الاستحقاق',
                        'تنبيه متأخر', 'أيام بعد الاستحقاق', 'آخر تعديل', 'تم التعديل بواسطة', 'إجراءات',
                      ].map((h) => (
                        <th key={h} className="px-3 py-3 font-bold text-slate-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {settings.map((s) => (
                      <tr key={s.branchId} className={`hover:bg-slate-50/70 ${!s.enabled ? 'bg-slate-25' : ''}`}>
                        <td className="px-3 py-3 font-bold text-slate-800">
                          {s.branchName}
                        </td>
                        <td className="px-3 py-3">
                          <label className="inline-flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={s.enabled}
                              onChange={() => toggleEnabled(s.branchId, s.enabled)}
                              disabled={saving === s.branchId}
                              className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                            />
                            <span className="text-xs font-medium">
                              {s.enabled ? 'مُفعّلة' : 'مُعطّلة'}
                            </span>
                          </label>
                        </td>
                        <td className="px-3 py-3">
                          <label className="inline-flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={s.enabled && s.notifyDue}
                              onChange={() => toggleNotifyDue(s.branchId, s.notifyDue)}
                              disabled={!s.enabled || saving === s.branchId}
                              className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                            />
                            <span className={`text-xs ${s.enabled && s.notifyDue ? 'text-emerald-700' : 'text-slate-500'}`}>
                              {s.enabled && s.notifyDue ? 'مُفعّلة' : 'مُعطّلة'}
                            </span>
                          </label>
                        </td>
                        <td className="px-3 py-3">
                          <input
                            type="number"
                            min="1"
                            max="30"
                            value={s.dueHorizonDays}
                            onChange={(e) => handleDueDaysChange(s.branchId, e.target.value)}
                            disabled={!s.enabled || !s.notifyDue || saving === s.branchId}
                            className="w-20 px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-center text-xs font-mono disabled:bg-slate-50 disabled:cursor-not-allowed"
                          />
                        </td>
                        <td className="px-3 py-3">
                          <label className="inline-flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={s.enabled && s.notifyOverdue}
                              onChange={() => toggleNotifyOverdue(s.branchId, s.notifyOverdue)}
                              disabled={!s.enabled || saving === s.branchId}
                              className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                            />
                            <span className={`text-xs ${s.enabled && s.notifyOverdue ? 'text-rose-700' : 'text-slate-500'}`}>
                              {s.enabled && s.notifyOverdue ? 'مُفعّلة' : 'مُعطّلة'}
                            </span>
                          </label>
                        </td>
                        <td className="px-3 py-3">
                          <input
                            type="number"
                            min="0"
                            max="30"
                            value={s.overdueHorizonDays}
                            onChange={(e) => handleOverdueDaysChange(s.branchId, e.target.value)}
                            disabled={!s.enabled || !s.notifyOverdue || saving === s.branchId}
                            className="w-20 px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-center text-xs font-mono disabled:bg-slate-50 disabled:cursor-not-allowed"
                          />
                        </td>
                        <td className="px-3 py-3 text-slate-500 text-[10px] font-mono">
                          {new Date(s.updatedAt).toLocaleDateString('ar-EG', {
                            year: 'numeric', month: '2-digit', day: '2-digit',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </td>
                        <td className="px-3 py-3 text-slate-500 text-xs">
                          {s.updatedByName || '—'}
                        </td>
                        <td className="px-3 py-3">
                          {saving === s.branchId && (
                            <Loader2 className="w-4 h-4 animate-spin text-sky-500 mx-auto" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* دليل الإعدادات */}
            <div className="mt-6 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Shield className="w-4 h-4 text-slate-400" /> دليل الإعدادات
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600">
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

function SummaryCard({ label, value, icon: Icon, color, bg }: {
  label: string; value: number; icon: React.ReactNode; color: string; bg: string;
}) {
  return (
    <div className={`${bg} rounded-xl border border-slate-200 p-3`}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] font-bold text-slate-500 uppercase">{label}</p>
        <div className="w-6 h-6 rounded flex items-center justify-center {bg.replace('bg-', 'bg-opacity-50')}">{Icon}</div>
      </div>
      <p className="text-lg font-black text-slate-900">{value}</p>
    </div>
  );
}

function SettingGuideItem({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-slate-100 p-3 bg-slate-50">
      <p className="font-bold text-slate-800 mb-1">{title}</p>
      <p className="text-slate-500">{description}</p>
    </div>
  );
}