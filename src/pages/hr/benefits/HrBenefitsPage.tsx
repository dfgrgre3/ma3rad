import React, { useCallback, useEffect, useState } from 'react';
import { Gift, HeartPulse, Landmark, CalendarCheck, PiggyBank } from 'lucide-react';
import {
  HrBenefitsService, HrAllowance, HrBenefit, HrLoan, HrLoanInstallment, HrLeaveSettlement,
} from '../../../services/domains/hr/HrBenefitsService';

type Tab = 'allowances' | 'benefits' | 'loans' | 'installments' | 'settlements';

const todayStr = () => new Date().toISOString().slice(0, 10);

export const HrBenefitsPage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('allowances');
  const [allowances, setAllowances] = useState<HrAllowance[]>([]);
  const [benefits, setBenefits] = useState<HrBenefit[]>([]);
  const [loans, setLoans] = useState<HrLoan[]>([]);
  const [installments, setInstallments] = useState<HrLoanInstallment[]>([]);
  const [settlements, setSettlements] = useState<HrLeaveSettlement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [allowanceForm, setAllowanceForm] = useState({ employeeId: '', allowanceType: 'سكن', amount: '0', frequency: 'MONTHLY', effectiveFrom: todayStr(), effectiveTo: '' });
  const [benefitForm, setBenefitForm] = useState({ employeeId: '', benefitType: 'تأمين صحي', provider: '', policyNumber: '', startDate: todayStr(), endDate: '', amount: '0' });
  const [loanForm, setLoanForm] = useState({ employeeId: '', principal: '0', installmentAmount: '0', startDate: todayStr(), notes: '' });
  const [settlementForm, setSettlementForm] = useState({ employeeId: '', leaveDays: '0', amount: '0', settlementDate: todayStr(), notes: '' });
  const [filterEmployeeId, setFilterEmployeeId] = useState('');
  const [selectedLoanId, setSelectedLoanId] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    try {
      setAllowances(HrBenefitsService.getAllowances(filterEmployeeId || undefined));
      setBenefits(HrBenefitsService.getBenefits(filterEmployeeId || undefined));
      setLoans(HrBenefitsService.getLoans(filterEmployeeId || undefined));
      setSettlements(HrBenefitsService.getLeaveSettlements(filterEmployeeId || undefined));
      setError(null);
    } catch (e: any) { setError(e?.message || 'تعذر تحميل البيانات.'); }
    finally { setLoading(false); }
  }, [filterEmployeeId]);

  useEffect(() => { load(); }, [load]);

  const run = (fn: () => void) => {
    try { fn(); load(); } catch (e: any) { setError(e?.message || 'حدث خطأ.'); }
  };

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'allowances', label: 'البدلات', icon: <Gift className="h-4 w-4" /> },
    { id: 'benefits', label: 'المزايا والتأمينات', icon: <HeartPulse className="h-4 w-4" /> },
    { id: 'loans', label: 'القروض', icon: <Landmark className="h-4 w-4" /> },
    { id: 'installments', label: 'أقساط القروض', icon: <PiggyBank className="h-4 w-4" /> },
    { id: 'settlements', label: 'تسويات الإجازات', icon: <CalendarCheck className="h-4 w-4" /> },
  ];

  const loadInstallments = () => {
    if (!selectedLoanId) return;
    try { setInstallments(HrBenefitsService.getInstallments(selectedLoanId)); } catch (e: any) { setError(e?.message); }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center">
          <Gift className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-base font-black">المزايا والبدلات والتأمينات</h1>
          <p className="text-xs text-slate-500 font-medium">بدلات شهرية، مزايا وتأمينات، قروض وأقساط، تسويات إجازات غير مستخدمة</p>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-6 space-y-4">
        {error && <div className="px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{error}</div>}
        <div className="flex items-center gap-2">
          <input value={filterEmployeeId} onChange={(e) => setFilterEmployeeId(e.target.value)} placeholder="فلترة حسب معرف الموظف" className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <button onClick={load} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white">تحديث</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold ${tab === t.id ? 'bg-emerald-600 text-white' : 'border border-slate-200 bg-white text-slate-700'}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        {loading ? <div className="py-16 flex justify-center"><Gift className="w-6 h-6 animate-spin text-emerald-500" /></div> : (
          <>
            {tab === 'allowances' && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">البدلات</h3>
                  {allowances.map((a) => (
                    <div key={a.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs">
                      <div className="font-bold">{a.allowanceType} • {a.amount} • {a.frequency}</div>
                      <div className="text-slate-500">{a.employeeId} • من {a.effectiveFrom}{a.effectiveTo ? ` إلى ${a.effectiveTo}` : ''} • {a.isActive ? 'نشط' : 'موقوف'}</div>
                      {a.isActive && <button onClick={() => run(() => HrBenefitsService.deactivateAllowance(a.id))} className="text-rose-600 font-bold">إيقاف</button>}
                    </div>
                  ))}
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">إضافة بدل</h3>
                  <input value={allowanceForm.employeeId} onChange={(e) => setAllowanceForm((p) => ({ ...p, employeeId: e.target.value }))} placeholder="معرف الموظف" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input value={allowanceForm.allowanceType} onChange={(e) => setAllowanceForm((p) => ({ ...p, allowanceType: e.target.value }))} placeholder="نوع البدل" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input value={allowanceForm.amount} onChange={(e) => setAllowanceForm((p) => ({ ...p, amount: e.target.value }))} placeholder="المبلغ" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <select value={allowanceForm.frequency} onChange={(e) => setAllowanceForm((p) => ({ ...p, frequency: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <option value="MONTHLY">شهري</option>
                    <option value="ONE_TIME">مرة واحدة</option>
                  </select>
                  <input type="date" value={allowanceForm.effectiveFrom} onChange={(e) => setAllowanceForm((p) => ({ ...p, effectiveFrom: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input type="date" value={allowanceForm.effectiveTo} onChange={(e) => setAllowanceForm((p) => ({ ...p, effectiveTo: e.target.value }))} placeholder="تاريخ الانتهاء (اختياري)" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <button onClick={() => run(() => HrBenefitsService.createAllowance({ ...allowanceForm, amount: Number(allowanceForm.amount) || 0, effectiveTo: allowanceForm.effectiveTo || null }))} className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white">إضافة</button>
                  <p className="text-[10px] text-slate-500">البدلات الشهرية النشطة تدخل في إجمالي الراتب عند احتساب دورة الرواتب.</p>
                </div>
              </div>
            )}
            {tab === 'benefits' && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">المزايا والتأمينات</h3>
                  {benefits.map((b) => (
                    <div key={b.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs">
                      <div className="font-bold">{b.benefitType} • {b.provider || '—'} • {b.status}</div>
 <div className="text-slate-500">{b.employeeId} • {b.startDate}{b.endDate ? ` إلى ${b.endDate}` : ''} • بوليصة {b.policyNumber || '—'} • {b.amount}</div>
                      {b.status === 'ACTIVE' && (
                        <div className="flex gap-2 mt-1">
                          <button onClick={() => run(() => HrBenefitsService.updateBenefitStatus(b.id, 'EXPIRED'))} className="text-amber-600 font-bold">انتهاء</button>
                          <button onClick={() => run(() => HrBenefitsService.updateBenefitStatus(b.id, 'CANCELLED'))} className="text-rose-600 font-bold">إلغاء</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">إضافة ميزة/تأمين</h3>
                  <input value={benefitForm.employeeId} onChange={(e) => setBenefitForm((p) => ({ ...p, employeeId: e.target.value }))} placeholder="معرف الموظف" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input value={benefitForm.benefitType} onChange={(e) => setBenefitForm((p) => ({ ...p, benefitType: e.target.value }))} placeholder="نوع الميزة (تأمين صحي...)" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input value={benefitForm.provider} onChange={(e) => setBenefitForm((p) => ({ ...p, provider: e.target.value }))} placeholder="جهة التوفير" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input value={benefitForm.policyNumber} onChange={(e) => setBenefitForm((p) => ({ ...p, policyNumber: e.target.value }))} placeholder="رقم البوليصة" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input type="date" value={benefitForm.startDate} onChange={(e) => setBenefitForm((p) => ({ ...p, startDate: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input type="date" value={benefitForm.endDate} onChange={(e) => setBenefitForm((p) => ({ ...p, endDate: e.target.value }))} placeholder="تاريخ الانتهاء (اختياري)" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input value={benefitForm.amount} onChange={(e) => setBenefitForm((p) => ({ ...p, amount: e.target.value }))} placeholder="التكلفة الشهرية/السنوية" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <button onClick={() => run(() => HrBenefitsService.createBenefit({ ...benefitForm, amount: Number(benefitForm.amount) || 0, endDate: benefitForm.endDate || null }))} className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white">إضافة</button>
                </div>
              </div>
            )}
            {tab === 'loans' && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">القروض</h3>
                  {loans.map((l) => (
                    <div key={l.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs">
                      <div className="font-bold">{l.principal} • قسط {l.installmentAmount} • متبقي {l.remainingBalance} • {l.status}</div>
                      <div className="text-slate-500">{l.employeeId} • من {l.startDate} • {l.notes || ''}</div>
                      <button onClick={() => { setSelectedLoanId(l.id); setInstallments([]); }} className="text-sky-600 font-bold">عرض الأقساط</button>
                    </div>
                  ))}
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">إنشاء قرض</h3>
                  <input value={loanForm.employeeId} onChange={(e) => setLoanForm((p) => ({ ...p, employeeId: e.target.value }))} placeholder="معرف الموظف" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input value={loanForm.principal} onChange={(e) => setLoanForm((p) => ({ ...p, principal: e.target.value }))} placeholder="مبلغ القرض" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input value={loanForm.installmentAmount} onChange={(e) => setLoanForm((p) => ({ ...p, installmentAmount: e.target.value }))} placeholder="قيمة القسط الشهري" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input type="date" value={loanForm.startDate} onChange={(e) => setLoanForm((p) => ({ ...p, startDate: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <textarea value={loanForm.notes} onChange={(e) => setLoanForm((p) => ({ ...p, notes: e.target.value }))} placeholder="ملاحظات" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" rows={2} />
                  <button onClick={() => run(() => HrBenefitsService.createLoan({ ...loanForm, principal: Number(loanForm.principal) || 0, installmentAmount: Number(loanForm.installmentAmount) || 0 }))} className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white">إنشاء</button>
                  <p className="text-[10px] text-slate-500">تُخصم الأقساط المستحقة من صافي الراتب عند اعتماد وصرف دورة الرواتب.</p>
                </div>
              </div>
            )}
            {tab === 'installments' && (
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                <h3 className="text-sm font-black">أقساط القروض</h3>
                <div className="flex items-center gap-2">
                  <input value={selectedLoanId} onChange={(e) => setSelectedLoanId(e.target.value)} placeholder="معرف القرض" className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <button onClick={loadInstallments} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white">تحميل</button>
                </div>
                {installments.map((i) => (
                  <div key={i.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs flex justify-between">
                    <span className="font-bold">{i.dueDate} • {i.amount} • {i.status}</span>
                    <span className="text-slate-400">{i.payrollTransactionId || ''}</span>
                  </div>
                ))}
              </div>
            )}
            {tab === 'settlements' && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">تسويات الإجازات</h3>
                  {settlements.map((s) => (
                    <div key={s.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs">
                      <div className="font-bold">{s.leaveDays} يوم • {s.amount} • {s.status}</div>
                      <div className="text-slate-500">{s.employeeId} • {s.settlementDate} • {s.notes || ''}</div>
                      {s.status === 'PENDING' && <button onClick={() => run(() => HrBenefitsService.approveLeaveSettlement(s.id))} className="text-emerald-600 font-bold">اعتماد وصرف</button>}
                    </div>
                  ))}
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">إنشاء تسوية إجازات</h3>
                  <input value={settlementForm.employeeId} onChange={(e) => setSettlementForm((p) => ({ ...p, employeeId: e.target.value }))} placeholder="معرف الموظف" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input value={settlementForm.leaveDays} onChange={(e) => setSettlementForm((p) => ({ ...p, leaveDays: e.target.value }))} placeholder="أيام الإجازات غير المستخدمة" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input value={settlementForm.amount} onChange={(e) => setSettlementForm((p) => ({ ...p, amount: e.target.value }))} placeholder="قيمة التسوية" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input type="date" value={settlementForm.settlementDate} onChange={(e) => setSettlementForm((p) => ({ ...p, settlementDate: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <textarea value={settlementForm.notes} onChange={(e) => setSettlementForm((p) => ({ ...p, notes: e.target.value }))} placeholder="ملاحظات" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" rows={2} />
                  <button onClick={() => run(() => HrBenefitsService.createLeaveSettlement({ ...settlementForm, leaveDays: Number(settlementForm.leaveDays) || 0, amount: Number(settlementForm.amount) || 0 }))} className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white">إنشاء</button>
                  <p className="text-[10px] text-slate-500">لا تُصرف التسوية إلا بعد الاعتماد؛ تُسجَّل حينها كإضافة (BONUS) تدخل دورة الرواتب.</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
