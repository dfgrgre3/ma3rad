import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Package, Layers, BarChart3, ShoppingBag, DollarSign, GitBranch,
  Image, FileText, History, Activity, ArrowRight, Edit, AlertTriangle
} from 'lucide-react';
import { DatabaseManager } from '../../database/db';

type Tab = 'overview' | 'inventory' | 'sales' | 'purchases' | 'pricing' | 'variants' | 'images' | 'documents' | 'history' | 'activity';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview',   label: 'نظرة عامة',   icon: Package },
  { id: 'inventory',  label: 'المخزون',      icon: Layers },
  { id: 'sales',      label: 'المبيعات',     icon: BarChart3 },
  { id: 'purchases',  label: 'المشتريات',    icon: ShoppingBag },
  { id: 'pricing',    label: 'الأسعار',      icon: DollarSign },
  { id: 'variants',   label: 'المتغيرات',    icon: GitBranch },
  { id: 'images',     label: 'الصور',        icon: Image },
  { id: 'documents',  label: 'المستندات',    icon: FileText },
  { id: 'history',    label: 'السجل',        icon: History },
  { id: 'activity',   label: 'النشاط',       icon: Activity },
];

interface Product {
  id: string; name: string; code: string; barcode: string;
  category_name: string; brand_name: string; size: string;
  thickness: string; sort_grade: string; color: string; finish: string;
  pieces_per_carton: number; m2_per_carton: number;
  purchase_price: number; selling_price_m2: number; selling_price_carton: number;
  wholesale_price: number; min_stock_level: number; is_active: number;
  description: string;
}

