import React, { useCallback, useEffect, useState } from 'react';
import {
  UserRound, Wallet, CheckSquare, CalendarDays, ShieldAlert, GraduationCap,
  Star, Gift, Inbox, Send,
} from 'lucide-react';
import {
  EmployeeSelfServiceService, MyProfile, MyPayslip, MyAttendanceRecord, MyLeaveRequestRecord,
  MyDiscipline, MyDocument, MyEnrollment, MyPerformance, MyBenefits, MySelfServiceRequest,
  SELF_SERVICE_REQUEST_TYPES,
} from '../../../services/domains/hr/EmployeeSelfServiceService';

type Tab = 'overview' | 'payroll' | 'attendance' | 'leaves' | 'discipline' | 'training' | 'performance' | 'benefits' | 'requests';

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

  useEffect(() => { load(); }, [load]);

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

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center">
          <UserRound className="w-5 h-5 text-sky-600" />
        </div>
        <div className="flex-1">
          <h1 className="text-base font-black">بوابة الموظف الذاتية</h1>
          <p className="text-xs text-slate-500 font-medium">{profile ? `${profile.fullName} • ${profile.jobTitle}${profile.departmentName ? ` • ${profile.departmentName}` : ''}` : 'بياناتك الشخصية فقط'}</p>
        </div>
        <button onClick={load} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white">تحديث</button>
      </div>
      <div className="flex-1 overflow-auto p-6 space-y-4">
        {error && <div className="px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{error}</div>}
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold ${tab === t.id ? 'bg-sky-600 text-white' : 'border border-slate-200 bg-white text-slate-700'}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        {loading ? <div className="py-16 flex justify-center"><UserRound className="w-6 h-6 animate-spin text-sky-500" /></div> : (
          <>
            {tab === 'overview' && profile && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2 lg:col-span-2">
                  <h3 className="text-sm font-black mb-3">بياناتي الشخصية</h3>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-lg border border-slate-100 px-3 py-2"><span className="text-slate-400 font-medium">الاسم:</span> <span className="font-bold">{profile.fullName}</span></div>
                    <div className="rounded-lg border border-slate-100 px-3 py-2"><span className="text-slate-400 font-medium">الرقم الوظيفي:</span> <span className="font-bold">{profile.code}</span></div>
                    <div className="rounded-lg border border-slate-100 px-3 py-2"><span className="text-slate-400 font-medium">المسمى:</span> <span className="font-bold">{profile.jobTitle}</span></div>
                    <div className="rounded-lg border border-slate-100 px-3 py-2"><span className="text-slate-400 font-medium">القسم:</span> <span className="font-bold">{profile.departmentName || 'غير محدد'}</span></div>
                    <div className="rounded-lg border border-slate-100 px-3 py-2"><span className="text-slate-400 font-medium">الفرع:</span> <span className="font-bold">{profile.branchName || 'غير محدد'}</span></div>
                    <div className="rounded-lg border border-slate-100 px-3 py-2"><span className="text-slate-400 font-medium">الحالة:</span> <span className="font-bold">{label(profile.status)}</span></div>
                    <div className="rounded-lg border border-slate-100 px-3 py-2"><span className="text-slate-400 font-medium">تاريخ الالتحاق:</span> <span className="font-bold">{profile.joinedDate}</span></div>
                    <div className="rounded-lg border border-slate-100 px-3 py-2"><span className="text-slate-400 font-medium">الهاتف:</span> <span className="font-bold">{profile.phone}</span></div>
                    <div className="rounded-lg border border-slate-100 px-3 py-2"><span className="text-slate-400 font-medium">البريد:</span> <span className="font-bold">{profile.email || 'غير محدد'}</span></div>
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
                  <h3 className="text-sm font-black mb-3">مستنداتي</h3>
                  {documents.length === 0 && <p className="text-xs text-slate-400">لا توجد مستندات مسجلة.</p>}
                  {documents.map((d) => (
                    <div key={d.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs">
                      <div className="font-bold">{d.title}</div>
                      <div className="text-slate-500">{label(d.documentType)} • {label(d.status)}{d.expiresAt ? ` • ينتهي ${d.expiresAt}` : ''}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === 'payroll' && (
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
                <h3 className="text-sm font-black mb-3">كشوف رواتبي</h3>
                {payslips.length === 0 && <p className="text-xs text-slate-400">لا توجد دورات رواتب معتمدة بعد.</p>}
                {payslips.map((p) => (
                  <div key={p.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold">دورة {p.period} • {label(p.runStatus)}</span>
                      <span className="font-black text-emerald-700">الصافي: {money(p.netAmount)}</span>
                    </div>
                    <div className="text-slate-500">
                      الإجمالي {money(p.grossAmount)} = الأساسي {money(p.baseAmount)}
                      {p.allowanceAmount ? ` + بدلات ${money(p.allowanceAmount)}` : ''}
                      {p.commissionAmount ? ` + عمولات ${money(p.commissionAmount)}` : ''}
                      {p.overtimeAmount ? ` + إضافي ${money(p.overtimeAmount)}` : ''}
                      {p.bonusAmount ? ` + مكافآت ${money(p.bonusAmount)}` : ''}
                    </div>
                    <div className="text-slate-500">
                      الخصومات: ضريبة {money(p.taxAmount)}
                      {p.loanDeductionAmount ? ` + قسط قرض ${money(p.loanDeductionAmount)}` : ''}
                      {p.advanceAmount ? ` + سلفة ${money(p.advanceAmount)}` : ''}
                      {p.attendanceDeductionAmount ? ` + خصم حضور ${money(p.attendanceDeductionAmount)}` : ''}
                      {p.paidAt ? ` • صُرف ${p.paidAt.slice(0, 10)}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'attendance' && (
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
                <h3 className="text-sm font-black mb-3">حضور وانصرافي</h3>
                {attendance.length === 0 && <p className="text-xs text-slate-400">لا يوجد سجل حضور.</p>}
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {attendance.map((a) => (
                    <div key={a.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-xs">
                      <span className="font-bold">{a.date}</span>
                      <span className={`font-bold ${a.status === 'PRESENT' ? 'text-emerald-600' : a.status === 'LATE' ? 'text-amber-600' : 'text-rose-600'}`}>{label(a.status)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === 'leaves' && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
                  <h3 className="text-sm font-black mb-3">طلبات إجازتي</h3>
                  {leaves.length === 0 && <p className="text-xs text-slate-400">لا توجد طلبات إجازة.</p>}
                  {leaves.map((l) => (
                    <div key={l.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs">
                      <div className="font-bold">{label(l.leaveType)} • {l.startDate} إلى {l.endDate} • {l.days} يوم</div>
                      <div className="text-slate-500">{label(l.status)}{l.decisionNote ? ` • ${l.decisionNote}` : ''}</div>
                    </div>
                  ))}
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
                  <h3 className="text-sm font-black mb-3">تقديم طلب إجازة</h3>
                  <select value={leaveForm.leaveType} onChange={(e) => setLeaveForm((p) => ({ ...p, leaveType: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <option value="ANNUAL">سنوية</option>
                    <option value="SICK">مرضية</option>
                    <option value="UNPAID">بدون راتب</option>
                    <option value="OTHER">أخرى</option>
                  </select>
                  <input type="date" value={leaveForm.startDate} onChange={(e) => setLeaveForm((p) => ({ ...p, startDate: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input type="date" value={leaveForm.endDate} onChange={(e) => setLeaveForm((p) => ({ ...p, endDate: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input value={leaveForm.reason} onChange={(e) => setLeaveForm((p) => ({ ...p, reason: e.target.value }))} placeholder="السبب (اختياري)" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <button onClick={() => run(() => { EmployeeSelfServiceService.submitLeaveRequest(leaveForm); setLeaveForm({ leaveType: 'ANNUAL', startDate: todayStr(), endDate: todayStr(), reason: '' }); })} className="flex items-center justify-center gap-1 rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white"><Send className="h-4 w-4" /> تقديم</button>
                </div>
              </div>
            )}

            {tab === 'discipline' && discipline && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
                  <h3 className="text-sm font-black mb-3">سجلي الانضباطي</h3>
                  {discipline.violations.map((v) => (
                    <div key={v.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs">
                      <div className="font-bold">مخالفة: {v.violationType} • {v.occurredAt}</div>
                      <div className="text-slate-500">{label(v.status)} • {v.severity}{v.description ? ` • ${v.description}` : ''}</div>
                    </div>
                  ))}
                  {discipline.warnings.map((w) => (
                    <div key={w.id} className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs">
                      <div className="font-bold text-amber-700">إنذار ({w.warningType}) • {w.issuedAt}</div>
                      {w.notes && <div className="text-slate-500">{w.notes}</div>}
                    </div>
                  ))}
                  {discipline.penalties.map((p) => (
                    <div key={p.id} className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs">
                      <div className="font-bold text-rose-700">جزاء ({p.penaltyType}) • {label(p.status)}</div>
                      <div className="text-slate-500">{money(p.amount)}{p.approvedAt ? ` • اعتمد ${p.approvedAt.slice(0, 10)}` : ''}</div>
                    </div>
                  ))}
                  {(discipline.violations.length + discipline.warnings.length + discipline.penalties.length) === 0 && <p className="text-xs text-slate-400">لا يوجد سجل انضباطي.</p>}
                </div>
                <div className="space-y-4">
                  <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
                    <h3 className="text-sm font-black mb-2">شكاوايي</h3>
                    {discipline.complaints.map((c) => (
                      <div key={c.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs">
                        <div className="font-bold">{c.subject} • {label(c.status)}</div>
                        {c.resolution && <div className="text-slate-500">{c.resolution}</div>}
                      </div>
                    ))}
                    <div className="border-t border-slate-100 pt-2 space-y-1.5">
                      <input value={complaintForm.subject} onChange={(e) => setComplaintForm((p) => ({ ...p, subject: e.target.value }))} placeholder="موضوع الشكوى" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                      <textarea value={complaintForm.description} onChange={(e) => setComplaintForm((p) => ({ ...p, description: e.target.value }))} placeholder="التفاصيل" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" rows={2} />
                      <button onClick={() => run(() => { EmployeeSelfServiceService.submitComplaint(complaintForm); setComplaintForm({ subject: '', description: '' }); })} className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white">تقديم شكوى</button>
                    </div>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
                    <h3 className="text-sm font-black mb-2">تظلماتي</h3>
                    {discipline.appeals.map((a) => (
                      <div key={a.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs">
                        <div className="font-bold">تظلم على {a.referenceType} • {label(a.status)}</div>
                        {a.decision && <div className="text-slate-500">{a.decision}</div>}
                      </div>
                    ))}
                    <div className="border-t border-slate-100 pt-2 space-y-1.5">
                      <select value={appealForm.referenceType} onChange={(e) => setAppealForm((p) => ({ ...p, referenceType: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                        <option value="HR_PENALTY">جزاء</option>
                        <option value="HR_WARNING">إنذار</option>
                        <option value="HR_VIOLATION">مخالفة</option>
                      </select>
                      <input value={appealForm.referenceId} onChange={(e) => setAppealForm((p) => ({ ...p, referenceId: e.target.value }))} placeholder="معرف المرجع" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                      <textarea value={appealForm.reason} onChange={(e) => setAppealForm((p) => ({ ...p, reason: e.target.value }))} placeholder="سبب التظلم" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" rows={2} />
                      <button onClick={() => run(() => { EmployeeSelfServiceService.submitAppeal(appealForm); setAppealForm({ referenceType: 'HR_PENALTY', referenceId: '', reason: '' }); })} className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white">تقديم تظلم</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {tab === 'training' && (
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
                <h3 className="text-sm font-black mb-3">تدريبي</h3>
                {training.length === 0 && <p className="text-xs text-slate-400">لا توجد دورات تدريبية.</p>}
                {training.map((e) => (
                  <div key={e.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs">
                    <div className="font-bold">{e.courseName} • {label(e.status)}</div>
                    <div className="text-slate-500">حضور {e.attendancePercent}%{e.score != null ? ` • الدرجة ${e.score}` : ''}{e.certificateExpiry ? ` • شهادة تنتهي ${e.certificateExpiry}` : ''}</div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'performance' && performance && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
                  <h3 className="text-sm font-black mb-3">تقييماتي</h3>
                  {performance.evaluations.length === 0 && <p className="text-xs text-slate-400">لا توجد تقييمات.</p>}
                  {performance.evaluations.map((e) => (
                    <div key={e.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs">
                      <div className="flex justify-between font-bold"><span>{e.cycleName || 'تقييم'}</span><span>{e.score}</span></div>
                      <div className="text-slate-500">{e.rating} • {label(e.status)}{e.submittedAt ? ` • ${e.submittedAt.slice(0, 10)}` : ''}</div>
                      {e.items.map((item, i) => (
                        <div key={i} className="text-slate-400">بند {i + 1}: {item.score}{item.comments ? ` — ${item.comments}` : ''}</div>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
                  <h3 className="text-sm font-black mb-3">أهدافي</h3>
                  {performance.goals.length === 0 && <p className="text-xs text-slate-400">لا توجد أهداف.</p>}
                  {performance.goals.map((g) => (
                    <div key={g.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs">
                      <div className="font-bold">{g.title}</div>
                      <div className="text-slate-500">الوزن {g.weight}{g.targetValue != null ? ` • المستهدف ${g.targetValue}` : ''}{g.actualValue != null ? ` • المحقق ${g.actualValue}` : ''} • {g.status}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === 'benefits' && benefits && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
                  <h3 className="text-sm font-black mb-2">بدلاتي</h3>
                  {benefits.allowances.length === 0 && <p className="text-xs text-slate-400">لا توجد بدلات.</p>}
                  {benefits.allowances.map((a) => (
                    <div key={a.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs">
                      <div className="font-bold">{a.allowanceType} • {money(a.amount)} • {a.frequency === 'MONTHLY' ? 'شهري' : 'مرة واحدة'}</div>
                      <div className="text-slate-500">من {a.effectiveFrom} • {a.isActive ? 'نشط' : 'موقوف'}</div>
                    </div>
                  ))}
                  <h3 className="text-sm font-black mb-2 mt-4">مزاياي والتأمينات</h3>
                  {benefits.benefits.length === 0 && <p className="text-xs text-slate-400">لا توجد مزايا.</p>}
                  {benefits.benefits.map((b) => (
                    <div key={b.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs">
                      <div className="font-bold">{b.benefitType} • {label(b.status)}</div>
                      <div className="text-slate-500">من {b.startDate}{b.policyNumber ? ` • وثيقة ${b.policyNumber}` : ''}</div>
                    </div>
                  ))}
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
                  <h3 className="text-sm font-black mb-2">قروضي وأقساطها</h3>
                  {benefits.loans.length === 0 && <p className="text-xs text-slate-400">لا توجد قروض.</p>}
                  {benefits.loans.map((l) => (
                    <div key={l.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs space-y-1">
                      <div className="font-bold">قرض {money(l.principal)} • قسط {money(l.installmentAmount)}</div>
                      <div className="text-slate-500">المتبقي: {money(l.remainingBalance)} • {l.status}</div>
                      {l.installments.map((i) => (
                        <div key={i.id} className="text-slate-400">قسط {i.dueDate}: {money(i.amount)} • {i.status === 'PAID' ? 'مسدد' : i.status === 'PENDING' ? 'مستحق' : 'متخطى'}</div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === 'requests' && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
                  <h3 className="text-sm font-black mb-3">طلباتي</h3>
                  {requests.length === 0 && <p className="text-xs text-slate-400">لا توجد طلبات.</p>}
                  {requests.map((r) => (
                    <div key={r.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs">
                      <div className="font-bold">{label(r.requestType)}: {r.subject} • {label(r.status)}</div>
                      {r.resolution && <div className="text-slate-500">{r.resolution}</div>}
                    </div>
                  ))}
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
                  <h3 className="text-sm font-black mb-3">تقديم طلب</h3>
                  <select value={requestForm.requestType} onChange={(e) => setRequestForm((p) => ({ ...p, requestType: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    {SELF_SERVICE_REQUEST_TYPES.map((t) => (
                      <option key={t} value={t}>{label(t)}</option>
                    ))}
                  </select>
                  <input value={requestForm.subject} onChange={(e) => setRequestForm((p) => ({ ...p, subject: e.target.value }))} placeholder="موضوع الطلب" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <textarea value={requestForm.details} onChange={(e) => setRequestForm((p) => ({ ...p, details: e.target.value }))} placeholder="التفاصيل" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" rows={2} />
                  <button onClick={() => run(() => { EmployeeSelfServiceService.submitRequest(requestForm); setRequestForm({ requestType: 'SALARY_CERTIFICATE', subject: '', details: '' }); })} className="flex items-center justify-center gap-1 rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white"><Send className="h-4 w-4" /> تقديم</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
