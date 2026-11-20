import React from 'react';
import type { SystemSettings } from '../../../../types';
import { Field, inputCls, Toggle } from '../AdminSettingsFields';
import type { SettingsSetter } from './types';
import { OperationsPosSection } from './OperationsPosSection';
import { OperationsStockSection } from './OperationsStockSection';
import { OperationsApprovalsSection } from './OperationsApprovalsSection';

interface OperationsTabProps {
  settings: SystemSettings;
  set: SettingsSetter;
  visiblePosPaymentMethods: number;
  newReasonInput: string;
  setNewReasonInput: (value: string) => void;
  showAddReason: boolean;
  setShowAddReason: (value: boolean) => void;
}

export const OperationsTab: React.FC<OperationsTabProps> = ({
  settings,
  set,
  visiblePosPaymentMethods,
  newReasonInput,
  setNewReasonInput,
  showAddReason,
  setShowAddReason,
}) => (
  <div className="space-y-6">
    {/* إعدادات نقطة البيع والفواتير المطابقة للتصميم */}
    <div className="rounded-2xl border border-line bg-surface dark:bg-primary/60 p-5 space-y-4">
      <OperationsPosSection
        settings={settings}
        set={set}
        visiblePosPaymentMethods={visiblePosPaymentMethods}
      />
      <OperationsStockSection settings={settings} set={set} />
    </div>

    {/* حدود الكاشير والموافقات مطابق تماماً للتصميم المرفق */}
    <OperationsApprovalsSection
      settings={settings}
      set={set}
      newReasonInput={newReasonInput}
      setNewReasonInput={setNewReasonInput}
      showAddReason={showAddReason}
      setShowAddReason={setShowAddReason}
    />

    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <Field label="حد اعتماد الخصم %">
        <input type="number" min={0} max={100} value={settings.discountApprovalThresholdPercent ?? 10} onChange={(e) => set('discountApprovalThresholdPercent', Number(e.target.value))} className={inputCls} />
      </Field>
      <Field label="رسوم التوصيل الافتراضية">
        <input type="number" min={0} value={settings.defaultDeliveryFee ?? 0} onChange={(e) => set('defaultDeliveryFee', Number(e.target.value))} className={inputCls} />
      </Field>
      <Field label="أيام سماح الأقساط">
        <input type="number" min={0} value={settings.installmentGraceDays ?? 3} onChange={(e) => set('installmentGraceDays', Number(e.target.value))} className={inputCls} />
      </Field>
      <Field label="اعتماد إجباري لتسويات المخزون">
        <Toggle checked={!!settings.requireApprovalForStockAdjustments} onChange={(v) => set('requireApprovalForStockAdjustments', v)} label={settings.requireApprovalForStockAdjustments ? 'مطلوب' : 'غير مطلوب'} />
      </Field>
      <Field label="اعتماد إجباري لتغيير الأسعار">
        <Toggle checked={!!settings.requireApprovalForPriceChanges} onChange={(v) => set('requireApprovalForPriceChanges', v)} label={settings.requireApprovalForPriceChanges ? 'مطلوب' : 'غير مطلوب'} />
      </Field>
    </div>
  </div>
);
