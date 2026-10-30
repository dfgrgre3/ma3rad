import React, { useState, useEffect } from 'react';
import { 
  Users, Plus, Search, DollarSign, FileText, 
  Printer, ArrowUpRight, ArrowDownRight, Phone, MapPin
} from 'lucide-react';
import { CustomerService } from '../services/CustomerService';
import { Customer } from '../types';
import { CeramicMath } from '../utils/ceramicMath';
import { useBusinessProfileMeta, useBusinessTerm } from '../hooks/useBusinessTerm';
import { usePermission } from '../hooks/usePermission';
import { ConfiguredActionButton } from './config/ConfiguredActionButton';
const CustomerPagination: React.FC<{ page: number; totalPages: number; totalItems: number; pageSize: number; onPageChange: (page: number) => void; onPageSizeChange: (size: number) => void }> = ({ page, totalPages, totalItems, pageSize, onPageChange, onPageSizeChange }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs border-slate-200">
    <span className="text-slate-500">عرض {Math.min((page - 1) * pageSize + 1, totalItems)}–{Math.min(page * pageSize, totalItems)} من {totalItems}</span>
    <div className="flex items-center gap-2"><select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 "><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select><button disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 font-bold disabled:opacity-40 ">السابق</button><span className="min-w-[70px] text-center font-bold">{page} / {totalPages}</span><button disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 font-bold disabled:opacity-40 ">التالي</button></div>
  </div>
);

