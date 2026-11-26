import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useDashboardRefresh } from "../../../contexts/DashboardRefreshContext";
import { useDashboardEmbed } from "../../../contexts/DashboardEmbedContext";
import { Banknote, Loader2 } from "lucide-react";
import { DatabaseManager } from "../../../database/repositories/databaseManager";
import { DebtService, DebtRow } from "../../../services/domains/finance/DebtService";
import { CustomerService } from "../../../services/domains/customers/CustomerService";
import { SupplierService } from "../../../services/domains/suppliers/SupplierService";
import { CashierService } from "../../../services/domains/finance/CashierService";
import { AuthService } from "../../../services/domains/auth/AuthService";
import { PageHeader } from "../../../components/ui/PageHeader";
import { localDateString } from "../../../utils/shared/date";
import { PermissionService } from "../../../services/domains/auth/PermissionService";
import { SalesService } from "../../../services/domains/sales/SalesService";
import { useNavigate } from "react-router-dom";
import { exportToExcel, exportToPdf } from "../../../utils/export/export";
import { v4 as uuidv4 } from "uuid";
import { BranchAccessService } from "../../../services/domains/auth/BranchAccessService";

import { useToast } from '../../../components/ui/Toast';
import { DebtSummaryCards } from "./DebtsDashboardPage/DebtSummaryCards";
import { MetricCards } from "./DebtsDashboardPage/MetricCards";
import { SearchToolbar } from "./DebtsDashboardPage/SearchToolbar";
import { DebtCard } from "./DebtsDashboardPage/DebtCard";
import { PromiseModal } from "./DebtsDashboardPage/PromiseModal";
import { PaymentModal } from "./DebtsDashboardPage/PaymentModal";
import {
  buildStatementRows,
  fetchCustomerDetails,
  queryOverdueReportRows,
} from "./DebtsDashboardPage/customerDetails";
import { recordPaymentPromise } from "./DebtsDashboardPage/promises";
import {
  emptyPromiseForm,
  type CustomerDetails,
  type InvoiceOption,
  type PromiseFormState,
  type SummaryState,
} from "./DebtsDashboardPage/types";

