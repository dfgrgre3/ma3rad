import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { BUSINESS_TYPES } from '../../../../config/businessProfiles';
import type { BusinessConfiguration, DefaultAdminState, SetupForm, SetupOptions } from '../setupTypes';

interface ReviewStepProps {
  options: SetupOptions;
  form: SetupForm;
  businessConfig: BusinessConfiguration;
  security: DefaultAdminState;
  currencySymbol: string;
}

const MONTH_NAMES = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

export const ReviewStep: React.FC<ReviewStepProps> = ({ options, form, businessConfig, security, currencySymbol }) => (
  <div className="space-y-3">
    <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 mx-auto">
      <CheckCircle2 className="w-8 h-8" />
    </div>
    <h2 className="text-center text-base font-black text-slate-900 dark:text-slate-100">كل شيء جاهز</h2>
    <p className="text-center text-xs text-slate-500 dark:text-slate-400">راجع الملخص ثم اضغط «بدء الاستخدام».</p>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
      {[
        ['المعرض', options.company ? form.showroomName || '—' : 'تم تخطيها'],
        ['الاسم القانوني', options.company ? form.legalName || form.showroomName || '—' : 'تم تخطيها'],
        ...(security.required ? [
          ['مدير النظام', options.users ? form.adminFullName || '—' : security.fullName],
          ['اسم دخول المدير', options.users ? form.adminUsername || '—' : security.username],
        ] : []),
        ['الفرع الافتراضي', options.branch ? form.branchName || '—' : 'تم تخطي تعديل الاسم'],
        ['المخزن الافتراضي', options.branch ? form.warehouseName || '—' : 'تم تخطي تعديل الاسم'],
        ['نوع النشاط', options.modules ? (form.businessType === 'custom' ? form.businessTypeLabel || 'نشاط مخصص' : BUSINESS_TYPES.find((type) => type.id === form.businessType)?.label || 'معرض متعدد الأنشطة') : 'تم تخطيها'],
        ['الأنشطة الفرعية', options.modules ? businessConfig.additionalActivityIds
          .map((id) => BUSINESS_TYPES.find((type) => type.id === id)?.label || id)
          .join('، ') || 'لا توجد' : 'تم تخطيها'],
        ['الوحدات المفعلة', options.modules ? `${form.enabledModules.length} وحدات` : 'تم تخطيها'],
        ['نموذج العمل', options.modules ? (businessConfig.businessModel === 'services' ? 'خدمات' : businessConfig.businessModel === 'mixed' ? 'منتجات وخدمات' : 'منتجات') : 'تم تخطيه'],
        ['إدارة المخزون', options.inventory ? (businessConfig.trackInventory ? 'مفعلة' : 'معطلة') : 'تم تخطي الإعداد'],
        ['وحدات القياس', options.modules ? `${businessConfig.units.length + businessConfig.customUnits.length} وحدات` : 'تم تخطيها'],
        ['الهاتف', options.company ? form.phone || '—' : 'تم تخطيها'],
        ['العملة', options.company ? `${form.currency} (${currencySymbol})` : 'تم تخطيها'],
        ['بداية السنة المالية', options.accounting ? (MONTH_NAMES[Number(form.fiscalYearStartMonth) - 1] || 'يناير') : 'تم تخطيها'],
        ['الضريبة الافتراضية', options.accounting ? `${form.taxPercentage || 0}%` : 'تم تخطيها'],
        ['تنبيه المخزون', options.inventory ? `${form.lowStockThreshold || 0} بوحدة الصنف` : 'تم تخطيه'],
        ['حد اعتماد الخصم', options.accounting ? `${form.discountThreshold || 0}%` : 'تم تخطيه'],
      ].map(([label, value]) => (
        <div key={label} className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-800/50">
          <span className="min-w-0 truncate text-[11px] text-slate-500 dark:text-slate-400">{label}</span>
          <span className="min-w-0 max-w-[60%] truncate text-xs font-bold text-slate-900 dark:text-slate-100" title={value}>{value}</span>
        </div>
      ))}
    </div>
    <div className="rounded-xl border border-sky-100 bg-sky-50 p-3 text-xs leading-relaxed text-sky-900 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-200">
      <p className="font-bold">البيانات والحسابات</p>
      <p className="mt-1">سيُجهّز دليل الحسابات الافتراضي. استيراد الأصناف والعملاء والموردين اختياري ويمكن تنفيذه بعد الدخول من صفحة استيراد البيانات، ثم إدخال الأرصدة الافتتاحية من شاشاتها المخصصة.</p>
    </div>
  </div>
);
