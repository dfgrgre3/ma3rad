import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowDownRight, ArrowUpRight, Banknote, CalendarDays, FileText, Package, ShoppingCart, Users } from 'lucide-react';
import { DatabaseManager } from '../../database/db';
import { AnalyticsService } from '../../services/AnalyticsService';
import { formatProductQuantity } from '../../utils/productUnits';

type Summary = { count: number; revenue: number; collected: number; outstanding: number; profit: number };
type ProductRow = { productName: string; quantity: number; revenue: number; productType: 'CERAMIC' | 'GENERAL'; baseUnit: string; customUnit?: string };
type CustomerRow = { name: string; count: number; revenue: number };

const money = (value: number) => new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(value || 0);

export const SalesAnalyticsPage: React.FC = () => {
  const db = DatabaseManager.getInstance();
  const [period, setPeriod] = useState<'today' | '7days' | '30days' | 'all'>('30days');
  const [refresh, setRefresh] = useState(0);
  const range = useMemo(() => {
    const to = new Date();
    const from = new Date(to);
    if (period === 'today') from.setHours(0, 0, 0, 0);
    if (period === '7days') from.setDate(from.getDate() - 6);
    if (period === '30days') from.setDate(from.getDate() - 29);
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { from: period === 'all' ? '' : iso(from), to: iso(to) };
  }, [period, refresh]);
  const [data] = useMemo(() => {
    const where = `WHERE invoice_status = 'COMPLETED' ${range.from ? 'AND date(date) >= date(?)' : ''} AND date(date) <= date(?)`;
    const params = range.from ? [range.from, range.to] : [range.to];
    const financials = db.query<{ count: number; collected: number; outstanding: number }>(`
      SELECT COUNT(*) count, COALESCE(SUM(paid_amount),0) collected,
        COALESCE(SUM(remaining_amount),0) outstanding
      FROM sales_invoices ${where}
    `, params)[0] || { count: 0, collected: 0, outstanding: 0 };
    const returnSettlements = db.query<{ refunded: number; credited: number }>(`
      SELECT COALESCE(SUM(sr.refunded_amount),0) refunded,
        COALESCE(SUM(sr.remaining_to_balance),0) credited
      FROM sales_returns sr JOIN sales_invoices si ON si.id=sr.original_invoice_id
      WHERE sr.date >= ? AND sr.date <= ? AND si.invoice_status='COMPLETED'
    `, [range.from || '0001-01-01', range.to])[0] || { refunded: 0, credited: 0 };
    const analytics = new AnalyticsService().getSalesAnalytics(range.from || '0001-01-01', range.to);
    const productIds = analytics.topProducts.map((product) => product.productId);
    const productMeta = productIds.length
      ? db.query<{ productId: string; productType: 'CERAMIC' | 'GENERAL'; baseUnit: string; customUnit?: string }>(
          `SELECT id AS productId, product_type AS productType, base_unit AS baseUnit, custom_unit AS customUnit FROM products WHERE id IN (${productIds.map(() => '?').join(',')})`,
          productIds
        )
      : [];
    const metaById = new Map(productMeta.map((product) => [product.productId, product]));
    const summary: Summary = {
      count: financials.count,
      revenue: analytics.totalSales,
      collected: Number(financials.collected) - Number(returnSettlements.refunded),
      outstanding: Number(financials.outstanding) - Number(returnSettlements.credited),
      profit: analytics.totalProfit,
    };
    const products: ProductRow[] = analytics.topProducts.map((product) => ({
      ...product,
      productType: metaById.get(product.productId)?.productType || 'GENERAL',
      baseUnit: metaById.get(product.productId)?.baseUnit || 'UNIT',
      customUnit: metaById.get(product.productId)?.customUnit,
    }));
    const customers: CustomerRow[] = analytics.topCustomers.map((customer) => ({
      name: customer.customerName,
      count: customer.orderCount,
      revenue: customer.totalSpent,
    }));
    const daily = analytics.salesByDay.slice(-7).map((entry) => ({
      day: entry.date,
      revenue: entry.amount,
      count: entry.count,
    }));
    return [{ summary, products, customers, daily }];
  }, [db, range, refresh]);
  const avg = data.summary.count ? data.summary.revenue / data.summary.count : 0;
  const maxDaily = Math.max(1, ...data.daily.map(x => Number(x.revenue)));
  const cards = [
    { label: 'إجمالي المبيعات', value: money(data.summary.revenue), note: `${data.summary.count} فاتورة`, icon: ShoppingCart, tone: 'emerald' },
    { label: 'المبالغ المحصلة', value: money(data.summary.collected), note: `${data.summary.revenue ? Math.round(data.summary.collected / data.summary.revenue * 100) : 0}% من المبيعات`, icon: Banknote, tone: 'sky' },
    { label: 'المبالغ المستحقة', value: money(data.summary.outstanding), note: 'رصيد الفواتير الآجلة', icon: ArrowDownRight, tone: 'amber' },
    { label: 'مجمل الربح', value: money(data.summary.profit), note: `متوسط الفاتورة ${money(avg)}`, icon: ArrowUpRight, tone: 'violet' },
  ];

  const toneClasses: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-600',
    sky: 'bg-sky-50 text-sky-600',
    amber: 'bg-amber-50 text-amber-600',
    violet: 'bg-violet-50 text-violet-600',
  };

  return <main className="h-full overflow-y-auto bg-slate-50 p-4 md:p-7" dir="rtl">
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col justify-between gap-4 rounded-3xl bg-gradient-to-l from-slate-950 via-slate-900 to-emerald-950 p-6 text-white shadow-xl md:flex-row md:items-center md:p-8">
        <div><div className="mb-3 flex items-center gap-2 text-emerald-300"><Activity size={18}/><span className="text-sm font-bold">مركز أداء المبيعات</span></div><h1 className="text-2xl font-black md:text-3xl">كل حركة البيع في مكان واحد</h1><p className="mt-2 text-sm text-slate-300">تابع الإيرادات والتحصيل والربحية والعملاء والأصناف الأعلى أداءً.</p></div>
        <div className="flex flex-wrap gap-2"><Link to="/pos" className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-emerald-400">نقطة بيع جديدة</Link><Link to="/sales" className="rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-bold hover:bg-white/15">الفواتير</Link></div>
      </header>
      <section className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm font-bold text-slate-600"><CalendarDays size={17}/> الفترة الزمنية</div><div className="flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">{([['today','اليوم'],['7days','7 أيام'],['30days','30 يومًا'],['all','الكل']] as const).map(([key,label])=><button key={key} onClick={()=>setPeriod(key)} className={`rounded-lg px-3 py-2 text-xs font-bold ${period===key?'bg-slate-900 text-white':'text-slate-500 hover:bg-slate-100'}`}>{label}</button>)}</div></section>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(({label,value,note,icon:Icon,tone})=><article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><div><p className="text-sm font-semibold text-slate-500">{label}</p><p className="mt-3 text-2xl font-black text-slate-900">{value}</p></div><span className={`rounded-xl p-3 ${toneClasses[tone]}`}><Icon size={21}/></span></div><p className="mt-3 text-xs text-slate-500">{note}</p></article>)}</section>
      <section className="grid gap-5 xl:grid-cols-5">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-3"><div className="mb-6 flex items-center justify-between"><div><h2 className="font-extrabold text-slate-900">حركة المبيعات اليومية</h2><p className="mt-1 text-xs text-slate-500">آخر الأيام ضمن الفترة المحددة</p></div><span className="rounded-lg bg-slate-100 p-2 text-slate-500"><Activity size={18}/></span></div>{data.daily.length?<div className="space-y-4">{data.daily.map(row=><div key={row.day} className="grid grid-cols-[80px_1fr_auto] items-center gap-3"><span className="text-xs font-bold text-slate-500">{row.day}</span><div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-l from-emerald-500 to-teal-400" style={{width:`${Math.max(3,Number(row.revenue)/maxDaily*100)}%`}}/></div><span className="min-w-24 text-left text-xs font-extrabold text-slate-700">{money(Number(row.revenue))}</span></div>)}</div>:<Empty text="لا توجد مبيعات في الفترة المحددة"/>}</article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2"><div className="mb-5 flex items-center gap-2"><Package className="text-emerald-600" size={19}/><h2 className="font-extrabold text-slate-900">الأصناف الأعلى مبيعًا</h2></div>{data.products.length?<div className="space-y-3">{data.products.map((p,i)=><div key={p.productName+i} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-xs font-black text-emerald-700 shadow-sm">{i+1}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-800">{p.productName}</p><p className="mt-1 text-xs text-slate-500">{formatProductQuantity(Number(p.quantity), p)}</p></div><b className="text-xs text-slate-700">{money(Number(p.revenue))}</b></div>)}</div>:<Empty text="لا توجد بيانات أصناف"/>}</article>
      </section>
      <section className="grid gap-5 lg:grid-cols-2"><article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-5 flex items-center gap-2"><Users className="text-sky-600" size={19}/><h2 className="font-extrabold text-slate-900">أفضل العملاء</h2></div>{data.customers.length?<div className="divide-y divide-slate-100">{data.customers.map((c,i)=><div key={c.name+i} className="flex items-center justify-between py-3"><div><p className="text-sm font-bold text-slate-800">{c.name}</p><p className="mt-1 text-xs text-slate-500">{c.count} فاتورة</p></div><b className="text-sm text-slate-800">{money(Number(c.revenue))}</b></div>)}</div>:<Empty text="لا يوجد عملاء في الفترة المحددة"/>}</article><article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-5 flex items-center gap-2"><FileText className="text-violet-600" size={19}/><h2 className="font-extrabold text-slate-900">مؤشرات التحصيل</h2></div><div className="space-y-4"><div className="flex justify-between text-sm"><span className="text-slate-500">نسبة التحصيل</span><b className="text-slate-800">{data.summary.revenue?Math.round(data.summary.collected/data.summary.revenue*100):0}%</b></div><div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-sky-500" style={{width:`${Math.min(100,data.summary.revenue?data.summary.collected/data.summary.revenue*100:0)}%`}}/></div><div className="grid grid-cols-2 gap-3 pt-2"><div className="rounded-xl bg-emerald-50 p-4"><p className="text-xs text-emerald-700">تم تحصيله</p><b className="mt-2 block text-lg text-emerald-900">{money(data.summary.collected)}</b></div><div className="rounded-xl bg-amber-50 p-4"><p className="text-xs text-amber-700">متبقي للتحصيل</p><b className="mt-2 block text-lg text-amber-900">{money(data.summary.outstanding)}</b></div></div><p className="text-xs leading-6 text-slate-500">متوسط قيمة الفاتورة: <b className="text-slate-700">{money(avg)}</b> · إجمالي الفواتير: <b className="text-slate-700">{data.summary.count}</b></p></div></article></section>
      <div className="flex justify-center"><button onClick={()=>setRefresh(x=>x+1)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 shadow-sm hover:bg-slate-50">تحديث البيانات</button></div>
    </div>
  </main>;
};

const Empty: React.FC<{text:string}> = ({text}) => <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">{text}</div>;
