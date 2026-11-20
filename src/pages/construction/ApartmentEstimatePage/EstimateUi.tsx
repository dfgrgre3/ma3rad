import React from 'react';

export const NumberInput: React.FC<{
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}> = ({ label, value, min, max, step = 0.01, onChange }) => (
  <label className="block text-[10px] font-bold text-muted">
    {label}
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(Math.max(min ?? Number.NEGATIVE_INFINITY, Math.min(max ?? Number.POSITIVE_INFINITY, Number(event.target.value) || 0)))}
      className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs font-medium text-ink outline-none focus:border-primary"
    />
  </label>
);

export const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-lg border border-line bg-surface-muted px-2 py-1.5"><div className="text-[9px] text-muted">{label}</div><div className="font-bold text-ink">{value}</div></div>
);
