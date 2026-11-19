import React from 'react';
import { Check, Upload } from 'lucide-react';
import type { SystemSettings } from '../../../../types';
import { ColorInput, Field, inputCls, NavigationLayoutPreview, Toggle } from '../AdminSettingsFields';
import { NAVIGATION_LAYOUT_OPTIONS } from './constants';
import type { SettingsSetter } from './types';

interface BrandingTabProps {
  settings: SystemSettings;
  set: SettingsSetter;
  onLogo: (file: File | undefined) => void;
  previewStyle: React.CSSProperties;
}

export const BrandingTab: React.FC<BrandingTabProps> = ({ settings, set, onLogo, previewStyle }) => (
  <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <Field label="اسم النظام / العلامة"><input value={settings.brandName || ''} onChange={(e) => set('brandName', e.target.value)} className={inputCls} /></Field>
      <Field label="الحروف المختصرة"><input maxLength={2} value={settings.brandShortName || ''} onChange={(e) => set('brandShortName', e.target.value)} className={`${inputCls} font-mono`} /></Field>
      <Field label="اللون الأساسي">
        <ColorInput value={settings.brandPrimaryColor || '#34445a'} onChange={(v) => set('brandPrimaryColor', v)} />
      </Field>
      <Field label="اللون الثانوي">
        <ColorInput value={settings.brandAccentColor || '#64748b'} onChange={(v) => set('brandAccentColor', v)} />
      </Field>
      <Field label="وضع العرض">
        <select value={settings.themeMode || 'light'} onChange={(e) => set('themeMode', e.target.value as SystemSettings['themeMode'])} className={inputCls}>
          <option value="light">فاتح</option>
          <option value="dark">داكن</option>
          <option value="system">حسب النظام</option>
        </select>
      </Field>
      <Field label="الخط">
        <select value={settings.fontFamily || 'Cairo'} onChange={(e) => set('fontFamily', e.target.value as SystemSettings['fontFamily'])} className={inputCls}>
          <option value="Cairo">القاهرة</option>
          <option value="Tajawal">تجوال</option>
          <option value="system-ui">خط واجهة النظام</option>
          <option value="Arial">أريال</option>
          <option value="Tahoma">تاهوما</option>
        </select>
      </Field>
      <Field label="إظهار اسم العلامة في الهيدر">
        <Toggle checked={settings.showBrandText !== false} onChange={(v) => set('showBrandText', v)} label={settings.showBrandText !== false ? 'ظاهر' : 'مخفي'} />
      </Field>
      <Field label="تخطيط التنقل في الشاشات الكبيرة" full>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {NAVIGATION_LAYOUT_OPTIONS.map((option) => {
            const active = (settings.navigationLayout || 'sidebar') === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => set('navigationLayout', option.value)}
                aria-pressed={active}
                className={`rounded-xl border p-3 text-right transition ${
                  active
                    ? 'border-sky-500 bg-sky-50 ring-1 ring-sky-500 dark:bg-sky-500/10'
                    : 'border-slate-200 hover:border-sky-300 dark:border-slate-700'
                }`}
              >
                <NavigationLayoutPreview variant={option.value} />
                <span className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{option.label}</span>
                  {active && <Check className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />}
                </span>
                <span className="mt-1 block text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">{option.hint}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          يطبَّق على الشاشات الكبيرة (1024px فأكثر). الشاشات الصغيرة تبقى على القائمة المنسدلة دائمًا.
        </p>
      </Field>
      <Field label="شعار الصورة">
        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
            <Upload className="h-4 w-4" /> اختيار صورة
            <input type="file" accept="image/*" className="hidden" onChange={(e) => onLogo(e.target.files?.[0])} />
          </label>
          {settings.brandLogoDataUrl && (
            <button onClick={() => set('brandLogoDataUrl', '')} className="rounded-lg border border-rose-200 px-2 py-2 text-[11px] font-bold text-rose-500 hover:bg-rose-50 dark:border-rose-500/30">
              إزالة
            </button>
          )}
        </div>
      </Field>
    </div>
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
      <div className="mb-2 text-xs font-bold text-slate-500">معاينة فورية</div>
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
        <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl text-lg font-black text-white shadow-lg" style={previewStyle}>
          {settings.brandLogoDataUrl ? (
            <img src={settings.brandLogoDataUrl} alt="الشعار" className="h-full w-full object-cover" />
          ) : (
            (settings.brandShortName === 'C' ? 'س' : settings.brandShortName || 'س').slice(0, 2)
          )}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-extrabold text-slate-900 dark:text-slate-100">{settings.brandName || 'سيراميسيس'}</div>
          <div className="truncate text-[11px] text-slate-500">{settings.showroomName}</div>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <span className="h-8 flex-1 rounded-lg" style={{ background: settings.brandPrimaryColor }} />
        <span className="h-8 flex-1 rounded-lg" style={{ background: settings.brandAccentColor }} />
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
        يُحفظ الشعار داخل قاعدة البيانات (Base64). للشعارات الكبيرة يُفضّل استخدام صورة مضغوطة أقل من 400KB.
      </p>
    </div>
  </div>
);
