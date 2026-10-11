import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Users, ShoppingCart, FileText, Package2, CreditCard,
  RotateCcw as RotateCcl, Banknote, Boxes, Activity, FileText as Doc,
  Clock, Edit, Phone, MapPin, AlertTriangle, TrendingUp
} from 'lucide-react';
import { DatabaseManager } from '../../database/db';
import { format } from 'date-fns';

type Tab = 'overview' | 'sales' | 'quotations' | 'orders' | 'payments' | 'returns' | 'debts' | 'projects' | 'activities' | 'documents' | 'timeline';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview',   label: 'نظرة عامة',   icon: Users },
  { id: 'sales',      label: 'المبيعات',     icon: ShoppingCart },
  { id: 'quotations', label: 'عروض الأسعار', icon: FileText },
  { id: 'orders',     label: 'الطلبات',      icon: Package2 },
  { id: 'payments',   label: 'المدفوعات',    icon: CreditCard },
  { id: 'returns',    label: 'المرتجعات',    icon: RotateCcl },
  { id: 'debts',      label: 'الديون',       icon: Banknote },
  { id: 'projects',   label: 'المشاريع',     icon: Boxes },
  { id: 'activities', label: 'الأنشطة',      icon: Activity },
  { id: 'documents',  label: 'المستندات',    icon: Doc },
  { id: 'timeline',   label: 'الجدول الزمني', icon: Clock },
];

interface Customer {
  id: string; name: string; phone: string; phone2: string;
  address: string; national_id: string; email: string;
  credit_limit: number; balance: number; is_active: number;
  notes: string; created_at: string;
}

interface SalesRow {
  invoice_number: string; date: string; total: number;
  paid: number; remaining: number; status: string;
}

