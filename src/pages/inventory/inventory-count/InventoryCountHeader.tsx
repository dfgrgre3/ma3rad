import React from 'react';
import { Plus, ScanLine } from 'lucide-react';

interface InventoryCountHeaderProps {
  onCreateSession: () => void;
}

export const InventoryCountHeader: React.FC<InventoryCountHeaderProps> = ({ onCreateSession }) => {
  return (
    <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
          <ScanLine className="w-5 h-5 text-violet-600" />
        </div>
        <div>
          <h1 className="text-base font-black text-slate-900">جرد المخزون (Inventory Count)</h1>
          <p className="text-xs text-slate-500 font-medium">متابعة ومطابقة الجرد الدوري والمفاجئ للمخازن والمعارض</p>
        </div>
      </div>
      <button
        onClick={onCreateSession}
        className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm font-semibold transition shrink-0"
      >
        <Plus className="w-4 h-4" />
        بدء جلسة جرد جديدة
      </button>
    </div>
  );
};
