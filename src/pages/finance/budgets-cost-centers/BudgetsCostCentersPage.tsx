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
    <div className="p-3 lg:p-4 bg-surface-muted min-h-0 text-ink space-y-4">
      {/* Header */}
      <div className="bg-surface px-5 py-3 rounded-2xl border border-line shadow-sm">
        <PageHeader
          icon={<PieChart className="h-5 w-5" />}
          title="الموازنات التقديرية ومراكز التكلفة"
          description="تخطيط الموازنات السنوية والشهرية، ربط المصروفات بمراكز التكلفة، ومتابعة الانحرافات الفعلية"
          actions={<>
            <button
              onClick={loadData}
              className="p-2.5 text-ink-secondary hover:text-ink bg-surface-sunken hover:bg-surface-sunken rounded-xl transition"
              title="تحديث البيانات"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            {canManage && (
              <>
                <button
                  onClick={() => setShowCostCenterModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-primary hover:bg-primary text-white rounded-xl text-xs font-semibold shadow-sm transition"
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
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-primary hover:bg-primary text-white rounded-xl text-xs font-semibold shadow-sm transition"
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
      <div className="flex items-center gap-2 border-b border-line pb-2">
        <button
          onClick={() => setActiveTab('budgets')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'budgets' ? 'bg-primary text-white shadow-sm' : 'bg-surface text-ink-secondary hover:bg-surface-sunken'
          }`}
        >
          <Target className="w-4 h-4" />
          <span>الموازنات والانحراف المالي (Budget vs Actual)</span>
        </button>
        <button
          onClick={() => setActiveTab('cost_centers')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'cost_centers' ? 'bg-primary text-white shadow-sm' : 'bg-surface text-ink-secondary hover:bg-surface-sunken'
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
            <div className="bg-surface p-4 rounded-xl border border-line">
              <label className="block text-xs font-medium text-muted mb-1">الموازنة النشطة</label>
              <select
                value={selectedBudgetId}
                onChange={(e) => setSelectedBudgetId(e.target.value)}
                className="w-full text-xs font-bold border border-line rounded-lg p-2 bg-surface-muted"
              >
                {budgets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.budgetCode}) - {b.fiscalYearCode}
                  </option>
                ))}
              </select>
            </div>

            <div className="bg-surface p-4 rounded-xl border border-line">
              <span className="text-xs text-muted block">إجمالي الموازنة المعتمدة</span>
              <span className="text-lg font-bold font-mono text-ink">
                {totalAllocated.toLocaleString()} ج.م
              </span>
              <span className="text-[10px] text-muted block mt-1">المبلغ المرصود بالكامل</span>
            </div>

            <div className="bg-surface p-4 rounded-xl border border-line">
              <span className="text-xs text-muted block">المنصرف الفعلي حتى اليوم</span>
              <span className="text-lg font-bold font-mono text-danger">
                {totalActual.toLocaleString()} ج.م
              </span>
              <span className="text-[10px] text-muted block mt-1">نسبة الاستهلاك: {percentUsed}%</span>
            </div>

            <div className="bg-surface p-4 rounded-xl border border-line">
              <span className="text-xs text-muted block">المتبقي / وفر الموازنة</span>
              <span className={`text-lg font-bold font-mono ${totalVariance >= 0 ? 'text-success' : 'text-danger'}`}>
                {totalVariance.toLocaleString()} ج.م
              </span>
              <span className="text-[10px] text-muted block mt-1">
                {totalVariance >= 0 ? 'وفر إيجابي متبقي' : 'تجاوز في الموازنة!'}
              </span>
            </div>
          </div>

          {/* Budget Consumption Visual Bar */}
          <div className="bg-surface p-5 rounded-2xl border border-line shadow-sm space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-ink">معدل استهلاك الموازنة العامة</span>
              <span className="font-mono font-bold text-ink-secondary">
                {totalActual.toLocaleString()} / {totalAllocated.toLocaleString()} ({percentUsed}%)
              </span>
            </div>
            <div className="w-full bg-surface-sunken h-3 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  percentUsed > 100 ? 'bg-danger' : percentUsed > 80 ? 'bg-warning' : 'bg-success'
                }`}
                style={{ width: `${Math.min(percentUsed, 100)}%` }}
              />
            </div>
          </div>

          {/* Budget Items Breakdown Table */}
          <div className="bg-surface rounded-2xl border border-line shadow-sm overflow-hidden">
            <div className="p-4 border-b border-line flex items-center justify-between">
              <h2 className="text-sm font-bold text-ink">بنود وحسابات الموازنة والانحرافات الفعلية</h2>
              <span className="text-xs text-muted">مقارنة آلية مع القيود المسجلة في دفتر الأستاذ</span>
            </div>

            {loading ? (
              <div className="p-12 flex justify-center text-muted">
                <Loader2 className="w-6 h-6 animate-spin text-primary ml-2" />
                <span>جاري تحميل بيانات البنود...</span>
              </div>
            ) : !selectedBudgetDetail?.items?.length ? (
              <div className="p-12 text-center text-muted text-xs">
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
                    { key: 'code', header: 'كود الحساب', render: (item) => <span className="font-mono font-bold text-ink">{item.accountCode}</span> },
                    { key: 'name', header: 'اسم البند / الحساب', render: (item) => <span className="font-semibold text-ink">{item.accountName}</span> },
                    { key: 'allocated', header: 'المبلغ المخصص', render: (item) => <span className="font-mono font-bold">{(item.allocatedAmount || 0).toLocaleString()} ج.م</span> },
                    { key: 'actual', header: 'المنصرف الفعلي', render: (item) => <span className="font-mono font-bold text-danger">{(item.actualSpent || 0).toLocaleString()} ج.م</span> },
                    {
                      key: 'variance', header: 'الانحراف (وفر / عجز)',
                      render: (item) => {
                        const v = item.variance || 0;
                        return <span className={`font-mono font-bold ${v < 0 ? 'text-danger' : 'text-success'}`}>{v.toLocaleString()} ج.م</span>;
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
                              <span className="block w-16 bg-surface-sunken h-1.5 rounded-full overflow-hidden">
                                <span
                                  className={`block h-full ${isOver ? 'bg-danger' : percent > 80 ? 'bg-warning' : 'bg-success'}`}
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
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-danger-soft text-danger rounded-md font-bold text-[10px]">
                            <AlertTriangle className="w-3 h-3 text-danger" />
                            تجاوز الموازنة
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-success-soft text-success rounded-md font-bold text-[10px]">
                            <CheckCircle2 className="w-3 h-3 text-success" />
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
        <div className="bg-surface rounded-2xl border border-line shadow-sm overflow-hidden">
          <div className="p-4 border-b border-line flex items-center justify-between">
            <h2 className="text-sm font-bold text-ink">دليل مراكز التكلفة المعتمدة</h2>
            <span className="text-xs text-muted">تُستخدم لتصنيف الإيرادات والمصروفات حسب الأقسام والمشاريع والمعارض</span>
          </div>

          <div className="overflow-x-auto">
            <DataTable
              ariaLabel="مراكز التكلفة"
              rows={costCenters}
              rowKey={(cc) => cc.id}
              dense
              tableClassName="text-xs"
              columns={[
                { key: 'code', header: 'كود المركز', render: (cc) => <span className="font-mono font-bold text-primary">{cc.code}</span> },
                { key: 'name', header: 'اسم مركز التكلفة', render: (cc) => <span className="font-bold text-ink">{cc.name}</span> },
                { key: 'branch', header: 'الفرع المرتبط', render: (cc) => <span className="text-ink-secondary">{cc.branchName || 'الإدارة العامة'}</span> },
                { key: 'desc', header: 'الوصف / الاستخدام', render: (cc) => <span className="text-muted">{cc.description || '-'}</span> },
                { key: 'status', header: 'الحالة', align: 'center', render: (cc) => <span className="px-2.5 py-1 bg-success-soft text-success font-bold rounded-md text-[11px]">نشط</span> },
              ]}
              emptyTitle="لا توجد مراكز تكلفة"
            />
          </div>
        </div>
      )}

      {/* Modal: New Cost Center */}
      {canManage && showCostCenterModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl p-6 w-full max-w-md shadow-2xl border border-line">
            <h3 className="text-base font-bold text-ink mb-4">إضافة مركز تكلفة جديد</h3>
            <form onSubmit={handleCreateCostCenter} className="space-y-3 text-xs">
              <div>
                <label className="block text-ink-secondary mb-1 font-medium">كود المركز (مثال: CC-EXPO-01)</label>
                <input
                  type="text"
                  required
                  value={costCenterForm.code}
                  onChange={(e) => setCostCenterForm({ ...costCenterForm, code: e.target.value })}
                  className="w-full border border-line rounded-xl p-2 font-mono font-bold"
                />
              </div>
              <div>
                <label className="block text-ink-secondary mb-1 font-medium">اسم مركز التكلفة</label>
                <input
                  type="text"
                  required
                  value={costCenterForm.name}
                  onChange={(e) => setCostCenterForm({ ...costCenterForm, name: e.target.value })}
                  className="w-full border border-line rounded-xl p-2"
                />
              </div>
              <div>
                <label className="block text-ink-secondary mb-1 font-medium">الوصف والهدف</label>
                <textarea
                  value={costCenterForm.description}
                  onChange={(e) => setCostCenterForm({ ...costCenterForm, description: e.target.value })}
                  className="w-full border border-line rounded-xl p-2 h-20"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCostCenterModal(false)}
                  className="px-4 py-2 text-ink-secondary hover:bg-surface-sunken rounded-xl font-medium"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-primary text-white rounded-xl font-semibold hover:bg-primary"
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
          <div className="bg-surface rounded-2xl p-6 w-full max-w-xl shadow-2xl border border-line max-h-[90vh] flex flex-col">
            <h3 className="text-base font-bold text-ink mb-3">إعداد موازنة تقديرية جديدة</h3>
            <form onSubmit={handleCreateBudget} className="space-y-4 text-xs flex-1 overflow-auto p-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-ink-secondary mb-1 font-medium">اسم الموازنة</label>
                  <input
                    type="text"
                    required
                    value={budgetForm.name}
                    onChange={(e) => setBudgetForm({ ...budgetForm, name: e.target.value })}
                    className="w-full border border-line rounded-xl p-2"
                  />
                </div>
                <div>
                  <label className="block text-ink-secondary mb-1 font-medium">السنة المالية</label>
                  <select
                    value={budgetForm.fiscalYearId}
                    onChange={(e) => setBudgetForm({ ...budgetForm, fiscalYearId: e.target.value })}
                    className="w-full border border-line rounded-xl p-2 bg-surface-muted font-bold"
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
                <label className="block text-ink-secondary mb-1 font-medium">مركز التكلفة (اختياري - عام في حال تركه فارغاً)</label>
                <select
                  value={budgetForm.costCenterId}
                  onChange={(e) => setBudgetForm({ ...budgetForm, costCenterId: e.target.value })}
                  className="w-full border border-line rounded-xl p-2 bg-surface-muted"
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
                  <span className="font-bold text-ink">بنود وحسابات الموازنة:</span>
                  <button
                    type="button"
                    onClick={addBudgetItemRow}
                    className="text-primary hover:text-primary font-bold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة بند آخر</span>
                  </button>
                </div>

                {budgetForm.items.map((row, idx) => (
                  <div key={idx} className="flex gap-2 items-center bg-surface-muted p-2 rounded-xl border border-line">
                    <select
                      value={row.accountId}
                      onChange={(e) => {
                        const next = [...budgetForm.items];
                        next[idx].accountId = e.target.value;
                        setBudgetForm({ ...budgetForm, items: next });
                      }}
                      className="flex-1 border border-line rounded-lg p-1.5 text-xs bg-surface font-medium"
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
                      className="w-36 border border-line rounded-lg p-1.5 text-xs font-mono font-bold"
                    />
                    {budgetForm.items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeBudgetItemRow(idx)}
                        className="text-danger hover:text-danger px-1 font-bold"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-line">
                <button
                  type="button"
                  onClick={() => setShowBudgetModal(false)}
                  className="px-4 py-2 text-ink-secondary hover:bg-surface-sunken rounded-xl font-medium"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-primary text-white rounded-xl font-semibold hover:bg-primary shadow-sm"
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
