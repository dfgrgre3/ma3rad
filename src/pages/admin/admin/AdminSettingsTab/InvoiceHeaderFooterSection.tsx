import React from 'react';
import type { SystemSettings } from '../../../../types';
import { Field, inputCls } from '../AdminSettingsFields';
import type { SettingsSetter } from './types';

interface InvoiceHeaderFooterSectionProps {
  settings: SystemSettings;
  set: SettingsSetter;
}

export const InvoiceHeaderFooterSection: React.FC<InvoiceHeaderFooterSectionProps> = ({ settings, set }) => (
  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
    <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 pb-2">
      نصوص الترويسة والتذييل وشروط الاسترجاع
    </h4>

    <div className="grid grid-cols-1 gap-3">
      <Field label="ترويسة الفاتورة (نص إضافي أو رسالة ترحيبية)">
        <textarea
          rows={2}
          value={settings.receiptHeader || ''}
          onChange={(e) => set('receiptHeader', e.target.value)}
          placeholder="مثال: أهلاً بكم في معرضنا - نسعد بخدمتكم دائماً"
          className={inputCls}
        />
      </Field>
      <Field label="تذييل الفاتورة وشروط الاسترجاع والاستبدال">
        <textarea
          rows={3}
          value={settings.receiptFooter || ''}
          onChange={(e) => set('receiptFooter', e.target.value)}
          placeholder="مثال: البضاعة المباعة ترد وتستبدل خلال 14 يوماً مع إحضار أصل الفاتورة وبحالتها الأصلية بالكرتونة السليمة."
          className={inputCls}
        />
      </Field>
    </div>
  </div>
);
