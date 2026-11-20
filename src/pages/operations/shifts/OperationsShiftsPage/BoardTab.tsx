import type { FC } from 'react';
import type { OperationShiftInstance } from '../../../../services/domains/operations/OperationsShiftService';
import { money } from './constants';
import type { OperationsShiftsState } from './useOperationsShifts';
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
          ['ورديات مفتوحة', kpis.open, 'text-success'],
          ['ورديات قادمة', kpis.upcoming, 'text-success'],
          ['النقدية المتوقعة', money(kpis.cash), 'text-warning'],
          ['الإنتاج المسجل', kpis.produced, 'text-primary'],
        ].map(([label, value, color]) => (
          <div key={String(label)} className="rounded-xl border border-line bg-surface p-4">
            <div className="text-xs text-muted">{label}</div>
            <div className={`text-xl font-black mt-1 ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      <div className="flex items-end gap-3 flex-wrap rounded-xl border border-line bg-surface p-4">
        <label className="text-xs font-bold text-ink-secondary">
          من
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="block mt-1 rounded-lg border border-line px-3 py-2 text-sm" />
        </label>
        <label className="text-xs font-bold text-ink-secondary">
          إلى
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="block mt-1 rounded-lg border border-line px-3 py-2 text-sm" />
        </label>
        <button type="button" onClick={loadBoard}
          className="px-4 py-2 rounded-lg bg-success text-white text-sm font-bold">عرض</button>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {([
          ['الوردية الحالية', grouped.current, 'border-success-border bg-success-soft/40'],
          ['الورديات القادمة', grouped.upcoming, 'border-success-border bg-success-soft/30'],
          ['الورديات السابقة', grouped.past, 'border-line bg-surface'],
        ] as Array<[string, OperationShiftInstance[], string]>).map(([title, list, style]) => (
          <section key={title} className={`rounded-2xl border p-3 space-y-3 ${style}`}>
            <h2 className="font-black text-ink text-sm px-1">{title} ({list.length})</h2>
            {list.length === 0 && <div className="text-xs text-muted p-4 text-center">لا توجد ورديات في هذه الفترة.</div>}
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
