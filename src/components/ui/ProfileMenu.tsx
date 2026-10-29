import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, KeyRound, LogOut, Power, User as UserIcon, X } from 'lucide-react';
import type { User } from '../../types';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import { DatabaseManager } from '../../database/db';
import { useToast } from './Toast';
import { ChangePasswordModal } from './ChangePasswordModal';

interface ProfileMenuProps {
  currentUser: User;
  onLogout?: () => void;
}

export const ProfileMenu: React.FC<ProfileMenuProps> = ({ currentUser, onLogout }) => {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [restartOpen, setRestartOpen] = useState(false);
  const [restarting, setRestarting] = useState(false);
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
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
        onClick={() => setOpen((value) => !value)}
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
        <div className="win-popover absolute left-0 top-full z-50 mt-1 w-60 overflow-hidden rounded-[2px] border border-[#b3b3b3] bg-white dark:border-[#565656] dark:bg-[#2b2b2b]">
          <div className="border-b border-[#e5e5e5] px-4 py-2.5 dark:border-[#3d3d3d]">
            <div className="truncate text-[12.5px] font-semibold text-[#1b1b1b] dark:text-[#f0f0f0]">{currentUser.fullName}</div>
            <div className="truncate text-[11px] text-[#767676] dark:text-[#a6a6a6]">@{currentUser.username} · {roleName}</div>
          </div>
          <button
            onClick={() => { setOpen(false); setPasswordOpen(true); }}
            className="win-nav-item w-full !mx-0 !text-[12px]"
          >
            <KeyRound className="win-nav-icon" /> تغيير كلمة المرور
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