export const DebtsDashboardPage: React.FC = () => {
  const toast = useToast();
  const refreshToken = useDashboardRefresh()?.refreshToken;
  const embedded = useDashboardEmbed();
  const initialRef = useRef(true);
  const navigate = useNavigate();
  const debtService = useMemo(() => new DebtService(), []);
  const branchAccess = useMemo(() => new BranchAccessService(), []);
  const [debts, setDebts] = useState<DebtRow[]>([]);
  const [totals, setTotals] = useState({ receivable: 0, payable: 0, net: 0 });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<DebtRow | null>(null);
  const [amount, setAmount] = useState("");
  const [invoiceOptions, setInvoiceOptions] = useState<InvoiceOption[]>([]);
  const [allocationAmounts, setAllocationAmounts] = useState<
    Record<string, string>
  >({});
  const [paymentType, setPaymentType] = useState<
    "CASH" | "CARD" | "BANK_TRANSFER"
  >("CASH");
  const [paymentDate, setPaymentDate] = useState(localDateString());
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentGroupKey, setPaymentGroupKey] = useState("");
  const [promiseCustomerId, setPromiseCustomerId] = useState<string | null>(
    null,
  );
  const [promiseForm, setPromiseForm] = useState<PromiseFormState>(
    emptyPromiseForm(),
  );
  const [saving, setSaving] = useState(false);
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const [customerDetails, setCustomerDetails] = useState<CustomerDetails>({});
  const [summary, setSummary] = useState<SummaryState>({
    openCustomers: 0,
    openInvoices: 0,
    overdueInvoices: 0,
    overdueInvoiceCount: 0,
    pendingGoodsValue: 0,
    overdueOrders: 0,
    otherReceivables: 0,
  });
  const canReversePayments = PermissionService.can(
    AuthService.getCurrentUser(),
    "customers.payment.reverse",
  );
  const canManagePromises = PermissionService.can(
    AuthService.getCurrentUser(),
    "ui.customers.list.update",
  );

  const toggleCustomer = (id: string) => {
    if (expandedCustomer === id) {
      setExpandedCustomer(null);
      return;
    }
    setExpandedCustomer(id);
    if (customerDetails[id]) return;
    try {
      setCustomerDetails((prev) => ({
        ...prev,
        [id]: fetchCustomerDetails(id),
      }));
    } catch {
      setCustomerDetails((prev) => ({
        ...prev,
        [id]: { address: "—", invoices: [], payments: [], promises: [] },
      }));
    }
  };

  const savePromise = (e: React.FormEvent) => {
    e.preventDefault();
    if (!promiseCustomerId) return;
    try {
      const promises = recordPaymentPromise(promiseCustomerId, promiseForm);
      setCustomerDetails((prev) => ({
        ...prev,
        [promiseCustomerId!]: { ...prev[promiseCustomerId!], promises },
      }));
      setPromiseCustomerId(null);
      setPromiseForm(emptyPromiseForm());
    } catch (error: any) {
      toast.error(error?.message || "تعذر تسجيل وعد السداد.");
    }
  };

  const exportCustomerStatement = (
    customer: DebtRow,
    format: "excel" | "pdf",
  ) => {
    const detail = customerDetails[customer.id];
    if (!detail) return;
    const rows = buildStatementRows(detail);
    const options = {
      title: `كشف حساب ${customer.name}`,
      subtitle: `الهاتف: ${customer.phone || "—"} · العنوان: ${detail.address}`,
      fileName: `كشف-حساب-${customer.name}`,
      permission: "customers.export",
      columns: [
        { key: "type", label: "النوع" },
        { key: "document", label: "المرجع" },
        { key: "date", label: "التاريخ" },
        { key: "debit", label: "مدين" },
        { key: "credit", label: "دائن" },
        { key: "balance", label: "متبقي" },
        { key: "details", label: "التفاصيل" },
      ],
      rows,
    };
    if (format === "excel") exportToExcel(options);
    else exportToPdf(options);
  };
  const exportOverdueReport = (format: "excel" | "pdf") => {
    const rows = queryOverdueReportRows();
    const options = {
      title: "تقرير الفواتير المتأخرة",
      permission: "reports.export",
      columns: [
        { key: "customer", label: "العميل" },
        { key: "phone", label: "الهاتف" },
        { key: "invoice", label: "الفاتورة" },
        { key: "date", label: "تاريخ الفاتورة" },
        { key: "dueDate", label: "الاستحقاق" },
        { key: "total", label: "الإجمالي" },
        { key: "paid", label: "المدفوع" },
        { key: "remaining", label: "المتبقي" },
        { key: "daysOverdue", label: "أيام التأخير" },
      ],
      rows,
      fileName: "الفواتير-المتأخرة",
    };
    if (format === "excel") exportToExcel(options);
    else exportToPdf(options);
  };
  const reverseCustomerPayment = (
    customerId: string,
    payment: {
      id: string;
      invoiceId: string | null;
      paymentGroupId: string | null;
      receiptNumber: string;
    },
  ) => {
    if (
      !confirm(
        `سيتم عكس سند ${payment.receiptNumber}${payment.paymentGroupId ? " والدفعة الموزعة كاملة على فواتيرها" : ""}. متابعة؟`,
      )
    )
      return;
    try {
      if (payment.invoiceId)
        new SalesService().deleteInvoicePayment(payment.id);
      else new CustomerService().deletePayment(payment.id);
      setCustomerDetails((prev) => {
        const next = { ...prev };
        delete next[customerId];
        return next;
      });
      setExpandedCustomer(null);
      load();
    } catch (error: any) {
      toast.error(error?.message || "تعذر عكس السند.");
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const db = DatabaseManager.getInstance();
      const actor = AuthService.requireAuth();
      const invoiceScope = branchAccess.warehouseBranchScope(
        "w",
        undefined,
        actor,
      );
      const orderScope = branchAccess.warehouseBranchScope(
        "w",
        undefined,
        actor,
      );
      const companyScope = branchAccess.companyScope("r.company_id", actor);
      const scopedInvoiceWhere = `si.invoice_status <> 'VOID' AND si.remaining_amount > 1 AND ${invoiceScope.clause}`;
      const value = async (sql: string, params: any[] = []) =>
        Number((await db.queryAsync<{ v: number }>(sql, params))[0]?.v || 0);
      const [debts, totals, openCustomers, openInvoices, overdueInvoices, overdueInvoiceCount, pendingGoodsValue, overdueOrders, otherReceivables] = await Promise.all([
        debtService.getDebtsAsync(search),
        debtService.getTotalsAsync(),
        value(
          `SELECT COUNT(DISTINCT si.customer_id) AS v FROM sales_invoices si JOIN warehouses w ON w.id=si.warehouse_id WHERE ${scopedInvoiceWhere}`,
          invoiceScope.params,
        ),
        value(
          `SELECT COUNT(*) AS v FROM sales_invoices si JOIN warehouses w ON w.id=si.warehouse_id WHERE ${scopedInvoiceWhere}`,
          invoiceScope.params,
        ),
        value(
          `SELECT COALESCE(SUM(si.remaining_amount),0) / 100.0 AS v FROM sales_invoices si JOIN warehouses w ON w.id=si.warehouse_id WHERE ${scopedInvoiceWhere} AND si.due_date IS NOT NULL AND si.due_date < date('now','localtime')`,
          invoiceScope.params,
        ),
        value(
          `SELECT COUNT(*) AS v FROM sales_invoices si JOIN warehouses w ON w.id=si.warehouse_id WHERE ${scopedInvoiceWhere} AND si.due_date IS NOT NULL AND si.due_date < date('now','localtime')`,
          invoiceScope.params,
        ),
        value(
          `SELECT COALESCE(SUM(CASE WHEN totals.subtotal>0 THEN totals.pending_value/totals.subtotal*po.total_amount ELSE 0 END),0) / 100.0 AS v FROM purchase_orders po JOIN warehouses w ON w.id=po.warehouse_id JOIN (SELECT purchase_order_id,SUM(quantity_m2*unit_cost) AS subtotal,SUM((quantity_m2-received_m2)*unit_cost) AS pending_value FROM purchase_order_items GROUP BY purchase_order_id) totals ON totals.purchase_order_id=po.id WHERE po.status IN ('SENT','CONFIRMED','PARTIAL') AND ${orderScope.clause}`,
          orderScope.params,
        ),
        value(
          `SELECT COUNT(*) AS v FROM purchase_orders po JOIN warehouses w ON w.id=po.warehouse_id WHERE po.status IN ('SENT','CONFIRMED','PARTIAL') AND po.expected_date IS NOT NULL AND po.expected_date < date('now','localtime') AND ${orderScope.clause}`,
          orderScope.params,
        ),
        value(
          `SELECT COUNT(*) AS v FROM receivables r WHERE r.status IN ('OPEN','IN_PROGRESS') AND ${companyScope.clause}`,
          companyScope.params,
        ),
      ]);
      setDebts(debts);
      setTotals(totals);
      setSummary({
        openCustomers,
        openInvoices,
        overdueInvoices,
        overdueInvoiceCount,
        pendingGoodsValue,
        overdueOrders,
        otherReceivables,
      });
      setError(null);
    } catch (e: any) {
      setError(e?.message || "تعذر تحميل الديون.");
    } finally {
      setLoading(false);
    }
  }, [debtService, search, setLoading, setDebts, setTotals, setSummary, setError, branchAccess]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (refreshToken === undefined) return;
    if (initialRef.current) { initialRef.current = false; return; }
    load();
  }, [refreshToken, load]);

  const openPayment = (d: DebtRow) => {
    setTarget(d);
    setAmount(String(d.amount));
    setAllocationAmounts({});
    setPaymentDate(localDateString());
    setPaymentReference("");
    setPaymentGroupKey(`ui-${uuidv4()}`);
    if (d.type === "CUSTOMER_RECEIVABLE") {
      const options = DatabaseManager.getInstance().query<{
        id: string;
        invoiceNumber: string;
        remaining: number;
      }>(
        `SELECT si.id, si.invoice_number AS invoiceNumber, si.remaining_amount / 100.0 AS remaining FROM sales_invoices si JOIN warehouses w ON w.id=si.warehouse_id WHERE si.customer_id=? AND si.invoice_status <> 'VOID' AND si.remaining_amount > 1 AND ${branchAccess.warehouseBranchScope("w", undefined, AuthService.requireAuth()).clause} ORDER BY si.date`,
        [
          d.id,
          ...branchAccess.warehouseBranchScope(
            "w",
            undefined,
            AuthService.requireAuth(),
          ).params,
        ],
      );
      setInvoiceOptions(options);
    } else setInvoiceOptions([]);
  };

  const submitPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) return;
    const allocations = invoiceOptions
      .map((invoice) => ({
        invoiceId: invoice.id,
        amount: Number(allocationAmounts[invoice.id]) || 0,
      }))
      .filter((a) => a.amount > 0);
    const value = invoiceOptions.length
      ? allocations.reduce((sum, a) => sum + a.amount, 0)
      : Number(amount);
    if (!(value > 0)) return toast.warning("أدخل مبلغاً صحيحاً.");
    if (value > target.amount + 0.009)
      return toast.warning("المبلغ أكبر من إجمالي المستحق.");
    if (invoiceOptions.length && allocations.length === 0)
      return toast.warning("وزّع الدفعة على فاتورة واحدة على الأقل.");
    if (
      allocations.some(
        (a) =>
          a.amount >
          (invoiceOptions.find((invoice) => invoice.id === a.invoiceId)
            ?.remaining || 0) +
            0.009,
      )
    )
      return toast.warning("أحد المبالغ أكبر من المتبقي في الفاتورة.");
    setSaving(true);
    try {
      const registers = new CashierService().getAllRegisters();
      const registerId =
        registers.find((r) => (r as any).isDefault)?.id || registers[0]?.id;
      if (target.type === "CUSTOMER_RECEIVABLE") {
        if (invoiceOptions.length)
          new SalesService().recordCustomerPaymentAllocations(
            target.id,
            allocations,
            paymentType,
            registerId,
            paymentDate,
            paymentReference,
            "",
            undefined,
            paymentGroupKey,
          );
        else
          new CustomerService().recordPayment(
            target.id,
            value,
            paymentType,
            registerId,
            undefined,
            paymentReference,
            AuthService.getCurrentUser()?.id || "usr_admin",
            paymentDate,
            paymentGroupKey,
          );
      } else {
        new SupplierService().recordPayment(
          target.id,
          value,
          paymentType,
          registerId,
          paymentReference,
          paymentGroupKey,
        );
      }
      setTarget(null);
      load();
    } catch (err: any) {
      toast.error(err?.message || "تعذر تسجيل الدفعة.");
    } finally {
      setSaving(false);
    }
  };

  const filtered = debts;

  return (
    <div
      className="h-full flex flex-col bg-surface-muted text-ink overflow-hidden"
    >
      {!embedded && (
        <div className="bg-surface px-6 pt-4">
          <PageHeader
            icon={<Banknote className="h-5 w-5" />}
            title="الديون والذمم المالية"
            description="متابعة مديونيات العملاء ومستحقات الموردين"
          />
        </div>
      )}

      <DebtSummaryCards totals={totals} />

      <MetricCards
        summary={summary}
        onResetSearch={() => setSearch("")}
        onNavigate={(path) => navigate(path)}
      />

      <SearchToolbar
        search={search}
        onSearchChange={setSearch}
        onSubmit={load}
        onExportExcel={() => exportOverdueReport("excel")}
        onExportPdf={() => exportOverdueReport("pdf")}
      />

      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="mb-3 px-4 py-2.5 rounded-xl bg-danger-soft border border-danger-border text-danger text-xs font-semibold">
            {error}
          </div>
        )}
        {loading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-danger" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((d) => (
              <DebtCard
                key={`${d.type}-${d.id}`}
                debt={d}
                expanded={expandedCustomer === d.id}
                detail={customerDetails[d.id]}
                canManagePromises={canManagePromises}
                canReversePayments={canReversePayments}
                onToggle={() => toggleCustomer(d.id)}
                onOpenPromise={() => {
                  setPromiseCustomerId(d.id);
                  setPromiseForm(emptyPromiseForm());
                }}
                onExportStatement={(format) =>
                  exportCustomerStatement(d, format)
                }
                onReversePayment={(payment) =>
                  reverseCustomerPayment(d.id, payment)
                }
                onPay={() => openPayment(d)}
              />
            ))}
            {filtered.length === 0 && (
              <div className="col-span-full py-16 text-center text-muted border-2 border-dashed border-line rounded-2xl bg-surface">
                لا توجد مديونيات مستحقة
              </div>
            )}
          </div>
        )}
      </div>

      {promiseCustomerId && (
        <PromiseModal
          form={promiseForm}
          onChange={setPromiseForm}
          onSubmit={savePromise}
          onClose={() => setPromiseCustomerId(null)}
        />
      )}
      {target && (
        <PaymentModal
          target={target}
          form={{
            amount,
            invoiceOptions,
            allocationAmounts,
            paymentType,
            paymentDate,
            paymentReference,
            saving,
          }}
          onAmountChange={setAmount}
          onAllocationChange={(invoiceId, value) =>
            setAllocationAmounts((prev) => ({
              ...prev,
              [invoiceId]: value,
            }))
          }
          onPaymentTypeChange={setPaymentType}
          onPaymentDateChange={setPaymentDate}
          onPaymentReferenceChange={setPaymentReference}
          onClose={() => setTarget(null)}
          onSubmit={submitPayment}
        />
      )}
    </div>
  );
};
