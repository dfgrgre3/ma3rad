import React, { useState } from 'react';
import { ShieldAlert, Plus } from 'lucide-react';
import { DataTable } from '../../../../components/ui/DataTable';
import type { TabProps } from './OverviewTab';

const INCIDENT_TYPES = [
  { value: 'INJURY', label: 'إصابة' }, { value: 'NEAR_MISS', label: 'قريبة من الحادث' },
  { value: 'PROPERTY_DAMAGE', label: 'ضرر بالممتلكات' }, { value: 'ENVIRONMENTAL', label: 'بيئي' },
  { value: 'ILLNESS', label: 'مرض مهني' }, { value: 'OTHER', label: 'أخرى' },
];
const SEVERITIES = [
  { value: 'MINOR', label: 'بسيطة' }, { value: 'MODERATE', label: 'متوسطة' },
  { value: 'SERIOUS', label: 'خطيرة' }, { value: 'CRITICAL', label: 'حرجة' },
];
const INCIDENT_STATUSES = [
  { value: 'OPEN', label: 'مفتوح' }, { value: 'INVESTIGATING', label: 'قيد التحقيق' }, { value: 'CLOSED', label: 'مغلق' },
];
const PERMIT_TYPES = [
  { value: 'HOT_WORK', label: 'عمل ساخن' }, { value: 'CONFINED_SPACE', label: 'أماكن محصورة' },
  { value: 'HEIGHT', label: 'عمل على ارتفاع' }, { value: 'ELECTRICAL', label: 'كهربائي' },
  { value: 'EXCAVATION', label: 'حفر' }, { value: 'OTHER', label: 'أخرى' },
];
const PERMIT_STATUSES: Record<string, string> = {
  REQUESTED: 'مطلوب', APPROVED: 'معتمد', ACTIVE: 'نشط', EXPIRED: 'منتهي', CANCELLED: 'ملغى', CLOSED: 'مغلق',
};
const INSPECTION_TYPES = [
  { value: 'GENERAL', label: 'عام' }, { value: 'FIRE', label: 'حريق' }, { value: 'ELECTRICAL', label: 'كهربائي' },
  { value: 'HOUSEKEEPING', label: 'ترتيب' }, { value: 'PPE', label: 'معدات حماية' },
  { value: 'MACHINERY', label: 'آلات' }, { value: 'ENVIRONMENTAL', label: 'بيئي' }, { value: 'OTHER', label: 'أخرى' },
];
const RESULTS: Record<string, string> = { PASS: 'ناجح', FAIL: 'راسب', CONDITIONAL: 'مشروط' };
const TRAINING_STATUSES: Record<string, string> = { SCHEDULED: 'مجدول', COMPLETED: 'مكتمل', EXPIRED: 'منتهي', CANCELLED: 'ملغى' };

const inputCls = 'w-full rounded-lg border border-line px-2 py-1.5 text-xs';
const labelCls = 'mb-1 block text-[11px] font-bold text-muted';

