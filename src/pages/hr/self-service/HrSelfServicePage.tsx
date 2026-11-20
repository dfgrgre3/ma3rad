import React, { useCallback, useEffect, useState } from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { resolveActivitySubTabs } from '../../../config/activityElementSpec';
import { PageHeader } from '../../../components/ui/PageHeader';
import {
  UserRound, Wallet, CheckSquare, CalendarDays, ShieldAlert, GraduationCap,
  Star, Gift, Inbox, Send, ChevronRight, Printer, X,
} from 'lucide-react';
import {
  EmployeeSelfServiceService, MyProfile, MyPayslip, MyAttendanceRecord, MyLeaveRequestRecord,
  MyDiscipline, MyDocument, MyEnrollment, MyPerformance, MyBenefits, MySelfServiceRequest,
  SELF_SERVICE_REQUEST_TYPES,
} from '../../../services/domains/hr/EmployeeSelfServiceService';
import { useTabPermissions } from '../../../hooks/domains/auth/useTabPermissions';

type Tab = 'overview' | 'payroll' | 'attendance' | 'leaves' | 'discipline' | 'training' | 'performance' | 'benefits' | 'requests';

const TAB_PERMISSIONS: Record<Tab, readonly string[]> = {
  overview: ['hr.selfservice.view'],
  payroll: ['hr.selfservice.view', 'hr.payroll.view', 'employees.payroll.view'],
  attendance: ['hr.selfservice.view', 'employees.attendance.view'],
  leaves: ['hr.selfservice.view', 'hr.leave.view', 'hr.leave.request'],
  discipline: ['hr.selfservice.view'],
  training: ['hr.selfservice.view'],
  performance: ['hr.selfservice.view'],
  benefits: ['hr.selfservice.view'],
  requests: ['hr.selfservice.view', 'hr.selfservice.request'],
};

const todayStr = () => new Date().toISOString().slice(0, 10);

const money = (n: number) => `${Number(n || 0).toLocaleString('ar-EG')} ج.م`;
const label = (status: string) => {
  const map: Record<string, string> = {
    PENDING: 'قيد الانتظار', APPROVED: 'معتمد', REJECTED: 'مرفوض', CANCELLED: 'ملغى',
    PAID: 'مصروف', CLOSED: 'مغلق', PRESENT: 'حضور', LATE: 'متأخر', ABSENT: 'غياب',
    LEAVE: 'إجازة', OPEN: 'مفتوح', RESOLVED: 'تم الحل', IN_REVIEW: 'قيد المراجعة',
    COMPLETED: 'مكتمل', ENROLLED: 'مسجل', ATTENDED: 'حضر', FAILED: 'لم يكمل',
    DRAFT: 'مسودة', SUBMITTED: 'مقدم', POSTED: 'مُقيّد', ISSUED: 'صادر',
    UNDER_REVIEW: 'قيد المراجعة', ACTIVE: 'نشط', EXPIRED: 'منتهي', SALARY_CERTIFICATE: 'شهادة راتب',
    EMPLOYMENT_CERTIFICATE: 'شهادة تعيين', DOCUMENT_COPY: 'نسخة مستند', LETTER: 'خطاب', OTHER: 'أخرى',
  };
  return map[status] || status;
};

