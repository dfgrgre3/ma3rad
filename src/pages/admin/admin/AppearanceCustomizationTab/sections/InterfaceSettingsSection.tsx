import React from 'react';
import type { SystemSettings } from '../../../../../types';
import { BUTTON_STYLES, SELECT_CLASS } from '../appearanceConstants';
import type { AppearanceOnChange } from '../appearanceTypes';

interface InterfaceSettingsSectionProps {
  settings: SystemSettings;
  readOnly: boolean;
  onChange: AppearanceOnChange;
}

export const InterfaceSettingsSection: React.FC<InterfaceSettingsSectionProps> = ({
  settings,
  readOnly,
  onChange,
}) => (
  <section className="win-card p-4 sm:p-5">
    <div className="mb-4">
      <h3 className="text-sm font-bold text-[var(--cerami-text)]">إعدادات الواجهة</h3>
      <p className="mt-1 text-xs text-[var(--cerami-muted)]">
        اضبط نمط العرض والخط والحجم والاتجاه والتخطيط بما يناسب طريقة عملك.
      </p>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-[var(--cerami-text-secondary)]">نمط الأزرار</span>
        <select
          value={settings.uiButtonStyle || 'solid'}
          onChange={(event) => onChange('uiButtonStyle', event.target.value as SystemSettings['uiButtonStyle'])}
          disabled={readOnly}
          className={SELECT_CLASS}
        >
          {BUTTON_STYLES.map((style) => <option key={style.value} value={style.value}>{style.label}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-[var(--cerami-text-secondary)]">استدارة الزوايا</span>
        <select
          value={settings.uiCornerRadius || 'standard'}
          onChange={(event) => onChange('uiCornerRadius', event.target.value as SystemSettings['uiCornerRadius'])}
          disabled={readOnly}
          className={SELECT_CLASS}
        >
          <option value="compact">زوايا صغيرة</option>
          <option value="standard">متوسطة</option>
          <option value="rounded">مستديرة</option>
        </select>
      </label>
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-[var(--cerami-text-secondary)]">كثافة الواجهة</span>
        <select
          value={settings.uiDensity || 'comfortable'}
          onChange={(event) => onChange('uiDensity', event.target.value as SystemSettings['uiDensity'])}
          disabled={readOnly}
          className={SELECT_CLASS}
        >
          <option value="comfortable">مريحة — مسافات أوسع</option>
          <option value="compact">مضغوطة — معلومات أكثر</option>
        </select>
      </label>
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-[var(--cerami-text-secondary)]">حجم الخط</span>
        <select
          value={settings.uiFontScale || 'standard'}
          onChange={(event) => onChange('uiFontScale', event.target.value as SystemSettings['uiFontScale'])}
          disabled={readOnly}
          className={SELECT_CLASS}
        >
          <option value="small">صغير</option>
          <option value="standard">قياسي</option>
          <option value="large">كبير</option>
        </select>
      </label>
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-[var(--cerami-text-secondary)]">نوع الخط</span>
        <select
          value={settings.fontFamily || 'Cairo'}
          onChange={(event) => onChange('fontFamily', event.target.value as SystemSettings['fontFamily'])}
          disabled={readOnly}
          className={SELECT_CLASS}
        >
          <option value="Cairo">القاهرة</option>
          <option value="Tajawal">تجوال</option>
          <option value="system-ui">خط واجهة النظام</option>
          <option value="Arial">أريال</option>
          <option value="Tahoma">تاهوما</option>
        </select>
      </label>
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-[var(--cerami-text-secondary)]">الوضع</span>
        <select
          value={settings.themeMode || 'light'}
          onChange={(event) => onChange('themeMode', event.target.value as SystemSettings['themeMode'])}
          disabled={readOnly}
          className={SELECT_CLASS}
        >
          <option value="light">فاتح</option>
          <option value="dark">داكن</option>
          <option value="system">حسب إعداد الجهاز</option>
        </select>
      </label>
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-[var(--cerami-text-secondary)]">تخطيط التنقل</span>
        <select
          value={settings.navigationLayout || 'sidebar'}
          onChange={(event) => onChange('navigationLayout', event.target.value as SystemSettings['navigationLayout'])}
          disabled={readOnly}
          className={SELECT_CLASS}
        >
          <option value="sidebar">قائمة جانبية</option>
          <option value="header">شريط علوي</option>
        </select>
      </label>
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-[var(--cerami-text-secondary)]">اتجاه الواجهة</span>
        <select
          value={settings.interfaceDirection || 'rtl'}
          onChange={(event) => onChange('interfaceDirection', event.target.value as SystemSettings['interfaceDirection'])}
          disabled={readOnly}
          className={SELECT_CLASS}
        >
          <option value="rtl">من اليمين إلى اليسار (RTL)</option>
          <option value="ltr">من اليسار إلى اليمين (LTR)</option>
        </select>
      </label>
    </div>
  </section>
);
