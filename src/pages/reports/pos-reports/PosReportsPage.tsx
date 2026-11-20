import React, { useCallback, useEffect, useState } from 'react';
import { BarChart3, CreditCard, Clock, Users, Package, RefreshCw, Download } from 'lucide-react';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { BranchAccessService } from '../../../services/domains/auth/BranchAccessService';
import { localDateString } from '../../../utils/shared/date';
import { exportToExcel } from '../../../utils/export/export';
import { DataTable } from '../../../components/ui/DataTable';
import { PageHeader } from '../../../components/ui/PageHeader';

const db = DatabaseManager.getInstance();
const branchAccess = new BranchAccessService();

const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 0 }).format(n || 0);
const fmtMoney = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(n || 0);

interface PaymentMixRow { method: string; count: number; amount: number; }
interface HourlyRow { hour: string; count: number; amount: number; }
interface TopItemRow { name: string; qty: number; amount: number; }
interface CashierRow { name: string; invoices: number; amount: number; cash: number; }

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'نقدي', CARD: 'بطاقة', BANK_TRANSFER: 'تحويل', CHEQUE: 'شيك',
  CREDIT: 'آجل', MIXED: 'مختلط',
};

export function PosReportsPage() {
  const [from, setFrom] = useState(localDateString());
  const [to, setTo] = useState(localDateString());
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [paymentMix, setPaymentMix] = useState<PaymentMixRow[]>([]);
  const [hourly, setHourly] = useState<HourlyRow[]>([]);
  const [topItems, setTopItems] = useState<TopItemRow[]>([]);
  const [cashiers, setCashiers] = useState<CashierRow[]>([]);
  const [totals, setTotals] = useState({ invoices: 0, amount: 0, collected: 0, refunds: 0, voids: 0, voidAmount: 0, discounts: 0 });

  const load = useCallback(() => {
    setLoading(true);
    try {
      PermissionService.require(AuthService.requireAuth(), 'reports.view', '/reports');
      const scope = branchAccess.sqlScope('si.branch_id', '(SELECT w.branch_id FROM warehouses w WHERE w.id = si.warehouse_id)');
      const sp = scope.params;

      // Payment mix
      const pm = db.query<any>(
        `SELECT method, COUNT(*) AS count, COALESCE(SUM(amount),0) AS amount FROM (
           SELECT sip.method, sip.amount / 100.0 AS amount
           FROM sales_invoice_payments sip
           JOIN sales_invoices si ON si.id = sip.invoice_id
           WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND sip.amount > 0 AND ${scope.clause}
           UNION ALL
           SELECT si.payment_type AS method, si.paid_amount / 100.0 AS amount
           FROM sales_invoices si
           WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND si.paid_amount > 0
             AND NOT EXISTS (SELECT 1 FROM sales_invoice_payments sip WHERE sip.invoice_id = si.id)
             AND ${scope.clause}
           UNION ALL
           SELECT cp.payment_type AS method, cp.amount / 100.0 AS amount
           FROM customer_payments cp
           JOIN sales_invoices si ON si.id = cp.invoice_id
           WHERE cp.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND cp.amount > 1 AND ${scope.clause}
         ) payments
         GROUP BY method ORDER BY amount DESC`,
        [from, to, ...sp, from, to, ...sp, from, to, ...sp]
      );
      setPaymentMix(pm.map((r: any) => ({ method: r.method, count: r.count, amount: r.amount })));

      // Hourly distribution
      const hr = db.query<any>(
        `SELECT substr(si.created_at,12,2) AS hour, COUNT(*) AS count, COALESCE(SUM(total_amount),0) / 100.0 AS amount
         FROM sales_invoices si WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${scope.clause}
         GROUP BY hour ORDER BY hour`,
        [from, to, ...sp]
      );
      setHourly(hr.map((r: any) => ({ hour: `${r.hour}:00`, count: r.count, amount: r.amount })));

      // Top items
      const ti = db.query<any>(
        `SELECT sii.product_name AS name, COALESCE(SUM(sii.quantity_m2),0) AS qty, COALESCE(SUM(sii.total_price),0) / 100.0 AS amount
         FROM sales_invoice_items sii JOIN sales_invoices si ON si.id = sii.invoice_id
         WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${scope.clause}
         GROUP BY sii.product_name ORDER BY amount DESC LIMIT 15`,
        [from, to, ...sp]
      );
      setTopItems(ti.map((r: any) => ({ name: r.name, qty: r.qty, amount: r.amount })));

      // Cashier performance
      const ca = db.query<any>(
        `SELECT u.full_name AS name, COUNT(*) AS invoices, COALESCE(SUM(si.total_amount),0) / 100.0 AS amount,
                COALESCE(SUM(CASE
                  WHEN pay.invoiceId IS NOT NULL THEN pay.cash
                  WHEN si.payment_type = 'CASH' THEN si.paid_amount
                  ELSE 0
                END),0) / 100.0 AS cash
         FROM sales_invoices si LEFT JOIN users u ON u.id = si.created_by
         LEFT JOIN (
           SELECT invoice_id AS invoiceId,
             SUM(CASE WHEN method = 'CASH' THEN amount ELSE 0 END) AS cash
           FROM sales_invoice_payments GROUP BY invoice_id
         ) pay ON pay.invoiceId = si.id
         WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${scope.clause}
         GROUP BY u.full_name ORDER BY amount DESC`,
        [from, to, ...sp]
      );
      setCashiers(ca.map((r: any) => ({ name: r.name || '—', invoices: r.invoices, amount: r.amount, cash: r.cash })));

      // Totals
      const t = db.query<any>(
        `SELECT COUNT(*) AS invoices, COALESCE(SUM(total_amount),0) / 100.0 AS amount,
                COALESCE(SUM(discount_amount),0) / 100.0 AS discounts
         FROM sales_invoices si WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${scope.clause}`,
        [from, to, ...sp]
      )[0];
      const v = db.query<any>(
        `SELECT COUNT(*) AS c, COALESCE(SUM(total_amount),0) / 100.0 AS amount FROM sales_invoices si
         WHERE si.date BETWEEN ? AND ? AND si.invoice_status = 'VOID' AND ${scope.clause}`,
        [from, to, ...sp]
      )[0];
      const refunds = db.query<any>(
        `SELECT COALESCE(SUM(sr.refunded_amount),0) / 100.0 AS amount FROM sales_returns sr
         JOIN sales_invoices si ON si.id = sr.original_invoice_id
         WHERE sr.date BETWEEN ? AND ? AND ${scope.clause}`,
        [from, to, ...sp]
      )[0]?.amount || 0;
      const collected = pm.reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
      setTotals({
        invoices: t.invoices, amount: t.amount, collected, refunds,
        voids: v.c, voidAmount: v.amount, discounts: t.discounts,
      });
      setLoadError(null);
    } catch (e) {
      console.error(e);
      setPaymentMix([]);
      setHourly([]);
      setTopItems([]);
      setCashiers([]);
      setTotals({ invoices: 0, amount: 0, collected: 0, refunds: 0, voids: 0, voidAmount: 0, discounts: 0 });
      setLoadError(e instanceof Error ? e.message : 'تعذر تحميل تقرير نقطة البيع.');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const exportPaymentMix = () => exportToExcel({
    title: 'تقرير طرق الدفع (POS)',
    columns: [{ key: 'method', label: 'الطريقة' }, { key: 'count', label: 'عدد' }, { key: 'amount', label: 'المبلغ' }],
    rows: paymentMix.map((r) => ({ method: PAYMENT_LABELS[r.method] || r.method, count: r.count, amount: r.amount })),
    fileName: 'pos-payment-mix',
    permission: 'reports.view',
  });

  const exportTopItems = () => exportToExcel({
    title: 'الأصناف الأكثر مبيعاً (POS)',
    columns: [{ key: 'name', label: 'الصنف' }, { key: 'qty', label: 'الكمية' }, { key: 'amount', label: 'المبلغ' }],
    rows: topItems as unknown as Record<string, unknown>[],
    fileName: 'pos-top-items',
    permission: 'reports.view',
  });

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        icon={<BarChart3 className="w-5 h-5" />}
        title="تقارير نقطة البيع (POS)"
        actions={<>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-3 py-2 border border-line rounded-xl text-sm" />
          <span className="text-muted">إلى</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-3 py-2 border border-line rounded-xl text-sm" />
          <button onClick={load} disabled={loading} className="px-4 py-2 bg-primary hover:bg-primary text-white font-bold rounded-xl text-sm flex items-center gap-1.5 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> تحديث
          </button>
        </>}
      />

      {loadError && (
        <div role="alert" className="rounded-xl border border-danger-border bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
          تعذر تحميل التقرير: {loadError}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        <div className="bg-surface rounded-2xl border border-line p-4">
          <div className="text-xs text-muted">الفواتير</div>
          <div className="text-2xl font-black text-ink">{fmt(totals.invoices)}</div>
        </div>
        <div className="bg-surface rounded-2xl border border-line p-4">
          <div className="text-xs text-muted">الإجمالي</div>
          <div className="text-2xl font-black text-primary">{fmtMoney(totals.amount)}</div>
        </div>
        <div className="bg-surface rounded-2xl border border-line p-4">
          <div className="text-xs text-muted">التحصيل المسجل فعلياً</div>
          <div className="text-2xl font-black text-success">{fmtMoney(totals.collected)}</div>
        </div>
        <div className="bg-surface rounded-2xl border border-line p-4">
          <div className="text-xs text-muted">متوسط الفاتورة</div>
          <div className="text-2xl font-black text-ink">{fmtMoney(totals.invoices ? totals.amount / totals.invoices : 0)}</div>
        </div>
        <div className="bg-surface rounded-2xl border border-line p-4">
          <div className="text-xs text-muted">الخصومات</div>
          <div className="text-2xl font-black text-danger">{fmtMoney(totals.discounts)}</div>
        </div>
        <div className="bg-surface rounded-2xl border border-line p-4">
          <div className="text-xs text-muted">الملغاة</div>
          <div className="text-2xl font-black text-warning">{fmt(totals.voids)}</div>
        </div>
        <div className="bg-surface rounded-2xl border border-line p-4">
          <div className="text-xs text-muted">قيمة الملغاة</div>
          <div className="text-2xl font-black text-warning">{fmtMoney(totals.voidAmount)}</div>
        </div>
        <div className="bg-surface rounded-2xl border border-line p-4">
          <div className="text-xs text-muted">المبالغ المستردة نقداً</div>
          <div className="text-2xl font-black text-danger">{fmtMoney(totals.refunds)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Payment mix */}
        <div className="bg-surface rounded-2xl border border-line p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-ink flex items-center gap-2"><CreditCard className="w-4 h-4 text-primary" /> توزيع طرق الدفع</h2>
            <button onClick={exportPaymentMix} className="text-xs text-primary hover:underline flex items-center gap-1"><Download className="w-3 h-3" /> جدول بيانات</button>
          </div>
          <DataTable
            ariaLabel="توزيع طرق الدفع"
            rows={paymentMix}
            rowKey={(r) => r.method}
            dense
            columns={[
              { key: 'method', header: 'الطريقة', render: (r) => PAYMENT_LABELS[r.method] || r.method },
              { key: 'count', header: 'عدد', align: 'center', render: (r) => fmt(r.count) },
              { key: 'amount', header: 'المبلغ', align: 'end', render: (r) => <span className="font-bold">{fmtMoney(r.amount)}</span> },
            ]}
            emptyTitle="لا توجد بيانات"
          />
        </div>

        {/* Hourly */}
        <div className="bg-surface rounded-2xl border border-line p-4">
          <h2 className="font-bold text-ink flex items-center gap-2 mb-3"><Clock className="w-4 h-4 text-primary" /> توزيع المبيعات حسب الساعة</h2>
          <div className="space-y-1.5">
            {hourly.map((r) => {
              const max = Math.max(...hourly.map((x) => x.amount), 1);
              const pct = (r.amount / max) * 100;
              return (
                <div key={r.hour} className="flex items-center gap-2 text-xs">
                  <span className="w-12 text-muted">{r.hour}</span>
                  <div className="flex-1 bg-surface-sunken rounded-full h-2 overflow-hidden">
                    <div className="bg-primary h-2 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-20 text-left font-bold">{fmtMoney(r.amount)}</span>
                  <span className="w-8 text-muted">({r.count})</span>
                </div>
              );
            })}
            {hourly.length === 0 && <div className="text-center py-4 text-muted text-sm">لا توجد بيانات</div>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top items */}
        <div className="bg-surface rounded-2xl border border-line p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-ink flex items-center gap-2"><Package className="w-4 h-4 text-primary" /> الأصناف الأكثر مبيعاً (أفضل 15)</h2>
            <button onClick={exportTopItems} className="text-xs text-primary hover:underline flex items-center gap-1"><Download className="w-3 h-3" /> جدول بيانات</button>
          </div>
          <DataTable
            ariaLabel="الأصناف الأكثر مبيعاً"
            rows={topItems.map((r, i) => ({ ...r, _i: i }))}
            rowKey={(r) => String(r._i)}
            dense
            columns={[
              { key: 'rank', header: '#', render: (r) => <span className="text-muted">{r._i + 1}</span> },
              { key: 'name', header: 'الصنف', render: (r) => r.name },
              { key: 'qty', header: 'الكمية', align: 'center', render: (r) => fmt(r.qty) },
              { key: 'amount', header: 'المبلغ', align: 'end', render: (r) => <span className="font-bold">{fmtMoney(r.amount)}</span> },
            ]}
            emptyTitle="لا توجد بيانات"
          />
        </div>

        {/* Cashier performance */}
        <div className="bg-surface rounded-2xl border border-line p-4">
          <h2 className="font-bold text-ink flex items-center gap-2 mb-3"><Users className="w-4 h-4 text-primary" /> أداء الكاشيرات</h2>
          <DataTable
            ariaLabel="أداء الكاشيرات"
            rows={cashiers.map((r, i) => ({ ...r, _i: i }))}
            rowKey={(r) => String(r._i)}
            dense
            columns={[
              { key: 'name', header: 'منشئ الفاتورة', render: (r) => r.name },
              { key: 'invoices', header: 'فواتير', align: 'center', render: (r) => fmt(r.invoices) },
              { key: 'amount', header: 'الإجمالي', align: 'end', render: (r) => <span className="font-bold">{fmtMoney(r.amount)}</span> },
              { key: 'cash', header: 'النقد المسجل بالفواتير', align: 'end', render: (r) => fmtMoney(r.cash) },
            ]}
            emptyTitle="لا توجد بيانات"
          />
        </div>
      </div>
    </div>
  );
}

export default PosReportsPage;
