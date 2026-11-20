import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { PageHeader } from '../../../components/ui/PageHeader';
import {
  Plus,
  RefreshCw,
  Loader2,
  Scale,
} from 'lucide-react';
import { FinanceEnterpriseService } from '../../../services/domains/finance/FinanceEnterpriseService';
import type { BankAccount, BankReconciliation } from '../../../types/finance';
import { localDateString } from '../../../utils/shared/date';
import { useToast } from '../../../components/ui/Toast';
import { useBusinessTerm } from '../../../hooks/domains/config/useBusinessTerm';
import { usePermission } from '../../../hooks/domains/auth/usePermission';

export const BankReconciliationPage: React.FC = () => {
  const newBankAccountLabel = useBusinessTerm('actions.newBankAccount');
  const service = useMemo(() => new FinanceEnterpriseService(), []);
  const toast = useToast();
  const can = usePermission();
  const canManage = can('finance.bank_reconciliation.manage');
  const canManageAccounts = can('finance.accounts.manage');

  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [selectedBankId, setSelectedBankId] = useState<string>('');
  const [statementDate, setStatementDate] = useState<string>(localDateString());
  const [statementBalance, setStatementBalance] = useState<string>('0');

  const [unreconciledItems, setUnreconciledItems] = useState<any[]>([]);
  const [clearedIds, setClearedIds] = useState<Set<string>>(new Set());
  const [historyReconciliations, setHistoryReconciliations] = useState<BankReconciliation[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState('');

  // New Bank Account Modal
  const [showBankModal, setShowBankModal] = useState(false);
  const [bankForm, setBankForm] = useState({
    accountName: '',
    bankName: '',
    accountNumber: '',
    iban: '',
    swiftCode: '',
    currency: 'EGP',
    openingBalance: '0',
    glAccountId: 'acc_1102',
  });

  const loadData = useCallback(() => {
    setLoading(true);
    try {
      const banks = service.getBankAccounts();
      setBankAccounts(banks);
      const activeBankId = selectedBankId || banks[0]?.id || '';
      setSelectedBankId(activeBankId);

      if (activeBankId) {
        const items = service.getUnreconciledBankTransactions(activeBankId, statementDate);
        setUnreconciledItems(items);
        setHistoryReconciliations(service.getBankReconciliations(activeBankId));
      }
    } catch (err: any) {
      toast.error(err?.message || 'تعذر تحميل بيانات البنوك.');
    } finally {
      setLoading(false);
    }
  }, [service, toast, selectedBankId, statementDate, setLoading, setBankAccounts, setSelectedBankId, setUnreconciledItems, setHistoryReconciliations]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (selectedBankId) {
      try {
        const items = service.getUnreconciledBankTransactions(selectedBankId, statementDate);
        setUnreconciledItems(items);
        setClearedIds(new Set());
        setHistoryReconciliations(service.getBankReconciliations(selectedBankId));
      } catch (err: any) {
        toast.error(err?.message || 'تعذر تحميل حركات الحساب.');
      }
    }
  }, [selectedBankId, statementDate, service, toast]);

  const activeBank = bankAccounts.find((b) => b.id === selectedBankId);

  // Calculations
  const clearedDeposits = useMemo(() => {
    return unreconciledItems
      .filter((i) => clearedIds.has(i.id) && i.type === 'DEPOSIT')
      .reduce((sum, i) => sum + i.amount, 0);
  }, [unreconciledItems, clearedIds]);

  const clearedWithdrawals = useMemo(() => {
    return unreconciledItems
      .filter((i) => clearedIds.has(i.id) && i.type === 'WITHDRAWAL')
      .reduce((sum, i) => sum + i.amount, 0);
  }, [unreconciledItems, clearedIds]);

  const bookBalance = activeBank?.currentBalance || 0;
  const numStatementBalance = Number(statementBalance) || 0;
  const variance = Math.round((numStatementBalance - bookBalance) * 100) / 100;

  const toggleCleared = (id: string) => {
    if (!canManage) return;
    setClearedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllCleared = () => {
    if (!canManage) return;
    if (clearedIds.size === unreconciledItems.length) {
      setClearedIds(new Set());
    } else {
      setClearedIds(new Set(unreconciledItems.map((i) => i.id)));
    }
  };

  const handleCreateBank = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageAccounts) return;
    try {
      const id = service.saveBankAccount({
        accountName: bankForm.accountName,
        bankName: bankForm.bankName,
        accountNumber: bankForm.accountNumber,
        iban: bankForm.iban || null,
        swiftCode: bankForm.swiftCode || null,
        currency: bankForm.currency,
        openingBalance: Number(bankForm.openingBalance) || 0,
        glAccountId: bankForm.glAccountId,
      });
      toast.success('تم إضافة الحساب البنكي بنجاح.');
      setShowBankModal(false);
      setSelectedBankId(id);
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر إضافة الحساب البنكي.');
    }
  };

  const handleReconcile = () => {
    if (!canManage || !selectedBankId) return;
    setSaving(true);
    try {
      const clearedList = unreconciledItems.filter((i) => clearedIds.has(i.id));
      service.createBankReconciliation({
        bankAccountId: selectedBankId,
        statementDate,
        statementBalance: numStatementBalance,
        clearedTransactions: clearedList,
        notes,
      });
      toast.success('تم حفظ محضر مطابقة كشف الحساب البنكي بنجاح.');
      setNotes('');
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر حفظ المطابقة البنكية.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-3 lg:p-4 bg-surface-muted min-h-0 text-ink space-y-4">
      {/* Header */}
      <div className="bg-surface px-5 py-3 rounded-2xl border border-line shadow-sm">
        <PageHeader
          icon={<Scale className="h-5 w-5" />}
          title="مطابقة كشف الحساب البنكي والصناديق"
          description="مقارنة رصيد كشف الحساب البنكي الخارجي برصيد الدفاتر وحركات القيود والشيكات المعلقة"
          actions={<>
            <button
              onClick={loadData}
              className="p-2.5 text-ink-secondary hover:text-ink bg-surface-sunken hover:bg-surface-sunken rounded-xl transition"
              title="تحديث البيانات"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            {canManageAccounts && (
              <button
                onClick={() => setShowBankModal(true)}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-primary hover:bg-primary text-white rounded-xl text-xs font-semibold transition"
              >
                <Plus className="w-4 h-4" />
                <span>{newBankAccountLabel}</span>
              </button>
            )}
          </>}
        />
      </div>

      {/* Control Strip */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-surface p-4 rounded-xl border border-line">
          <label className="block text-xs font-medium text-muted mb-1">الحساب البنكي</label>
          <select
            value={selectedBankId}
            onChange={(e) => setSelectedBankId(e.target.value)}
            className="w-full text-xs font-bold border border-line rounded-lg p-2 bg-surface-muted"
          >
            {bankAccounts.map((b) => (
              <option key={b.id} value={b.id}>
                {b.accountName} ({b.bankName})
              </option>
            ))}
          </select>
          <span className="text-[11px] text-muted mt-1 block">رقم الحساب: {activeBank?.accountNumber}</span>
        </div>

        <div className="bg-surface p-4 rounded-xl border border-line">
          <label className="block text-xs font-medium text-muted mb-1">تاريخ كشف الحساب</label>
          <input
            type="date"
            value={statementDate}
            onChange={(e) => setStatementDate(e.target.value)}
            className="w-full text-xs font-semibold border border-line rounded-lg p-2"
          />
          <span className="text-[11px] text-muted mt-1 block">تاريخ إقفال كشف البنك الوارد</span>
        </div>

        <div className="bg-surface p-4 rounded-xl border border-line">
          <label className="block text-xs font-medium text-muted mb-1">رصيد كشف الحساب الخارجي</label>
          <input
            type="number"
            step="0.01"
            value={statementBalance}
            onChange={(e) => setStatementBalance(e.target.value)}
            className="w-full text-sm font-bold font-mono border border-line rounded-lg p-2 bg-accent-soft text-primary"
          />
          <span className="text-[11px] text-muted mt-1 block">المسجل في الورقة أو الملف الوارد من البنك</span>
        </div>

        <div className="bg-surface p-4 rounded-xl border border-line">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted">فارق المطابقة</span>
            {Math.abs(variance) < 0.01 ? (
              <span className="text-[11px] bg-success-soft text-success px-2 py-0.5 rounded font-bold">متطابق تماماً</span>
            ) : (
              <span className="text-[11px] bg-danger-soft text-danger px-2 py-0.5 rounded font-bold">يوجد فارق</span>
            )}
          </div>
          <div className={`text-lg font-black font-mono ${Math.abs(variance) < 0.01 ? 'text-success' : 'text-danger'}`}>
            {variance.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} {activeBank?.currency}
          </div>
          <span className="text-[10px] text-muted mt-1 block">رصيد الدفاتر الحالي: {bookBalance.toLocaleString()} {activeBank?.currency}</span>
        </div>
      </div>

      {/* Main Reconciliation Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Unreconciled Transactions Grid */}
        <div className="lg:col-span-2 bg-surface rounded-2xl border border-line shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-line flex items-center justify-between bg-surface-muted/50">
            <div>
              <h2 className="text-sm font-bold text-ink">حركات الحساب في الدفاتر المحاسبية</h2>
              <p className="text-xs text-muted">حدد الحركات الظاهرة في كشف الحساب لمطابقتها</p>
            </div>
            {canManage && (
              <button
                onClick={toggleAllCleared}
                className="text-xs font-semibold px-3 py-1.5 bg-surface-sunken hover:bg-surface-sunken rounded-lg transition"
              >
                {clearedIds.size === unreconciledItems.length ? 'إلغاء تحديد الكل' : 'تحديد كل الحركات'}
              </button>
            )}
          </div>

          <div className="flex-1 overflow-auto max-h-[480px]">
            {loading ? (
              <div className="p-12 flex justify-center text-muted">
                <Loader2 className="w-6 h-6 animate-spin text-primary ml-2" />
                <span>جاري قراءة سجلات الدفاتر...</span>
              </div>
            ) : unreconciledItems.length === 0 ? (
              <div className="p-12 text-center text-muted text-xs">
                لا توجد حركات غير مطابقة لهذا الحساب حتى تاريخ {statementDate}.
              </div>
            ) : (
              <DataTable
                ariaLabel="حركات الدفاتر غير المطابقة"
                rows={unreconciledItems}
                rowKey={(item: any) => String(item.id)}
                onRowClick={canManage ? (item: any) => toggleCleared(item.id) : undefined}
                stickyHeader
                dense
                tableClassName="text-xs"
                rowClassName={(item: any) => {
                  const isChecked = clearedIds.has(item.id);
                  return `${isChecked ? 'bg-accent-soft/60 font-semibold' : ''} ${canManage ? 'hover:bg-surface-muted' : ''}`;
                }}
                columns={[
                  {
                    key: 'check', header: 'مطابقة', align: 'center',
                    render: (item: any) => {
                      const isChecked = clearedIds.has(item.id);
                      return (
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={!canManage}
                          onChange={() => {}}
                          onClick={(e) => e.stopPropagation()}
                          className={`w-4 h-4 rounded text-primary focus:ring-primary ${canManage ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                        />
                      );
                    },
                  },
                  { key: 'date', header: 'التاريخ', render: (item: any) => <span className="font-mono text-ink-secondary">{item.date}</span> },
                  { key: 'ref', header: 'رقم المرجع / القيد', render: (item: any) => <span className="font-mono font-bold text-ink">{item.reference}</span> },
                  { key: 'desc', header: 'البيان', render: (item: any) => <span className="text-ink">{item.description}</span> },
                  {
                    key: 'amount', header: 'المبلغ', align: 'end',
                    render: (item: any) => {
                      const isDeposit = item.type === 'DEPOSIT';
                      return (
                        <span className={`font-mono font-bold ${isDeposit ? 'text-success' : 'text-ink'}`}>
                          {isDeposit ? '+' : '-'}{item.amount.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}
                        </span>
                      );
                    },
                  },
                ]}
              />
            )}
          </div>

          <div className="p-3 bg-surface-muted border-t border-line flex items-center justify-between text-xs text-ink-secondary">
            <span>تم تحديد {clearedIds.size} من أصل {unreconciledItems.length} حركة</span>
            <div className="flex gap-4 font-mono font-bold">
              <span className="text-success">إيداعات: +{clearedDeposits.toLocaleString()}</span>
              <span className="text-ink">مسحوبات: -{clearedWithdrawals.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Right Col: Reconciliation Summary & Finalize */}
        <div className="space-y-4">
          <div className="bg-surface p-5 rounded-2xl border border-line shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-ink border-b border-line pb-2">ملخص مذكرة التسوية البنكية</h3>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-line">
                <span className="text-muted">رصيد كشف الحساب الخارجي:</span>
                <span className="font-bold font-mono">{numStatementBalance.toLocaleString()} {activeBank?.currency}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-line">
                <span className="text-muted">إيداعات تمت مطابقتها:</span>
                <span className="font-bold font-mono text-success">+{clearedDeposits.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-line">
                <span className="text-muted">مسحوبات وشيكات تمت مطابقتها:</span>
                <span className="font-bold font-mono text-danger">-{clearedWithdrawals.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-line">
                <span className="text-muted">رصيد الدفاتر المحاسبية:</span>
                <span className="font-bold font-mono text-ink">{bookBalance.toLocaleString()} {activeBank?.currency}</span>
              </div>
              <div className="flex justify-between py-2 font-bold text-sm bg-surface-muted p-2 rounded-lg">
                <span>الفارق المتبقي:</span>
                <span className={Math.abs(variance) < 0.01 ? 'text-success font-mono' : 'text-danger font-mono'}>
                  {variance.toLocaleString()} {activeBank?.currency}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">ملاحظات محضر المطابقة</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="تطابق كامل لكشف حساب شهر..."
                className="w-full text-xs border border-line rounded-xl p-2.5 h-20"
              />
            </div>

            {canManage && (
              <button
                onClick={handleReconcile}
                disabled={saving}
                className="w-full py-2.5 bg-success hover:bg-success text-white rounded-xl text-xs font-bold shadow-sm transition disabled:opacity-50"
              >
                {saving ? 'جاري حفظ المطابقة...' : 'حفظ واعتماد المطابقة البنكية'}
              </button>
            )}
          </div>

          {/* Past Reconciliations History */}
          <div className="bg-surface p-4 rounded-2xl border border-line shadow-sm space-y-3">
            <h4 className="text-xs font-bold text-ink">محاضر المطابقة السابقة</h4>
            {historyReconciliations.length === 0 ? (
              <p className="text-[11px] text-muted">لا توجد محاضر مطابقة سابقة لهذا الحساب.</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-auto">
                {historyReconciliations.map((h) => (
                  <div key={h.id} className="text-xs p-2 bg-surface-muted rounded-lg border border-line flex items-center justify-between">
                    <div>
                      <span className="font-bold block text-ink">{h.reconciliationNumber}</span>
                      <span className="text-[10px] text-muted">بتاريخ {h.statementDate} - بواسطة {h.reconciledByName}</span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-success-soft text-success">
                      معتمد
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal: New Bank Account */}
      {canManageAccounts && showBankModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl p-6 w-full max-w-md shadow-2xl border border-line">
            <h3 className="text-base font-bold text-ink mb-4">إضافة حساب بنكي جديد</h3>
            <form onSubmit={handleCreateBank} className="space-y-3 text-xs">
              <div>
                <label className="block text-ink-secondary mb-1 font-medium">اسم الحساب (للعرض والتمييز)</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: البنك الأهلي - جاري رئيسي"
                  value={bankForm.accountName}
                  onChange={(e) => setBankForm({ ...bankForm, accountName: e.target.value })}
                  className="w-full border border-line rounded-xl p-2"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-ink-secondary mb-1 font-medium">اسم البنك</label>
                  <input
                    type="text"
                    required
                    placeholder="البنك الأهلي المصري"
                    value={bankForm.bankName}
                    onChange={(e) => setBankForm({ ...bankForm, bankName: e.target.value })}
                    className="w-full border border-line rounded-xl p-2"
                  />
                </div>
                <div>
                  <label className="block text-ink-secondary mb-1 font-medium">العملة</label>
                  <select
                    value={bankForm.currency}
                    onChange={(e) => setBankForm({ ...bankForm, currency: e.target.value })}
                    className="w-full border border-line rounded-xl p-2 bg-surface-muted font-bold"
                  >
                    <option value="EGP">EGP - جنيه مصري</option>
                    <option value="SAR">SAR - ريال سعودي</option>
                    <option value="USD">USD - دولار أمريكي</option>
                    <option value="EUR">EUR - يورو</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-ink-secondary mb-1 font-medium">رقم الحساب</label>
                <input
                  type="text"
                  required
                  value={bankForm.accountNumber}
                  onChange={(e) => setBankForm({ ...bankForm, accountNumber: e.target.value })}
                  className="w-full border border-line rounded-xl p-2 font-mono"
                />
              </div>
              <div>
                <label className="block text-ink-secondary mb-1 font-medium">رقم الآيبان (IBAN) - اختياري</label>
                <input
                  type="text"
                  value={bankForm.iban}
                  onChange={(e) => setBankForm({ ...bankForm, iban: e.target.value })}
                  className="w-full border border-line rounded-xl p-2 font-mono"
                />
              </div>
              <div>
                <label className="block text-ink-secondary mb-1 font-medium">الرصيد الافتتاحي</label>
                <input
                  type="number"
                  step="0.01"
                  value={bankForm.openingBalance}
                  onChange={(e) => setBankForm({ ...bankForm, openingBalance: e.target.value })}
                  className="w-full border border-line rounded-xl p-2 font-mono font-bold"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowBankModal(false)}
                  className="px-4 py-2 text-ink-secondary hover:bg-surface-sunken rounded-xl font-medium"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-primary text-white rounded-xl font-semibold hover:bg-primary shadow-sm"
                >
                  حفظ الحساب
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
