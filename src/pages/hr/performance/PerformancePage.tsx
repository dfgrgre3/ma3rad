import React, { useCallback, useEffect, useState } from 'react';
import { Target, ListChecks, Award, ClipboardList, TrendingUp, Gift } from 'lucide-react';
import { PerformanceService, PerformanceCycle, PerformanceKpi, PerformanceGoal, PerformanceEvaluation, PerformancePip, PerformanceReward } from '../../../services/domains/hr/PerformanceService';

type Tab = 'cycles' | 'kpis' | 'goals' | 'evaluations' | 'pips' | 'rewards';


export const PerformancePage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('cycles');
  const [cycles, setCycles] = useState<PerformanceCycle[]>([]);
  const [kpis, setKpis] = useState<PerformanceKpi[]>([]);
  const [goals, setGoals] = useState<PerformanceGoal[]>([]);
  const [evaluations, setEvaluations] = useState<PerformanceEvaluation[]>([]);
  const [pips, setPips] = useState<PerformancePip[]>([]);
  const [rewards, setRewards] = useState<PerformanceReward[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [cycleForm, setCycleForm] = useState({ name: '', periodType: 'MONTHLY' as any, startDate: new Date().toISOString().slice(0, 10), endDate: new Date().toISOString().slice(0, 10), status: 'DRAFT' as any });
  const [kpiForm, setKpiForm] = useState({ name: '', jobTitle: '', defaultWeight: '1', unit: '', description: '' });
  const [goalForm, setGoalForm] = useState({ employeeId: '', cycleId: '', title: '', weight: '1', targetValue: '' });
  const [evaluationForm, setEvaluationForm] = useState({ employeeId: '', cycleId: '', evaluatorType: 'MANAGER' as any, notes: '' });
  const [pipForm, setPipForm] = useState({ employeeId: '', startDate: new Date().toISOString().slice(0, 10), endDate: new Date().toISOString().slice(0, 10), reason: '', goals: '' });
  const [rewardForm, setRewardForm] = useState({ employeeId: '', evaluationId: '', rewardType: 'BONUS' as any, amount: '0', notes: '' });

  const [autoCycleId, setAutoCycleId] = useState('');
  const [syncForm, setSyncForm] = useState({ evaluationId: '', employeeId: '', from: new Date().toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) });

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    try {
      setCycles(PerformanceService.getCycles());
      setKpis(PerformanceService.getKpis());
      setGoals(PerformanceService.getGoals());
      setEvaluations(PerformanceService.getEvaluations());
      setPips(PerformanceService.getPips());
      setRewards(PerformanceService.getRewards());
    } catch (e: any) { setError(e?.message || 'تعذر تحميل بيانات تقييم الأداء.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createCycle = () => {
    try { PerformanceService.createCycle(cycleForm); setCycleForm({ name: '', periodType: 'MONTHLY', startDate: new Date().toISOString().slice(0, 10), endDate: new Date().toISOString().slice(0, 10), status: 'DRAFT' }); load(); }
    catch (e: any) { setError(e?.message); }
  };
  const createKpi = () => {
    try { PerformanceService.createKpi({ name: kpiForm.name, jobTitle: kpiForm.jobTitle || null, defaultWeight: Number(kpiForm.defaultWeight) || 1, unit: kpiForm.unit || null, description: kpiForm.description }); setKpiForm({ name: '', jobTitle: '', defaultWeight: '1', unit: '', description: '' }); load(); }
    catch (e: any) { setError(e?.message); }
  };
  const createGoal = () => {
    try { PerformanceService.createGoal({ employeeId: goalForm.employeeId, cycleId: goalForm.cycleId || null, title: goalForm.title, weight: Number(goalForm.weight) || 1, targetValue: goalForm.targetValue ? Number(goalForm.targetValue) : null }); setGoalForm({ employeeId: '', cycleId: '', title: '', weight: '1', targetValue: '' }); load(); }
    catch (e: any) { setError(e?.message); }
  };
  const createEvaluation = () => {
    try { PerformanceService.createEvaluation({ employeeId: evaluationForm.employeeId, cycleId: evaluationForm.cycleId, evaluatorType: evaluationForm.evaluatorType, notes: evaluationForm.notes }); setEvaluationForm({ employeeId: '', cycleId: '', evaluatorType: 'MANAGER', notes: '' }); load(); }
    catch (e: any) { setError(e?.message); }
  };
  const createPip = () => {
    try { PerformanceService.createPip({ employeeId: pipForm.employeeId, startDate: pipForm.startDate, endDate: pipForm.endDate, reason: pipForm.reason, goals: pipForm.goals }); setPipForm({ employeeId: '', startDate: new Date().toISOString().slice(0, 10), endDate: new Date().toISOString().slice(0, 10), reason: '', goals: '' }); load(); }
    catch (e: any) { setError(e?.message); }
  };
  const createReward = () => {
    try { PerformanceService.createReward({ employeeId: rewardForm.employeeId, evaluationId: rewardForm.evaluationId || null, rewardType: rewardForm.rewardType, amount: Number(rewardForm.amount) || 0, notes: rewardForm.notes }); setRewardForm({ employeeId: '', evaluationId: '', rewardType: 'BONUS', amount: '0', notes: '' }); load(); }
    catch (e: any) { setError(e?.message); }
  };

  const autoCreate = (type: 'MANAGER' | 'SELF') => {
    if (!autoCycleId.trim()) return;
    try {
      const count = PerformanceService.autoCreateEvaluations(autoCycleId.trim(), type);
      setError(null);
      alert(`تم إنشاء ${count} تقييم (${type}).`);
      load();
    } catch (e: any) { setError(e?.message || 'تعذر إنشاء التقييمات.'); }
  };
  const syncAttendance = () => {
    if (!syncForm.evaluationId.trim() || !syncForm.employeeId.trim()) return;
    try {
      const score = PerformanceService.syncAttendanceKpi(syncForm.evaluationId.trim(), syncForm.employeeId.trim(), syncForm.from, syncForm.to);
      setError(null);
      alert(`تمت مزامنة KPI الحضور. الدرجة: ${score}`);
      load();
    } catch (e: any) { setError(e?.message || 'تعذر المزامنة.'); }
  };
  const syncAllAttendance = () => {
    if (!autoCycleId.trim()) return;
    try {
      const count = PerformanceService.autoScoreAllAttendance(autoCycleId.trim(), syncForm.from, syncForm.to);
      setError(null);
      alert(`تمت مزامنة ${count} تقييم.`);
      load();
    } catch (e: any) { setError(e?.message || 'تعذر المزامنة.'); }
  };

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'cycles', label: 'دورات التقييم', icon: <ClipboardList className="h-4 w-4" /> },
    { id: 'kpis', label: 'مؤشرات KPI', icon: <Target className="h-4 w-4" /> },
    { id: 'goals', label: 'الأهداف', icon: <ListChecks className="h-4 w-4" /> },
    { id: 'evaluations', label: 'التقييمات', icon: <TrendingUp className="h-4 w-4" /> },
    { id: 'pips', label: 'خطط التحسين PIP', icon: <Award className="h-4 w-4" /> },
    { id: 'rewards', label: 'المكافآت', icon: <Gift className="h-4 w-4" /> },
  ];

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center">
          <Target className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-base font-black">تقييم أداء الموظفين</h1>
          <p className="text-xs text-slate-500 font-medium">دورات، مؤشرات، أهداف، تقييمات، خطط تحسين، مكافآت</p>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-6 space-y-4">
        {error && <div className="px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{error}</div>}
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold ${tab === t.id ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-white text-slate-700'}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        {loading ? <div className="py-16 flex justify-center"><Target className="w-6 h-6 animate-spin text-indigo-500" /></div> : (
          <>
            {tab === 'cycles' && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">دورات التقييم</h3>
                  {cycles.map((c) => (
                    <div key={c.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-xs">
                      <span className="font-bold">{c.name} ({c.periodType})</span>
                      <span>{c.startDate} → {c.endDate} • {c.status}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">دورة جديدة</h3>
                  <input value={cycleForm.name} onChange={(e) => setCycleForm((p) => ({ ...p, name: e.target.value }))} placeholder="اسم الدورة" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <select value={cycleForm.periodType} onChange={(e) => setCycleForm((p) => ({ ...p, periodType: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    {['MONTHLY', 'QUARTERLY', 'ANNUAL', 'CUSTOM'].map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                  <input type="date" value={cycleForm.startDate} onChange={(e) => setCycleForm((p) => ({ ...p, startDate: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input type="date" value={cycleForm.endDate} onChange={(e) => setCycleForm((p) => ({ ...p, endDate: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <button onClick={createCycle} className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white">إنشاء</button>
                </div>
              </div>
            )}
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
              <h3 className="text-sm font-black">تقييمات تلقائية</h3>
              <input value={autoCycleId} onChange={(e) => setAutoCycleId(e.target.value)} placeholder="معرف الدورة" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <div className="flex gap-2">
                <button onClick={() => autoCreate('MANAGER')} className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white">إنشاء (مدير)</button>
                <button onClick={() => autoCreate('SELF')} className="flex-1 rounded-lg bg-slate-800 px-4 py-2.5 text-xs font-bold text-white">إنشاء (ذاتي)</button>
              </div>
            </div>

            {tab === 'kpis' && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">المؤشرات</h3>
                  {kpis.map((k) => (
                    <div key={k.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs">
                      <div className="font-bold">{k.name}</div>
                      <div className="text-slate-500">{k.jobTitle || '—'} • وزن {k.defaultWeight}</div>
                    </div>
                  ))}
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">مؤشر جديد</h3>
                  <input value={kpiForm.name} onChange={(e) => setKpiForm((p) => ({ ...p, name: e.target.value }))} placeholder="اسم المؤشر" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input value={kpiForm.jobTitle} onChange={(e) => setKpiForm((p) => ({ ...p, jobTitle: e.target.value }))} placeholder="المسمى (اختياري)" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input value={kpiForm.defaultWeight} onChange={(e) => setKpiForm((p) => ({ ...p, defaultWeight: e.target.value }))} placeholder="الوزن" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input value={kpiForm.unit} onChange={(e) => setKpiForm((p) => ({ ...p, unit: e.target.value }))} placeholder="الوحدة" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <textarea value={kpiForm.description} onChange={(e) => setKpiForm((p) => ({ ...p, description: e.target.value }))} placeholder="الوصف" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" rows={2} />
                  <button onClick={createKpi} className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white">إنشاء</button>
                </div>
              </div>
            )}
            {tab === 'goals' && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">الأهداف</h3>
                  {goals.map((g) => (
                    <div key={g.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs">
                      <div className="font-bold">{g.title}</div>
                      <div className="text-slate-500">{g.employeeId} • وزن {g.weight} • {g.status}</div>
                    </div>
                  ))}
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">هدف جديد</h3>
                  <input value={goalForm.employeeId} onChange={(e) => setGoalForm((p) => ({ ...p, employeeId: e.target.value }))} placeholder="معرف الموظف" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input value={goalForm.cycleId} onChange={(e) => setGoalForm((p) => ({ ...p, cycleId: e.target.value }))} placeholder="معرف الدورة (اختياري)" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input value={goalForm.title} onChange={(e) => setGoalForm((p) => ({ ...p, title: e.target.value }))} placeholder="عنوان الهدف" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input value={goalForm.weight} onChange={(e) => setGoalForm((p) => ({ ...p, weight: e.target.value }))} placeholder="الوزن" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input value={goalForm.targetValue} onChange={(e) => setGoalForm((p) => ({ ...p, targetValue: e.target.value }))} placeholder="القيمة المستهدفة" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <button onClick={createGoal} className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white">إنشاء</button>
                </div>
              </div>
            )}
            {tab === 'evaluations' && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">التقييمات</h3>
                  {evaluations.map((ev) => (
                    <div key={ev.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs">
                      <div className="font-bold">{ev.employeeId} • {ev.score} • {ev.rating}</div>
                      <div className="text-slate-500">{ev.status} • {ev.evaluatorType}</div>
                    </div>
                  ))}
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">تقييم جديد</h3>
                  <input value={evaluationForm.employeeId} onChange={(e) => setEvaluationForm((p) => ({ ...p, employeeId: e.target.value }))} placeholder="معرف الموظف" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input value={evaluationForm.cycleId} onChange={(e) => setEvaluationForm((p) => ({ ...p, cycleId: e.target.value }))} placeholder="معرف الدورة" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <select value={evaluationForm.evaluatorType} onChange={(e) => setEvaluationForm((p) => ({ ...p, evaluatorType: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    {['SELF', 'MANAGER', 'DEPARTMENT', 'HR', 'PEER'].map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                  <textarea value={evaluationForm.notes} onChange={(e) => setEvaluationForm((p) => ({ ...p, notes: e.target.value }))} placeholder="ملاحظات" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" rows={2} />
                  <button onClick={createEvaluation} className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white">إنشاء</button>
                </div>
              </div>
            )}
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
              <h3 className="text-sm font-black">مزامنة KPI الحضور</h3>
              <input value={syncForm.evaluationId} onChange={(e) => setSyncForm((p) => ({ ...p, evaluationId: e.target.value }))} placeholder="معرف التقييم" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <input value={syncForm.employeeId} onChange={(e) => setSyncForm((p) => ({ ...p, employeeId: e.target.value }))} placeholder="معرف الموظف" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <input type="date" value={syncForm.from} onChange={(e) => setSyncForm((p) => ({ ...p, from: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <input type="date" value={syncForm.to} onChange={(e) => setSyncForm((p) => ({ ...p, to: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <div className="flex gap-2">
                <button onClick={syncAttendance} className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white">مزامنة تقييم</button>
                <button onClick={syncAllAttendance} className="flex-1 rounded-lg bg-slate-800 px-4 py-2.5 text-xs font-bold text-white">مزامنة الكل</button>
              </div>
            </div>

            {tab === 'pips' && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">خطط التحسين</h3>
                  {pips.map((p) => (
                    <div key={p.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs">
                      <div className="font-bold">{p.employeeId} • {p.status}</div>
                      <div className="text-slate-500">{p.startDate} → {p.endDate}</div>
                    </div>
                  ))}
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">خطة جديدة</h3>
                  <input value={pipForm.employeeId} onChange={(e) => setPipForm((p) => ({ ...p, employeeId: e.target.value }))} placeholder="معرف الموظف" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input type="date" value={pipForm.startDate} onChange={(e) => setPipForm((p) => ({ ...p, startDate: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input type="date" value={pipForm.endDate} onChange={(e) => setPipForm((p) => ({ ...p, endDate: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input value={pipForm.reason} onChange={(e) => setPipForm((p) => ({ ...p, reason: e.target.value }))} placeholder="السبب" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <textarea value={pipForm.goals} onChange={(e) => setPipForm((p) => ({ ...p, goals: e.target.value }))} placeholder="الأهداف" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" rows={2} />
                  <button onClick={createPip} className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white">إنشاء</button>
                </div>
              </div>
            )}
            {tab === 'rewards' && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">المكافآت</h3>
                  {rewards.map((r) => (
                    <div key={r.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs">
                      <div className="font-bold">{r.employeeId} • {r.rewardType} • {r.amount}</div>
                      <div className="text-slate-500">{r.status}</div>
                    </div>
                  ))}
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">مكافأة جديدة</h3>
                  <input value={rewardForm.employeeId} onChange={(e) => setRewardForm((p) => ({ ...p, employeeId: e.target.value }))} placeholder="معرف الموظف" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input value={rewardForm.evaluationId} onChange={(e) => setRewardForm((p) => ({ ...p, evaluationId: e.target.value }))} placeholder="معرف التقييم (اختياري)" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <select value={rewardForm.rewardType} onChange={(e) => setRewardForm((p) => ({ ...p, rewardType: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    {['BONUS', 'PROMOTION', 'RECOGNITION'].map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                  <input value={rewardForm.amount} onChange={(e) => setRewardForm((p) => ({ ...p, amount: e.target.value }))} placeholder="المبلغ" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <textarea value={rewardForm.notes} onChange={(e) => setRewardForm((p) => ({ ...p, notes: e.target.value }))} placeholder="ملاحظات" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" rows={2} />
                  <button onClick={createReward} className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white">إنشاء</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
