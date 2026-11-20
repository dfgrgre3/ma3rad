import React, { useCallback, useEffect, useState } from 'react';
import { Gift, HeartPulse, Landmark, CalendarCheck, PiggyBank } from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import {
  HrBenefitsService, HrAllowance, HrBenefit, HrLoan, HrLoanInstallment, HrLeaveSettlement,
} from '../../../services/domains/hr/HrBenefitsService';
import { useTabPermissions } from '../../../hooks/domains/auth/useTabPermissions';

type Tab = 'allowances' | 'benefits' | 'loans' | 'installments' | 'settlements';

const BENEFITS_TAB_PERMISSIONS: Record<Tab, readonly string[]> = {
  allowances: ['hr.benefits.manage'],
  benefits: ['hr.benefits.manage'],
  loans: ['hr.benefits.manage'],
  installments: ['hr.benefits.manage'],
  settlements: ['hr.benefits.manage'],
};

const todayStr = () => new Date().toISOString().slice(0, 10);

export const HrBenefitsPage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('allowances');
  const canTab = useTabPermissions<Tab>(BENEFITS_TAB_PERMISSIONS);
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
    // منع جلب البيانات كلياً عندما لا يملك المستخدم أي تبويبة مسموحة.
    if (!(['allowances', 'benefits', 'loans', 'installments', 'settlements'] as Tab[]).some(canTab)) {
      setLoading(false);
      return;
    }
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
  }, [filterEmployeeId, canTab]);

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
  const visibleTabs = tabs.filter((t) => canTab(t.id));
  const activeTab: Tab = canTab(tab) ? tab : (visibleTabs[0]?.id ?? tab);

  const loadInstallments = () => {
    if (!selectedLoanId) return;
    try { setInstallments(HrBenefitsService.getInstallments(selectedLoanId)); } catch (e: any) { setError(e?.message); }
  };

  return (
    <div className="h-full flex flex-col bg-surface-muted text-ink overflow-hidden">
      <div className="bg-surface border-b border-line px-6 pt-4">
        <PageHeader
          icon={<Gift className="h-5 w-5" />}
          title="المزايا والبدلات والتأمينات"
          description="بدلات شهرية، مزايا وتأمينات، قروض وأقساط، تسويات إجازات غير مستخدمة"
        />
      </div>
      <div className="flex-1 overflow-auto p-6 space-y-4">
        {error && <div className="px-4 py-2.5 rounded-xl bg-danger-soft border border-danger-border text-danger text-xs font-semibold">{error}</div>}
        <div className="flex items-center gap-2">
          <input value={filterEmployeeId} onChange={(e) => setFilterEmployeeId(e.target.value)} placeholder="فلترة حسب معرف الموظف" className="flex-1 rounded-lg border border-line px-3 py-2 text-sm" />
          <button onClick={load} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white">تحديث</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {visibleTabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold ${activeTab === t.id ? 'bg-success text-white' : 'border border-line bg-surface text-ink'}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        {loading ? <div className="py-16 flex justify-center"><Gift className="w-6 h-6 animate-spin text-success" /></div> : (
          <>
            {activeTab === 'allowances' && canTab('allowances') && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-surface border border-line rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">البدلات</h3>
                  {allowances.map((a) => (
                    <div key={a.id} className="rounded-lg border border-line px-3 py-2 text-xs">
                      <div className="font-bold">{a.allowanceType} • {a.amount} • {a.frequency}</div>
                      <div className="text-muted">{a.employeeId} • من {a.effectiveFrom}{a.effectiveTo ? ` إلى ${a.effectiveTo}` : ''} • {a.isActive ? 'نشط' : 'موقوف'}</div>
                      {a.isActive && <button onClick={() => run(() => HrBenefitsService.deactivateAllowance(a.id))} className="text-danger font-bold">إيقاف</button>}
                    </div>
                  ))}
                </div>
                <div className="bg-surface border border-line rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">إضافة بدل</h3>
                  <input value={allowanceForm.employeeId} onChange={(e) => setAllowanceForm((p) => ({ ...p, employeeId: e.target.value }))} placeholder="معرف الموظف" className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
                  <input value={allowanceForm.allowanceType} onChange={(e) => setAllowanceForm((p) => ({ ...p, allowanceType: e.target.value }))} placeholder="نوع البدل" className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
                  <input value={allowanceForm.amount} onChange={(e) => setAllowanceForm((p) => ({ ...p, amount: e.target.value }))} placeholder="المبلغ" className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
                  <select value={allowanceForm.frequency} onChange={(e) => setAllowanceForm((p) => ({ ...p, frequency: e.target.value }))} className="w-full rounded-lg border border-line px-3 py-2 text-sm">
                    <option value="MONTHLY">شهري</option>
                    <option value="ONE_TIME">مرة واحدة</option>
                  </select>
                  <input type="date" value={allowanceForm.effectiveFrom} onChange={(e) => setAllowanceForm((p) => ({ ...p, effectiveFrom: e.target.value }))} className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
                  <input type="date" value={allowanceForm.effectiveTo} onChange={(e) => setAllowanceForm((p) => ({ ...p, effectiveTo: e.target.value }))} placeholder="تاريخ الانتهاء (اختياري)" className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
                  <button onClick={() => run(() => HrBenefitsService.createAllowance({ ...allowanceForm, amount: Number(allowanceForm.amount) || 0, effectiveTo: allowanceForm.effectiveTo || null }))} className="w-full rounded-lg bg-success px-4 py-2.5 text-xs font-bold text-white">إضافة</button>
                  <p className="text-[10px] text-muted">البدلات الشهرية النشطة تدخل في إجمالي الراتب عند احتساب دورة الرواتب.</p>
                </div>
              </div>
            )}
            {activeTab === 'benefits' && canTab('benefits') && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-surface border border-line rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">المزايا والتأمينات</h3>
                  {benefits.map((b) => (
                    <div key={b.id} className="rounded-lg border border-line px-3 py-2 text-xs">
                      <div className="font-bold">{b.benefitType} • {b.provider || '—'} • {b.status}</div>
 <div className="text-muted">{b.employeeId} • {b.startDate}{b.endDate ? ` إلى ${b.endDate}` : ''} • بوليصة {b.policyNumber || '—'} • {b.amount}</div>
                      {b.status === 'ACTIVE' && (
                        <div className="flex gap-2 mt-1">
                          <button onClick={() => run(() => HrBenefitsService.updateBenefitStatus(b.id, 'EXPIRED'))} className="text-warning font-bold">انتهاء</button>
                          <button onClick={() => run(() => HrBenefitsService.updateBenefitStatus(b.id, 'CANCELLED'))} className="text-danger font-bold">إلغاء</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="bg-surface border border-line rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">إضافة ميزة/تأمين</h3>
                  <input value={benefitForm.employeeId} onChange={(e) => setBenefitForm((p) => ({ ...p, employeeId: e.target.value }))} placeholder="معرف الموظف" className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
                  <input value={benefitForm.benefitType} onChange={(e) => setBenefitForm((p) => ({ ...p, benefitType: e.target.value }))} placeholder="نوع الميزة (تأمين صحي...)" className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
                  <input value={benefitForm.provider} onChange={(e) => setBenefitForm((p) => ({ ...p, provider: e.target.value }))} placeholder="جهة التوفير" className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
                  <input value={benefitForm.policyNumber} onChange={(e) => setBenefitForm((p) => ({ ...p, policyNumber: e.target.value }))} placeholder="رقم البوليصة" className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
                  <input type="date" value={benefitForm.startDate} onChange={(e) => setBenefitForm((p) => ({ ...p, startDate: e.target.value }))} className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
                  <input type="date" value={benefitForm.endDate} onChange={(e) => setBenefitForm((p) => ({ ...p, endDate: e.target.value }))} placeholder="تاريخ الانتهاء (اختياري)" className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
                  <input value={benefitForm.amount} onChange={(e) => setBenefitForm((p) => ({ ...p, amount: e.target.value }))} placeholder="التكلفة الشهرية/السنوية" className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
                  <button onClick={() => run(() => HrBenefitsService.createBenefit({ ...benefitForm, amount: Number(benefitForm.amount) || 0, endDate: benefitForm.endDate || null }))} className="w-full rounded-lg bg-success px-4 py-2.5 text-xs font-bold text-white">إضافة</button>
                </div>
              </div>
            )}
            {activeTab === 'loans' && canTab('loans') && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-surface border border-line rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">القروض</h3>
                  {loans.map((l) => (
                    <div key={l.id} className="rounded-lg border border-line px-3 py-2 text-xs">
                      <div className="font-bold">{l.principal} • قسط {l.installmentAmount} • متبقي {l.remainingBalance} • {l.status}</div>
                      <div className="text-muted">{l.employeeId} • من {l.startDate} • {l.notes || ''}</div>
                      <button onClick={() => { setSelectedLoanId(l.id); setInstallments([]); }} className="text-primary font-bold">عرض الأقساط</button>
                    </div>
                  ))}
                </div>
                <div className="bg-surface border border-line rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">إنشاء قرض</h3>
                  <input value={loanForm.employeeId} onChange={(e) => setLoanForm((p) => ({ ...p, employeeId: e.target.value }))} placeholder="معرف الموظف" className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
                  <input value={loanForm.principal} onChange={(e) => setLoanForm((p) => ({ ...p, principal: e.target.value }))} placeholder="مبلغ القرض" className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
                  <input value={loanForm.installmentAmount} onChange={(e) => setLoanForm((p) => ({ ...p, installmentAmount: e.target.value }))} placeholder="قيمة القسط الشهري" className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
                  <input type="date" value={loanForm.startDate} onChange={(e) => setLoanForm((p) => ({ ...p, startDate: e.target.value }))} className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
                  <textarea value={loanForm.notes} onChange={(e) => setLoanForm((p) => ({ ...p, notes: e.target.value }))} placeholder="ملاحظات" className="w-full rounded-lg border border-line px-3 py-2 text-sm" rows={2} />
                  <button onClick={() => run(() => HrBenefitsService.createLoan({ ...loanForm, principal: Number(loanForm.principal) || 0, installmentAmount: Number(loanForm.installmentAmount) || 0 }))} className="w-full rounded-lg bg-success px-4 py-2.5 text-xs font-bold text-white">إنشاء</button>
                  <p className="text-[10px] text-muted">تُخصم الأقساط المستحقة من صافي الراتب عند اعتماد وصرف دورة الرواتب.</p>
                </div>
              </div>
            )}
            {activeTab === 'installments' && canTab('installments') && (
              <div className="bg-surface border border-line rounded-xl p-4 space-y-2">
                <h3 className="text-sm font-black">أقساط القروض</h3>
                <div className="flex items-center gap-2">
                  <input value={selectedLoanId} onChange={(e) => setSelectedLoanId(e.target.value)} placeholder="معرف القرض" className="flex-1 rounded-lg border border-line px-3 py-2 text-sm" />
                  <button onClick={loadInstallments} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white">تحميل</button>
                </div>
                {installments.map((i) => (
                  <div key={i.id} className="rounded-lg border border-line px-3 py-2 text-xs flex justify-between">
                    <span className="font-bold">{i.dueDate} • {i.amount} • {i.status}</span>
                    <span className="text-muted">{i.payrollTransactionId || ''}</span>
                  </div>
                ))}
              </div>
            )}
            {activeTab === 'settlements' && canTab('settlements') && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="bg-surface border border-line rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">تسويات الإجازات</h3>
                  {settlements.map((s) => (
                    <div key={s.id} className="rounded-lg border border-line px-3 py-2 text-xs">
                      <div className="font-bold">{s.leaveDays} يوم • {s.amount} • {s.status}</div>
                      <div className="text-muted">{s.employeeId} • {s.settlementDate} • {s.notes || ''}</div>
                      {s.status === 'PENDING' && <button onClick={() => run(() => HrBenefitsService.approveLeaveSettlement(s.id))} className="text-success font-bold">اعتماد وصرف</button>}
                    </div>
                  ))}
                </div>
                <div className="bg-surface border border-line rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-black">إنشاء تسوية إجازات</h3>
                  <input value={settlementForm.employeeId} onChange={(e) => setSettlementForm((p) => ({ ...p, employeeId: e.target.value }))} placeholder="معرف الموظف" className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
                  <input value={settlementForm.leaveDays} onChange={(e) => setSettlementForm((p) => ({ ...p, leaveDays: e.target.value }))} placeholder="أيام الإجازات غير المستخدمة" className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
                  <input value={settlementForm.amount} onChange={(e) => setSettlementForm((p) => ({ ...p, amount: e.target.value }))} placeholder="قيمة التسوية" className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
                  <input type="date" value={settlementForm.settlementDate} onChange={(e) => setSettlementForm((p) => ({ ...p, settlementDate: e.target.value }))} className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
                  <textarea value={settlementForm.notes} onChange={(e) => setSettlementForm((p) => ({ ...p, notes: e.target.value }))} placeholder="ملاحظات" className="w-full rounded-lg border border-line px-3 py-2 text-sm" rows={2} />
                  <button onClick={() => run(() => HrBenefitsService.createLeaveSettlement({ ...settlementForm, leaveDays: Number(settlementForm.leaveDays) || 0, amount: Number(settlementForm.amount) || 0 }))} className="w-full rounded-lg bg-success px-4 py-2.5 text-xs font-bold text-white">إنشاء</button>
                  <p className="text-[10px] text-muted">لا تُصرف التسوية إلا بعد الاعتماد؛ تُسجَّل حينها كإضافة (BONUS) تدخل دورة الرواتب.</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
