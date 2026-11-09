import React from 'react';
import type { OperationalFieldDefinition } from '../../services/products/OperationalFieldService';

export type OperationalFieldFilters = Record<string, string>;

export const OperationalFieldsFilter: React.FC<{
  fields: OperationalFieldDefinition[];
  values: OperationalFieldFilters;
  onChange: (values: OperationalFieldFilters) => void;
}> = ({ fields, values, onChange }) => {
  const filterable = fields.filter((field) => field.isFilterable);
  if (!filterable.length) return null;
  return (
    <div className="flex flex-wrap gap-2" dir="rtl">
      {filterable.map((field) => (
        <label key={field.id} className="min-w-36 text-[10px] font-bold text-slate-500">
          <span className="mb-1 block">{field.name}</span>
          {field.dataType === 'SELECT' && field.values.length ? (
            <select
              value={values[field.id] || ''}
              onChange={(event) => onChange({ ...values, [field.id]: event.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
            >
              <option value="">الكل</option>
              {field.values.map((option) => <option key={option.id} value={option.value}>{option.label}</option>)}
            </select>
          ) : (
            <input
              type="search"
              value={values[field.id] || ''}
              onChange={(event) => onChange({ ...values, [field.id]: event.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
            />
          )}
        </label>
      ))}
    </div>
  );
};

export const matchesOperationalFieldFilters = (
  recordId: string,
  fieldValues: Record<string, Record<string, string>>,
  filters: OperationalFieldFilters,
): boolean => Object.entries(filters).every(([fieldId, filterValue]) => {
  if (!filterValue) return true;
  const value = fieldValues[recordId]?.[fieldId] || '';
  return value.toLocaleLowerCase().includes(filterValue.toLocaleLowerCase());
});
