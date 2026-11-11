import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calculator, Landmark, Pencil, RefreshCw, ShieldCheck, Trash2, Wallet,
} from 'lucide-react';
import {
  PayrollSocialInsuranceService, SocialInsuranceRule, EndOfServiceRule,
  SocialInsuranceSystemType, SocialInsuranceCalculation, EndOfServiceCalculation,
} from '../../../services/domains/hr/PayrollSocialInsuranceService';

type Tab = 'insurance' | 'eos' | 'calculator';

const todayStr = () => new Date().toISOString().slice(0, 10);

const systemTypeLabel: Record<SocialInsuranceSystemType, string> = {
  PRIVATE: 'القطاع الخاص',
  CIVIL: 'الخدمة المدنية',
  PUBLIC: 'القطاع العام',
  OTHER: 'أخرى',
};

const money = (value: number) => Number(value || 0).toLocaleString('ar-EG', { maximumFractionDigits: 2 });

interface SocialInsuranceForm {
  name: string;
  effectiveFrom: string;
  effectiveTo: string;
  isActive: boolean;
  employeeSharePercent: string;
  employerSharePercent: string;
  contributionCeiling: string;
  minimumContributionBase: string;
  maximumContributionBase: string;
  endOfServicePerYearPercent: string;
  endOfServiceMonthsPerYear: string;
}

interface EndOfServiceForm {
  systemType: SocialInsuranceSystemType;
  name: string;
  effectiveFrom: string;
  effectiveTo: string;
  isActive: boolean;
  serviceYearsForFullBenefit: string;
  benefitMonthsPerYearFirstPeriod: string;
  benefitMonthsPerYearSecondPeriod: string;
  secondPeriodThresholdYears: string;
}

const emptySocialInsuranceForm = (): SocialInsuranceForm => ({
  name: '', effectiveFrom: todayStr(), effectiveTo: '', isActive: true,
  employeeSharePercent: '0', employerSharePercent: '0', contributionCeiling: '0',
  minimumContributionBase: '0', maximumContributionBase: '0',
  endOfServicePerYearPercent: '0', endOfServiceMonthsPerYear: '0',
});

const emptyEndOfServiceForm = (): EndOfServiceForm => ({
  systemType: 'PRIVATE', name: '', effectiveFrom: todayStr(), effectiveTo: '', isActive: true,
  serviceYearsForFullBenefit: '0', benefitMonthsPerYearFirstPeriod: '1',
  benefitMonthsPerYearSecondPeriod: '1', secondPeriodThresholdYears: '5',
});

const StatCard: React.FC<{ label: string; value: string; hint?: string; icon: React.ReactNode; tone: string }> = ({ label, value, hint, icon, tone }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4">
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-bold text-slate-500">{label}</span>
      <span className={`flex h-8 w-8 items-center justify-center rounded-lg border ${tone}`}>{icon}</span>
    </div>
    <div className="mt-2 text-xl font-black tabular-nums">{value}</div>
    {hint && <div className="mt-0.5 text-[10px] font-semibold text-slate-400">{hint}</div>}
  </div>
);

