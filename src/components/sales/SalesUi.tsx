import React, { useEffect, useRef } from 'react';
import { CeramicMath } from '../../utils/products/ceramicMath';

const fmt = (n: number) => CeramicMath.formatCurrency(Number(n) || 0);


export const IconButton: React.FC<{ title: string; onClick: () => void; children: React.ReactNode; tone?: string }> = ({ title, onClick, children, tone }) => (
  <button title={title} onClick={onClick} className={`p-1.5 rounded-lg text-muted hover:bg-surface-sunken transition ${tone || ''}`}>
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
        className="absolute inset-0 bg-primary/50 backdrop-blur-sm"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="نافذة حوارية"
        tabIndex={-1}
        className={`relative z-10 w-full overflow-y-auto rounded-2xl border border-line bg-surface shadow-2xl ${wide ? 'max-w-4xl' : 'max-w-lg'} max-h-[92vh] p-6`}
      >
        {children}
      </div>
    </div>
  );
};

export const InfoBox: React.FC<{ label: string; value: string; sub?: string }> = ({ label, value, sub }) => (
  <div className="bg-surface-muted border border-line rounded-xl p-3">
    <div className="text-[10px] font-bold text-muted">{label}</div>
    <div className="text-xs font-black text-ink mt-0.5">{value}</div>
    {sub && <div className="text-[10px] text-muted font-mono mt-0.5">{sub}</div>}
  </div>
);

export const SummaryRow: React.FC<{ label: string; value: number; strong?: boolean; tone?: string }> = ({ label, value, strong, tone }) => (
  <div className={`flex items-center justify-between py-0.5 text-[11px] ${strong ? 'font-black text-ink text-xs' : 'text-ink-secondary'}`}>
    <span>{label}</span>
    <span className={`font-mono ${tone || ''}`}>{fmt(value)}</span>
  </div>
);
