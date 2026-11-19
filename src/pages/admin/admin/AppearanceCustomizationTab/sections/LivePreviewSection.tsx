import React from 'react';
import { Bell, Boxes, Eye, Home, Menu, Save, Search, ShoppingCart, Sparkles } from 'lucide-react';
import type { SystemSettings } from '../../../../../types';
import {
  accessibleForeground as getAccessibleForeground,
  mixHexColors,
  readableColorOnSurface,
} from '../../../../../utils/shared/themeContrast';
import { useSystemPrefersDark } from '../useSystemPrefersDark';

interface LivePreviewSectionProps {
  settings: SystemSettings;
}

export const LivePreviewSection: React.FC<LivePreviewSectionProps> = ({ settings }) => {
  const systemPrefersDark = useSystemPrefersDark();

  const previewDark = settings.themeMode === 'dark'
    || (settings.themeMode === 'system' && systemPrefersDark);
  const previewCanvas = previewDark ? '#161b22' : settings.uiCanvasColor || '#f5f6f8';
  const previewSurface = previewDark ? '#1e252e' : settings.uiSurfaceColor || '#ffffff';
  const preferredPreviewText = previewDark ? '#e7ebf0' : settings.uiTextColor || '#252b36';
  const previewCanvasText = getAccessibleForeground(previewCanvas, preferredPreviewText);
  const previewText = getAccessibleForeground(previewSurface, preferredPreviewText);
  const previewBorder = previewDark ? '#343e4a' : settings.uiBorderColor || '#e1e5ea';
  const primaryColor = settings.brandPrimaryColor || '#34445a';
  const primaryHover = mixHexColors(primaryColor, '#000000', 0.14);
  const primaryPressed = mixHexColors(primaryColor, '#000000', 0.26);
  const accentSoft = mixHexColors(primaryColor, previewSurface, 0.9);
  const accentBorder = mixHexColors(primaryColor, previewSurface, 0.72);
  const successColor = settings.uiSuccessColor || '#39765b';
  const warningColor = settings.uiWarningColor || '#8a6a35';
  const dangerColor = settings.uiDangerColor || '#a95050';
  const previewStyle = {
    '--cerami-primary': primaryColor,
    '--brand-accent': settings.brandAccentColor || '#64748b',
    '--cerami-primary-hover': primaryHover,
    '--cerami-primary-pressed': primaryPressed,
    '--cerami-primary-text': getAccessibleForeground(primaryColor),
    '--cerami-primary-hover-text': getAccessibleForeground(primaryHover),
    '--cerami-primary-pressed-text': getAccessibleForeground(primaryPressed),
    '--cerami-primary-readable': readableColorOnSurface(primaryColor, previewSurface),
    '--cerami-accent-soft': accentSoft,
    '--cerami-accent-soft-text': getAccessibleForeground(accentSoft),
    '--cerami-accent-border': accentBorder,
    '--cerami-accent-border-text': getAccessibleForeground(accentBorder),
    '--win-accent': primaryColor,
    '--win-accent-hover': primaryHover,
    '--win-accent-pressed': primaryPressed,
    '--win-accent-text': getAccessibleForeground(primaryColor),
    '--win-accent-hover-text': getAccessibleForeground(primaryHover),
    '--win-accent-pressed-text': getAccessibleForeground(primaryPressed),
    '--win-accent-readable': readableColorOnSurface(primaryColor, previewSurface),
    '--win-accent-soft': accentSoft,
    '--win-accent-soft-text': getAccessibleForeground(accentSoft),
    '--win-accent-border': accentBorder,
    '--win-radius': settings.uiCornerRadius === 'compact' ? '4px' : settings.uiCornerRadius === 'rounded' ? '10px' : '6px',
    '--cerami-surface': previewSurface,
    '--cerami-canvas': previewCanvas,
    '--cerami-canvas-text': previewCanvasText,
    '--cerami-border': previewBorder,
    '--cerami-text': previewText,
    '--cerami-surface-text': previewText,
    '--win-surface': previewSurface,
    '--win-canvas': previewCanvas,
    '--win-canvas-text': previewCanvasText,
    '--win-surface-text': previewText,
    '--win-border': previewBorder,
    '--win-text': previewText,
    '--win-text-secondary': previewText,
    '--win-text-muted': previewText,
    '--win-success': successColor,
    '--win-success-text': readableColorOnSurface(successColor, previewSurface),
    '--cerami-success-on-color': getAccessibleForeground(successColor),
    '--win-warning': warningColor,
    '--win-warning-text': readableColorOnSurface(warningColor, previewSurface),
    '--cerami-warning-on-color': getAccessibleForeground(warningColor),
    '--win-danger': dangerColor,
    '--win-danger-text': readableColorOnSurface(dangerColor, previewSurface),
    '--cerami-danger-on-color': getAccessibleForeground(dangerColor),
    '--preview-radius': settings.uiCornerRadius === 'compact' ? '4px' : settings.uiCornerRadius === 'rounded' ? '10px' : '6px',
  } as React.CSSProperties;

  return (
    <section className="win-card p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <Eye className="h-4 w-4 text-[var(--cerami-primary)]" aria-hidden="true" />
        <h3 className="text-sm font-bold text-[var(--cerami-text)]">معاينة مباشرة</h3>
      </div>
      <div
        className="customization-preview rounded-md border p-4"
        data-button-style={settings.uiButtonStyle || 'solid'}
        data-corner-radius={settings.uiCornerRadius || 'standard'}
        data-density={settings.uiDensity || 'comfortable'}
        data-font-scale={settings.uiFontScale || 'standard'}
        data-navigation-layout={settings.navigationLayout || 'sidebar'}
        data-direction={settings.interfaceDirection || 'rtl'}
        data-theme-mode={previewDark ? 'dark' : 'light'}
        dir={settings.interfaceDirection || 'rtl'}
        style={{
          ...previewStyle,
          backgroundColor: previewCanvas,
          color: previewCanvasText,
          borderColor: previewBorder,
          borderRadius: settings.uiCornerRadius === 'compact' ? 4 : settings.uiCornerRadius === 'rounded' ? 12 : 6,
          fontFamily: `${settings.fontFamily || 'Cairo'}, Tajawal, system-ui, sans-serif`,
        }}
      >
        <header className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2" style={{ backgroundColor: previewSurface, borderColor: previewBorder }}>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md text-sm font-black" style={{ backgroundColor: primaryColor, color: getAccessibleForeground(primaryColor) }}>
              {(settings.brandShortName || 'س').slice(0, 2)}
            </span>
            <div>
              <p className="text-xs font-bold" style={{ color: previewText }}>{settings.brandName || 'سيراميسيس'}</p>
              <p className="text-[10px]" style={{ color: previewText }}>إدارة المعرض</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden min-w-36 items-center gap-2 rounded-md border px-2 py-1.5 text-[10px] sm:flex" style={{ borderColor: previewBorder, color: previewText }}>
              <Search className="h-3 w-3" /> ابحث في النظام
            </div>
            <Bell className="h-4 w-4" style={{ color: previewText }} aria-hidden="true" />
            <span className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold" style={{ backgroundColor: settings.brandAccentColor || '#64748b', color: getAccessibleForeground(settings.brandAccentColor || '#64748b') }}>م</span>
          </div>
        </header>
        <div className="preview-shell">
          <nav className="preview-navigation" aria-label="معاينة عناصر التنقل">
            <span className="preview-navigation__item preview-navigation__item--active"><Home className="inline h-3.5 w-3.5" /> الرئيسية</span>
            <span className="preview-navigation__item"><Boxes className="inline h-3.5 w-3.5" /> المخزون</span>
            <span className="preview-navigation__item"><ShoppingCart className="inline h-3.5 w-3.5" /> المبيعات</span>
            <span className="preview-navigation__item"><Menu className="inline h-3.5 w-3.5" /> المشتريات</span>
          </nav>
          <main className="preview-content min-w-0" aria-label="معاينة لوحة معلومات المعرض">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-bold" style={{ color: previewText }}>لوحة المعلومات</p>
                <p className="mt-0.5 text-[10px]" style={{ color: previewText }}>ملخص أداء المعرض · اليوم</p>
              </div>
              <button type="button" className="win-btn win-btn--primary"><Save className="h-3.5 w-3.5" /> إجراء جديد</button>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {[
                { label: 'مبيعات اليوم', value: '١٢٬٤٥٠ ج.م', color: primaryColor },
                { label: 'طلبات قيد التنفيذ', value: '١٨ طلبًا', color: warningColor },
                { label: 'فواتير مكتملة', value: '٣٢ فاتورة', color: successColor },
              ].map((metric) => (
                <div key={metric.label} className="rounded-md border p-2" style={{ backgroundColor: previewSurface, borderColor: previewBorder }}>
                  <p className="text-[10px]" style={{ color: previewText }}>{metric.label}</p>
                  <p className="mt-1 text-xs font-bold" style={{ color: readableColorOnSurface(metric.color, previewSurface) }}>{metric.value}</p>
                </div>
              ))}
            </div>
            <div className="mt-2 overflow-x-auto rounded-md border" style={{ backgroundColor: previewSurface, borderColor: previewBorder }}>
              <table className="preview-table w-full min-w-[360px] text-start text-[10px]" style={{ color: previewText }}>
                <thead>
                  <tr style={{ backgroundColor: previewCanvas }}>
                    <th className="px-2 py-1.5 font-semibold">الطلب</th>
                    <th className="px-2 py-1.5 font-semibold">العميل</th>
                    <th className="px-2 py-1.5 font-semibold">الحالة</th>
                    <th className="px-2 py-1.5 font-semibold">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t" style={{ borderColor: previewBorder }}>
                    <td className="px-2 py-1.5">#١٠٤٨</td><td className="px-2 py-1.5">معرض النور</td>
                    <td className="px-2 py-1.5" style={{ color: readableColorOnSurface(successColor, previewSurface) }}>مكتمل</td><td className="px-2 py-1.5">٤٬٨٠٠ ج.م</td>
                  </tr>
                  <tr className="border-t" style={{ borderColor: previewBorder }}>
                    <td className="px-2 py-1.5">#١٠٤٧</td><td className="px-2 py-1.5">سيراميك المدينة</td>
                    <td className="px-2 py-1.5" style={{ color: readableColorOnSurface(warningColor, previewSurface) }}>قيد التجهيز</td><td className="px-2 py-1.5">٢٬٦٥٠ ج.م</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[10px]" style={{ color: readableColorOnSurface(successColor, previewCanvas) }}>
              <Sparkles className="h-3.5 w-3.5" /> تتغير المسافات والخط والاتجاه مع الإعدادات المختارة.
            </div>
          </main>
        </div>
      </div>
      <p className="mt-2 text-xs text-[var(--cerami-muted)]">
        استخدم زر «حفظ التغييرات» أعلى صفحة الإعدادات لتطبيق المعاينة على جميع الصفحات.
      </p>
    </section>
  );
};
