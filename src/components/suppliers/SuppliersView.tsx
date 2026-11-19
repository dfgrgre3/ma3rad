import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { DataTable } from '../ui/DataTable';
import { useIdempotencyKey } from '../../hooks/shared/useIdempotencyKey';
import { 
  Plus, Search, DollarSign, FileText, Download, Printer,
  Building2, Pencil, Power,
  CalendarDays, Upload, ExternalLink
} from 'lucide-react';
import { SupplierService } from '../../services/domains/suppliers/SupplierService';
import { Supplier, PaymentType } from '../../types';
import { CeramicMath } from '../../utils/products/ceramicMath';
import { AuthService } from '../../services/domains/auth/AuthService';
import { PermissionService } from '../../services/domains/auth/PermissionService';
import { PageHeader } from '../ui/PageHeader';
import { Button } from '../ui/Button';
import { Card, StatCard } from '../ui/Card';
import { FilterToolbar } from '../ui/FilterToolbar';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { useBusinessProfileMeta, useBusinessTerm } from '../../hooks/domains/config/useBusinessTerm';
import { Link } from 'react-router-dom';
import { OperationalFieldService, type OperationalFieldDefinition } from '../../services/domains/products/OperationalFieldService';
import { OperationalFieldsForm } from '../products/OperationalFieldsForm';
import { OperationalFieldsFilter, matchesOperationalFieldFilters, type OperationalFieldFilters } from '../products/OperationalFieldsFilter';

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
  const paymentIdempotency = useIdempotencyKey();
  const suppliersLabel = useBusinessTerm('entities.suppliers.plural');
  const supplierSingularLabel = useBusinessTerm('entities.suppliers.singular');
  const { label: businessProfileLabel } = useBusinessProfileMeta();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [operationalFields, setOperationalFields] = useState<OperationalFieldDefinition[]>([]);
  const [operationalFieldValues, setOperationalFieldValues] = useState<Record<string, string>>({});
  const [supplierFieldValues, setSupplierFieldValues] = useState<Record<string, Record<string, string>>>({});
  const [supplierFieldValuesById, setSupplierFieldValuesById] = useState<Record<string, Record<string, string>>>({});
  const [fieldFilters, setFieldFilters] = useState<OperationalFieldFilters>({});
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

  const supplierService = useMemo(() => new SupplierService(), []);
  const operationalFieldService = useMemo(() => new OperationalFieldService(), []);
  const currentUser = AuthService.getCurrentUser();
  const canCreate = PermissionService.can(currentUser, 'ui.suppliers.suppliers.create');
  const canUpdate = PermissionService.can(currentUser, 'ui.suppliers.suppliers.update');
  const canDelete = PermissionService.can(currentUser, 'ui.suppliers.suppliers.delete');
  const canPay = PermissionService.can(currentUser, 'ui.suppliers.suppliers.payment');
  const canExport = PermissionService.can(currentUser, 'ui.suppliers.suppliers.export');
  const canViewPurchases = PermissionService.can(currentUser, 'ui.purchases.invoices.view');
  const canViewFinancials = PermissionService.can(currentUser, 'ui.finance.receivables.view');
  const canApproveFinancials = PermissionService.can(currentUser, 'ui.finance.receivables.approve');
  const canImport = PermissionService.can(currentUser, 'ui.settings.hub.view');
  const toast = useToast();

  const loadSuppliers = useCallback(async () => {
    try {
      const data = await supplierService.getAllSuppliersAsync(search, showInactive);
      setSuppliers(data);
      setOperationalFields(operationalFieldService.getDefinitions('suppliers'));
      setSupplierFieldValues(operationalFieldService.getRecordValuesForExport(
        'suppliers', data.map((supplier) => supplier.id),
      ));
      setSupplierFieldValuesById(operationalFieldService.getRecordValuesForRecords(
        'suppliers', data.map((supplier) => supplier.id),
      ));
    } catch (e) {
      console.error(e);
    }
  }, [search, showInactive, supplierService, operationalFieldService]);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  useEffect(() => {
    if (!selectedSupplier) return;
    let cancelled = false;
    (async () => {
      try {
        const current = await supplierService.getSupplierByIdAsync(selectedSupplier.id);
        if (!current || cancelled) return;
        setSelectedSupplier(current);
        setStatement(canViewFinancials ? supplierService.getSupplierStatement(current.id, statementFrom, statementTo) : null);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedSupplier, statementFrom, statementTo, canViewFinancials, supplierService]);

  const handleOpenStatement = (sup: Supplier) => {
    setSelectedSupplier(sup);
    setOperationalFieldValues(operationalFieldService.getRecordValues('suppliers', sup.id));
    setStatement(canViewFinancials ? supplierService.getSupplierStatement(sup.id, statementFrom, statementTo) : null);
  };

  const handleSaveSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      operationalFieldService.validateRecordValues('suppliers', operationalFieldValues, editingSupplier ? 'update' : 'create', editingSupplier?.id);
      if (editingSupplier) {
        const updated = supplierService.updateSupplier(editingSupplier.id, formData);
        operationalFieldService.setRecordValues('suppliers', updated.id, operationalFieldValues, 'update');
        setSelectedSupplier(updated);
        if (canViewFinancials) setStatement(supplierService.getSupplierStatement(updated.id, statementFrom, statementTo));
      } else {
        const created = supplierService.createSupplier({
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
        operationalFieldService.setRecordValues('suppliers', created.id, operationalFieldValues, 'create');
      }
      setIsAddModalOpen(false);
      setEditingSupplier(null);
      setOperationalFieldValues({});
      loadSuppliers();
      toast.success(editingSupplier ? 'تم حفظ تعديلات المورد' : 'تم حفظ المورد بنجاح');
    } catch (err: any) {
      toast.error('تعذر حفظ المورد', err?.message || String(err));
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
        paymentData.notes,
        paymentIdempotency.getKey()
      );
      paymentIdempotency.resetKey();
      setIsPaymentModalOpen(false);
      loadSuppliers();
      const updatedSupplier = supplierService.getSupplierById(selectedSupplier.id)!;
      if (canViewFinancials) handleOpenStatement(updatedSupplier);
      else setSelectedSupplier(updatedSupplier);
      toast.success('تم تسجيل سند الصرف وسداد دفعة المورد بنجاح.');
    } catch (err: any) {
      toast.error('تعذر تسجيل الدفعة', err?.message || String(err));
    }
  };

  const openEditSupplier = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setOperationalFieldValues(operationalFieldService.getRecordValues('suppliers', supplier.id));
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
    if (!canDelete || !canUpdate) return;
    try {
      const updated = supplierService.updateSupplier(supplier.id, { isActive: supplier.isActive === 0 ? 1 : 0 });
      if (selectedSupplier?.id === supplier.id) {
        setSelectedSupplier(updated);
        if (canViewFinancials) setStatement(supplierService.getSupplierStatement(updated.id, statementFrom, statementTo));
      }
      loadSuppliers();
      toast.success(updated.isActive === 0 ? 'تم تعطيل المورد' : 'تمت إعادة تفعيل المورد');
    } catch (err: any) {
      toast.error('تعذر تحديث حالة المورد', err?.message || String(err));
    }
  };

  const exportSuppliers = () => {
    if (!canExport) return;
    const headers = ['الكود', 'اسم المورد', 'الشركة', 'الهاتف', 'البريد الإلكتروني', 'الرقم الضريبي', 'السجل التجاري', 'العنوان'];
    if (canViewPurchases) headers.push('إجمالي المشتريات');
    if (canViewFinancials) headers.push('الرصيد');
    headers.push('مدة السداد', 'الحالة', 'ملاحظات');
    headers.push(...operationalFields.map((field) => field.name));
    downloadCsv('suppliers.csv', [
      headers,
      ...suppliers.map((supplier) => {
        const extraValues = supplierFieldValues[supplier.id] || {};
        const row: unknown[] = [
          supplier.code, supplier.name, supplier.companyName, supplier.phone, supplier.email,
          supplier.taxNumber, supplier.commercialRecord, supplier.address,
        ];
        if (canViewPurchases) row.push(supplier.totalPurchases);
        if (canViewFinancials) row.push(supplier.currentBalance);
        row.push(supplier.paymentTermsDays, supplier.isActive === 0 ? 'غير نشط' : 'نشط', supplier.notes);
        operationalFields.forEach((field) => row.push(extraValues[field.name] || ''));
        return row;
      }),
    ]);
  };

  const exportStatement = () => {
    if (!canExport || !canViewFinancials || !statement || !selectedSupplier) return;
    downloadCsv(`supplier-${selectedSupplier.code}-statement.csv`, [
      ['التاريخ', 'النوع', 'رقم المستند', 'البيان', 'مدين', 'دائن', 'الرصيد بعد الحركة'],
      ...statement.transactions.map((tx: any) => [
        tx.date, tx.type === 'PURCHASE' ? 'فاتورة شراء' : 'سداد',
        tx.docNumber, tx.description, tx.debit, tx.credit, tx.balanceAfter
      ])
    ]);
  };

  return (
    <div className="erp-page">
      <PageHeader
        title={`إدارة ${suppliersLabel}`}
        description={`متابعة حسابات المصانع، سداد الدفعات، وكشوف الحساب التفصيلية · ${businessProfileLabel}`}
        icon={<Building2 className="h-5 w-5" />}
        actions={
          <>
            {canExport && <Button variant="secondary" size="sm" leadingIcon={<Download className="h-4 w-4" />} onClick={exportSuppliers}>تصدير CSV</Button>}
            {canImport && <Link to="/data-import" className="erp-btn erp-btn--secondary erp-btn--sm"><Upload className="h-4 w-4" /><span>استيراد الموردين</span></Link>}
            {canCreate && <Button
              variant="primary"
              leadingIcon={<Plus className="h-4 w-4" />}
              onClick={() => {
                setEditingSupplier(null);
                setOperationalFieldValues({});
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
            >
              إضافة {supplierSingularLabel} جديد
            </Button>}
          </>
        }
      />

      <div className="erp-stat-grid">
        {[
          { label: 'الموردون المعروضون', value: suppliers.length, icon: Building2, tone: 'default' as const },
          { label: 'إجمالي المشتريات', value: CeramicMath.formatCurrency(suppliers.reduce((sum, supplier) => sum + Number(supplier.totalPurchases || 0), 0)), icon: DollarSign, tone: 'default' as const },
          { label: 'مستحقات الموردين', value: CeramicMath.formatCurrency(suppliers.reduce((sum, supplier) => sum + Math.max(Number(supplier.currentBalance || 0), 0), 0)), icon: DollarSign, tone: 'danger' as const },
          { label: 'رصيد لنا لدى الموردين', value: CeramicMath.formatCurrency(suppliers.reduce((sum, supplier) => sum + Math.max(-Number(supplier.currentBalance || 0), 0), 0)), icon: DollarSign, tone: 'success' as const }
        ].filter((card) => card.label === 'الموردون المعروضون' || (card.label === 'إجمالي المشتريات' ? canViewPurchases : canViewFinancials)).map((card) => (
          <StatCard key={card.label} label={card.label} value={card.value} icon={<card.icon className="h-4 w-4" />} tone={card.tone} />
        ))}
      </div>

      <FilterToolbar ariaLabel="بحث الموردين" className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--cerami-muted)]" />
          <input
            type="text"
            aria-label="بحث بالاسم، المصنع، الهاتف"
            placeholder="بحث بالاسم، المصنع، الهاتف..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ui-input w-full pe-9"
          />
        </div>
        <label className="flex items-center gap-2 text-xs font-bold whitespace-nowrap">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          إظهار الموردين غير النشطين
        </label>
        <OperationalFieldsFilter fields={operationalFields} values={fieldFilters} onChange={setFieldFilters} />
      </FilterToolbar>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={`${canViewFinancials ? 'lg:col-span-2' : 'lg:col-span-3'} ui-table-scroll`}>
          <DataTable
            ariaLabel="الموردون"
            rows={suppliers.filter((supplier) => matchesOperationalFieldFilters(supplier.id, supplierFieldValuesById, fieldFilters))}
            rowKey={(s: any) => String(s.id)}
            onRowClick={canViewFinancials ? (s: any) => handleOpenStatement(s) : undefined}
            rowClassName={(s: any) => (selectedSupplier?.id === s.id ? 'bg-[var(--win-accent-soft)]' : '')}
            columns={[
              { key: 'code', header: 'كود المورد', render: (s: any) => <span className="font-mono font-bold text-[var(--cerami-muted)]">{s.code}</span> },
              {
                key: 'name', header: 'اسم المورد / الشركة',
                render: (s: any) => (
                  <span>
                    <span className="flex items-center gap-2 font-bold">
                      <span>{s.name}</span>
                      {s.isActive === 0 && <span className="erp-badge">غير نشط</span>}
                    </span>
                    {s.companyName && <span className="block text-[10px] text-[var(--cerami-muted)] font-normal">{s.companyName}</span>}
                    {Object.entries(supplierFieldValues[s.id] || {}).map(([label, value]) => (
                      <span key={label} className="block text-[10px] font-normal text-[var(--cerami-text-secondary)]">{label}: {value}</span>
                    ))}
                  </span>
                ),
              },
              { key: 'phone', header: 'الهاتف', render: (s: any) => <span className="font-mono">{s.phone}</span> },
              ...(canViewPurchases ? [{
                key: 'purchases', header: 'إجمالي المشتريات',
                render: (s: any) => <span className="font-bold">{CeramicMath.formatCurrency(s.totalPurchases)}</span>,
              }] : []),
              ...(canViewFinancials ? [{
                key: 'balance', header: 'الرصيد المستحق للمورد',
                render: (s: any) => <span className="font-black text-sm text-[var(--cerami-danger)]">{CeramicMath.formatCurrency(s.currentBalance)}</span>,
              }] : []),
              {
                key: 'actions', header: 'إجراءات', align: 'center' as const,
                render: (s: any) => (
                  <div className="flex justify-center gap-1">
                    {canUpdate && <Button
                      variant="secondary"
                      size="sm"
                      iconOnly
                      title="تعديل بيانات المورد"
                      aria-label="تعديل بيانات المورد"
                      onClick={(e) => { e.stopPropagation(); openEditSupplier(s); }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>}
                    {canDelete && canUpdate && <Button
                      variant={s.isActive === 0 ? 'success' : 'secondary'}
                      size="sm"
                      iconOnly
                      title={s.isActive === 0 ? 'إعادة تفعيل المورد' : 'تعطيل المورد'}
                      aria-label={s.isActive === 0 ? 'إعادة تفعيل المورد' : 'تعطيل المورد'}
                      onClick={(e) => { e.stopPropagation(); toggleSupplierStatus(s); }}
                    >
                      <Power className="h-4 w-4" />
                    </Button>}
                    {canViewFinancials && <Button
                      variant="secondary"
                      size="sm"
                      iconOnly
                      title="عرض كشف الحساب السريع"
                      aria-label="عرض كشف الحساب"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenStatement(s);
                      }}
                    >
                      <FileText className="h-4 w-4" />
                    </Button>}
                    <Link
                      to={`/suppliers/${s.id}`}
                      onClick={(e) => e.stopPropagation()}
                      title="عرض ملف المورد الكامل"
                      aria-label="عرض ملف المورد الكامل"
                      className="erp-btn erp-btn--secondary erp-btn--sm erp-btn--icon"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </div>
                ),
              },
            ]}
            emptyTitle="لا يوجد موردون مطابقون لبحثك."
          />
        </div>

        {canViewFinancials && <Card className="supplier-statement-print-area flex flex-col justify-between">
          {selectedSupplier && statement ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 border-b border-[var(--win-border)] pb-3">
                <div>
                  <h3 className="font-extrabold text-sm">{selectedSupplier.name}</h3>
                  <p className="text-[11px] font-mono text-[var(--cerami-muted)]">{selectedSupplier.phone}</p>
                </div>
                <div className="flex items-center gap-1 no-print">
                  <Link
                    to={`/suppliers/${selectedSupplier.id}`}
                    className="erp-btn erp-btn--secondary erp-btn--sm"
                    title="فتح ملف المورد الكامل"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>الملف الكامل</span>
                  </Link>
                  {canUpdate && <Button
                    variant="secondary"
                    size="sm"
                    iconOnly
                    title="تعديل بيانات المورد"
                    aria-label="تعديل بيانات المورد"
                    onClick={() => openEditSupplier(selectedSupplier)}
                  ><Pencil className="h-4 w-4" /></Button>}
                  {canPay && <Button
                    variant="success"
                    size="sm"
                    leadingIcon={<DollarSign className="h-4 w-4" />}
                    onClick={() => setIsPaymentModalOpen(true)}
                  >
                    سند صرف دفعة
                  </Button>}
                </div>
              </div>
              <OperationalFieldsForm
                fields={operationalFields}
                values={operationalFieldValues}
                onChange={() => undefined}
                title="الحقول الإضافية"
                readOnly
              />

              <div className="rounded-[var(--ui-radius-sm)] bg-[var(--cerami-surface-muted)] p-3 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-[var(--cerami-muted)]">رصيد أول المدة:</span>
                  <span className="font-bold">{CeramicMath.formatCurrency(statement.openingBalance)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--cerami-muted)]">الرصيد المستحق للمورد (دائن):</span>
                  <span className="font-black text-sm text-[var(--cerami-danger)]">
                    {CeramicMath.formatCurrency(statement.closingBalance)}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div className="text-xs font-bold text-[var(--cerami-muted)]">سجل حركات كشف الحساب:</div>
                  <div className="flex gap-1 no-print">
                    {canExport && <Button variant="secondary" size="sm" iconOnly title="تصدير كشف الحساب" aria-label="تصدير كشف الحساب" onClick={exportStatement}><Download className="h-4 w-4" /></Button>}
                    {canExport && <Button variant="secondary" size="sm" iconOnly title="طباعة كشف الحساب" aria-label="طباعة كشف الحساب" onClick={() => window.print()}><Printer className="h-4 w-4" /></Button>}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 no-print">
                  <label className="text-[10px] font-bold text-[var(--cerami-muted)]">
                    من تاريخ
                    <span className="relative mt-1 block">
                      <CalendarDays className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--cerami-muted)]" />
                      <input type="date" value={statementFrom} onChange={(e) => setStatementFrom(e.target.value)} className="ui-input w-full pe-7 text-[10px]" />
                    </span>
                  </label>
                  <label className="text-[10px] font-bold text-[var(--cerami-muted)]">
                    إلى تاريخ
                    <span className="relative mt-1 block">
                      <CalendarDays className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--cerami-muted)]" />
                      <input type="date" value={statementTo} onChange={(e) => setStatementTo(e.target.value)} className="ui-input w-full pe-7 text-[10px]" />
                    </span>
                  </label>
                </div>
                {statementFrom && statementTo && statementFrom > statementTo && <div className="text-[10px] font-bold text-[var(--cerami-danger)]">تاريخ البداية يجب ألا يتجاوز تاريخ النهاية.</div>}
                <div className="max-h-80 overflow-y-auto space-y-2 pe-1">
                  {statement.transactions.length === 0 ? (
                    <div className="text-center py-6 text-xs text-[var(--cerami-muted)]">لا توجد حركات مسجلة</div>
                  ) : (
                    statement.transactions.map((tx: any) => (
                      <div key={tx.id} className="p-2.5 rounded-[var(--ui-radius-sm)] border border-[var(--win-border)] bg-[var(--cerami-surface-muted)] text-[11px] space-y-1">
                        <div className="flex justify-between font-bold">
                          <span>{tx.description}</span>
                          <span className="font-mono text-[var(--cerami-muted)]">{tx.date}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className={tx.credit > 0 ? 'text-[var(--cerami-danger)] font-bold' : 'text-[var(--cerami-success)] font-bold'}>
                            {tx.credit > 0 ? `+${CeramicMath.formatCurrency(tx.credit)} (فاتورة توريد)` : `-${CeramicMath.formatCurrency(tx.debit)} (سداد دفعة)`}
                          </span>
                          <span className="text-[10px] text-[var(--cerami-muted)]">
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
            <div className="h-full flex flex-col items-center justify-center text-center text-[var(--cerami-muted)] py-12">
              <Building2 className="h-12 w-12 mb-2 opacity-30" />
              <p className="text-xs font-bold">اختر مورداً لعرض كشف حسابه</p>
            </div>
          )}
        </Card>}
      </div>

      <Modal
        open={isAddModalOpen && (editingSupplier ? canUpdate : canCreate)}
        onClose={() => { setIsAddModalOpen(false); setEditingSupplier(null); }}
        title={editingSupplier ? `تعديل بيانات ${supplierSingularLabel}` : `إضافة ${supplierSingularLabel} جديد`}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setIsAddModalOpen(false); setEditingSupplier(null); }}>إلغاء</Button>
            <Button variant="primary" type="submit" form="supplier-form">{editingSupplier ? 'حفظ التعديلات' : 'حفظ المورد'}</Button>
          </>
        }
      >
        <form id="supplier-form" onSubmit={handleSaveSupplier} className="space-y-3 text-xs">
          <div>
            <label htmlFor="supplier-name" className="font-bold block mb-1">اسم {supplierSingularLabel} / المسؤول *</label>
            <input
              id="supplier-name"
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="ui-input w-full font-bold"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label htmlFor="supplier-company" className="font-bold block mb-1">اسم المصنع / الشركة</label>
              <input
                id="supplier-company"
                type="text"
                value={formData.companyName}
                onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                className="ui-input w-full"
              />
            </div>
            <div>
              <label htmlFor="supplier-phone" className="font-bold block mb-1">رقم الهاتف *</label>
              <input
                id="supplier-phone"
                type="tel"
                required
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="ui-input w-full font-mono font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label htmlFor="supplier-email" className="font-bold block mb-1">البريد الإلكتروني</label>
              <input id="supplier-email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="ui-input w-full" />
            </div>
            <div>
              <label htmlFor="supplier-tax-number" className="font-bold block mb-1">الرقم الضريبي</label>
              <input id="supplier-tax-number" value={formData.taxNumber} onChange={(e) => setFormData({ ...formData, taxNumber: e.target.value })} className="ui-input w-full" />
            </div>
            <div>
              <label htmlFor="supplier-commercial-record" className="font-bold block mb-1">السجل التجاري</label>
              <input id="supplier-commercial-record" value={formData.commercialRecord} onChange={(e) => setFormData({ ...formData, commercialRecord: e.target.value })} className="ui-input w-full" />
            </div>
            <div>
              <label htmlFor="supplier-payment-terms" className="font-bold block mb-1">مدة السداد بالأيام</label>
              <input id="supplier-payment-terms" type="number" min="0" value={formData.paymentTermsDays} onChange={(e) => setFormData({ ...formData, paymentTermsDays: Number(e.target.value) || 0 })} className="ui-input w-full font-bold" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="supplier-address" className="font-bold block mb-1">العنوان</label>
              <input id="supplier-address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className="ui-input w-full" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="supplier-notes" className="font-bold block mb-1">ملاحظات</label>
              <textarea id="supplier-notes" rows={2} value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="ui-input w-full" />
            </div>
          </div>

          {!editingSupplier && canApproveFinancials && <div>
            <label htmlFor="supplier-initial-balance" className="font-bold block mb-1">الرصيد الافتتاحي (المستحق للمورد موجب، ورصيدنا لديه سالب)</label>
            <input
              id="supplier-initial-balance"
              type="number"
              step="0.01"
              value={formData.initialBalance}
              onChange={(e) => setFormData({ ...formData, initialBalance: Number.parseFloat(e.target.value) || 0 })}
              className="ui-input w-full font-bold"
            />
          </div>
          }
          <OperationalFieldsForm
            fields={operationalFields}
            values={operationalFieldValues}
            onChange={setOperationalFieldValues}
            title="بيانات إضافية"
          />
        </form>
      </Modal>

      <Modal
        open={isPaymentModalOpen && selectedSupplier !== null && canPay}
        onClose={() => setIsPaymentModalOpen(false)}
        title="سند صرف / سداد دفعة للمورد"
        description={selectedSupplier ? `المورد: ${selectedSupplier.name}` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsPaymentModalOpen(false)}>إلغاء</Button>
            <Button variant="primary" type="submit" form="supplier-payment-form">اعتماد سند الصرف</Button>
          </>
        }
      >
        <form id="supplier-payment-form" onSubmit={handleRecordPayment} className="space-y-3 text-xs">
          <div>
            <label htmlFor="supplier-payment-amount" className="font-bold block mb-1">المبلغ المسدد (ج.م) *</label>
            <input
              id="supplier-payment-amount"
              type="number"
              required
              min="0.01"
              step="0.01"
              value={paymentData.amount}
              onChange={(e) => setPaymentData({ ...paymentData, amount: Number.parseFloat(e.target.value) || 0 })}
              className="ui-input w-full font-black text-sm text-[var(--cerami-success)]"
            />
          </div>

          <div>
            <label htmlFor="supplier-payment-type" className="font-bold block mb-1">طريقة السداد</label>
            <select
              id="supplier-payment-type"
              value={paymentData.paymentType}
              onChange={(e) => setPaymentData({ ...paymentData, paymentType: e.target.value as PaymentType })}
              className="ui-input w-full font-bold"
            >
              <option value="CASH">نقدي كاش (من الخزينة)</option>
              <option value="BANK_TRANSFER">تحويل بنكي / شيك</option>
              <option value="CHEQUE">شيك</option>
              <option value="CARD">بطاقة</option>
            </select>
          </div>

          <div>
            <label htmlFor="supplier-payment-notes" className="font-bold block mb-1">البيان / الملاحظات</label>
            <input
              id="supplier-payment-notes"
              type="text"
              value={paymentData.notes}
              onChange={(e) => setPaymentData({ ...paymentData, notes: e.target.value })}
              className="ui-input w-full"
            />
          </div>
        </form>
      </Modal>
    </div>
  );
};
