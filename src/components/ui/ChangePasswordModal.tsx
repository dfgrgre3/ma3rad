import React from 'react';
import { X } from 'lucide-react';
interface Props { current: string; next: string; confirm: string; busy: boolean; setCurrent: (value: string) => void; setNext: (value: string) => void; setConfirm: (value: string) => void; onClose: () => void; onSubmit: (event: React.FormEvent) => void }
export const ChangePasswordModal: React.FC<Props> = ({ current, next, confirm, busy, setCurrent, setNext, setConfirm, onClose, onSubmit }) => (
<div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 p-4" dir="rtl">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-slate-100">تغيير كلمة المرور</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">كلمة المرور الحالية مطلوبة لتأكيد التغيير.</p>
              </div>
              <button onClick={() => { onClose(); onClose(); }} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="إغلاق">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={onSubmit} className="space-y-3">
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
);
