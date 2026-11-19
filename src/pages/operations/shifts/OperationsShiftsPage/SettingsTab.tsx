import type { FC } from 'react';
import { Plus } from 'lucide-react';
import { WEEKDAYS, WORK_MODES } from './constants';
import { emptyDefinition } from './types';
import type { OperationsShiftsState } from './useOperationsShifts';

interface SettingsTabProps {
  state: OperationsShiftsState;
}

/** Settings tab: work mode, shift definitions CRUD, employee assignments. */
export const SettingsTab: FC<SettingsTabProps> = ({ state }) => {
  const {
    canManage, busy, run, service,
    workMode, setWorkMode, saveDefinition, definitions, setDefinitionForm, definitionForm,
    employees, assignments, assignmentForm, setAssignmentForm, saveAssignment,
  } = state;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-black text-slate-800">نظام العمل</h2>
          <div className="flex items-center gap-2">
            <select value={workMode} onChange={(e) => setWorkMode(e.target.value as typeof workMode)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
              {WORK_MODES.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
            </select>
            <button type="button" disabled={!canManage || busy === 'mode'}
              onClick={() => run('mode', () => service.saveWorkMode(workMode), 'تم حفظ نظام العمل.')}
              className="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-bold">حفظ</button>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-black text-slate-800">تعريفات الورديات</h2>
            {canManage && <button type="button" onClick={() => setDefinitionForm(emptyDefinition())}
              className="text-xs font-bold text-teal-700 flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> جديد</button>}
          </div>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {definitions.map((definition) => (
              <button key={definition.id} type="button"
                onClick={() => setDefinitionForm({
                  id: definition.id, name: definition.name, department: definition.department || '',
                  location: definition.location || '', shiftCode: definition.shiftCode || '',
                  color: definition.color || '#0f766e', startTime: definition.startTime.slice(0, 5),
                  endTime: definition.endTime.slice(0, 5), breakMinutes: definition.breakMinutes,
                  graceMinutes: definition.graceMinutes, overtimeAfterMinutes: definition.overtimeAfterMinutes,
                  minimumStaffCount: definition.minimumStaffCount,
                  requiredRestMinutes: definition.requiredRestMinutes,
                  workdays: definition.workdays, shiftOrder: definition.shiftOrder,
                })}
                className="w-full text-right rounded-xl border border-slate-200 p-3 hover:bg-slate-50">
                <div className="flex justify-between gap-2">
                  <span className="font-bold text-slate-700 text-sm">{definition.name}</span>
                  <span className="text-xs text-slate-500">{definition.startTime.slice(0, 5)} - {definition.endTime.slice(0, 5)}</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  {definition.department || 'بدون قسم'} · {definition.assignedCount} موظف
                  · الحد الأدنى {definition.minimumStaffCount}
                  {definition.crossesMidnight ? ' · تمتد بعد منتصف الليل' : ''}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
          <h2 className="font-black text-slate-800">{definitionForm.id ? 'تعديل وردية' : 'وردية جديدة'}</h2>
          <div className="grid grid-cols-2 gap-2">
            {([
              ['name', 'اسم الوردية'], ['department', 'القسم'], ['location', 'الموقع'], ['shiftCode', 'كود الوردية'],
            ] as Array<[keyof typeof definitionForm, string]>).map(([key, label]) => (
              <label key={key} className="text-[11px] font-bold text-slate-500">{label}
                <input value={String(definitionForm[key] || '')}
                  onChange={(e) => setDefinitionForm({ ...definitionForm, [key]: e.target.value })}
                  className="block w-full mt-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
              </label>
            ))}
            <label className="text-[11px] font-bold text-slate-500">البداية
              <input type="time" value={definitionForm.startTime}
                onChange={(e) => setDefinitionForm({ ...definitionForm, startTime: e.target.value })}
                className="block w-full mt-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
            </label>
            <label className="text-[11px] font-bold text-slate-500">النهاية
              <input type="time" value={definitionForm.endTime}
                onChange={(e) => setDefinitionForm({ ...definitionForm, endTime: e.target.value })}
                className="block w-full mt-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
            </label>
            {([
              ['breakMinutes', 'استراحة (د)'], ['graceMinutes', 'سماحية تأخير (د)'],
              ['overtimeAfterMinutes', 'إضافي بعد (د)'], ['minimumStaffCount', 'الحد الأدنى للعاملين'],
              ['requiredRestMinutes', 'الراحة بين الورديات (د)'], ['shiftOrder', 'الترتيب'],
            ] as Array<[keyof typeof definitionForm, string]>).map(([key, label]) => (
              <label key={key} className="text-[11px] font-bold text-slate-500">{label}
                <input type="number" min={0} value={Number(definitionForm[key] || 0)}
                  onChange={(e) => setDefinitionForm({ ...definitionForm, [key]: Number(e.target.value) })}
                  className="block w-full mt-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
              </label>
            ))}
            <label className="text-[11px] font-bold text-slate-500">اللون
              <input type="color" value={definitionForm.color}
                onChange={(e) => setDefinitionForm({ ...definitionForm, color: e.target.value })}
                className="block w-full mt-1 h-9 rounded-lg border border-slate-200 px-1 py-1" />
            </label>
            <div className="col-span-2">
              <div className="text-[11px] font-bold text-slate-500 mb-1">أيام العمل</div>
              <div className="flex gap-1 flex-wrap">
                {WEEKDAYS.map((label, day) => (
                  <button key={label} type="button"
                    onClick={() => setDefinitionForm({
                      ...definitionForm,
                      workdays: definitionForm.workdays.includes(day)
                        ? definitionForm.workdays.filter((value) => value !== day)
                        : [...definitionForm.workdays, day],
                    })}
                    className={`px-2 py-1 rounded-lg text-[11px] font-bold border ${
                      definitionForm.workdays.includes(day)
                        ? 'bg-teal-600 text-white border-teal-600'
                        : 'bg-white text-slate-500 border-slate-200'
                    }`}>{label}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" disabled={!canManage || !definitionForm.name || busy === 'definition'}
              onClick={saveDefinition}
              className="flex-1 rounded-lg bg-teal-600 text-white text-sm font-bold py-2">حفظ الوردية</button>
            {definitionForm.id && (
              <button type="button" disabled={!canManage}
                onClick={() => run('deactivate', () => service.deactivateShiftDefinition(definitionForm.id), 'تم إيقاف الوردية.')}
                className="px-3 rounded-lg border border-rose-200 text-rose-600 text-sm font-bold">إيقاف</button>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
        <h2 className="font-black text-slate-800">تعيين الموظفين على الورديات</h2>
        {canManage && (
          <div className="grid md:grid-cols-6 gap-2">
            <select value={assignmentForm.definitionId}
              onChange={(e) => setAssignmentForm({ ...assignmentForm, definitionId: e.target.value })}
              className="rounded-lg border border-slate-200 px-2 py-2 text-xs">
              <option value="">الوردية</option>
              {definitions.map((definition) => <option key={definition.id} value={definition.id}>{definition.name}</option>)}
            </select>
            <select value={assignmentForm.employeeId}
              onChange={(e) => setAssignmentForm({ ...assignmentForm, employeeId: e.target.value })}
              className="rounded-lg border border-slate-200 px-2 py-2 text-xs">
              <option value="">الموظف</option>
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
            </select>
            <select value={assignmentForm.role}
              onChange={(e) => setAssignmentForm({ ...assignmentForm, role: e.target.value as 'STAFF' | 'SUPERVISOR' })}
              className="rounded-lg border border-slate-200 px-2 py-2 text-xs">
              <option value="STAFF">موظف</option><option value="SUPERVISOR">مشرف</option>
            </select>
            <input type="date" value={assignmentForm.effectiveFrom}
              onChange={(e) => setAssignmentForm({ ...assignmentForm, effectiveFrom: e.target.value })}
              className="rounded-lg border border-slate-200 px-2 py-2 text-xs" />
            <input type="date" value={assignmentForm.effectiveTo}
              onChange={(e) => setAssignmentForm({ ...assignmentForm, effectiveTo: e.target.value })}
              className="rounded-lg border border-slate-200 px-2 py-2 text-xs" />
            <button type="button" disabled={!assignmentForm.definitionId || !assignmentForm.employeeId || busy === 'assignment'}
              onClick={saveAssignment}
              className="rounded-lg bg-slate-800 text-white text-xs font-bold py-2">تعيين</button>
          </div>
        )}
        <div className="rounded-xl border border-slate-200 overflow-hidden max-h-64 overflow-y-auto">
          {assignments.map((row) => (
            <div key={row.id} className="p-2 text-xs flex justify-between gap-2 border-b border-slate-100 last:border-0">
              <span>{row.employeeName} <span className="text-slate-400">({row.employeeCode})</span> · {row.definitionName}</span>
              <span className="text-slate-500">{row.role === 'SUPERVISOR' ? 'مشرف' : 'موظف'} · من {row.effectiveFrom}{row.effectiveTo ? ` إلى ${row.effectiveTo}` : ''}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
