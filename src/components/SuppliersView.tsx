import React, { useState, useEffect } from 'react';
import { 
  Users, Plus, Search, DollarSign, FileText, Download, Printer,
  ArrowUpRight, ArrowDownRight, Phone, Building2, Pencil, Power,
  CalendarDays, Upload, ExternalLink
} from 'lucide-react';
import { SupplierService } from '../services/SupplierService';
import { Supplier, PaymentType } from '../types';
import { CeramicMath } from '../utils/ceramicMath';
import { AuthService } from '../services/AuthService';
import { PermissionService } from '../services/PermissionService';
import { Link } from 'react-router-dom';

const csvCell = (value: unknown) => {
  const text = String(value ?? '');
  const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
};

const downloadCsv = (name: string, rows: unknown[][]) => {
  const csv = '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
};

export const SuppliersView: React.FC = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [statement, setStatement] = useState<any | null>(null);
  const [statementFrom, setStatementFrom] = useState('');
  const [statementTo, setStatementTo] = useState('');

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

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
    paymentType: 'CASH' as PaymentType,
    notes: 'سداد دفعة نقدية لحساب المورد'
  });

  const supplierService = new SupplierService();
  const currentUser = AuthService.getCurrentUser();
  const canCreate = PermissionService.can(currentUser, 'suppliers.create');
  const canUpdate = PermissionService.can(currentUser, 'suppliers.update');
  const canPay = PermissionService.can(currentUser, 'suppliers.payment');

  const loadSuppliers = () => {
    try {
      const data = supplierService.getAllSuppliers(search, showInactive);
      setSuppliers(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadSuppliers();
  }, [search, showInactive]);

  useEffect(() => {
    if (!selectedSupplier) return;
    try {
      const current = supplierService.getSupplierById(selectedSupplier.id);
      if (!current) return;
      setSelectedSupplier(current);
      setStatement(supplierService.getSupplierStatement(current.id, statementFrom, statementTo));
    } catch (e) {
      console.error(e);
    }
  }, [selectedSupplier?.id, statementFrom, statementTo]);

  const handleOpenStatement = (sup: Supplier) => {
    setSelectedSupplier(sup);
    const stmt = supplierService.getSupplierStatement(sup.id, statementFrom, statementTo);
    setStatement(stmt);
  };

  const handleSaveSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingSupplier) {
        const updated = supplierService.updateSupplier(editingSupplier.id, formData);
        setSelectedSupplier(updated);
        setStatement(supplierService.getSupplierStatement(updated.id, statementFrom, statementTo));
      } else {
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
      }
      setIsAddModalOpen(false);
      setEditingSupplier(null);
      loadSuppliers();
    } catch (err: any) {
      alert(`خطأ: ${err.message || err}`);
    }
  };

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier) return;
    try {
      if (!Number.isFinite(paymentData.amount) || paymentData.amount <= 0) {
        throw new Error('أدخل مبلغاً صحيحاً أكبر من الصفر.');
      }
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

  const openEditSupplier = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name || '',
      companyName: supplier.companyName || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      taxNumber: supplier.taxNumber || '',
      commercialRecord: supplier.commercialRecord || '',
      address: supplier.address || '',
      initialBalance: 0,
      paymentTermsDays: supplier.paymentTermsDays ?? 30,
      notes: supplier.notes || ''
    });
    setIsAddModalOpen(true);
  };

  const toggleSupplierStatus = (supplier: Supplier) => {
    try {
      const updated = supplierService.updateSupplier(supplier.id, { isActive: supplier.isActive === 0 ? 1 : 0 });
      if (selectedSupplier?.id === supplier.id) {
        setSelectedSupplier(updated);
        setStatement(supplierService.getSupplierStatement(updated.id, statementFrom, statementTo));
      }
      loadSuppliers();
    } catch (err: any) {
      alert(`تعذر تحديث حالة المورد: ${err.message || err}`);
    }
  };

  const exportSuppliers = () => {
    downloadCsv('suppliers.csv', [
      ['الكود', 'اسم المورد', 'الشركة', 'الهاتف', 'البريد الإلكتروني', 'الرقم الضريبي', 'السجل التجاري', 'العنوان', 'الرصيد', 'إجمالي المشتريات', 'مدة السداد', 'الحالة', 'ملاحظات'],
      ...suppliers.map((supplier) => [
        supplier.code, supplier.name, supplier.companyName, supplier.phone, supplier.email,
        supplier.taxNumber, supplier.commercialRecord, supplier.address, supplier.currentBalance,
        supplier.totalPurchases, supplier.paymentTermsDays, supplier.isActive === 0 ? 'غير نشط' : 'نشط',
        supplier.notes
      ])
    ]);
  };

  const exportStatement = () => {
    if (!statement || !selectedSupplier) return;
    downloadCsv(`supplier-${selectedSupplier.code}-statement.csv`, [
      ['التاريخ', 'النوع', 'رقم المستند', 'البيان', 'مدين', 'دائن', 'الرصيد بعد الحركة'],
      ...statement.transactions.map((tx: any) => [
        tx.date, tx.type === 'PURCHASE' ? 'فاتورة شراء' : 'سداد',
        tx.docNumber, tx.description, tx.debit, tx.credit, tx.balanceAfter
      ])
    ]);
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      {/* Header Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">إدارة الموردين ومصانع السيراميك</h2>
          <p className="text-xs text-slate-500">متابعة حسابات المصانع، سداد الدفعات، وكشوف الحساب التفصيلية</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={exportSuppliers} className="px-3 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl flex items-center gap-2 text-sm">
            <Download className="w-4 h-4" /><span>تصدير CSV</span>
          </button>
          <Link to="/data-import" className="px-3 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl flex items-center gap-2 text-sm">
            <Upload className="w-4 h-4" /><span>استيراد الموردين</span>
          </Link>
          {canCreate && <button
          onClick={() => {
            setEditingSupplier(null);
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
          </button>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          { label: 'الموردون المعروضون', value: suppliers.length, color: 'text-sky-700' },
          { label: 'إجمالي المشتريات', value: CeramicMath.formatCurrency(suppliers.reduce((sum, supplier) => sum + Number(supplier.totalPurchases || 0), 0)), color: 'text-indigo-700' },
          { label: 'مستحقات الموردين', value: CeramicMath.formatCurrency(suppliers.reduce((sum, supplier) => sum + Math.max(Number(supplier.currentBalance || 0), 0), 0)), color: 'text-rose-700' },
          { label: 'رصيد لنا لدى الموردين', value: CeramicMath.formatCurrency(suppliers.reduce((sum, supplier) => sum + Math.max(-Number(supplier.currentBalance || 0), 0), 0)), color: 'text-emerald-700' }
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-[11px] font-bold text-slate-500">{card.label}</div>
            <div className={`mt-1 text-lg font-black ${card.color}`}>{card.value}</div>
          </div>
        ))}
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
        <label className="flex items-center gap-2 text-xs font-bold text-slate-600 whitespace-nowrap">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          إظهار الموردين غير النشطين
        </label>
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
                        <div className="flex items-center gap-2">
                          <span>{s.name}</span>
                          {s.isActive === 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] text-slate-500">غير نشط</span>}
                        </div>
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
                        <div className="flex justify-center gap-1">
                        {canUpdate && <button
                          title="تعديل بيانات المورد"
                          onClick={(e) => { e.stopPropagation(); openEditSupplier(s); }}
                          className="p-1.5 rounded-lg bg-amber-500/10 text-amber-700 hover:bg-amber-500 hover:text-white transition"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>}
                        {canUpdate && <button
                          title={s.isActive === 0 ? 'إعادة تفعيل المورد' : 'تعطيل المورد'}
                          onClick={(e) => { e.stopPropagation(); toggleSupplierStatus(s); }}
                          className={`p-1.5 rounded-lg transition ${s.isActive === 0 ? 'bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500 hover:text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-600 hover:text-white'}`}
                        >
                          <Power className="w-4 h-4" />
                        </button>}
                        <button
                          title="عرض كشف الحساب السريع"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenStatement(s);
                          }}
                          className="p-1.5 rounded-lg bg-sky-500/10 text-sky-600 hover:bg-sky-600 hover:text-white transition"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                        <Link
                          to={`/suppliers/${s.id}`}
                          onClick={(e) => e.stopPropagation()}
                          title="عرض ملف المورد الكامل"
                          className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-700 hover:bg-indigo-600 hover:text-white transition"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {suppliers.length === 0 && <tr><td colSpan={6} className="p-10 text-center text-sm font-bold text-slate-400">لا يوجد موردون مطابقون لبحثك.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Statement Panel */}
        <div className="supplier-statement-print-area bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          {selectedSupplier && statement ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">{selectedSupplier.name}</h3>
                  <p className="text-[11px] text-slate-500 font-mono">{selectedSupplier.phone}</p>
                </div>
                <div className="flex items-center gap-1 no-print">
                <Link
                  to={`/suppliers/${selectedSupplier.id}`}
                  className="px-2.5 py-1.5 bg-sky-50 text-sky-700 hover:bg-sky-100 font-bold rounded-xl text-xs flex items-center gap-1 border border-sky-200 transition"
                  title="فتح ملف المورد الكامل"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>الملف الكامل</span>
                </Link>
                {canUpdate && <button
                  title="تعديل بيانات المورد"
                  onClick={() => openEditSupplier(selectedSupplier)}
                  className="p-2 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100"
                ><Pencil className="w-4 h-4" /></button>}
                {canPay && <button
                  onClick={() => setIsPaymentModalOpen(true)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/30"
                >
                  <DollarSign className="w-4 h-4" />
                  <span>سند صرف دفعة</span>
                </button>}
                </div>
              </div>

              {/* Statement Summary Card */}
              <div className="bg-slate-50 p-3 rounded-xl space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">رصيد أول المدة:</span>
                  <span className="font-bold text-slate-700">{CeramicMath.formatCurrency(statement.openingBalance)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">الرصيد المستحق للمورد (دائن):</span>
                  <span className="font-black text-red-600 text-sm">
                    {CeramicMath.formatCurrency(statement.closingBalance)}
                  </span>
                </div>
              </div>

              {/* Transactions Timeline */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div className="text-xs font-bold text-slate-500">سجل حركات كشف الحساب:</div>
                  <div className="flex gap-1 no-print">
                    <button onClick={exportStatement} title="تصدير كشف الحساب" className="p-1.5 rounded-lg bg-sky-50 text-sky-700 hover:bg-sky-100"><Download className="w-4 h-4" /></button>
                    <button onClick={() => window.print()} title="طباعة كشف الحساب" className="p-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"><Printer className="w-4 h-4" /></button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 no-print">
                  <label className="text-[10px] font-bold text-slate-500">
                    من تاريخ
                    <span className="relative mt-1 block">
                      <CalendarDays className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <input type="date" value={statementFrom} onChange={(e) => setStatementFrom(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pr-7 pl-2 text-[10px]" />
                    </span>
                  </label>
                  <label className="text-[10px] font-bold text-slate-500">
                    إلى تاريخ
                    <span className="relative mt-1 block">
                      <CalendarDays className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <input type="date" value={statementTo} onChange={(e) => setStatementTo(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pr-7 pl-2 text-[10px]" />
                    </span>
                  </label>
                </div>
                {statementFrom && statementTo && statementFrom > statementTo && <div className="text-[10px] font-bold text-rose-600">تاريخ البداية يجب ألا يتجاوز تاريخ النهاية.</div>}
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
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-extrabold text-slate-900">{editingSupplier ? 'تعديل بيانات المورد' : 'إضافة مورد / مصنع سيراميك'}</h3>

            <form onSubmit={handleSaveSupplier} className="space-y-3 text-xs">
              <div>
                <label htmlFor="supplier-name" className="font-bold text-slate-700 block mb-1">اسم المورد / المسؤول *</label>
                <input
                  id="supplier-name"
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="supplier-company" className="font-bold text-slate-700 block mb-1">اسم المصنع / الشركة</label>
                  <input
                    id="supplier-company"
                    type="text"
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 "
                  />
                </div>
                <div>
                  <label htmlFor="supplier-phone" className="font-bold text-slate-700 block mb-1">رقم الهاتف *</label>
                  <input
                    id="supplier-phone"
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label htmlFor="supplier-email" className="font-bold text-slate-700 block mb-1">البريد الإلكتروني</label>
                  <input id="supplier-email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" />
                </div>
                <div>
                  <label htmlFor="supplier-tax-number" className="font-bold text-slate-700 block mb-1">الرقم الضريبي</label>
                  <input id="supplier-tax-number" value={formData.taxNumber} onChange={(e) => setFormData({ ...formData, taxNumber: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" />
                </div>
                <div>
                  <label htmlFor="supplier-commercial-record" className="font-bold text-slate-700 block mb-1">السجل التجاري</label>
                  <input id="supplier-commercial-record" value={formData.commercialRecord} onChange={(e) => setFormData({ ...formData, commercialRecord: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" />
                </div>
                <div>
                  <label htmlFor="supplier-payment-terms" className="font-bold text-slate-700 block mb-1">مدة السداد بالأيام</label>
                  <input id="supplier-payment-terms" type="number" min="0" value={formData.paymentTermsDays} onChange={(e) => setFormData({ ...formData, paymentTermsDays: Number(e.target.value) || 0 })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold" />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="supplier-address" className="font-bold text-slate-700 block mb-1">العنوان</label>
                  <input id="supplier-address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="supplier-notes" className="font-bold text-slate-700 block mb-1">ملاحظات</label>
                  <textarea id="supplier-notes" rows={2} value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" />
                </div>
              </div>

              {!editingSupplier && <div>
                <label htmlFor="supplier-initial-balance" className="font-bold text-slate-700 block mb-1">الرصيد الافتتاحي (المستحق للمورد موجب، ورصيدنا لديه سالب)</label>
                <input
                  id="supplier-initial-balance"
                  type="number"
                  step="0.01"
                  value={formData.initialBalance}
                  onChange={(e) => setFormData({ ...formData, initialBalance: Number.parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold"
                />
              </div>
              }

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 ">
                <button
                  type="button"
                  onClick={() => { setIsAddModalOpen(false); setEditingSupplier(null); }}
                  className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl shadow-lg shadow-sky-600/30"
                >
                  {editingSupplier ? 'حفظ التعديلات' : 'حفظ المورد'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {isPaymentModalOpen && selectedSupplier && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-sm w-full p-6 space-y-4">
            <h3 className="text-base font-extrabold text-slate-900">سند صرف / سداد دفعة للمورد</h3>
            <p className="text-xs text-slate-500">
              المورد: <strong className="text-slate-800">{selectedSupplier.name}</strong>
            </p>

            <form onSubmit={handleRecordPayment} className="space-y-3 text-xs">
              <div>
                <label htmlFor="supplier-payment-amount" className="font-bold text-slate-700 block mb-1">المبلغ المسدد (ج.م) *</label>
                <input
                  id="supplier-payment-amount"
                  type="number"
                  required
                  min="0.01"
                  step="0.01"
                  value={paymentData.amount}
                  onChange={(e) => setPaymentData({ ...paymentData, amount: Number.parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-black text-sm text-emerald-600"
                />
              </div>

              <div>
                <label htmlFor="supplier-payment-type" className="font-bold text-slate-700 block mb-1">طريقة السداد</label>
                <select
                  id="supplier-payment-type"
                  value={paymentData.paymentType}
                  onChange={(e) => setPaymentData({ ...paymentData, paymentType: e.target.value as PaymentType })}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold"
                >
                  <option value="CASH">نقدي كاش (من الخزينة)</option>
                  <option value="BANK_TRANSFER">تحويل بنكي / شيك</option>
                  <option value="CHEQUE">شيك</option>
                  <option value="CARD">بطاقة</option>
                </select>
              </div>

              <div>
                <label htmlFor="supplier-payment-notes" className="font-bold text-slate-700 block mb-1">البيان / الملاحظات</label>
                <input
                  id="supplier-payment-notes"
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
