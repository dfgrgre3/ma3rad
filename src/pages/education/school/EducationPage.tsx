import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ClipboardCheck, GraduationCap, RefreshCw, UserPlus, Users } from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { resolveActivitySubTabs } from '../../../config/activityElementSpec';
import { Card, CardHeader, StatCard } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { FormField } from '../../../components/ui/FormField';
import { useToast } from '../../../components/ui/Toast';
import { usePermission } from '../../../hooks/domains/auth/usePermission';
import { CustomerService } from '../../../services/domains/customers/CustomerService';
import type { Customer } from '../../../types';
import {
  DAY_NAMES,
  EducationService,
  type AttendanceStatus,
  type ClassSchedule,
  type EduClass,
  type Enrollment,
} from '../../../services/domains/education/EducationService';
import { localDateString } from '../../../utils/shared/date';

const currency = new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 });
const inputCls = 'w-full rounded-lg border border-[var(--cerami-border)] bg-[var(--cerami-surface)] px-3 py-2 text-sm';
const selectCls = inputCls;
const ATT_LABEL: Record<AttendanceStatus, string> = { PRESENT: 'حاضر', ABSENT: 'غائب', LATE: 'متأخر', EXCUSED: 'بعذر' };

export const EducationPage: React.FC = () => {
  const service = useMemo(() => new EducationService(), []);
  const toast = useToast();
  const can = usePermission();
  const canManage = can('customers.create');

  const [tab, setTab] = useState<'classes' | 'timetable' | 'students' | 'attendance' | 'fees'>('classes');
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<EduClass[]>([]);
  const [schedules, setSchedules] = useState<ClassSchedule[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [fees, setFees] = useState<any[]>([]);
  const [selectedClass, setSelectedClass] = useState<EduClass | null>(null);
  const [roster, setRoster] = useState<Array<{ enrollmentId: string; studentName: string; status: AttendanceStatus | null }>>([]);
  const [attendanceDate, setAttendanceDate] = useState(localDateString());
  const [attendanceMarks, setAttendanceMarks] = useState<Record<string, AttendanceStatus>>({});

  const [classModal, setClassModal] = useState(false);
  const [classForm, setClassForm] = useState({ name: '', subject: '', teacherId: '', capacity: '30', academicYear: '' });
  const [schedModal, setSchedModal] = useState(false);
  const [schedForm, setSchedForm] = useState({ classId: '', dayOfWeek: '0', startTime: '08:00', endTime: '09:30', room: '' });
  const [enrollModal, setEnrollModal] = useState(false);
  const [enrollForm, setEnrollForm] = useState({ classId: '', customerId: '' });
  const [feeModal, setFeeModal] = useState(false);
  const [feeForm, setFeeForm] = useState({ enrollmentId: '', title: '', amount: '', dueDate: '' });

  const run = useCallback((fn: () => void) => {
    try { fn(); } catch (e: any) { toast.error('خطأ', e?.message || 'حدث خطأ'); }
  }, [toast]);

  const load = useCallback(() => {
    setLoading(true);
    try {
      setClasses(service.getClasses());
      setSchedules(service.getSchedules());
      setEnrollments(service.getEnrollments());
      setFees(service.getFeeInstallments());
      setCustomers(can('customers.view') ? new CustomerService().getAllCustomers() : []);
      setTeachers(service.getTeachers());
    } catch (e: any) {
      toast.error('تعذر تحميل بيانات التعليم', e?.message);
    } finally {
      setLoading(false);
    }
  }, [service, can, toast]);

  useEffect(() => { load(); }, [load]);

  const openClass = (cls: EduClass) => {
    setSelectedClass(cls);
    setTab('students');
    setRoster(service.getClassRoster(cls.id));
  };

  const openAttendance = (cls: EduClass) => {
    setSelectedClass(cls);
    setTab('attendance');
    const r = service.getClassRoster(cls.id);
    setRoster(r);
    const marks: Record<string, AttendanceStatus> = {};
    r.forEach((x) => { if (x.status) marks[x.enrollmentId] = x.status; });
    setAttendanceMarks(marks);
  };

  const weeklyGrid = useMemo(() => {
    const map = new Map<number, ClassSchedule[]>();
    for (const s of schedules) {
      const list = map.get(s.dayOfWeek) ?? [];
      list.push(s);
      map.set(s.dayOfWeek, list);
    }
    return DAY_NAMES.map((dayName, day) => ({ day, dayName, sessions: (map.get(day) ?? []).sort((a, b) => a.startTime.localeCompare(b.startTime)) }));
  }, [schedules]);

  const tabs = [
    { id: 'classes' as const, label: 'الفصول', icon: GraduationCap },
    { id: 'timetable' as const, label: 'الجدول الزمني', icon: CalendarDays },
    { id: 'students' as const, label: 'الطلاب والتسجيل', icon: Users },
    { id: 'attendance' as const, label: 'الحضور والغياب', icon: ClipboardCheck },
    { id: 'fees' as const, label: 'الرسوم والأقساط', icon: CalendarDays },
  ];

  const totalStudents = enrollments.filter((e) => e.status === 'ENROLLED' || e.status === 'ACTIVE').length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="إدارة المؤسسة التعليمية"
        description="الفصول الدراسية، الجداول الزمنية، تسجيل الطلاب، الحضور والرسوم."
        icon={<GraduationCap className="w-6 h-6" />}
        actions={<div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={load} leadingIcon={<RefreshCw className="w-4 h-4" />}>تحديث</Button>
          {canManage && <Button size="sm" onClick={() => { setClassForm({ name: '', subject: '', teacherId: '', capacity: '30', academicYear: new Date().getFullYear().toString() }); setClassModal(true); }}>+ فصل جديد</Button>}
        </div>}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="الفصول النشطة" value={classes.filter((c) => c.isActive).length} />
        <StatCard label="الطلاب المسجلون" value={totalStudents} />
        <StatCard label="حصص الجدول" value={schedules.length} />
        <StatCard label="أقساط متأخرة" value={fees.filter((f) => f.status === 'OVERDUE').length} tone="danger" />
      </div>

      <div className="flex gap-1 border-b border-[var(--cerami-border)] flex-wrap">
        {resolveActivitySubTabs(tabs, '/education').map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-2 ${tab === t.id ? 'border-[var(--cerami-primary)] text-[var(--cerami-primary)]' : 'border-transparent text-[var(--cerami-muted)] hover:text-[var(--cerami-text)]'}`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-line border-primary rounded-full animate-spin" /></div>
      ) : tab === 'classes' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {classes.map((cls) => (
            <Card key={cls.id} padding="sm" className="space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold">{cls.name}</h3>
                  <p className="text-xs text-[var(--cerami-muted)]">{cls.subject || '—'} • {cls.academicYear || ''}</p>
                </div>
                <span className="text-xs bg-[var(--cerami-bg)] px-2 py-1 rounded-full">{cls.enrolledCount}/{cls.capacity}</span>
              </div>
              <p className="text-xs text-[var(--cerami-muted)]">المدرس: {cls.teacherName || 'غير معين'}</p>
              <div className="flex gap-1 flex-wrap">
                <Button size="sm" variant="ghost" onClick={() => openClass(cls)}>الطلاب</Button>
                <Button size="sm" variant="ghost" onClick={() => openAttendance(cls)}>الحضور</Button>
                {canManage && <Button size="sm" variant="ghost" onClick={() => { setSchedForm({ classId: cls.id, dayOfWeek: '0', startTime: '08:00', endTime: '09:30', room: '' }); setSchedModal(true); }}>+ حصة</Button>}
              </div>
            </Card>
          ))}
          {classes.length === 0 && <Card className="col-span-full"><p className="text-center text-sm text-[var(--cerami-muted)] py-8">لا توجد فصول — أنشئ أول فصل.</p></Card>}
        </div>
      ) : tab === 'timetable' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {weeklyGrid.map((day) => (
            <Card key={day.day} padding="sm">
              <CardHeader title={day.dayName} />
              <div className="mt-2 space-y-2">
                {day.sessions.map((s) => (
                  <div key={s.id} className="bg-[var(--cerami-bg)] rounded-lg p-2 text-xs">
                    <div className="font-semibold">{s.className}</div>
                    <div className="text-[var(--cerami-muted)]">{s.startTime} - {s.endTime} {s.room ? `• ${s.room}` : ''}</div>
                  </div>
                ))}
                {day.sessions.length === 0 && <p className="text-xs text-[var(--cerami-muted)] text-center py-3">لا حصص</p>}
              </div>
            </Card>
          ))}
        </div>
      ) : tab === 'students' ? (
        <div className="space-y-4">
          {selectedClass && (
            <Card padding="sm" className="flex justify-between items-center">
              <div><h3 className="font-bold">{selectedClass.name}</h3><p className="text-xs text-[var(--cerami-muted)]">{selectedClass.enrolledCount}/{selectedClass.capacity} طالب</p></div>
              {canManage && <Button size="sm" onClick={() => { setEnrollForm({ classId: selectedClass.id, customerId: '' }); setEnrollModal(true); }} leadingIcon={<UserPlus className="w-4 h-4" />}>تسجيل طالب</Button>}
            </Card>
          )}
          {!selectedClass && (
            <Card padding="sm" className="flex justify-between items-center">
              <h3 className="font-bold">كل التسجيلات</h3>
              {canManage && <Button size="sm" onClick={() => { setEnrollForm({ classId: classes[0]?.id || '', customerId: '' }); setEnrollModal(true); }}>+ تسجيل</Button>}
            </Card>
          )}
          <Card padding="none">
            <table className="w-full text-sm">
              <thead><tr className="text-right text-[var(--cerami-muted)] border-b border-[var(--cerami-border)]">
                <th className="p-3">الطالب</th><th className="p-3">الفصل</th><th className="p-3">الحالة</th><th className="p-3">تاريخ التسجيل</th>{canManage && <th className="p-3"></th>}
              </tr></thead>
              <tbody>
                {(selectedClass ? enrollments.filter((e) => e.classId === selectedClass.id) : enrollments).map((e) => (
                  <tr key={e.id} className="border-b border-[var(--cerami-border)] last:border-0">
                    <td className="p-3 font-medium">{e.studentName}</td>
                    <td className="p-3">{e.className}</td>
                    <td className="p-3"><span className="px-2 py-0.5 rounded-full text-[11px] bg-accent-soft text-primary">{e.status}</span></td>
                    <td className="p-3 text-xs">{e.enrolledAt?.slice(0, 10)}</td>
                    {canManage && <td className="p-3"><Button size="sm" variant="ghost" onClick={() => run(() => { service.updateEnrollmentStatus(e.id, e.status === 'ACTIVE' ? 'WITHDRAWN' : 'ACTIVE'); load(); })}>{e.status === 'ACTIVE' ? 'انسحاب' : 'تفعيل'}</Button></td>}
                  </tr>
                ))}
                {enrollments.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-[var(--cerami-muted)]">لا توجد تسجيلات.</td></tr>}
              </tbody>
            </table>
          </Card>
        </div>
      ) : tab === 'attendance' ? (
        <div className="space-y-4">
          <Card padding="sm" className="flex flex-wrap gap-3 items-center">
            <FormField label="الفصل"><select className={`${selectCls} w-56`} value={selectedClass?.id || ''} onChange={(e) => { const cls = classes.find((c) => c.id === e.target.value); if (cls) openAttendance(cls); }}><option value="">اختر فصل...</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></FormField>
            <FormField label="التاريخ"><input type="date" className={`${inputCls} w-40`} value={attendanceDate} onChange={(e) => setAttendanceDate(e.target.value)} /></FormField>
            {canManage && selectedClass && <Button size="sm" onClick={() => run(() => {
              const records = roster.filter((r) => attendanceMarks[r.enrollmentId]).map((r) => ({ enrollmentId: r.enrollmentId, status: attendanceMarks[r.enrollmentId] }));
              service.markAttendance(selectedClass.id, attendanceDate, records);
              toast.success('تم حفظ الحضور');
              openAttendance(selectedClass);
            })}>حفظ الحضور</Button>}
          </Card>
          {selectedClass && (
            <Card padding="none">
              <table className="w-full text-sm">
                <thead><tr className="text-right text-[var(--cerami-muted)] border-b border-[var(--cerami-border)]"><th className="p-3">الطالب</th><th className="p-3">الحالة</th></tr></thead>
                <tbody>
                  {roster.map((r) => (
                    <tr key={r.enrollmentId} className="border-b border-[var(--cerami-border)] last:border-0">
                      <td className="p-3 font-medium">{r.studentName}</td>
                      <td className="p-3">
                        {canManage ? (
                          <select className={`${selectCls} w-36`} value={attendanceMarks[r.enrollmentId] || ''} onChange={(e) => setAttendanceMarks({ ...attendanceMarks, [r.enrollmentId]: e.target.value as AttendanceStatus })}>
                            <option value="">—</option>
                            {Object.entries(ATT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                        ) : <span>{r.status ? ATT_LABEL[r.status] : '—'}</span>}
                      </td>
                    </tr>
                  ))}
                  {roster.length === 0 && <tr><td colSpan={2} className="p-8 text-center text-[var(--cerami-muted)]">لا يوجد طلاب في هذا الفصل.</td></tr>}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {canManage && <div className="flex justify-end"><Button size="sm" onClick={() => { setFeeForm({ enrollmentId: enrollments[0]?.id || '', title: '', amount: '', dueDate: '' }); setFeeModal(true); }}>+ قسط جديد</Button></div>}
          <Card padding="none">
            <table className="w-full text-sm">
              <thead><tr className="text-right text-[var(--cerami-muted)] border-b border-[var(--cerami-border)]">
                <th className="p-3">الطالب</th><th className="p-3">الفصل</th><th className="p-3">القسط</th>
                <th className="p-3">المبلغ</th><th className="p-3">المدفوع</th><th className="p-3">المتبقي</th>
                <th className="p-3">الاستحقاق</th><th className="p-3">الحالة</th>{canManage && <th className="p-3"></th>}
              </tr></thead>
              <tbody>
                {fees.map((f) => (
                  <tr key={f.id} className="border-b border-[var(--cerami-border)] last:border-0">
                    <td className="p-3 font-medium">{f.studentName}</td>
                    <td className="p-3 text-xs">{f.className}</td>
                    <td className="p-3">{f.title}</td>
                    <td className="p-3">{currency.format(f.amount)}</td>
                    <td className="p-3 text-success">{currency.format(f.paidAmount)}</td>
                    <td className="p-3 font-semibold text-danger">{currency.format(f.remaining)}</td>
                    <td className="p-3 text-xs">{f.dueDate || '—'}</td>
                    <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-[11px] ${f.status === 'PAID' ? 'bg-success-soft text-success' : f.status === 'OVERDUE' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning'}`}>{f.status === 'PAID' ? 'مدفوع' : f.status === 'OVERDUE' ? 'متأخر' : f.status === 'PARTIAL' ? 'جزئي' : f.status === 'WAIVED' ? 'معفى' : 'معلق'}</span></td>
                    {canManage && <td className="p-3">{f.remaining > 0 && <Button size="sm" variant="ghost" onClick={() => run(() => { service.recordFeePayment(f.id, f.remaining); load(); })}>تسديد الكل</Button>}</td>}
                  </tr>
                ))}
                {fees.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-[var(--cerami-muted)]">لا توجد أقساط.</td></tr>}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* Class modal */}
      <Modal open={classModal} onClose={() => setClassModal(false)} title="فصل جديد" size="sm"
        footer={<div className="flex gap-2 justify-end"><Button variant="ghost" onClick={() => setClassModal(false)}>إلغاء</Button><Button onClick={() => run(() => { service.saveClass({ name: classForm.name, subject: classForm.subject || undefined, teacherId: classForm.teacherId || undefined, capacity: Number(classForm.capacity), academicYear: classForm.academicYear || undefined }); setClassModal(false); load(); })}>حفظ</Button></div>}>
        <div className="space-y-3">
          <FormField label="اسم الفصل" required><input className={inputCls} value={classForm.name} onChange={(e) => setClassForm({ ...classForm, name: e.target.value })} placeholder="مثال: رياضيات — الصف الثالث" /></FormField>
          <FormField label="المادة"><input className={inputCls} value={classForm.subject} onChange={(e) => setClassForm({ ...classForm, subject: e.target.value })} /></FormField>
          <FormField label="المدرس"><select className={selectCls} value={classForm.teacherId} onChange={(e) => setClassForm({ ...classForm, teacherId: e.target.value })}><option value="">—</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}</select></FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="السعة"><input type="number" className={inputCls} value={classForm.capacity} onChange={(e) => setClassForm({ ...classForm, capacity: e.target.value })} /></FormField>
            <FormField label="العام الدراسي"><input className={inputCls} value={classForm.academicYear} onChange={(e) => setClassForm({ ...classForm, academicYear: e.target.value })} /></FormField>
          </div>
        </div>
      </Modal>

      {/* Schedule modal */}
      <Modal open={schedModal} onClose={() => setSchedModal(false)} title="حصة جديدة" size="sm"
        footer={<div className="flex gap-2 justify-end"><Button variant="ghost" onClick={() => setSchedModal(false)}>إلغاء</Button><Button onClick={() => run(() => { service.saveSchedule({ classId: schedForm.classId, dayOfWeek: Number(schedForm.dayOfWeek), startTime: schedForm.startTime, endTime: schedForm.endTime, room: schedForm.room || undefined }); setSchedModal(false); load(); })}>حفظ</Button></div>}>
        <div className="space-y-3">
          <FormField label="الفصل" required><select className={selectCls} value={schedForm.classId} onChange={(e) => setSchedForm({ ...schedForm, classId: e.target.value })}>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></FormField>
          <FormField label="اليوم" required><select className={selectCls} value={schedForm.dayOfWeek} onChange={(e) => setSchedForm({ ...schedForm, dayOfWeek: e.target.value })}>{DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}</select></FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="من" required><input type="time" className={inputCls} value={schedForm.startTime} onChange={(e) => setSchedForm({ ...schedForm, startTime: e.target.value })} /></FormField>
            <FormField label="إلى" required><input type="time" className={inputCls} value={schedForm.endTime} onChange={(e) => setSchedForm({ ...schedForm, endTime: e.target.value })} /></FormField>
          </div>
          <FormField label="القاعة / الفصل الدراسي"><input className={inputCls} value={schedForm.room} onChange={(e) => setSchedForm({ ...schedForm, room: e.target.value })} /></FormField>
        </div>
      </Modal>

      {/* Enroll modal */}
      <Modal open={enrollModal} onClose={() => setEnrollModal(false)} title="تسجيل طالب" size="sm"
        footer={<div className="flex gap-2 justify-end"><Button variant="ghost" onClick={() => setEnrollModal(false)}>إلغاء</Button><Button onClick={() => run(() => { service.enrollStudent(enrollForm.classId, enrollForm.customerId); setEnrollModal(false); load(); if (selectedClass) openClass(selectedClass); })}>تسجيل</Button></div>}>
        <div className="space-y-3">
          <FormField label="الفصل" required><select className={selectCls} value={enrollForm.classId} onChange={(e) => setEnrollForm({ ...enrollForm, classId: e.target.value })}>{classes.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.enrolledCount}/{c.capacity})</option>)}</select></FormField>
          <FormField label="الطالب (عميل)" required><select className={selectCls} value={enrollForm.customerId} onChange={(e) => setEnrollForm({ ...enrollForm, customerId: e.target.value })}><option value="">اختر...</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></FormField>
        </div>
      </Modal>

      {/* Fee modal */}
      <Modal open={feeModal} onClose={() => setFeeModal(false)} title="قسط رسوم جديد" size="sm"
        footer={<div className="flex gap-2 justify-end"><Button variant="ghost" onClick={() => setFeeModal(false)}>إلغاء</Button><Button onClick={() => run(() => { service.addFeeInstallment({ enrollmentId: feeForm.enrollmentId, title: feeForm.title, amount: Number(feeForm.amount), dueDate: feeForm.dueDate || undefined }); setFeeModal(false); load(); })}>إضافة</Button></div>}>
        <div className="space-y-3">
          <FormField label="التسجيل" required><select className={selectCls} value={feeForm.enrollmentId} onChange={(e) => setFeeForm({ ...feeForm, enrollmentId: e.target.value })}>{enrollments.map((e) => <option key={e.id} value={e.id}>{e.studentName} — {e.className}</option>)}</select></FormField>
          <FormField label="عنوان القسط" required><input className={inputCls} value={feeForm.title} onChange={(e) => setFeeForm({ ...feeForm, title: e.target.value })} placeholder="مثال: قسط أول" /></FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="المبلغ" required><input type="number" step="0.01" className={inputCls} value={feeForm.amount} onChange={(e) => setFeeForm({ ...feeForm, amount: e.target.value })} /></FormField>
            <FormField label="الاستحقاق"><input type="date" className={inputCls} value={feeForm.dueDate} onChange={(e) => setFeeForm({ ...feeForm, dueDate: e.target.value })} /></FormField>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default EducationPage;
