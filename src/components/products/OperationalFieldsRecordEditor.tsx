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
      {canEdit && <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 rounded-lg border border-success-border bg-success-soft px-2 py-1 text-[10px] font-bold text-success hover:bg-success-soft"><SlidersHorizontal className="h-3 w-3" /> حقول إضافية</button>}
      {open && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-primary/40 p-4">
        <section role="dialog" aria-modal="true" className="w-full max-w-3xl space-y-4 rounded-2xl bg-surface p-5 shadow-2xl">
          <header className="flex items-center justify-between">
            <h2 className="text-sm font-black text-ink">حقول إضافية · {recordLabel}</h2>
            <button type="button" onClick={() => setOpen(false)} aria-label="إغلاق" className="rounded-lg p-2 text-muted hover:bg-surface-sunken"><X className="h-4 w-4" /></button>
          </header>
          {error && <p role="alert" className="rounded-lg bg-danger-soft p-2 text-xs text-danger">{error}</p>}
          <OperationalFieldsForm fields={fields} values={values} onChange={setValues} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-surface-sunken px-4 py-2 text-xs font-bold text-ink">إلغاء</button>
            <button type="button" onClick={save} className="rounded-lg bg-success px-4 py-2 text-xs font-bold text-white">حفظ الحقول</button>
          </div>
        </section>
      </div>}
    </>
  );
};
