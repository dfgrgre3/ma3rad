import React, { useEffect, useState } from 'react';
import { useToast } from '../../../components/ui/Toast';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { Copy, Check, ShieldCheck, HelpCircle, ExternalLink, KeyRound, DownloadCloud } from 'lucide-react';
import { openExternalShare } from '../../../utils/shared/externalLinks';

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
  const [_loading, setLoading] = useState(true);
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
    dnsName?: string | null;
    peers?: Array<{ name: string; ip: string | null; dnsName?: string | null; online: boolean }>;
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
    if (!tailscale?.dnsName) return;
    const fullUrl = `https://${tailscale.dnsName}:47821`;
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
      <div className="rounded-2xl border border-accent-border bg-gradient-to-r from-primary via-white to-primary/50 p-4 shadow-sm text-xs">
        <div className="flex items-center gap-2 mb-3 font-black text-primary text-sm">
          <HelpCircle className="h-5 w-5 text-primary" />
          <span>دليل إعداد المزامنة بين الأجهزة (المعرض والبيت):</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2 text-ink leading-relaxed">
          {/* المعرض */}
          <div className="rounded-xl border border-accent-border bg-surface p-3.5 shadow-xs">
            <span className="font-bold text-primary block mb-2 text-xs border-b border-accent-border pb-1.5">
              1️⃣ على جهاز المعرض (الرئيسي):
            </span>
            <ul className="list-disc list-inside space-y-1.5 text-ink-secondary text-[11px]">
              <li>ضع الـ <strong>Auth Key</strong> واضغط زر <strong>"ربط وتنشيط الاتصال"</strong>.</li>
              <li>اضغط زر <strong>"نسخ الرابط"</strong> لعنوان الخادم الأزرق الظاهر أمامك.</li>
              <li>في خانة <strong>عنوان خادم المعرض</strong>: الصق الرابط الذي تم نسخه.</li>
              <li>في خانة <strong>معرّف المؤسسة</strong>: اكتب اسماً للمؤسسة (حروف إنجليزية).</li>
              <li>في خانة <strong>الرمز السري</strong>: اكتب رمز توثيق سري من اختيارك.</li>
              <li>في خانة <strong>معرّف الفرع</strong>: اكتب رمزاً للفرع الرئيسي (مثل: <code className="bg-surface-sunken px-1 rounded font-mono">main</code>).</li>
              <li>في خانة <strong>معرّف هذا الجهاز</strong>: اكتب اسماً للجهاز (مثل: <code className="bg-surface-sunken px-1 rounded font-mono">cashier_1</code>).</li>
              <li>فعّل خيار ✅ <strong>جهاز الإدارة الرئيسي (صلاحية السياسات)</strong>.</li>
              <li>اضغط زر <strong>"حفظ إعداد الاتصال"</strong> ثم أعد تشغيل البرنامج.</li>
            </ul>
          </div>

          {/* البيت */}
          <div className="rounded-xl border border-success-border bg-surface p-3.5 shadow-xs">
            <span className="font-bold text-success block mb-2 text-xs border-b border-success-border pb-1.5">
              2️⃣ على جهاز البيت (أو الفرع الثاني):
            </span>
            <ul className="list-disc list-inside space-y-1.5 text-ink-secondary text-[11px]">
              <li>ضع نفس الـ <strong>Auth Key</strong> واضغط <strong>"ربط وتنشيط الاتصال"</strong>.</li>
              <li>في خانة <strong>عنوان خادم المعرض</strong>: الصق نفس رابط المعرض الذي تم نسخه هناك.</li>
              <li>في خانة <strong>معرّف المؤسسة</strong>: اكتب <strong>نفس</strong> معرّف المؤسسة تماماً.</li>
              <li>في خانة <strong>الرمز السري</strong>: اكتب <strong>نفس</strong> الرمز السري تماماً.</li>
              <li>في خانة <strong>معرّف الفرع</strong>: اكتب رمزاً لهذا المكان (مثل: <code className="bg-surface-sunken px-1 rounded font-mono">home</code>).</li>
              <li>في خانة <strong>معرّف هذا الجهاز</strong>: اكتب اسماً لهذا الجهاز (مثل: <code className="bg-surface-sunken px-1 rounded font-mono">laptop</code>).</li>
              <li>اضغط زر <strong>"حفظ إعداد الاتصال"</strong> ثم أعد تشغيل البرنامج.</li>
            </ul>
          </div>
        </div>

        {/* روابط سريعة لاستخراج المفتاح وتحميل المحرك */}
        <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-accent-border pt-3">
          <span className="text-[11px] font-bold text-muted">روابط مساعدة سريعة:</span>
          
          <button
            type="button"
            onClick={() => openExternalShare('https://login.tailscale.com/admin/settings/keys')}
            className="flex items-center gap-1.5 rounded-lg bg-accent-soft hover:bg-accent-border px-3 py-1.5 text-[11px] font-bold text-primary transition"
          >
            <KeyRound className="h-3.5 w-3.5 text-primary" />
            <span>إنشاء واستخراج Auth Key من موقع Tailscale</span>
            <ExternalLink className="h-3 w-3 text-primary" />
          </button>

          <button
            type="button"
            onClick={() => openExternalShare('https://tailscale.com/download/windows')}
            className="flex items-center gap-1.5 rounded-lg border border-line bg-surface hover:bg-surface-muted px-3 py-1.5 text-[11px] font-bold text-ink transition"
          >
            <DownloadCloud className="h-3.5 w-3.5 text-muted" />
            <span>تحميل برنامج Tailscale لويندوز (إن لم يكن مثبتاً)</span>
            <ExternalLink className="h-3 w-3 text-muted" />
          </button>
        </div>
      </div>

      {/* ── بطاقة شبكة Tailscale المباشرة ── */}
      <div className="rounded-2xl border border-accent-border bg-accent-soft/60 p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-accent-border/60 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white shadow-xs">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-ink">الشبكة المشفرة المباشرة (Tailscale)</h3>
              <p className="text-[11px] text-muted">يجب استخدام HTTPS بشهادة موثوقة؛ عنوان Tailscale وحده لا يثبت هوية الخادم.</p>
            </div>
          </div>

          {/* عنوان جهاز المعرض مع زر نسخ فوري */}
          {tailscale?.running && (
            <div className="flex items-center gap-2 rounded-xl bg-surface px-3 py-1.5 border border-accent-border shadow-xs">
              {tailscale.dnsName ? (
                <>
                  <span className="text-[11px] font-bold text-muted">عنوان HTTPS لهذا الجهاز:</span>
                  <span className="text-xs font-mono font-black text-primary bg-accent-soft px-2 py-0.5 rounded" dir="ltr">
                    https://{tailscale.dnsName}:47821
                  </span>
                  <button
                    type="button"
                    onClick={copyServerUrl}
                    className="flex items-center gap-1 rounded-lg bg-primary hover:bg-primary px-2.5 py-1 text-[11px] font-bold text-white transition shadow-xs"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-white" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copied ? 'تم النسخ!' : 'نسخ الرابط'}</span>
                  </button>
                </>
              ) : (
                <span className="text-[11px] font-bold text-warning">
                  لا يتوفر اسم DNS؛ لا تستخدم عنوان IP مع HTTP لإعداد المزامنة.
                </span>
              )}
            </div>
          )}
        </div>

        <div className="mt-3 grid gap-4 sm:grid-cols-2 items-center">
          <div>
            <div className="text-xs text-ink mb-2">
              {tailscale?.running ? (
                <span className="text-success font-bold flex items-center gap-1.5">
                  ✓ الجهاز متصل بالشبكة المشفرة: <span className="font-mono bg-surface px-1.5 py-0.5 rounded border border-success-border">{tailscale.nodeName || 'المعرض'}</span>
                </span>
              ) : tailscale?.installed ? (
                <span className="text-warning font-bold">المحرك مثبت ولكن غير متصل بالشبكة بعد.</span>
              ) : (
                <span className="text-muted">خدمة الشبكة المشفرة تعمل تلقائياً مع البرنامج.</span>
              )}
            </div>

            {/* الأجهزة الأخرى المتصلة على نفس الشبكة */}
            {tailscale?.peers && tailscale.peers.length > 0 && (
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-ink-secondary block">اختر جهازاً له اسم DNS وشهادة HTTPS موثوقة:</span>
                <div className="flex flex-wrap gap-1.5">
                  {tailscale.peers.map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      disabled={!p.dnsName}
                      onClick={() => {
                        if (p.dnsName) {
                          update('url', `https://${p.dnsName}:47821`);
                          toast.success('تم اختيار الجهاز: ' + p.name);
                        }
                      }}
                      className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1 text-[11px] font-medium text-ink hover:border-primary hover:bg-accent-soft transition disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className={'h-2 w-2 rounded-full ' + (p.online ? 'bg-success animate-pulse' : 'bg-surface-sunken')} />
                      <span>{p.name}</span>
                      <span className="font-mono text-muted text-[10px]" dir="ltr">({p.dnsName || p.ip || 'بدون عنوان'})</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold text-ink block">
              مفتاح الانضمام التلقائي (Auth Key):
              <input
                type="password"
                value={authKey}
                onChange={(e) => setAuthKey(e.target.value)}
                placeholder="tskey-auth-xxxxx"
                className="mt-1 w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-xs font-mono shadow-xs focus:ring-2 focus:ring-primary focus:outline-none"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleTsConnect}
                disabled={tsBusy}
                className="rounded-xl bg-primary hover:bg-primary px-4 py-2 text-xs font-bold text-white shadow-xs transition disabled:opacity-50"
              >
                {tsBusy ? 'جارٍ الاتصال...' : 'ربط وتنشيط الاتصال'}
              </button>
              <button
                type="button"
                onClick={loadTailscale}
                className="rounded-xl border border-line-strong bg-surface hover:bg-surface-muted px-3 py-2 text-xs font-bold text-ink transition"
              >
                تحديث الحالة
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── بطاقة إعدادات خادم المزامنة المحلي ── */}
      <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-black text-ink">بيانات خادم المزامنة</h2>
            <p className="mt-0.5 text-xs text-muted">
              استخدم HTTPS مع شهادة موثوقة تطابق اسم الخادم. يُسمح بـHTTP على هذا الجهاز المحلي فقط.
            </p>
          </div>
          {restartRequired && (
            <span className="rounded-xl bg-warning-soft border border-warning px-3 py-1 text-xs font-bold text-warning animate-bounce">
              ⚠️ يلزم إعادة تشغيل البرنامج لتطبيق الإعداد الجديد
            </span>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-xs">
          <label className="font-bold text-ink">
            عنوان خادم المعرض (Sync URL):
            <input
              value={form.url}
              onChange={(event) => update('url', event.target.value)}
              placeholder="https://branch.example:47821"
              className="mt-1.5 w-full rounded-xl border border-line-strong bg-surface px-3 py-2 font-mono text-xs shadow-xs focus:ring-2 focus:ring-primary focus:outline-none"
              dir="ltr"
            />
          </label>

          <label className="font-bold text-ink">
            معرّف المؤسسة (Tenant ID):
            <input
              value={form.tenantId}
              onChange={(event) => update('tenantId', event.target.value)}
              placeholder="مثال: main_ceramics"
              className="mt-1.5 w-full rounded-xl border border-line-strong bg-surface px-3 py-2 font-mono text-xs shadow-xs focus:ring-2 focus:ring-primary focus:outline-none"
              dir="ltr"
            />
          </label>

          <label className="font-bold text-ink">
            الرمز السري (Token):
            <input
              type="password"
              value={form.token}
              onChange={(event) => update('token', event.target.value)}
              placeholder={tokenConfigured ? '•••••••• (محفوظ مشفر)' : 'رمز التوثيق المشترك'}
              className="mt-1.5 w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-xs shadow-xs focus:ring-2 focus:ring-primary focus:outline-none"
            />
          </label>

          <label className="font-bold text-ink">
            معرّف الفرع (Branch ID):
            <input
              value={form.branchId}
              onChange={(event) => update('branchId', event.target.value)}
              placeholder="مثال: branch_1 أو home"
              className="mt-1.5 w-full rounded-xl border border-line-strong bg-surface px-3 py-2 font-mono text-xs shadow-xs focus:ring-2 focus:ring-primary focus:outline-none"
              dir="ltr"
            />
          </label>

          <label className="font-bold text-ink">
            معرّف هذا الجهاز (Device ID):
            <input
              value={form.deviceId}
              onChange={(event) => update('deviceId', event.target.value)}
              placeholder="مثال: cashier_1 أو laptop"
              className="mt-1.5 w-full rounded-xl border border-line-strong bg-surface px-3 py-2 font-mono text-xs shadow-xs focus:ring-2 focus:ring-primary focus:outline-none"
              dir="ltr"
            />
          </label>

          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer pb-2 font-bold text-ink">
              <input
                type="checkbox"
                checked={form.canManagePolicies}
                onChange={(event) => update('canManagePolicies', event.target.checked)}
                className="h-4 w-4 rounded border-line-strong text-primary focus:ring-primary"
              />
              <span>جهاز الإدارة الرئيسي (صلاحية السياسات)</span>
            </label>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <div className="text-xs text-muted">
            {configSource === 'secure-storage' ? (
              <span className="text-success font-bold">✓ الإعداد محفوظ ومشفّر في مخزن النظام الآمن.</span>
            ) : configSource === 'environment' ? (
              <span className="text-warning font-bold">يستخدم إعدادات النظام الحالية.</span>
            ) : (
              <span>لم يتم حفظ إعداد اتصال بعد.</span>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={clear}
              className="rounded-xl border border-line-strong bg-surface px-4 py-2 text-xs font-bold text-ink hover:bg-surface-sunken transition shadow-xs"
            >
              مسح الإعداد
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-xl bg-primary px-5 py-2 text-xs font-bold text-white hover:bg-primary disabled:opacity-50 transition shadow-xs"
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
