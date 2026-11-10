import React, { useEffect, useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import type { OperationalFieldDefinition } from '../../services/domains/products/OperationalFieldService';
import { OperationalFieldsForm } from './OperationalFieldsForm';

export const OperationalFieldsRecordEditor: React.FC<{
  recordLabel: string;
  fields: OperationalFieldDefinition[];
  initialValues: Record<string, string>;
  canEdit: boolean;
  onSave: (values: Record<string, string>) => void;
}> = ({ recordLabel, fields, initialValues, canEdit, onSave }) => {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(initialValues);
  const [error, setError] = useState('');
  useEffect(() => setValues(initialValues), [initialValues]);
  if (!fields.length) return null;
  const save = () => {
    try {
      onSave(values);
      setOpen(false);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'تعذر حفظ الحقول.');
    }
  };
  return (
    <>
      {canEdit && <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2 py-1 text-[10px] font-bold text-teal-800 hover:bg-teal-100"><SlidersHorizontal className="h-3 w-3" /> حقول إضافية</button>}
      {open && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 p-4" dir="rtl">
        <section role="dialog" aria-modal="true" className="w-full max-w-3xl space-y-4 rounded-2xl bg-white p-5 shadow-2xl">
          <header className="flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-900">حقول إضافية · {recordLabel}</h2>
            <button type="button" onClick={() => setOpen(false)} aria-label="إغلاق" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
          </header>
          {error && <p role="alert" className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error}</p>}
          <OperationalFieldsForm fields={fields} values={values} onChange={setValues} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700">إلغاء</button>
            <button type="button" onClick={save} className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-bold text-white">حفظ الحقول</button>
          </div>
        </section>
      </div>}
    </>
  );
};