export const CustomersView: React.FC = () => {
  const customersLabel = useBusinessTerm('entities.customers.plural');
  const customerSingularLabel = useBusinessTerm('entities.customers.singular');
  const { label: businessProfileLabel } = useBusinessProfileMeta();
  const can = usePermission();
  const canCreate = can('customers.create');
  const canCollect = can('customers.payment');
  const canViewPurchases = can('sales.view');
  const canViewDebts = can('finance.debts.view');
  const canViewStatement = canViewPurchases && canViewDebts;
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [statement, setStatement] = useState<any | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

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
    paymentTermsDays: 0,
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
      const result = customerService.getCustomersPage(search, page, pageSize);
      setCustomers(result.items);
      setPage(result.page);
      setTotalPages(result.totalPages);
      setTotalItems(result.totalItems);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, [search, page, pageSize]);

  useEffect(() => { setPage(1); }, [search]);

  const handleOpenStatement = (cust: Customer) => {
    if (!canViewStatement) return;
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
        paymentTermsDays: formData.paymentTermsDays,
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
      if (canViewStatement) {
        handleOpenStatement(customerService.getCustomerById(selectedCustomer.id)!);
      } else {
        setSelectedCustomer(null);
        setStatement(null);
      }
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
          <h2 className="text-xl font-extrabold text-slate-900">
            إدارة {customersLabel}
            <span className="ml-2 text-sm font-bold text-sky-700">· {businessProfileLabel}</span>
          </h2>
          <p className="text-xs text-slate-500">متابعة مديونيات العملاء، تحصيل الدفعات، وكشوف الحساب التفصيلية</p>
        </div>

        <ConfiguredActionButton
          actionId="customers.create"
          fallbackLabel={`إضافة ${customerSingularLabel} جديد`}
          icon={<Plus className="w-4 h-4" />}
          className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-sky-600/30 transition text-sm"
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
              paymentTermsDays: 0,
              initialBalance: 0,
              notes: ''
            });
            setIsAddModalOpen(true);
          }}
        />
      </div>

      {/* Search */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <label htmlFor="customer-search" className="sr-only">بحث بالاسم، رقم الهاتف، أو كود العميل</label>
          <input
            id="customer-search"
            type="text"
            placeholder="بحث بالاسم، رقم الهاتف، أو كود العميل..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-4 pr-9 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none"
          />
        </div>
      </div>

      {/* Customers List & Statement Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Customer List */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3.5">كود العميل</th>
                  <th className="p-3.5">الاسم والبيانات</th>
                  <th className="p-3.5">الهاتف</th>
                  <th className="p-3.5">النوع</th>
                  {canViewPurchases && <th className="p-3.5">إجمالي المشتريات</th>}
                  {canViewDebts && <th className="p-3.5">الرصيد المستحق</th>}
                  {canViewStatement && <th className="p-3.5 text-center">كشف الحساب</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 ">
                {customers.map((c) => {
                  const hasDebt = canViewDebts && c.currentBalance > 0;
                  const isSelected = selectedCustomer?.id === c.id;

                  return (
                    <tr
                      key={c.id}
                      className={`hover:bg-slate-100 transition ${canViewStatement ? 'cursor-pointer' : ''} ${
 isSelected ? 'bg-sky-50/60 ' : ''
 }`}
                      onClick={canViewStatement ? () => handleOpenStatement(c) : undefined}
                    >
                      <td className="p-3.5 font-mono font-bold text-slate-500">{c.code}</td>
                      <td className="p-3.5 font-bold text-slate-900">
                        <div>{c.name}</div>
                        {c.address && <div className="text-[10px] text-slate-500 font-normal">{c.address}</div>}
                      </td>
                      <td className="p-3.5 font-mono text-slate-600 ">{c.phone}</td>
                      <td className="p-3.5">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                          {c.customerType === 'CONTRACTOR' ? 'مقاول / مهندس' : 'قطاعي / أفراد'}
                        </span>
                      </td>
                      {canViewPurchases && <td className="p-3.5 font-bold text-slate-700">
                        {CeramicMath.formatCurrency(c.totalPurchases)}
                      </td>}
                      {canViewDebts && <td className="p-3.5">
                        <span className={`font-black text-sm ${hasDebt ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {CeramicMath.formatCurrency(c.currentBalance)}
                        </span>
                      </td>}
                      {canViewStatement && <td className="p-3.5 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenStatement(c);
                          }}
                          className="p-1.5 rounded-lg bg-sky-500/10 text-sky-600 hover:bg-sky-600 hover:text-slate-900 transition"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                      </td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalItems > 0 && <CustomerPagination page={page} totalPages={totalPages} totalItems={totalItems} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />}
        </div>

        {/* Customer Statement & Action Panel */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          {selectedCustomer && statement ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">{selectedCustomer.name}</h3>
                  <p className="text-[11px] text-slate-500 font-mono">{selectedCustomer.phone}</p>
                </div>
                {canCollect && <button
                  onClick={() => setIsPaymentModalOpen(true)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/30"
                >
                  <DollarSign className="w-4 h-4" />
                  <span>سند قبض / تحصيل</span>
                </button>}
              </div>

              {/* Statement Summary Card */}
              <div className="bg-slate-50 p-3 rounded-xl space-y-1.5 text-xs">
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
                    <div className="text-center py-6 text-xs text-slate-500">لا توجد حركات مسجلة</div>
                  ) : (
                    statement.transactions.map((tx: any) => (
                      <div key={tx.id} className="p-2.5 rounded-xl border border-slate-100 bg-slate-100 text-[11px] space-y-1">
                        <div className="flex justify-between font-bold">
                          <span>{tx.description}</span>
                          <span className="font-mono text-slate-500">{tx.date}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className={tx.debit > 0 ? 'text-red-500 font-bold' : 'text-emerald-500 font-bold'}>
                            {tx.debit > 0 ? `+${CeramicMath.formatCurrency(tx.debit)} (مدين)` : `-${CeramicMath.formatCurrency(tx.credit)} (سداد)`}
                          </span>
                          <span className="text-[10px] text-slate-500">
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
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 py-12">
              <Users className="w-12 h-12 mb-2 opacity-30" />
              <p className="text-xs font-bold">اختر عميلاً لعرض كشف حسابه</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Customer Modal */}
      {isAddModalOpen && canCreate && (
        <div className="fixed inset-0 bg-white backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-extrabold text-slate-900">إضافة {customerSingularLabel} جديد</h3>

            <form onSubmit={handleSaveCustomer} className="space-y-3 text-xs">
              <div>
                <label htmlFor="customer-name" className="font-bold text-slate-700 block mb-1">اسم {customerSingularLabel} *</label>
                <input
                  id="customer-name"
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="customer-phone" className="font-bold text-slate-700 block mb-1">رقم الهاتف *</label>
                  <input
                    id="customer-phone"
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono font-bold"
                  />
                </div>
                <div>
                  <label htmlFor="customer-type" className="font-bold text-slate-700 block mb-1">نوع العميل</label>
                  <select
                    id="customer-type"
                    value={formData.customerType}
                    onChange={(e) => setFormData({ ...formData, customerType: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold"
                  >
                    <option value="RETAIL">أفراد / قطاعي</option>
                    <option value="CONTRACTOR">مقاول / مهندس ديكور</option>
                    <option value="WHOLESALE">تاجر جملة</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="customer-credit-limit" className="font-bold text-slate-700 block mb-1">الحد الائتماني (ج.م)</label>
                  <input
                    id="customer-credit-limit"
                    type="number"
                    value={formData.creditLimit}
                    onChange={(e) => setFormData({ ...formData, creditLimit: Number.parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold"
                  />
                </div>
                <div>
                  <label htmlFor="customer-payment-terms" className="font-bold text-slate-700 block mb-1">أجل السداد (أيام)</label>
                  <input id="customer-payment-terms" type="number" min="0" value={formData.paymentTermsDays} onChange={(e) => setFormData({ ...formData, paymentTermsDays: Number.parseInt(e.target.value, 10) || 0 })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold" />
                </div>
                <div>
                  <label htmlFor="customer-initial-balance" className="font-bold text-slate-700 block mb-1">رصيد افتتاحي (إن وجد)</label>
                  <input
                    id="customer-initial-balance"
                    type="number"
                    value={formData.initialBalance}
                    onChange={(e) => setFormData({ ...formData, initialBalance: Number.parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="customer-address" className="font-bold text-slate-700 block mb-1">العنوان</label>
                <input
                  id="customer-address"
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 "
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 ">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl"
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
      {isPaymentModalOpen && selectedCustomer && canCollect && (
        <div className="fixed inset-0 bg-white backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-sm w-full p-6 space-y-4">
            <h3 className="text-base font-extrabold text-slate-900">سند قبض / تحصيل دفعة</h3>
            <p className="text-xs text-slate-500">
              العميل: <strong className="text-slate-800">{selectedCustomer.name}</strong>
            </p>

            <form onSubmit={handleRecordPayment} className="space-y-3 text-xs">
              <div>
                <label htmlFor="customer-payment-amount" className="font-bold text-slate-700 block mb-1">المبلغ المحصل (ج.م) *</label>
                <input
                  id="customer-payment-amount"
                  type="number"
                  required
                  value={paymentData.amount}
                  onChange={(e) => setPaymentData({ ...paymentData, amount: Number.parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-black text-sm text-emerald-600"
                />
              </div>

              <div>
                <label htmlFor="customer-payment-type" className="font-bold text-slate-700 block mb-1">طريقة السداد</label>
                <select
                  id="customer-payment-type"
                  value={paymentData.paymentType}
                  onChange={(e) => setPaymentData({ ...paymentData, paymentType: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold"
                >
                  <option value="CASH">نقدي كاش (الخزينة)</option>
                  <option value="CARD">بطاقة بنكية / فيزا</option>
                  <option value="BANK_TRANSFER">تحويل بنكي / محفظة</option>
                </select>
              </div>

              <div>
                <label htmlFor="customer-payment-notes" className="font-bold text-slate-700 block mb-1">البيان / الملاحظات</label>
                <input
                  id="customer-payment-notes"
                  type="text"
                  value={paymentData.notes}
                  onChange={(e) => setPaymentData({ ...paymentData, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 "
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 ">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl"
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
