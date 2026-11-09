import React from 'react';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import type { Toast } from '../../types/pos';

export const toastColor: Record<Toast['type'], string> = {
  success: 'bg-emerald-600 border-emerald-400',
  error: 'bg-rose-600 border-rose-400',
  info: 'bg-sky-600 border-sky-400',
  warning: 'bg-amber-500 border-amber-400',
};

export const PosToast: React.FC<{ toast: Toast | null }> = ({ toast }) => {
  if (!toast) return null;
  return (
    <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-xl border text-slate-900 text-xs font-bold shadow-2xl flex items-center gap-2 ${toastColor[toast.type]}`}>
      {toast.type === 'error' ? <AlertCircle className="w-4 h-4" /> : toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <Info className="w-4 h-4" />}
      {toast.message}
    </div>
  );
};