export const HrSelfServicePage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('overview');
  const canTab = useTabPermissions<Tab>(TAB_PERMISSIONS);
  const anyTabAllowed = (['overview', 'payroll', 'attendance', 'leaves', 'discipline', 'training', 'performance', 'benefits', 'requests'] as Tab[]).some(canTab);
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [payslips, setPayslips] = useState<MyPayslip[]>([]);
  const [attendance, setAttendance] = useState<MyAttendanceRecord[]>([]);
  const [leaves, setLeaves] = useState<MyLeaveRequestRecord[]>([]);
  const [discipline, setDiscipline] = useState<MyDiscipline | null>(null);
  const [documents, setDocuments] = useState<MyDocument[]>([]);
  const [training, setTraining] = useState<MyEnrollment[]>([]);
  const [performance, setPerformance] = useState<MyPerformance | null>(null);
  const [benefits, setBenefits] = useState<MyBenefits | null>(null);
  const [requests, setRequests] = useState<MySelfServiceRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [payslipDetail, setPayslipDetail] = useState<any>(null);

  const viewPayslipDetail = useCallback((period: string) => {
    try {
      setPayslipDetail(EmployeeSelfServiceService.getMyPayslipDetail(period));
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل تفاصيل القسيمة.');
    }
  }, []);

  const printPayslipDetail = useCallback(() => {
    window.print();
  }, []);

  const closePayslipDetail = useCallback(() => {
    setPayslipDetail(null);
    setError(null);
  }, []);

  const [leaveForm, setLeaveForm] = useState({ leaveType: 'ANNUAL', startDate: todayStr(), endDate: todayStr(), reason: '' });
  const [complaintForm, setComplaintForm] = useState({ subject: '', description: '' });
  const [appealForm, setAppealForm] = useState({ referenceType: 'HR_PENALTY', referenceId: '', reason: '' });
  const [requestForm, setRequestForm] = useState({ requestType: 'SALARY_CERTIFICATE', subject: '', details: '' });

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    try {
      setProfile(EmployeeSelfServiceService.getMyProfile());
      setPayslips(EmployeeSelfServiceService.getMyPayslips());
      setAttendance(EmployeeSelfServiceService.getMyAttendance());
      setLeaves(EmployeeSelfServiceService.getMyLeaveRequests());
      setDiscipline(EmployeeSelfServiceService.getMyDiscipline());
      setDocuments(EmployeeSelfServiceService.getMyDocuments());
      setTraining(EmployeeSelfServiceService.getMyTraining());
      setPerformance(EmployeeSelfServiceService.getMyPerformance());
      setBenefits(EmployeeSelfServiceService.getMyBenefits());
      setRequests(EmployeeSelfServiceService.getMyRequests());
      setError(null);
    } catch (e: any) { setError(e?.message || 'تعذر تحميل بياناتك.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (anyTabAllowed) load(); }, [load, anyTabAllowed]);

  const run = (fn: () => void) => {
    try { fn(); load(); } catch (e: any) { setError(e?.message || 'حدث خطأ.'); }
  };

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: 'ملفي', icon: <UserRound className="h-4 w-4" /> },
    { id: 'payroll', label: 'رواتبي', icon: <Wallet className="h-4 w-4" /> },
    { id: 'attendance', label: 'حضوري', icon: <CheckSquare className="h-4 w-4" /> },
    { id: 'leaves', label: 'إجازاتي', icon: <CalendarDays className="h-4 w-4" /> },
    { id: 'discipline', label: 'جزاءاتي وشكاواي', icon: <ShieldAlert className="h-4 w-4" /> },
    { id: 'training', label: 'تدريبي', icon: <GraduationCap className="h-4 w-4" /> },
    { id: 'performance', label: 'تقييمي', icon: <Star className="h-4 w-4" /> },
    { id: 'benefits', label: 'مزاياي وقروضي', icon: <Gift className="h-4 w-4" /> },
    { id: 'requests', label: 'طلباتي', icon: <Inbox className="h-4 w-4" /> },
  ];
  const visibleTabs = resolveActivitySubTabs(tabs.filter((t) => canTab(t.id)), '/hr/self-service');
  const activeTab: Tab = canTab(tab) ? tab : (visibleTabs[0]?.id ?? tab);

  return (
    <div className="h-full flex flex-col bg-surface-muted text-ink overflow-hidden">
      <div className="bg-surface border-b border-line px-6 pt-4">
        <PageHeader
          icon={<UserRound className="h-5 w-5" />}
          title="بوابة الموظف الذاتية"
          description={profile ? `${profile.fullName} • ${profile.jobTitle}${profile.departmentName ? ` • ${profile.departmentName}` : ''}` : 'بياناتك الشخصية فقط'}
          actions={
            <button onClick={load} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white">تحديث</button>
          }
        />
      </div>
      <div className="flex-1 overflow-auto p-6 space-y-4">
        {error && <div className="px-4 py-2.5 rounded-xl bg-danger-soft border border-danger-border text-danger text-xs font-semibold">{error}</div>}
        <div className="flex flex-wrap gap-2">
          {visibleTabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold ${activeTab === t.id ? 'bg-primary text-white' : 'border border-line bg-surface text-ink'}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        {loading ? <div className="py-16 flex justify-center"><UserRound className="w-6 h-6 animate-spin text-primary" /></div> : (
          <>
            {activeTab === 'overview' && canTab('overview') && profile && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="bg-surface border border-line rounded-xl p-5 space-y-2 lg:col-span-2">
                  <h3 className="text-sm font-black mb-3">بياناتي الشخصية</h3>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-lg border border-line px-3 py-2"><span className="text-muted font-medium">الاسم:</span> <span className="font-bold">{profile.fullName}</span></div>
                    <div className="rounded-lg border border-line px-3 py-2"><span className="text-muted font-medium">الرقم الوظيفي:</span> <span className="font-bold">{profile.code}</span></div>
                    <div className="rounded-lg border border-line px-3 py-2"><span className="text-muted font-medium">المسمى:</span> <span className="font-bold">{profile.jobTitle}</span></div>
                    <div className="rounded-lg border border-line px-3 py-2"><span className="text-muted font-medium">القسم:</span> <span className="font-bold">{profile.departmentName || 'غير محدد'}</span></div>
                    <div className="rounded-lg border border-line px-3 py-2"><span className="text-muted font-medium">الفرع:</span> <span className="font-bold">{profile.branchName || 'غير محدد'}</span></div>
                    <div className="rounded-lg border border-line px-3 py-2"><span className="text-muted font-medium">الحالة:</span> <span className="font-bold">{label(profile.status)}</span></div>
                    <div className="rounded-lg border border-line px-3 py-2"><span className="text-muted font-medium">تاريخ الالتحاق:</span> <span className="font-bold">{profile.joinedDate}</span></div>
                    <div className="rounded-lg border border-line px-3 py-2"><span className="text-muted font-medium">الهاتف:</span> <span className="font-bold">{profile.phone}</span></div>
                    <div className="rounded-lg border border-line px-3 py-2"><span className="text-muted font-medium">البريد:</span> <span className="font-bold">{profile.email || 'غير محدد'}</span></div>
                  </div>
                </div>
                <div className="bg-surface border border-line rounded-xl p-5 space-y-2">
                  <h3 className="text-sm font-black mb-3">مستنداتي</h3>
                  {documents.length === 0 && <p className="text-xs text-muted">لا توجد مستندات مسجلة.</p>}
                  {documents.map((d) => (
                    <div key={d.id} className="rounded-lg border border-line px-3 py-2 text-xs">
                      <div className="font-bold">{d.title}</div>
                      <div className="text-muted">{label(d.documentType)} • {label(d.status)}{d.expiresAt ? ` • ينتهي ${d.expiresAt}` : ''}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'payroll' && canTab('payroll') && (
              <div className="bg-surface border border-line rounded-xl p-5 space-y-2">
                <h3 className="text-sm font-black mb-3">كشوف رواتبي</h3>
                {payslips.length === 0 && <p className="text-xs text-muted">لا توجد دورات رواتب معتمدة بعد.</p>}
                {payslips.map((p) => (
                  <div key={p.id} className="rounded-lg border border-line px-3 py-2 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold">دورة {p.period} • {label(p.runStatus)}</span>
                      <span className="font-black text-success">الصافي: {money(p.netAmount)}</span>
                    </div>
                    <div className="text-muted">
                      الإجمالي {money(p.grossAmount)} = الأساسي {money(p.baseAmount)}
                      {p.allowanceAmount ? ` + بدلات ${money(p.allowanceAmount)}` : ''}
                      {p.commissionAmount ? ` + عمولات ${money(p.commissionAmount)}` : ''}
                      {p.overtimeAmount ? ` + إضافي ${money(p.overtimeAmount)}` : ''}
                      {p.bonusAmount ? ` + مكافآت ${money(p.bonusAmount)}` : ''}
                    </div>
                    <div className="text-muted">
                      الخصومات: ضريبة {money(p.taxAmount)}
                      {p.loanDeductionAmount ? ` + قسط قرض ${money(p.loanDeductionAmount)}` : ''}
                      {p.advanceAmount ? ` + سلفة ${money(p.advanceAmount)}` : ''}
                      {p.attendanceDeductionAmount ? ` + خصم حضور ${money(p.attendanceDeductionAmount)}` : ''}
                      {p.paidAt ? ` • صُرف ${p.paidAt.slice(0, 10)}` : ''}
                    </div>
                    <button
                      onClick={() => viewPayslipDetail(p.period)}
                      className="flex items-center justify-between w-full rounded-lg border border-accent-border bg-accent-soft px-3 py-1.5 text-[10px] font-bold text-primary"
                    >
                      <span>عرض التفاصيل والطباعة</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'attendance' && canTab('attendance') && (
              <div className="bg-surface border border-line rounded-xl p-5 space-y-2">
                <h3 className="text-sm font-black mb-3">حضور وانصرافي</h3>
                {attendance.length === 0 && <p className="text-xs text-muted">لا يوجد سجل حضور.</p>}
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {attendance.map((a) => (
                    <div key={a.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-xs">
                      <span className="font-bold">{a.date}</span>
                      <span className={`font-bold ${a.status === 'PRESENT' ? 'text-success' : a.status === 'LATE' ? 'text-warning' : 'text-danger'}`}>{label(a.status)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'leaves' && canTab('leaves') && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-surface border border-line rounded-xl p-5 space-y-2">
                  <h3 className="text-sm font-black mb-3">طلبات إجازتي</h3>
                  {leaves.length === 0 && <p className="text-xs text-muted">لا توجد طلبات إجازة.</p>}
                  {leaves.map((l) => (
                    <div key={l.id} className="rounded-lg border border-line px-3 py-2 text-xs">
                      <div className="font-bold">{label(l.leaveType)} • {l.startDate} إلى {l.endDate} • {l.days} يوم</div>
                      <div className="text-muted">{label(l.status)}{l.decisionNote ? ` • ${l.decisionNote}` : ''}</div>
                    </div>
                  ))}
                </div>
                <div className="bg-surface border border-line rounded-xl p-5 space-y-2">
                  <h3 className="text-sm font-black mb-3">تقديم طلب إجازة</h3>
                  <select value={leaveForm.leaveType} onChange={(e) => setLeaveForm((p) => ({ ...p, leaveType: e.target.value }))} className="w-full rounded-lg border border-line px-3 py-2 text-sm">
                    <option value="ANNUAL">سنوية</option>
                    <option value="SICK">مرضية</option>
                    <option value="UNPAID">بدون راتب</option>
                    <option value="OTHER">أخرى</option>
                  </select>
                  <input type="date" value={leaveForm.startDate} onChange={(e) => setLeaveForm((p) => ({ ...p, startDate: e.target.value }))} className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
                  <input type="date" value={leaveForm.endDate} onChange={(e) => setLeaveForm((p) => ({ ...p, endDate: e.target.value }))} className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
                  <input value={leaveForm.reason} onChange={(e) => setLeaveForm((p) => ({ ...p, reason: e.target.value }))} placeholder="السبب (اختياري)" className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
                  <button onClick={() => run(() => { EmployeeSelfServiceService.submitLeaveRequest(leaveForm); setLeaveForm({ leaveType: 'ANNUAL', startDate: todayStr(), endDate: todayStr(), reason: '' }); })} className="flex items-center justify-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white"><Send className="h-4 w-4" /> تقديم</button>
                </div>
              </div>
            )}

            {activeTab === 'discipline' && canTab('discipline') && discipline && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-surface border border-line rounded-xl p-5 space-y-2">
                  <h3 className="text-sm font-black mb-3">سجلي الانضباطي</h3>
                  {discipline.violations.map((v) => (
                    <div key={v.id} className="rounded-lg border border-line px-3 py-2 text-xs">
                      <div className="font-bold">مخالفة: {v.violationType} • {v.occurredAt}</div>
                      <div className="text-muted">{label(v.status)} • {v.severity}{v.description ? ` • ${v.description}` : ''}</div>
                    </div>
                  ))}
                  {discipline.warnings.map((w) => (
                    <div key={w.id} className="rounded-lg border border-warning-border bg-warning-soft px-3 py-2 text-xs">
                      <div className="font-bold text-warning">إنذار ({w.warningType}) • {w.issuedAt}</div>
                      {w.notes && <div className="text-muted">{w.notes}</div>}
                    </div>
                  ))}
                  {discipline.penalties.map((p) => (
                    <div key={p.id} className="rounded-lg border border-danger-border bg-danger-soft px-3 py-2 text-xs">
                      <div className="font-bold text-danger">جزاء ({p.penaltyType}) • {label(p.status)}</div>
                      <div className="text-muted">{money(p.amount)}{p.approvedAt ? ` • اعتمد ${p.approvedAt.slice(0, 10)}` : ''}</div>
                    </div>
                  ))}
                  {(discipline.violations.length + discipline.warnings.length + discipline.penalties.length) === 0 && <p className="text-xs text-muted">لا يوجد سجل انضباطي.</p>}
                </div>
                <div className="space-y-4">
                  <div className="bg-surface border border-line rounded-xl p-5 space-y-2">
                    <h3 className="text-sm font-black mb-2">شكاوايي</h3>
                    {discipline.complaints.map((c) => (
                      <div key={c.id} className="rounded-lg border border-line px-3 py-2 text-xs">
                        <div className="font-bold">{c.subject} • {label(c.status)}</div>
                        {c.resolution && <div className="text-muted">{c.resolution}</div>}
                      </div>
                    ))}
                    <div className="border-t border-line pt-2 space-y-1.5">
                      <input value={complaintForm.subject} onChange={(e) => setComplaintForm((p) => ({ ...p, subject: e.target.value }))} placeholder="موضوع الشكوى" className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
                      <textarea value={complaintForm.description} onChange={(e) => setComplaintForm((p) => ({ ...p, description: e.target.value }))} placeholder="التفاصيل" className="w-full rounded-lg border border-line px-3 py-2 text-sm" rows={2} />
                      <button onClick={() => run(() => { EmployeeSelfServiceService.submitComplaint(complaintForm); setComplaintForm({ subject: '', description: '' }); })} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white">تقديم شكوى</button>
                    </div>
                  </div>
                  <div className="bg-surface border border-line rounded-xl p-5 space-y-2">
                    <h3 className="text-sm font-black mb-2">تظلماتي</h3>
                    {discipline.appeals.map((a) => (
                      <div key={a.id} className="rounded-lg border border-line px-3 py-2 text-xs">
                        <div className="font-bold">تظلم على {a.referenceType} • {label(a.status)}</div>
                        {a.decision && <div className="text-muted">{a.decision}</div>}
                      </div>
                    ))}
                    <div className="border-t border-line pt-2 space-y-1.5">
                      <select value={appealForm.referenceType} onChange={(e) => setAppealForm((p) => ({ ...p, referenceType: e.target.value }))} className="w-full rounded-lg border border-line px-3 py-2 text-sm">
                        <option value="HR_PENALTY">جزاء</option>
                        <option value="HR_WARNING">إنذار</option>
                        <option value="HR_VIOLATION">مخالفة</option>
                      </select>
                      <input value={appealForm.referenceId} onChange={(e) => setAppealForm((p) => ({ ...p, referenceId: e.target.value }))} placeholder="معرف المرجع" className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
                      <textarea value={appealForm.reason} onChange={(e) => setAppealForm((p) => ({ ...p, reason: e.target.value }))} placeholder="سبب التظلم" className="w-full rounded-lg border border-line px-3 py-2 text-sm" rows={2} />
                      <button onClick={() => run(() => { EmployeeSelfServiceService.submitAppeal(appealForm); setAppealForm({ referenceType: 'HR_PENALTY', referenceId: '', reason: '' }); })} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white">تقديم تظلم</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'training' && canTab('training') && (
              <div className="bg-surface border border-line rounded-xl p-5 space-y-2">
                <h3 className="text-sm font-black mb-3">تدريبي</h3>
                {training.length === 0 && <p className="text-xs text-muted">لا توجد دورات تدريبية.</p>}
                {training.map((e) => (
                  <div key={e.id} className="rounded-lg border border-line px-3 py-2 text-xs">
                    <div className="font-bold">{e.courseName} • {label(e.status)}</div>
                    <div className="text-muted">حضور {e.attendancePercent}%{e.score != null ? ` • الدرجة ${e.score}` : ''}{e.certificateExpiry ? ` • شهادة تنتهي ${e.certificateExpiry}` : ''}</div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'performance' && canTab('performance') && performance && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-surface border border-line rounded-xl p-5 space-y-2">
                  <h3 className="text-sm font-black mb-3">تقييماتي</h3>
                  {performance.evaluations.length === 0 && <p className="text-xs text-muted">لا توجد تقييمات.</p>}
                  {performance.evaluations.map((e) => (
                    <div key={e.id} className="rounded-lg border border-line px-3 py-2 text-xs">
                      <div className="flex justify-between font-bold"><span>{e.cycleName || 'تقييم'}</span><span>{e.score}</span></div>
                      <div className="text-muted">{e.rating} • {label(e.status)}{e.submittedAt ? ` • ${e.submittedAt.slice(0, 10)}` : ''}</div>
                      {e.items.map((item, i) => (
                        <div key={i} className="text-muted">بند {i + 1}: {item.score}{item.comments ? ` — ${item.comments}` : ''}</div>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="bg-surface border border-line rounded-xl p-5 space-y-2">
                  <h3 className="text-sm font-black mb-3">أهدافي</h3>
                  {performance.goals.length === 0 && <p className="text-xs text-muted">لا توجد أهداف.</p>}
                  {performance.goals.map((g) => (
                    <div key={g.id} className="rounded-lg border border-line px-3 py-2 text-xs">
                      <div className="font-bold">{g.title}</div>
                      <div className="text-muted">الوزن {g.weight}{g.targetValue != null ? ` • المستهدف ${g.targetValue}` : ''}{g.actualValue != null ? ` • المحقق ${g.actualValue}` : ''} • {g.status}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'benefits' && canTab('benefits') && benefits && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-surface border border-line rounded-xl p-5 space-y-2">
                  <h3 className="text-sm font-black mb-2">بدلاتي</h3>
                  {benefits.allowances.length === 0 && <p className="text-xs text-muted">لا توجد بدلات.</p>}
                  {benefits.allowances.map((a) => (
                    <div key={a.id} className="rounded-lg border border-line px-3 py-2 text-xs">
                      <div className="font-bold">{a.allowanceType} • {money(a.amount)} • {a.frequency === 'MONTHLY' ? 'شهري' : 'مرة واحدة'}</div>
                      <div className="text-muted">من {a.effectiveFrom} • {a.isActive ? 'نشط' : 'موقوف'}</div>
                    </div>
                  ))}
                  <h3 className="text-sm font-black mb-2 mt-4">مزاياي والتأمينات</h3>
                  {benefits.benefits.length === 0 && <p className="text-xs text-muted">لا توجد مزايا.</p>}
                  {benefits.benefits.map((b) => (
                    <div key={b.id} className="rounded-lg border border-line px-3 py-2 text-xs">
                      <div className="font-bold">{b.benefitType} • {label(b.status)}</div>
                      <div className="text-muted">من {b.startDate}{b.policyNumber ? ` • وثيقة ${b.policyNumber}` : ''}</div>
                    </div>
                  ))}
                </div>
                <div className="bg-surface border border-line rounded-xl p-5 space-y-2">
                  <h3 className="text-sm font-black mb-2">قروضي وأقساطها</h3>
                  {benefits.loans.length === 0 && <p className="text-xs text-muted">لا توجد قروض.</p>}
                  {benefits.loans.map((l) => (
                    <div key={l.id} className="rounded-lg border border-line px-3 py-2 text-xs space-y-1">
                      <div className="font-bold">قرض {money(l.principal)} • قسط {money(l.installmentAmount)}</div>
                      <div className="text-muted">المتبقي: {money(l.remainingBalance)} • {l.status}</div>
                      {l.installments.map((i) => (
                        <div key={i.id} className="text-muted">قسط {i.dueDate}: {money(i.amount)} • {i.status === 'PAID' ? 'مسدد' : i.status === 'PENDING' ? 'مستحق' : 'متخطى'}</div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'requests' && canTab('requests') && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-surface border border-line rounded-xl p-5 space-y-2">
                  <h3 className="text-sm font-black mb-3">طلباتي</h3>
                  {requests.length === 0 && <p className="text-xs text-muted">لا توجد طلبات.</p>}
                  {requests.map((r) => (
                    <div key={r.id} className="rounded-lg border border-line px-3 py-2 text-xs">
                      <div className="font-bold">{label(r.requestType)}: {r.subject} • {label(r.status)}</div>
                      {r.resolution && <div className="text-muted">{r.resolution}</div>}
                    </div>
                  ))}
                </div>
                <div className="bg-surface border border-line rounded-xl p-5 space-y-2">
                  <h3 className="text-sm font-black mb-3">تقديم طلب</h3>
                  <select value={requestForm.requestType} onChange={(e) => setRequestForm((p) => ({ ...p, requestType: e.target.value }))} className="w-full rounded-lg border border-line px-3 py-2 text-sm">
                    {SELF_SERVICE_REQUEST_TYPES.map((t) => (
                      <option key={t} value={t}>{label(t)}</option>
                    ))}
                  </select>
                  <input value={requestForm.subject} onChange={(e) => setRequestForm((p) => ({ ...p, subject: e.target.value }))} placeholder="موضوع الطلب" className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
                  <textarea value={requestForm.details} onChange={(e) => setRequestForm((p) => ({ ...p, details: e.target.value }))} placeholder="التفاصيل" className="w-full rounded-lg border border-line px-3 py-2 text-sm" rows={2} />
                  <button onClick={() => run(() => { EmployeeSelfServiceService.submitRequest(requestForm); setRequestForm({ requestType: 'SALARY_CERTIFICATE', subject: '', details: '' }); })} className="flex items-center justify-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white"><Send className="h-4 w-4" /> تقديم</button>
                </div>
              </div>
            )}
          </>
        )}
        {payslipDetail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/80 backdrop-blur-sm p-4">
            <div className="bg-surface rounded-2xl border border-line w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
              <div className="flex items-center justify-between mb-4">
                <button onClick={closePayslipDetail} className="rounded-lg p-1.5 hover:bg-surface-sunken text-muted">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="border-b-2 border-line-strong pb-4 mb-6 flex justify-between items-start">
                <div>
                  <h2 className="text-lg font-black text-ink">قسيمة راتب شهرية</h2>
                  <p className="text-xs text-muted">
                    الموظف: {payslipDetail.employeeName} • الدورة: {payslipDetail.period} • الحالة: {label(payslipDetail.runStatus)}
                  </p>
                </div>
                <button onClick={printPayslipDetail} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white">
                  <Printer className="w-4 h-4" /> طباعة القسيمة
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs text-muted mb-6">
                <div><span className="font-bold text-ink">طريقة الصرف:</span> {payslipDetail.paymentMethod === 'CASH' ? 'نقدي' : payslipDetail.paymentMethod === 'BANK_TRANSFER' ? 'تحويل بنكي' : 'محفظة إلكترونية'}</div>
                <div><span className="font-bold text-ink">تاريخ الطباعة:</span> {new Date().toLocaleDateString('ar-EG')}</div>
              </div>

              <DataTable
                ariaLabel="تفاصيل قسيمة الراتب"
                rows={[
                  { label: 'الراتب الأساسي', amount: payslipDetail.baseAmount },
                  { label: 'العمل الإضافي', amount: payslipDetail.overtimeAmount },
                  { label: 'المكافآت', amount: payslipDetail.bonusAmount },
                  { label: 'العمولات المعتمدة', amount: payslipDetail.commissionAmount },
                  { label: 'البدلات الشهرية', amount: payslipDetail.allowanceAmount },
                  { label: 'الإجمالي الاستحقاقات', amount: payslipDetail.grossAmount, total: true },
                  { label: 'خصم الحضور والإجازة', amount: payslipDetail.attendanceDeductionAmount },
                  { label: 'الخصومات المعتمدة', amount: payslipDetail.manualDeductionAmount },
                  { label: 'السلف', amount: payslipDetail.advanceAmount },
                  { label: 'أقساط القروض', amount: payslipDetail.loanDeductionAmount },
                  { label: 'الضريبة', amount: payslipDetail.taxAmount },
                  { label: 'تأمينات اجتماعية (موظف)', amount: payslipDetail.socialInsuranceEmployeeShare },
                  { label: 'صافي الراتب المستحق', amount: payslipDetail.netAmount, net: true },
                ]}
                rowKey={(r: any) => r.label}
                tableClassName="mb-6 text-sm"
                columns={[
                  {
                    key: 'label', header: 'البند',
                    render: (r: any) => <span className={`px-3 py-2 ${r.total ? 'font-bold' : ''} ${r.net ? 'font-bold' : ''}`}>{r.label}</span>,
                  },
                  {
                    key: 'amount', header: 'المبلغ', align: 'end',
                    render: (r: any) => <span className={`px-3 py-2 font-mono ${r.total ? 'font-bold text-success' : ''} ${r.net ? 'font-bold text-danger' : ''}`}>{money(r.amount)}</span>,
                  },
                ]}
                rowClassName={(r: any) => `${r.total ? 'bg-success-soft' : ''} ${r.net ? 'bg-danger-soft' : ''}`}
              />

              {payslipDetail.warnings && payslipDetail.warnings.length > 0 && (
                <div className="bg-warning-soft border border-warning-border rounded-xl p-3 mb-4">
                  <h4 className="text-xs font-bold text-warning mb-2">تنبيهات:</h4>
                  <ul className="text-xs text-warning space-y-1 list-disc pl-4">
                    {payslipDetail.warnings.map((w: string, i: number) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="border-t border-line pt-4 text-xs text-muted text-center">
                قسيمة راتب إلكترونية تُنشأ من نظام إدارة الموارد البشرية. توثيق Informational ولا يُعتبر بديلاً عن السند المالي الموقع.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
