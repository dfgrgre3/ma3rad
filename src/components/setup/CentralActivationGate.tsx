import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, KeyRound, Loader2, Server } from 'lucide-react';
import { CentralLicenseService } from '../../services/domains/licensing/CentralLicenseService';
import { CentralConfigApplier } from '../../services/domains/licensing/CentralConfigApplier';
import { AuthService } from '../../services/domains/auth/AuthService';
import {
  getModuleInstallerApi,
  provisionEntitledModules,
  type AvailableModuleInfo,
} from '../../modules/moduleInstaller';
import { MODULE_REGISTRY } from '../../config/moduleRegistry';
import { logger } from '../../utils/logger';

type GatePhase = 'form' | 'working' | 'done';
type Stage = 'activate' | 'config' | 'modules';
type ModuleRowState = 'pending' | 'downloading' | 'installed' | 'failed';

const MODULE_LABELS = new Map(MODULE_REGISTRY.map((module) => [module.id, module.label]));

const inputClass = 'w-full px-3 py-2.5 bg-surface-muted rounded-xl border border-line text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary';
const labelClass = 'block text-xs font-bold text-ink mb-1.5';

interface CentralActivationGateProps {
  onComplete: () => void;
}

/**
 * First-run platform activation gate.
 *
 * Shown before login (and before the setup wizard) on builds that require
 * central activation. The installer may have already collected the API key on
 * its custom page — `pending-activation.json` next to the executable — which
 * prefills the activation-code field. The client enters the account credentials
 * the platform admin created for them; on success the device credential is
 * stored by the desktop shell, the signed tenant configuration (visible/hidden
 * pages, permissions, module entitlements) is fetched, and every entitled
 * feature module is downloaded — modules outside the entitlement are never
 * requested, so their page files never reach the device.
 */
