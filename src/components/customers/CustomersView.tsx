import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { DataTable } from '../ui/DataTable';
import { Link } from 'react-router-dom';
import { 
  Users, Plus, Search, DollarSign, FileText, 
  Trash2
} from 'lucide-react';
import { CustomerService } from '../../services/domains/customers/CustomerService';
import { AuthService } from '../../services/domains/auth/AuthService';
import { Customer } from '../../types';
import { CeramicMath } from '../../utils/products/ceramicMath';
import { PageHeader } from '../ui/PageHeader';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { FilterToolbar } from '../ui/FilterToolbar';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { useBusinessProfileMeta, useBusinessTerm, useActivityPageCopy } from '../../hooks/domains/config/useBusinessTerm';
import { useIdempotencyKey } from '../../hooks/shared/useIdempotencyKey';
import { usePermission } from '../../hooks/domains/auth/usePermission';
import { ConfiguredActionButton } from '../config/ConfiguredActionButton';
import { OperationalFieldService, type OperationalFieldDefinition } from '../../services/domains/products/OperationalFieldService';
import { logger } from '../../utils/logger';
import { OperationalFieldsForm } from '../products/OperationalFieldsForm';
import { OperationalFieldsFilter, matchesOperationalFieldFilters, type OperationalFieldFilters } from '../products/OperationalFieldsFilter';
import { FinanceEnterpriseService } from '../../services/domains/finance/FinanceEnterpriseService';
import type { BankAccount } from '../../types/finance';
const CustomerPagination: React.FC<{ page: number; totalPages: number; totalItems: number; pageSize: number; onPageChange: (page: number) => void; onPageSizeChange: (size: number) => void }> = ({ page, totalPages, totalItems, pageSize, onPageChange, onPageSizeChange }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--win-border)] px-4 py-3 text-xs">
    <span className="text-[var(--cerami-muted)]">عرض {Math.min((page - 1) * pageSize + 1, totalItems)}–{Math.min(page * pageSize, totalItems)} من {totalItems}</span>
    <div className="flex items-center gap-2"><select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))} className="ui-input px-2 py-1 text-xs"><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select><button disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="erp-btn erp-btn--secondary erp-btn--sm">السابق</button><span className="min-w-[70px] text-center font-bold">{page} / {totalPages}</span><button disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} className="erp-btn erp-btn--secondary erp-btn--sm">التالي</button></div>
  </div>
);

