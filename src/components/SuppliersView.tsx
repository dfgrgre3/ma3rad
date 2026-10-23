import React, { useState, useEffect } from 'react';
import { 
  Users, Plus, Search, DollarSign, FileText, 
  Printer, ArrowUpRight, ArrowDownRight, Phone, Building2
} from 'lucide-react';
import { SupplierService } from '../services/SupplierService';
import { Supplier } from '../types';
import { CeramicMath } from '../utils/ceramicMath';

export const SuppliersView: React.FC = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [statement, setStatement] = useState<any | null>(null);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    companyName: '',
    phone: '',
    email: '',
    taxNumber: '',
    commercialRecord: '',
    address: '',
    initialBalance: 0,
    paymentTermsDays: 30,
    notes: ''
  });

  const [paymentData, setPaymentData] = useState({
    amount: 5000,
    paymentType: 'CASH' as any,
    notes: 'سداد دفعة نقدية لحساب المورد'
  });

  const supplierService = new SupplierService();

  const loadSuppliers = () => {
    try {
      const data = supplierService.getAllSuppliers(search);
      setSuppliers(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadSuppliers();
  }, [search]);

  const handleOpenStatement = (sup: Supplier) => {
    setSelectedSupplier(sup);
    const stmt = supplierService.getSupplierStatement(sup.id);
    setStatement(stmt);
  };

  const handleSaveSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      supplierService.createSupplier({
        code: `SUP-${Date.now().toString().slice(-4)}`,
        name: formData.name,
        companyName: formData.companyName,
        phone: formData.phone,
        email: formData.email,
        taxNumber: formData.taxNumber,
        commercialRecord: formData.commercialRecord,
        address: formData.address,
        initialBalance: formData.initialBalance,
        paymentTermsDays: formData.paymentTermsDays,
        notes: formData.notes
      });
      setIsAddModalOpen(false);
      loadSuppliers();
    } catch (err: any) {
      alert(`خطأ: ${err.message || err}`);
    }
  };

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier) return;
    try {
      supplierService.recordPayment(
        selectedSupplier.id,
        paymentData.amount,
        paymentData.paymentType,
        'cr_main',
        paymentData.notes
      );
      setIsPaymentModalOpen(false);
      loadSuppliers();
      handleOpenStatement(supplierService.getSupplierById(selectedSupplier.id)!);
      alert('تم تسجيل سند الصرف وسداد دفعة المورد بنجاح.');
    } catch (err: any) {
      alert(`خطأ: ${err.message || err}`);
    }
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      {/* Header Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">إدارة الموردين ومصانع السيراميك</h2>
          <p className="text-xs text-slate-500">متابعة حسابات المصانع، سداد الدفعات، وكشوف الحساب التفصيلية</p>
        </div>

        <button
          onClick={() => {
            setFormData({
              name: '',
              companyName: '',
              phone: '',
              email: '',
              taxNumber: '',
              commercialRecord: '',
              address: '',
              initialBalance: 0,
              paymentTermsDays: 30,
              notes: ''
            });
            setIsAddModalOpen(true);
          }}
          className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-sky-600/30 transition text-sm"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة مورد / مصنع جديد</span>
        </button>
      </div>

      {/* Search */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="بحث بالاسم، المصنع، الهاتف..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-4 pr-9 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none"
          />
        </div>
      </div>

      {/* Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Suppliers List */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3.5">كود المورد</th>
                  <th className="p-3.5">اسم المورد / الشركة</th>
                  <th className="p-3.5">الهاتف</th>
                  <th className="p-3.5">إجمالي المشتريات</th>
                  <th className="p-3.5">الرصيد المستحق للمورد</th>
                  <th className="p-3.5 text-center">كشف الحساب</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 ">
                {suppliers.map((s) => {
                  const isSelected = selectedSupplier?.id === s.id;
                  return (
                    <tr
                      key={s.id}
                      className={`hover:bg-slate-100 transition cursor-pointer ${
 isSelected ? 'bg-sky-50/60 ' : ''
 }`}
                      onClick={() => handleOpenStatement(s)}
                    >
                      <td className="p-3.5 font-mono font-bold text-slate-500">{s.code}</td>
                      <td className="p-3.5 font-bold text-slate-900">
                        <div>{s.name}</div>
                        {s.companyName && <div className="text-[10px] text-slate-500 font-normal">{s.companyName}</div>}
                      </td>
                      <td className="p-3.5 font-mono text-slate-600 ">{s.phone}</td>
                      <td className="p-3.5 font-bold text-slate-700">
                        {CeramicMath.formatCurrency(s.totalPurchases)}
                      </td>
                      <td className="p-3.5 font-black text-sm text-red-600">
                        {CeramicMath.formatCurrency(s.currentBalance)}
                      </td>
                      <td className="p-3.5 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenStatement(s);
                          }}
                          className="p-1.5 rounded-lg bg-sky-500/10 text-sky-600 hover:bg-sky-600 hover:text-slate-900 transition"
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

        {/* Statement Panel */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          {selectedSupplier && statement ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">{selectedSupplier.name}</h3>
                  <p className="text-[11px] text-slate-500 font-mono">{selectedSupplier.phone}</p>
                </div>
                <button
                  onClick={() => setIsPaymentModalOpen(true)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/30"
                >
                  <DollarSign className="w-4 h-4" />
                  <span>سند صرف دفعة</span>
                </button>
              </div>

              {/* Statement Summary Card */}
              <div className="bg-slate-50 p-3 rounded-xl space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">الرصيد المستحق للمورد (دائن):</span>
                  <span className="font-black text-red-600 text-sm">
                    {CeramicMath.formatCurrency(selectedSupplier.currentBalance)}
                  </span>
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
                          <span className={tx.credit > 0 ? 'text-red-500 font-bold' : 'text-emerald-500 font-bold'}>
                            {tx.credit > 0 ? `+${CeramicMath.formatCurrency(tx.credit)} (فاتورة توريد)` : `-${CeramicMath.formatCurrency(tx.debit)} (سداد دفعة)`}
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
              <Building2 className="w-12 h-12 mb-2 opacity-30" />
              <p className="text-xs font-bold">اختر مورداً لعرض كشف حسابه</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Supplier Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-white backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-extrabold text-slate-900">إضافة مورد / مصنع سيراميك</h3>

            <form onSubmit={handleSaveSupplier} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">اسم المورد / المسؤول *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">اسم المصنع / الشركة</label>
                  <input
                    type="text"
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 "
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">رقم الهاتف *</label>
                  <input
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">الرصيد الافتتاحي المستحق للمورد (إن وجد)</label>
                <input
                  type="number"
                  value={formData.initialBalance}
                  onChange={(e) => setFormData({ ...formData, initialBalance: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold"
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
                  حفظ المورد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {isPaymentModalOpen && selectedSupplier && (
        <div className="fixed inset-0 bg-white backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-sm w-full p-6 space-y-4">
            <h3 className="text-base font-extrabold text-slate-900">سند صرف / سداد دفعة للمورد</h3>
            <p className="text-xs text-slate-500">
              المورد: <strong className="text-slate-800">{selectedSupplier.name}</strong>
            </p>

            <form onSubmit={handleRecordPayment} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">المبلغ المسدد (ج.م) *</label>
                <input
                  type="number"
                  required
                  value={paymentData.amount}
                  onChange={(e) => setPaymentData({ ...paymentData, amount: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-black text-sm text-emerald-600"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">طريقة السداد</label>
                <select
                  value={paymentData.paymentType}
                  onChange={(e) => setPaymentData({ ...paymentData, paymentType: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold"
                >
                  <option value="CASH">نقدي كاش (من الخزينة)</option>
                  <option value="BANK_TRANSFER">تحويل بنكي / شيك</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">البيان / الملاحظات</label>
                <input
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
                  اعتماد سند الصرف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