export const CentralActivationGate: React.FC<CentralActivationGateProps> = ({ onComplete }) => {
  const [phase, setPhase] = useState<GatePhase>('form');
  const [stage, setStage] = useState<Stage>('activate');
  const [error, setError] = useState<string | null>(null);
  const [activationCode, setActivationCode] = useState('');
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [catalog, setCatalog] = useState<AvailableModuleInfo[]>([]);
  const [moduleStates, setModuleStates] = useState<Record<string, ModuleRowState>>({});
  const [moduleReasons, setModuleReasons] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    void CentralLicenseService.hasCompletedFirstRunActivation()
      .then((done) => { if (active && done) onComplete(); })
      .catch(() => { /* stay on the form; the user can retry */ });
    void CentralLicenseService.readPendingApiKey().then((apiKey) => {
      if (active && apiKey) setActivationCode((current) => current || apiKey);
    });
    return () => {
      active = false;
      if (doneTimer.current) clearTimeout(doneTimer.current);
    };
  }, [onComplete]);

  const canSubmit = activationCode.trim().length > 0
    && account.trim().length > 0
    && password.length > 0
    && phone.trim().length > 0;

  const setModuleState = (moduleId: string, state: ModuleRowState, reason?: string) => {
    setModuleStates((prev) => ({ ...prev, [moduleId]: state }));
    if (reason) setModuleReasons((prev) => ({ ...prev, [moduleId]: reason }));
  };

  const handleActivate = async () => {
    if (!canSubmit || phase === 'working') return;
    setError(null);
    setPhase('working');
    setStage('activate');
    try {
      const res = await CentralLicenseService.activateDeviceSetup(
        {
          activationCode: activationCode.trim(),
          account: account.trim(),
          password,
          phone: phone.trim(),
        },
        deviceName.trim() || undefined,
      );

      const local = res.localAccount;
      if (local?.username && password) {
        try {
          AuthService.provisionCentralAccount({
            username: local.username,
            password,
            fullName: local.fullName,
            phone: local.phone || phone.trim(),
            role: local.role,
          });
        } catch (provisionError) {
          logger.error('Could not provision the local account after activation:', provisionError instanceof Error ? provisionError : new Error(String(provisionError)));
        }
      }

      setStage('config');
      await CentralLicenseService.fetchConfig();
      CentralConfigApplier.apply();

      setStage('modules');
      await provisionEntitledModules(
        getModuleInstallerApi(),
        (p) => {
          setProgress({ completed: p.completed, total: p.total });
          if (p.currentModuleId) setModuleState(p.currentModuleId, 'downloading');
          if (p.finishedModuleId) {
            setModuleState(p.finishedModuleId, p.finishedOk ? 'installed' : 'failed', p.finishedReason);
          }
        },
        (modules) => {
          setCatalog(modules);
          setModuleStates(Object.fromEntries(modules.map((m) => [
            m.moduleId,
            m.installed ? 'installed' as const : 'pending' as const,
          ])));
        },
      );

      await CentralLicenseService.clearPendingApiKey();
      CentralLicenseService.markFirstRunActivationComplete();
      setPhase('done');
      doneTimer.current = setTimeout(() => onComplete(), 900);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('form');
    }
  };

  const stageLabel: Record<Stage, string> = {
    activate: 'جارٍ تفعيل الجهاز على المنصة المركزية...',
    config: 'جارٍ جلب إعدادات النظام والصفحات المتاحة...',
    modules: 'جارٍ تنزيل ملفات الوحدات المشمولة في اشتراكك...',
  };

  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-gradient-to-br from-line via-white to-primary p-4">
      <div className="w-full max-w-xl rounded-2xl border border-line bg-surface shadow-2xl shadow-ink/10 overflow-hidden">
        <div className="border-b border-line bg-surface-muted/60 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-white">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-black text-ink">تفعيل النظام</h1>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                <Server className="h-3.5 w-3.5" />
                ربط هذا الجهاز بالمنصة المركزية قبل بدء الإعداد
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          {phase === 'form' && (
            <>
              <p className="text-sm leading-6 text-ink-secondary">
                أدخل <span className="font-bold text-ink">كود التفعيل (API)</span> وبيانات الحساب التي أنشأها
                مسؤول النظام لك. يحدد الكود الصفحات والوحدات المتاحة في نسختك، ولن يتم تنزيل ملفات
                الصفحات غير المشمولة في اشتراكك.
              </p>

              <div>
                <label className={labelClass} htmlFor="gate-activation-code">كود التفعيل (API Key)</label>
                <input
                  id="gate-activation-code"
                  type="text"
                  dir="ltr"
                  value={activationCode}
                  onChange={(e) => setActivationCode(e.target.value)}
                  placeholder="EDAR-XXXX-XXXX-XXXX"
                  autoComplete="off"
                  className={inputClass}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass} htmlFor="gate-account">اسم الحساب</label>
                  <input
                    id="gate-account"
                    type="text"
                    dir="ltr"
                    value={account}
                    onChange={(e) => setAccount(e.target.value)}
                    placeholder="account"
                    autoComplete="username"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="gate-password">كلمة المرور</label>
                  <input
                    id="gate-password"
                    type="password"
                    dir="ltr"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass} htmlFor="gate-phone">رقم الهاتف</label>
                  <input
                    id="gate-phone"
                    type="tel"
                    dir="ltr"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="01xxxxxxxxx"
                    autoComplete="tel"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="gate-device">اسم الجهاز (اختياري)</label>
                  <input
                    id="gate-device"
                    type="text"
                    value={deviceName}
                    onChange={(e) => setDeviceName(e.target.value)}
                    placeholder="كمبيوتر الفرع الرئيسي"
                    className={inputClass}
                  />
                </div>
              </div>

              {error && (
                <div role="alert" className="flex items-center gap-2 rounded-xl border border-danger-border bg-danger-soft px-3 py-2.5 text-sm text-danger">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>فشل التفعيل: {error}</span>
                </div>
              )}

              <button
                type="button"
                onClick={() => void handleActivate()}
                disabled={!canSubmit}
                className="w-full rounded-xl bg-primary px-5 py-3 text-sm font-black text-white shadow-lg transition hover:bg-primary/90 disabled:opacity-50"
              >
                تفعيل الجهاز ومتابعة الإعداد
              </button>
            </>
          )}

          {phase !== 'form' && (
            <div className="space-y-4" role="status" aria-live="polite">
              {phase === 'done' ? (
                <div className="flex items-center gap-3 rounded-xl border border-success-border bg-success-soft px-4 py-3 text-sm font-bold text-success">
                  <CheckCircle2 className="h-5 w-5" />
                  <span>تم تفعيل الجهاز بنجاح.</span>
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-muted/60 px-4 py-3">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span className="text-sm font-bold text-ink">{stageLabel[stage]}</span>
                </div>
              )}

              {catalog.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="font-bold text-ink-secondary">الوحدات المشمولة في اشتراكك</span>
                    {progress.total > 0 && (
                      <span className="text-muted" dir="ltr">
                        {progress.completed}/{progress.total}
                      </span>
                    )}
                  </div>
                  <ul className="divide-y divide-line rounded-xl border border-line overflow-hidden">
                    {catalog.map((entry) => {
                      const state = moduleStates[entry.moduleId] ?? 'pending';
                      const label = MODULE_LABELS.get(entry.moduleId) || entry.moduleId;
                      return (
                        <li key={entry.moduleId} className="flex items-center justify-between gap-3 px-4 py-2.5 bg-surface">
                          <span className="text-sm font-bold text-ink">{label}</span>
                          <span className="flex items-center gap-1.5 text-xs">
                            {state === 'installed' && (
                              <span className="inline-flex items-center gap-1 font-bold text-success">
                                <CheckCircle2 className="h-3.5 w-3.5" /> مثبت
                              </span>
                            )}
                            {state === 'downloading' && (
                              <span className="inline-flex items-center gap-1 font-bold text-primary">
                                <Download className="h-3.5 w-3.5" /> جارٍ التنزيل
                              </span>
                            )}
                            {state === 'pending' && <span className="font-bold text-muted">بالانتظار</span>}
                            {state === 'failed' && (
                              <span className="inline-flex items-center gap-1 font-bold text-danger">
                                <AlertCircle className="h-3.5 w-3.5" /> فشل
                              </span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  {Object.values(moduleReasons).some(Boolean) && (
                    <p className="mt-2 text-xs text-muted">
                      يمكن إعادة تنزيل الوحدات التي فشل تنزيلها لاحقًا من إعدادات الترخيص.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CentralActivationGate;
