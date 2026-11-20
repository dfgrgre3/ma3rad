import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { PageHeader } from '../../../components/ui/PageHeader';
import {
  CreditCard,
  Plus,
  RefreshCw,
  Loader2,
  Receipt,
  ArrowRightLeft,
} from 'lucide-react';
import { FinanceEnterpriseService } from '../../../services/domains/finance/FinanceEnterpriseService';
import type { PaymentGateway, PaymentGatewaySettlement, BankAccount } from '../../../types/finance';
import { localDateString } from '../../../utils/shared/date';
import { useToast } from '../../../components/ui/Toast';
import { usePermission } from '../../../hooks/domains/auth/usePermission';

export const EPaymentSettlementPage: React.FC = () => {
  const service = useMemo(() => new FinanceEnterpriseService(), []);
  const toast = useToast();
  const canManage = usePermission()('finance.epayments.settle');

  const [activeTab, setActiveTab] = useState<'settlements' | 'gateways'>('settlements');
  const [gateways, setGateways] = useState<PaymentGateway[]>([]);
  const [settlements, setSettlements] = useState<PaymentGatewaySettlement[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);

  // New Gateway Modal
  const [showGatewayModal, setShowGatewayModal] = useState(false);
  const [gatewayForm, setGatewayForm] = useState({
    name: '',
    providerCode: '',
    glAccountId: 'acc_1106',
    commissionRate: '1.5',
    fixedFee: '2',
    settlementPeriodDays: '1',
  });

  // Record Settlement Modal
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [settleForm, setSettleForm] = useState({
    gatewayId: '',
    settlementDate: localDateString(),
    grossAmount: '',
    commissionAmount: '',
    taxDeduction: '0',
    bankAccountId: '',
    notes: '',
  });

  const loadData = useCallback(() => {
    setLoading(true);
    try {
      const gws = service.getPaymentGateways();
      const stls = service.getPaymentGatewaySettlements();
      const banks = service.getBankAccounts();

      setGateways(gws);
      setSettlements(stls);
      setBankAccounts(banks);

      if (gws.length && !settleForm.gatewayId) {
        setSettleForm((prev) => ({ ...prev, gatewayId: gws[0].id }));
      }
      if (banks.length && !settleForm.bankAccountId) {
        setSettleForm((prev) => ({ ...prev, bankAccountId: banks[0].id }));
      }
    } catch (err: any) {
      toast.error(err?.message || 'تعذر تحميل بيانات المدفوعات الإلكترونية.');
    } finally {
      setLoading(false);
    }
  }, [service, toast, setLoading, setGateways, setSettlements, setBankAccounts, setSettleForm, settleForm.gatewayId, settleForm.bankAccountId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateGateway = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    try {
      service.savePaymentGateway({
        name: gatewayForm.name,
        providerCode: gatewayForm.providerCode,
        glAccountId: gatewayForm.glAccountId,
        commissionRate: Number(gatewayForm.commissionRate) || 0,
        fixedFee: Number(gatewayForm.fixedFee) || 0,
        settlementPeriodDays: Number(gatewayForm.settlementPeriodDays) || 1,
      });
      toast.success('تمت إضافة بوابة الدفع بنجاح.');
      setShowGatewayModal(false);
      setGatewayForm({
        name: '',
        providerCode: '',
        glAccountId: 'acc_1106',
        commissionRate: '1.5',
        fixedFee: '2',
        settlementPeriodDays: '1',
      });
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر إضافة بوابة الدفع.');
    }
  };

  const handleRecordSettlement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    try {
      service.recordGatewaySettlement({
        gatewayId: settleForm.gatewayId,
        settlementDate: settleForm.settlementDate,
        grossAmount: Number(settleForm.grossAmount),
        commissionAmount: Number(settleForm.commissionAmount),
        taxDeduction: Number(settleForm.taxDeduction) || 0,
        bankAccountId: settleForm.bankAccountId,
        notes: settleForm.notes,
      });
      toast.success('تم ترحيل قيد التسوية البنكي بنجاح وتحديث رصيد البنك.');
      setShowSettlementModal(false);
      setSettleForm((prev) => ({
        ...prev,
        grossAmount: '',
        commissionAmount: '',
        notes: '',
      }));
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر تسجيل تسوية البوابة.');
    }
  };

  // Auto calculate estimated commission on gross change
  const onGrossChange = (val: string) => {
    const gross = Number(val) || 0;
    const gw = gateways.find((g) => g.id === settleForm.gatewayId);
    let estimatedComm = 0;
    if (gw && gross > 0) {
      estimatedComm = Math.round((gross * (gw.commissionRate / 100) + gw.fixedFee) * 100) / 100;
    }
    setSettleForm((prev) => ({
      ...prev,
      grossAmount: val,
      commissionAmount: String(estimatedComm),
    }));
  };

  const totalSettled = settlements.reduce((s, st) => s + st.netAmount, 0);
  const totalFees = settlements.reduce((s, st) => s + st.commissionAmount, 0);

  return (
    <div className="p-3 lg:p-4 bg-surface-muted min-h-0 text-ink space-y-4">
      {/* Header */}
      <div className="bg-surface px-5 py-3 rounded-2xl border border-line shadow-sm">
        <PageHeader
          icon={<CreditCard className="h-5 w-5" />}
          title="حسابات وبوابات الدفع الإلكتروني والتسويات البنكية"
          description="إدارة ماكينات الـ POS ونقاط البيع وبوابات الدفع والمحافظ الإلكترونية، مع تسوية العمولات والإيداع البنكي"
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
                  onClick={() => setShowGatewayModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-primary hover:bg-primary text-white rounded-xl text-xs font-semibold shadow-sm transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>بوابة / ماكينة جديدة</span>
                </button>
                <button
                  onClick={() => setShowSettlementModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-primary hover:bg-primary text-white rounded-xl text-xs font-semibold shadow-sm transition"
                >
                  <ArrowRightLeft className="w-4 h-4" />
                  <span>تسوية وإيداع بنكي</span>
                </button>
              </>
            )}
          </>}
        />
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-surface p-4 rounded-xl border border-line">
          <span className="text-xs text-muted block">بوابات وماكينات الدفع المربوطة</span>
          <span className="text-lg font-bold font-mono text-ink">{gateways.length} بوابات نشطة</span>
          <span className="text-[10px] text-muted block mt-1">POS وماكينات البطاقات</span>
        </div>

        <div className="bg-surface p-4 rounded-xl border border-line">
          <span className="text-xs text-muted block">إجمالي التسويات المودعة</span>
          <span className="text-lg font-bold font-mono text-success">
            {totalSettled.toLocaleString()} ج.م
          </span>
          <span className="text-[10px] text-muted block mt-1">تم ترحيلها وقيدها في البنوك</span>
        </div>

        <div className="bg-surface p-4 rounded-xl border border-line">
          <span className="text-xs text-muted block">إجمالي العمولات والرسوم المخصومة</span>
          <span className="text-lg font-bold font-mono text-danger">
            {totalFees.toLocaleString()} ج.م
          </span>
          <span className="text-[10px] text-muted block mt-1">حساب مصروفات عمولات الدفع (5207)</span>
        </div>

        <div className="bg-surface p-4 rounded-xl border border-line">
          <span className="text-xs text-muted block">عدد حركات التسوية</span>
          <span className="text-lg font-bold font-mono text-primary">
            {settlements.length} تسويات
          </span>
          <span className="text-[10px] text-muted block mt-1">مطابقة ومعتمدة محاسبياً</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-line pb-2">
        <button
          onClick={() => setActiveTab('settlements')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'settlements' ? 'bg-primary text-white shadow-sm' : 'bg-surface text-ink-secondary hover:bg-surface-sunken'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>سجل التسويات والإيداعات البنكية</span>
        </button>
        <button
          onClick={() => setActiveTab('gateways')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'gateways' ? 'bg-primary text-white shadow-sm' : 'bg-surface text-ink-secondary hover:bg-surface-sunken'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>إعدادات البوابات ونسب العمولات</span>
        </button>
      </div>

      {activeTab === 'settlements' && (
        <div className="bg-surface rounded-2xl border border-line shadow-sm overflow-hidden">
          <div className="p-4 border-b border-line flex items-center justify-between">
            <h2 className="text-sm font-bold text-ink">دفعات التسوية البنكية لبوابات الدفع</h2>
            <span className="text-xs text-muted">تتضمن تلقائياً قيود الخصم والعمولات والإيداع</span>
          </div>

          {loading ? (
            <div className="p-12 flex justify-center text-muted">
              <Loader2 className="w-6 h-6 animate-spin text-primary ml-2" />
              <span>جاري تحميل سجل التسويات...</span>
            </div>
          ) : settlements.length === 0 ? (
            <div className="p-12 text-center text-muted text-xs">
              لا توجد تسويات مسجلة حتى الآن. انقر على "تسوية وإيداع بنكي" لتسجيل دفعة تسوية.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <DataTable
                ariaLabel="سجل التسويات"
                rows={settlements}
                rowKey={(st) => st.id}
                dense
                tableClassName="text-xs"
                columns={[
                  { key: 'number', header: 'رقم التسوية', render: (st) => <span className="font-mono font-bold text-ink">{st.settlementNumber}</span> },
                  { key: 'date', header: 'تاريخ التسوية', render: (st) => <span className="font-mono text-ink-secondary">{st.settlementDate}</span> },
                  { key: 'gateway', header: 'بوابة / مزود الدفع', render: (st) => <span className="font-bold text-primary">{st.gatewayName}</span> },
                  { key: 'gross', header: 'المبلغ الإجمالي (Gross)', render: (st) => <span className="font-mono font-bold">{st.grossAmount.toLocaleString()} ج.م</span> },
                  { key: 'commission', header: 'العمولة المخصومة', render: (st) => <span className="font-mono font-bold text-danger">-{st.commissionAmount.toLocaleString()} ج.م</span> },
                  { key: 'net', header: 'الصافي المودع بالبنك', render: (st) => <span className="font-mono font-bold text-success">+{st.netAmount.toLocaleString()} ج.م</span> },
                  { key: 'bank', header: 'الحساب البنكي المودع به', render: (st) => <span className="text-ink">{st.bankAccountName}</span> },
                  { key: 'status', header: 'الحالة', align: 'center', render: (st) => <span className="px-2.5 py-1 bg-success-soft text-success font-bold rounded-md text-[11px]">تمت التسوية وقيد البنك</span> },
                ]}
              />
            </div>
          )}
        </div>
      )}

      {activeTab === 'gateways' && (
        <div className="bg-surface rounded-2xl border border-line shadow-sm overflow-hidden">
          <div className="p-4 border-b border-line flex items-center justify-between">
            <h2 className="text-sm font-bold text-ink">بوابات وماكينات الدفع والعمولات المطبقة</h2>
            <span className="text-xs text-muted">تستخدم لاحتساب صافي التدفق عند قبول الدفع الإلكتروني</span>
          </div>

          <div className="overflow-x-auto">
            <DataTable
              ariaLabel="بوابات الدفع"
              rows={gateways}
              rowKey={(gw) => gw.id}
              dense
              tableClassName="text-xs"
              columns={[
                { key: 'name', header: 'اسم البوابة / الماكينة', render: (gw) => <span className="font-bold text-ink">{gw.name}</span> },
                { key: 'code', header: 'كود المزود', render: (gw) => <span className="font-mono font-bold text-primary">{gw.providerCode}</span> },
                { key: 'gl', header: 'حساب التسوية المحاسبي', render: (gw) => <span className="font-mono text-ink-secondary">{gw.glAccountCode || '1106'}</span> },
                { key: 'rate', header: 'نسبة العمولة (%)', render: (gw) => <span className="font-mono font-bold">{gw.commissionRate}%</span> },
                { key: 'fee', header: 'رسم ثابت لكل حركة', render: (gw) => <span className="font-mono font-bold">{gw.fixedFee} ج.م</span> },
                { key: 'period', header: 'دورة التسوية التقديرية', render: (gw) => <span className="text-ink-secondary">{gw.settlementPeriodDays} يوم عمل</span> },
                { key: 'status', header: 'الحالة', align: 'center', render: (gw) => <span className="px-2.5 py-1 bg-success-soft text-success font-bold rounded-md text-[11px]">نشطة</span> },
              ]}
              emptyTitle="لا توجد بوابات دفع"
            />
          </div>
        </div>
      )}

      {/* Modal: New Gateway */}
      {canManage && showGatewayModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl p-6 w-full max-w-md shadow-2xl border border-line">
            <h3 className="text-base font-bold text-ink mb-4">إضافة ماكينة أو بوابة دفع</h3>
            <form onSubmit={handleCreateGateway} className="space-y-3 text-xs">
              <div>
                <label className="block text-ink-secondary mb-1 font-medium">اسم البوابة / الماكينة</label>
                <input
                  type="text"
                  required
                  placeholder="ماكينة المعرض 1 - بنك مصر"
                  value={gatewayForm.name}
                  onChange={(e) => setGatewayForm({ ...gatewayForm, name: e.target.value })}
                  className="w-full border border-line rounded-xl p-2"
                />
              </div>
              <div>
                <label className="block text-ink-secondary mb-1 font-medium">كود المزود</label>
                <input
                  type="text"
                  required
                  placeholder="POS_BM_01"
                  value={gatewayForm.providerCode}
                  onChange={(e) => setGatewayForm({ ...gatewayForm, providerCode: e.target.value })}
                  className="w-full border border-line rounded-xl p-2 font-mono"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-ink-secondary mb-1 font-medium">نسبة العمولة (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={gatewayForm.commissionRate}
                    onChange={(e) => setGatewayForm({ ...gatewayForm, commissionRate: e.target.value })}
                    className="w-full border border-line rounded-xl p-2 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-ink-secondary mb-1 font-medium">رسم ثابت للحركة (ج.م)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={gatewayForm.fixedFee}
                    onChange={(e) => setGatewayForm({ ...gatewayForm, fixedFee: e.target.value })}
                    className="w-full border border-line rounded-xl p-2 font-mono font-bold"
                  />
                </div>
              </div>
              <div>
                <label className="block text-ink-secondary mb-1 font-medium">مدة دورة التسوية (أيام)</label>
                <input
                  type="number"
                  required
                  value={gatewayForm.settlementPeriodDays}
                  onChange={(e) => setGatewayForm({ ...gatewayForm, settlementPeriodDays: e.target.value })}
                  className="w-full border border-line rounded-xl p-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowGatewayModal(false)}
                  className="px-4 py-2 text-ink-secondary hover:bg-surface-sunken rounded-xl font-medium"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-primary text-white rounded-xl font-semibold hover:bg-primary"
                >
                  حفظ البوابة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Record Settlement */}
      {canManage && showSettlementModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl p-6 w-full max-w-md shadow-2xl border border-line">
            <h3 className="text-base font-bold text-ink mb-4">تسوية رصيد بوابة وإيداع بنكي</h3>
            <form onSubmit={handleRecordSettlement} className="space-y-3 text-xs">
              <div>
                <label className="block text-ink-secondary mb-1 font-medium">بوابة / ماكينة الدفع</label>
                <select
                  value={settleForm.gatewayId}
                  onChange={(e) => {
                    setSettleForm({ ...settleForm, gatewayId: e.target.value });
                    if (settleForm.grossAmount) onGrossChange(settleForm.grossAmount);
                  }}
                  className="w-full border border-line rounded-xl p-2 bg-surface-muted font-bold"
                >
                  {gateways.map((gw) => (
                    <option key={gw.id} value={gw.id}>
                      {gw.name} (عمولة: {gw.commissionRate}%)
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-ink-secondary mb-1 font-medium">تاريخ التسوية والإيداع</label>
                  <input
                    type="date"
                    required
                    value={settleForm.settlementDate}
                    onChange={(e) => setSettleForm({ ...settleForm, settlementDate: e.target.value })}
                    className="w-full border border-line rounded-xl p-2 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-ink-secondary mb-1 font-medium">الحساب البنكي المودع به</label>
                  <select
                    value={settleForm.bankAccountId}
                    onChange={(e) => setSettleForm({ ...settleForm, bankAccountId: e.target.value })}
                    className="w-full border border-line rounded-xl p-2 bg-surface-muted font-medium"
                  >
                    {bankAccounts.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.accountName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-ink-secondary mb-1 font-medium">المبلغ الإجمالي المقبوض</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="10000"
                    value={settleForm.grossAmount}
                    onChange={(e) => onGrossChange(e.target.value)}
                    className="w-full border border-line rounded-xl p-2 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-ink-secondary mb-1 font-medium">عمولة البوابة المخصومة</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={settleForm.commissionAmount}
                    onChange={(e) => setSettleForm({ ...settleForm, commissionAmount: e.target.value })}
                    className="w-full border border-line rounded-xl p-2 font-mono font-bold text-danger"
                  />
                </div>
              </div>

              {/* Net preview */}
              <div className="p-3 bg-success-soft rounded-xl border border-success-border flex justify-between items-center text-xs">
                <span className="font-bold text-success">صافي المبلغ المودع في الحساب البنكي:</span>
                <span className="font-mono font-black text-sm text-success">
                  {Math.max(0, Number(settleForm.grossAmount || 0) - Number(settleForm.commissionAmount || 0)).toLocaleString()}{' '}
                  ج.م
                </span>
              </div>

              <div>
                <label className="block text-ink-secondary mb-1 font-medium">ملاحظات / رقم مرجع التحويل</label>
                <input
                  type="text"
                  placeholder="رقم مرجع التسوية البنكية..."
                  value={settleForm.notes}
                  onChange={(e) => setSettleForm({ ...settleForm, notes: e.target.value })}
                  className="w-full border border-line rounded-xl p-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowSettlementModal(false)}
                  className="px-4 py-2 text-ink-secondary hover:bg-surface-sunken rounded-xl font-medium"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-primary text-white rounded-xl font-semibold hover:bg-primary shadow-sm"
                >
                  تأكيد وترحيل القيد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
