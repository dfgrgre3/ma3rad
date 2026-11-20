import type { FC } from 'react';
import { AlertTriangle, ArrowRightLeft } from 'lucide-react';
import { timeOf } from './constants';
import type { OperationsShiftsState } from './useOperationsShifts';

interface ScheduleTabProps {
  state: OperationsShiftsState;
}

/** Schedule tab: auto-generation, shortage alerts, staff list, swaps. */
export const ScheduleTab: FC<ScheduleTabProps> = ({ state }) => {
  const {
    canManage, busy, scheduleMode, setScheduleMode, scheduleAnchor, setScheduleAnchor,
    currentScheduleRange, generateSchedule, loadSchedule,
    scheduleResult, scheduleShifts, detail, openDetail,
    employees, replacementForm, setReplacementForm, replaceAbsentStaff,
    swapRequests, swapForm, setSwapForm, submitSwapRequest, run, service,
  } = state;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-line bg-surface p-5 space-y-4">
        <div className="flex items-end gap-3 flex-wrap">
          <label className="text-xs font-bold text-ink-secondary">نوع الجدول
            <select value={scheduleMode} onChange={(e) => setScheduleMode(e.target.value as 'week' | 'month')}
              className="block mt-1 rounded-lg border border-line px-3 py-2 text-sm">
              <option value="week">أسبوعي</option>
              <option value="month">شهري</option>
            </select>
          </label>
          <label className="text-xs font-bold text-ink-secondary">
            {scheduleMode === 'week' ? 'اختر يوماً من الأسبوع' : 'الشهر'}
            <input type={scheduleMode === 'week' ? 'date' : 'month'}
              value={scheduleMode === 'week' ? scheduleAnchor : scheduleAnchor.slice(0, 7)}
              onChange={(e) => setScheduleAnchor(scheduleMode === 'week' ? e.target.value : `${e.target.value}-01`)}
              className="block mt-1 rounded-lg border border-line px-3 py-2 text-sm" />
          </label>
          <div className="text-xs text-muted pb-2">
            الفترة: {currentScheduleRange.from} — {currentScheduleRange.to}
          </div>
          <button type="button" disabled={!canManage || busy === 'schedule'} onClick={generateSchedule}
            className="px-4 py-2 rounded-lg bg-success text-white text-sm font-bold">
            إنشاء / توزيع الجدول تلقائياً
          </button>
          <button type="button" onClick={loadSchedule}
            className="px-4 py-2 rounded-lg border border-line text-ink text-sm font-bold">تحديث</button>
        </div>
        {scheduleResult && (
          <div className="rounded-xl bg-success-soft p-3 text-xs text-success">
            أُنشئت {scheduleResult.shiftsCreated} وردية وأضيف {scheduleResult.staffAssigned} تعيين تلقائي.
            {scheduleResult.shortages.length > 0
              ? ` يوجد نقص في ${scheduleResult.shortages.length} وردية؛ راجع القائمة قبل بدايتها.`
              : ' تمت تغطية الحد الأدنى للعمالة في جميع الورديات.'}
          </div>
        )}
        {scheduleShifts.some((shift) => shift.shortageCount > 0) && (
          <div className="rounded-xl border border-danger-border bg-danger-soft p-3 text-sm text-danger">
            <div className="font-bold flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> نقص عمالة قبل بداية الوردية</div>
            <div className="mt-1 space-y-1">
              {scheduleShifts.filter((shift) => shift.shortageCount > 0).map((shift) => (
                <div key={shift.id}>{shift.businessDate} · {shift.definitionName}: ينقص {shift.shortageCount} موظف</div>
              ))}
            </div>
          </div>
        )}
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {scheduleShifts.map((shift) => (
            <button key={shift.id} type="button" onClick={() => openDetail(shift.id)}
              className={`rounded-xl border p-3 text-right ${
                detail?.shift.id === shift.id ? 'border-success ring-2 ring-success' : 'border-line'
              }`}>
              <div className="flex justify-between gap-2">
                <span className="font-bold text-ink">{shift.definitionName}</span>
                <span className="text-xs text-muted">{shift.businessDate}</span>
              </div>
              <div className="mt-1 text-xs text-muted">
                {timeOf(shift.scheduledStart)}–{timeOf(shift.scheduledEnd)} · {shift.staffCount}/{shift.minimumStaffCount} موظف
              </div>
              {shift.shortageCount > 0 && (
                <div className="mt-2 text-xs font-bold text-danger">ينقص {shift.shortageCount} قبل البداية</div>
              )}
            </button>
          ))}
          {scheduleShifts.length === 0 && (
            <div className="col-span-full rounded-xl border border-dashed border-line-strong p-6 text-center text-sm text-muted">
              لا توجد ورديات معرفة في الفترة المحددة.
            </div>
          )}
        </div>
      </section>

      {detail && scheduleShifts.some((shift) => shift.id === detail.shift.id) && (
        <section className="rounded-2xl border border-line bg-surface p-5 space-y-3">
          <h2 className="font-black text-ink">{detail.shift.definitionName} · طاقم {detail.shift.businessDate}</h2>
          <div className="grid md:grid-cols-2 gap-2">
            {detail.staff.map((member) => (
              <div key={member.id} className="rounded-lg border border-line p-2 text-sm flex justify-between">
                <span>{member.employeeName}</span>
                <span className={member.status === 'ABSENT' ? 'text-danger' : 'text-muted'}>
                  {member.status === 'ABSENT' ? 'غائب' : member.status === 'LEAVE' ? 'إجازة' : member.checkInAt ? 'حاضر' : 'مجدول'}
                </span>
              </div>
            ))}
          </div>
          {canManage && ['PLANNED', 'MISSED'].includes(detail.shift.status) && (
            <div className="grid md:grid-cols-4 gap-2 rounded-xl bg-surface-muted p-3">
              <select value={replacementForm.absentEmployeeId}
                onChange={(e) => setReplacementForm({ ...replacementForm, absentEmployeeId: e.target.value })}
                className="rounded-lg border border-line px-2 py-2 text-xs">
                <option value="">الموظف الغائب</option>
                {detail.staff.filter((member) => !member.checkInAt && member.status !== 'ABSENT')
                  .map((member) => <option key={member.employeeId} value={member.employeeId}>{member.employeeName}</option>)}
              </select>
              <select value={replacementForm.replacementEmployeeId}
                onChange={(e) => setReplacementForm({ ...replacementForm, replacementEmployeeId: e.target.value })}
                className="rounded-lg border border-line px-2 py-2 text-xs">
                <option value="">الموظف البديل</option>
                {employees.filter((employee) => !detail.staff.some((member) => member.employeeId === employee.id))
                  .map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
              </select>
              <input value={replacementForm.notes}
                onChange={(e) => setReplacementForm({ ...replacementForm, notes: e.target.value })}
                placeholder="سبب الغياب أو ملاحظة" className="rounded-lg border border-line px-2 py-2 text-xs" />
              <button type="button" disabled={!replacementForm.absentEmployeeId || !replacementForm.replacementEmployeeId}
                onClick={replaceAbsentStaff}
                className="rounded-lg bg-warning text-white text-xs font-bold">تعيين بديل</button>
            </div>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-line bg-surface p-5 space-y-3">
        <h2 className="font-black text-ink flex items-center gap-2"><ArrowRightLeft className="h-4 w-4" /> طلب تبديل وردية بموافقة المدير</h2>
        {canManage && (
          <div className="grid md:grid-cols-5 gap-2">
            <select value={swapForm.requesterEmployeeId}
              onChange={(e) => setSwapForm({ ...swapForm, requesterEmployeeId: e.target.value })}
              className="rounded-lg border border-line px-2 py-2 text-xs">
              <option value="">الموظف الطالب</option>
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
            </select>
            <select value={swapForm.requesterShiftId}
              onChange={(e) => setSwapForm({ ...swapForm, requesterShiftId: e.target.value })}
              className="rounded-lg border border-line px-2 py-2 text-xs">
              <option value="">وردية الموظف</option>
              {scheduleShifts.filter((shift) => shift.status === 'PLANNED').map((shift) => (
                <option key={shift.id} value={shift.id}>{shift.businessDate} · {shift.definitionName}</option>
              ))}
            </select>
            <select value={swapForm.targetEmployeeId}
              onChange={(e) => setSwapForm({ ...swapForm, targetEmployeeId: e.target.value })}
              className="rounded-lg border border-line px-2 py-2 text-xs">
              <option value="">الموظف البديل</option>
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
            </select>
            <select value={swapForm.targetShiftId}
              onChange={(e) => setSwapForm({ ...swapForm, targetShiftId: e.target.value })}
              className="rounded-lg border border-line px-2 py-2 text-xs">
              <option value="">وردية الموظف البديل</option>
              {scheduleShifts.filter((shift) => shift.status === 'PLANNED').map((shift) => (
                <option key={shift.id} value={shift.id}>{shift.businessDate} · {shift.definitionName}</option>
              ))}
            </select>
            <button type="button" disabled={busy === 'swap-request' || !swapForm.requesterEmployeeId
              || !swapForm.targetEmployeeId || !swapForm.requesterShiftId || !swapForm.targetShiftId}
              onClick={submitSwapRequest}
              className="rounded-lg bg-primary text-white text-xs font-bold">إرسال للموافقة</button>
          </div>
        )}
        <div className="divide-y divide-line-strong rounded-xl border border-line">
          {swapRequests.length === 0 && <div className="p-4 text-xs text-muted text-center">لا توجد طلبات تبديل.</div>}
          {swapRequests.map((request) => (
            <div key={request.id} className="p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span>{request.requesterEmployeeName} ({request.requesterShiftDate} · {request.requesterShiftName})
                {' ↔ '}{request.targetEmployeeName} ({request.targetShiftDate} · {request.targetShiftName})</span>
              <span className="font-bold">{request.status === 'PENDING' ? 'بانتظار المدير'
                : request.status === 'APPROVED' ? 'معتمد' : 'مرفوض'}</span>
              {canManage && request.status === 'PENDING' && (
                <span className="flex gap-2">
                  <button type="button" onClick={() => run(`swap-${request.id}`,
                    () => service.decideShiftSwap(request.id, true), 'تم اعتماد التبديل.')}
                    className="rounded bg-success-soft px-2 py-1 text-success font-bold">اعتماد</button>
                  <button type="button" onClick={() => run(`swap-${request.id}`,
                    () => service.decideShiftSwap(request.id, false), 'تم رفض الطلب.')}
                    className="rounded bg-danger-soft px-2 py-1 text-danger font-bold">رفض</button>
                </span>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
