import React from 'react';
import type { SystemSettings } from '../../../../types';
import { Field, inputCls, Toggle } from '../AdminSettingsFields';
import type { SettingsSetter } from './types';

interface InventoryTabProps {
  settings: SystemSettings;
  set: SettingsSetter;
}

export const InventoryTab: React.FC<InventoryTabProps> = ({ settings, set }) => (
  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
    <Field label="طريقة التكلفة">
      <select value={settings.costingMethod} onChange={(e) => set('costingMethod', e.target.value as SystemSettings['costingMethod'])} className={inputCls}>
        <option value="AVERAGE_COST">متوسط التكلفة المرجح</option>
        <option value="FIFO">FIFO (الوارد أولاً يصرف أولاً)</option>
      </select>
    </Field>
    <p className="text-xs text-amber-700 md:col-span-2">الرصيد الموجود عند تفعيل FIFO يبدأ بطبقة افتتاحية تقديرية حسب تكلفة الصنف الحالية؛ الدقة الفعلية للدفعات الجديدة تبدأ من تاريخ التفعيل.</p>
    <Field label="السماح بالمخزون السالب">
      <Toggle checked={settings.enableNegativeStock} onChange={(v) => set('enableNegativeStock', v)} label={settings.enableNegativeStock ? 'مسموح' : 'ممنوع'} />
    </Field>
    <Field label="حد تنبيه المخزون المنخفض (بوحدة الصنف)">
      <input type="number" min={0} value={settings.lowStockAlertThresholdM2 ?? 20} onChange={(e) => set('lowStockAlertThresholdM2', Number(e.target.value))} className={inputCls} />
    </Field>
  </div>
);
