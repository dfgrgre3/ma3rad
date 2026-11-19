import React from 'react';
import { Warehouse } from 'lucide-react';
import { inputClass, labelClass } from '../setupConstants';
import type { SetupForm, SetupOptionControlRenderer, SetupOptions } from '../setupTypes';

interface BranchStepProps {
  options: SetupOptions;
  form: SetupForm;
  set: (key: keyof SetupForm, value: string) => void;
  optionControl: SetupOptionControlRenderer;
}

export const BranchStep: React.FC<BranchStepProps> = ({ options, form, set, optionControl }) => (
  <div className="space-y-4">
    <div className="flex items-start gap-3 rounded-xl border border-sky-100 bg-sky-50 p-3">
      <Warehouse className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" />
      <div>
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">جهّز موقع التشغيل الافتراضي</h2>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">ستُربط المبيعات والمخزون بالفرع والمخزن الافتراضيين، ويمكن إضافة مواقع أخرى لاحقًا.</p>
      </div>
    </div>
    {optionControl('branch', 'تخصيص الفرع والمخزن الآن', 'يمكن تخطي تعديل أسمائهما وبياناتهما؛ يظل الفرع والمخزن الافتراضيان الموجودان مطلوبين لتشغيل النظام.')}
    <fieldset disabled={!options.branch} className="m-0 min-w-0 space-y-4 border-0 p-0 disabled:opacity-60">
    <div>
      <label htmlFor="setup-branch-name" className={labelClass}>اسم الفرع الرئيسي *</label>
      <input id="setup-branch-name" value={form.branchName} onChange={(e) => set('branchName', e.target.value)} className={inputClass} placeholder="مثال: الفرع الرئيسي" disabled={!options.branch} />
    </div>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor="setup-branch-phone" className={labelClass}>هاتف الفرع</label>
        <input id="setup-branch-phone" value={form.branchPhone} onChange={(e) => set('branchPhone', e.target.value)} className={inputClass} disabled={!options.branch} />
      </div>
      <div>
        <label htmlFor="setup-warehouse-name" className={labelClass}>اسم المخزن الرئيسي *</label>
        <input id="setup-warehouse-name" value={form.warehouseName} onChange={(e) => set('warehouseName', e.target.value)} className={inputClass} placeholder="مثال: المخزن الرئيسي" disabled={!options.branch} />
      </div>
    </div>
    <div>
      <label htmlFor="setup-branch-address" className={labelClass}>عنوان الفرع</label>
      <input id="setup-branch-address" value={form.branchAddress} onChange={(e) => set('branchAddress', e.target.value)} className={inputClass} disabled={!options.branch} />
    </div>
    <div>
      <label htmlFor="setup-warehouse-location" className={labelClass}>موقع المخزن داخل المعرض</label>
      <input id="setup-warehouse-location" value={form.warehouseLocation} onChange={(e) => set('warehouseLocation', e.target.value)} className={inputClass} placeholder="مثال: صالة العرض أو المخزن الخلفي" disabled={!options.branch} />
    </div>
    </fieldset>
  </div>
);
