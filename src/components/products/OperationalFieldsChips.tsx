import React from 'react';
import type { OperationalFieldDefinition } from '../../services/domains/products/OperationalFieldService';

interface OperationalFieldsChipsProps {
  fields: OperationalFieldDefinition[];
  /** fieldId → raw stored value (OperationalFieldService.getRecordValues shape). */
  values: Record<string, string> | undefined;
  /** Max chips rendered before collapsing the rest into "+n". */
  max?: number;
}

const formatChipValue = (field: OperationalFieldDefinition, raw: string): string => {
  if (field.dataType === 'BOOLEAN') return raw === 'true' || raw === '1' ? 'نعم' : 'لا';
  const option = field.values?.find((o) => o.value === raw);
  return option?.label || raw;
};

/**
 * Compact per-record display of activity operational fields for list rows
 * and cards: renders "name: value" chips only for fields that actually have
 * a value, so each activity surfaces exactly its own data (tile area for
 * ceramics, room number for hotels, plate number for auto-parts...).
 */
export const OperationalFieldsChips: React.FC<OperationalFieldsChipsProps> = ({ fields, values, max = 3 }) => {
  if (!values) return <span className="text-muted">—</span>;
  const chips = fields
    .map((field) => {
      const raw = values[field.id];
      if (raw === undefined || raw === null || raw === '') return null;
      return { id: field.id, label: `${field.name}: ${formatChipValue(field, raw)}` };
    })
    .filter((chip): chip is { id: string; label: string } => chip !== null);

  if (chips.length === 0) return <span className="text-muted">—</span>;
  const shown = chips.slice(0, max);
  const rest = chips.length - shown.length;
  return (
    <div className="flex max-w-[220px] flex-wrap gap-1">
      {shown.map((chip) => (
        <span
          key={chip.id}
          className="max-w-full truncate rounded-md border border-accent-border bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-primary dark:bg-primary/40 "
          title={chip.label}
        >
          {chip.label}
        </span>
      ))}
      {rest > 0 && (
        <span className="rounded-md bg-surface-sunken px-1.5 py-0.5 text-[10px] font-bold text-muted ">
          +{rest}
        </span>
      )}
    </div>
  );
};

export default OperationalFieldsChips;
