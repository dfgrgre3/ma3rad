import React from 'react';
import { RefreshCw, X } from 'lucide-react';

export const inputCls =
  'w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-sky-500';

export const RotateCcwIcon: React.FC = () => <RefreshCw className="w-4 h-4" />;

export const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="block text-[11px] font-bold text-slate-500 mb-1">{label}</label>
    {children}
  </div>
);

export const Modal: React.FC<{
  title: string;
  icon: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ title, icon, onClose, children }) => (
  <div className="fixed inset-0 z-50 bg-white backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
    <div
      className="bg-white border border-slate-200 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sky-600">
          {icon}
          <h2 className="text-sm font-black text-slate-900">{title}</h2>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-900">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="p-5 max-h-[70vh] overflow-y-auto">{children}</div>
    </div>
  </div>
);
