import React from 'react';
import type { SystemSettings } from '../../../../types';
import { SwitchRow } from './SwitchRow';
import type { SettingsSetter } from './types';

interface OperationsStockSectionProps {
  settings: SystemSettings;
  set: SettingsSetter;
}

export const OperationsStockSection: React.FC<OperationsStockSectionProps> = ({ settings, set }) => (
  <>
    {/* 1. السماح بالبيع على المكشوف */}
    <SwitchRow
      checked={!!settings.allowOverdraftSale}
      onToggle={() => set('allowOverdraftSale', !settings.allowOverdraftSale)}
      title="السماح بالبيع على المكشوف"
      description="بيع كمية أكبر من المتاح بالمخزن للجميع. عند الإيقاف: المدير العام وأصحاب الصلاحية بالإعدادين اللي تحت هما بس اللي يقدروا يبيعوا على المكشوف."
      containerClassName="pb-4 border-b border-slate-100 dark:border-slate-800"
    />

    {/* 2. الصنف اللي رصيده مش كفاية يتباع كمحجوز */}
    <SwitchRow
      checked={!!settings.insufficientStockAsReserved}
      onToggle={() => set('insufficientStockAsReserved', !settings.insufficientStockAsReserved)}
      title="الصنف اللي رصيده مش كفاية يتباع كمحجوز"
      description="بدل ما الفاتورة تترفض بتتحوّل لـ«تسليم بأذونات» لوحدها وتظهر في فواتير الأذونات — لصاحب صلاحية «بيع الصنف اللي رصيده مش كفاية كمحجوز»."
      containerClassName="pb-4 border-b border-slate-100 dark:border-slate-800"
    />

    {/* 3. قفل البيع على الكمية المحجوزة */}
    <SwitchRow
      checked={!!settings.lockSaleOnReservedQty}
      onToggle={() => set('lockSaleOnReservedQty', !settings.lockSaleOnReservedQty)}
      title="قفل البيع على الكمية المحجوزة"
      description="المتاح للبيع = الرصيد ناقص المحجوز لفواتير تحت التسليم في نفس المخزن. الفاتورة اللي محتاجة أكتر بتترفض ومش بتتحوّل لأذونات — إلا لصاحب الصلاحية."
      containerClassName="pb-4 border-b border-slate-100 dark:border-slate-800"
    />

    {/* 4. منع البيع بأذونات للصنف اللي مفيش منه كمية */}
    <SwitchRow
      checked={!!settings.preventPermitSaleWithoutStock}
      onToggle={() => set('preventPermitSaleWithoutStock', !settings.preventPermitSaleWithoutStock)}
      title="منع البيع بأذونات للصنف اللي مفيش منه كمية"
      description="فاتورة «تسليم بأذونات» فيها صنف أكتر من المتاح في المخزن (الرصيد ناقص المحجوز) بتترفض، ومفيش تحويل تلقائي لأذونات. الزرار يفضل شغّال لكن الفاتورة تتطلب توفير الرصيد أولاً."
      containerClassName="pb-4 border-b border-slate-100 dark:border-slate-800"
    />

    {/* 5. منع إذن التسليم على المكشوف */}
    <SwitchRow
      checked={!!settings.preventOverdraftDeliveryPermit}
      onToggle={() => set('preventOverdraftDeliveryPermit', !settings.preventOverdraftDeliveryPermit)}
      title="منع إذن التسليم على المكشوف"
      description="إذن التسليم (عمله وتعديله واعتماده و«صرف كل الباقي» وتسليم البند) بيترفض لو رصيد المخزن اللي هيتسلّم منه مش كفاية — اختار مخزن فيه البضاعة. إلا لصاحب صلاحية «عمل إذن تسليم بأكتر من رصيد المخزن»"
      containerClassName="pb-4 border-b border-slate-100 dark:border-slate-800"
      descriptionClassName="leading-relaxed"
    />

    {/* 6. السماح للمدير العام بالبيع على المكشوف */}
    <SwitchRow
      checked={!!settings.allowAdminOverdraftSale}
      onToggle={() => set('allowAdminOverdraftSale', !settings.allowAdminOverdraftSale)}
      title="السماح للمدير العام بالبيع على المكشوف"
      description="لما «السماح بالبيع على المكشوف» مقفول: المدير العام ما يبيعش بأكتر من المتاح إلا لو ده مفعّل"
      containerClassName="pb-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 p-2.5 rounded-xl"
    />

    {/* 7. السماح لأصحاب صلاحية «البيع على المكشوف» */}
    <SwitchRow
      checked={!!settings.allowPermissionHoldersOverdraftSale}
      onToggle={() => set('allowPermissionHoldersOverdraftSale', !settings.allowPermissionHoldersOverdraftSale)}
      title="السماح لأصحاب صلاحية «البيع على المكشوف»"
      description="لما «السماح بالبيع على المكشوف» مقفول: المستخدم اللي معاه الصلاحية (زي دور «مدير فرع») ما يبيعش بأكتر من المتاح إلا لو ده مفعّل"
      containerClassName="pb-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 p-2.5 rounded-xl"
    />

    {/* 8. الخصم على الصنف الواحد في الفاتورة */}
    <SwitchRow
      checked={settings.allowLineItemDiscount !== false}
      onToggle={() => set('allowLineItemDiscount', settings.allowLineItemDiscount === false ? true : false)}
      title="الخصم على الصنف الواحد في الفاتورة"
      description="علامة صغيرة على كل صنف في الفاتورة تحط عليه خصم (مبلغ أو نسبة) يطّلع من سعره بس. لأصحاب صلاحية «منح خصم على الفاتورة»، وبيتحسب في «أقصى خصم يدوي للكاشير»"
      containerClassName="pb-4 border-b border-slate-100 dark:border-slate-800"
      descriptionClassName="leading-relaxed"
    />

    {/* 9. المرتجع لازم يتربط بفاتورة أو بعميل */}
    <SwitchRow
      checked={!!settings.returnRequiresInvoiceOrCustomer}
      onToggle={() => set('returnRequiresInvoiceOrCustomer', !settings.returnRequiresInvoiceOrCustomer)}
      title="المرتجع لازم يتربط بفاتورة أو بعميل"
      description="عند التشغيل: المرتجع لازم يتربط بالفاتورة الأصلية أو بالعميل، وسعره بيتجاب من البيع الفعلي (صافي بعد الخصم). عند الإيقاف: المرتجع الحر بسعر البيع الحالي أو اليدوي متاح."
      containerClassName="pb-4 border-b border-slate-100 dark:border-slate-800"
    />

    {/* 10. الفواتير الجديدة تحت التسليم (بإذن تسليم) */}
    <SwitchRow
      checked={!!settings.newInvoicesUnderDelivery}
      onToggle={() => set('newInvoicesUnderDelivery', !settings.newInvoicesUnderDelivery)}
      title="الفواتير الجديدة تحت التسليم (بإذن تسليم)"
      description="عند التشغيل: الفاتورة الجديدة بتبدأ «تسليم على دفعات» والبضاعة ما بتخرجش من المخزن غير بإذن تسليم. عند الإيقاف: الفاتورة «تم التسليم فوراً» ويتم الخصم المباشر من المخزن."
      containerClassName="pb-4 border-b border-slate-100 dark:border-slate-800"
    />

    {/* 11. ضريبة القيمة المضافة على التوصيل */}
    <SwitchRow
      checked={!!settings.vatOnDeliveryFee}
      onToggle={() => set('vatOnDeliveryFee', !settings.vatOnDeliveryFee)}
      title="ضريبة القيمة المضافة على التوصيل"
      description="عند التشغيل: رسوم التوصيل في الفاتورة بتتحسب عليها ضريبة وبتدخل ضريبة الفاتورة وإجمالها، وبتنزل في الفاتورة الإلكترونية بند خاضع. عند الإيقاف: رسوم التوصيل غير خاضعة للضريبة."
    />
  </>
);
