import React from 'react';
import type { SystemSettings } from '../../../../types';
import { SwitchRow } from './SwitchRow';
import { ItemRemovalReasonsEditor } from './ItemRemovalReasonsEditor';
import type { SettingsSetter } from './types';

interface OperationsApprovalsSectionProps {
  settings: SystemSettings;
  set: SettingsSetter;
  newReasonInput: string;
  setNewReasonInput: (value: string) => void;
  showAddReason: boolean;
  setShowAddReason: (value: boolean) => void;
}

export const OperationsApprovalsSection: React.FC<OperationsApprovalsSectionProps> = ({
  settings,
  set,
  newReasonInput,
  setNewReasonInput,
  showAddReason,
  setShowAddReason,
}) => (
  <div className="rounded-2xl border border-line bg-surface dark:bg-primary/60 p-5 space-y-5">
    <div className="border-b border-line pb-3">
      <h3 className="text-sm font-black text-ink ">
        حدود الكاشير والموافقات
      </h3>
      <p className="text-[11px] text-muted mt-1">
        اللي معاه الصلاحية المباشرة بيعمل على طول، واللي صلاحيته «بموافقة المدير» بيطلب موافقة — من «الأدوار والصلاحيات». الإعدادات دي بتكمّلها.
      </p>
    </div>

    {/* أقصى خصم للكاشير من غير موافقة */}
    <div className="space-y-1.5">
      <div className="relative rounded-xl border border-line bg-surface-muted/50 dark:bg-primary/30 px-3.5 pt-2 pb-2 focus-within:border-[#1e5871] focus-within:ring-1 focus-within:ring-[#1e5871] transition">
        <label className="block text-[11px] font-bold text-ink ">
          أقصى خصم للكاشير من غير موافقة
        </label>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <input
            type="number"
            min={0}
            max={100}
            value={settings.cashierMaxDiscountPercentWithoutApproval ?? settings.discountApprovalThresholdPercent ?? 0}
            onChange={(e) => {
              const val = Number(e.target.value);
              set('cashierMaxDiscountPercentWithoutApproval', val);
              set('discountApprovalThresholdPercent', val);
            }}
            className="w-full bg-transparent text-sm font-black text-ink focus:outline-none"
          />
          <span className="text-sm font-bold text-muted select-none">%</span>
        </div>
      </div>
      <p className="text-[11px] text-muted ">
        الخصم اليدوي على الفاتورة فوق النسبة دي بيحتاج موافقة مدير، إلا لو المستخدم معاه صلاحية «خصم فوق الحد المسموح للكاشير». خصم العميل الدائم مسموح لحد نسبته.
      </p>
    </div>

    {/* طلب موافقة المدير عن بُعد */}
    <SwitchRow
      checked={settings.requireRemoteManagerApproval !== false}
      onToggle={() => set('requireRemoteManagerApproval', settings.requireRemoteManagerApproval === false ? true : false)}
      title="طلب موافقة المدير عن بُعد"
      description="الكاشير يبعت الطلب والمدير يوافق من موبايله أو من أي جهاز، من غير ما يكون جنبه. عند الإيقاف المدير لازم يدخّل اسمه وكلمة مروره على نفس الجهاز."
      containerClassName="pt-3 border-t border-line "
    />

    {/* أسباب حذف سطر من الفاتورة */}
    <ItemRemovalReasonsEditor
      settings={settings}
      set={set}
      newReasonInput={newReasonInput}
      setNewReasonInput={setNewReasonInput}
      showAddReason={showAddReason}
      setShowAddReason={setShowAddReason}
    />
  </div>
);
