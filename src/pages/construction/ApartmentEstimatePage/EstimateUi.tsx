import React from 'react';

export const NumberInput: React.FC<{
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}> = ({ label, value, min, max, step = 0.01, onChange }) => (
  <label className="block text-[10px] font-bold text-slate-500">
    {label}
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(Math.max(min ?? Number.NEGATIVE_INFINITY, Math.min(max ?? Number.POSITIVE_INFINITY, Number(event.target.value) || 0)))}
      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-800 outline-none focus:border-sky-400"
    />
  </label>
);

export const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5"><div className="text-[9px] text-slate-400">{label}</div><div className="font-bold text-slate-700">{value}</div></div>
);
