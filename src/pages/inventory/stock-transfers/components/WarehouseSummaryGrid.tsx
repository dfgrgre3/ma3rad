import React from 'react';
import { Building2 } from 'lucide-react';
import { fmt } from './helpers';
import type { WarehouseSummaryGridProps } from '../../../../types/inventory/stockTransfers';

export const WarehouseSummaryGrid: React.FC<WarehouseSummaryGridProps> = ({ warehouseSummary }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {warehouseSummary.map(w => (
      <div key={w.warehouseId} className="bg-surface border border-line rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <span className="font-black text-base text-ink">{w.warehouseName}</span>
          <Building2 className="w-5 h-5 text-muted" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-center">
          <div className="bg-success-soft/60 border border-success-border rounded-xl p-3">
            <div className="text-[10px] text-success font-bold mb-1">إجمالي الوارد</div>
            <div className="font-mono text-sm font-black text-success">
              {w.unitTotals.map((unit: any) => <div key={unit.unitLabel}>{fmt(unit.totalIn)} {unit.unitLabel}</div>)}
            </div>
          </div>
          <div className="bg-danger-soft/60 border border-danger-border rounded-xl p-3">
            <div className="text-[10px] text-danger font-bold mb-1">إجمالي الصادر</div>
            <div className="font-mono text-sm font-black text-danger">
              {w.unitTotals.map((unit: any) => <div key={unit.unitLabel}>{fmt(unit.totalOut)} {unit.unitLabel}</div>)}
            </div>
          </div>
        </div>
      </div>
    ))}
  </div>
);