export const HseTab: React.FC<TabProps> = ({ service, data, reload, canManage, toast }) => {
  const [incidentForm, setIncidentForm] = useState({ incidentDate: '', incidentType: 'INJURY', severity: 'MINOR', description: '', location: '', workCenterId: '', injuredEmployeeId: '', lostTimeHours: '', correctiveAction: '', branchId: '' });
  const [permitForm, setPermitForm] = useState({ permitType: 'HOT_WORK', title: '', location: '', workCenterId: '', validFrom: '', validTo: '', conditions: '', branchId: '' });
  const [inspectionForm, setInspectionForm] = useState({ inspectionDate: '', area: '', inspectionType: 'GENERAL', result: 'PASS', findings: '', correctiveAction: '', inspectorId: '', workCenterId: '', branchId: '' });
  const [trainingForm, setTrainingForm] = useState({ employeeId: '', trainingName: '', provider: '', trainingDate: '', expiryDate: '', certificateRef: '', status: 'COMPLETED', branchId: '' });
  const [section, setSection] = useState<'incidents' | 'permits' | 'inspections' | 'trainings'>('incidents');

  const run = (action: () => void, success: string) => {
    try { action(); toast.success(success); reload(); }
    catch (error: any) { toast.error(error?.message || 'تعذر تنفيذ الإجراء.'); }
  };

  const alerts = data.hsePermitAlerts || { expiring: [], expired: [] };
  const wcName = (id: string | null) => data.workCenters.find((wc) => wc.id === id)?.name || '—';
  const empName = (id: string | null) => data.employees.find((e: any) => e.id === id)?.fullName || data.employees.find((e: any) => e.id === id)?.name || '—';

  const submitIncident = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => {
      service.createHseIncident({
        incidentDate: incidentForm.incidentDate, incidentType: incidentForm.incidentType, severity: incidentForm.severity,
        description: incidentForm.description, location: incidentForm.location || undefined,
        workCenterId: incidentForm.workCenterId || undefined, injuredEmployeeId: incidentForm.injuredEmployeeId || undefined,
        lostTimeHours: incidentForm.lostTimeHours === '' ? undefined : Number(incidentForm.lostTimeHours),
        correctiveAction: incidentForm.correctiveAction || undefined, branchId: incidentForm.branchId || undefined,
      });
      setIncidentForm({ incidentDate: '', incidentType: 'INJURY', severity: 'MINOR', description: '', location: '', workCenterId: '', injuredEmployeeId: '', lostTimeHours: '', correctiveAction: '', branchId: '' });
    }, 'تم تسجيل الحادث.');
  };

  const submitPermit = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => {
      service.createHsePermit({
        permitType: permitForm.permitType, title: permitForm.title, location: permitForm.location || undefined,
        workCenterId: permitForm.workCenterId || undefined, validFrom: permitForm.validFrom, validTo: permitForm.validTo,
        conditions: permitForm.conditions || undefined, branchId: permitForm.branchId || undefined,
      });
      setPermitForm({ permitType: 'HOT_WORK', title: '', location: '', workCenterId: '', validFrom: '', validTo: '', conditions: '', branchId: '' });
    }, 'تم إنشاء طلب التصريح.');
  };

  const submitInspection = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => {
      service.createHseInspection({
        inspectionDate: inspectionForm.inspectionDate, area: inspectionForm.area,
        inspectionType: inspectionForm.inspectionType, result: inspectionForm.result,
        findings: inspectionForm.findings || undefined, correctiveAction: inspectionForm.correctiveAction || undefined,
        inspectorId: inspectionForm.inspectorId || undefined, workCenterId: inspectionForm.workCenterId || undefined,
        branchId: inspectionForm.branchId || undefined,
      });
      setInspectionForm({ inspectionDate: '', area: '', inspectionType: 'GENERAL', result: 'PASS', findings: '', correctiveAction: '', inspectorId: '', workCenterId: '', branchId: '' });
    }, 'تم تسجيل الفحص.');
  };

  const submitTraining = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => {
      service.createHseTraining({
        employeeId: trainingForm.employeeId, trainingName: trainingForm.trainingName,
        provider: trainingForm.provider || undefined, trainingDate: trainingForm.trainingDate,
        expiryDate: trainingForm.expiryDate || undefined, certificateRef: trainingForm.certificateRef || undefined,
        status: trainingForm.status, branchId: trainingForm.branchId || undefined,
      });
      setTrainingForm({ employeeId: '', trainingName: '', provider: '', trainingDate: '', expiryDate: '', certificateRef: '', status: 'COMPLETED', branchId: '' });
    }, 'تم تسجيل التدريب.');
  };

  const SECTIONS = [
    { key: 'incidents', label: 'الحوادث' }, { key: 'permits', label: 'تصاريح الأعمال الخطرة' },
    { key: 'inspections', label: 'الفحوصات' }, { key: 'trainings', label: 'التدريب' },
  ] as const;

  return (
    <div className="space-y-3">
      {(alerts.expired.length > 0 || alerts.expiring.length > 0) && (
        <div className={`rounded-xl border p-3 text-xs ${alerts.expired.length > 0 ? 'border-danger-border bg-danger-soft text-danger' : 'border-warning-border bg-warning-soft text-warning'}`}>
          {alerts.expired.length > 0 && <div className="font-bold">{alerts.expired.length} تصريح منتهي: {alerts.expired.map((p) => p.permitNumber).join('، ')}</div>}
          {alerts.expiring.length > 0 && <div className={alerts.expired.length > 0 ? 'mt-1' : 'font-bold'}>{alerts.expiring.length} تصريح ينتهي خلال 7 أيام: {alerts.expiring.map((p) => `${p.permitNumber} (${p.validTo})`).join('، ')}</div>}
        </div>
      )}
      <div className="flex flex-wrap gap-1">
        {SECTIONS.map((s) => (
          <button key={s.key} onClick={() => setSection(s.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold ${section === s.key ? 'bg-primary text-white' : 'bg-surface-sunken text-ink-secondary'}`}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {section === 'incidents' && (
            <DataTable ariaLabel="حوادث السلامة" rows={data.hseIncidents}
              rowKey={(row) => row.id}
              columns={[
                { key: 'date', header: 'التاريخ', render: (row) => row.incidentDate },
                { key: 'type', header: 'النوع', render: (row) => INCIDENT_TYPES.find((t) => t.value === row.incidentType)?.label || row.incidentType },
                { key: 'severity', header: 'الخطورة', render: (row) => SEVERITIES.find((s) => s.value === row.severity)?.label || row.severity },
                { key: 'desc', header: 'الوصف', render: (row) => <span className="line-clamp-2">{row.description}</span> },
                { key: 'wc', header: 'مركز العمل', render: (row) => wcName(row.workCenterId) },
                { key: 'emp', header: 'المصاب', render: (row) => empName(row.injuredEmployeeId) },
                { key: 'lost', header: 'ساعات فقد', render: (row) => row.lostTimeHours },
                { key: 'status', header: 'الحالة', render: (row) => INCIDENT_STATUSES.find((s) => s.value === row.status)?.label || row.status },
                {
                  key: 'act', header: 'إجراء',
                  render: (row) => canManage && row.status !== 'CLOSED' && (
                    <button className="rounded bg-surface-sunken px-2 py-0.5 text-xs"
                      onClick={() => run(() => service.updateHseIncidentStatus(row.id, row.status === 'OPEN' ? 'INVESTIGATING' : 'CLOSED'), 'تم تحديث الحالة.')}>
                      {row.status === 'OPEN' ? 'بدء التحقيق' : 'إغلاق'}
                    </button>
                  ),
                },
              ]}
              emptyTitle="لا توجد حوادث مسجلة."
            />
          )}
          {section === 'permits' && (
            <DataTable ariaLabel="تصاريح الأعمال الخطرة" rows={data.hsePermits}
              rowKey={(row) => row.id}
              columns={[
                { key: 'num', header: 'الرقم', render: (row) => row.permitNumber },
                { key: 'type', header: 'النوع', render: (row) => PERMIT_TYPES.find((t) => t.value === row.permitType)?.label || row.permitType },
                { key: 'title', header: 'العنوان', render: (row) => row.title },
                { key: 'loc', header: 'الموقع', render: (row) => row.location || '—' },
                { key: 'from', header: 'من', render: (row) => row.validFrom },
                { key: 'to', header: 'إلى', render: (row) => row.validTo },
                { key: 'status', header: 'الحالة', render: (row) => PERMIT_STATUSES[row.status] || row.status },
                {
                  key: 'act', header: 'إجراء',
                  render: (row) => canManage && (
                    <div className="flex gap-1">
                      {row.status === 'REQUESTED' && <button className="rounded bg-success-soft px-2 py-0.5 text-xs text-success" onClick={() => run(() => service.approveHsePermit(row.id), 'تم اعتماد التصريح.')}>اعتماد</button>}
                      {row.status !== 'CANCELLED' && row.status !== 'CLOSED' && <button className="rounded bg-danger-soft px-2 py-0.5 text-xs text-danger" onClick={() => run(() => service.cancelHsePermit(row.id), 'تم إلغاء التصريح.')}>إلغاء</button>}
                    </div>
                  ),
                },
              ]}
              emptyTitle="لا توجد تصاريح."
            />
          )}
          {section === 'inspections' && (
            <DataTable ariaLabel="فحوصات السلامة" rows={data.hseInspections}
              rowKey={(row) => row.id}
              columns={[
                { key: 'date', header: 'التاريخ', render: (row) => row.inspectionDate },
                { key: 'area', header: 'المنطقة', render: (row) => row.area },
                { key: 'type', header: 'النوع', render: (row) => INSPECTION_TYPES.find((t) => t.value === row.inspectionType)?.label || row.inspectionType },
                { key: 'result', header: 'النتيجة', render: (row) => RESULTS[row.result] || row.result },
                { key: 'findings', header: 'الملاحظات', render: (row) => <span className="line-clamp-2">{row.findings || '—'}</span> },
                { key: 'insp', header: 'المفتش', render: (row) => empName(row.inspectorId) },
              ]}
              emptyTitle="لا توجد فحوصات."
            />
          )}
          {section === 'trainings' && (
            <DataTable ariaLabel="تدريبات السلامة" rows={data.hseTrainings}
              rowKey={(row) => row.id}
              columns={[
                { key: 'emp', header: 'الموظف', render: (row) => empName(row.employeeId) },
                { key: 'name', header: 'التدريب', render: (row) => row.trainingName },
                { key: 'provider', header: 'الجهة', render: (row) => row.provider || '—' },
                { key: 'date', header: 'التاريخ', render: (row) => row.trainingDate },
                { key: 'expiry', header: 'الانتهاء', render: (row) => row.expiryDate || '—' },
                { key: 'status', header: 'الحالة', render: (row) => TRAINING_STATUSES[row.status] || row.status },
              ]}
              emptyTitle="لا توجد تدريبات."
            />
          )}
        </div>

        {canManage && (
          <div className="rounded-xl border border-line bg-surface p-3">
            <div className="mb-2 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-danger" />
              <h3 className="text-sm font-black text-ink">
                {section === 'incidents' && 'تسجيل حادث'}
                {section === 'permits' && 'طلب تصريح عمل خطرة'}
                {section === 'inspections' && 'تسجيل فحص سلامة'}
                {section === 'trainings' && 'تسجيل تدريب'}
              </h3>
            </div>

            {section === 'incidents' && (
              <form onSubmit={submitIncident} className="space-y-2">
                <div><label className={labelCls}>التاريخ *</label><input type="date" required className={inputCls} value={incidentForm.incidentDate} onChange={(e) => setIncidentForm({ ...incidentForm, incidentDate: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={labelCls}>النوع</label><select className={inputCls} value={incidentForm.incidentType} onChange={(e) => setIncidentForm({ ...incidentForm, incidentType: e.target.value })}>{INCIDENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
                  <div><label className={labelCls}>الخطورة</label><select className={inputCls} value={incidentForm.severity} onChange={(e) => setIncidentForm({ ...incidentForm, severity: e.target.value })}>{SEVERITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
                </div>
                <div><label className={labelCls}>الوصف *</label><textarea required rows={2} className={inputCls} value={incidentForm.description} onChange={(e) => setIncidentForm({ ...incidentForm, description: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={labelCls}>الموقع</label><input className={inputCls} value={incidentForm.location} onChange={(e) => setIncidentForm({ ...incidentForm, location: e.target.value })} /></div>
                  <div><label className={labelCls}>ساعات فقد</label><input type="number" min="0" step="0.5" className={inputCls} value={incidentForm.lostTimeHours} onChange={(e) => setIncidentForm({ ...incidentForm, lostTimeHours: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={labelCls}>مركز العمل</label><select className={inputCls} value={incidentForm.workCenterId} onChange={(e) => setIncidentForm({ ...incidentForm, workCenterId: e.target.value })}><option value="">—</option>{data.workCenters.map((wc) => <option key={wc.id} value={wc.id}>{wc.name}</option>)}</select></div>
                  <div><label className={labelCls}>المصاب</label><select className={inputCls} value={incidentForm.injuredEmployeeId} onChange={(e) => setIncidentForm({ ...incidentForm, injuredEmployeeId: e.target.value })}><option value="">—</option>{data.employees.map((em: any) => <option key={em.id} value={em.id}>{em.fullName || em.name}</option>)}</select></div>
                </div>
                <div><label className={labelCls}>الإجراء التصحيحي</label><input className={inputCls} value={incidentForm.correctiveAction} onChange={(e) => setIncidentForm({ ...incidentForm, correctiveAction: e.target.value })} /></div>
                <div><label className={labelCls}>الفرع</label><select className={inputCls} value={incidentForm.branchId} onChange={(e) => setIncidentForm({ ...incidentForm, branchId: e.target.value })}><option value="">— الافتراضي —</option>{data.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
                <button className="flex w-full items-center justify-center gap-1 rounded-lg bg-danger px-3 py-2 text-xs font-bold text-white"><Plus className="h-3.5 w-3.5" /> تسجيل الحادث</button>
              </form>
            )}

            {section === 'permits' && (
              <form onSubmit={submitPermit} className="space-y-2">
                <div><label className={labelCls}>العنوان *</label><input required className={inputCls} value={permitForm.title} onChange={(e) => setPermitForm({ ...permitForm, title: e.target.value })} /></div>
                <div><label className={labelCls}>النوع</label><select className={inputCls} value={permitForm.permitType} onChange={(e) => setPermitForm({ ...permitForm, permitType: e.target.value })}>{PERMIT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={labelCls}>من *</label><input type="date" required className={inputCls} value={permitForm.validFrom} onChange={(e) => setPermitForm({ ...permitForm, validFrom: e.target.value })} /></div>
                  <div><label className={labelCls}>إلى *</label><input type="date" required className={inputCls} value={permitForm.validTo} onChange={(e) => setPermitForm({ ...permitForm, validTo: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={labelCls}>الموقع</label><input className={inputCls} value={permitForm.location} onChange={(e) => setPermitForm({ ...permitForm, location: e.target.value })} /></div>
                  <div><label className={labelCls}>مركز العمل</label><select className={inputCls} value={permitForm.workCenterId} onChange={(e) => setPermitForm({ ...permitForm, workCenterId: e.target.value })}><option value="">—</option>{data.workCenters.map((wc) => <option key={wc.id} value={wc.id}>{wc.name}</option>)}</select></div>
                </div>
                <div><label className={labelCls}>الشروط</label><input className={inputCls} value={permitForm.conditions} onChange={(e) => setPermitForm({ ...permitForm, conditions: e.target.value })} /></div>
                <div><label className={labelCls}>الفرع</label><select className={inputCls} value={permitForm.branchId} onChange={(e) => setPermitForm({ ...permitForm, branchId: e.target.value })}><option value="">— الافتراضي —</option>{data.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
                <button className="flex w-full items-center justify-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white"><Plus className="h-3.5 w-3.5" /> طلب التصريح</button>
              </form>
            )}

            {section === 'inspections' && (
              <form onSubmit={submitInspection} className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={labelCls}>التاريخ *</label><input type="date" required className={inputCls} value={inspectionForm.inspectionDate} onChange={(e) => setInspectionForm({ ...inspectionForm, inspectionDate: e.target.value })} /></div>
                  <div><label className={labelCls}>النتيجة</label><select className={inputCls} value={inspectionForm.result} onChange={(e) => setInspectionForm({ ...inspectionForm, result: e.target.value })}><option value="PASS">ناجح</option><option value="FAIL">راسب</option><option value="CONDITIONAL">مشروط</option></select></div>
                </div>
                <div><label className={labelCls}>المنطقة *</label><input required className={inputCls} value={inspectionForm.area} onChange={(e) => setInspectionForm({ ...inspectionForm, area: e.target.value })} /></div>
                <div><label className={labelCls}>النوع</label><select className={inputCls} value={inspectionForm.inspectionType} onChange={(e) => setInspectionForm({ ...inspectionForm, inspectionType: e.target.value })}>{INSPECTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
                <div><label className={labelCls}>الملاحظات</label><textarea rows={2} className={inputCls} value={inspectionForm.findings} onChange={(e) => setInspectionForm({ ...inspectionForm, findings: e.target.value })} /></div>
                <div><label className={labelCls}>الإجراء التصحيحي</label><input className={inputCls} value={inspectionForm.correctiveAction} onChange={(e) => setInspectionForm({ ...inspectionForm, correctiveAction: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={labelCls}>المفتش</label><select className={inputCls} value={inspectionForm.inspectorId} onChange={(e) => setInspectionForm({ ...inspectionForm, inspectorId: e.target.value })}><option value="">—</option>{data.employees.map((em: any) => <option key={em.id} value={em.id}>{em.fullName || em.name}</option>)}</select></div>
                  <div><label className={labelCls}>مركز العمل</label><select className={inputCls} value={inspectionForm.workCenterId} onChange={(e) => setInspectionForm({ ...inspectionForm, workCenterId: e.target.value })}><option value="">—</option>{data.workCenters.map((wc) => <option key={wc.id} value={wc.id}>{wc.name}</option>)}</select></div>
                </div>
                <div><label className={labelCls}>الفرع</label><select className={inputCls} value={inspectionForm.branchId} onChange={(e) => setInspectionForm({ ...inspectionForm, branchId: e.target.value })}><option value="">— الافتراضي —</option>{data.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
                <button className="flex w-full items-center justify-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white"><Plus className="h-3.5 w-3.5" /> تسجيل الفحص</button>
              </form>
            )}

            {section === 'trainings' && (
              <form onSubmit={submitTraining} className="space-y-2">
                <div><label className={labelCls}>الموظف *</label><select required className={inputCls} value={trainingForm.employeeId} onChange={(e) => setTrainingForm({ ...trainingForm, employeeId: e.target.value })}><option value="">اختر...</option>{data.employees.map((em: any) => <option key={em.id} value={em.id}>{em.fullName || em.name}</option>)}</select></div>
                <div><label className={labelCls}>اسم التدريب *</label><input required className={inputCls} value={trainingForm.trainingName} onChange={(e) => setTrainingForm({ ...trainingForm, trainingName: e.target.value })} /></div>
                <div><label className={labelCls}>الجهة المقدمة</label><input className={inputCls} value={trainingForm.provider} onChange={(e) => setTrainingForm({ ...trainingForm, provider: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={labelCls}>تاريخ التدريب *</label><input type="date" required className={inputCls} value={trainingForm.trainingDate} onChange={(e) => setTrainingForm({ ...trainingForm, trainingDate: e.target.value })} /></div>
                  <div><label className={labelCls}>تاريخ الانتهاء</label><input type="date" className={inputCls} value={trainingForm.expiryDate} onChange={(e) => setTrainingForm({ ...trainingForm, expiryDate: e.target.value })} /></div>
                </div>
                <div><label className={labelCls}>رقم الشهادة</label><input className={inputCls} value={trainingForm.certificateRef} onChange={(e) => setTrainingForm({ ...trainingForm, certificateRef: e.target.value })} /></div>
                <div><label className={labelCls}>الحالة</label><select className={inputCls} value={trainingForm.status} onChange={(e) => setTrainingForm({ ...trainingForm, status: e.target.value })}><option value="COMPLETED">مكتمل</option><option value="SCHEDULED">مجدول</option><option value="EXPIRED">منتهي</option></select></div>
                <div><label className={labelCls}>الفرع</label><select className={inputCls} value={trainingForm.branchId} onChange={(e) => setTrainingForm({ ...trainingForm, branchId: e.target.value })}><option value="">— الافتراضي —</option>{data.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
                <button className="flex w-full items-center justify-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white"><Plus className="h-3.5 w-3.5" /> تسجيل التدريب</button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
