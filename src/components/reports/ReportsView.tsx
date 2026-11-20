import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Calendar, DollarSign, Package, ShoppingCart, Truck, PieChart, FileSpreadsheet, FileDown } from 'lucide-react';
import { SalesService } from '../../services/domains/sales/SalesService';
import { AccountingService } from '../../services/domains/finance/AccountingService';
import { SalesInvoice } from '../../types';
import { CeramicMath } from '../../utils/products/ceramicMath';
import { formatProductQuantity } from '../../utils/products/productUnits';
import { exportToExcel, exportToPdf, ExportOptions } from '../../utils/export/export';
import { useToast } from '../ui/Toast';
import { PageHeader } from '../ui/PageHeader';
import { Button } from '../ui/Button';
import { StatCard } from '../ui/Card';
import { DataTable } from '../ui/DataTable';

type ReportTab = 'sales' | 'purchases' | 'expenses' | 'inventory' | 'category' | 'brand';

export const ReportsView: React.FC = () => {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<ReportTab>('sales');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [purchaseReport, setPurchaseReport] = useState<any>(null);
  const [expenseReport, setExpenseReport] = useState<any>(null);
  const [inventoryReport, setInventoryReport] = useState<any>(null);
  const [categoryReport, setCategoryReport] = useState<any[]>([]);
  const [brandReport, setBrandReport] = useState<any[]>([]);

  const salesService = useMemo(() => new SalesService(), []);
  const accountingService = useMemo(() => new AccountingService(), []);

  const loadData = useCallback(() => {
    void (async () => {
      try {
        const [invoiceRows, purchase, expense, inventory, category, brand] = await Promise.all([
          salesService.getAllInvoicesAsync(undefined, dateFrom || undefined, dateTo || undefined),
          accountingService.getPurchaseReportAsync(dateFrom || undefined, dateTo || undefined),
          accountingService.getExpenseReportAsync(dateFrom || undefined, dateTo || undefined),
          accountingService.getInventoryValuationReportAsync(),
          accountingService.getCategorySalesReportAsync(dateFrom || undefined, dateTo || undefined),
          accountingService.getBrandSalesReportAsync(dateFrom || undefined, dateTo || undefined),
        ]);
        setInvoices(invoiceRows);
        setPurchaseReport(purchase);
        setExpenseReport(expense);
        setInventoryReport(inventory);
        setCategoryReport(category);
        setBrandReport(brand);
      } catch (e) { console.error(e); }
    })();
  }, [dateFrom, dateTo, accountingService, salesService]);

  useEffect(() => { loadData(); }, [dateFrom, dateTo, loadData]);

  const totalSales = invoices.reduce((s, i) => s + i.totalAmount, 0);
  const totalCost = invoices.reduce((s, i) => s + i.totalCost, 0);
  const totalGrossProfit = invoices.reduce((s, i) => s + i.grossProfit, 0);
  const totalRemaining = invoices.reduce((s, i) => s + i.remainingAmount, 0);

  const tabs: { id: ReportTab; label: string; icon: any }[] = [
    { id: 'sales', label: 'المبيعات', icon: ShoppingCart },
    { id: 'purchases', label: 'المشتريات', icon: Truck },
    { id: 'expenses', label: 'المصروفات', icon: DollarSign },
    { id: 'inventory', label: 'المخزون', icon: Package },
    { id: 'category', label: 'حسب التصنيف', icon: PieChart },
    { id: 'brand', label: 'حسب الماركة', icon: BarChart3 },
  ];

  const getExportOptions = (): ExportOptions | null => {
    const period = `الفترة: ${dateFrom || 'البداية'} — ${dateTo || 'اليوم'}`;
    const num = (v: any) => Number(v) || 0;
    switch (activeTab) {
      case 'sales':
        return {
          title: 'تقرير المبيعات', subtitle: period, fileName: 'sales-report', permission: 'reports.export',
          columns: [
            { key: 'invoiceNumber', label: 'رقم الفاتورة' }, { key: 'date', label: 'التاريخ' },
            { key: 'customerName', label: 'العميل' }, { key: 'totalAmount', label: 'الإجمالي' },
            { key: 'paidAmount', label: 'المدفوع' }, { key: 'remainingAmount', label: 'المتبقي' },
          ],
          rows: invoices.map((i) => ({ ...i, totalAmount: num(i.totalAmount), paidAmount: num(i.paidAmount), remainingAmount: num(i.remainingAmount) })),
        };
      case 'purchases':
        return {
          title: 'تقرير المشتريات', subtitle: period, fileName: 'purchases-report', permission: 'reports.export',
          columns: [
            { key: 'invoiceNumber', label: 'رقم الفاتورة' }, { key: 'date', label: 'التاريخ' },
            { key: 'supplierName', label: 'المورد' }, { key: 'totalAmount', label: 'الإجمالي' },
            { key: 'paidAmount', label: 'المدفوع' }, { key: 'remainingAmount', label: 'المتبقي' },
          ],
          rows: (purchaseReport?.invoices || []).map((i: any) => ({ ...i })),
        };
      case 'expenses':
        return {
          title: 'تقرير المصروفات', subtitle: period, fileName: 'expenses-report', permission: 'reports.export',
          columns: [
            { key: 'date', label: 'التاريخ' }, { key: 'category', label: 'الفئة' },
            { key: 'description', label: 'البيان' }, { key: 'amount', label: 'المبلغ' },
          ],
          rows: (expenseReport?.expenses || []).map((e: any) => ({ ...e })),
        };
      case 'inventory':
        return {
          title: 'تقرير تقييم المخزون', subtitle: period, fileName: 'inventory-valuation', permission: 'reports.export',
          columns: [
            { key: 'warehouseName', label: 'المخزن' }, { key: 'items', label: 'عدد الأصناف' },
            { key: 'costValue', label: 'قيمة التكلفة' }, { key: 'saleValue', label: 'قيمة البيع' },
          ],
          rows: inventoryReport?.byWarehouse || [],
        };
      case 'category':
        return {
          title: 'تقرير المبيعات حسب الفئة', subtitle: period, fileName: 'category-sales', permission: 'reports.export',
          columns: [
            { key: 'categoryName', label: 'الفئة' }, { key: 'quantityM2', label: 'الكمية' }, { key: 'unitLabel', label: 'الوحدة' },
            { key: 'totalRevenue', label: 'الإيراد' }, { key: 'profit', label: 'الربح' },
          ],
          rows: categoryReport,
        };
      case 'brand':
        return {
          title: 'تقرير المبيعات حسب الماركة', subtitle: period, fileName: 'brand-sales', permission: 'reports.export',
          columns: [
            { key: 'brandName', label: 'الماركة' }, { key: 'quantityM2', label: 'الكمية' }, { key: 'unitLabel', label: 'الوحدة' },
            { key: 'totalRevenue', label: 'الإيراد' }, { key: 'profit', label: 'الربح' },
          ],
          rows: brandReport,
        };
      default:
        return null;
    }
  };

  const handleExport = (type: 'excel' | 'pdf') => {
    const options = getExportOptions();
    if (!options) return;
    if (options.rows.length === 0) { toast.warning('لا توجد بيانات لتصديرها.'); return; }
    const guarded = { ...options, permission: 'reports.export' };
    if (type === 'excel') exportToExcel(guarded); else exportToPdf(guarded);
  };

  return (
    <div className="erp-page">
      <PageHeader
        title="مركز التقارير"
        description="تقارير شاملة للمبيعات والمشتريات والمصروفات والأرباح والمالية"
        icon={<BarChart3 className="h-5 w-5" />}
      />

      {/* Quick access to advanced report pages */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {([
          { label: 'تقارير المبيعات المتقدمة', desc: 'حسب الفئة والمنتج والعميل والمندوب', icon: ShoppingCart, color: 'from-success to-primary', href: '#/reports?tab=sales' },
          { label: 'تقارير المشتريات والمخزون', desc: 'الموردون وقيمة المخزون', icon: Truck, color: 'from-warning to-warning', href: '#/reports?tab=purchases' },
          { label: 'القوائم المالية', desc: 'الميزانية وأعمار الذمم والتدفق', icon: PieChart, color: 'from-primary to-primary', href: '#/reports?tab=finance' },
          { label: 'الأرباح والخسائر', desc: 'قائمة الدخل وتحليل الهامش', icon: BarChart3, color: 'from-success to-success', href: '#/reports?tab=profitLoss' },
        ] as const).map(card => {
          const Icon = card.icon;
          return (
            <Link key={card.href} to={card.href.replace(/^#/, '')}
              className="erp-card erp-card--compact flex items-start gap-3 transition hover:border-[var(--win-accent)]"
            >
              <span className="erp-card__icon shrink-0" aria-hidden="true"><Icon className="h-4 w-4" /></span>
              <span className="min-w-0">
                <span className="block text-sm font-black text-[var(--win-text)]">{card.label}</span>
                <span className="mt-0.5 block text-xs text-[var(--cerami-muted)]">{card.desc}</span>
              </span>
            </Link>
          );
        })}
      </div>

      <div className="border-t border-[var(--win-border)] pt-2">
        <h3 className="text-sm font-black text-[var(--win-text)] mb-3">التقارير التفصيلية المباشرة</h3>
      </div>

      <div className="flex gap-1 border border-[var(--win-border)] bg-[var(--win-surface-sunken)] p-1 rounded-[var(--ui-radius-md)] overflow-x-auto">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-[var(--ui-radius-sm)] text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${activeTab === tab.id ? 'bg-[var(--win-surface)] text-[var(--win-accent)] shadow-sm' : 'text-[var(--cerami-muted)] hover:text-[var(--win-text)]'}`}>
              <Icon className="w-4 h-4" />{tab.label}
            </button>
          );
        })}
      </div>

      <div className="erp-card flex flex-wrap items-center gap-4 text-xs font-bold">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[var(--cerami-muted)]" />
          <span className="text-[var(--cerami-muted)]">من:</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="ui-input px-3 py-1.5" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[var(--cerami-muted)]">إلى:</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="ui-input px-3 py-1.5" />
        </div>
        <button onClick={() => { setDateFrom(''); setDateTo(''); }}
          className="erp-btn erp-btn--secondary erp-btn--sm">إعادة ضبط</button>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" size="sm" leadingIcon={<FileSpreadsheet className="h-4 w-4" />} onClick={() => handleExport('excel')}>تصدير جدول بيانات</Button>
        <Button variant="secondary" size="sm" leadingIcon={<FileDown className="h-4 w-4" />} onClick={() => handleExport('pdf')}>تصدير مستند</Button>
      </div>

      {activeTab === 'sales' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard label="إجمالي المبيعات" value={CeramicMath.formatCurrency(totalSales)} tone="default" />
            <StatCard label="تكلفة البضاعة (COGS)" value={CeramicMath.formatCurrency(totalCost)} tone="default" />
            <StatCard label="الربح المحقق" value={CeramicMath.formatCurrency(totalGrossProfit)} tone="success" />
            <StatCard label="المديونيات المتبقية" value={CeramicMath.formatCurrency(totalRemaining)} tone="warning" />
          </div>

          <div className="erp-card erp-card--flush overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--win-border)]">
              <h3 className="font-extrabold text-sm text-[var(--win-text)]">تفاصيل فواتير المبيعات</h3>
            </div>
                        <DataTable
                        ariaLabel="تفاصيل فواتير المبيعات"
                        rows={invoices}
                        rowKey={(inv) => inv.id}
                        columns={[
                          { key: 'num', header: 'رقم الفاتورة', render: (inv) => <span className="font-mono font-bold">{inv.invoiceNumber}</span> },
                          { key: 'date', header: 'التاريخ', render: (inv) => <span className={`font-mono text-[var(--cerami-muted)]`}>{inv.date}</span> },
                          { key: 'customer', header: 'العميل', render: (inv) => <span className="font-bold">{inv.customerName}</span> },
                          { key: 'total', header: 'الإجمالي', render: (inv) => <span className="font-bold">{CeramicMath.formatCurrency(inv.totalAmount)}</span> },
                          { key: 'cost', header: 'التكلفة', render: (inv) => <span className={`font-mono text-[var(--cerami-muted)]`}>{CeramicMath.formatCurrency(inv.totalCost)}</span> },
                          { key: 'profit', header: 'الربح', render: (inv) => <span className="font-black text-[var(--win-success-text)]">{CeramicMath.formatCurrency(inv.grossProfit)}</span> },
                          { key: 'paid', header: 'المسدد', render: (inv) => <span className="font-bold text-[var(--win-success-text)]">{CeramicMath.formatCurrency(inv.paidAmount)}</span> },
                          { key: 'remaining', header: 'المتبقي', render: (inv) => <span className="font-bold text-[var(--win-warning-text)]">{CeramicMath.formatCurrency(inv.remainingAmount)}</span> },
                        ]}
                      />
          </div>
        </div>
      )}

      {activeTab === 'purchases' && purchaseReport && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard label="إجمالي المشتريات" value={CeramicMath.formatCurrency(purchaseReport.totalPurchases)} tone="default" />
            <StatCard label="المسدد للموردين" value={CeramicMath.formatCurrency(purchaseReport.totalPaid)} tone="success" />
            <StatCard label="المستحق للموردين" value={CeramicMath.formatCurrency(purchaseReport.totalRemaining)} tone="warning" />
          </div>

          <div className="erp-card erp-card--flush overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--win-border)]">
              <h3 className="font-extrabold text-sm text-[var(--win-text)]">تفاصيل فواتير المشتريات</h3>
            </div>
                        <DataTable
                        ariaLabel="تفاصيل فواتير المشتريات"
                        rows={purchaseReport.invoices}
                        rowKey={(inv: any) => inv.id}
                        columns={[
                          { key: 'num', header: 'رقم الفاتورة', render: (inv: any) => <span className="font-mono font-bold">{inv.invoiceNumber}</span> },
                          { key: 'date', header: 'التاريخ', render: (inv: any) => <span className={`font-mono text-[var(--cerami-muted)]`}>{inv.date}</span> },
                          { key: 'supplier', header: 'المورد', render: (inv: any) => <span className="font-bold">{inv.supplierName}</span> },
                          { key: 'warehouse', header: 'المخزن', render: (inv: any) => <span className="text-[var(--cerami-primary-readable)]">{inv.warehouseName}</span> },
                          { key: 'total', header: 'الإجمالي', render: (inv: any) => <span className="font-bold">{CeramicMath.formatCurrency(inv.totalAmount)}</span> },
                          { key: 'paid', header: 'المسدد', render: (inv: any) => <span className="font-bold text-[var(--win-success-text)]">{CeramicMath.formatCurrency(inv.paidAmount)}</span> },
                          { key: 'remaining', header: 'المتبقي', render: (inv: any) => <span className="font-bold text-[var(--win-warning-text)]">{CeramicMath.formatCurrency(inv.remainingAmount)}</span> },
                        ]}
                      />
          </div>
        </div>
      )}

      {activeTab === 'expenses' && expenseReport && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <StatCard label="إجمالي المصروفات" value={CeramicMath.formatCurrency(expenseReport.totalExpenses)} tone="danger" />
            <StatCard label="عدد التصنيفات" value={expenseReport.byCategory.length} tone="default" />
          </div>

          <div className="erp-card">
            <h3 className="font-extrabold text-sm text-[var(--win-text)] mb-4">المصروفات حسب التصنيف</h3>
            {expenseReport.byCategory.length > 0 ? (
              <div className="space-y-3">
                {expenseReport.byCategory.map((cat: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between p-3 rounded-[var(--ui-radius-sm)] bg-[var(--win-surface-sunken)]">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-[var(--ui-radius-sm)] bg-[var(--win-danger-soft)] text-[var(--win-danger-text)] font-bold text-xs flex items-center justify-center">{idx + 1}</div>
                      <span className="font-bold text-sm text-[var(--win-text)]">{cat.category}</span>
                    </div>
                    <span className="font-black text-danger">{CeramicMath.formatCurrency(cat.total)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-[var(--cerami-muted)] text-xs">لا توجد مصروفات.</div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'inventory' && inventoryReport && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <StatCard label="قيمة المخزون (سعر الشراء)" value={CeramicMath.formatCurrency(inventoryReport.totalCostValue)} tone="default" />
            <StatCard label="قيمة المخزون (سعر البيع)" value={CeramicMath.formatCurrency(inventoryReport.totalSaleValue)} tone="success" />
          </div>

          <div className="erp-card erp-card--flush overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--win-border)]">
              <h3 className="font-extrabold text-sm text-[var(--win-text)]">قيمة المخزون حسب المخزن</h3>
            </div>
                        <DataTable
                        ariaLabel="قيمة المخزون حسب المخزن"
                        rows={inventoryReport.byWarehouse}
                        rowKey={(wh: any) => wh.warehouseName}
                        columns={[
                          { key: 'wh', header: 'المخزن', render: (wh: any) => <span className="font-bold">{wh.warehouseName}</span> },
                          { key: 'items', header: 'عدد الأصناف', align: 'center', render: (wh: any) => <span className="font-bold text-[var(--cerami-primary-readable)]">{wh.items}</span> },
                          { key: 'cost', header: 'قيمة الشراء', render: (wh: any) => <span className="font-mono">{CeramicMath.formatCurrency(wh.costValue)}</span> },
                          { key: 'sale', header: 'قيمة البيع', render: (wh: any) => <span className="font-mono text-[var(--win-success-text)]">{CeramicMath.formatCurrency(wh.saleValue)}</span> },
                          { key: 'profit', header: 'الربح المحتمل', render: (wh: any) => <span className="font-black text-[var(--win-success-text)]">{CeramicMath.formatCurrency(wh.saleValue - wh.costValue)}</span> },
                        ]}
                      />
          </div>
        </div>
      )}

      {activeTab === 'category' && (
        <div className="space-y-6">
          <div className="erp-card erp-card--flush overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--win-border)]">
              <h3 className="font-extrabold text-sm text-[var(--win-text)]">أرباح المبيعات حسب التصنيف</h3>
            </div>
                        <DataTable
                        ariaLabel="أرباح المبيعات حسب التصنيف"
                        rows={categoryReport}
                        rowKey={(cat: any) => cat.categoryName}
                        columns={[
                          { key: 'name', header: 'التصنيف', render: (cat: any) => <span className="font-bold">{cat.categoryName}</span> },
                          { key: 'qty', header: 'الكمية المباعة', render: (cat: any) => <span>{formatProductQuantity(cat.quantityM2, cat)}</span> },
                          { key: 'revenue', header: 'إجمالي الإيراد', render: (cat: any) => <span className="font-bold">{CeramicMath.formatCurrency(cat.totalRevenue)}</span> },
                          { key: 'profit', header: 'الربح', render: (cat: any) => <span className="font-black text-[var(--win-success-text)]">{CeramicMath.formatCurrency(cat.profit)}</span> },
                          { key: 'margin', header: 'نسبة الربح', render: (cat: any) => <span className="font-bold text-[var(--cerami-primary-readable)]">{cat.totalRevenue > 0 ? ((cat.profit / cat.totalRevenue) * 100).toFixed(1) : 0}%</span> },
                        ]}
                      />
          </div>
        </div>
      )}

      {activeTab === 'brand' && (
        <div className="space-y-6">
          <div className="erp-card erp-card--flush overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--win-border)]">
              <h3 className="font-extrabold text-sm text-[var(--win-text)]">أرباح المبيعات حسب الماركة</h3>
            </div>
                        <DataTable
                        ariaLabel="أرباح المبيعات حسب الماركة"
                        rows={brandReport}
                        rowKey={(br: any) => br.brandName}
                        columns={[
                          { key: 'name', header: 'الماركة', render: (br: any) => <span className="font-bold">{br.brandName}</span> },
                          { key: 'qty', header: 'الكمية المباعة', render: (br: any) => <span>{formatProductQuantity(br.quantityM2, br)}</span> },
                          { key: 'revenue', header: 'إجمالي الإيراد', render: (br: any) => <span className="font-bold">{CeramicMath.formatCurrency(br.totalRevenue)}</span> },
                          { key: 'profit', header: 'الربح', render: (br: any) => <span className="font-black text-[var(--win-success-text)]">{CeramicMath.formatCurrency(br.profit)}</span> },
                          { key: 'margin', header: 'نسبة الربح', render: (br: any) => <span className="font-bold text-[var(--cerami-primary-readable)]">{br.totalRevenue > 0 ? ((br.profit / br.totalRevenue) * 100).toFixed(1) : 0}%</span> },
                        ]}
                      />
          </div>
        </div>
      )}
    </div>
  );
};