export const PayrollSocialInsurancePage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('insurance');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [siRules, setSiRules] = useState<SocialInsuranceRule[]>([]);
  const [eosRules, setEosRules] = useState<EndOfServiceRule[]>([]);
  const [companyId, setCompanyId] = useState('');

  const [editingSiId, setEditingSiId] = useState<string | null>(null);
  const [siForm, setSiForm] = useState<SocialInsuranceForm>(emptySocialInsuranceForm());
  const [editingEosId, setEditingEosId] = useState<string | null>(null);
  const [eosForm, setEosForm] = useState<EndOfServiceForm>(emptyEndOfServiceForm());

  const [siCalcForm, setSiCalcForm] = useState({ date: todayStr(), gross: '10000' });
  const [siCalcResult, setSiCalcResult] = useState<SocialInsuranceCalculation | null>(null);
  const [eosCalcForm, setEosCalcForm] = useState({
    systemType: 'PRIVATE' as SocialInsuranceSystemType,
    joinDate: '', terminationDate: todayStr(), lastMonthlySalary: '10000',
  });
  const [eosCalcResult, setEosCalcResult] = useState<EndOfServiceCalculation | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    try {
      setSiRules(PayrollSocialInsuranceService.getSocialInsuranceRules());
      setEosRules(PayrollSocialInsuranceService.getEndOfServiceRules());
      setCompanyId(PayrollSocialInsuranceService.getCurrentCompanyId());
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل قواعد التأمينات الاجتماعية.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const run = (action: () => void, success?: string) => {
    setError(null);
    setNotice(null);
    try {
      action();
      if (success) setNotice(success);
      load();
    } catch (e: any) {
      setError(e?.message || 'تعذر تنفيذ العملية.');
    }
  };

  const resetSiForm = () => {
    setEditingSiId(null);
    setSiForm(emptySocialInsuranceForm());
  };

  const resetEosForm = () => {
    setEditingEosId(null);
    setEosForm(emptyEndOfServiceForm());
  };

  const startEditSi = (rule: SocialInsuranceRule) => {
    setEditingSiId(rule.id);
    setSiForm({
      name: rule.name,
      effectiveFrom: rule.effectiveFrom,
      effectiveTo: rule.effectiveTo || '',
      isActive: rule.isActive,
      employeeSharePercent: String(rule.employeeSharePercent),
      employerSharePercent: String(rule.employerSharePercent),
      contributionCeiling: String(rule.contributionCeiling),
      minimumContributionBase: String(rule.minimumContributionBase),
      maximumContributionBase: String(rule.maximumContributionBase),
      endOfServicePerYearPercent: String(rule.endOfServicePerYearPercent),
      endOfServiceMonthsPerYear: String(rule.endOfServiceMonthsPerYear),
    });
  };

  const startEditEos = (rule: EndOfServiceRule) => {
    setEditingEosId(rule.id);
    setEosForm({
      systemType: rule.systemType,
      name: rule.name,
      effectiveFrom: rule.effectiveFrom,
      effectiveTo: rule.effectiveTo || '',
      isActive: rule.isActive,
      serviceYearsForFullBenefit: String(rule.serviceYearsForFullBenefit),
      benefitMonthsPerYearFirstPeriod: String(rule.benefitMonthsPerYearFirstPeriod),
      benefitMonthsPerYearSecondPeriod: String(rule.benefitMonthsPerYearSecondPeriod),
      secondPeriodThresholdYears: String(rule.secondPeriodThresholdYears),
    });
  };

  const saveSi = () => {
    if (!siForm.name.trim()) { setError('اسم القاعدة مطلوب.'); return; }
    run(() => {
      PayrollSocialInsuranceService.saveSocialInsuranceRule({
        name: siForm.name.trim(),
        effectiveFrom: siForm.effectiveFrom,
        effectiveTo: siForm.effectiveTo || null,
        isActive: siForm.isActive,
        employeeSharePercent: Number(siForm.employeeSharePercent) || 0,
        employerSharePercent: Number(siForm.employerSharePercent) || 0,
        contributionCeiling: Number(siForm.contributionCeiling) || 0,
        minimumContributionBase: Number(siForm.minimumContributionBase) || 0,
        maximumContributionBase: Number(siForm.maximumContributionBase) || 0,
        endOfServicePerYearPercent: Number(siForm.endOfServicePerYearPercent) || 0,
        endOfServiceMonthsPerYear: Number(siForm.endOfServiceMonthsPerYear) || 0,
      }, editingSiId || undefined);
      resetSiForm();
    }, editingSiId ? 'تم تحديث قاعدة التأمينات.' : 'تمت إضافة قاعدة التأمينات.');
  };

  const saveEos = () => {
    if (!eosForm.name.trim()) { setError('اسم القاعدة مطلوب.'); return; }
    run(() => {
      PayrollSocialInsuranceService.saveEndOfServiceRule({
        systemType: eosForm.systemType,
        name: eosForm.name.trim(),
        effectiveFrom: eosForm.effectiveFrom,
        effectiveTo: eosForm.effectiveTo || null,
        isActive: eosForm.isActive,
        serviceYearsForFullBenefit: Number(eosForm.serviceYearsForFullBenefit) || 0,
        benefitMonthsPerYearFirstPeriod: Number(eosForm.benefitMonthsPerYearFirstPeriod) || 0,
        benefitMonthsPerYearSecondPeriod: Number(eosForm.benefitMonthsPerYearSecondPeriod) || 0,
        secondPeriodThresholdYears: Number(eosForm.secondPeriodThresholdYears) || 0,
      }, editingEosId || undefined);
      resetEosForm();
    }, editingEosId ? 'تم تحديث قاعدة نهاية الخدمة.' : 'تمت إضافة قاعدة نهاية الخدمة.');
  };

  const calculateSi = () => {
    setError(null);
    try {
      if (!companyId) throw new Error('تعذر تحديد الشركة الحالية.');
      setSiCalcResult(PayrollSocialInsuranceService.calculateSocialInsurance(
        companyId, siCalcForm.date, Number(siCalcForm.gross) || 0,
      ));
    } catch (e: any) {
      setError(e?.message || 'تعذر احتساب التأمينات.');
    }
  };

  const calculateEos = () => {
    setError(null);
    try {
      if (!companyId) throw new Error('تعذر تحديد الشركة الحالية.');
      if (!eosCalcForm.joinDate) throw new Error('تاريخ الالتحاق مطلوب.');
      setEosCalcResult(PayrollSocialInsuranceService.calculateEndOfService(
        companyId, eosCalcForm.systemType, eosCalcForm.terminationDate,
        eosCalcForm.joinDate, eosCalcForm.terminationDate, Number(eosCalcForm.lastMonthlySalary) || 0,
      ));
    } catch (e: any) {
      setError(e?.message || 'تعذر احتساب مكافأة نهاية الخدمة.');
    }
  };

  const stats = useMemo(() => {
    const activeSi = siRules.filter((rule) => rule.isActive).length;
    const activeEos = eosRules.filter((rule) => rule.isActive).length;
    const employeeShare = siRules.filter((rule) => rule.isActive)[0]?.employeeSharePercent ?? 0;
    const employerShare = siRules.filter((rule) => rule.isActive)[0]?.employerSharePercent ?? 0;
    return { activeSi, activeEos, employeeShare, employerShare };
  }, [siRules, eosRules]);

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'insurance', label: 'قواعد التأمينات', icon: <Landmark className="h-4 w-4" /> },
    { id: 'eos', label: 'نهاية الخدمة', icon: <ShieldCheck className="h-4 w-4" /> },
    { id: 'calculator', label: 'الحاسبة', icon: <Calculator className="h-4 w-4" /> },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-50 text-slate-900" dir="rtl">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50">
          <Landmark className="h-5 w-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-base font-black">التأمينات الاجتماعية ونهاية الخدمة</h1>
          <p className="text-xs font-medium text-slate-500">ضبط نسب الاشتراك والحدود، قواعد مكافأة نهاية الخدمة، وحسابات تقديرية</p>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-auto p-6">
        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700">{error}</div>}
        {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-700">{notice}</div>}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="قواعد تأمينات نشطة" value={String(stats.activeSi)} hint={`من ${siRules.length} قاعدة`} icon={<Landmark className="h-4 w-4" />} tone="border-indigo-200 bg-indigo-50 text-indigo-600" />
          <StatCard label="نسبة الموظف" value={`${stats.employeeShare}%`} hint="من الأساس الخاضع للاشتراك" icon={<Wallet className="h-4 w-4" />} tone="border-sky-200 bg-sky-50 text-sky-600" />
          <StatCard label="نسبة صاحب العمل" value={`${stats.employerShare}%`} hint="من الأساس الخاضع للاشتراك" icon={<Wallet className="h-4 w-4" />} tone="border-emerald-200 bg-emerald-50 text-emerald-600" />
          <StatCard label="قواعد نهاية خدمة" value={String(stats.activeEos)} hint={`من ${eosRules.length} قاعدة`} icon={<ShieldCheck className="h-4 w-4" />} tone="border-violet-200 bg-violet-50 text-violet-600" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {tabs.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${tab === item.id ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
            >
              {item.icon} {item.label}
            </button>
          ))}
          <button onClick={load} className="mr-auto flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> تحديث
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><RefreshCw className="h-6 w-6 animate-spin text-indigo-500" /></div>
        ) : (
          <>
            {tab === 'insurance' && (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_400px]">
                <div className="space-y-3">
                  {siRules.map((rule) => (
                    <div key={rule.id} className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-black">{rule.name}</h3>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${rule.isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>{rule.isActive ? 'نشطة' : 'موقوفة'}</span>
                          </div>
                          <p className="mt-1 text-[10px] text-slate-500">سريان من {rule.effectiveFrom}{rule.effectiveTo ? ` إلى ${rule.effectiveTo}` : ' — مفتوحة'}</p>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => startEditSi(rule)} className="rounded border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-50" aria-label="تعديل"><Pencil className="h-3 w-3" /></button>
                          <button onClick={() => { if (window.confirm('حذف قاعدة التأمينات؟ سيتم حذف مساهماتها المرتبطة.')) run(() => PayrollSocialInsuranceService.deleteSocialInsuranceRule(rule.id), 'تم حذف القاعدة.'); }} className="rounded border border-rose-200 px-2 py-1 text-[10px] font-bold text-rose-600 hover:bg-rose-50" aria-label="حذف"><Trash2 className="h-3 w-3" /></button>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] sm:grid-cols-4">
                        <div className="rounded-lg bg-slate-50 px-2.5 py-2"><div className="text-slate-400">حصة الموظف</div><div className="font-black text-slate-800">{rule.employeeSharePercent}%</div></div>
                        <div className="rounded-lg bg-slate-50 px-2.5 py-2"><div className="text-slate-400">حصة صاحب العمل</div><div className="font-black text-slate-800">{rule.employerSharePercent}%</div></div>
                        <div className="rounded-lg bg-slate-50 px-2.5 py-2"><div className="text-slate-400">الحد الأقصى للاشتراك</div><div className="font-bold">{money(rule.contributionCeiling)}</div></div>
                        <div className="rounded-lg bg-slate-50 px-2.5 py-2"><div className="text-slate-400">الحد الأدنى/الأقصى للأساس</div><div className="font-bold">{money(rule.minimumContributionBase)} / {money(rule.maximumContributionBase)}</div></div>
                      </div>
                      <div className="mt-2 text-[10px] text-slate-500">مكافأة نهاية الخدمة: {rule.endOfServicePerYearPercent}% لكل سنة • {rule.endOfServiceMonthsPerYear} شهر لكل سنة</div>
                    </div>
                  ))}
                  {!siRules.length && <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-12 text-center text-xs text-slate-400">لا توجد قواعد تأمينات مسجلة.</div>}
                </div>

                <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-black">{editingSiId ? 'تعديل قاعدة' : 'قاعدة تأمينات جديدة'}</h2>
                    {editingSiId && <button onClick={resetSiForm} className="text-[10px] font-bold text-slate-500 hover:text-slate-800">إلغاء</button>}
                  </div>
                  <label className="block text-[10px] font-bold text-slate-500">اسم القاعدة
                    <input value={siForm.name} onChange={(e) => setSiForm((prev) => ({ ...prev, name: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="مثال: قانون التأمينات 2026" />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-[10px] font-bold text-slate-500">بداية السريان
                      <input type="date" value={siForm.effectiveFrom} onChange={(e) => setSiForm((prev) => ({ ...prev, effectiveFrom: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    </label>
                    <label className="block text-[10px] font-bold text-slate-500">نهاية السريان
                      <input type="date" value={siForm.effectiveTo} onChange={(e) => setSiForm((prev) => ({ ...prev, effectiveTo: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    </label>
                    <label className="block text-[10px] font-bold text-slate-500">حصة الموظف %
                      <input type="number" min="0" max="100" value={siForm.employeeSharePercent} onChange={(e) => setSiForm((prev) => ({ ...prev, employeeSharePercent: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    </label>
                    <label className="block text-[10px] font-bold text-slate-500">حصة صاحب العمل %
                      <input type="number" min="0" max="100" value={siForm.employerSharePercent} onChange={(e) => setSiForm((prev) => ({ ...prev, employerSharePercent: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    </label>
                    <label className="block text-[10px] font-bold text-slate-500">الحد الأقصى للاشتراك
                      <input type="number" min="0" value={siForm.contributionCeiling} onChange={(e) => setSiForm((prev) => ({ ...prev, contributionCeiling: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    </label>
                    <label className="block text-[10px] font-bold text-slate-500">الحد الأدنى للأساس
                      <input type="number" min="0" value={siForm.minimumContributionBase} onChange={(e) => setSiForm((prev) => ({ ...prev, minimumContributionBase: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    </label>
                    <label className="block text-[10px] font-bold text-slate-500">الحد الأقصى للأساس
                      <input type="number" min="0" value={siForm.maximumContributionBase} onChange={(e) => setSiForm((prev) => ({ ...prev, maximumContributionBase: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    </label>
                    <label className="block text-[10px] font-bold text-slate-500">شهور نهاية الخدمة/سنة
                      <input type="number" min="0" max="12" step="0.5" value={siForm.endOfServiceMonthsPerYear} onChange={(e) => setSiForm((prev) => ({ ...prev, endOfServiceMonthsPerYear: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    </label>
                  </div>
                  <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600">
                    <input type="checkbox" checked={siForm.isActive} onChange={(e) => setSiForm((prev) => ({ ...prev, isActive: e.target.checked }))} className="h-4 w-4 rounded border-slate-300" />
                    قاعدة نشطة
                  </label>
                  <button onClick={saveSi} className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700">
                    {editingSiId ? 'حفظ التعديلات' : 'إضافة القاعدة'}
                  </button>
                  <p className="text-[10px] leading-4 text-slate-400">لا يمكن أن تتداخل فترة السريان لقاعدتين نشطتين لنفس الشركة.</p>
                </div>
              </div>
            )}

            {tab === 'eos' && (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_380px]">
                <div className="space-y-3">
                  {eosRules.map((rule) => (
                    <div key={rule.id} className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-black">{rule.name}</h3>
                            <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700">{systemTypeLabel[rule.systemType]}</span>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${rule.isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>{rule.isActive ? 'نشطة' : 'موقوفة'}</span>
                          </div>
                          <p className="mt-1 text-[10px] text-slate-500">سريان من {rule.effectiveFrom}{rule.effectiveTo ? ` إلى ${rule.effectiveTo}` : ' — مفتوحة'}</p>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => startEditEos(rule)} className="rounded border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-50" aria-label="تعديل"><Pencil className="h-3 w-3" /></button>
                          <button onClick={() => { if (window.confirm('حذف قاعدة نهاية الخدمة؟')) run(() => PayrollSocialInsuranceService.deleteEndOfServiceRule(rule.id), 'تم حذف القاعدة.'); }} className="rounded border border-rose-200 px-2 py-1 text-[10px] font-bold text-rose-600 hover:bg-rose-50" aria-label="حذف"><Trash2 className="h-3 w-3" /></button>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] sm:grid-cols-4">
                        <div className="rounded-lg bg-slate-50 px-2.5 py-2"><div className="text-slate-400">سنوات الاستحقاق الكامل</div><div className="font-bold">{rule.serviceYearsForFullBenefit} سنة</div></div>
                        <div className="rounded-lg bg-slate-50 px-2.5 py-2"><div className="text-slate-400">الفترة الأولى</div><div className="font-bold">{rule.benefitMonthsPerYearFirstPeriod} شهر/سنة</div></div>
                        <div className="rounded-lg bg-slate-50 px-2.5 py-2"><div className="text-slate-400">الفترة الثانية</div><div className="font-bold">{rule.benefitMonthsPerYearSecondPeriod} شهر/سنة</div></div>
                        <div className="rounded-lg bg-slate-50 px-2.5 py-2"><div className="text-slate-400">حد الفترة الثانية</div><div className="font-bold">{rule.secondPeriodThresholdYears} سنة</div></div>
                      </div>
                    </div>
                  ))}
                  {!eosRules.length && <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-12 text-center text-xs text-slate-400">لا توجد قواعد نهاية خدمة مسجلة.</div>}
                </div>

                <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-black">{editingEosId ? 'تعديل قاعدة' : 'قاعدة نهاية خدمة جديدة'}</h2>
                    {editingEosId && <button onClick={resetEosForm} className="text-[10px] font-bold text-slate-500 hover:text-slate-800">إلغاء</button>}
                  </div>
                  <label className="block text-[10px] font-bold text-slate-500">نظام العمل
                    <select value={eosForm.systemType} onChange={(e) => setEosForm((prev) => ({ ...prev, systemType: e.target.value as SocialInsuranceSystemType }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                      {(Object.keys(systemTypeLabel) as SocialInsuranceSystemType[]).map((type) => <option key={type} value={type}>{systemTypeLabel[type]}</option>)}
                    </select>
                  </label>
                  <label className="block text-[10px] font-bold text-slate-500">اسم القاعدة
                    <input value={eosForm.name} onChange={(e) => setEosForm((prev) => ({ ...prev, name: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-[10px] font-bold text-slate-500">بداية السريان
                      <input type="date" value={eosForm.effectiveFrom} onChange={(e) => setEosForm((prev) => ({ ...prev, effectiveFrom: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    </label>
                    <label className="block text-[10px] font-bold text-slate-500">نهاية السريان
                      <input type="date" value={eosForm.effectiveTo} onChange={(e) => setEosForm((prev) => ({ ...prev, effectiveTo: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    </label>
                    <label className="block text-[10px] font-bold text-slate-500">سنوات الاستحقاق
                      <input type="number" min="0" value={eosForm.serviceYearsForFullBenefit} onChange={(e) => setEosForm((prev) => ({ ...prev, serviceYearsForFullBenefit: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    </label>
                    <label className="block text-[10px] font-bold text-slate-500">حد الفترة الثانية
                      <input type="number" min="0" value={eosForm.secondPeriodThresholdYears} onChange={(e) => setEosForm((prev) => ({ ...prev, secondPeriodThresholdYears: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    </label>
                    <label className="block text-[10px] font-bold text-slate-500">شهور/سنة (أولى)
                      <input type="number" min="0" step="0.25" value={eosForm.benefitMonthsPerYearFirstPeriod} onChange={(e) => setEosForm((prev) => ({ ...prev, benefitMonthsPerYearFirstPeriod: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    </label>
                    <label className="block text-[10px] font-bold text-slate-500">شهور/سنة (ثانية)
                      <input type="number" min="0" step="0.25" value={eosForm.benefitMonthsPerYearSecondPeriod} onChange={(e) => setEosForm((prev) => ({ ...prev, benefitMonthsPerYearSecondPeriod: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    </label>
                  </div>
                  <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600">
                    <input type="checkbox" checked={eosForm.isActive} onChange={(e) => setEosForm((prev) => ({ ...prev, isActive: e.target.checked }))} className="h-4 w-4 rounded border-slate-300" />
                    قاعدة نشطة
                  </label>
                  <button onClick={saveEos} className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700">
                    {editingEosId ? 'حفظ التعديلات' : 'إضافة القاعدة'}
                  </button>
                </div>
              </div>
            )}

            {tab === 'calculator' && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                  <h2 className="flex items-center gap-1.5 text-sm font-black"><Calculator className="h-4 w-4 text-indigo-600" /> حاسبة التأمينات الاجتماعية</h2>
                  <p className="text-[10px] text-slate-400">تُطبق القاعدة النشطة السارية في التاريخ المحدد.</p>
                  <label className="block text-[10px] font-bold text-slate-500">تاريخ الاحتساب
                    <input type="date" value={siCalcForm.date} onChange={(e) => setSiCalcForm((prev) => ({ ...prev, date: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  </label>
                  <label className="block text-[10px] font-bold text-slate-500">الراتب الإجمالي
                    <input type="number" min="0" value={siCalcForm.gross} onChange={(e) => setSiCalcForm((prev) => ({ ...prev, gross: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  </label>
                  <button onClick={calculateSi} className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700">احتساب</button>
                  {siCalcResult && (
                    <div className="space-y-2 rounded-lg border border-indigo-100 bg-indigo-50/50 p-3 text-[11px]">
                      <div className="font-black text-indigo-800">{siCalcResult.ruleName}</div>
                      <div className="flex justify-between"><span>الأساس الخاضع للاشتراك</span><span className="font-bold tabular-nums">{money(siCalcResult.contributionBase)}</span></div>
                      <div className="flex justify-between"><span>حصة الموظف</span><span className="font-bold tabular-nums text-rose-600">{money(siCalcResult.employeeShareAmount)}</span></div>
                      <div className="flex justify-between"><span>حصة صاحب العمل</span><span className="font-bold tabular-nums text-emerald-600">{money(siCalcResult.employerShareAmount)}</span></div>
                      <div className="flex justify-between border-t border-indigo-200 pt-2 text-xs font-black"><span>الإجمالي</span><span className="tabular-nums">{money(siCalcResult.totalAmount)}</span></div>
                      {siCalcResult.ceilingApplied && <div className="text-[10px] font-semibold text-amber-600">تم تطبيق الحد الأقصى للأساس.</div>}
                    </div>
                  )}
                </div>

                <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                  <h2 className="flex items-center gap-1.5 text-sm font-black"><ShieldCheck className="h-4 w-4 text-violet-600" /> حاسبة مكافأة نهاية الخدمة</h2>
                  <label className="block text-[10px] font-bold text-slate-500">نظام العمل
                    <select value={eosCalcForm.systemType} onChange={(e) => setEosCalcForm((prev) => ({ ...prev, systemType: e.target.value as SocialInsuranceSystemType }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                      {(Object.keys(systemTypeLabel) as SocialInsuranceSystemType[]).map((type) => <option key={type} value={type}>{systemTypeLabel[type]}</option>)}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-[10px] font-bold text-slate-500">تاريخ الالتحاق
                      <input type="date" value={eosCalcForm.joinDate} onChange={(e) => setEosCalcForm((prev) => ({ ...prev, joinDate: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    </label>
                    <label className="block text-[10px] font-bold text-slate-500">تاريخ الإنهاء
                      <input type="date" value={eosCalcForm.terminationDate} onChange={(e) => setEosCalcForm((prev) => ({ ...prev, terminationDate: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    </label>
                  </div>
                  <label className="block text-[10px] font-bold text-slate-500">آخر راتب شهري
                    <input type="number" min="0" value={eosCalcForm.lastMonthlySalary} onChange={(e) => setEosCalcForm((prev) => ({ ...prev, lastMonthlySalary: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  </label>
                  <button onClick={calculateEos} className="w-full rounded-lg bg-violet-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-violet-700">احتساب المكافأة</button>
                  {eosCalcResult && (
                    <div className="space-y-2 rounded-lg border border-violet-100 bg-violet-50/50 p-3 text-[11px]">
                      <div className="font-black text-violet-800">{eosCalcResult.ruleName}</div>
                      <div className="flex justify-between"><span>مدة الخدمة</span><span className="font-bold">{eosCalcResult.serviceYears} سنة و {eosCalcResult.serviceMonths} شهر</span></div>
                      <div className="flex justify-between"><span>آخر راتب</span><span className="font-bold tabular-nums">{money(eosCalcResult.lastMonthlySalary)}</span></div>
                      <div className="flex justify-between border-t border-violet-200 pt-2 text-xs font-black"><span>المكافأة التقديرية</span><span className="tabular-nums">{money(eosCalcResult.benefitAmount)}</span></div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default PayrollSocialInsurancePage;
