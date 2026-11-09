import React from 'react';
import { UserPlus } from 'lucide-react';
import type { Customer } from '../../types';
import { Field, Modal, inputCls } from './PosShared';

export const NewCustomerModal: React.FC<{
  name: string;
  phone: string;
  type: Customer['customerType'];
  creditLimit: number;
  error: string;
  onNameChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onTypeChange: (value: Customer['customerType']) => void;
  onCreditLimitChange: (value: number) => void;
  onSave: () => void;
  onClose: () => void;
}> = ({ name, phone, type, creditLimit, error, onNameChange, onPhoneChange, onTypeChange, onCreditLimitChange, onSave, onClose }) => (
  <Modal title="إضافة عميل سريع" icon={<UserPlus className="w-5 h-5" />} onClose={onClose}>
    <div className="space-y-3">
      <Field label="اسم العميل *" id="new-customer-name">
        <input value={name} onChange={(e) => onNameChange(e.target.value)} placeholder="مثال: أحمد محمد" className={inputCls} />
      </Field>
      <Field label="رقم الهاتف *" id="new-customer-phone">
        <input value={phone} onChange={(e) => onPhoneChange(e.target.value)} placeholder="01xxxxxxxxx" className={inputCls} />
      </Field>
      {error && <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800">{error}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="نوع العميل" id="new-customer-type">
          <select value={type} onChange={(e) => onTypeChange(e.target.value as Customer['customerType'])} className={inputCls}>
            <option value="RETAIL">قطاعي</option>
            <option value="WHOLESALE">جملة</option>
            <option value="CONTRACTOR">مقاول</option>
            <option value="ENGINEER">مهندس</option>
          </select>
        </Field>
        <Field label="حد الائتمان" id="new-customer-credit-limit">
          <input type="number" value={creditLimit || ''} placeholder="0" onChange={(e) => onCreditLimitChange(Number.parseFloat(e.target.value) || 0)} className={inputCls} />
        </Field>
      </div>
      <button
        onClick={onSave}
        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2"
      >
        <UserPlus className="w-4 h-4" /> حفظ واختيار العميل
      </button>
    </div>
  </Modal>
);
