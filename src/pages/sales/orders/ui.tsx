import React from 'react';

export const Stat: React.FC<{ label: string; value: string; icon: React.ElementType; tone: string }> = ({ label, value, icon: Icon, tone }) => (
  <div className={`rounded-xl border px-3 py-2.5 ${tone}`}>
    <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-bold opacity-80">{label}</span><Icon className="w-4 h-4 opacity-70" /></div>
    <div className="text-sm font-black mt-1 truncate">{value}</div>
  </div>
);

export const IconBtn: React.FC<{ title: string; onClick: () => void; children: React.ReactNode }> = ({ title, onClick, children }) => (
  <button title={title} onClick={onClick} className="p-1.5 rounded-lg text-muted hover:bg-surface-sunken transition">{children}</button>
);

export const Modal: React.FC<{ children: React.ReactNode; onClose: () => void; wide?: boolean }> = ({ children, onClose, wide }) => (
  <div className="fixed inset-0 bg-primary/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className={`bg-surface rounded-2xl border border-line shadow-2xl w-full ${wide ? 'max-w-5xl' : 'max-w-lg'} p-6 max-h-[92vh] overflow-y-auto`}>{children}</div>
  </div>
);

export const Field: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({ label, value, onChange }) => (
  <div>
    <label className="font-bold text-ink block mb-1">{label}</label>
    <input type="number" min={0} step="0.01" value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line font-mono" />
  </div>
);

export const Info: React.FC<{ label: string; value: string; sub?: string }> = ({ label, value, sub }) => (
  <div className="bg-surface-muted border border-line rounded-xl p-3">
    <div className="text-[10px] font-bold text-muted">{label}</div>
    <div className="text-xs font-black text-ink mt-0.5">{value}</div>
    {sub && <div className="text-[10px] text-muted font-mono mt-0.5">{sub}</div>}
  </div>
);
