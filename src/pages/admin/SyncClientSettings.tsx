import React, { useEffect, useState } from 'react';
import { useToast } from '../../components/ui/Toast';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import { Copy, Check, Info, ShieldCheck, Laptop, HelpCircle, ExternalLink, KeyRound, DownloadCloud, Sparkles } from 'lucide-react';
import { openExternalShare } from '../../utils/externalLinks';

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
  const [copied, setCopied] = useState(false);
  const [tailscale, setTailscale] = useState<{
    installed: boolean;
    running: boolean;
    ip: string | null;
    nodeName?: string;
    peers?: Array<{ name: string; ip: string | null; online: boolean }>;
  } | null>(null);
  const [authKey, setAuthKey] = useState('');
  const [tsBusy, setTsBusy] = useState(false);

  const loadTailscale = async () => {
    const bridge = (window as any).ceramisys?.tailscale;
    if (!bridge?.status) return;
    try {
      const res = await bridge.status();
      setTailscale(res);
    } catch (e) {
      console.warn('Tailscale status check error:', e);
    }
  };

  useEffect(() => {
    loadTailscale();
  }, []);

  const handleTsConnect = async () => {
    const bridge = (window as any).ceramisys?.tailscale;
    if (!bridge?.connect) return;
    setTsBusy(true);
    try {
      const res = await bridge.connect(authKey.trim() || undefined);
      if (res.ok) {
        toast.success('تم الاتصال بالشبكة المشفرة بنجاح!');
        setAuthKey('');
        await loadTailscale();
      } else {
        toast.error(res.error || 'تعذر الاتصال بالشبكة المشفرة.');
      }
    } catch (e: any) {
      toast.error(e.message || 'حدث خطأ أثناء الاتصال');
    } finally {
      setTsBusy(false);
    }
  };

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

  const copyServerUrl = () => {
    if (!tailscale?.ip) return;
    const fullUrl = `http://${tailscale.ip}:47821`;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    toast.success('تم نسخ رابط خادم المعرض: ' + fullUrl);
    setTimeout(() => setCopied(false), 2500);
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
      toast.success('تم مسح إعداد اتصال المزامنة من هذا الجهاز.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر مسح إعداد اتصال المزامنة.');
    }
  };

  return (
    <div className="space-y-4">
      {/* ── دليل إرشادي سريع للربط بين المعرض والبيت ── */}
      <div className="rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50 via-white to-sky-50/50 p-4 shadow-sm text-xs">
        <div className="flex items-center gap-2 mb-3 font-black text-sky-900 text-sm">
          <HelpCircle className="h-5 w-5 text-sky-600" />
          <span>دليل إعداد المزامنة بين الأجهزة (المعرض والبيت):</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2 text-slate-700 leading-relaxed">
          {/* المعرض */}
          <div className="rounded-xl border border-sky-100 bg-white p-3.5 shadow-xs">
            <span className="font-bold text-sky-800 block mb-2 text-xs border-b border-sky-50 pb-1.5">
              1️⃣ على جهاز المعرض (الرئيسي):
            </span>
            <ul className="list-disc list-inside space-y-1.5 text-slate-600 text-[11px]">
              <li>ضع الـ <strong>Auth Key</strong> واضغط زر <strong>"ربط وتنشيط الاتصال"</strong>.</li>
              <li>اضغط زر <strong>"نسخ الرابط"</strong> لعنوان الخادم الأزرق الظاهر أمامك.</li>
              <li>في خانة <strong>عنوان خادم المعرض</strong>: الصق الرابط الذي تم نسخه.</li>
              <li>في خانة <strong>معرّف المؤسسة</strong>: اكتب اسماً للمؤسسة (حروف إنجليزية).</li>
              <li>في خانة <strong>الرمز السري</strong>: اكتب رمز توثيق سري من اختيارك.</li>
              <li>في خانة <strong>معرّف الفرع</strong>: اكتب رمزاً للفرع الرئيسي (مثل: <code className="bg-slate-100 px-1 rounded font-mono">main</code>).</li>
              <li>في خانة <strong>معرّف هذا الجهاز</strong>: اكتب اسماً للجهاز (مثل: <code className="bg-slate-100 px-1 rounded font-mono">cashier_1</code>).</li>
              <li>فعّل خيار ✅ <strong>جهاز الإدارة الرئيسي (صلاحية السياسات)</strong>.</li>
              <li>اضغط زر <strong>"حفظ إعداد الاتصال"</strong> ثم أعد تشغيل البرنامج.</li>
            </ul>
          </div>

          {/* البيت */}
          <div className="rounded-xl border border-emerald-100 bg-white p-3.5 shadow-xs">
            <span className="font-bold text-emerald-800 block mb-2 text-xs border-b border-emerald-50 pb-1.5">
              2️⃣ على جهاز البيت (أو الفرع الثاني):
            </span>
            <ul className="list-disc list-inside space-y-1.5 text-slate-600 text-[11px]">
              <li>ضع نفس الـ <strong>Auth Key</strong> واضغط <strong>"ربط وتنشيط الاتصال"</strong>.</li>
              <li>في خانة <strong>عنوان خادم المعرض</strong>: الصق نفس رابط المعرض الذي تم نسخه هناك.</li>
              <li>في خانة <strong>معرّف المؤسسة</strong>: اكتب <strong>نفس</strong> معرّف المؤسسة تماماً.</li>
              <li>في خانة <strong>الرمز السري</strong>: اكتب <strong>نفس</strong> الرمز السري تماماً.</li>
              <li>في خانة <strong>معرّف الفرع</strong>: اكتب رمزاً لهذا المكان (مثل: <code className="bg-slate-100 px-1 rounded font-mono">home</code>).</li>
              <li>في خانة <strong>معرّف هذا الجهاز</strong>: اكتب اسماً لهذا الجهاز (مثل: <code className="bg-slate-100 px-1 rounded font-mono">laptop</code>).</li>
              <li>اضغط زر <strong>"حفظ إعداد الاتصال"</strong> ثم أعد تشغيل البرنامج.</li>
            </ul>
          </div>
        </div>

        {/* روابط سريعة لاستخراج المفتاح وتحميل المحرك */}
        <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-sky-100 pt-3">
          <span className="text-[11px] font-bold text-slate-500">روابط مساعدة سريعة:</span>
          
          <button
            type="button"
            onClick={() => openExternalShare('https://login.tailscale.com/admin/settings/keys')}
            className="flex items-center gap-1.5 rounded-lg bg-sky-100 hover:bg-sky-200 px-3 py-1.5 text-[11px] font-bold text-sky-800 transition"
          >
            <KeyRound className="h-3.5 w-3.5 text-sky-700" />
            <span>إنشاء واستخراج Auth Key من موقع Tailscale</span>
            <ExternalLink className="h-3 w-3 text-sky-500" />
          </button>

          <button
            type="button"
            onClick={() => openExternalShare('https://tailscale.com/download/windows')}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3 py-1.5 text-[11px] font-bold text-slate-700 transition"
          >
            <DownloadCloud className="h-3.5 w-3.5 text-slate-500" />
            <span>تحميل برنامج Tailscale لويندوز (إن لم يكن مثبتاً)</span>
            <ExternalLink className="h-3 w-3 text-slate-400" />
          </button>
        </div>
      </div>

      {/* ── بطاقة شبكة Tailscale المباشرة ── */}
      <div className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-200/60 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-600 text-white shadow-xs">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">الشبكة المشفرة المباشرة (Tailscale)</h3>
              <p className="text-[11px] text-slate-500">ربط مباشر بين الأجهزة عبر الإنترنت بدون الحاجة لسيرفر سحابي</p>
            </div>
          </div>

          {/* عنوان جهاز المعرض مع زر نسخ فوري */}
          {tailscale?.running && tailscale.ip && (
            <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-1.5 border border-sky-200 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500">عنوان خادم هذا الجهاز:</span>
              <span className="text-xs font-mono font-black text-sky-700 bg-sky-50 px-2 py-0.5 rounded" dir="ltr">
                http://{tailscale.ip}:47821
              </span>
              <button
                type="button"
                onClick={copyServerUrl}
                className="flex items-center gap-1 rounded-lg bg-sky-600 hover:bg-sky-700 px-2.5 py-1 text-[11px] font-bold text-white transition shadow-xs"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-white" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? 'تم النسخ!' : 'نسخ الرابط'}</span>
              </button>
            </div>
          )}
        </div>

        <div className="mt-3 grid gap-4 sm:grid-cols-2 items-center">
          <div>
            <div className="text-xs text-slate-700 mb-2">
              {tailscale?.running ? (
                <span className="text-emerald-700 font-bold flex items-center gap-1.5">
                  ✓ الجهاز متصل بالشبكة المشفرة: <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-emerald-200">{tailscale.nodeName || 'المعرض'}</span>
                </span>
              ) : tailscale?.installed ? (
                <span className="text-amber-700 font-bold">المحرك مثبت ولكن غير متصل بالشبكة بعد.</span>
              ) : (
                <span className="text-slate-500">خدمة الشبكة المشفرة تعمل تلقائياً مع البرنامج.</span>
              )}
            </div>

            {/* الأجهزة الأخرى المتصلة على نفس الشبكة */}
            {tailscale?.peers && tailscale.peers.length > 0 && (
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-slate-600 block">اضغط لاختيار أحد أجهزتك المتصلة كخادم:</span>
                <div className="flex flex-wrap gap-1.5">
                  {tailscale.peers.map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        if (p.ip) {
                          update('url', `http://${p.ip}:47821`);
                          toast.success('تم اختيار الجهاز: ' + p.name);
                        }
                      }}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:border-sky-400 hover:bg-sky-50 transition"
                    >
                      <span className={'h-2 w-2 rounded-full ' + (p.online ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300')} />
                      <span>{p.name}</span>
                      <span className="font-mono text-slate-400 text-[10px]" dir="ltr">({p.ip})</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-700 block">
              مفتاح الانضمام التلقائي (Auth Key):
              <input
                type="password"
                value={authKey}
                onChange={(e) => setAuthKey(e.target.value)}
                placeholder="tskey-auth-xxxxx"
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono shadow-xs focus:ring-2 focus:ring-sky-500 focus:outline-none"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleTsConnect}
                disabled={tsBusy}
                className="rounded-xl bg-sky-600 hover:bg-sky-700 px-4 py-2 text-xs font-bold text-white shadow-xs transition disabled:opacity-50"
              >
                {tsBusy ? 'جارٍ الاتصال...' : 'ربط وتنشيط الاتصال'}
              </button>
              <button
                type="button"
                onClick={loadTailscale}
                className="rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition"
              >
                تحديث الحالة
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── بطاقة إعدادات خادم المزامنة المحلي ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-black text-slate-900">بيانات خادم المزامنة</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              أدخل عنوان خادم المعرض ومعرّفات الربط لتمكين المزامنة الفورية.
            </p>
          </div>
          {restartRequired && (
            <span className="rounded-xl bg-amber-100 border border-amber-300 px-3 py-1 text-xs font-bold text-amber-800 animate-bounce">
              ⚠️ يلزم إعادة تشغيل البرنامج لتطبيق الإعداد الجديد
            </span>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-xs">
          <label className="font-bold text-slate-700">
            عنوان خادم المعرض (Sync URL):
            <input
              value={form.url}
              onChange={(event) => update('url', event.target.value)}
              placeholder="http://100.x.x.x:47821"
              className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs shadow-xs focus:ring-2 focus:ring-sky-500 focus:outline-none"
              dir="ltr"
            />
          </label>

          <label className="font-bold text-slate-700">
            معرّف المؤسسة (Tenant ID):
            <input
              value={form.tenantId}
              onChange={(event) => update('tenantId', event.target.value)}
              placeholder="مثال: main_ceramics"
              className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs shadow-xs focus:ring-2 focus:ring-sky-500 focus:outline-none"
              dir="ltr"
            />
          </label>

          <label className="font-bold text-slate-700">
            الرمز السري (Token):
            <input
              type="password"
              value={form.token}
              onChange={(event) => update('token', event.target.value)}
              placeholder={tokenConfigured ? '•••••••• (محفوظ مشفر)' : 'رمز التوثيق المشترك'}
              className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs shadow-xs focus:ring-2 focus:ring-sky-500 focus:outline-none"
            />
          </label>

          <label className="font-bold text-slate-700">
            معرّف الفرع (Branch ID):
            <input
              value={form.branchId}
              onChange={(event) => update('branchId', event.target.value)}
              placeholder="مثال: branch_1 أو home"
              className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs shadow-xs focus:ring-2 focus:ring-sky-500 focus:outline-none"
              dir="ltr"
            />
          </label>

          <label className="font-bold text-slate-700">
            معرّف هذا الجهاز (Device ID):
            <input
              value={form.deviceId}
              onChange={(event) => update('deviceId', event.target.value)}
              placeholder="مثال: cashier_1 أو laptop"
              className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs shadow-xs focus:ring-2 focus:ring-sky-500 focus:outline-none"
              dir="ltr"
            />
          </label>

          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer pb-2 font-bold text-slate-700">
              <input
                type="checkbox"
                checked={form.canManagePolicies}
                onChange={(event) => update('canManagePolicies', event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <span>جهاز الإدارة الرئيسي (صلاحية السياسات)</span>
            </label>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <div className="text-xs text-slate-500">
            {configSource === 'secure-storage' ? (
              <span className="text-emerald-700 font-bold">✓ الإعداد محفوظ ومشفّر في مخزن النظام الآمن.</span>
            ) : configSource === 'environment' ? (
              <span className="text-amber-700 font-bold">يستخدم إعدادات النظام الحالية.</span>
            ) : (
              <span>لم يتم حفظ إعداد اتصال بعد.</span>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={clear}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition shadow-xs"
            >
              مسح الإعداد
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-xl bg-sky-700 px-5 py-2 text-xs font-bold text-white hover:bg-sky-800 disabled:opacity-50 transition shadow-xs"
            >
              {saving ? 'جارٍ الحفظ...' : 'حفظ إعداد الاتصال'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SyncClientSettings;