export const ProductDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [stockData, setStockData] = useState<{ warehouse: string; qty_m2: number; cartons: number }[]>([]);
  const [salesData, setSalesData] = useState<{ date: string; customer: string; qty: string; price: number }[]>([]);

  useEffect(() => {
    if (!id) return;
    const db = DatabaseManager.getInstance().getDb();
    if (!db) return;

    setLoading(true);
    try {
      const rows = db.exec(
        `SELECT p.*, c.name as category_name, b.name as brand_name
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         LEFT JOIN brands b ON b.id = p.brand_id
         WHERE p.id = ?`, [id]
      );
      if (rows[0]?.values[0]) {
        const cols = rows[0].columns;
        const vals = rows[0].values[0];
        const obj: Record<string, unknown> = {};
        cols.forEach((c: string, i: number) => { obj[c] = vals[i]; });
        setProduct(obj as unknown as Product);
      }

      // Stock per warehouse
      const stockRows = db.exec(
        `SELECT w.name, ws.quantity_m2, ws.quantity_cartons
         FROM warehouse_stock ws JOIN warehouses w ON w.id = ws.warehouse_id
         WHERE ws.product_id = ?`, [id]
      );
      setStockData(stockRows[0]?.values.map((row: any[]) => {
        const [w, m, c] = row;
        return {
          warehouse: w as string, qty_m2: m as number, cartons: c as number,
        };
      }) ?? []);

      // Recent sales
      const salesRows = db.exec(
        `SELECT si.created_at, COALESCE(cu.name,'نقدي') as cname,
                sii.quantity_m2, sii.total_price
         FROM sales_invoice_items sii
         JOIN sales_invoices si ON si.id = sii.invoice_id
         LEFT JOIN customers cu ON cu.id = si.customer_id
         WHERE sii.product_id = ? AND si.status != 'CANCELLED'
         ORDER BY si.created_at DESC LIMIT 15`, [id]
      );
      setSalesData(salesRows[0]?.values.map((row: any[]) => {
        const [d, c, q, p] = row;
        return {
          date: new Date(d as string).toLocaleDateString('ar-EG'),
          customer: c as string,
          qty: `${q} م²`,
          price: p as number,
        };
      }) ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(n ?? 0);

  if (loading) return (
    <div className="flex items-center justify-center h-full bg-slate-950">
      <div className="w-8 h-8 bg-sky-600 rounded-xl animate-bounce" />
    </div>
  );

  if (!product) return (
    <div className="flex flex-col items-center justify-center h-full bg-slate-950 gap-4">
      <AlertTriangle className="w-12 h-12 text-amber-400" />
      <p className="text-slate-300">المنتج غير موجود</p>
      <button onClick={() => navigate('/products')} className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm">
        العودة للمنتجات
      </button>
    </div>
  );

  const totalStock = stockData.reduce((s, r) => s + r.qty_m2, 0);

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden" dir="rtl">
      {/* ── Product Header ──────────────────────────────────────────────────────── */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-tr from-amber-500/20 to-orange-500/10 border border-amber-500/20 flex items-center justify-center">
              <Package className="w-7 h-7 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${product.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
                  {product.is_active ? 'نشط' : 'غير نشط'}
                </span>
                {product.sort_grade && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-400 font-bold">
                    {product.sort_grade}
                  </span>
                )}
              </div>
              <h1 className="text-lg font-black text-white">{product.name}</h1>
              <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                {product.code && <span>#{product.code}</span>}
                {product.barcode && <span>باركود: {product.barcode}</span>}
                {product.category_name && <span>{product.category_name}</span>}
                {product.brand_name && <span>{product.brand_name}</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-center px-4 py-2 bg-slate-800 rounded-xl">
              <div className="text-lg font-black text-sky-400">{fmt(totalStock)}</div>
              <div className="text-[10px] text-slate-400">م² إجمالي</div>
            </div>
            <button
              onClick={() => {/* TODO: edit */}}
              className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-sm font-semibold transition"
            >
              <Edit className="w-4 h-4" />
              تعديل
            </button>
          </div>
        </div>

        {/* ── Tabs ─────────────────────────────────────────────────────────────── */}
        <div className="flex gap-1 mt-4 overflow-x-auto">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  tab === t.id
                    ? 'bg-sky-600 text-white shadow-md shadow-sky-600/20'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tab Content ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* OVERVIEW */}
        {tab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Basic Info */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
              <h3 className="text-sm font-bold text-white mb-4">البيانات الأساسية</h3>
              <dl className="space-y-3">
                {[
                  { label: 'المقاس', value: product.size },
                  { label: 'السماكة', value: product.thickness },
                  { label: 'اللون', value: product.color },
                  { label: 'التشطيب', value: product.finish },
                  { label: 'درجة الفرز', value: product.sort_grade },
                  { label: 'قطع/كرتون', value: product.pieces_per_carton },
                  { label: 'م²/كرتون', value: product.m2_per_carton },
                ].filter(r => r.value).map(row => (
                  <div key={row.label} className="flex items-center justify-between py-1.5 border-b border-slate-800 last:border-0">
                    <dt className="text-xs text-slate-400">{row.label}</dt>
                    <dd className="text-sm font-semibold text-white">{String(row.value)}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Pricing */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
              <h3 className="text-sm font-bold text-white mb-4">الأسعار</h3>
              <div className="space-y-3">
                {[
                  { label: 'سعر الشراء', value: product.purchase_price, color: 'text-rose-400' },
                  { label: 'سعر البيع (م²)', value: product.selling_price_m2, color: 'text-sky-400' },
                  { label: 'سعر البيع (كرتون)', value: product.selling_price_carton, color: 'text-sky-400' },
                  { label: 'سعر الجملة', value: product.wholesale_price, color: 'text-violet-400' },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                    <span className="text-xs text-slate-400">{row.label}</span>
                    <span className={`text-sm font-black ${row.color}`}>{fmt(row.value)} ج</span>
                  </div>
                ))}
                <div className="p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                  <div className="flex justify-between">
                    <span className="text-xs text-slate-300">هامش الربح (م²)</span>
                    <span className="text-sm font-black text-emerald-400">
                      {product.purchase_price > 0
                        ? `${(((product.selling_price_m2 - product.purchase_price) / product.purchase_price) * 100).toFixed(1)}%`
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* INVENTORY */}
        {tab === 'inventory' && (
          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white">رصيد المخزون بالمخازن</h3>
            </div>
            {stockData.length === 0 ? (
              <div className="text-center text-slate-500 py-12 text-sm">لا يوجد مخزون</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-800/50">
                  <tr>
                    {['المخزن', 'م²', 'كراتين'].map(h => (
                      <th key={h} className="px-4 py-3 text-right text-xs font-bold text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {stockData.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-800/30 transition">
                      <td className="px-4 py-3 font-medium text-white">{r.warehouse}</td>
                      <td className="px-4 py-3 text-sky-400 font-bold">{fmt(r.qty_m2)}</td>
                      <td className="px-4 py-3 text-slate-300">{fmt(r.cartons)}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-800/50 font-bold">
                    <td className="px-4 py-3 text-white">الإجمالي</td>
                    <td className="px-4 py-3 text-sky-400">{fmt(totalStock)}</td>
                    <td className="px-4 py-3 text-slate-300">{fmt(stockData.reduce((s,r) => s + r.cartons, 0))}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* SALES */}
        {tab === 'sales' && (
          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white">سجل المبيعات (آخر 15 حركة)</h3>
            </div>
            {salesData.length === 0 ? (
              <div className="text-center text-slate-500 py-12 text-sm">لا توجد مبيعات</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-800/50">
                  <tr>
                    {['التاريخ', 'العميل', 'الكمية', 'الإجمالي'].map(h => (
                      <th key={h} className="px-4 py-3 text-right text-xs font-bold text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {salesData.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-800/30 transition">
                      <td className="px-4 py-3 text-slate-400">{r.date}</td>
                      <td className="px-4 py-3 text-white font-medium">{r.customer}</td>
                      <td className="px-4 py-3 text-slate-300">{r.qty}</td>
                      <td className="px-4 py-3 text-sky-400 font-bold">{fmt(r.price)} ج</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* PLACEHOLDER TABS */}
        {['purchases', 'pricing', 'variants', 'images', 'documents', 'history', 'activity'].includes(tab) && (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-slate-500">
            <Package className="w-10 h-10 opacity-30" />
            <p className="text-sm">هذا القسم قيد التطوير</p>
          </div>
        )}
      </div>
    </div>
  );
};
