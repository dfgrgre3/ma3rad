import React from 'react';
import { Building2 } from 'lucide-react';
import { fmt } from './helpers';
import type { WarehouseSummaryGridProps } from './types';

export const WarehouseSummaryGrid: React.FC<WarehouseSummaryGridProps> = ({ warehouseSummary }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {warehouseSummary.map(w => (
      <div key={w.warehouseId} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <span className="font-black text-base text-slate-900">{w.warehouseName}</span>
          <Building2 className="w-5 h-5 text-slate-400" />
        </div>
        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-3">
            <div className="text-[10px] text-emerald-800 font-bold mb-1">إجمالي الوارد</div>
            <div className="font-mono text-sm font-black text-emerald-700">
              {w.unitTotals.map((unit: any) => <div key={unit.unitLabel}>{fmt(unit.totalIn)} {unit.unitLabel}</div>)}
            </div>
          </div>
          <div className="bg-rose-50/60 border border-rose-200 rounded-xl p-3">
            <div className="text-[10px] text-rose-800 font-bold mb-1">إجمالي الصادر</div>
            <div className="font-mono text-sm font-black text-rose-700">
              {w.unitTotals.map((unit: any) => <div key={unit.unitLabel}>{fmt(unit.totalOut)} {unit.unitLabel}</div>)}
            </div>
          </div>
        </div>
      </div>
    ))}
  </div>
);
