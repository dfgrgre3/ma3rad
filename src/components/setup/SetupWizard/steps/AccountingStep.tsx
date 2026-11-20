import React from 'react';
import { Percent, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { inputClass, labelClass } from '../setupConstants';
import type {
  BusinessConfiguration,
  DefaultAdminState,
  SetupForm,
  SetupOptionControlRenderer,
  SetupOptions,
} from '../setupTypes';

interface AccountingStepProps {
  options: SetupOptions;
  form: SetupForm;
  set: (key: keyof SetupForm, value: string) => void;
  setForm: React.Dispatch<React.SetStateAction<SetupForm>>;
  businessConfig: BusinessConfiguration;
  setInventoryEnabled: (enabled: boolean) => void;
  security: DefaultAdminState;
  adminProfileError: string | null;
  passwordPolicyError: string | null;
  newPassword: string;
  setNewPassword: (value: string) => void;
  confirmPassword: string;
  setConfirmPassword: (value: string) => void;
  passwordVisible: boolean;
  setPasswordVisible: React.Dispatch<React.SetStateAction<boolean>>;
  optionControl: SetupOptionControlRenderer;
}

export const AccountingStep: React.FC<AccountingStepProps> = ({
  options,
  form,
  set,
  setForm,
  businessConfig,
  setInventoryEnabled,
  security,
  adminProfileError,
  passwordPolicyError,
  newPassword,
  setNewPassword,
  confirmPassword,
  setConfirmPassword,
  passwordVisible,
  setPasswordVisible,
  optionControl,
}) => (
  <div className="space-y-4">
    {optionControl('accounting', 'تهيئة الإعدادات المالية الآن', 'يمكنك الاحتفاظ بالإعدادات المالية الحالية أو تعديلها لاحقًا.')}
    <fieldset disabled={!options.accounting} className="m-0 min-w-0 space-y-4 border-0 p-0 disabled:opacity-60">
    <div>
      <label htmlFor="setup-fiscal-year-start-month" className={labelClass}>شهر بداية السنة المالية</label>
      <select
        id="setup-fiscal-year-start-month"
        value={form.fiscalYearStartMonth}
        onChange={(e) => set('fiscalYearStartMonth', e.target.value)}
        className={inputClass}
      >
        {['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
          .map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
      </select>
    </div>
    <div>
      <div>
        <label htmlFor="setup-default-tax" className={labelClass}>نسبة ضريبة القيمة المضافة الافتراضية %</label>
        <div className="relative">
          <Percent className="w-4 h-4 text-muted absolute left-3 top-3.5" />
          <input
            id="setup-default-tax"
            type="number" min="0" max="100" step="0.1"
            value={form.taxPercentage}
            onChange={(e) => set('taxPercentage', e.target.value)}
            className={`${inputClass} pl-9`}
          />
        </div>
      </div>
    </div>
    <div>
      <label htmlFor="setup-discount-threshold" className={labelClass}>حد الخصم المسموح بدون اعتماد %</label>
      <input
        id="setup-discount-threshold"
        type="number" min="0" max="100" step="0.5"
        value={form.discountThreshold}
        onChange={(e) => set('discountThreshold', e.target.value)}
        className={inputClass}
      />
      <p className="text-[11px] text-muted mt-1.5">
        أي خصم يتجاوز هذه النسبة سيُرسل كطلب اعتماد للمسؤول من نقطة البيع.
      </p>
    </div>

    <div>
      <div className="flex items-center justify-between gap-3 rounded-xl border border-line p-3 text-xs font-semibold text-ink ">
        <label htmlFor="setup-is-tax-inclusive" className="cursor-pointer">الأسعار شاملة الضريبة</label>
        <input id="setup-is-tax-inclusive" type="checkbox" checked={form.isTaxInclusive} onChange={(e) => setForm((prev) => ({ ...prev, isTaxInclusive: e.target.checked }))} className="h-4 w-4 accent-primary" />
      </div>
    </div>
    </fieldset>

    {optionControl('inventory', 'تهيئة المخزون الآن', 'يمكنك تخطي إعداد تتبع المخزون وطريقة التكلفة والتنبيهات، وتغييرها لاحقًا.')}
    <fieldset disabled={!options.inventory} className="m-0 min-w-0 space-y-4 border-0 p-0 disabled:opacity-60">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-line p-3 text-xs font-semibold text-ink ">
        <label htmlFor="setup-track-inventory" className="cursor-pointer">تفعيل إدارة المخزون</label>
        <input id="setup-track-inventory" type="checkbox" checked={businessConfig.trackInventory} onChange={(e) => setInventoryEnabled(e.target.checked)} className="h-4 w-4 accent-primary" />
      </div>
      <div>
        <label htmlFor="setup-low-stock-threshold" className={labelClass}>حد التنبيه للمخزون المنخفض (بوحدة الصنف)</label>
        <input
          id="setup-low-stock-threshold"
          type="number" min="0" step="0.5"
          value={form.lowStockThreshold}
          onChange={(e) => set('lowStockThreshold', e.target.value)}
          className={inputClass}
        />
      </div>
      <div className="flex items-center justify-between gap-3 rounded-xl border border-line p-3 text-xs font-semibold text-ink ">
        <label htmlFor="setup-enable-negative-stock" className="cursor-pointer">السماح بالبيع من رصيد سالب</label>
        <input id="setup-enable-negative-stock" type="checkbox" checked={form.enableNegativeStock} onChange={(e) => setForm((prev) => ({ ...prev, enableNegativeStock: e.target.checked }))} className="h-4 w-4 accent-primary" />
      </div>
    <div>
      <label htmlFor="setup-costing-method" className={labelClass}>طريقة احتساب تكلفة المخزون</label>
      <select id="setup-costing-method" value={form.costingMethod} onChange={(e) => setForm((prev) => ({ ...prev, costingMethod: e.target.value as 'AVERAGE_COST' | 'FIFO' }))} className={inputClass}>
        <option value="AVERAGE_COST">متوسط التكلفة</option>
        <option value="FIFO">الوارد أولاً يصرف أولاً (FIFO)</option>
      </select>
      <p className="mt-1.5 text-[11px] text-muted ">طريقة التكلفة تؤثر على تقييم المخزون والأرباح.</p>
    </div>
    </fieldset>

    {security.required && optionControl('users', 'تخصيص بيانات المدير الآن', 'يمكنك الاحتفاظ باسم الدخول والاسم الحاليين؛ تغيير كلمة المرور الافتراضية يظل إلزاميًا لحماية النظام.')}
    {security.error && (
      <p role="alert" className="rounded-lg border border-danger-border bg-danger-soft px-3 py-2 text-xs text-danger dark:bg-danger/30 ">
        لا يمكن إكمال تهيئة حساب المدير: {security.error}
      </p>
    )}
    {security.required && (
      <div className="rounded-xl border border-warning-border bg-warning-soft p-4 dark:border-warning/60 dark:bg-warning/30">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="w-4 h-4 text-warning" />
          <h3 className="text-xs font-bold text-warning ">تهيئة حساب المدير الأول</h3>
        </div>
        <p className="text-[11px] text-warning mb-3 dark:text-warning/80">
          تغيير بيانات الملف الشخصي اختياري؛ تغيير كلمة المرور الافتراضية إلى كلمة قوية إلزامي قبل بدء الاستخدام.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label htmlFor="setup-admin-username" className={labelClass}>اسم المستخدم *</label>
            <input
              id="setup-admin-username"
              value={form.adminUsername}
              onChange={(e) => set('adminUsername', e.target.value)}
              className={inputClass}
              autoComplete="username"
              maxLength={50}
              disabled={!options.users}
            />
          </div>
          <div>
            <label htmlFor="setup-admin-full-name" className={labelClass}>الاسم المعروض *</label>
            <input
              id="setup-admin-full-name"
              value={form.adminFullName}
              onChange={(e) => set('adminFullName', e.target.value)}
              className={inputClass}
              autoComplete="name"
              maxLength={100}
              disabled={!options.users}
            />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="setup-admin-phone" className={labelClass}>هاتف المدير (اختياري)</label>
            <input
              id="setup-admin-phone"
              type="tel"
              value={form.adminPhone}
              onChange={(e) => set('adminPhone', e.target.value)}
              className={inputClass}
              autoComplete="tel"
              maxLength={30}
              disabled={!options.users}
            />
          </div>
          <div>
            <label htmlFor="setup-admin-password" className={labelClass}>كلمة المرور الجديدة</label>
            <span className="relative block">
              <input
                id="setup-admin-password"
                type={passwordVisible ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={`${inputClass} pl-10`}
                placeholder="8 أحرف على الأقل"
                autoComplete="new-password"
                maxLength={128}
              />
              <button
                type="button"
                onClick={() => setPasswordVisible((visible) => !visible)}
                aria-label={passwordVisible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                aria-pressed={passwordVisible}
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted hover:bg-surface-sunken dark:hover:bg-primary"
              >
                {passwordVisible ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              </button>
            </span>
          </div>
          <div>
            <label htmlFor="setup-admin-password-confirmation" className={labelClass}>تأكيد كلمة المرور</label>
            <input
              id="setup-admin-password-confirmation"
              type={passwordVisible ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
              autoComplete="new-password"
              maxLength={128}
            />
          </div>
        </div>
        <p className="text-[11px] text-ink-secondary mt-2 ">
          يجب أن تحتوي كلمة المرور على 8 أحرف على الأقل، وأحرف وأرقام، وألا تطابق اسم المستخدم أو تكون كلمة المرور الافتراضية.
        </p>
        {adminProfileError && (
          <p role="alert" className="text-[11px] text-danger mt-2">{adminProfileError}</p>
        )}
        {passwordPolicyError && (
          <p role="alert" className="text-[11px] text-danger mt-2">{passwordPolicyError}</p>
        )}
      </div>
    )}
  </div>
);
