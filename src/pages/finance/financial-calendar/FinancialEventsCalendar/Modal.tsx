import React from 'react';
import { X } from 'lucide-react';

export const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-primary/50 p-3 sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-label={title} className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-surface p-4 shadow-2xl sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-black text-ink">{title}</h2>
        <button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-lg p-2 text-muted hover:bg-surface-sunken"><X className="h-4 w-4" /></button>
      </div>
      {children}
    </section>
  </div>
);
