import React from 'react';
import type { SystemSettings } from '../../../../types';
import { Field, inputCls } from '../AdminSettingsFields';
import type { SettingsSetter } from './types';

interface InvoiceHeaderFooterSectionProps {
  settings: SystemSettings;
  set: SettingsSetter;
}

export const InvoiceHeaderFooterSection: React.FC<InvoiceHeaderFooterSectionProps> = ({ settings, set }) => (
  <div className="rounded-2xl border border-line bg-surface p-4 space-y-3">
    <h4 className="text-xs font-black text-ink border-b border-line pb-2">
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
