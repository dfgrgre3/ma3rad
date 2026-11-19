import type { FC } from 'react';
import {
  AlertTriangle, ArrowRightLeft, Factory, PauseCircle, PlayCircle, Plus, Users, Wallet,
} from 'lucide-react';
import type { OperationShiftStaff } from '../../../../services/domains/operations/OperationsShiftService';
import { money, STATUS_LABELS, STATUS_STYLES, timeOf } from '../constants';
import type { OperationsShiftsState } from '../useOperationsShifts';

interface ShiftDetailPanelProps {
  state: OperationsShiftsState;
}

/** Full shift detail: open/close actions, staff, incidents, production, handover. */
export const ShiftDetailPanel: FC<ShiftDetailPanelProps> = ({ state }) => {
  const {
    detail, setDetail, canManage, busy, run, service,
    openForm, setOpenForm, employees, staffToAdd, setStaffToAdd,
    handoverForm, setHandoverForm, incidentForm, setIncidentForm,
    productionForm, setProductionForm,
  } = state;
  if (!detail) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-black text-slate-800">{detail.shift.definitionName}</h2>
            <span className={`text-[11px] px-2 py-0.5 rounded-full border ${STATUS_STYLES[detail.shift.status]}`}>
              {STATUS_LABELS[detail.shift.status]}
            </span>
            <span className="text-xs text-slate-500">{detail.shift.shiftNumber}</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {detail.shift.businessDate} · {timeOf(detail.shift.scheduledStart)} - {timeOf(detail.shift.scheduledEnd)}
            {detail.shift.supervisorName ? ` · المشرف: ${detail.shift.supervisorName}` : ''}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canManage && ['PLANNED', 'MISSED'].includes(detail.shift.status) && (
            <button type="button" disabled={busy === 'open'}
              onClick={() => run('open', () => service.openShift(detail.shift.id, {
                supervisorId: openForm.supervisorId || null,
                notes: openForm.notes,
              }), 'تم فتح وردية التشغيل.')}
              className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold flex items-center gap-1">
              <PlayCircle className="w-4 h-4" /> فتح الوردية
            </button>
          )}
          {canManage && detail.shift.status === 'OPEN' && (
            <button type="button" disabled={busy === 'close'}
              onClick={() => run('close', () => service.closeShift(detail.shift.id), 'تم إغلاق وردية التشغيل.')}
              className="px-3 py-2 rounded-lg bg-slate-700 text-white text-xs font-bold flex items-center gap-1">
              <PauseCircle className="w-4 h-4" /> إغلاق مباشر
            </button>
          )}
          <button type="button" onClick={() => setDetail(null)}
            className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-600">إغلاق اللوحة</button>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-3 text-sm">
        <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">النقدية المتوقعة</div><div className="font-black">{money(detail.cashSummary.expected)}</div></div>
        <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">النقدية الفعلية</div><div className="font-black">{money(detail.cashSummary.actual)}</div></div>
        <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">الفرق</div><div className="font-black">{money(detail.cashSummary.difference)}</div></div>
        <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">ورديات الكاشير</div><div className="font-black">{detail.cashSummary.openShifts} مفتوحة / {detail.cashSummary.closedShifts} مغلقة</div></div>
      </div>

      {canManage && ['PLANNED', 'MISSED'].includes(detail.shift.status) && (
        <div className="grid md:grid-cols-3 gap-3 rounded-xl border border-slate-200 p-3">
          <label className="text-xs font-bold text-slate-600">المشرف
            <select value={openForm.supervisorId} onChange={(e) => setOpenForm({ ...openForm, supervisorId: e.target.value })}
              className="block w-full mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <option value="">بدون مشرف</option>
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-600 md:col-span-2">ملاحظات الافتتاح
            <input value={openForm.notes} onChange={(e) => setOpenForm({ ...openForm, notes: e.target.value })}
              className="block w-full mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </label>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2"><Users className="w-4 h-4" /> الحضور والأطقم</h3>
            {canManage && ['OPEN', 'HANDOVER_PENDING'].includes(detail.shift.status) && (
              <div className="flex gap-2">
                <select value={staffToAdd} onChange={(e) => setStaffToAdd(e.target.value)}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
                  <option value="">إضافة موظف</option>
                  {employees.filter((emp) => !detail.staff.some((row) => row.employeeId === emp.id))
                    .map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                </select>
                <button type="button" disabled={!staffToAdd || busy === 'staff'}
                  onClick={() => run('staff', () => service.addStaff(detail.shift.id, staffToAdd), 'تمت إضافة الموظف.')}
                  className="px-2 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-bold"><Plus className="w-3.5 h-3.5" /></button>
              </div>
            )}
          </div>
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
            {detail.staff.length === 0 && <div className="p-4 text-xs text-slate-400 text-center">لم يتم تسجيل موظفين بعد.</div>}
            {detail.staff.map((row: OperationShiftStaff) => (
              <div key={row.id} className="p-3 flex items-center justify-between gap-3 text-sm">
                <div>
                  <div className="font-bold text-slate-700">{row.employeeName}
                    <span className="text-[10px] text-slate-400 font-normal mr-2">{row.employeeCode} · {row.role === 'SUPERVISOR' ? 'مشرف' : 'موظف'}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    دخول {timeOf(row.checkInAt) || '—'} · خروج {timeOf(row.checkOutAt) || '—'}
                    {row.lateMinutes > 0 ? ` · تأخير ${row.lateMinutes} د` : ''}
                    {row.overtimeMinutes > 0 ? ` · إضافي ${row.overtimeMinutes} د` : ''}
                  </div>
                </div>
                {canManage && detail.shift.status === 'OPEN' && (
                  <div className="flex gap-1">
                    {!row.checkInAt && (
                      <button type="button" onClick={() => run(`in-${row.employeeId}`,
                        () => service.recordStaffPresence(detail.shift.id, row.employeeId, 'IN'), 'تم تسجيل الحضور.')}
                        className="px-2 py-1 rounded bg-emerald-50 text-emerald-700 text-[11px] font-bold">دخول</button>
                    )}
                    {row.checkInAt && !row.checkOutAt && (
                      <button type="button" onClick={() => run(`out-${row.employeeId}`,
                        () => service.recordStaffPresence(detail.shift.id, row.employeeId, 'OUT'), 'تم تسجيل الانصراف.')}
                        className="px-2 py-1 rounded bg-amber-50 text-amber-700 text-[11px] font-bold">خروج</button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {detail.attendancePeriods.some((period) => period.overtimeMinutes > 0) && (
            <div className="rounded-xl border border-slate-200 p-3 space-y-2">
              <h4 className="text-xs font-bold text-slate-700">اعتماد الإضافي وربطه بالرواتب</h4>
              {detail.attendancePeriods.filter((period) => period.overtimeMinutes > 0).map((period) => (
                <div key={period.id} className="flex items-center justify-between gap-2 text-xs">
                  <span>{period.employeeName} · {period.overtimeMinutes} دقيقة</span>
                  {period.overtimeApproved ? (
                    <span className="text-emerald-700 font-bold">معتمد</span>
                  ) : canManage && period.status === 'CLOSED' ? (
                    <button type="button" disabled={busy === `overtime-${period.id}`}
                      onClick={() => run(`overtime-${period.id}`,
                        () => service.approveShiftOvertime(period.id),
                        'تم اعتماد الإضافي وسيظهر في دورة الرواتب.')}
                      className="rounded-lg bg-emerald-50 px-2 py-1 text-emerald-700 font-bold">اعتماد</button>
                  ) : (
                    <span className="text-amber-700">بانتظار إغلاق الفترة</span>
                  )}
                </div>
              ))}
            </div>
          )}

          <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2 pt-2"><Wallet className="w-4 h-4" /> ورديات الكاشير المرتبطة</h3>
          <div className="rounded-xl border border-slate-200 overflow-hidden text-xs">
            {detail.cashShifts.length === 0 && <div className="p-3 text-slate-400 text-center">لا توجد ورديات كاشير مرتبطة.</div>}
            {detail.cashShifts.map((row, index) => (
              <div key={String(row.id || index)} className="p-2 flex justify-between border-b border-slate-100 last:border-0">
                <span>{String(row.userName || '')} · {String(row.registerName || '')}</span>
                <span className={row.status === 'OPEN' ? 'text-emerald-700 font-bold' : 'text-slate-500'}>
                  {row.status === 'OPEN' ? 'مفتوحة' : 'مغلقة'} · {money(Number(row.expectedEndingCash || 0))}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> الأعطال والملاحظات</h3>
          {canManage && (
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 p-3">
              <select value={incidentForm.type}
                onChange={(e) => setIncidentForm({ ...incidentForm, type: e.target.value as typeof incidentForm.type })}
                className="rounded-lg border border-slate-200 px-2 py-2 text-xs">
                <option value="NOTE">ملاحظة</option><option value="BREAKDOWN">عطل</option>
                <option value="SAFETY">سلامة</option><option value="QUALITY">جودة</option><option value="OTHER">أخرى</option>
              </select>
              <select value={incidentForm.severity}
                onChange={(e) => setIncidentForm({ ...incidentForm, severity: e.target.value as typeof incidentForm.severity })}
                className="rounded-lg border border-slate-200 px-2 py-2 text-xs">
                <option value="LOW">منخفضة</option><option value="MEDIUM">متوسطة</option>
                <option value="HIGH">عالية</option><option value="CRITICAL">حرجة</option>
              </select>
              <input value={incidentForm.title} onChange={(e) => setIncidentForm({ ...incidentForm, title: e.target.value })}
                placeholder="عنوان الملاحظة" className="col-span-2 rounded-lg border border-slate-200 px-2 py-2 text-xs" />
              <textarea value={incidentForm.description} onChange={(e) => setIncidentForm({ ...incidentForm, description: e.target.value })}
                placeholder="الوصف" rows={2} className="col-span-2 rounded-lg border border-slate-200 px-2 py-2 text-xs" />
              <button type="button" disabled={!incidentForm.title || busy === 'incident'}
                onClick={() => run('incident', () => {
                  service.addIncident(detail.shift.id, incidentForm);
                  setIncidentForm({ type: 'NOTE', severity: 'MEDIUM', title: '', description: '' });
                }, 'تم تسجيل الملاحظة.')}
                className="col-span-2 rounded-lg bg-slate-800 text-white text-xs font-bold py-2">تسجيل</button>
            </div>
          )}
          <div className="space-y-2">
            {detail.incidents.map((incident) => (
              <div key={incident.id} className="rounded-xl border border-slate-200 p-3 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="font-bold text-slate-700">{incident.title}</span>
                  <span className={incident.resolvedAt ? 'text-emerald-600' : 'text-amber-600'}>
                    {incident.resolvedAt ? 'معالجة' : 'مفتوحة'}
                  </span>
                </div>
                {incident.description && <div className="text-slate-500 mt-1">{incident.description}</div>}
                {canManage && !incident.resolvedAt && (
                  <button type="button" onClick={() => run(`resolve-${incident.id}`,
                    () => service.resolveIncident(incident.id), 'تمت معالجة الملاحظة.')}
                    className="mt-2 text-[11px] font-bold text-teal-700">تحديد كمعالجة</button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="space-y-3">
          <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2"><Factory className="w-4 h-4" /> إنتاج الوردية</h3>
          {canManage && (
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 p-3">
              <select value={productionForm.productionOrderId}
                onChange={(e) => setProductionForm({ ...productionForm, productionOrderId: e.target.value })}
                className="col-span-2 rounded-lg border border-slate-200 px-2 py-2 text-xs">
                <option value="">بدون أمر إنتاج</option>
                {detail.openProductionOrders.map((order) => (
                  <option key={String(order.id)} value={String(order.id)}>
                    {String(order.orderNumber)} · {String(order.productName || '')}
                  </option>
                ))}
              </select>
              {([
                ['targetQty', 'المستهدف'], ['producedQty', 'المنتج'], ['goodQty', 'السليم'],
                ['scrapQty', 'الهالك'], ['downtimeMinutes', 'دقائق التوقف'],
              ] as Array<[keyof typeof productionForm, string]>).map(([key, label]) => (
                <label key={key} className="text-[11px] text-slate-500">{label}
                  <input type="number" min={0} value={Number(productionForm[key])}
                    onChange={(e) => setProductionForm({ ...productionForm, [key]: Number(e.target.value) })}
                    className="block w-full mt-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
                </label>
              ))}
              <input value={productionForm.downtimeReason}
                onChange={(e) => setProductionForm({ ...productionForm, downtimeReason: e.target.value })}
                placeholder="سبب التوقف" className="col-span-2 rounded-lg border border-slate-200 px-2 py-2 text-xs" />
              <button type="button" disabled={busy === 'production'}
                onClick={() => run('production', () => {
                  service.recordProduction(detail.shift.id, productionForm);
                  setProductionForm({ ...productionForm, productionOrderId: '', targetQty: 0, producedQty: 0, goodQty: 0, scrapQty: 0, downtimeMinutes: 0, downtimeReason: '', notes: '' });
                }, 'تم تسجيل إنتاج الوردية.')}
                className="col-span-2 rounded-lg bg-indigo-600 text-white text-xs font-bold py-2">تسجيل الإنتاج</button>
            </div>
          )}
          <div className="rounded-xl border border-slate-200 overflow-hidden text-xs">
            {detail.production.length === 0 && <div className="p-3 text-slate-400 text-center">لا يوجد إنتاج مسجل.</div>}
            {detail.production.map((row) => (
              <div key={row.id} className="p-2 border-b border-slate-100 last:border-0 flex justify-between gap-2">
                <span>{row.productName || row.orderNumber || 'إنتاج'}</span>
                <span className="text-slate-500">منتج {row.producedQty} · هالك {row.scrapQty} · توقف {row.downtimeMinutes}د</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2"><ArrowRightLeft className="w-4 h-4" /> التسليم والاستلام الإلكتروني</h3>
          {detail.handover ? (
            <div className="rounded-xl border border-slate-200 p-3 text-xs space-y-2">
              <div className="flex justify-between"><span>الحالة</span><span className="font-bold">{detail.handover.status === 'RECEIVED' ? 'مستلم' : 'بانتظار الاستلام'}</span></div>
              <div className="flex justify-between"><span>المتوقع</span><span>{money(detail.handover.expectedCash)}</span></div>
              <div className="flex justify-between"><span>الفعلي</span><span>{money(detail.handover.actualCash)}</span></div>
              <div className="flex justify-between"><span>الفرق</span><span>{money(detail.handover.cashDifference)}</span></div>
              <div className="flex justify-between"><span>المسلّم للخزينة</span><span>{money(detail.handover.cashDelivered)}</span></div>
              {detail.handover.inventoryStatus && <div><span className="text-slate-500">المخزون: </span>{detail.handover.inventoryStatus}</div>}
              {detail.handover.equipmentStatus && <div><span className="text-slate-500">المعدات: </span>{detail.handover.equipmentStatus}</div>}
              {canManage && detail.handover.status !== 'RECEIVED' && (
                <button type="button" onClick={() => run('receive',
                  () => service.confirmHandover(detail.shift.id), 'تم استلام الوردية وإغلاقها.')}
                  className="w-full rounded-lg bg-emerald-600 text-white text-xs font-bold py-2">استلام وتأكيد الوردية</button>
              )}
            </div>
          ) : canManage && ['OPEN', 'HANDOVER_PENDING'].includes(detail.shift.status) ? (
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 p-3">
              <div className="col-span-2 text-[11px] text-slate-500">
                يجب إغلاق كل ورديات الكاشير المرتبطة قبل التسليم.
              </div>
              <label className="text-[11px] text-slate-500">النقدية الفعلية
                <input type="number" min={0} value={handoverForm.actualCash}
                  onChange={(e) => setHandoverForm({ ...handoverForm, actualCash: Number(e.target.value) })}
                  className="block w-full mt-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
              </label>
              <label className="text-[11px] text-slate-500">المسلّم للخزينة
                <input type="number" min={0} value={handoverForm.cashDelivered}
                  onChange={(e) => setHandoverForm({ ...handoverForm, cashDelivered: Number(e.target.value) })}
                  className="block w-full mt-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
              </label>
              <input value={handoverForm.inventoryStatus}
                onChange={(e) => setHandoverForm({ ...handoverForm, inventoryStatus: e.target.value })}
                placeholder="حالة المخزون" className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
              <input value={handoverForm.equipmentStatus}
                onChange={(e) => setHandoverForm({ ...handoverForm, equipmentStatus: e.target.value })}
                placeholder="حالة المعدات" className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
              <input value={handoverForm.pendingOrders}
                onChange={(e) => setHandoverForm({ ...handoverForm, pendingOrders: e.target.value })}
                placeholder="طلبات معلقة (مفصولة بفاصلة)" className="col-span-2 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
              <textarea value={handoverForm.notes}
                onChange={(e) => setHandoverForm({ ...handoverForm, notes: e.target.value })}
                placeholder="ملاحظات التسليم" rows={2} className="col-span-2 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
              <div className="col-span-2">
                <div className="text-[11px] font-bold text-slate-500 mb-1">طاقم الوردية القادمة</div>
                <div className="max-h-28 overflow-y-auto rounded-lg border border-slate-100 p-2 space-y-1">
                  {employees.map((employee) => (
                    <label key={employee.id} className="flex items-center gap-2 text-[11px] text-slate-600">
                      <input type="checkbox" checked={handoverForm.nextStaffIds.includes(employee.id)}
                        onChange={(e) => setHandoverForm({
                          ...handoverForm,
                          nextStaffIds: e.target.checked
                            ? [...handoverForm.nextStaffIds, employee.id]
                            : handoverForm.nextStaffIds.filter((id) => id !== employee.id),
                        })} />
                      {employee.name}
                    </label>
                  ))}
                </div>
              </div>
              <button type="button" disabled={busy === 'handover'}
                onClick={() => run('handover', () => service.submitHandover(detail.shift.id, {
                  ...handoverForm,
                  pendingOrders: handoverForm.pendingOrders.split(',').map((item) => item.trim()).filter(Boolean),
                }), 'تم إرسال التسليم الإلكتروني.')}
                className="col-span-2 rounded-lg bg-teal-600 text-white text-xs font-bold py-2">إرسال التسليم</button>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 p-4 text-xs text-slate-400 text-center">لا يوجد تسليم لهذه الوردية.</div>
          )}
        </div>
      </div>
    </section>
  );
};