export const CustomerDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [sales, setSales] = useState<SalesRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalSales: 0, totalPaid: 0, invoiceCount: 0 });

  useEffect(() => {
    if (!id) return;
    const db = DatabaseManager.getInstance().getDatabase();
    if (!db) return;
    setLoading(true);
    try {
      const cRows = db.exec(`SELECT * FROM customers WHERE id = ?`, [id]);
      if (cRows[0]?.values[0]) {
        const cols = cRows[0].columns;
        const vals = cRows[0].values[0];
        const obj: Record<string, unknown> = {};
        cols.forEach((c: string, i: number) => { obj[c] = vals[i]; });
        setCustomer(obj as unknown as Customer);
      }

      const statsRows = db.exec(
        `SELECT COUNT(*), COALESCE(SUM(total_amount),0), COALESCE(SUM(paid_amount),0)
         FROM sales_invoices WHERE customer_id = ? AND status != 'CANCELLED'`, [id]
      );
      if (statsRows[0]?.values[0]) {
        const [count, total, paid] = statsRows[0].values[0];
        setStats({ invoiceCount: count as number, totalSales: total as number, totalPaid: paid as number });
      }

      const salesRows = db.exec(
        `SELECT invoice_number, created_at, total_amount, paid_amount,
                (total_amount - paid_amount) as remaining, payment_status
         FROM sales_invoices WHERE customer_id = ? AND status != 'CANCELLED'
         ORDER BY created_at DESC LIMIT 20`, [id]
      );
      setSales(salesRows[0]?.values.map((row: any[]) => {
        const [inv, d, tot, paid, rem, st] = row;
        return {
          invoice_number: inv as string,
          date: format(new Date(d as string), 'dd/MM/yyyy'),
          total: tot as number,
          paid: paid as number,
          remaining: rem as number,
          status: st as string,
        };
      }) ?? []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [id]);

  const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(n ?? 0) + ' ج';
  const payStatus: Record<string, string> = {
    PAID: 'bg-emerald-500/20 text-emerald-400',
    PARTIAL: 'bg-amber-500/20 text-amber-400',
    UNPAID: 'bg-rose-500/20 text-rose-400',
  };
  const payLabel: Record<string, string> = { PAID: 'مدفوع', PARTIAL: 'جزئي', UNPAID: 'آجل' };

  if (loading) return <div className="flex items-center justify-center h-full bg-slate-950"><div className="w-8 h-8 bg-sky-600 rounded-xl animate-bounce" /></div>;
  if (!customer) return (
    <div className="flex flex-col items-center justify-center h-full bg-slate-950 gap-4">
      <AlertTriangle className="w-10 h-10 text-amber-400" />
      <p className="text-slate-300">العميل غير موجود</p>
      <button onClick={() => navigate('/customers')} className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm">رجوع</button>
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-tr from-pink-500/20 to-violet-500/10 border border-pink-500/20 flex items-center justify-center">
              <span className="text-xl font-black text-pink-400">{customer.name[0]}</span>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${customer.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
                  {customer.is_active ? 'نشط' : 'غير نشط'}
                </span>
                {customer.balance > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 font-bold">
                    مديون {fmt(customer.balance)}
                  </span>
                )}
              </div>
              <h1 className="text-lg font-black text-white">{customer.name}</h1>
              <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                {customer.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{customer.phone}</span>}
                {customer.address && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{customer.address}</span>}
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="flex items-center gap-2">
            {[
              { label: 'إجمالي المشتريات', value: fmt(stats.totalSales), color: 'text-sky-400' },
              { label: 'الفواتير', value: String(stats.invoiceCount), color: 'text-violet-400' },
              { label: 'الرصيد المستحق', value: fmt(customer.balance), color: customer.balance > 0 ? 'text-rose-400' : 'text-emerald-400' },
            ].map(s => (
              <div key={s.label} className="text-center px-4 py-2 bg-slate-800 rounded-xl">
                <div className={`text-base font-black ${s.color}`}>{s.value}</div>
                <div className="text-[10px] text-slate-400">{s.label}</div>
              </div>
            ))}
            <button className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-sm font-semibold transition">
              <Edit className="w-4 h-4" />تعديل
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4 overflow-x-auto">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  tab === t.id ? 'bg-sky-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />{t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
              <h3 className="text-sm font-bold text-white mb-4">البيانات الأساسية</h3>
              <dl className="space-y-3">
                {[
                  { label: 'الاسم', value: customer.name },
                  { label: 'الهاتف', value: customer.phone },
                  { label: 'هاتف إضافي', value: customer.phone2 },
                  { label: 'البريد الإلكتروني', value: customer.email },
                  { label: 'العنوان', value: customer.address },
                  { label: 'الرقم القومي', value: customer.national_id },
                  { label: 'حد الائتمان', value: customer.credit_limit ? fmt(customer.credit_limit) : 'غير محدد' },
                  { label: 'تاريخ التسجيل', value: format(new Date(customer.created_at), 'dd/MM/yyyy') },
                ].filter(r => r.value).map(row => (
                  <div key={row.label} className="flex justify-between py-1.5 border-b border-slate-800 last:border-0">
                    <dt className="text-xs text-slate-400">{row.label}</dt>
                    <dd className="text-sm font-semibold text-white text-left">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
              <h3 className="text-sm font-bold text-white mb-4">ملخص الحساب</h3>
              <div className="space-y-3">
                {[
                  { label: 'إجمالي المشتريات', value: fmt(stats.totalSales), color: 'text-sky-400' },
                  { label: 'إجمالي المدفوع', value: fmt(stats.totalPaid), color: 'text-emerald-400' },
                  { label: 'الرصيد المستحق', value: fmt(customer.balance), color: customer.balance > 0 ? 'text-rose-400' : 'text-emerald-400' },
                  { label: 'عدد الفواتير', value: String(stats.invoiceCount), color: 'text-violet-400' },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                    <span className="text-xs text-slate-400">{row.label}</span>
                    <span className={`text-sm font-black ${row.color}`}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'sales' && (
          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white">فواتير المبيعات</h3>
            </div>
            {sales.length === 0 ? (
              <div className="text-center text-slate-500 py-12 text-sm">لا توجد فواتير</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-800/50">
                  <tr>{['رقم الفاتورة', 'التاريخ', 'الإجمالي', 'المدفوع', 'المتبقي', 'الحالة'].map(h => (
                    <th key={h} className="px-4 py-3 text-right text-xs font-bold text-slate-400">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {sales.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-800/30 transition">
                      <td className="px-4 py-3 font-mono text-sky-400">{r.invoice_number}</td>
                      <td className="px-4 py-3 text-slate-400">{r.date}</td>
                      <td className="px-4 py-3 text-white font-bold">{fmt(r.total)}</td>
                      <td className="px-4 py-3 text-emerald-400">{fmt(r.paid)}</td>
                      <td className="px-4 py-3 text-rose-400">{r.remaining > 0 ? fmt(r.remaining) : '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${payStatus[r.status] ?? 'bg-slate-700 text-slate-300'}`}>
                          {payLabel[r.status] ?? r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {!['overview', 'sales'].includes(tab) && (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-slate-500">
            <Users className="w-10 h-10 opacity-30" />
            <p className="text-sm">هذا القسم قيد التطوير</p>
          </div>
        )}
      </div>
    </div>
  );
};
