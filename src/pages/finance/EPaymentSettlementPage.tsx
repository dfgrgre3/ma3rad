import React, { useEffect, useMemo, useState } from 'react';
import {
  CreditCard,
  Plus,
  RefreshCw,
  Loader2,
  CheckCircle2,
  Building2,
  DollarSign,
  Percent,
  Receipt,
  ArrowRightLeft,
} from 'lucide-react';
import { FinanceEnterpriseService } from '../../services/FinanceEnterpriseService';
import type { PaymentGateway, PaymentGatewaySettlement, BankAccount } from '../../types/finance';
import { localDateString } from '../../utils/date';
import { useToast } from '../../components/ui/Toast';

export const EPaymentSettlementPage: React.FC = () => {
  const service = useMemo(() => new FinanceEnterpriseService(), []);
  const toast = useToast();

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

  const loadData = () => {
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
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateGateway = (e: React.FormEvent) => {
    e.preventDefault();
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
    <div className="p-6 bg-slate-50 min-h-screen text-slate-900 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
            <CreditCard className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">حسابات وبوابات الدفع الإلكتروني والتسويات البنكية</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              إدارة ماكينات الـ POS ونقاط البيع وبوابات الدفع والمحافظ الإلكترونية، مع تسوية العمولات والإيداع البنكي
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            className="p-2.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
            title="تحديث البيانات"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowGatewayModal(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>بوابة / ماكينة جديدة</span>
          </button>
          <button
            onClick={() => setShowSettlementModal(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition"
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>تسوية وإيداع بنكي</span>
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-xs text-slate-500 block">بوابات وماكينات الدفع المربوطة</span>
          <span className="text-lg font-bold font-mono text-slate-800">{gateways.length} بوابات نشطة</span>
          <span className="text-[10px] text-slate-400 block mt-1">POS وماكينات البطاقات</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-xs text-slate-500 block">إجمالي التسويات المودعة</span>
          <span className="text-lg font-bold font-mono text-emerald-600">
            {totalSettled.toLocaleString()} ج.م
          </span>
          <span className="text-[10px] text-slate-400 block mt-1">تم ترحيلها وقيدها في البنوك</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-xs text-slate-500 block">إجمالي العمولات والرسوم المخصومة</span>
          <span className="text-lg font-bold font-mono text-rose-600">
            {totalFees.toLocaleString()} ج.م
          </span>
          <span className="text-[10px] text-slate-400 block mt-1">حساب مصروفات عمولات الدفع (5207)</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-xs text-slate-500 block">عدد حركات التسوية</span>
          <span className="text-lg font-bold font-mono text-indigo-600">
            {settlements.length} تسويات
          </span>
          <span className="text-[10px] text-slate-400 block mt-1">مطابقة ومعتمدة محاسبياً</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('settlements')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'settlements' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>سجل التسويات والإيداعات البنكية</span>
        </button>
        <button
          onClick={() => setActiveTab('gateways')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'gateways' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-100'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>إعدادات البوابات ونسب العمولات</span>
        </button>
      </div>

      {activeTab === 'settlements' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800">دفعات التسوية البنكية لبوابات الدفع</h2>
            <span className="text-xs text-slate-400">تتضمن تلقائياً قيود الخصم والعمولات والإيداع</span>
          </div>

          {loading ? (
            <div className="p-12 flex justify-center text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500 ml-2" />
              <span>جاري تحميل سجل التسويات...</span>
            </div>
          ) : settlements.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              لا توجد تسويات مسجلة حتى الآن. انقر على "تسوية وإيداع بنكي" لتسجيل دفعة تسوية.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="p-3.5 font-semibold">رقم التسوية</th>
                    <th className="p-3.5 font-semibold">تاريخ التسوية</th>
                    <th className="p-3.5 font-semibold">بوابة / مزود الدفع</th>
                    <th className="p-3.5 font-semibold">المبلغ الإجمالي (Gross)</th>
                    <th className="p-3.5 font-semibold">العمولة المخصومة</th>
                    <th className="p-3.5 font-semibold">الصافي المودع بالبنك</th>
                    <th className="p-3.5 font-semibold">الحساب البنكي المودع به</th>
                    <th className="p-3.5 font-semibold text-center">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {settlements.map((st) => (
                    <tr key={st.id} className="hover:bg-slate-50/70 transition">
                      <td className="p-3.5 font-mono font-bold text-slate-800">{st.settlementNumber}</td>
                      <td className="p-3.5 font-mono text-slate-600">{st.settlementDate}</td>
                      <td className="p-3.5 font-bold text-indigo-700">{st.gatewayName}</td>
                      <td className="p-3.5 font-mono font-bold">{st.grossAmount.toLocaleString()} ج.م</td>
                      <td className="p-3.5 font-mono font-bold text-rose-600">-{st.commissionAmount.toLocaleString()} ج.م</td>
                      <td className="p-3.5 font-mono font-bold text-emerald-600">+{st.netAmount.toLocaleString()} ج.م</td>
                      <td className="p-3.5 text-slate-700">{st.bankAccountName}</td>
                      <td className="p-3.5 text-center">
                        <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 font-bold rounded-md text-[11px]">
                          تمت التسوية وقيد البنك
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'gateways' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800">بوابات وماكينات الدفع والعمولات المطبقة</h2>
            <span className="text-xs text-slate-400">تستخدم لاحتساب صافي التدفق عند قبول الدفع الإلكتروني</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="p-3.5 font-semibold">اسم البوابة / الماكينة</th>
                  <th className="p-3.5 font-semibold">كود المزود</th>
                  <th className="p-3.5 font-semibold">حساب التسوية المحاسبي</th>
                  <th className="p-3.5 font-semibold">نسبة العمولة (%)</th>
                  <th className="p-3.5 font-semibold">رسم ثابت لكل حركة</th>
                  <th className="p-3.5 font-semibold">دورة التسوية التقديرية</th>
                  <th className="p-3.5 font-semibold text-center">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {gateways.map((gw) => (
                  <tr key={gw.id} className="hover:bg-slate-50/70 transition">
                    <td className="p-3.5 font-bold text-slate-800">{gw.name}</td>
                    <td className="p-3.5 font-mono font-bold text-indigo-600">{gw.providerCode}</td>
                    <td className="p-3.5 font-mono text-slate-600">{gw.glAccountCode || '1106'}</td>
                    <td className="p-3.5 font-mono font-bold">{gw.commissionRate}%</td>
                    <td className="p-3.5 font-mono font-bold">{gw.fixedFee} ج.م</td>
                    <td className="p-3.5 text-slate-600">{gw.settlementPeriodDays} يوم عمل</td>
                    <td className="p-3.5 text-center">
                      <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 font-bold rounded-md text-[11px]">
                        نشطة
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: New Gateway */}
      {showGatewayModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-800 mb-4">إضافة ماكينة أو بوابة دفع</h3>
            <form onSubmit={handleCreateGateway} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 mb-1 font-medium">اسم البوابة / الماكينة</label>
                <input
                  type="text"
                  required
                  placeholder="ماكينة المعرض 1 - بنك مصر"
                  value={gatewayForm.name}
                  onChange={(e) => setGatewayForm({ ...gatewayForm, name: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl p-2"
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-1 font-medium">كود المزود</label>
                <input
                  type="text"
                  required
                  placeholder="POS_BM_01"
                  value={gatewayForm.providerCode}
                  onChange={(e) => setGatewayForm({ ...gatewayForm, providerCode: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl p-2 font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">نسبة العمولة (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={gatewayForm.commissionRate}
                    onChange={(e) => setGatewayForm({ ...gatewayForm, commissionRate: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl p-2 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">رسم ثابت للحركة (ج.م)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={gatewayForm.fixedFee}
                    onChange={(e) => setGatewayForm({ ...gatewayForm, fixedFee: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl p-2 font-mono font-bold"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-600 mb-1 font-medium">مدة دورة التسوية (أيام)</label>
                <input
                  type="number"
                  required
                  value={gatewayForm.settlementPeriodDays}
                  onChange={(e) => setGatewayForm({ ...gatewayForm, settlementPeriodDays: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl p-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowGatewayModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-medium"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-slate-800 text-white rounded-xl font-semibold hover:bg-slate-900"
                >
                  حفظ البوابة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Record Settlement */}
      {showSettlementModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-800 mb-4">تسوية رصيد بوابة وإيداع بنكي</h3>
            <form onSubmit={handleRecordSettlement} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 mb-1 font-medium">بوابة / ماكينة الدفع</label>
                <select
                  value={settleForm.gatewayId}
                  onChange={(e) => {
                    setSettleForm({ ...settleForm, gatewayId: e.target.value });
                    if (settleForm.grossAmount) onGrossChange(settleForm.grossAmount);
                  }}
                  className="w-full border border-slate-200 rounded-xl p-2 bg-slate-50 font-bold"
                >
                  {gateways.map((gw) => (
                    <option key={gw.id} value={gw.id}>
                      {gw.name} (عمولة: {gw.commissionRate}%)
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">تاريخ التسوية والإيداع</label>
                  <input
                    type="date"
                    required
                    value={settleForm.settlementDate}
                    onChange={(e) => setSettleForm({ ...settleForm, settlementDate: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl p-2 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">الحساب البنكي المودع به</label>
                  <select
                    value={settleForm.bankAccountId}
                    onChange={(e) => setSettleForm({ ...settleForm, bankAccountId: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl p-2 bg-slate-50 font-medium"
                  >
                    {bankAccounts.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.accountName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">المبلغ الإجمالي المقبوض</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="10000"
                    value={settleForm.grossAmount}
                    onChange={(e) => onGrossChange(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">عمولة البوابة المخصومة</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={settleForm.commissionAmount}
                    onChange={(e) => setSettleForm({ ...settleForm, commissionAmount: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl p-2 font-mono font-bold text-rose-600"
                  />
                </div>
              </div>

              {/* Net preview */}
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100 flex justify-between items-center text-xs">
                <span className="font-bold text-emerald-900">صافي المبلغ المودع في الحساب البنكي:</span>
                <span className="font-mono font-black text-sm text-emerald-700">
                  {Math.max(0, Number(settleForm.grossAmount || 0) - Number(settleForm.commissionAmount || 0)).toLocaleString()}{' '}
                  ج.م
                </span>
              </div>

              <div>
                <label className="block text-slate-600 mb-1 font-medium">ملاحظات / رقم مرجع التحويل</label>
                <input
                  type="text"
                  placeholder="رقم مرجع التسوية البنكية..."
                  value={settleForm.notes}
                  onChange={(e) => setSettleForm({ ...settleForm, notes: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl p-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowSettlementModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-medium"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 shadow-sm"
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
