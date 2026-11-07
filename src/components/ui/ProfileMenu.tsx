import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Building2, Check, ChevronDown, ChevronLeft, KeyRound, LogOut, Moon, Power, Sun, User as UserIcon, Users, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { User } from '../../types';
import { useTheme } from '../../contexts/useTheme';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import { DatabaseManager } from '../../database/db';
import { useToast } from './Toast';
import { ChangePasswordModal } from './ChangePasswordModal';

interface ProfileMenuProps {
  currentUser: User;
  unreadNotifications?: number;
  onLogout?: () => void;
  onSwitchUser?: (userId: string) => void;
  branches: Array<{ id: string; name: string; code: string }>;
  activeBranchId: string;
  onBranchChange: (branchId: string) => void;
}

export const ProfileMenu: React.FC<ProfileMenuProps> = ({
  currentUser,
  unreadNotifications = 0,
  onLogout,
  onSwitchUser,
  branches,
  activeBranchId,
  onBranchChange,
}) => {
  const toast = useToast();
  const navigate = useNavigate();
  const { resolvedMode, toggleMode } = useTheme();
  const [open, setOpen] = useState(false);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [restartOpen, setRestartOpen] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [switchableUsers, setSwitchableUsers] = useState<User[]>([]);
  const [pinSettingsOpen, setPinSettingsOpen] = useState(false);
  const [pinStatus, setPinStatus] = useState<{ hasPin: boolean; pending: boolean; requestedAt?: string } | null>(null);
  const [requestedPin, setRequestedPin] = useState('');
  const [confirmedPin, setConfirmedPin] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  const roleName = useMemo(() => {
    try {
      return PermissionService.getRoles().find((role) => role.code === currentUser.role)?.name || currentUser.role;
    } catch {
      return currentUser.role;
    }
  }, [currentUser.role]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        setBranchMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!open) return;
    try {
      setSwitchableUsers(AuthService.getSwitchableUsers());
      setPinStatus(new AuthService().getOwnLoginPinStatus());
    } catch (error) {
      toast.error('تعذر تحميل إعدادات الحساب', error instanceof Error ? error.message : String(error));
    }
  }, [open, currentUser.id, toast]);

  const resetForm = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
  };

  const submitPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (next.length < 6) {
      toast.error('كلمة المرور قصيرة', 'يجب أن تكون كلمة المرور الجديدة 6 أحرف على الأقل.');
      return;
    }
    if (next !== confirm) {
      toast.error('كلمتا المرور غير متطابقتين', 'أعد كتابة كلمة المرور الجديدة بنفس القيمة.');
      return;
    }
    setBusy(true);
    try {
      new AuthService().changeOwnPassword(currentUser.id, current, next);
      toast.success('تم تغيير كلمة المرور', 'استخدم كلمة المرور الجديدة في تسجيل الدخول القادم.');
      setPasswordOpen(false);
      resetForm();
    } catch (error) {
      toast.error('تعذر تغيير كلمة المرور', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const submitPinChange = async (event: React.FormEvent) => {
    event.preventDefault();
    const length = AuthService.getLoginPinLength();
    if (requestedPin.length !== length) {
      toast.error('رمز الدخول غير صالح', `أدخل ${length} أرقام بالضبط.`);
      return;
    }
    if (requestedPin !== confirmedPin) {
      toast.error('الرمزان غير متطابقين', 'أعد إدخال رمز الدخول نفسه للتأكيد.');
      return;
    }
    setBusy(true);
    try {
      await new AuthService().requestOwnLoginPinChange(requestedPin);
      setPinStatus((status) => ({ hasPin: status?.hasPin ?? false, pending: true }));
      setRequestedPin('');
      setConfirmedPin('');
      setPinSettingsOpen(false);
      toast.success('تم إرسال طلب تغيير رمز الدخول', 'سيعمل الرمز الجديد بعد موافقة المدير.');
    } catch (error) {
      toast.error('تعذر إرسال طلب تغيير الرمز', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const restartApp = async () => {
    setRestarting(true);
    try {
      // Persist the newest SQLite snapshot before the process is replaced.
      const database = DatabaseManager.getInstance();
      database.saveToStorage();
      await database.flush();

      const relaunch = window.ceramisys?.app?.relaunch;
      if (relaunch) {
        await relaunch();
        return;
      }
      window.location.reload();
    } catch (error) {
      setRestarting(false);
      setRestartOpen(false);
      toast.error('تعذر إعادة تشغيل التطبيق', error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => {
          setOpen((value) => !value);
          setBranchMenuOpen(false);
        }}
        className="flex min-h-8 items-center gap-2 rounded-[2px] border border-transparent px-2 hover:border-[#d9d9d9] hover:bg-[#f0f0f0] dark:hover:border-[#4a4a4a] dark:hover:bg-[#3a3a3a]"
        title="حسابي"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-[2px] bg-[#0078d4] text-[11px] font-bold text-white">
          <UserIcon className="h-3.5 w-3.5" />
        </span>
        <div className="hidden text-right sm:block">
          <div className="max-w-[140px] truncate text-[12px] font-semibold text-[#1b1b1b] dark:text-[#f0f0f0]">{currentUser.fullName}</div>
          <div className="text-[10px] font-semibold text-[#0078d4]">@{currentUser.username}</div>
        </div>
        <ChevronDown className={`hidden h-3.5 w-3.5 text-[#767676] sm:block ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="win-popover absolute left-0 top-full z-50 mt-1 w-60 rounded-[2px] border border-[#b3b3b3] bg-white dark:border-[#565656] dark:bg-[#2b2b2b]">
          <div className="border-b border-[#e5e5e5] px-4 py-2.5 dark:border-[#3d3d3d]">
            <div className="truncate text-[12.5px] font-semibold text-[#1b1b1b] dark:text-[#f0f0f0]">{currentUser.fullName}</div>
            <div className="truncate text-[11px] text-[#767676] dark:text-[#a6a6a6]">@{currentUser.username} · {roleName}</div>
          </div>
          {branches.length > 1 && (
            <div className="relative border-b border-[#e5e5e5] dark:border-[#3d3d3d]">
              <button
                type="button"
                onClick={() => setBranchMenuOpen((value) => !value)}
                className="win-nav-item w-full !mx-0 !text-[12px]"
                aria-haspopup="menu"
                aria-expanded={branchMenuOpen}
              >
                <Building2 className="win-nav-icon !text-[#0078d4]" />
                <span className="min-w-0 flex-1 truncate text-right">
                  الفرع: {branches.find((branch) => branch.id === activeBranchId)?.name || 'اختيار الفرع'}
                </span>
                <ChevronLeft className="h-3.5 w-3.5 shrink-0 text-[#767676]" />
              </button>
              {branchMenuOpen && (
                <div
                  className="win-popover absolute left-full top-0 z-[60] ml-1 w-56 rounded-[2px] border border-[#b3b3b3] bg-white py-1 dark:border-[#565656] dark:bg-[#2b2b2b]"
                  role="menu"
                  aria-label="اختيار الفرع"
                >
                  {branches.map((branch) => (
                    <button
                      key={branch.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={branch.id === activeBranchId}
                      onClick={() => {
                        setBranchMenuOpen(false);
                        setOpen(false);
                        onBranchChange(branch.id);
                      }}
                      className="win-nav-item w-full !mx-0 !text-[12px]"
                    >
                      <span className="min-w-0 flex-1 truncate text-right">{branch.name} · {branch.code}</span>
                      {branch.id === activeBranchId && <Check className="h-4 w-4 shrink-0 text-[#0078d4]" />}
                    </button>
                  ))}
                </div>
              )}
              {switchableUsers.length > 0 && onSwitchUser && (
                <div className="border-b border-[#e5e5e5] py-1 dark:border-[#3d3d3d]">
                  <div className="px-4 py-1 text-[10px] font-bold text-[#767676]">التبديل إلى حساب</div>
                  {switchableUsers.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        try {
                          onSwitchUser(user.id);
                        } catch (error) {
                          toast.error('تعذر التبديل إلى الحساب', error instanceof Error ? error.message : String(error));
                        }
                      }}
                      className="win-nav-item w-full !mx-0 !text-[12px]"
                    >
                      <Users className="win-nav-icon !text-[#0078d4]" />
                      <span className="min-w-0 flex-1 truncate text-right">{user.fullName}</span>
                      <span className="max-w-20 truncate font-mono text-[10px] text-[#767676]">@{user.username}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => { setOpen(false); navigate('/notifications'); }}
            className="win-nav-item relative w-full !mx-0 !text-[12px] sm:hidden"
            title={unreadNotifications ? `لديك ${unreadNotifications} إشعار غير مقروء` : 'الإشعارات'}
            aria-label={unreadNotifications ? `الإشعارات، ${unreadNotifications} غير مقروء` : 'الإشعارات'}
          >
            <Bell className="win-nav-icon" /> الإشعارات
            {unreadNotifications > 0 && (
              <span className="mr-auto min-w-[18px] rounded-[2px] bg-[#c42b1c] px-1 text-center text-[10px] font-bold leading-[16px] text-white">
                {unreadNotifications > 99 ? '99+' : unreadNotifications}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); toggleMode(); }}
            className="win-nav-item w-full !mx-0 !text-[12px]"
            aria-label={resolvedMode === 'dark' ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الداكن'}
          >
            {resolvedMode === 'dark' ? <Sun className="win-nav-icon" /> : <Moon className="win-nav-icon" />}
            {resolvedMode === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'}
          </button>
          <button
            onClick={() => { setOpen(false); setPasswordOpen(true); }}
            className="win-nav-item w-full !mx-0 !text-[12px]"
          >
            <KeyRound className="win-nav-icon" /> تغيير كلمة المرور
          </button>
          <button
            onClick={() => { setOpen(false); setPinSettingsOpen(true); }}
            className="win-nav-item w-full !mx-0 !text-[12px]"
          >
            <KeyRound className="win-nav-icon" /> إعدادات رمز الدخول
          </button>
          <button
            onClick={() => { setOpen(false); setRestartOpen(true); }}
            className="win-nav-item w-full !mx-0 !text-[12px]"
          >
            <Power className="win-nav-icon" /> إعادة تشغيل التطبيق
          </button>
          {onLogout && (
            <button
              onClick={() => { setOpen(false); onLogout(); }}
              className="win-nav-item w-full !mx-0 !text-[12px] !text-[#c42b1c]"
            >
              <LogOut className="win-nav-icon !text-[#c42b1c]" /> تسجيل الخروج
            </button>
          )}
        </div>
      )}

      {passwordOpen && <ChangePasswordModal current={current} next={next} confirm={confirm} busy={busy} setCurrent={setCurrent} setNext={setNext} setConfirm={setConfirm} onClose={() => { setPasswordOpen(false); resetForm(); }} onSubmit={submitPassword} />}

      {pinSettingsOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/35 p-4" dir="rtl">
          <div className="w-full max-w-md rounded-[2px] border border-[#b3b3b3] bg-white p-5 dark:border-[#565656] dark:bg-[#2b2b2b]" role="dialog" aria-modal="true" aria-labelledby="login-pin-settings-title">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 id="login-pin-settings-title" className="text-[14px] font-semibold text-[#1b1b1b] dark:text-[#f0f0f0]">إعدادات رمز الدخول</h3>
                <p className="mt-1 text-[12px] leading-5 text-[#4d4d4d] dark:text-[#c8c8c8]">
                  رمز الدخول مكوّن من {AuthService.getLoginPinLength()} أرقام. لا نعرض الرمز الحالي؛ يُحفظ مشفّرًا لحماية حسابك.
                </p>
              </div>
              <button onClick={() => setPinSettingsOpen(false)} className="win-btn win-btn--ghost !min-h-7 !px-1.5" aria-label="إغلاق">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mb-4 rounded-[2px] border border-[#e5e5e5] bg-[#f7f7f7] px-3 py-2 text-[12px] dark:border-[#3d3d3d] dark:bg-[#252525]">
              {pinStatus?.pending
                ? 'لديك طلب تغيير رمز دخول بانتظار موافقة المدير.'
                : pinStatus?.hasPin
                  ? 'تم تعيين رمز دخول لحسابك. يمكنك طلب تغييره أدناه.'
                  : 'لم يتم تعيين رمز دخول لحسابك بعد.'}
            </div>
            {!pinStatus?.pending && (
              <form onSubmit={submitPinChange} className="space-y-3">
                <label className="block text-[11px] font-semibold text-[#4d4d4d] dark:text-[#c8c8c8]">
                  رمز الدخول الجديد
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    maxLength={AuthService.getLoginPinLength()}
                    value={requestedPin}
                    onChange={(event) => setRequestedPin(event.target.value.replace(/\D/g, ''))}
                    className="win-input mt-1 w-full text-center font-mono tracking-[0.3em]"
                  />
                </label>
                <label className="block text-[11px] font-semibold text-[#4d4d4d] dark:text-[#c8c8c8]">
                  تأكيد رمز الدخول
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    maxLength={AuthService.getLoginPinLength()}
                    value={confirmedPin}
                    onChange={(event) => setConfirmedPin(event.target.value.replace(/\D/g, ''))}
                    className="win-input mt-1 w-full text-center font-mono tracking-[0.3em]"
                  />
                </label>
                <p className="text-[10px] leading-5 text-[#767676]">
                  سيظل الرمز الحالي فعالًا حتى يعتمد المدير طلب التغيير.
                </p>
                <button type="submit" className="win-btn win-btn--primary w-full">
                  إرسال الطلب للمدير
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {restartOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/35 p-4" dir="rtl">
          <div className="w-full max-w-md rounded-[2px] border border-[#b3b3b3] bg-white p-5 dark:border-[#565656] dark:bg-[#2b2b2b]" role="dialog" aria-modal="true">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-[14px] font-semibold text-[#1b1b1b] dark:text-[#f0f0f0]">إعادة تشغيل التطبيق</h3>
                <p className="mt-1 text-[12px] text-[#4d4d4d] dark:text-[#c8c8c8]">
                  سيتم إغلاق البرنامج وتشغيله من جديد. احفظ أي عمل غير محفوظ قبل المتابعة.
                </p>
              </div>
              <button
                onClick={() => setRestartOpen(false)}
                disabled={restarting}
                className="win-btn win-btn--ghost !min-h-7 !px-1.5 disabled:opacity-50"
                aria-label="إغلاق"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={restartApp}
                disabled={restarting}
                className="win-btn win-btn--primary flex-1 disabled:opacity-60"
              >
                {restarting ? 'جارٍ إعادة التشغيل…' : 'إعادة التشغيل الآن'}
              </button>
              <button
                onClick={() => setRestartOpen(false)}
                disabled={restarting}
                className="win-btn disabled:opacity-50"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
