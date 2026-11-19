import type { FC } from 'react';
import { Users, Wallet } from 'lucide-react';
import type { OperationShiftInstance } from '../../../../services/domains/operations/OperationsShiftService';
import { money, STATUS_LABELS, STATUS_STYLES, timeOf } from './constants';

interface ShiftCardProps {
  shift: OperationShiftInstance;
  selected: boolean;
  onOpen: (id: string) => void;
}

/** Compact shift card used in the board columns. */
export const ShiftCard: FC<ShiftCardProps> = ({ shift, selected, onOpen }) => (
  <button
    type="button"
    onClick={() => onOpen(shift.id)}
    className={`w-full text-right rounded-xl border p-4 transition hover:shadow-md ${
      selected ? 'border-teal-500 ring-2 ring-teal-100' : 'border-slate-200 bg-white'
    }`}
  >
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: shift.definitionName ? '#0f766e' : '#94a3b8' }} />
          <span className="font-bold text-slate-800">{shift.definitionName}</span>
          <span className={`text-[11px] px-2 py-0.5 rounded-full border ${STATUS_STYLES[shift.status] || STATUS_STYLES.PLANNED}`}>
            {STATUS_LABELS[shift.status] || shift.status}
          </span>
        </div>
        <div className="text-xs text-slate-500 mt-1">
          {shift.businessDate} · {timeOf(shift.scheduledStart)} - {timeOf(shift.scheduledEnd)}
          {shift.department ? ` · ${shift.department}` : ''}
        </div>
      </div>
      <div className="text-left text-xs text-slate-500">
        <div className="flex items-center gap-1 justify-end"><Users className="w-3.5 h-3.5" /> {shift.presentCount}/{shift.staffCount}</div>
        <div className="flex items-center gap-1 justify-end mt-1"><Wallet className="w-3.5 h-3.5" /> {money(shift.expectedCash)}</div>
        {shift.shortageCount > 0 && (
          <div className="text-rose-700 font-bold mt-1">نقص {shift.shortageCount}</div>
        )}
      </div>
    </div>
    <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
      <span className="rounded-lg bg-slate-50 p-2 text-slate-600">إنتاج: {shift.producedQty}</span>
      <span className="rounded-lg bg-slate-50 p-2 text-slate-600">هالك: {shift.scrapQty}</span>
      <span className={`rounded-lg p-2 ${shift.openIncidents ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-600'}`}>
        ملاحظات: {shift.openIncidents}
      </span>
    </div>
  </button>
);
