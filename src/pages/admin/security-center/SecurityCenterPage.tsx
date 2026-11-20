import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { PageHeader } from '../../../components/ui/PageHeader';
import {
  ShieldCheck, Users, MonitorSmartphone, AlertTriangle, Lock, RefreshCw,
  LogOut, Search, Loader2, Clock, KeyRound, FileWarning,
} from 'lucide-react';
import { SecurityService, ActiveSession, LoginRecord, SecurityOverview } from '../../../services/domains/security/SecurityService';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { useToast } from '../../../components/ui/Toast';
import { usePermission } from '../../../hooks/domains/auth/usePermission';
import type { TwoFactorSetup } from '../../../services/domains/auth/twoFactorAuth';

const fmtDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ar-EG');
};

export const SecurityCenterPage: React.FC = () => {
  const service = useMemo(() => SecurityService.getInstance(), []);
  const can = usePermission();
  const canManageSessions = can('sessions.manage');
  const canViewSecurity = can('security.view');
  const currentUserId = AuthService.requireAuth().id;
  const passwordPolicy = service.getPasswordPolicy();
  const toast = useToast();
  const [overview, setOverview] = useState<SecurityOverview | null>(null);
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [history, setHistory] = useState<LoginRecord[]>([]);
  const [search, setSearch] = useState('');
  const [onlyFailed, setOnlyFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [twoFactorSetup, setTwoFactorSetup] = useState<TwoFactorSetup | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorBusy, setTwoFactorBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    try {
      setOverview(service.getOverview());
      setSessions(service.getActiveSessions());
      setHistory(service.getLoginHistory({ search, onlyFailed, limit: 150 }));
      setTwoFactorEnabled(service.getSecurityStatus().twoFactorEnabled);
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تحميل بيانات الأمان.');
    } finally {
      setLoading(false);
    }
  }, [onlyFailed, search, service, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const revoke = (session: ActiveSession) => {
    if (!canManageSessions) return;
    if (!confirm(`إنهاء جلسة ${session.userName}؟`)) return;
    try {
      service.revokeSession(session.id);
      if (session.isCurrent) {
        AuthService.logout();
        window.location.reload();
        return;
      }
      toast.success('تم إنهاء الجلسة.');
      load();
    } catch (e: any) {
      toast.error(e?.message || 'تعذر إنهاء الجلسة.');
    }
  };

  const revokeAllForUser = (session: ActiveSession) => {
    if (!canManageSessions) return;
    if (!confirm(`إنهاء جميع جلسات ${session.userName}؟`)) return;
    try {
      const count = service.revokeUserSessions(session.userId);
      toast.success(`تم إنهاء ${count} جلسة.`);
      load();
    } catch (e: any) {
      toast.error(e?.message || 'تعذر إنهاء الجلسات.');
    }
  };

  const beginTwoFactorSetup = async () => {
    setTwoFactorBusy(true);
    try {
      const setup = await service.setupTwoFactorAuth(currentUserId);
      setTwoFactorSetup(setup);
      setTwoFactorCode('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر بدء إعداد التحقق الثنائي.');
    } finally {
      setTwoFactorBusy(false);
    }
  };

  const confirmTwoFactorSetup = async () => {
    if (!twoFactorCode.trim()) {
      toast.error('أدخل الرمز الظاهر في تطبيق المصادقة.');
      return;
    }
    setTwoFactorBusy(true);
    try {
      await service.confirmTwoFactorAuth(currentUserId, twoFactorCode);
      setTwoFactorEnabled(true);
      setTwoFactorCode('');
      toast.success('تم تفعيل التحقق الثنائي. احتفظ برموز الاسترداد في مكان آمن.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تأكيد التحقق الثنائي.');
    } finally {
      setTwoFactorBusy(false);
    }
  };

  const disableTwoFactor = async () => {
    if (!twoFactorCode.trim()) {
      toast.error('أدخل رمز التحقق الحالي أو رمز استرداد.');
      return;
    }
    setTwoFactorBusy(true);
    try {
      await service.disableTwoFactorAuth(currentUserId, twoFactorCode);
      setTwoFactorEnabled(false);
      setTwoFactorSetup(null);
      setTwoFactorCode('');
      toast.success('تم إيقاف التحقق الثنائي.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر إيقاف التحقق الثنائي.');
    } finally {
      setTwoFactorBusy(false);
    }
  };

  const cards = overview ? [
    { label: 'الجلسات النشطة', value: overview.activeSessions, icon: MonitorSmartphone, color: 'text-primary bg-accent-soft border-accent-border' },
    { label: 'المستخدمون النشطون', value: overview.usersCount, icon: Users, color: 'text-success bg-success-soft border-success-border' },
    { label: 'دخول ناجح (24س)', value: overview.success24h, icon: ShieldCheck, color: 'text-success bg-success-soft border-success-border' },
    { label: 'محاولات فاشلة (24س)', value: overview.failed24h, icon: AlertTriangle, color: 'text-warning bg-warning-soft border-warning-border' },
  ] : [];

  return (
    <div className="h-full flex flex-col bg-surface-muted text-ink overflow-hidden">
      <div className="bg-surface border-b border-line px-6 pt-4">
        <PageHeader
          icon={<ShieldCheck className="w-5 h-5" />}
          title="مركز الأمان"
          description="الجلسات النشطة، سجل الدخول، وسياسات الحماية"
          actions={
            <button onClick={load} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-line bg-surface-muted text-xs font-bold text-ink-secondary hover:bg-surface-sunken">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> تحديث
            </button>
          }
        />
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-5">
        {loading && !overview ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-success" /></div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {cards.map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="bg-surface border border-line rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] text-muted font-bold">{label}</p>
                    <p className="text-2xl font-black mt-1">{value}</p>
                  </div>
                  <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                </div>
              ))}
            </div>

            {canViewSecurity && (
              <section className="bg-surface border border-line rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-success" /> التحقق الثنائي لحسابي
                    </h3>
                    <p className="mt-1 text-xs text-muted">
                      الحالة: {twoFactorEnabled ? 'مفعّل' : 'غير مفعّل'}
                    </p>
                  </div>
                  {twoFactorEnabled && (
                    <span className="text-[10px] px-2 py-1 rounded bg-success-soft text-success border border-success-border font-bold">
                      محمي
                    </span>
                  )}
                </div>

                {!twoFactorEnabled && !twoFactorSetup && (
                  <button
                    type="button"
                    onClick={() => void beginTwoFactorSetup()}
                    disabled={twoFactorBusy}
                    className="px-3 py-2 rounded-lg bg-primary text-white text-xs font-bold disabled:opacity-50"
                  >
                    {twoFactorBusy ? 'جارٍ الإعداد...' : 'إعداد تطبيق المصادقة'}
                  </button>
                )}

                {twoFactorSetup && !twoFactorEnabled && (
                  <div className="space-y-3">
                    <p className="text-xs leading-5 text-ink-secondary">
                      أضف المفتاح التالي يدويًا إلى تطبيق مصادقة، ثم أدخل الرمز الحالي لإثبات الإعداد.
                    </p>
                    <div className="rounded-lg bg-surface-muted border border-line p-3">
                      <p className="text-[10px] font-bold text-muted mb-1">مفتاح الإعداد</p>
                      <code dir="ltr" className="block break-all text-sm font-bold tracking-wider text-ink">
                        {twoFactorSetup.secret}
                      </code>
                    </div>
                    <label className="block text-xs font-bold" htmlFor="security-2fa-code">رمز تطبيق المصادقة</label>
                    <input
                      id="security-2fa-code"
                      value={twoFactorCode}
                      onChange={(event) => setTwoFactorCode(event.target.value)}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      dir="ltr"
                      maxLength={12}
                      className="win-input w-full max-w-xs px-3 text-center font-mono"
                    />
                    <div>
                      <button
                        type="button"
                        onClick={() => void confirmTwoFactorSetup()}
                        disabled={twoFactorBusy}
                        className="px-3 py-2 rounded-lg bg-success text-white text-xs font-bold disabled:opacity-50"
                      >
                        تأكيد وتفعيل
                      </button>
                    </div>
                  </div>
                )}

                {twoFactorEnabled && twoFactorSetup && (
                  <div className="rounded-lg border border-warning-border bg-warning-soft p-3">
                    <p className="text-xs font-black text-warning">رموز الاسترداد — تظهر مرة واحدة</p>
                    <p className="text-[11px] leading-5 text-warning">
                      احفظ هذه الرموز في مكان آمن. كل رمز صالح لاستخدام واحد فقط.
                    </p>
                    <div dir="ltr" className="mt-2 grid grid-cols-2 gap-1 font-mono text-xs font-bold">
                      {twoFactorSetup.recoveryCodes.map((code) => <code key={code}>{code}</code>)}
                    </div>
                    <button
                      type="button"
                      onClick={() => setTwoFactorSetup(null)}
                      className="mt-3 text-[11px] font-bold text-warning underline"
                    >
                      أخفيت الرموز وحفظتها
                    </button>
                  </div>
                )}

                {twoFactorEnabled && (
                  <div className="flex flex-col sm:flex-row sm:items-end gap-2 border-t border-line pt-3">
                    <div>
                      <label className="block text-[11px] font-bold mb-1" htmlFor="security-2fa-disable-code">
                        رمز حالي أو رمز استرداد لإيقاف الميزة
                      </label>
                      <input
                        id="security-2fa-disable-code"
                        value={twoFactorCode}
                        onChange={(event) => setTwoFactorCode(event.target.value)}
                        dir="ltr"
                        autoComplete="one-time-code"
                        className="win-input w-full sm:w-64 px-3 text-center font-mono"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => void disableTwoFactor()}
                      disabled={twoFactorBusy}
                      className="px-3 py-2 rounded-lg border border-danger-border text-danger text-xs font-bold disabled:opacity-50"
                    >
                      إيقاف التحقق الثنائي
                    </button>
                  </div>
                )}
              </section>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 bg-surface border border-line rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-line flex items-center justify-between">
                  <h3 className="text-sm font-black flex items-center gap-2"><MonitorSmartphone className="w-4 h-4 text-primary" /> الجلسات النشطة</h3>
                  <span className="text-[10px] font-bold text-muted">{sessions.length} جلسة</span>
                </div>
                <DataTable
                  ariaLabel="الجلسات النشطة"
                  rows={sessions}
                  rowKey={(session) => session.id}
                  columns={[
                    {
                      key: 'user', header: 'المستخدم',
                      render: (session) => (
                        <span>
                          <span className="font-bold">{session.userName}</span>
                          {session.isCurrent && <span className="mr-2 text-[9px] px-1.5 py-0.5 rounded bg-success-soft text-success border border-success-border font-bold">الحالية</span>}
                          <span className="block text-[10px] text-muted font-mono">{session.username} · {session.role}</span>
                        </span>
                      ),
                    },
                    { key: 'device', header: 'الجهاز', render: (session) => <span className="text-xs text-ink-secondary">{session.deviceLabel || '—'}</span> },
                    { key: 'seen', header: 'آخر نشاط', render: (session) => <span className="text-xs text-muted">{fmtDate(session.lastSeenAt)}</span> },
                    {
                      key: 'action', header: 'إجراء',
                      render: (session) => (
                        <div className="flex items-center gap-1">
                          {canManageSessions && <button onClick={() => revoke(session)} className="p-1.5 rounded-lg text-danger hover:bg-danger-soft" title="إنهاء الجلسة"><LogOut className="w-4 h-4" /></button>}
                          {canManageSessions && !session.isCurrent && <button onClick={() => revokeAllForUser(session)} className="px-2 py-1 rounded-lg text-[10px] font-bold text-ink-secondary hover:bg-surface-sunken border border-line">كل الجلسات</button>}
                        </div>
                      ),
                    },
                  ]}
                  emptyTitle="لا توجد جلسات نشطة"
                />
              </div>

              <div className="bg-surface border border-line rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-line flex items-center gap-2">
                  <Lock className="w-4 h-4 text-ink-secondary" /><h3 className="text-sm font-black">سياسة الأمان الحالية</h3>
                </div>
                <div className="p-4 space-y-3 text-xs">
                  <div className="flex items-center justify-between"><span className="text-muted flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> مهلة الخمول</span><span className="font-black">{overview?.sessionTimeoutMinutes ?? 480} دقيقة</span></div>
                  <div className="flex items-center justify-between"><span className="text-muted flex items-center gap-1"><KeyRound className="w-3.5 h-3.5" /> حد محاولات الدخول</span><span className="font-black">{overview?.maxFailedAttempts ?? 5}</span></div>
                  <div className="flex items-center justify-between"><span className="text-muted">الحد الأدنى لكلمة المرور</span><span className="font-black">{passwordPolicy.minLength} أحرف</span></div>
                  <div className="flex items-center justify-between gap-2"><span className="text-muted">المتطلبات الإضافية</span><span className="text-left text-[10px] font-bold">{[
                    passwordPolicy.requireUppercase && 'حرف كبير',
                    passwordPolicy.requireNumbers && 'رقم',
                    passwordPolicy.requireSpecialChars && 'رمز خاص',
                  ].filter(Boolean).join('، ') || 'لا توجد'}</span></div>
                  <div className="flex items-center justify-between"><span className="text-muted flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> حسابات مقفلة مؤقتًا</span><span className={`font-black ${(overview?.lockedAccounts || 0) > 0 ? 'text-danger' : 'text-success'}`}>{overview?.lockedAccounts ?? 0}</span></div>
                  <div className="flex items-center justify-between"><span className="text-muted">آخر نسخة احتياطية</span><span className="font-bold text-[10px]">{fmtDate(overview?.lastBackupAt)}</span></div>
                  <p className="pt-2 border-t border-line text-[10px] leading-5 text-muted">يمكن تعديل مهلة الجلسة وحد المحاولات من إعدادات النظام ← الأمان.</p>
                </div>
              </div>
            </div>

            <div className="bg-surface border border-line rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-line flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h3 className="text-sm font-black flex items-center gap-2"><FileWarning className="w-4 h-4 text-warning" /> سجل محاولات الدخول</h3>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-muted absolute right-2.5 top-1/2 -translate-y-1/2" />
                    <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} placeholder="بحث بالمستخدم..." className="pr-8 pl-3 py-1.5 bg-surface-muted border border-line rounded-lg text-xs font-bold w-44" />
                  </div>
                  <label className="flex items-center gap-1.5 text-[11px] font-bold text-ink-secondary">
                    <input type="checkbox" checked={onlyFailed} onChange={(e) => { setOnlyFailed(e.target.checked); setTimeout(load, 0); }} /> الفاشلة فقط
                  </label>
                </div>
              </div>
              <DataTable
                ariaLabel="سجل محاولات الدخول"
                rows={history}
                rowKey={(record) => record.id}
                columns={[
                  { key: 'user', header: 'المستخدم', render: (record) => <span className="font-semibold">{record.username}</span> },
                  {
                    key: 'result', header: 'النتيجة',
                    render: (record) => (
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${record.succeeded ? 'bg-success-soft text-success border-success-border' : 'bg-danger-soft text-danger border-danger-border'}`}>
                        {record.succeeded ? 'ناجح' : 'فاشل'}
                      </span>
                    ),
                  },
                  { key: 'reason', header: 'السبب', render: (record) => <span className="text-[11px] text-muted font-mono">{record.failureReason || '—'}</span> },
                  { key: 'device', header: 'الجهاز', render: (record) => <span className="text-[11px] text-muted">{record.deviceLabel || '—'}</span> },
                  { key: 'time', header: 'التوقيت', render: (record) => <span className="text-[11px] text-muted">{fmtDate(record.createdAt)}</span> },
                ]}
                emptyTitle="لا توجد سجلات مطابقة"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};
