import type { FC } from 'react';
import type { OperationShiftInstance } from '../../../../services/domains/operations/OperationsShiftService';
import { money } from '../constants';
import type { OperationsShiftsState } from '../useOperationsShifts';
import { ShiftCard } from './ShiftCard';
import { ShiftDetailPanel } from './ShiftDetailPanel';

interface BoardTabProps {
  state: OperationsShiftsState;
}

/** Board tab: KPI cards, date-range filter, shift columns and detail panel. */
export const BoardTab: FC<BoardTabProps> = ({ state }) => {
  const {
    kpis, from, setFrom, to, setTo, loadBoard,
    grouped, detail, openDetail,
  } = state;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ['ورديات مفتوحة', kpis.open, 'text-emerald-700'],
          ['ورديات قادمة', kpis.upcoming, 'text-teal-700'],
          ['النقدية المتوقعة', money(kpis.cash), 'text-amber-700'],
          ['الإنتاج المسجل', kpis.produced, 'text-indigo-700'],
        ].map(([label, value, color]) => (
          <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-500">{label}</div>
            <div className={`text-xl font-black mt-1 ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      <div className="flex items-end gap-3 flex-wrap rounded-xl border border-slate-200 bg-white p-4">
        <label className="text-xs font-bold text-slate-600">
          من
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="block mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </label>
        <label className="text-xs font-bold text-slate-600">
          إلى
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="block mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </label>
        <button type="button" onClick={loadBoard}
          className="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-bold">عرض</button>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {([
          ['الوردية الحالية', grouped.current, 'border-emerald-200 bg-emerald-50/40'],
          ['الورديات القادمة', grouped.upcoming, 'border-teal-200 bg-teal-50/30'],
          ['الورديات السابقة', grouped.past, 'border-slate-200 bg-white'],
        ] as Array<[string, OperationShiftInstance[], string]>).map(([title, list, style]) => (
          <section key={title} className={`rounded-2xl border p-3 space-y-3 ${style}`}>
            <h2 className="font-black text-slate-700 text-sm px-1">{title} ({list.length})</h2>
            {list.length === 0 && <div className="text-xs text-slate-400 p-4 text-center">لا توجد ورديات في هذه الفترة.</div>}
            {list.map((shift) => (
              <ShiftCard
                key={shift.id}
                shift={shift}
                selected={detail?.shift.id === shift.id}
                onOpen={openDetail}
              />
            ))}
          </section>
        ))}
      </div>

      {detail && <ShiftDetailPanel state={state} />}
    </>
  );
};
