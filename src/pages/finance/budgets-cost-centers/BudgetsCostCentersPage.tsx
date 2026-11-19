import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { PageHeader } from '../../../components/ui/PageHeader';
import {
  PieChart,
  Plus,
  RefreshCw,
  Loader2,
  FolderTree,
  AlertTriangle,
  CheckCircle2,
  Target,
} from 'lucide-react';
import { FinanceEnterpriseService } from '../../../services/domains/finance/FinanceEnterpriseService';
import { FinanceExtrasService } from '../../../services/domains/finance/FinanceExtrasService';
import type { CostCenter, Budget, FiscalYear } from '../../../types/finance';
import { useToast } from '../../../components/ui/Toast';
import { usePermission } from '../../../hooks/domains/auth/usePermission';

export const BudgetsCostCentersPage: React.FC = () => {
  const service = useMemo(() => new FinanceEnterpriseService(), []);
  const extrasService = useMemo(() => new FinanceExtrasService(), []);
  const toast = useToast();
  const canManage = usePermission()('finance.budgets.manage');

  const [activeTab, setActiveTab] = useState<'budgets' | 'cost_centers' | 'variance'>('budgets');
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([]);
  const [selectedBudgetId, setSelectedBudgetId] = useState<string>('');
  const [selectedBudgetDetail, setSelectedBudgetDetail] = useState<Budget | null>(null);

  const [loading, setLoading] = useState(true);

  // New Cost Center Modal
  const [showCostCenterModal, setShowCostCenterModal] = useState(false);
  const [costCenterForm, setCostCenterForm] = useState({ code: '', name: '', description: '' });

  // New Budget Wizard Modal
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [budgetForm, setBudgetForm] = useState({
    name: '',
    fiscalYearId: '',
    costCenterId: '',
    items: [{ accountId: '', allocatedAmount: '' }],
  });
  const [chartAccounts, setChartAccounts] = useState<any[]>([]);

  const loadData = useCallback(() => {
    setLoading(true);
    try {
      const ccs = service.getCostCenters();
      const bgs = service.getBudgets();
      const fys = service.getFiscalYears();
      const accs = extrasService.getAccounts().filter((a) => a.type === 'EXPENSE');

      setCostCenters(ccs);
      setBudgets(bgs);
      setFiscalYears(fys);
      setChartAccounts(accs);

      const activeBgtId = selectedBudgetId || bgs[0]?.id || '';
      setSelectedBudgetId(activeBgtId);
      if (activeBgtId) {
        setSelectedBudgetDetail(service.getBudgetWithItems(activeBgtId));
      }
    } catch (err: any) {
      toast.error(err?.message || 'تعذر تحميل بيانات الموازنات ومراكز التكلفة.');
    } finally {
      setLoading(false);
    }
  }, [service, extrasService, setLoading, setCostCenters, setBudgets, setFiscalYears, setChartAccounts, setSelectedBudgetId, setSelectedBudgetDetail, toast, selectedBudgetId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (selectedBudgetId) {
      try {
        setSelectedBudgetDetail(service.getBudgetWithItems(selectedBudgetId));
      } catch (err: any) {
        toast.error(err?.message || 'تعذر تحميل تفاصيل الموازنة.');
      }
    }
  }, [selectedBudgetId, service, toast]);

  const handleCreateCostCenter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    try {
      service.saveCostCenter(costCenterForm);
      toast.success('تم إضافة مركز التكلفة بنجاح.');
      setShowCostCenterModal(false);
      setCostCenterForm({ code: '', name: '', description: '' });
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر إضافة مركز التكلفة.');
    }
  };

  const handleCreateBudget = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    try {
      const items = budgetForm.items
        .filter((i) => i.accountId && Number(i.allocatedAmount) > 0)
        .map((i) => ({
          accountId: i.accountId,
          allocatedAmount: Number(i.allocatedAmount),
        }));

      if (!items.length) {
        toast.error('أدخل بنداً واحداً على الأقل بمبلغ مخصص صحيح.');
        return;
      }

      const id = service.saveBudget({
        name: budgetForm.name,
        fiscalYearId: budgetForm.fiscalYearId,
        costCenterId: budgetForm.costCenterId || undefined,
        items,
      });

      toast.success('تم اعتماد الموازنة التقديرية بنجاح.');
      setShowBudgetModal(false);
      setSelectedBudgetId(id);
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر حفظ الموازنة.');
    }
  };

  const addBudgetItemRow = () => {
    if (!canManage) return;
    setBudgetForm((prev) => ({
      ...prev,
      items: [...prev.items, { accountId: '', allocatedAmount: '' }],
    }));
  };

  const removeBudgetItemRow = (idx: number) => {
    if (!canManage) return;
    setBudgetForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== idx),
    }));
  };

  // Variance totals
  const totalAllocated = selectedBudgetDetail?.totalAllocated || 0;
  const totalActual = selectedBudgetDetail?.items?.reduce((s, i) => s + (i.actualSpent || 0), 0) || 0;
  const totalVariance = totalAllocated - totalActual;
  const percentUsed = totalAllocated > 0 ? Math.round((totalActual / totalAllocated) * 100) : 0;

  return (
    <div className="p-3 lg:p-4 bg-slate-50 min-h-0 text-slate-900 space-y-4">
      {/* Header */}
      <div className="bg-white px-5 py-3 rounded-2xl border border-slate-200 shadow-sm">
        <PageHeader
          icon={<PieChart className="h-5 w-5" />}
          title="الموازنات التقديرية ومراكز التكلفة"
          description="تخطيط الموازنات السنوية والشهرية، ربط المصروفات بمراكز التكلفة، ومتابعة الانحرافات الفعلية"
          actions={<>
            <button
              onClick={loadData}
              className="p-2.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
              title="تحديث البيانات"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            {canManage && (
              <>
                <button
                  onClick={() => setShowCostCenterModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold shadow-sm transition"
                >
                  <FolderTree className="w-4 h-4" />
                  <span>مركز تكلفة جديد</span>
                </button>
                <button
                  onClick={() => {
                    setBudgetForm({
                      name: `موازنة ${new Date().getFullYear()}`,
                      fiscalYearId: fiscalYears[0]?.id || '',
                      costCenterId: '',
                      items: [{ accountId: chartAccounts[0]?.id || '', allocatedAmount: '50000' }],
                    });
                    setShowBudgetModal(true);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-semibold shadow-sm transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>موازنة تقديرية جديدة</span>
                </button>
              </>
            )}
          </>}
        />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('budgets')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'budgets' ? 'bg-violet-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Target className="w-4 h-4" />
          <span>الموازنات والانحراف المالي (Budget vs Actual)</span>
        </button>
        <button
          onClick={() => setActiveTab('cost_centers')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'cost_centers' ? 'bg-violet-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FolderTree className="w-4 h-4" />
          <span>شجرة مراكز التكلفة ({costCenters.length})</span>
        </button>
      </div>

      {activeTab === 'budgets' && (
        <div className="space-y-6">
          {/* Top Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <label className="block text-xs font-medium text-slate-500 mb-1">الموازنة النشطة</label>
              <select
                value={selectedBudgetId}
                onChange={(e) => setSelectedBudgetId(e.target.value)}
                className="w-full text-xs font-bold border border-slate-200 rounded-lg p-2 bg-slate-50"
              >
                {budgets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.budgetCode}) - {b.fiscalYearCode}
                  </option>
                ))}
              </select>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <span className="text-xs text-slate-500 block">إجمالي الموازنة المعتمدة</span>
              <span className="text-lg font-bold font-mono text-slate-800">
                {totalAllocated.toLocaleString()} ج.م
              </span>
              <span className="text-[10px] text-slate-400 block mt-1">المبلغ المرصود بالكامل</span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <span className="text-xs text-slate-500 block">المنصرف الفعلي حتى اليوم</span>
              <span className="text-lg font-bold font-mono text-rose-600">
                {totalActual.toLocaleString()} ج.م
              </span>
              <span className="text-[10px] text-slate-400 block mt-1">نسبة الاستهلاك: {percentUsed}%</span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <span className="text-xs text-slate-500 block">المتبقي / وفر الموازنة</span>
              <span className={`text-lg font-bold font-mono ${totalVariance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {totalVariance.toLocaleString()} ج.م
              </span>
              <span className="text-[10px] text-slate-400 block mt-1">
                {totalVariance >= 0 ? 'وفر إيجابي متبقي' : 'تجاوز في الموازنة!'}
              </span>
            </div>
          </div>

          {/* Budget Consumption Visual Bar */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-slate-800">معدل استهلاك الموازنة العامة</span>
              <span className="font-mono font-bold text-slate-600">
                {totalActual.toLocaleString()} / {totalAllocated.toLocaleString()} ({percentUsed}%)
              </span>
            </div>
            <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  percentUsed > 100 ? 'bg-rose-500' : percentUsed > 80 ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(percentUsed, 100)}%` }}
              />
            </div>
          </div>

          {/* Budget Items Breakdown Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-800">بنود وحسابات الموازنة والانحرافات الفعلية</h2>
              <span className="text-xs text-slate-400">مقارنة آلية مع القيود المسجلة في دفتر الأستاذ</span>
            </div>

            {loading ? (
              <div className="p-12 flex justify-center text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin text-violet-500 ml-2" />
                <span>جاري تحميل بيانات البنود...</span>
              </div>
            ) : !selectedBudgetDetail?.items?.length ? (
              <div className="p-12 text-center text-slate-400 text-xs">
                لا توجد بنود مسجلة لهذه الموازنة.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <DataTable
                  ariaLabel="بنود الموازنة"
                  rows={selectedBudgetDetail.items}
                  rowKey={(item) => item.id}
                  dense
                  tableClassName="text-xs"
                  columns={[
                    { key: 'code', header: 'كود الحساب', render: (item) => <span className="font-mono font-bold text-slate-700">{item.accountCode}</span> },
                    { key: 'name', header: 'اسم البند / الحساب', render: (item) => <span className="font-semibold text-slate-800">{item.accountName}</span> },
                    { key: 'allocated', header: 'المبلغ المخصص', render: (item) => <span className="font-mono font-bold">{(item.allocatedAmount || 0).toLocaleString()} ج.م</span> },
                    { key: 'actual', header: 'المنصرف الفعلي', render: (item) => <span className="font-mono font-bold text-rose-600">{(item.actualSpent || 0).toLocaleString()} ج.م</span> },
                    {
                      key: 'variance', header: 'الانحراف (وفر / عجز)',
                      render: (item) => {
                        const v = item.variance || 0;
                        return <span className={`font-mono font-bold ${v < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{v.toLocaleString()} ج.م</span>;
                      },
                    },
                    {
                      key: 'percent', header: 'نسبة الاستهلاك',
                      render: (item) => {
                        const allocated = item.allocatedAmount || 0;
                        const actual = item.actualSpent || 0;
                        const variance = item.variance || 0;
                        const percent = allocated > 0 ? Math.round((actual / allocated) * 100) : 0;
                        const isOver = variance < 0;
                        return (
                          <span className="font-mono font-bold">
                            <span className="flex items-center gap-2">
                              <span>{percent}%</span>
                              <span className="block w-16 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                <span
                                  className={`block h-full ${isOver ? 'bg-rose-500' : percent > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                  style={{ width: `${Math.min(percent, 100)}%` }}
                                />
                              </span>
                            </span>
                          </span>
                        );
                      },
                    },
                    {
                      key: 'status', header: 'الحالة', align: 'center',
                      render: (item) => {
                        const isOver = (item.variance || 0) < 0;
                        return isOver ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-50 text-rose-700 rounded-md font-bold text-[10px]">
                            <AlertTriangle className="w-3 h-3 text-rose-500" />
                            تجاوز الموازنة
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md font-bold text-[10px]">
                            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                            ضمن الحدود
                          </span>
                        );
                      },
                    },
                  ]}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'cost_centers' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800">دليل مراكز التكلفة المعتمدة</h2>
            <span className="text-xs text-slate-400">تُستخدم لتصنيف الإيرادات والمصروفات حسب الأقسام والمشاريع والمعارض</span>
          </div>

          <div className="overflow-x-auto">
            <DataTable
              ariaLabel="مراكز التكلفة"
              rows={costCenters}
              rowKey={(cc) => cc.id}
              dense
              tableClassName="text-xs"
              columns={[
                { key: 'code', header: 'كود المركز', render: (cc) => <span className="font-mono font-bold text-violet-700">{cc.code}</span> },
                { key: 'name', header: 'اسم مركز التكلفة', render: (cc) => <span className="font-bold text-slate-800">{cc.name}</span> },
                { key: 'branch', header: 'الفرع المرتبط', render: (cc) => <span className="text-slate-600">{cc.branchName || 'الإدارة العامة'}</span> },
                { key: 'desc', header: 'الوصف / الاستخدام', render: (cc) => <span className="text-slate-500">{cc.description || '-'}</span> },
                { key: 'status', header: 'الحالة', align: 'center', render: (cc) => <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 font-bold rounded-md text-[11px]">نشط</span> },
              ]}
              emptyTitle="لا توجد مراكز تكلفة"
            />
          </div>
        </div>
      )}

      {/* Modal: New Cost Center */}
      {canManage && showCostCenterModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-800 mb-4">إضافة مركز تكلفة جديد</h3>
            <form onSubmit={handleCreateCostCenter} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 mb-1 font-medium">كود المركز (مثال: CC-EXPO-01)</label>
                <input
                  type="text"
                  required
                  value={costCenterForm.code}
                  onChange={(e) => setCostCenterForm({ ...costCenterForm, code: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl p-2 font-mono font-bold"
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-1 font-medium">اسم مركز التكلفة</label>
                <input
                  type="text"
                  required
                  value={costCenterForm.name}
                  onChange={(e) => setCostCenterForm({ ...costCenterForm, name: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl p-2"
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-1 font-medium">الوصف والهدف</label>
                <textarea
                  value={costCenterForm.description}
                  onChange={(e) => setCostCenterForm({ ...costCenterForm, description: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl p-2 h-20"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCostCenterModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-medium"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-slate-800 text-white rounded-xl font-semibold hover:bg-slate-900"
                >
                  حفظ المركز
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: New Budget Wizard */}
      {canManage && showBudgetModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-xl shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
            <h3 className="text-base font-bold text-slate-800 mb-3">إعداد موازنة تقديرية جديدة</h3>
            <form onSubmit={handleCreateBudget} className="space-y-4 text-xs flex-1 overflow-auto p-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">اسم الموازنة</label>
                  <input
                    type="text"
                    required
                    value={budgetForm.name}
                    onChange={(e) => setBudgetForm({ ...budgetForm, name: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl p-2"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">السنة المالية</label>
                  <select
                    value={budgetForm.fiscalYearId}
                    onChange={(e) => setBudgetForm({ ...budgetForm, fiscalYearId: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl p-2 bg-slate-50 font-bold"
                  >
                    {fiscalYears.map((fy) => (
                      <option key={fy.id} value={fy.id}>
                        {fy.name} ({fy.yearCode})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-600 mb-1 font-medium">مركز التكلفة (اختياري - عام في حال تركه فارغاً)</label>
                <select
                  value={budgetForm.costCenterId}
                  onChange={(e) => setBudgetForm({ ...budgetForm, costCenterId: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl p-2 bg-slate-50"
                >
                  <option value="">عام لكامل المؤسسة</option>
                  {costCenters.map((cc) => (
                    <option key={cc.id} value={cc.id}>
                      {cc.name} ({cc.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-700">بنود وحسابات الموازنة:</span>
                  <button
                    type="button"
                    onClick={addBudgetItemRow}
                    className="text-violet-600 hover:text-violet-700 font-bold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة بند آخر</span>
                  </button>
                </div>

                {budgetForm.items.map((row, idx) => (
                  <div key={idx} className="flex gap-2 items-center bg-slate-50 p-2 rounded-xl border border-slate-100">
                    <select
                      value={row.accountId}
                      onChange={(e) => {
                        const next = [...budgetForm.items];
                        next[idx].accountId = e.target.value;
                        setBudgetForm({ ...budgetForm, items: next });
                      }}
                      className="flex-1 border border-slate-200 rounded-lg p-1.5 text-xs bg-white font-medium"
                    >
                      {chartAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} - {a.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      placeholder="المبلغ المرصود"
                      value={row.allocatedAmount}
                      onChange={(e) => {
                        const next = [...budgetForm.items];
                        next[idx].allocatedAmount = e.target.value;
                        setBudgetForm({ ...budgetForm, items: next });
                      }}
                      className="w-36 border border-slate-200 rounded-lg p-1.5 text-xs font-mono font-bold"
                    />
                    {budgetForm.items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeBudgetItemRow(idx)}
                        className="text-rose-500 hover:text-rose-700 px-1 font-bold"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowBudgetModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-medium"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-violet-600 text-white rounded-xl font-semibold hover:bg-violet-700 shadow-sm"
                >
                  اعتماد الموازنة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
