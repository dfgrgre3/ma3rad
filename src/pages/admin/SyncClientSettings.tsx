import React, { useEffect, useState } from 'react';
import { DatabaseManager } from '../../database/db';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import { useToast } from '../../components/ui/Toast';

interface SyncClientConfigForm {
  url: string;
  token: string;
  tenantId: string;
  branchId: string;
  deviceId: string;
  canManagePolicies: boolean;
}

const emptyConfig: SyncClientConfigForm = {
  url: '',
  token: '',
  tenantId: '',
  branchId: '',
  deviceId: '',
  canManagePolicies: false,
};

export const SyncClientSettings: React.FC = () => {
  const toast = useToast();
  const [form, setForm] = useState(emptyConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tokenConfigured, setTokenConfigured] = useState(false);
  const [configSource, setConfigSource] = useState<'secure-storage' | 'environment' | 'none'>('none');
  const [restartRequired, setRestartRequired] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const bridge = window.ceramisys?.sync;
    if (!bridge?.status || !bridge.getClientConfig) {
      setLoading(false);
      return;
    }

    void Promise.all([bridge.status(), bridge.getClientConfig()])
      .then(([status, storedConfig]) => {
        if (cancelled) return;
        const activeConfig = status.clientConfig ?? storedConfig;
        setConfigSource(status.clientConfigSource);
        setTokenConfigured(Boolean(activeConfig?.tokenConfigured));
        if (activeConfig) {
          setForm({
            ...emptyConfig,
            url: activeConfig.url,
            tenantId: activeConfig.tenantId,
            branchId: activeConfig.branchId,
            deviceId: activeConfig.deviceId,
            canManagePolicies: activeConfig.canManagePolicies,
          });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : 'تعذر تحميل إعداد اتصال المزامنة.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [toast]);

  const update = (field: keyof SyncClientConfigForm, value: string | boolean) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const save = async () => {
    try {
      PermissionService.require(AuthService.requireAuth(), 'admin.view');
      const saveConfig = window.ceramisys?.sync?.saveClientConfig;
      if (!saveConfig) throw new Error('إعداد اتصال المزامنة متاح من تطبيق سطح المكتب فقط.');
      if (!form.url.trim() || !form.tenantId.trim() || !form.branchId.trim() || !form.deviceId.trim()) {
        throw new Error('أدخل عنوان خادم الفرع ومعرّفات المؤسسة والفرع والجهاز.');
      }
      if (!tokenConfigured && !form.token.trim()) {
        throw new Error('أدخل رمز الجهاز لأول إعداد اتصال.');
      }

      setSaving(true);
      const saved = await saveConfig({
        ...form,
        url: form.url.trim(),
        token: form.token,
        tenantId: form.tenantId.trim(),
        branchId: form.branchId.trim(),
        deviceId: form.deviceId.trim(),
      });
      setForm((current) => ({ ...current, token: '' }));
      setTokenConfigured(saved.tokenConfigured);
      setConfigSource('secure-storage');
      setRestartRequired(true);
      toast.success('حُفظ إعداد اتصال الفرع مشفّرًا في مخزن النظام الآمن.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر حفظ إعداد اتصال المزامنة.');
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    if (!window.confirm('هل تريد حذف إعداد الاتصال المحفوظ على هذا الجهاز؟')) return;
    try {
      PermissionService.require(AuthService.requireAuth(), 'admin.view');
      const clearConfig = window.ceramisys?.sync?.clearClientConfig;
      if (!clearConfig) throw new Error('إدارة إعداد المزامنة متاحة من تطبيق سطح المكتب فقط.');
      await clearConfig();
      setForm(emptyConfig);
      setTokenConfigured(false);
      setConfigSource('none');
      setRestartRequired(true);
      toast.success('حُذف إعداد اتصال المزامنة المحفوظ.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر حذف إعداد اتصال المزامنة.');
    }
  };

  const restart = async () => {
    try {
      PermissionService.require(AuthService.requireAuth(), 'admin.view');
      const relaunch = window.ceramisys?.app?.relaunch;
      if (!relaunch) throw new Error('إعادة تشغيل التطبيق متاحة من تطبيق سطح المكتب فقط.');
      await DatabaseManager.getInstance().flush();
      await relaunch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر حفظ البيانات وإعادة تشغيل التطبيق.');
    }
  };

  const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs';

  return (
    <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <h2 className="text-sm font-black">اتصال خادم الفرع المحلي</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          أدخل عنوان HTTPS لخادم فرعك على الشبكة المحلية. يُحفظ رمز الجهاز مشفّرًا في مخزن النظام الآمن ولا يظهر بعد الحفظ.
        </p>
      </div>

      {configSource === 'environment' && (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          يستخدم التطبيق حاليًا إعدادات Windows. عند حفظ الإعداد من هنا سيأخذ الإعداد المشفّر أولوية بعد إعادة التشغيل.
        </p>
      )}
      {!window.ceramisys?.sync?.saveClientConfig && (
        <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
          حفظ إعداد الاتصال متاح في تطبيق سطح المكتب فقط.
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-xs font-bold">
          <span>عنوان خادم الفرع على الشبكة المحلية</span>
          <input
            type="url"
            dir="ltr"
            value={form.url}
            onChange={(event) => update('url', event.target.value)}
            className={inputClass}
            placeholder="https://branch-lan.example:47821"
            disabled={loading || saving}
            autoComplete="url"
          />
        </label>
        <label className="space-y-1 text-xs font-bold">
          <span>رمز الجهاز {tokenConfigured ? '(اتركه فارغًا للاحتفاظ بالرمز الحالي)' : ''}</span>
          <input
            type="password"
            dir="ltr"
            value={form.token}
            onChange={(event) => update('token', event.target.value)}
            className={inputClass}
            placeholder={tokenConfigured ? 'محفوظ بأمان' : 'رمز فريد لا يقل عن 32 بايت'}
            disabled={loading || saving}
            autoComplete="new-password"
          />
        </label>
        <label className="space-y-1 text-xs font-bold">
          <span>معرّف المؤسسة</span>
          <input value={form.tenantId} onChange={(event) => update('tenantId', event.target.value)} className={inputClass} disabled={loading || saving} />
        </label>
        <label className="space-y-1 text-xs font-bold">
          <span>معرّف الفرع</span>
          <input value={form.branchId} onChange={(event) => update('branchId', event.target.value)} className={inputClass} disabled={loading || saving} />
        </label>
        <label className="space-y-1 text-xs font-bold">
          <span>معرّف هذا الجهاز</span>
          <input value={form.deviceId} onChange={(event) => update('deviceId', event.target.value)} className={inputClass} disabled={loading || saving} />
        </label>
      </div>

      <label className="mt-3 flex items-start gap-2 text-xs leading-5">
        <input
          type="checkbox"
          checked={form.canManagePolicies}
          onChange={(event) => update('canManagePolicies', event.target.checked)}
          disabled={loading || saving}
          className="mt-1"
        />
        <span>
          هذا هو جهاز مسؤول سياسات المزامنة. فعّله لجهاز واحد فقط، ويجب أن يكون مخوّلًا كذلك في إعداد خادم الفرع.
        </span>
      </label>

      {restartRequired && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-xs text-emerald-900">يتطلب تغيير اتصال المزامنة إعادة تشغيل التطبيق لتفعيله.</p>
          <button type="button" onClick={restart} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white">
            حفظ قاعدة البيانات وإعادة التشغيل
          </button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={save}
          disabled={loading || saving}
          className="rounded-lg bg-sky-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
        >
          {saving ? 'جارٍ الحفظ…' : 'حفظ إعداد الاتصال'}
        </button>
        {tokenConfigured && (
          <button
            type="button"
            onClick={clear}
            disabled={loading || saving}
            className="rounded-lg border border-rose-200 px-4 py-2 text-xs font-bold text-rose-700 disabled:opacity-50"
          >
            حذف الإعداد المحفوظ
          </button>
        )}
      </div>
    </section>
  );
};