export const CustomersView: React.FC = () => {
  const paymentIdempotency = useIdempotencyKey();
  const customersLabel = useBusinessTerm('entities.customers.plural');
  const customerSingularLabel = useBusinessTerm('entities.customers.singular');
  const { label: businessProfileLabel } = useBusinessProfileMeta();
  const pageCopy = useActivityPageCopy('customers');
  const can = usePermission();
  const canCreate = can('customers.create');
  const canUpdate = can('customers.update');
  const canCollect = can('customers.payment');
  const canDelete = can('customers.delete');
  const canViewPurchases = can('sales.view');
  const canViewDebts = can('finance.debts.view');
  const canViewStatement = canViewPurchases && canViewDebts;
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [operationalFields, setOperationalFields] = useState<OperationalFieldDefinition[]>([]);
  const [operationalFieldValues, setOperationalFieldValues] = useState<Record<string, string>>({});
  const [customerFieldValues, setCustomerFieldValues] = useState<Record<string, Record<string, string>>>({});
  const [customerFieldValuesById, setCustomerFieldValuesById] = useState<Record<string, Record<string, string>>>({});
  const [fieldFilters, setFieldFilters] = useState<OperationalFieldFilters>({});
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
    bankAccountId: '',
    notes: 'تحصيل دفعة نقدية'
  });

  const customerService = useMemo(() => new CustomerService(), []);
  const operationalFieldService = useMemo(() => new OperationalFieldService(), []);
  const financeEnterpriseService = useMemo(() => new FinanceEnterpriseService(), []);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const toast = useToast();

  useEffect(() => {
    try { setBankAccounts(financeEnterpriseService.getBankAccounts().filter((account) => account.isActive)); }
    catch { setBankAccounts([]); }
  }, [financeEnterpriseService]);

  const loadCustomers = useCallback(async () => {
    try {
      const result = await customerService.getCustomersPageAsync(search, page, pageSize, fieldFilters);
      setCustomers(result.items);
      setOperationalFields(operationalFieldService.getDefinitions('customers'));
      setCustomerFieldValues(operationalFieldService.getRecordValuesForExport(
        'customers', result.items.map((customer) => customer.id),
      ));
      setCustomerFieldValuesById(operationalFieldService.getRecordValuesForRecords(
        'customers', result.items.map((customer) => customer.id),
      ));
      setPage(result.page);
      setTotalPages(result.totalPages);
      setTotalItems(result.totalItems);
    } catch (e) {
      logger.error('فشل في تحميل العملاء:', e instanceof Error ? e : new Error(String(e)));
    }
  }, [search, page, pageSize, fieldFilters, customerService, operationalFieldService]);
  const handleDeleteCustomer = (customer: any) => {
    if (!window.confirm(`حذف العميل "${customer.name}"؟`)) return;
    try { customerService.deleteCustomer(customer.id); loadCustomers(); }
    catch (e: any) { toast.error('تعذر حذف العميل', e?.message); }
  };
  const handleToggleCustomerStatus = (customer: Customer) => {
    const isActivating = customer.isActive === 0;
    if (!window.confirm(`${isActivating ? 'تفعيل' : 'إيقاف'} العميل "${customer.name}"؟`)) return;
    try {
      const updatedCustomer = customerService.updateCustomer(customer.id, { isActive: isActivating ? 1 : 0 });
      setSelectedCustomer(updatedCustomer);
      loadCustomers();
    } catch (error: any) {
      toast.error('تعذر تحديث حالة العميل', error?.message);
    }
  };


  useEffect(() => {
    loadCustomers();
  }, [loadCustomers, search, page, pageSize, fieldFilters]);

  useEffect(() => { setPage(1); }, [search, fieldFilters]);

  const handleOpenStatement = (cust: Customer) => {
    if (!canViewStatement) return;
    setSelectedCustomer(cust);
    setOperationalFieldValues(operationalFieldService.getRecordValues('customers', cust.id));
    const stmt = customerService.getCustomerStatement(cust.id);
    setStatement(stmt);
  };

  const handleSaveCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      operationalFieldService.validateRecordValues('customers', operationalFieldValues, 'create');
      const customer = customerService.createCustomer({
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
      operationalFieldService.setRecordValues('customers', customer.id, operationalFieldValues, 'create');
      setIsAddModalOpen(false);
      setOperationalFieldValues({});
      loadCustomers();
    } catch (err: any) {
      toast.error('تعذر حفظ البيانات', err?.message || String(err));
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
        paymentData.notes,
        AuthService.getCurrentUser()?.id || 'usr_admin',
        undefined,
        paymentIdempotency.getKey(),
        paymentData.bankAccountId || undefined
      );
      paymentIdempotency.resetKey();
      setIsPaymentModalOpen(false);
      loadCustomers();
      if (canViewStatement) {
        handleOpenStatement(customerService.getCustomerById(selectedCustomer.id)!);
      } else {
        setSelectedCustomer(null);
        setStatement(null);
      }
      toast.success('تم تسجيل سند القبض', 'تم تحصيل الدفعة بنجاح.');
    } catch (err: any) {
      toast.error('تعذر تسجيل الدفعة', err?.message || String(err));
    }
  };

  return (
    <div className="erp-page">
      <PageHeader
        title={pageCopy?.title ? pageCopy.title : `إدارة ${customersLabel}`}
        description={pageCopy?.description || `متابعة مديونيات العملاء، تحصيل الدفعات، وكشوف الحساب التفصيلية · ${businessProfileLabel}`}
        icon={<Users className="h-5 w-5" />}
        actions={
          <ConfiguredActionButton
            actionId="customers.create"
            fallbackLabel={`إضافة ${customerSingularLabel} جديد`}
            icon={<Plus className="h-4 w-4" />}
            className="erp-btn erp-btn--primary"
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
              setOperationalFieldValues({});
              setIsAddModalOpen(true);
            }}
          />
        }
      />

      <FilterToolbar ariaLabel="بحث العملاء" className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--cerami-muted)]" />
          <label htmlFor="customer-search" className="sr-only">بحث بالاسم، رقم الهاتف، أو كود العميل</label>
          <input
            id="customer-search"
            type="text"
            placeholder="بحث بالاسم، رقم الهاتف، أو كود العميل..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ui-input w-full pe-9"
          />
        </div>
        <OperationalFieldsFilter fields={operationalFields} values={fieldFilters} onChange={setFieldFilters} />
      </FilterToolbar>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 ui-table-scroll">
          <DataTable
            ariaLabel="العملاء"
            rows={customers.filter((customer) => matchesOperationalFieldFilters(customer.id, customerFieldValuesById, fieldFilters))}
            rowKey={(c: any) => String(c.id)}
            onRowClick={canViewStatement ? (c: any) => handleOpenStatement(c) : undefined}
            rowClassName={(c: any) => {
              const isSelected = selectedCustomer?.id === c.id;
              return `${isSelected ? 'bg-[var(--win-accent-soft)]' : ''}`;
            }}
            columns={[
              { key: 'code', header: 'كود العميل', render: (c: any) => <span className="font-mono font-bold text-[var(--cerami-muted)]">{c.code}</span> },
              {
                key: 'name', header: 'الاسم والبيانات',
                render: (c: any) => (
                  <span>
                    <Link
                      to={`/customers/${encodeURIComponent(c.id)}`}
                      onClick={(event) => event.stopPropagation()}
                      className="font-bold hover:text-[var(--cerami-primary-readable)] hover:underline"
                      aria-label={`فتح ملف العميل ${c.name}`}
                    >
                      {c.name}
                    </Link>
                    {c.address && <span className="block text-[10px] text-[var(--cerami-muted)] font-normal">{c.address}</span>}
                    {Object.entries(customerFieldValues[c.id] || {}).map(([label, value]) => (
                      <span key={label} className="block text-[10px] font-normal text-[var(--cerami-text-secondary)]">{label}: {value}</span>
                    ))}
                  </span>
                ),
              },
              { key: 'phone', header: 'الهاتف', render: (c: any) => <span className="font-mono">{c.phone}</span> },
              {
                key: 'type', header: 'النوع',
                render: (c: any) => (
                  <span className="erp-badge">
                    {c.customerType === 'CONTRACTOR' ? 'مقاول / مهندس' : 'قطاعي / أفراد'}
                  </span>
                ),
              },
              {
                key: 'status', header: 'الحالة',
                render: (c: any) => (
                  <span className={`erp-badge ${c.isActive === 0 ? '' : 'erp-badge--success'}`}>
                    {c.isActive === 0 ? 'موقوف' : 'نشط'}
                  </span>
                ),
              },
              ...(canViewPurchases ? [{
                key: 'purchases', header: 'إجمالي المشتريات',
                render: (c: any) => <span className="font-bold">{CeramicMath.formatCurrency(c.totalPurchases)}</span>,
              }] : []),
              ...(canViewDebts ? [{
                key: 'balance', header: 'الرصيد المستحق',
                render: (c: any) => {
                  const hasDebt = c.currentBalance > 0;
                  return <span className={`font-black text-sm ${hasDebt ? 'text-[var(--cerami-warning)]' : 'text-[var(--cerami-success)]'}`}>{CeramicMath.formatCurrency(c.currentBalance)}</span>;
                },
              }] : []),
              ...(canViewStatement ? [{
                key: 'statement', header: 'كشف الحساب', align: 'center' as const,
                render: (c: any) => (
                  <Button
                    variant="secondary"
                    size="sm"
                    iconOnly
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenStatement(c);
                    }}
                    aria-label="فتح كشف الحساب"
                  >
                    <FileText className="h-4 w-4" />
                  </Button>
                ),
              }] : []),
            ]}
          />
          {totalItems > 0 && <CustomerPagination page={page} totalPages={totalPages} totalItems={totalItems} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />}
        </div>

        <Card className="flex flex-col justify-between">
          {selectedCustomer && statement ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--win-border)] pb-3">
                <div>
                  <h3 className="font-extrabold text-sm">{selectedCustomer.name}</h3>
                  <p className="text-[11px] font-mono text-[var(--cerami-muted)]">{selectedCustomer.phone}</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {canCollect && <Button
                    variant="success"
                    size="sm"
                    leadingIcon={<DollarSign className="h-4 w-4" />}
                    onClick={() => setIsPaymentModalOpen(true)}
                  >
                    سند قبض / تحصيل
                  </Button>}
                  {canUpdate && selectedCustomer && <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleToggleCustomerStatus(selectedCustomer)}
                  >
                    {selectedCustomer.isActive === 0 ? 'تفعيل العميل' : 'إيقاف العميل'}
                  </Button>}
                  {canDelete && selectedCustomer && (
                    <Button
                      variant="danger"
                      size="sm"
                      leadingIcon={<Trash2 className="h-4 w-4" />}
                      onClick={() => handleDeleteCustomer(selectedCustomer)}
                    >
                      حذف
                    </Button>
                  )}
                </div>
              </div>

              <div className="rounded-[var(--ui-radius-sm)] bg-[var(--cerami-surface-muted)] p-3 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-[var(--cerami-muted)]">الرصيد الحالي المستحق:</span>
                  <span className="font-black text-sm text-[var(--cerami-warning)]">
                    {CeramicMath.formatCurrency(selectedCustomer.currentBalance)}
                  </span>
                </div>
                <OperationalFieldsForm
                  fields={operationalFields}
                  values={operationalFieldValues}
                  onChange={() => undefined}
                  title="الحقول الإضافية"
                  readOnly
                />
                <div className="flex justify-between">
                  <span className="text-[var(--cerami-muted)]">الحد الائتماني المسموح:</span>
                  <span className="font-bold">{CeramicMath.formatCurrency(selectedCustomer.creditLimit)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-bold text-[var(--cerami-muted)]">سجل حركات كشف الحساب:</div>
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
                          <span className={tx.debit > 0 ? 'text-[var(--cerami-danger)] font-bold' : 'text-[var(--cerami-success)] font-bold'}>
                            {tx.debit > 0 ? `+${CeramicMath.formatCurrency(tx.debit)} (مدين)` : `-${CeramicMath.formatCurrency(tx.credit)} (سداد)`}
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
              <Users className="h-12 w-12 mb-2 opacity-30" />
              <p className="text-xs font-bold">اختر عميلاً لعرض كشف حسابه</p>
            </div>
          )}
        </Card>
      </div>

      <Modal
        open={isAddModalOpen && canCreate}
        onClose={() => setIsAddModalOpen(false)}
        title={`إضافة ${customerSingularLabel} جديد`}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsAddModalOpen(false)}>إلغاء</Button>
            <Button variant="primary" type="submit" form="customer-form">حفظ العميل</Button>
          </>
        }
      >
        <form id="customer-form" onSubmit={handleSaveCustomer} className="space-y-3 text-xs">
          <div>
            <label htmlFor="customer-name" className="font-bold block mb-1">اسم {customerSingularLabel} *</label>
            <input
              id="customer-name"
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="ui-input w-full font-bold"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label htmlFor="customer-phone" className="font-bold block mb-1">رقم الهاتف *</label>
              <input
                id="customer-phone"
                type="tel"
                required
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="ui-input w-full font-mono font-bold"
              />
            </div>
            <div>
              <label htmlFor="customer-type" className="font-bold block mb-1">نوع العميل</label>
              <select
                id="customer-type"
                value={formData.customerType}
                onChange={(e) => setFormData({ ...formData, customerType: e.target.value })}
                className="ui-input w-full font-bold"
              >
                <option value="RETAIL">أفراد / قطاعي</option>
                <option value="CONTRACTOR">مقاول / مهندس ديكور</option>
                <option value="WHOLESALE">تاجر جملة</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label htmlFor="customer-credit-limit" className="font-bold block mb-1">الحد الائتماني (ج.م)</label>
              <input
                id="customer-credit-limit"
                type="number"
                value={formData.creditLimit}
                onChange={(e) => setFormData({ ...formData, creditLimit: Number.parseFloat(e.target.value) || 0 })}
                className="ui-input w-full font-bold"
              />
            </div>
            <div>
              <label htmlFor="customer-payment-terms" className="font-bold block mb-1">أجل السداد (أيام)</label>
              <input id="customer-payment-terms" type="number" min="0" value={formData.paymentTermsDays} onChange={(e) => setFormData({ ...formData, paymentTermsDays: Number.parseInt(e.target.value, 10) || 0 })} className="ui-input w-full font-bold" />
            </div>
            <div>
              <label htmlFor="customer-initial-balance" className="font-bold block mb-1">رصيد افتتاحي (إن وجد)</label>
              <input
                id="customer-initial-balance"
                type="number"
                value={formData.initialBalance}
                onChange={(e) => setFormData({ ...formData, initialBalance: Number.parseFloat(e.target.value) || 0 })}
                className="ui-input w-full font-bold"
              />
            </div>
          </div>

          <div>
            <label htmlFor="customer-address" className="font-bold block mb-1">العنوان</label>
            <input
              id="customer-address"
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="ui-input w-full"
            />
          </div>
          <OperationalFieldsForm
            fields={operationalFields}
            values={operationalFieldValues}
            onChange={setOperationalFieldValues}
            title="بيانات إضافية"
          />
        </form>
      </Modal>

      <Modal
        open={isPaymentModalOpen && selectedCustomer !== null && canCollect}
        onClose={() => setIsPaymentModalOpen(false)}
        title="سند قبض / تحصيل دفعة"
        description={selectedCustomer ? `العميل: ${selectedCustomer.name}` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsPaymentModalOpen(false)}>إلغاء</Button>
            <Button variant="primary" type="submit" form="payment-form">اعتماد السند</Button>
          </>
        }
      >
        <form id="payment-form" onSubmit={handleRecordPayment} className="space-y-3 text-xs">
          <div>
            <label htmlFor="customer-payment-amount" className="font-bold block mb-1">المبلغ المحصل (ج.م) *</label>
            <input
              id="customer-payment-amount"
              type="number"
              required
              value={paymentData.amount}
              onChange={(e) => setPaymentData({ ...paymentData, amount: Number.parseFloat(e.target.value) || 0 })}
              className="ui-input w-full font-black text-sm text-[var(--cerami-success)]"
            />
          </div>

          <div>
            <label htmlFor="customer-payment-type" className="font-bold block mb-1">طريقة السداد</label>
            <select
              id="customer-payment-type"
              value={paymentData.paymentType}
              onChange={(e) => setPaymentData({ ...paymentData, paymentType: e.target.value })}
              className="ui-input w-full font-bold"
            >
              <option value="CASH">نقدي كاش (الخزينة)</option>
              <option value="CARD">بطاقة بنكية / فيزا</option>
              <option value="BANK_TRANSFER">تحويل بنكي / محفظة</option>
            </select>
          </div>

          {paymentData.paymentType === 'BANK_TRANSFER' && (
            <div>
              <label htmlFor="customer-payment-bank" className="font-bold block mb-1">الحساب البنكي المستلم *</label>
              <select id="customer-payment-bank" required value={paymentData.bankAccountId} onChange={(e) => setPaymentData({ ...paymentData, bankAccountId: e.target.value })} className="ui-input w-full font-bold">
                <option value="">اختر الحساب البنكي</option>
                {bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.accountName} — {account.bankName}</option>)}
              </select>
              {bankAccounts.length === 0 && <p className="mt-1 text-[var(--cerami-danger)]">لا توجد حسابات بنكية متاحة بصلاحياتك.</p>}
            </div>
          )}

          <div>
            <label htmlFor="customer-payment-notes" className="font-bold block mb-1">البيان / الملاحظات</label>
            <input
              id="customer-payment-notes"
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
