import React from 'react';
import { X } from 'lucide-react';
import { addControlId, hasFormControl } from './PosShared_part01';

export const Field: React.FC<{ label: string; id?: string; children: React.ReactNode }> = ({ label, id, children }) => {
  const controlId = id || `field-${label.replace(/\s+/g, '-').toLowerCase()}`;
  const hasControl = hasFormControl(children);
  const fieldChildren = hasControl ? addControlId(children, controlId) : children;

  if (!hasControl) {
    return (
      <div className="block">
        <span className="block text-[11px] font-bold text-muted mb-1">{label}</span>
        {fieldChildren}
      </div>
    );
  }

  return (
    <label htmlFor={controlId} className="block">
      <span className="block text-[11px] font-bold text-muted mb-1">{label}</span>
      {fieldChildren}
    </label>
  );
};

export const Modal: React.FC<{
  title: string;
  icon: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ title, icon, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
    <button
      type="button"
      aria-label="إغلاق النافذة"
      className="absolute inset-0 h-full w-full border-0 bg-primary/50 p-0 backdrop-blur-sm"
      onClick={onClose}
    />
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="relative bg-surface border border-line rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl"
    >
      <div className="px-5 py-4 border-b border-line flex items-center justify-between">
        <div className="flex items-center gap-2 text-primary">
          {icon}
          <h2 className="text-sm font-black text-ink">{title}</h2>
        </div>
        <button onClick={onClose} aria-label="إغلاق النافذة" className="text-muted hover:text-ink">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="p-5 max-h-[70vh] overflow-y-auto">{children}</div>
    </div>
  </div>
);
