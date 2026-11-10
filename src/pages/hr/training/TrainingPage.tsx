import React, { useCallback, useEffect, useState } from 'react';
import { GraduationCap, Users, BookOpen, Award, Target, AlertTriangle } from 'lucide-react';
import { TrainingService, TrainingTrainer, TrainingCourse, TrainingEnrollment, Skill, JobSkill, TrainingGap } from '../../../services/domains/hr/TrainingService';
import { EmployeeService } from '../../../services/domains/hr/EmployeeService';

type Tab = 'trainers' | 'courses' | 'enrollments' | 'skills' | 'gaps' | 'certificates' | 'expenses';

export const TrainingPage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('courses');
  const [trainers, setTrainers] = useState<TrainingTrainer[]>([]);
  const [courses, setCourses] = useState<TrainingCourse[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [jobSkills, setJobSkills] = useState<JobSkill[]>([]);
  const [gaps, setGaps] = useState<TrainingGap[]>([]);
  const [expiring, setExpiring] = useState<TrainingEnrollment[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [payoutOptions, setPayoutOptions] = useState<{ bankAccounts: Array<{ id: string; accountName: string; bankName: string; accountNumber: string; currentBalance: number }>; registers: Array<{ id: string; name: string; currentBalance: number }> }>({ bankAccounts: [], registers: [] });
  const [expenseForm, setExpenseForm] = useState({ courseId: '', amount: '0', expenseDate: new Date().toISOString().slice(0, 10), description: '', paymentMethod: 'CASH', registerId: '', bankAccountId: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [trainerForm, setTrainerForm] = useState({ name: '', specialty: '', contact: '' });
  const [courseForm, setCourseForm] = useState({ name: '', description: '', trainerId: '', startDate: '', endDate: '', cost: '0', status: 'PLANNED' });
  const [skillForm, setSkillForm] = useState({ name: '', category: '' });
  const [jobSkillForm, setJobSkillForm] = useState({ jobTitle: '', skillId: '', requiredLevel: '1' });
  const [gapJobTitle, setGapJobTitle] = useState('');
  const [enrollmentForm, setEnrollmentForm] = useState({ courseId: '', employeeId: '', notes: '' });

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    try {
      setTrainers(TrainingService.getTrainers());
      setCourses(TrainingService.getCourses());
      setSkills(TrainingService.getSkills());
      setJobSkills(TrainingService.getJobSkills());
      setExpiring(TrainingService.getExpiringCertificates(30));
      setExpenses(TrainingService.getExpenses());
      try { setPayoutOptions(EmployeeService.getPayrollPayoutOptions()); } catch { /* ignore */ }
    } catch (e: any) { setError(e?.message || 'تعذر تحميل بيانات التدريب.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createTrainer = () => { try { TrainingService.createTrainer(trainerForm); setTrainerForm({ name: '', specialty: '', contact: '' }); load(); } catch (e: any) { setError(e?.message); } };
  const createCourse = () => { try { TrainingService.createCourse({ name: courseForm.name, description: courseForm.description, trainerId: courseForm.trainerId || null, startDate: courseForm.startDate || null, endDate: courseForm.endDate || null, cost: Number(courseForm.cost) || 0, status: courseForm.status }); setCourseForm({ name: '', description: '', trainerId: '', startDate: '', endDate: '', cost: '0', status: 'PLANNED' }); load(); } catch (e: any) { setError(e?.message); } };
  const createSkill = () => { try { TrainingService.createSkill(skillForm); setSkillForm({ name: '', category: '' }); load(); } catch (e: any) { setError(e?.message); } };
  const addJobSkill = () => { try { TrainingService.addJobSkill({ jobTitle: jobSkillForm.jobTitle, skillId: jobSkillForm.skillId, requiredLevel: Number(jobSkillForm.requiredLevel) || 1 }); setJobSkillForm({ jobTitle: '', skillId: '', requiredLevel: '1' }); load(); } catch (e: any) { setError(e?.message); } };
  const enroll = () => { try { TrainingService.enroll({ courseId: enrollmentForm.courseId, employeeId: enrollmentForm.employeeId, notes: enrollmentForm.notes }); setEnrollmentForm({ courseId: '', employeeId: '', notes: '' }); load(); } catch (e: any) { setError(e?.message); } };
  const loadGaps = () => { if (!gapJobTitle.trim()) return; try { setGaps(TrainingService.getTrainingGaps(gapJobTitle.trim())); setError(null); } catch (e: any) { setError(e?.message); } };

  const recordExpense = () => {
    try {
      TrainingService.recordExpense({ courseId: expenseForm.courseId || null, amount: Number(expenseForm.amount) || 0, expenseDate: expenseForm.expenseDate, description: expenseForm.description, paymentMethod: expenseForm.paymentMethod, registerId: expenseForm.registerId || null, bankAccountId: expenseForm.bankAccountId || null });
      setExpenseForm({ courseId: '', amount: '0', expenseDate: new Date().toISOString().slice(0, 10), description: '', paymentMethod: 'CASH', registerId: '', bankAccountId: '' });
      load();
    } catch (e: any) { setError(e?.message); }
  };
  const postCourseCost = (courseId: string) => {
    try { TrainingService.postCourseCost(courseId); load(); } catch (e: any) { setError(e?.message); }
  };

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'courses', label: 'الدورات', icon: <BookOpen className="h-4 w-4" /> },
    { id: 'trainers', label: 'المدربون', icon: <Users className="h-4 w-4" /> },
    { id: 'enrollments', label: 'التسجيلات', icon: <GraduationCap className="h-4 w-4" /> },
    { id: 'skills', label: 'المهارات', icon: <Target className="h-4 w-4" /> },
    { id: 'gaps', label: 'فجوات التدريب', icon: <AlertTriangle className="h-4 w-4" /> },
    { id: 'certificates', label: 'الشهادات', icon: <Award className="h-4 w-4" /> },
    { id: 'expenses', label: 'المصروفات', icon: <Award className="h-4 w-4" /> },
  ];

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center">
          <GraduationCap className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <h1 className="text-base font-black">التدريب والتطوير</h1>
          <p className="text-xs text-slate-500 font-medium">دورات، مدربون، تسجيلات، مهارات، فجوات، شهادات</p>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-6 space-y-4">
        {error && <div className="px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{error}</div>}
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold ${tab === t.id ? 'bg-amber-600 text-white' : 'border border-slate-200 bg-white text-slate-700'}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        {loading ? <div className="py-16 flex justify-center"><GraduationCap className="w-6 h-6 animate-spin text-amber-500" /></div> : (
          <>
            {tab === 'trainers' && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">المدربون</h3>
                  {trainers.map((t) => <div key={t.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs font-bold">{t.name} • {t.specialty || '—'}</div>)}
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">مدرب جديد</h3>
                  <input value={trainerForm.name} onChange={(e) => setTrainerForm((p) => ({ ...p, name: e.target.value }))} placeholder="الاسم" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input value={trainerForm.specialty} onChange={(e) => setTrainerForm((p) => ({ ...p, specialty: e.target.value }))} placeholder="التخصص" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input value={trainerForm.contact} onChange={(e) => setTrainerForm((p) => ({ ...p, contact: e.target.value }))} placeholder="التواصل" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <button onClick={createTrainer} className="w-full rounded-lg bg-amber-600 px-4 py-2.5 text-xs font-bold text-white">إضافة</button>
                </div>
              </div>
            )}
            {tab === 'courses' && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">الدورات</h3>
                  {courses.map((c) => (
                    <div key={c.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs">
                      <div className="font-bold">{c.name}</div>
                      <div className="text-slate-500">{c.startDate || '—'} → {c.endDate || '—'} • {c.status} • {c.cost}</div>
                    </div>
                  ))}
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">دورة جديدة</h3>
                  <input value={courseForm.name} onChange={(e) => setCourseForm((p) => ({ ...p, name: e.target.value }))} placeholder="اسم الدورة" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <textarea value={courseForm.description} onChange={(e) => setCourseForm((p) => ({ ...p, description: e.target.value }))} placeholder="الوصف" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" rows={2} />
                  <select value={courseForm.trainerId} onChange={(e) => setCourseForm((p) => ({ ...p, trainerId: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <option value="">المدرب (اختياري)</option>
                    {trainers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <input type="date" value={courseForm.startDate} onChange={(e) => setCourseForm((p) => ({ ...p, startDate: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input type="date" value={courseForm.endDate} onChange={(e) => setCourseForm((p) => ({ ...p, endDate: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input value={courseForm.cost} onChange={(e) => setCourseForm((p) => ({ ...p, cost: e.target.value }))} placeholder="التكلفة" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <select value={courseForm.status} onChange={(e) => setCourseForm((p) => ({ ...p, status: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    {['PLANNED', 'ONGOING', 'COMPLETED', 'CANCELLED'].map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                  <button onClick={createCourse} className="w-full rounded-lg bg-amber-600 px-4 py-2.5 text-xs font-bold text-white">إنشاء</button>
                </div>
              </div>
            )}
            {tab === 'enrollments' && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">تسجيل موظف</h3>
                  <select value={enrollmentForm.courseId} onChange={(e) => setEnrollmentForm((p) => ({ ...p, courseId: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <option value="">الدورة</option>
                    {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <input value={enrollmentForm.employeeId} onChange={(e) => setEnrollmentForm((p) => ({ ...p, employeeId: e.target.value }))} placeholder="معرف الموظف" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <textarea value={enrollmentForm.notes} onChange={(e) => setEnrollmentForm((p) => ({ ...p, notes: e.target.value }))} placeholder="ملاحظات" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" rows={2} />
                  <button onClick={enroll} className="w-full rounded-lg bg-amber-600 px-4 py-2.5 text-xs font-bold text-white">تسجيل</button>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">الشهادات منتهية (30 يوم)</h3>
                  {expiring.map((e) => (
                    <div key={e.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs">
                      <div className="font-bold">{e.employeeId} • {e.courseId}</div>
                      <div className="text-slate-500">انتهاء: {e.certificateExpiry}</div>
                    </div>
                  ))}
                  {!expiring.length && <div className="text-xs text-slate-400">لا توجد شهادات منتهية.</div>}
                </div>
              </div>
            )}
            {tab === 'skills' && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">المهارات</h3>
                  {skills.map((s) => <div key={s.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs font-bold">{s.name} • {s.category || '—'}</div>)}
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <input value={skillForm.name} onChange={(e) => setSkillForm((p) => ({ ...p, name: e.target.value }))} placeholder="اسم المهارة" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    <input value={skillForm.category} onChange={(e) => setSkillForm((p) => ({ ...p, category: e.target.value }))} placeholder="الفئة" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    <button onClick={createSkill} className="w-full rounded-lg bg-amber-600 px-4 py-2.5 text-xs font-bold text-white">إضافة مهارة</button>
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">ربط مهارة بوظيفة</h3>
                  <input value={jobSkillForm.jobTitle} onChange={(e) => setJobSkillForm((p) => ({ ...p, jobTitle: e.target.value }))} placeholder="المسمى الوظيفي" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <select value={jobSkillForm.skillId} onChange={(e) => setJobSkillForm((p) => ({ ...p, skillId: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <option value="">المهارة</option>
                    {skills.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <input value={jobSkillForm.requiredLevel} onChange={(e) => setJobSkillForm((p) => ({ ...p, requiredLevel: e.target.value }))} placeholder="المستوى المطلوب" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <button onClick={addJobSkill} className="w-full rounded-lg bg-amber-600 px-4 py-2.5 text-xs font-bold text-white">ربط</button>
                  <div className="space-y-1 pt-2">
                    {jobSkills.map((js) => (
                      <div key={js.id} className="text-xs text-slate-600">{js.jobTitle} • {js.skillId} • مستوى {js.requiredLevel}</div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {tab === 'gaps' && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">فجوات التدريب</h3>
                  <div className="flex gap-2">
                    <input value={gapJobTitle} onChange={(e) => setGapJobTitle(e.target.value)} placeholder="المسمى الوظيفي" className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    <button onClick={loadGaps} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white">تحميل</button>
                  </div>
                  {gaps.map((g, idx) => (
                    <div key={idx} className="rounded-lg border border-slate-100 px-3 py-2 text-xs">
                      <div className="font-bold">{g.employeeId} • {g.skillName}</div>
                      <div className="text-slate-500">مطلوب {g.requiredLevel} • فعلي {g.actualLevel} • فجوة {g.gap}</div>
                    </div>
                  ))}
                  {!gaps.length && <div className="text-xs text-slate-400">لا توجد فجوات (أو لا توجد بيانات).</div>}
                </div>
              </div>
            )}
            {tab === 'certificates' && (
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                <h3 className="text-sm font-black">الشهادات منتهية (30 يوم)</h3>
                {expiring.map((e) => (
                  <div key={e.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs">
                    <div className="font-bold">{e.employeeId} • {e.courseId}</div>
                    <div className="text-slate-500">انتهاء: {e.certificateExpiry}</div>
                  </div>
                ))}
                {!expiring.length && <div className="text-xs text-slate-400">لا توجد شهادات منتهية.</div>}
              </div>
            )}
            {tab === 'expenses' && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">المصروفات</h3>
                  {expenses.map((e) => (
                    <div key={e.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs">
                      <div className="font-bold">{e.description || e.courseId || '—'} • {e.amount}</div>
                      <div className="text-slate-500">{e.expenseDate} • {e.paymentMethod}</div>
                    </div>
                  ))}
                  {!expenses.length && <div className="text-xs text-slate-400">لا توجد مصروفات.</div>}
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">تسجيل مصروف</h3>
                  <select value={expenseForm.courseId} onChange={(e) => setExpenseForm((p) => ({ ...p, courseId: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <option value="">الدورة (اختياري)</option>
                    {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <input value={expenseForm.amount} onChange={(e) => setExpenseForm((p) => ({ ...p, amount: e.target.value }))} placeholder="المبلغ" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input type="date" value={expenseForm.expenseDate} onChange={(e) => setExpenseForm((p) => ({ ...p, expenseDate: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input value={expenseForm.description} onChange={(e) => setExpenseForm((p) => ({ ...p, description: e.target.value }))} placeholder="الوصف" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <select value={expenseForm.paymentMethod} onChange={(e) => setExpenseForm((p) => ({ ...p, paymentMethod: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    {['CASH', 'BANK_TRANSFER', 'WALLET'].map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                  {expenseForm.paymentMethod === 'CASH' && (
                    <select value={expenseForm.registerId} onChange={(e) => setExpenseForm((p) => ({ ...p, registerId: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                      <option value="">الخزينة (اختياري)</option>
                      {payoutOptions.registers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  )}
                  {expenseForm.paymentMethod === 'BANK_TRANSFER' && (
                    <select value={expenseForm.bankAccountId} onChange={(e) => setExpenseForm((p) => ({ ...p, bankAccountId: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                      <option value="">الحساب البنكي</option>
                      {payoutOptions.bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.accountName} - {b.bankName}</option>)}
                    </select>
                  )}
                  <button onClick={recordExpense} className="w-full rounded-lg bg-amber-600 px-4 py-2.5 text-xs font-bold text-white">تسجيل</button>
                  <div className="pt-2 border-t border-slate-100 space-y-2">
                    <h4 className="text-xs font-black">ترحيل تكلفة دورة</h4>
                    {courses.map((c) => (
                      <button key={c.id} onClick={() => postCourseCost(c.id)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">
                        {c.name} ({c.cost})
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
