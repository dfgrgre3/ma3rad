import React from 'react';
import { SlidersHorizontal } from 'lucide-react';
import type { OperationalFieldDefinition } from '../../services/domains/products/OperationalFieldService';

export interface OperationalFieldsFormProps {
  fields: OperationalFieldDefinition[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  title?: string;
  readOnly?: boolean;
}

export const OperationalFieldsForm: React.FC<OperationalFieldsFormProps> = ({
  fields, values, onChange, title = 'حقول إضافية', readOnly = false,
}) => {
  if (!fields.length) return null;
  return (
    <section className="space-y-3 rounded-2xl border border-success-border bg-success-soft/40 p-4">
      <div className="flex items-center gap-1.5 text-sm font-extrabold text-success">
        <SlidersHorizontal className="h-4 w-4" /> {title}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
        {fields.map((field) => {
          const value = values[field.id] || '';
          const className = 'w-full rounded-xl border border-success-border bg-surface px-3 py-2 text-xs font-semibold focus:border-success focus:outline-none disabled:bg-surface-muted';
          const update = (next: string) => onChange({ ...values, [field.id]: next });
          if (field.dataType === 'MULTI_SELECT' && field.values.length) {
            const selectedValues = parseMulti(value);
            const toggleOption = (optionValue: string) => {
              const next = selectedValues.includes(optionValue)
                ? selectedValues.filter((item) => item !== optionValue)
                : [...selectedValues, optionValue];
              update(JSON.stringify(next));
            };
            return (
              <fieldset key={field.id} aria-required={field.isRequired} disabled={readOnly} className="min-w-0 space-y-2 text-[11px] text-ink disabled:opacity-70">
                <legend className="font-bold">{field.name}{field.isRequired ? ' *' : ''}{field.unit ? ` (${field.unit})` : ''}</legend>
                <p className="text-[10px] font-medium text-muted">اختر كل ما ينطبق · المحدد: {selectedValues.length}</p>
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-success-border bg-surface p-2 overscroll-contain">
                  {field.values.map((option) => {
                    const checked = selectedValues.includes(option.value);
                    return (
                      <label key={option.id} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition ${checked ? 'border-success bg-success-soft text-success' : 'border-transparent hover:bg-surface-muted'}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleOption(option.value)}
                          className="h-5 w-5 shrink-0 accent-success"
                        />
                        <span className="flex-1 font-semibold">{option.label}</span>
                        {checked && <span className="text-[10px] font-bold text-success">محدد</span>}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          }
          return (
            <label key={field.id} className="space-y-1 text-[11px] font-bold text-ink">
              <span>{field.name}{field.isRequired ? ' *' : ''}{field.unit ? ` (${field.unit})` : ''}</span>
              {field.dataType === 'BOOLEAN' ? (
                <select required={field.isRequired} disabled={readOnly} value={value} onChange={(event) => update(event.target.value)} className={className}>
                  <option value="">— بدون —</option><option value="true">نعم</option><option value="false">لا</option>
                </select>
              ) : field.dataType === 'SELECT' && field.values.length ? (
                <select required={field.isRequired} disabled={readOnly} value={value} onChange={(event) => update(event.target.value)} className={className}>
                  <option value="">— بدون —</option>
                  {field.values.map((option) => <option key={option.id} value={option.value}>{option.label}</option>)}
                </select>
              ) : (
                <input
                  type={field.dataType === 'NUMBER' ? 'number' : field.dataType === 'DATE' ? 'date' : 'text'}
                  step={field.dataType === 'NUMBER' ? 'any' : undefined}
                  required={field.isRequired}
                  disabled={readOnly}
                  value={value}
                  onChange={(event) => update(event.target.value)}
                  className={className}
                />
              )}
            </label>
          );
        })}
      </div>
    </section>
  );
};

function parseMulti(value: string): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
}
