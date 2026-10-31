import React, { useEffect, useRef } from 'react';
import { CeramicMath } from '../../utils/ceramicMath';

const fmt = (n: number) => CeramicMath.formatCurrency(Number(n) || 0);

export const StatCard: React.FC<{ label: string; value: string; icon: React.ElementType; tone: string }> = ({ label, value, icon: Icon, tone }) => (
  <div className={`rounded-xl border px-3 py-2.5 ${tone}`}>
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] font-bold opacity-80">{label}</span>
      <Icon className="w-4 h-4 opacity-70" />
    </div>
    <div className="text-sm font-black mt-1 truncate">{value}</div>
  </div>
);

export const IconButton: React.FC<{ title: string; onClick: () => void; children: React.ReactNode; tone?: string }> = ({ title, onClick, children, tone }) => (
  <button title={title} onClick={onClick} className={`p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition ${tone || ''}`}>
    {children}
  </button>
);

export const Modal: React.FC<{ children: React.ReactNode; onClose: () => void; wide?: boolean }> = ({ children, onClose, wide }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };

    const previousFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="إغلاق النافذة"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="نافذة حوارية"
        tabIndex={-1}
        className={`relative z-10 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl ${wide ? 'max-w-4xl' : 'max-w-lg'} max-h-[92vh] p-6`}
      >
        {children}
      </div>
    </div>
  );
};

export const InfoBox: React.FC<{ label: string; value: string; sub?: string }> = ({ label, value, sub }) => (
  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
    <div className="text-[10px] font-bold text-slate-400">{label}</div>
    <div className="text-xs font-black text-slate-800 mt-0.5">{value}</div>
    {sub && <div className="text-[10px] text-slate-500 font-mono mt-0.5">{sub}</div>}
  </div>
);

export const SummaryRow: React.FC<{ label: string; value: number; strong?: boolean; tone?: string }> = ({ label, value, strong, tone }) => (
  <div className={`flex items-center justify-between py-0.5 text-[11px] ${strong ? 'font-black text-slate-900 text-xs' : 'text-slate-600'}`}>
    <span>{label}</span>
    <span className={`font-mono ${tone || ''}`}>{fmt(value)}</span>
  </div>
);
