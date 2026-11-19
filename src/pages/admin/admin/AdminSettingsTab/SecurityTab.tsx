import React from 'react';
import type { SystemSettings, User } from '../../../../types';
import { Field, inputCls } from '../AdminSettingsFields';
import type { SettingsSetter } from './types';

interface SecurityTabProps {
  settings: SystemSettings;
  set: SettingsSetter;
  readOnly: boolean;
  canManageLoginSettings: boolean;
  switchableUsers: User[];
}

export const SecurityTab: React.FC<SecurityTabProps> = ({
  settings,
  set,
  readOnly,
  canManageLoginSettings,
  switchableUsers,
}) => (
  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
    <Field label="مدة انتهاء الجلسة (دقائق)">
      <input type="number" min={5} value={settings.sessionTimeoutMinutes ?? 480} onChange={(e) => set('sessionTimeoutMinutes', Number(e.target.value))} className={inputCls} />
    </Field>
    <Field label="أقصى محاولات دخول فاشلة">
      <input type="number" min={1} value={settings.maxFailedLoginAttempts ?? 5} onChange={(e) => set('maxFailedLoginAttempts', Number(e.target.value))} className={inputCls} />
    </Field>
    <Field label="طول رمز الدخول (PIN)">
      <select
        value={settings.loginPinLength ?? 4}
        onChange={(event) => set('loginPinLength', Number(event.target.value))}
        className={inputCls}
        disabled={!canManageLoginSettings || readOnly}
      >
        {[4, 5, 6, 7, 8].map((length) => <option key={length} value={length}>{length} أرقام</option>)}
      </select>
      <p className="mt-1 text-[10px] leading-5 text-slate-500 dark:text-slate-400">
        ينطبق الطول المحدد على الرموز الجديدة وطلبات التغيير، ولا يغيّر الرموز الحالية.
      </p>
    </Field>
    <Field label="فاصل النسخ الاحتياطي التلقائي (ساعات)">
      <input type="number" min={1} value={settings.autoBackupIntervalHours} onChange={(e) => set('autoBackupIntervalHours', Number(e.target.value))} className={inputCls} />
    </Field>
    <section className="md:col-span-2 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-200">الحسابات المسموح بالتبديل إليها</h4>
      <p className="mt-1 text-[10px] leading-5 text-slate-500 dark:text-slate-400">
        يحدد المدير الحسابات التي يمكن للمستخدمين الانتقال إليها من قائمة الحساب دون تسجيل الخروج.
      </p>
      {canManageLoginSettings ? (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {switchableUsers.map((user) => (
            <label key={user.id} className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-xs dark:border-slate-800">
              <input
                type="checkbox"
                checked={(settings.switchableUserIds || []).includes(user.id)}
                onChange={(event) => {
                  const current = settings.switchableUserIds || [];
                  set('switchableUserIds', event.target.checked
                    ? [...new Set([...current, user.id])]
                    : current.filter((id) => id !== user.id));
                }}
                disabled={readOnly}
                className="accent-sky-600"
              />
              <span className="min-w-0 flex-1 truncate font-bold text-slate-700 dark:text-slate-300">{user.fullName}</span>
              <span className="truncate font-mono text-[10px] text-slate-500">@{user.username}</span>
            </label>
          ))}
          {switchableUsers.length === 0 && (
            <p className="text-[11px] text-slate-500">لا توجد حسابات نشطة أخرى.</p>
          )}
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-slate-500">إدارة هذه القائمة متاحة للمدير فقط.</p>
      )}
    </section>
  </div>
);
