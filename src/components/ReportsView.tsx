import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Calendar, DollarSign, Package, ShoppingCart, Truck, PieChart, FileSpreadsheet, FileDown } from 'lucide-react';
import { SalesService } from '../services/SalesService';
import { AccountingService } from '../services/AccountingService';
import { SalesInvoice } from '../types';
import { CeramicMath } from '../utils/ceramicMath';
import { formatProductQuantity } from '../utils/productUnits';
import { exportToExcel, exportToPdf, ExportOptions } from '../utils/export';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

type ReportTab = 'sales' | 'purchases' | 'expenses' | 'inventory' | 'category' | 'brand';

export const ReportsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ReportTab>('sales');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [purchaseReport, setPurchaseReport] = useState<any>(null);
  const [expenseReport, setExpenseReport] = useState<any>(null);
  const [inventoryReport, setInventoryReport] = useState<any>(null);
  const [categoryReport, setCategoryReport] = useState<any[]>([]);
  const [brandReport, setBrandReport] = useState<any[]>([]);

  const salesService = new SalesService();
  const accountingService = new AccountingService();

  const loadData = () => {
    try {
      setInvoices(salesService.getAllInvoices(undefined, dateFrom || undefined, dateTo || undefined));
      setPurchaseReport(accountingService.getPurchaseReport(dateFrom || undefined, dateTo || undefined));
      setExpenseReport(accountingService.getExpenseReport(dateFrom || undefined, dateTo || undefined));
      setInventoryReport(accountingService.getInventoryValuationReport());
      setCategoryReport(accountingService.getCategorySalesReport(dateFrom || undefined, dateTo || undefined));
      setBrandReport(accountingService.getBrandSalesReport(dateFrom || undefined, dateTo || undefined));
    } catch (e) { console.error(e); }
  };

  useEffect(() => { loadData(); }, [dateFrom, dateTo]);

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
          title: 'تقرير المبيعات', subtitle: period, fileName: 'sales-report',
          columns: [
            { key: 'invoiceNumber', label: 'رقم الفاتورة' }, { key: 'date', label: 'التاريخ' },
            { key: 'customerName', label: 'العميل' }, { key: 'totalAmount', label: 'الإجمالي' },
            { key: 'paidAmount', label: 'المدفوع' }, { key: 'remainingAmount', label: 'المتبقي' },
          ],
          rows: invoices.map((i) => ({ ...i, totalAmount: num(i.totalAmount), paidAmount: num(i.paidAmount), remainingAmount: num(i.remainingAmount) })),
        };
      case 'purchases':
        return {
          title: 'تقرير المشتريات', subtitle: period, fileName: 'purchases-report',
          columns: [
            { key: 'invoiceNumber', label: 'رقم الفاتورة' }, { key: 'date', label: 'التاريخ' },
            { key: 'supplierName', label: 'المورد' }, { key: 'totalAmount', label: 'الإجمالي' },
            { key: 'paidAmount', label: 'المدفوع' }, { key: 'remainingAmount', label: 'المتبقي' },
          ],
          rows: (purchaseReport?.invoices || []).map((i: any) => ({ ...i })),
        };
      case 'expenses':
        return {
          title: 'تقرير المصروفات', subtitle: period, fileName: 'expenses-report',
          columns: [
            { key: 'date', label: 'التاريخ' }, { key: 'category', label: 'الفئة' },
            { key: 'description', label: 'البيان' }, { key: 'amount', label: 'المبلغ' },
          ],
          rows: (expenseReport?.expenses || []).map((e: any) => ({ ...e })),
        };
      case 'inventory':
        return {
          title: 'تقرير تقييم المخزون', subtitle: period, fileName: 'inventory-valuation',
          columns: [
            { key: 'warehouseName', label: 'المخزن' }, { key: 'items', label: 'عدد الأصناف' },
            { key: 'costValue', label: 'قيمة التكلفة' }, { key: 'saleValue', label: 'قيمة البيع' },
          ],
          rows: inventoryReport?.byWarehouse || [],
        };
      case 'category':
        return {
          title: 'تقرير المبيعات حسب الفئة', subtitle: period, fileName: 'category-sales',
          columns: [
            { key: 'categoryName', label: 'الفئة' }, { key: 'quantityM2', label: 'الكمية' }, { key: 'unitLabel', label: 'الوحدة' },
            { key: 'totalRevenue', label: 'الإيراد' }, { key: 'profit', label: 'الربح' },
          ],
          rows: categoryReport,
        };
      case 'brand':
        return {
          title: 'تقرير المبيعات حسب الماركة', subtitle: period, fileName: 'brand-sales',
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
    if (options.rows.length === 0) return alert('لا توجد بيانات لتصديرها.');
    const guarded = { ...options, permission: 'reports.export' };
    if (type === 'excel') exportToExcel(guarded); else exportToPdf(guarded);
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      <div>
        <h2 className="text-xl font-extrabold text-slate-900">مركز التقارير</h2>
        <p className="text-xs text-slate-500">تقارير شاملة للمبيعات والمشتريات والمصروفات والأرباح والمالية</p>
      </div>

      {/* Quick access to advanced report pages */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {([
          { label: 'تقارير المبيعات المتقدمة', desc: 'حسب الفئة والمنتج والعميل والمندوب', icon: ShoppingCart, color: 'from-teal-500 to-cyan-600', href: '#/reports/sales' },
          { label: 'تقارير المشتريات والمخزون', desc: 'الموردون وقيمة المخزون', icon: Truck, color: 'from-orange-500 to-amber-600', href: '#/reports/purchases' },
          { label: 'القوائم المالية', desc: 'الميزانية وأعمار الذمم والتدفق', icon: PieChart, color: 'from-violet-500 to-purple-600', href: '#/reports/statements' },
          { label: 'الأرباح والخسائر', desc: 'قائمة الدخل وتحليل الهامش', icon: BarChart3, color: 'from-emerald-500 to-green-600', href: '#/reports/profit-loss' },
        ] as const).map(card => {
          const Icon = card.icon;
          return (
            <Link key={card.href} to={card.href.replace(/^#/, '')}
              className={`bg-gradient-to-br ${card.color} text-white rounded-2xl p-4 block hover:opacity-90 hover:shadow-lg transition-all`}
            >
              <Icon className="w-6 h-6 mb-2 opacity-90" />
              <p className="text-sm font-black">{card.label}</p>
              <p className="text-xs opacity-70 mt-0.5">{card.desc}</p>
            </Link>
          );
        })}
      </div>

      <div className="border-t border-slate-200 pt-2">
        <h3 className="text-sm font-black text-slate-700 mb-3">التقارير التفصيلية المباشرة</h3>
      </div>

      <div className="flex gap-2 bg-slate-100 p-1 rounded-xl overflow-x-auto">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${activeTab === tab.id ? 'bg-white text-sky-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <Icon className="w-4 h-4" />{tab.label}
            </button>
          );
        })}
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-4 text-xs font-bold">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-500" />
          <span className="text-slate-500">من:</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-200 " />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-500">إلى:</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-200 " />
        </div>
        <button onClick={() => { setDateFrom(''); setDateTo(''); }}
          className="px-3 py-1.5 bg-slate-100 rounded-xl text-slate-600 ">إعادة ضبط</button>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button onClick={() => handleExport('excel')} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition">
          <FileSpreadsheet className="w-4 h-4" /> تصدير Excel
        </button>
        <button onClick={() => handleExport('pdf')} className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition">
          <FileDown className="w-4 h-4" /> تصدير PDF
        </button>
      </div>

      {activeTab === 'sales' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-500">إجمالي المبيعات</div>
              <div className="text-xl font-black text-slate-900 mt-1">{CeramicMath.formatCurrency(totalSales)}</div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-500">تكلفة البضاعة (COGS)</div>
              <div className="text-xl font-black text-slate-600 mt-1">{CeramicMath.formatCurrency(totalCost)}</div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-500">الربح المحقق</div>
              <div className="text-xl font-black text-emerald-600 mt-1">{CeramicMath.formatCurrency(totalGrossProfit)}</div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-500">المديونيات المتبقية</div>
              <div className="text-xl font-black text-amber-600 mt-1">{CeramicMath.formatCurrency(totalRemaining)}</div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 ">
              <h3 className="font-extrabold text-sm text-slate-900">تفاصيل فواتير المبيعات</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3.5">رقم الفاتورة</th>
                    <th className="p-3.5">التاريخ</th>
                    <th className="p-3.5">العميل</th>
                    <th className="p-3.5">الإجمالي</th>
                    <th className="p-3.5">التكلفة</th>
                    <th className="p-3.5">الربح</th>
                    <th className="p-3.5">المسدد</th>
                    <th className="p-3.5">المتبقي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 ">
                  {invoices.length === 0 ? (
                    <tr><td colSpan={8} className="py-12 text-center text-slate-500">لا توجد فواتير.</td></tr>
                  ) : invoices.map(inv => (
                    <tr key={inv.id} className="hover:bg-slate-100">
                      <td className="p-3.5 font-mono font-bold">{inv.invoiceNumber}</td>
                      <td className="p-3.5 font-mono text-slate-500">{inv.date}</td>
                      <td className="p-3.5 font-bold">{inv.customerName}</td>
                      <td className="p-3.5 font-bold">{CeramicMath.formatCurrency(inv.totalAmount)}</td>
                      <td className="p-3.5 font-mono text-slate-500">{CeramicMath.formatCurrency(inv.totalCost)}</td>
                      <td className="p-3.5 font-black text-emerald-600">{CeramicMath.formatCurrency(inv.grossProfit)}</td>
                      <td className="p-3.5 font-bold text-emerald-600">{CeramicMath.formatCurrency(inv.paidAmount)}</td>
                      <td className="p-3.5 font-bold text-amber-600">{CeramicMath.formatCurrency(inv.remainingAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'purchases' && purchaseReport && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-500">إجمالي المشتريات</div>
              <div className="text-xl font-black text-slate-900 mt-1">{CeramicMath.formatCurrency(purchaseReport.totalPurchases)}</div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-500">المسدد للموردين</div>
              <div className="text-xl font-black text-emerald-600 mt-1">{CeramicMath.formatCurrency(purchaseReport.totalPaid)}</div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-500">المستحق للموردين</div>
              <div className="text-xl font-black text-amber-600 mt-1">{CeramicMath.formatCurrency(purchaseReport.totalRemaining)}</div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 ">
              <h3 className="font-extrabold text-sm text-slate-900">تفاصيل فواتير المشتريات</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3.5">رقم الفاتورة</th>
                    <th className="p-3.5">التاريخ</th>
                    <th className="p-3.5">المورد</th>
                    <th className="p-3.5">المخزن</th>
                    <th className="p-3.5">الإجمالي</th>
                    <th className="p-3.5">المسدد</th>
                    <th className="p-3.5">المتبقي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 ">
                  {purchaseReport.invoices.length === 0 ? (
                    <tr><td colSpan={7} className="py-12 text-center text-slate-500">لا توجد فواتير مشتريات.</td></tr>
                  ) : purchaseReport.invoices.map((inv: any) => (
                    <tr key={inv.id} className="hover:bg-slate-100">
                      <td className="p-3.5 font-mono font-bold">{inv.invoiceNumber}</td>
                      <td className="p-3.5 font-mono text-slate-500">{inv.date}</td>
                      <td className="p-3.5 font-bold">{inv.supplierName}</td>
                      <td className="p-3.5 text-sky-600">{inv.warehouseName}</td>
                      <td className="p-3.5 font-bold">{CeramicMath.formatCurrency(inv.totalAmount)}</td>
                      <td className="p-3.5 font-bold text-emerald-600">{CeramicMath.formatCurrency(inv.paidAmount)}</td>
                      <td className="p-3.5 font-bold text-amber-600">{CeramicMath.formatCurrency(inv.remainingAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'expenses' && expenseReport && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-500">إجمالي المصروفات</div>
              <div className="text-xl font-black text-red-600 mt-1">{CeramicMath.formatCurrency(expenseReport.totalExpenses)}</div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-500">عدد التصنيفات</div>
              <div className="text-xl font-black text-indigo-600 mt-1">{expenseReport.byCategory.length}</div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="font-extrabold text-sm text-slate-900 mb-4">المصروفات حسب التصنيف</h3>
            {expenseReport.byCategory.length > 0 ? (
              <div className="space-y-3">
                {expenseReport.byCategory.map((cat: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 ">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-600 font-bold text-xs flex items-center justify-center">{idx + 1}</div>
                      <span className="font-bold text-sm text-slate-900">{cat.category}</span>
                    </div>
                    <span className="font-black text-rose-600">{CeramicMath.formatCurrency(cat.total)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500 text-xs">لا توجد مصروفات.</div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'inventory' && inventoryReport && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-500">قيمة المخزون (سعر الشراء)</div>
              <div className="text-xl font-black text-slate-900 mt-1">{CeramicMath.formatCurrency(inventoryReport.totalCostValue)}</div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-500">قيمة المخزون (سعر البيع)</div>
              <div className="text-xl font-black text-emerald-600 mt-1">{CeramicMath.formatCurrency(inventoryReport.totalSaleValue)}</div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 ">
              <h3 className="font-extrabold text-sm text-slate-900">قيمة المخزون حسب المخزن</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3.5">المخزن</th>
                    <th className="p-3.5">عدد الأصناف</th>
                    <th className="p-3.5">قيمة الشراء</th>
                    <th className="p-3.5">قيمة البيع</th>
                    <th className="p-3.5">الربح المحتمل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 ">
                  {inventoryReport.byWarehouse.map((wh: any) => (
                    <tr key={wh.warehouseName} className="hover:bg-slate-100">
                      <td className="p-3.5 font-bold">{wh.warehouseName}</td>
                      <td className="p-3.5 text-center font-bold text-sky-600">{wh.items}</td>
                      <td className="p-3.5 font-mono">{CeramicMath.formatCurrency(wh.costValue)}</td>
                      <td className="p-3.5 font-mono text-emerald-600">{CeramicMath.formatCurrency(wh.saleValue)}</td>
                      <td className="p-3.5 font-black text-emerald-600">{CeramicMath.formatCurrency(wh.saleValue - wh.costValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'category' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 ">
              <h3 className="font-extrabold text-sm text-slate-900">أرباح المبيعات حسب التصنيف</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3.5">التصنيف</th>
                    <th className="p-3.5">الكمية المباعة</th>
                    <th className="p-3.5">إجمالي الإيراد</th>
                    <th className="p-3.5">الربح</th>
                    <th className="p-3.5">نسبة الربح</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 ">
                  {categoryReport.length === 0 ? (
                    <tr><td colSpan={5} className="py-12 text-center text-slate-500">لا توجد بيانات.</td></tr>
                  ) : categoryReport.map((cat, idx) => (
                    <tr key={idx} className="hover:bg-slate-100">
                      <td className="p-3.5 font-bold">{cat.categoryName}</td>
                      <td className="p-3.5">{formatProductQuantity(cat.quantityM2, cat)}</td>
                      <td className="p-3.5 font-bold">{CeramicMath.formatCurrency(cat.totalRevenue)}</td>
                      <td className="p-3.5 font-black text-emerald-600">{CeramicMath.formatCurrency(cat.profit)}</td>
                      <td className="p-3.5 font-bold text-sky-600">{cat.totalRevenue > 0 ? ((cat.profit / cat.totalRevenue) * 100).toFixed(1) : 0}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'brand' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 ">
              <h3 className="font-extrabold text-sm text-slate-900">أرباح المبيعات حسب الماركة</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3.5">الماركة</th>
                    <th className="p-3.5">الكمية المباعة</th>
                    <th className="p-3.5">إجمالي الإيراد</th>
                    <th className="p-3.5">الربح</th>
                    <th className="p-3.5">نسبة الربح</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 ">
                  {brandReport.length === 0 ? (
                    <tr><td colSpan={5} className="py-12 text-center text-slate-500">لا توجد بيانات.</td></tr>
                  ) : brandReport.map((br, idx) => (
                    <tr key={idx} className="hover:bg-slate-100">
                      <td className="p-3.5 font-bold">{br.brandName}</td>
                      <td className="p-3.5">{formatProductQuantity(br.quantityM2, br)}</td>
                      <td className="p-3.5 font-bold">{CeramicMath.formatCurrency(br.totalRevenue)}</td>
                      <td className="p-3.5 font-black text-emerald-600">{CeramicMath.formatCurrency(br.profit)}</td>
                      <td className="p-3.5 font-bold text-sky-600">{br.totalRevenue > 0 ? ((br.profit / br.totalRevenue) * 100).toFixed(1) : 0}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
