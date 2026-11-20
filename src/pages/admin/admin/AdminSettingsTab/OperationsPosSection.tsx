import React from 'react';
import type { SystemSettings } from '../../../../types';
import { Toggle } from '../AdminSettingsFields';
import { POS_PAYMENT_VISIBILITY_OPTIONS } from './constants';
import { SwitchRow } from './SwitchRow';
import type { SettingsSetter } from './types';

interface OperationsPosSectionProps {
  settings: SystemSettings;
  set: SettingsSetter;
  visiblePosPaymentMethods: number;
}

export const OperationsPosSection: React.FC<OperationsPosSectionProps> = ({
  settings,
  set,
  visiblePosPaymentMethods,
}) => (
  <>
    {/* عدد أسعار البيع للصنف مع محرر أسماء المستويات */}
    <div className="pb-4 border-b border-line space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <select
            value={settings.sellingPriceTiersCount ?? 1}
            onChange={(e) => set('sellingPriceTiersCount', Number(e.target.value))}
            className="min-w-[130px] px-3 py-1.5 bg-surface-sunken rounded-lg border border-line text-xs font-bold text-ink focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value={1}>سعر واحد</option>
            <option value={2}>سعران (2)</option>
            <option value={3}>3 أسعار</option>
            <option value={4}>4 أسعار</option>
            <option value={5}>5 أسعار</option>
          </select>
          <p className="text-[11px] text-muted ">
            كل سعر ليه اسمه — والاختيار بينهم من زر تثبيت السعر في الفاتورة
          </p>
        </div>
        <label className="text-xs font-black text-ink shrink-0">
          عدد أسعار البيع للصنف
        </label>
      </div>

      {/* محرر تخصيص أسماء أسعار البيع */}
      {(settings.sellingPriceTiersCount ?? 1) > 1 && (
        <div className="bg-surface-muted dark:bg-primary/40 p-3 rounded-xl border border-line/80 dark:border-line-strong space-y-2 mt-2">
          <div className="text-[11px] font-bold text-ink ">
            تسمية مستويات الأسعار (تظهر في زر تثبيت السعر بنقطة البيع):
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {Array.from({ length: settings.sellingPriceTiersCount ?? 1 }).map((_, tierIdx) => {
              const defaultNames = ['سعر القطاعي (الأساسي)', 'سعر الجملة', 'سعر خاص / موزع', 'سعر مشاريع', 'سعر كبار العملاء'];
              const currentNames = Array.isArray(settings.sellingPriceTierNames) ? [...settings.sellingPriceTierNames] : defaultNames;
              const currentVal = currentNames[tierIdx] || defaultNames[tierIdx] || `سعر ${tierIdx + 1}`;

              return (
                <div key={tierIdx} className="flex items-center gap-1.5 bg-surface px-2.5 py-1.5 rounded-lg border border-line text-xs">
                  <span className="font-bold text-primary shrink-0 text-[11px]">{tierIdx + 1}:</span>
                  <input
                    type="text"
                    value={currentVal}
                    onChange={(e) => {
                      const updated = [...currentNames];
                      updated[tierIdx] = e.target.value;
                      set('sellingPriceTierNames', updated as any);
                    }}
                    className="w-full bg-transparent text-xs font-semibold text-ink focus:outline-none"
                    placeholder={defaultNames[tierIdx] || `سعر ${tierIdx + 1}`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>

    <div className="space-y-3 pb-4 border-b border-line ">
      <div className="text-right">
        <div className="text-xs font-black text-ink ">طرق السداد الظاهرة في نقطة البيع</div>
        <div className="text-[11px] text-muted mt-0.5">اختر طرق السداد التي تريد إظهارها للكاشير. يجب إبقاء طريقة واحدة ظاهرة على الأقل.</div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {POS_PAYMENT_VISIBILITY_OPTIONS.map(({ key, label }) => {
          const checked = settings[key] !== false;
          return (
            <div key={key} className="space-y-1">
              <div className="text-[11px] font-bold text-ink ">{label}</div>
              <Toggle
                checked={checked}
                onChange={(value) => set(key, value)}
                label={checked ? 'ظاهر' : 'مخفي'}
                disabled={checked && visiblePosPaymentMethods <= 1}
              />
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="space-y-1">
          <div className="text-[11px] font-bold text-ink ">رمز القسيمة</div>
          <Toggle
            checked={settings.posShowCouponCode !== false}
            onChange={(value) => set('posShowCouponCode', value)}
            label={settings.posShowCouponCode !== false ? 'ظاهر' : 'مخفي'}
          />
        </div>
        <div className="space-y-1">
          <div className="text-[11px] font-bold text-ink ">عدد نقاط الولاء</div>
          <Toggle
            checked={settings.posShowLoyaltyPoints !== false}
            onChange={(value) => set('posShowLoyaltyPoints', value)}
            label={settings.posShowLoyaltyPoints !== false ? 'ظاهر' : 'مخفي'}
          />
        </div>
      </div>
    </div>

    {/* السماح بتكرار الصنف في الفاتورة */}
    <SwitchRow
      checked={!!settings.posAllowDuplicateItems}
      onToggle={() => set('posAllowDuplicateItems', !settings.posAllowDuplicateItems)}
      title="السماح بتكرار الصنف في الفاتورة"
      description="إضافة صنف موجود بالفعل تنزّله سطرًا جديدًا مستقلاً بدل زيادة الكمية — مفيد لبيع نفس الصنف بسعرين مختلفين"
      containerClassName="pb-4 border-b border-line "
    />

    {/* الحفظ التلقائي للفاتورة */}
    <SwitchRow
      checked={!!settings.posAutoSaveInvoice}
      onToggle={() => set('posAutoSaveInvoice', !settings.posAutoSaveInvoice)}
      title="الحفظ التلقائي للفاتورة"
      description="أول صنف يتضاف بيحفظ الفاتورة فورًا وكل إضافة بتحدّثها — بيأثر في المخزن مباشرة وبيطلب صلاحية تعديل الفواتير"
      containerClassName="pb-4 border-b border-line "
    />

    {/* اختيار أكثر من صنف من البحث */}
    <SwitchRow
      checked={!!settings.posMultiSelectSearch}
      onToggle={() => set('posMultiSelectSearch', !settings.posMultiSelectSearch)}
      title="اختيار أكثر من صنف من البحث"
      description="مربع جنب كل صنف في نتايج البحث وقت عمل الفاتورة: علّم الأصناف اللي عايزها واضغط «أضف المحدد» فيتضافوا كلهم مرة واحدة بكمية 1، وتقدر بعدها تعدل الكميات والأسعار لكل صنف مباشرة من الفاتورة."
      containerClassName="pb-4 border-b border-line "
    />
  </>
);
