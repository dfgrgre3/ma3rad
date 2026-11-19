import React from 'react';
import type { SystemSettings } from '../../../../types';
import { Field, inputCls, Toggle } from '../AdminSettingsFields';
import type { SettingsSetter } from './types';

interface GeneralTabProps {
  settings: SystemSettings;
  set: SettingsSetter;
}

export const GeneralTab: React.FC<GeneralTabProps> = ({ settings, set }) => (
  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
    <Field label="اسم المعرض *"><input value={settings.showroomName} onChange={(e) => set('showroomName', e.target.value)} className={inputCls} /></Field>
    <Field label="الوصف / الشعار النصي"><input value={settings.tagline || ''} onChange={(e) => set('tagline', e.target.value)} className={inputCls} /></Field>
    <Field label="الهاتف الأساسي"><input value={settings.phone} onChange={(e) => set('phone', e.target.value)} className={`${inputCls} font-mono`} /></Field>
    <Field label="هاتف إضافي"><input value={settings.phone2 || ''} onChange={(e) => set('phone2', e.target.value)} className={`${inputCls} font-mono`} /></Field>
    <Field label="العنوان" full><input value={settings.address} onChange={(e) => set('address', e.target.value)} className={inputCls} /></Field>
    <Field label="الرقم الضريبي"><input value={settings.taxNumber || ''} onChange={(e) => set('taxNumber', e.target.value)} className={`${inputCls} font-mono`} /></Field>
    <Field label="السجل التجاري"><input value={settings.commercialRecord || ''} onChange={(e) => set('commercialRecord', e.target.value)} className={`${inputCls} font-mono`} /></Field>
    <Field label="العملة (كود)"><input value={settings.currency} onChange={(e) => set('currency', e.target.value)} className={`${inputCls} font-mono`} /></Field>
    <Field label="رمز العملة"><input value={settings.currencySymbol} onChange={(e) => set('currencySymbol', e.target.value)} className={inputCls} /></Field>
    <Field label="نسبة الضريبة الافتراضية %"><input type="number" min={0} step="0.01" value={settings.defaultTaxPercentage} onChange={(e) => set('defaultTaxPercentage', Number(e.target.value))} className={inputCls} /></Field>
    <Field label="الأسعار شاملة الضريبة">
      <Toggle checked={settings.isTaxInclusive} onChange={(v) => set('isTaxInclusive', v)} label={settings.isTaxInclusive ? 'نعم، شاملة' : 'لا، الضريبة تُضاف'} />
    </Field>
  </div>
);
