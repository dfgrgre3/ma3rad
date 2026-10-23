import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, KeyRound, LogOut, User as UserIcon, X } from 'lucide-react';
import type { User } from '../../types';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import { useToast } from './Toast';

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

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
        title="حسابي"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-600 text-xs font-bold text-white">
          <UserIcon className="h-4 w-4" />
        </div>
        <div className="hidden text-right sm:block">
          <div className="max-w-[140px] truncate text-xs font-bold text-slate-900 dark:text-slate-100">{currentUser.fullName}</div>
          <div className="text-[10px] font-extrabold text-sky-600 dark:text-sky-400">{roleName}</div>
        </div>
        <ChevronDown className={`hidden h-3.5 w-3.5 text-slate-400 transition sm:block ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <div className="truncate text-sm font-black text-slate-900 dark:text-slate-100">{currentUser.fullName}</div>
            <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">@{currentUser.username} · {roleName}</div>
          </div>
          <button
            onClick={() => { setOpen(false); setPasswordOpen(true); }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <KeyRound className="h-4 w-4 text-sky-500" /> تغيير كلمة المرور
          </button>
          {onLogout && (
            <button
              onClick={() => { setOpen(false); onLogout(); }}
              className="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-2.5 text-xs font-bold text-rose-600 transition hover:bg-rose-50 dark:border-slate-800 dark:hover:bg-rose-500/10"
            >
              <LogOut className="h-4 w-4" /> تسجيل الخروج
            </button>
          )}
        </div>
      )}

      {passwordOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 p-4" dir="rtl">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-slate-100">تغيير كلمة المرور</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">كلمة المرور الحالية مطلوبة لتأكيد التغيير.</p>
              </div>
              <button onClick={() => { setPasswordOpen(false); resetForm(); }} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="إغلاق">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={submitPassword} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">كلمة المرور الحالية</label>
                <input
                  type="password"
                  value={current}
                  onChange={(event) => setCurrent(event.target.value)}
                  required
                  autoFocus
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">كلمة المرور الجديدة</label>
                <input
                  type="password"
                  value={next}
                  onChange={(event) => setNext(event.target.value)}
                  required
                  minLength={6}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">تأكيد كلمة المرور</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  required
                  minLength={6}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-sky-700 disabled:opacity-60"
              >
                {busy ? 'جارٍ الحفظ…' : 'حفظ كلمة المرور'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
