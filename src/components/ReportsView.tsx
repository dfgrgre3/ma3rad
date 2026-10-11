import React, { useState, useEffect } from 'react';
import { BarChart3, Calendar, DollarSign, Package, ShoppingCart, Truck, PieChart } from 'lucide-react';
import { SalesService } from '../services/SalesService';
import { AccountingService } from '../services/AccountingService';
import { SalesInvoice } from '../types';
import { CeramicMath } from '../utils/ceramicMath';
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

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      <div>
        <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">التقارير المالية المتقدمة</h2>
        <p className="text-xs text-slate-500">تقارير شاملة للمبيعات والمشتريات والمصروفات والأرباح</p>
      </div>

      <div className="flex gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl overflow-x-auto">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${activeTab === tab.id ? 'bg-white dark:bg-slate-900 text-sky-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <Icon className="w-4 h-4" />{tab.label}
            </button>
          );
        })}
      </div>

      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap items-center gap-4 text-xs font-bold">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400" />
          <span className="text-slate-500">من:</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-500">إلى:</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700" />
        </div>
        <button onClick={() => { setDateFrom(''); setDateTo(''); }}
          className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-400">إعادة ضبط</button>
      </div>

      {activeTab === 'sales' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="text-xs font-bold text-slate-500">إجمالي المبيعات</div>
              <div className="text-xl font-black text-slate-900 dark:text-white mt-1">{CeramicMath.formatCurrency(totalSales)}</div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="text-xs font-bold text-slate-500">تكلفة البضاعة (COGS)</div>
              <div className="text-xl font-black text-slate-600 dark:text-slate-400 mt-1">{CeramicMath.formatCurrency(totalCost)}</div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="text-xs font-bold text-slate-500">الربح المحقق</div>
              <div className="text-xl font-black text-emerald-600 mt-1">{CeramicMath.formatCurrency(totalGrossProfit)}</div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="text-xs font-bold text-slate-500">المديونيات المتبقية</div>
              <div className="text-xl font-black text-amber-600 mt-1">{CeramicMath.formatCurrency(totalRemaining)}</div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">تفاصيل فواتير المبيعات</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-800">
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
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {invoices.length === 0 ? (
                    <tr><td colSpan={8} className="py-12 text-center text-slate-400">لا توجد فواتير.</td></tr>
                  ) : invoices.map(inv => (
                    <tr key={inv.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
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
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="text-xs font-bold text-slate-500">إجمالي المشتريات</div>
              <div className="text-xl font-black text-slate-900 dark:text-white mt-1">{CeramicMath.formatCurrency(purchaseReport.totalPurchases)}</div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="text-xs font-bold text-slate-500">المسدد للموردين</div>
              <div className="text-xl font-black text-emerald-600 mt-1">{CeramicMath.formatCurrency(purchaseReport.totalPaid)}</div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="text-xs font-bold text-slate-500">المستحق للموردين</div>
              <div className="text-xl font-black text-amber-600 mt-1">{CeramicMath.formatCurrency(purchaseReport.totalRemaining)}</div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">تفاصيل فواتير المشتريات</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-800">
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
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {purchaseReport.invoices.length === 0 ? (
                    <tr><td colSpan={7} className="py-12 text-center text-slate-400">لا توجد فواتير مشتريات.</td></tr>
                  ) : purchaseReport.invoices.map((inv: any) => (
                    <tr key={inv.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
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
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="text-xs font-bold text-slate-500">إجمالي المصروفات</div>
              <div className="text-xl font-black text-red-600 mt-1">{CeramicMath.formatCurrency(expenseReport.totalExpenses)}</div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="text-xs font-bold text-slate-500">عدد التصنيفات</div>
              <div className="text-xl font-black text-indigo-600 mt-1">{expenseReport.byCategory.length}</div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <h3 className="font-extrabold text-sm text-slate-900 dark:text-white mb-4">المصروفات حسب التصنيف</h3>
            {expenseReport.byCategory.length > 0 ? (
              <div className="space-y-3">
                {expenseReport.byCategory.map((cat: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-600 font-bold text-xs flex items-center justify-center">{idx + 1}</div>
                      <span className="font-bold text-sm text-slate-900 dark:text-white">{cat.category}</span>
                    </div>
                    <span className="font-black text-rose-600">{CeramicMath.formatCurrency(cat.total)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400 text-xs">لا توجد مصروفات.</div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'inventory' && inventoryReport && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="text-xs font-bold text-slate-500">قيمة المخزون (سعر الشراء)</div>
              <div className="text-xl font-black text-slate-900 dark:text-white mt-1">{CeramicMath.formatCurrency(inventoryReport.totalCostValue)}</div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="text-xs font-bold text-slate-500">قيمة المخزون (سعر البيع)</div>
              <div className="text-xl font-black text-emerald-600 mt-1">{CeramicMath.formatCurrency(inventoryReport.totalSaleValue)}</div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">قيمة المخزون حسب المخزن</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="p-3.5">المخزن</th>
                    <th className="p-3.5">عدد الأصناف</th>
                    <th className="p-3.5">قيمة الشراء</th>
                    <th className="p-3.5">قيمة البيع</th>
                    <th className="p-3.5">الربح المحتمل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {inventoryReport.byWarehouse.map((wh: any) => (
                    <tr key={wh.warehouseName} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
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
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">أرباح المبيعات حسب التصنيف</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="p-3.5">التصنيف</th>
                    <th className="p-3.5">الكمية المباعة (م²)</th>
                    <th className="p-3.5">إجمالي الإيراد</th>
                    <th className="p-3.5">الربح</th>
                    <th className="p-3.5">نسبة الربح</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {categoryReport.length === 0 ? (
                    <tr><td colSpan={5} className="py-12 text-center text-slate-400">لا توجد بيانات.</td></tr>
                  ) : categoryReport.map((cat, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="p-3.5 font-bold">{cat.categoryName}</td>
                      <td className="p-3.5">{CeramicMath.formatM2(cat.quantityM2)}</td>
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
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">أرباح المبيعات حسب الماركة</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="p-3.5">الماركة</th>
                    <th className="p-3.5">الكمية المباعة (م²)</th>
                    <th className="p-3.5">إجمالي الإيراد</th>
                    <th className="p-3.5">الربح</th>
                    <th className="p-3.5">نسبة الربح</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {brandReport.length === 0 ? (
                    <tr><td colSpan={5} className="py-12 text-center text-slate-400">لا توجد بيانات.</td></tr>
                  ) : brandReport.map((br, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="p-3.5 font-bold">{br.brandName}</td>
                      <td className="p-3.5">{CeramicMath.formatM2(br.quantityM2)}</td>
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
