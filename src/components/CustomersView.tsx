import React, { useState, useEffect } from 'react';
import { 
  Users, Plus, Search, DollarSign, FileText, 
  Printer, ArrowUpRight, ArrowDownRight, Phone, MapPin
} from 'lucide-react';
import { CustomerService } from '../services/CustomerService';
import { Customer } from '../types';
import { CeramicMath } from '../utils/ceramicMath';

export const CustomersView: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [statement, setStatement] = useState<any | null>(null);

  // Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    phone2: '',
    nationalId: '',
    address: '',
    city: 'القاهرة',
    customerType: 'RETAIL' as any,
    creditLimit: 50000,
    initialBalance: 0,
    notes: ''
  });

  const [paymentData, setPaymentData] = useState({
    amount: 1000,
    paymentType: 'CASH' as any,
    notes: 'تحصيل دفعة نقدية'
  });

  const customerService = new CustomerService();

  const loadCustomers = () => {
    try {
      const data = customerService.getAllCustomers(search);
      setCustomers(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, [search]);

  const handleOpenStatement = (cust: Customer) => {
    setSelectedCustomer(cust);
    const stmt = customerService.getCustomerStatement(cust.id);
    setStatement(stmt);
  };

  const handleSaveCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      customerService.createCustomer({
        code: `CUST-${Date.now().toString().slice(-4)}`,
        name: formData.name,
        phone: formData.phone,
        phone2: formData.phone2,
        nationalId: formData.nationalId,
        address: formData.address,
        city: formData.city,
        customerType: formData.customerType,
        creditLimit: formData.creditLimit,
        initialBalance: formData.initialBalance,
        notes: formData.notes
      });
      setIsAddModalOpen(false);
      loadCustomers();
    } catch (err: any) {
      alert(`خطأ: ${err.message || err}`);
    }
  };

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    try {
      customerService.recordPayment(
        selectedCustomer.id,
        paymentData.amount,
        paymentData.paymentType,
        'cr_main',
        undefined,
        paymentData.notes
      );
      setIsPaymentModalOpen(false);
      loadCustomers();
      handleOpenStatement(customerService.getCustomerById(selectedCustomer.id)!);
      alert('تم تسجيل سند القبض وتحصيل الدفعة بنجاح.');
    } catch (err: any) {
      alert(`خطأ: ${err.message || err}`);
    }
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      {/* Header Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">إدارة العملاء والآجل وكشوف الحسابات</h2>
          <p className="text-xs text-slate-500">متابعة مديونيات العملاء، تحصيل الدفعات، وكشوف الحساب التفصيلية</p>
        </div>

        <button
          onClick={() => {
            setFormData({
              name: '',
              phone: '',
              phone2: '',
              nationalId: '',
              address: '',
              city: 'القاهرة',
              customerType: 'RETAIL',
              creditLimit: 50000,
              initialBalance: 0,
              notes: ''
            });
            setIsAddModalOpen(true);
          }}
          className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-sky-600/30 transition text-sm"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة عميل جديد</span>
        </button>
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="بحث بالاسم، رقم الهاتف، أو كود العميل..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-4 pr-9 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium focus:outline-none"
          />
        </div>
      </div>

      {/* Customers List & Statement Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Customer List */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="p-3.5">كود العميل</th>
                  <th className="p-3.5">الاسم والبيانات</th>
                  <th className="p-3.5">الهاتف</th>
                  <th className="p-3.5">النوع</th>
                  <th className="p-3.5">إجمالي المشتريات</th>
                  <th className="p-3.5">الرصيد المستحق</th>
                  <th className="p-3.5 text-center">كشف الحساب</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {customers.map((c) => {
                  const hasDebt = c.currentBalance > 0;
                  const isSelected = selectedCustomer?.id === c.id;

                  return (
                    <tr
                      key={c.id}
                      className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition cursor-pointer ${
                        isSelected ? 'bg-sky-50/60 dark:bg-sky-950/30' : ''
                      }`}
                      onClick={() => handleOpenStatement(c)}
                    >
                      <td className="p-3.5 font-mono font-bold text-slate-400">{c.code}</td>
                      <td className="p-3.5 font-bold text-slate-900 dark:text-white">
                        <div>{c.name}</div>
                        {c.address && <div className="text-[10px] text-slate-400 font-normal">{c.address}</div>}
                      </td>
                      <td className="p-3.5 font-mono text-slate-600 dark:text-slate-400">{c.phone}</td>
                      <td className="p-3.5">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600">
                          {c.customerType === 'CONTRACTOR' ? 'مقاول / مهندس' : 'قطاعي / أفراد'}
                        </span>
                      </td>
                      <td className="p-3.5 font-bold text-slate-700 dark:text-slate-300">
                        {CeramicMath.formatCurrency(c.totalPurchases)}
                      </td>
                      <td className="p-3.5">
                        <span className={`font-black text-sm ${hasDebt ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {CeramicMath.formatCurrency(c.currentBalance)}
                        </span>
                      </td>
                      <td className="p-3.5 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenStatement(c);
                          }}
                          className="p-1.5 rounded-lg bg-sky-500/10 text-sky-600 hover:bg-sky-600 hover:text-white transition"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Customer Statement & Action Panel */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          {selectedCustomer && statement ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">{selectedCustomer.name}</h3>
                  <p className="text-[11px] text-slate-400 font-mono">{selectedCustomer.phone}</p>
                </div>
                <button
                  onClick={() => setIsPaymentModalOpen(true)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/30"
                >
                  <DollarSign className="w-4 h-4" />
                  <span>سند قبض / تحصيل</span>
                </button>
              </div>

              {/* Statement Summary Card */}
              <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-xl space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">الرصيد الحالي المستحق:</span>
                  <span className="font-black text-amber-600 text-sm">
                    {CeramicMath.formatCurrency(selectedCustomer.currentBalance)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">الحد الائتماني المسموح:</span>
                  <span className="font-bold">{CeramicMath.formatCurrency(selectedCustomer.creditLimit)}</span>
                </div>
              </div>

              {/* Transactions Timeline */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-500">سجل حركات كشف الحساب:</div>
                <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
                  {statement.transactions.length === 0 ? (
                    <div className="text-center py-6 text-xs text-slate-400">لا توجد حركات مسجلة</div>
                  ) : (
                    statement.transactions.map((tx: any) => (
                      <div key={tx.id} className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-[11px] space-y-1">
                        <div className="flex justify-between font-bold">
                          <span>{tx.description}</span>
                          <span className="font-mono text-slate-400">{tx.date}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className={tx.debit > 0 ? 'text-red-500 font-bold' : 'text-emerald-500 font-bold'}>
                            {tx.debit > 0 ? `+${CeramicMath.formatCurrency(tx.debit)} (مدين)` : `-${CeramicMath.formatCurrency(tx.credit)} (سداد)`}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            الرصيد بعدها: {CeramicMath.formatCurrency(tx.balanceAfter)}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 py-12">
              <Users className="w-12 h-12 mb-2 opacity-30" />
              <p className="text-xs font-bold">اختر عميلاً لعرض كشف حسابه</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Customer Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">إضافة عميل جديد</h3>

            <form onSubmit={handleSaveCustomer} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">اسم العميل *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">رقم الهاتف *</label>
                  <input
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">نوع العميل</label>
                  <select
                    value={formData.customerType}
                    onChange={(e) => setFormData({ ...formData, customerType: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 font-bold"
                  >
                    <option value="RETAIL">أفراد / قطاعي</option>
                    <option value="CONTRACTOR">مقاول / مهندس ديكور</option>
                    <option value="WHOLESALE">تاجر جملة</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">الحد الائتماني (ج.م)</label>
                  <input
                    type="number"
                    value={formData.creditLimit}
                    onChange={(e) => setFormData({ ...formData, creditLimit: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">رصيد افتتاحي (إن وجد)</label>
                  <input
                    type="number"
                    value={formData.initialBalance}
                    onChange={(e) => setFormData({ ...formData, initialBalance: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">العنوان</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl shadow-lg shadow-sky-600/30"
                >
                  حفظ العميل
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {isPaymentModalOpen && selectedCustomer && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-sm w-full p-6 space-y-4">
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">سند قبض / تحصيل دفعة</h3>
            <p className="text-xs text-slate-500">
              العميل: <strong className="text-slate-800 dark:text-slate-200">{selectedCustomer.name}</strong>
            </p>

            <form onSubmit={handleRecordPayment} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">المبلغ المحصل (ج.م) *</label>
                <input
                  type="number"
                  required
                  value={paymentData.amount}
                  onChange={(e) => setPaymentData({ ...paymentData, amount: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 font-black text-sm text-emerald-600"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">طريقة السداد</label>
                <select
                  value={paymentData.paymentType}
                  onChange={(e) => setPaymentData({ ...paymentData, paymentType: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 font-bold"
                >
                  <option value="CASH">نقدي كاش (الخزينة)</option>
                  <option value="CARD">بطاقة بنكية / فيزا</option>
                  <option value="BANK_TRANSFER">تحويل بنكي / محفظة</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">البيان / الملاحظات</label>
                <input
                  type="text"
                  value={paymentData.notes}
                  onChange={(e) => setPaymentData({ ...paymentData, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/30"
                >
                  اعتماد السند
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
