import React from 'react';
import type { OperationalFieldDefinition } from '../services/OperationalFieldService';

export const OperationalFieldsSummary: React.FC<{
  fields: OperationalFieldDefinition[];
  values: Record<string, string>;
}> = ({ fields, values }) => {
  const filled = fields.filter((field) => values[field.id] !== undefined && values[field.id] !== '');
  if (!filled.length) return null;
  return (
    <section className="rounded-xl border border-teal-200 bg-teal-50/40 p-3" dir="rtl">
      <h4 className="mb-2 text-xs font-extrabold text-teal-900">الحقول الإضافية</h4>
      <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {filled.map((field) => {
          let value = values[field.id];
          if (field.dataType === 'MULTI_SELECT') {
            try {
              const selected: unknown = JSON.parse(value);
              if (Array.isArray(selected)) {
                value = selected.map((item) => field.values.find((option) => option.value === item)?.label || item).join('، ');
              }
            } catch { /* retain historical raw value */ }
          } else {
            value = field.values.find((option) => option.value === value)?.label || value;
          }
          return <div key={field.id}><dt className="text-[10px] font-bold text-slate-500">{field.name}</dt><dd className="mt-0.5 text-xs font-semibold text-slate-800">{value}{field.unit ? ` ${field.unit}` : ''}</dd></div>;
        })}
      </dl>
    </section>
  );
};
