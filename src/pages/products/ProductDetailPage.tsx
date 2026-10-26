import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Package, Layers, BarChart3, ShoppingBag, DollarSign, GitBranch,
  Image, FileText, History, Activity, Edit, AlertTriangle, Loader2, X, Save,
  Plus, Trash2, Star, Upload, ArrowRight, Boxes, Palette,
} from 'lucide-react';
import { DatabaseManager } from '../../database/db';
import { ProductService } from '../../services/ProductService';
import { ProductExtraService, ProductVariant, ProductImage, ProductDocument } from '../../services/ProductExtraService';
import { BatchService } from '../../services/BatchService';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import { Product, ProductBatch, WarehouseStock } from '../../types';
import { formatProductQuantity, getProductUnitLabel } from '../../utils/productUnits';

type Tab = 'overview' | 'inventory' | 'sales' | 'purchases' | 'pricing' | 'variants' | 'images' | 'documents' | 'history' | 'activity' | 'batches';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'نظرة عامة', icon: Package },
  { id: 'batches', label: 'الدفعات والنغمات', icon: Palette },
  { id: 'inventory', label: 'المخزون', icon: Layers },
  { id: 'sales', label: 'المبيعات', icon: BarChart3 },
  { id: 'purchases', label: 'المشتريات', icon: ShoppingBag },
  { id: 'pricing', label: 'الأسعار', icon: DollarSign },
  { id: 'variants', label: 'الأنواع والمتغيرات', icon: GitBranch },
  { id: 'images', label: 'الصور', icon: Image },
  { id: 'documents', label: 'المستندات', icon: FileText },
  { id: 'history', label: 'السجل', icon: History },
  { id: 'activity', label: 'النشاط', icon: Activity },
];

const GRADE_LABELS: Record<string, string> = { GRADE_1: 'فرز أول', GRADE_2: 'فرز ثاني', GRADE_3: 'فرز ثالث', COMMERCIAL: 'تجاري' };

const SURFACE_LABELS: Record<string, string> = { FLOOR: 'أرضيات', WALL: 'حوائط', OUTDOOR: 'خارجي', GENERAL: 'عام' };

const DOC_TYPES: Record<string, string> = {
  DATASHEET: 'بيانات فنية', CERTIFICATE: 'شهادة', WARRANTY: 'ضمان', CATALOG: 'كتالوج', OTHER: 'أخرى',
};

const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(n ?? 0);
const money = (n: number) => `${fmt(n)} ج.م`;

export const ProductDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const db = DatabaseManager.getInstance();
  const productService = new ProductService();
  const extraService = new ProductExtraService();
  const currentUser = AuthService.getCurrentUser();
  const canEdit = PermissionService.can(currentUser, 'products.update');

  const [tab, setTab] = useState<Tab>('overview');
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [stock, setStock] = useState<{ totalM2: number; totalBoxes: number; totalPieces: number; rows: WarehouseStock[] }>({ totalM2: 0, totalBoxes: 0, totalPieces: 0, rows: [] });
  const [sales, setSales] = useState<Array<{ date: string; customer: string; qty: number; price: number }>>([]);
  const [purchases, setPurchases] = useState<Array<{ date: string; supplier: string; qty: number; cost: number }>>([]);
  const [activity, setActivity] = useState<Array<{ action: string; user: string; at: string; details: string }>>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>(null);

  const load = () => {
    if (!id) return;
    setLoading(true);
    try {
      const p = productService.getProductById(id);
      setProduct(p);
      if (p) {
        const s = productService.getProductStockSummary(id);
        setStock({ totalM2: s.totalM2, totalBoxes: s.totalBoxes, totalPieces: s.totalPieces, rows: s.byWarehouse });

        setSales(db.query(
          `SELECT si.date AS date, COALESCE(cu.name, 'عميل نقدي') AS customer,
                  sii.quantity_m2 AS qty, sii.total_price AS price
           FROM sales_invoice_items sii
           JOIN sales_invoices si ON si.id = sii.invoice_id
           LEFT JOIN customers cu ON cu.id = si.customer_id
           WHERE sii.product_id = ? AND si.invoice_status != 'VOID'
           ORDER BY si.date DESC, si.created_at DESC LIMIT 15`, [id]
        ));

        setPurchases(db.query(
          `SELECT pi.date AS date, COALESCE(s.name, '—') AS supplier,
                  pii.quantity_m2 AS qty, pii.total_cost AS cost
           FROM purchase_invoice_items pii
           JOIN purchase_invoices pi ON pi.id = pii.invoice_id
           LEFT JOIN suppliers s ON s.id = pi.supplier_id
           WHERE pii.product_id = ?
           ORDER BY pi.date DESC, pi.created_at DESC LIMIT 15`, [id]
        ));

        setActivity(db.query(
          `SELECT action, user_name AS user, created_at AS at, COALESCE(new_values, '') AS details
           FROM audit_logs WHERE module = 'PRODUCTS' AND (record_id = ? OR new_values LIKE ?)
           ORDER BY created_at DESC LIMIT 30`, [id, `%${id}%`]
        ));
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const openEdit = () => {
    if (!product) return;
    setForm({
      name: product.name, size: product.size, color: product.color || '', finish: product.finish || '',
      thickness: String(product.thickness || 0),
      costPrice: String(product.costPrice), sellingPriceM2: String(product.sellingPriceM2),
      sellingPriceBox: String(product.sellingPriceBox), wholesalePriceM2: String(product.wholesalePriceM2),
      minSellingPriceM2: String(product.minSellingPriceM2), minStockLevel: String(product.minStockLevel),
      maxStockLevel: String(product.maxStockLevel || 0),
      piecesPerBox: String(product.piecesPerBox), metersPerBox: String(product.metersPerBox),
      isActive: product.isActive,
    });
    setEditOpen(true);
  };

  const saveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!product || !form) return;
    if (!form.name.trim()) return alert('اسم المنتج مطلوب.');
    setSaving(true);
    try {
      productService.updateProduct(product.id, {
        name: form.name.trim(), size: form.size, color: form.color || undefined,
        finish: form.finish || undefined, thickness: Number(form.thickness) || 0,
        piecesPerBox: Number(form.piecesPerBox) || 1,
        metersPerBox: Number(form.metersPerBox) || 0,
        costPrice: Number(form.costPrice) || 0,
        sellingPriceM2: Number(form.sellingPriceM2) || 0,
        sellingPriceBox: Number(form.sellingPriceBox) || 0,
        wholesalePriceM2: Number(form.wholesalePriceM2) || 0,
        minSellingPriceM2: Number(form.minSellingPriceM2) || 0,
        minStockLevel: Number(form.minStockLevel) || 0,
        maxStockLevel: Number(form.maxStockLevel) || 0,
        isActive: form.isActive,
      });
      setEditOpen(false);
      load();
    } catch (err: any) { alert(err?.message || 'تعذر حفظ المنتج.'); }
    finally { setSaving(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full bg-slate-50"><Loader2 className="w-8 h-8 animate-spin text-sky-600" /></div>
  );

  if (!product) return (
    <div className="flex flex-col items-center justify-center h-full bg-slate-50 gap-4">
      <AlertTriangle className="w-12 h-12 text-amber-600" />
      <p className="text-slate-700">المنتج غير موجود</p>
      <button onClick={() => navigate('/products')} className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm">العودة للمنتجات</button>
    </div>
  );

  const margin = product.costPrice > 0 ? ((product.sellingPriceM2 - product.costPrice) / product.costPrice) * 100 : null;

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/products')} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-100" title="رجوع">
              <ArrowRight className="w-4 h-4" />
            </button>
            <div className="w-14 h-14 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center"><Package className="w-7 h-7 text-sky-600" /></div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${product.isActive ? 'bg-emerald-500/10 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}>{product.isActive ? 'نشط' : 'غير نشط'}</span>
                {product.productType !== 'GENERAL' && <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-600 font-bold">{GRADE_LABELS[product.grade] || product.grade}</span>}
              </div>
              <h1 className="text-lg font-black text-slate-900">{product.name}</h1>
              <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                <span>#{product.sku}</span>
                <span>باركود: {product.barcode}</span>
                {product.categoryName && <span>{product.categoryName}</span>}
                {product.brandName && <span>{product.brandName}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <div className="text-center px-3 py-2 bg-slate-100 rounded-xl">
              <div className="text-base font-black text-sky-600">{fmt(stock.totalM2)}</div>
              <div className="text-[10px] text-slate-500">{product.productType === 'GENERAL' ? `${getProductUnitLabel(product)} متاح` : 'م² متاح'}</div>
            </div>
            {product.productType !== 'GENERAL' && <div className="text-center px-3 py-2 bg-slate-100 rounded-xl">
              <div className="text-base font-black text-slate-700">{fmt(stock.totalBoxes)}</div>
              <div className="text-[10px] text-slate-500">كرتونة</div>
            </div>}
            {product.productType !== 'GENERAL' && <div className="text-center px-3 py-2 bg-slate-100 rounded-xl">
              <div className="text-base font-black text-slate-700">{fmt(stock.totalPieces)}</div>
              <div className="text-[10px] text-slate-500">قطعة</div>
            </div>}
            {canEdit && (
              <button onClick={openEdit} className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-sm font-semibold transition">
                <Edit className="w-4 h-4" /> تعديل
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-1 mt-4 overflow-x-auto">
          {TABS.filter((t) => t.id !== 'batches' || product.productType !== 'GENERAL').map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${tab === t.id ? 'bg-sky-600 text-white shadow-md shadow-sky-600/20' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}>
                <Icon className="w-3.5 h-3.5" /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-bold text-slate-900 mb-4">البيانات الأساسية</h3>
              <dl className="space-y-3">
                {[
                  { label: 'المقاس', value: product.size },
                  { label: 'السمكة', value: product.thickness ? `${product.thickness} سم` : '' },
                  { label: 'اللون', value: product.color },
                  { label: 'التشطيب', value: product.finish },
                  { label: 'مكان الاستخدام', value: SURFACE_LABELS[product.surfaceLocation || ''] || product.surfaceLocation },
                  ...(product.productType === 'GENERAL'
                    ? [{ label: 'وحدة الصنف', value: getProductUnitLabel(product) }]
                    : [{ label: 'عدد القطع بالكرتونة', value: product.piecesPerBox }, { label: 'م²/كرتونة', value: product.metersPerBox }]),
                  { label: 'وزن الكرتونة', value: product.weightPerBox ? `${product.weightPerBox} كجم` : '' },
                ].filter((r) => r.value).map((row) => (
                  <div key={row.label} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
                    <dt className="text-xs text-slate-500">{row.label}</dt>
                    <dd className="text-sm font-semibold text-slate-900">{String(row.value)}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-bold text-slate-900 mb-4">الأسعار</h3>
              <div className="space-y-3">
                {[
                  { label: 'سعر التكلفة', value: product.costPrice, color: 'text-rose-600' },
                  { label: `سعر البيع (${getProductUnitLabel(product)})`, value: product.sellingPriceM2, color: 'text-sky-600' },
                  ...(product.productType === 'GENERAL' ? [] : [
                    { label: 'سعر البيع (كرتونة)', value: product.sellingPriceBox, color: 'text-sky-600' },
                    { label: 'سعر الجملة (م²)', value: product.wholesalePriceM2, color: 'text-violet-600' },
                    { label: 'أقل سعر بيع (م²)', value: product.minSellingPriceM2, color: 'text-amber-600' },
                  ]),
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <span className="text-xs text-slate-500">{row.label}</span>
                    <span className={`text-sm font-black ${row.color}`}>{money(row.value)}</span>
                  </div>
                ))}
                <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 flex justify-between">
                  <span className="text-xs text-slate-700">هامش الربح</span>
                  <span className="text-sm font-black text-emerald-600">{margin === null ? '—' : `${margin.toFixed(1)}%`}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'inventory' && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200"><h3 className="text-sm font-bold text-slate-900">توزيع المخزون بالمخازن</h3></div>
            {stock.rows.length === 0 ? <div className="text-center text-slate-500 py-12 text-sm">لا توجد كميات مخزنة</div> : (
              <table className="w-full text-sm text-right">
                <thead className="bg-slate-50"><tr>{(product.productType === 'GENERAL'
                  ? ['المخزن', getProductUnitLabel(product), 'محجوز', 'متاح']
                  : ['المخزن', 'م²', 'كرتونة', 'قطعة', 'محجوز', 'متاح']).map((h) => <th key={h} className="px-4 py-3 text-xs font-bold text-slate-500">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {stock.rows.map((r) => {
                    const boxes = product.productType === 'GENERAL' ? 0 : Number((r.quantityM2 / (product.metersPerBox || 1)).toFixed(2));
                    const pieces = product.productType === 'GENERAL' ? 0 : Math.round(boxes * (product.piecesPerBox || 1));
                    return (
                      <tr key={r.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3 font-medium text-slate-900">{r.warehouseName}</td>
                        <td className="px-4 py-3 text-sky-600 font-bold">{product.productType === 'GENERAL' ? formatProductQuantity(r.quantityM2, product) : fmt(r.quantityM2)}</td>
                        {product.productType !== 'GENERAL' && <>
                          <td className="px-4 py-3 text-slate-700">{fmt(boxes)}</td>
                          <td className="px-4 py-3 text-slate-700">{fmt(pieces)}</td>
                        </>}
                        <td className="px-4 py-3 text-amber-600">{fmt(r.reservedM2)}</td>
                        <td className="px-4 py-3 text-emerald-600 font-bold">{product.productType === 'GENERAL' ? formatProductQuantity(r.availableM2, product) : fmt(r.availableM2)}</td>
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-50 font-bold">
                    <td className="px-4 py-3 text-slate-900">الإجمالي</td>
                    <td className="px-4 py-3 text-sky-600">{fmt(stock.totalM2)}</td>
                    {product.productType !== 'GENERAL' && <>
                      <td className="px-4 py-3 text-slate-700">{fmt(stock.totalBoxes)}</td>
                      <td className="px-4 py-3 text-slate-700">{fmt(stock.totalPieces)}</td>
                    </>}
                    <td className="px-4 py-3"></td>
                    <td className="px-4 py-3"></td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'sales' && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200"><h3 className="text-sm font-bold text-slate-900">آخر المبيعات (أحدث 15 حركة)</h3></div>
            {sales.length === 0 ? <div className="text-center text-slate-500 py-12 text-sm">لا توجد مبيعات</div> : (
              <table className="w-full text-sm text-right">
                <thead className="bg-slate-50"><tr>{['التاريخ', 'العميل', `الكمية (${getProductUnitLabel(product)})`, 'الإجمالي'].map((h) => <th key={h} className="px-4 py-3 text-xs font-bold text-slate-500">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {sales.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 text-slate-500">{r.date}</td>
                      <td className="px-4 py-3 text-slate-900 font-medium">{r.customer}</td>
                      <td className="px-4 py-3 text-slate-700">{formatProductQuantity(r.qty, product)}</td>
                      <td className="px-4 py-3 text-sky-600 font-bold">{money(r.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'purchases' && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200"><h3 className="text-sm font-bold text-slate-900">آخر المشتريات (أحدث 15 حركة)</h3></div>
            {purchases.length === 0 ? <div className="text-center text-slate-500 py-12 text-sm">لا توجد مشتريات</div> : (
              <table className="w-full text-sm text-right">
                <thead className="bg-slate-50"><tr>{['التاريخ', 'المورد', `الكمية (${getProductUnitLabel(product)})`, 'التكلفة'].map((h) => <th key={h} className="px-4 py-3 text-xs font-bold text-slate-500">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {purchases.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 text-slate-500">{r.date}</td>
                      <td className="px-4 py-3 text-slate-900 font-medium">{r.supplier}</td>
                      <td className="px-4 py-3 text-slate-700">{formatProductQuantity(r.qty, product)}</td>
                      <td className="px-4 py-3 text-rose-600 font-bold">{money(r.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'pricing' && (
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-bold text-slate-900 mb-4">قوائم الأسعار المرتبطة بالمنتج</h3>
            <PriceListsForProduct productId={product.id} unitLabel={getProductUnitLabel(product)} />
          </div>
        )}

        {tab === 'batches' && <BatchesTab productId={product.id} canEdit={canEdit} />}

        {tab === 'variants' && <VariantsTab productId={product.id} canEdit={canEdit} />}

        {tab === 'images' && <ImagesTab productId={product.id} canEdit={canEdit} />}

        {tab === 'documents' && <DocumentsTab productId={product.id} canEdit={canEdit} />}

        {tab === 'history' && (
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-bold text-slate-900 mb-4">حركات المخزون</h3>
            <InventoryHistory productId={product.id} unitLabel={getProductUnitLabel(product)} />
          </div>
        )}

        {tab === 'activity' && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200"><h3 className="text-sm font-bold text-slate-900">سجل النشاط</h3></div>
            {activity.length === 0 ? <div className="text-center text-slate-500 py-12 text-sm">لا توجد سجلات</div> : (
              <ul className="divide-y divide-slate-100">
                {activity.map((a, i) => (
                  <li key={i} className="px-4 py-3 flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs font-bold text-slate-800">{a.action}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{a.user || '—'}</div>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 shrink-0">{a.at ? new Date(a.at).toLocaleString('ar-EG') : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {editOpen && form && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold text-slate-900">تعديل المنتج</h3>
              <button onClick={() => setEditOpen(false)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={saveEdit} className="space-y-3 text-xs">
              <div><label className="font-bold text-slate-700 block mb-1">اسم المنتج *</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-semibold" /></div>
              <div className="grid grid-cols-3 gap-2">
                <div><label className="font-bold text-slate-700 block mb-1">المقاس</label><input value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
                <div><label className="font-bold text-slate-700 block mb-1">اللون</label><input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
                <div><label className="font-bold text-slate-700 block mb-1">التشطيب</label><input value={form.finish} onChange={(e) => setForm({ ...form, finish: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {product.productType !== 'GENERAL' && <>
                  <div><label className="font-bold text-slate-700 block mb-1">عدد القطع / كرتونة</label><input type="number" min={1} step="1" value={form.piecesPerBox} onChange={(e) => setForm({ ...form, piecesPerBox: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" /></div>
                  <div><label className="font-bold text-slate-700 block mb-1">م² / كرتونة</label><input type="number" min={0} step="0.001" value={form.metersPerBox} onChange={(e) => setForm({ ...form, metersPerBox: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" /></div>
                </>}
                <div><label className="font-bold text-slate-700 block mb-1">سعر التكلفة</label><input type="number" min={0} step="0.01" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" /></div>
                <div><label className="font-bold text-slate-700 block mb-1">سعر البيع ({getProductUnitLabel(product)})</label><input type="number" min={0} step="0.01" value={form.sellingPriceM2} onChange={(e) => setForm({ ...form, sellingPriceM2: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" /></div>
                {product.productType !== 'GENERAL' && <>
                  <div><label className="font-bold text-slate-700 block mb-1">سعر البيع (كرتونة)</label><input type="number" min={0} step="0.01" value={form.sellingPriceBox} onChange={(e) => setForm({ ...form, sellingPriceBox: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" /></div>
                  <div><label className="font-bold text-slate-700 block mb-1">سعر الجملة (م²)</label><input type="number" min={0} step="0.01" value={form.wholesalePriceM2} onChange={(e) => setForm({ ...form, wholesalePriceM2: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" /></div>
                  <div><label className="font-bold text-slate-700 block mb-1">أقل سعر بيع (م²)</label><input type="number" min={0} step="0.01" value={form.minSellingPriceM2} onChange={(e) => setForm({ ...form, minSellingPriceM2: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" /></div>
                </>}
                <div><label className="font-bold text-slate-700 block mb-1">حد الطلب الأدنى</label><input type="number" min={0} step="0.01" value={form.minStockLevel} onChange={(e) => setForm({ ...form, minStockLevel: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" /></div>
                <div><label className="font-bold text-slate-700 block mb-1">أقصى مخزون</label><input type="number" min={0} step="0.01" value={form.maxStockLevel} onChange={(e) => setForm({ ...form, maxStockLevel: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" /></div>
              </div>
              <label className="flex items-center gap-2 text-slate-700 font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 cursor-pointer">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="w-4 h-4 accent-sky-600" /> المنتج نشط
              </label>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setEditOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl">إلغاء</button>
                <button type="submit" disabled={saving} className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl flex items-center gap-2">{saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} حفظ</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const BatchesTab: React.FC<{ productId: string; canEdit: boolean }> = ({ productId, canEdit }) => {
  const batchService = new BatchService();
  const db = DatabaseManager.getInstance();
  const [batches, setBatches] = useState<ProductBatch[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({
    warehouseId: '',
    batchNumber: '',
    toneShade: '',
    caliber: '0',
    quantityM2: '',
    costPrice: '',
    receivedDate: '',
    productionDate: '',
    notes: '',
  });
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () => {
    try {
      setBatches(batchService.getBatchesForProduct(productId));
      setWarehouses(db.query<{ id: string; name: string }>(`SELECT id, name FROM warehouses WHERE is_active = 1 ORDER BY name`));
    } catch (e) { console.error(e); }
  };

  useEffect(() => { load(); }, [productId]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.warehouseId || !form.batchNumber.trim() || !form.toneShade.trim() || !Number(form.quantityM2)) return;
    setSaving(true);
    try {
      batchService.createBatch({
        productId,
        warehouseId:     form.warehouseId,
        batchNumber:     form.batchNumber.trim(),
        toneShade:       form.toneShade.trim(),
        caliber:         form.caliber.trim() || '0',
        quantityM2:      Number(form.quantityM2),
        costPrice:       Number(form.costPrice) || 0,
        receivedDate:    form.receivedDate   || undefined,
        productionDate:  form.productionDate  || undefined,
        notes:           form.notes.trim()    || undefined,
      });
      setForm({ warehouseId: form.warehouseId, batchNumber: '', toneShade: '', caliber: '0', quantityM2: '', costPrice: '', receivedDate: '', productionDate: '', notes: '' });
      setFormOpen(false);
      load();
    } catch (err: any) { alert(err?.message || 'تعذر إضافة الدفعة'); }
    finally { setSaving(false); }
  };

  const handleDelete = (id: string, batchNumber: string) => {
    if (!confirm(`حذف الدفعة "${batchNumber}"؟`)) return;
    try { batchService.deleteBatch(id); load(); } catch (err: any) { alert(err?.message); }
  };

  // تجميع الدفعات حسب مجموعات النغمة/العيار لعرض الملخص
  const toneGroups = batches.reduce<Record<string, { tone: string; caliber: string; totalM2: number; remainingM2: number }>>((acc, b) => {
    const key = `${b.toneShade}||${b.caliber}`;
    if (!acc[key]) acc[key] = { tone: b.toneShade, caliber: b.caliber, totalM2: 0, remainingM2: 0 };
    acc[key].totalM2     += b.quantityM2;
    acc[key].remainingM2 += b.quantityRemainingM2;
    return acc;
  }, {});

  const fmtM2 = (n: number) => n.toFixed(2);

  return (
    <div className="space-y-5">
      {/* ملخص النغمات */}
      {Object.keys(toneGroups).length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2"><Palette className="w-4 h-4 text-violet-500" /> ملخص النغمات المتاحة</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.values(toneGroups).map((g) => (
              <div key={`${g.tone}-${g.caliber}`} className="p-3 rounded-xl border border-slate-100 bg-slate-50">
                <div className="text-xs font-bold text-slate-700 mb-1">
                  نغمة: <span className="text-violet-600">{g.tone}</span>
                  {g.caliber && g.caliber !== '0' && <span className="mr-2 text-amber-600">عيار: {g.caliber}</span>}
                </div>
                <div className="text-base font-black text-sky-600">{fmtM2(g.remainingM2)} م²</div>
                <div className="text-[10px] text-slate-400">مستلم: {fmtM2(g.totalM2)} م²</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* زر إضافة دفعة */}
      {canEdit && (
        <div>
          {!formOpen ? (
            <button
              onClick={() => setFormOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition"
            >
              <Plus className="w-4 h-4" /> تسجيل دفعة / تشغيلة جديدة
            </button>
          ) : (
            <form onSubmit={handleAdd} className="bg-white border border-sky-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Palette className="w-4 h-4 text-sky-500" /> تسجيل دفعة / تشغيلة جديدة</h4>
                <button type="button" onClick={() => setFormOpen(false)} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">المخزن *</label>
                  <select required value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200">
                    <option value="">اختر المخزن</option>
                    {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">رقم التشغيلة / الدفعة *</label>
                  <input required placeholder="مثال: LOT-2024-001" value={form.batchNumber} onChange={(e) => setForm({ ...form, batchNumber: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">نغمة اللون (Shade) *</label>
                  <input required placeholder="مثال: A12 أو Shade-3" value={form.toneShade} onChange={(e) => setForm({ ...form, toneShade: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">العيار (Caliber)</label>
                  <input placeholder="مثال: 0 أو 1" value={form.caliber} onChange={(e) => setForm({ ...form, caliber: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">الكمية (م²) *</label>
                  <input required type="number" min={0.01} step="0.01" placeholder="0.00" value={form.quantityM2} onChange={(e) => setForm({ ...form, quantityM2: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">سعر التكلفة (م²)</label>
                  <input type="number" min={0} step="0.01" placeholder="0.00" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">تاريخ الاستلام</label>
                  <input type="date" value={form.receivedDate} onChange={(e) => setForm({ ...form, receivedDate: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">تاريخ الإنتاج</label>
                  <input type="date" value={form.productionDate} onChange={(e) => setForm({ ...form, productionDate: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" />
                </div>
                <div className="col-span-2 md:col-span-1">
                  <label className="block font-bold text-slate-700 mb-1">ملاحظات</label>
                  <input placeholder="اختياري" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold">إلغاء</button>
                <button type="submit" disabled={saving} className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} حفظ الدفعة
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* جدول الدفعات */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {batches.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <Palette className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-medium">لا توجد دفعات مسجلة لهذا الصنف</p>
            <p className="text-xs text-slate-400 mt-1">سجّل أول دفعة عند استلام الشحنة لتفعيل التتبع وتحذيرات خلط النغمات</p>
          </div>
        ) : (
          <table className="w-full text-sm text-right">
            <thead className="bg-slate-50">
              <tr>
                {['المخزن', 'رقم الدفعة', 'نغمة اللون', 'العيار', 'تاريخ الاستلام', 'الكمية (م²)', 'المتبقي (م²)', 'التكلفة/م²', canEdit ? 'حذف' : ''].filter(Boolean).map((h) => (
                  <th key={h} className="px-4 py-3 text-xs font-bold text-slate-500 text-right">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {batches.map((b) => {
                const consumedPct = b.quantityM2 > 0 ? ((b.quantityM2 - b.quantityRemainingM2) / b.quantityM2) * 100 : 0;
                const isEmpty = b.quantityRemainingM2 <= 0.001;
                return (
                  <tr key={b.id} className={`hover:bg-slate-50/70 ${isEmpty ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 text-slate-600 text-xs">{b.warehouseName || '—'}</td>
                    <td className="px-4 py-3 font-mono font-bold text-slate-800 text-xs">{b.batchNumber}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-violet-100 text-violet-700">
                        <Palette className="w-3 h-3" /> {b.toneShade}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-amber-700 font-bold">{b.caliber || '0'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{b.receivedDate ? new Date(b.receivedDate).toLocaleDateString('ar-EG') : (b.createdAt ? new Date(b.createdAt).toLocaleDateString('ar-EG') : '—')}</td>
                    <td className="px-4 py-3 font-mono text-slate-700">{fmtM2(b.quantityM2)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`font-mono font-bold ${isEmpty ? 'text-slate-400' : 'text-emerald-600'}`}>{fmtM2(b.quantityRemainingM2)}</span>
                        {!isEmpty && (
                          <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.max(0, 100 - consumedPct)}%` }} />
                          </div>
                        )}
                        {isEmpty && <span className="text-[10px] text-slate-400 font-bold">مُستهلكة</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-rose-600 text-xs">{b.costPrice > 0 ? `${b.costPrice.toFixed(2)} ج.م` : '—'}</td>
                    {canEdit && (
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleDelete(b.id, b.batchNumber)}
                          disabled={!isEmpty}
                          title={isEmpty ? 'حذف الدفعة' : 'لا يمكن الحذف — يوجد رصيد'}
                          className={`p-1.5 rounded-lg transition ${isEmpty ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50' : 'text-slate-200 cursor-not-allowed'}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

const VariantsTab: React.FC<{ productId: string; canEdit: boolean }> = ({ productId, canEdit }) => {
  const service = new ProductExtraService();
  const [rows, setRows] = useState<ProductVariant[]>([]);
  const [form, setForm] = useState({ variantName: '', sku: '', barcode: '', color: '', size: '', grade: 'GRADE_1', costPrice: '', sellingPriceM2: '' });

  const load = () => { try { setRows(service.getVariants(productId)); } catch (e) { console.error(e); } };
  useEffect(() => { load(); }, [productId]);

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.variantName.trim() || !form.sku.trim()) return;
    try {
      service.createVariant(productId, {
        variantName: form.variantName.trim(), sku: form.sku.trim(), barcode: form.barcode.trim() || undefined,
        color: form.color || undefined, size: form.size || undefined, grade: form.grade,
        costPrice: Number(form.costPrice) || 0, sellingPriceM2: Number(form.sellingPriceM2) || 0, isActive: true,
      });
      setForm({ variantName: '', sku: '', barcode: '', color: '', size: '', grade: 'GRADE_1', costPrice: '', sellingPriceM2: '' });
      load();
    } catch (err: any) { alert(err?.message || 'تعذر إضافة المتغير'); }
  };

  const remove = (id: string) => {
    if (!confirm('حذف هذا المتغير؟')) return;
    try { service.deleteVariant(id); load(); } catch (err: any) { alert(err?.message); }
  };

  return (
    <div className="space-y-4">
      {canEdit && (
        <form onSubmit={add} className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900 mb-3"><GitBranch className="w-4 h-4 text-sky-600" /> إضافة نوع / متغير</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <input required placeholder="اسم المتغير *" value={form.variantName} onChange={(e) => setForm({ ...form, variantName: e.target.value })} className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold" />
            <input required placeholder="كود SKU *" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" />
            <input placeholder="باركود" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" />
            <input placeholder="اللون" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" />
            <input placeholder="المقاس" value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" />
            <select value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
              {Object.entries(GRADE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input type="number" min={0} step="0.01" placeholder="التكلفة" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" />
            <input type="number" min={0} step="0.01" placeholder="سعر البيع (م²)" value={form.sellingPriceM2} onChange={(e) => setForm({ ...form, sellingPriceM2: e.target.value })} className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" />
          </div>
          <div className="mt-3 flex justify-end">
            <button type="submit" className="flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold"><Plus className="w-4 h-4" /> إضافة</button>
          </div>
        </form>
      )}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {rows.length === 0 ? <div className="text-center text-slate-500 py-10 text-sm">لا توجد متغيرات لهذا المنتج</div> : (
          <table className="w-full text-sm text-right">
            <thead className="bg-slate-50"><tr>{['المتغير', 'SKU / باركود', 'المقاس واللون', 'الفرز', 'التكلفة', 'سعر البيع', canEdit ? 'حذف' : ''].filter(Boolean).map((h) => <th key={h} className="px-4 py-3 text-xs font-bold text-slate-500">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((v) => (
                <tr key={v.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3 font-bold text-slate-900">{v.variantName}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{v.sku}<div className="text-slate-400">{v.barcode || '—'}</div></td>
                  <td className="px-4 py-3 text-slate-600">{v.size || '—'} / {v.color || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{GRADE_LABELS[v.grade || ''] || v.grade || '—'}</td>
                  <td className="px-4 py-3 font-mono text-rose-600">{money(v.costPrice)}</td>
                  <td className="px-4 py-3 font-mono text-sky-600 font-bold">{money(v.sellingPriceM2)}</td>
                  {canEdit && <td className="px-4 py-3"><button onClick={() => remove(v.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"><Trash2 className="w-4 h-4" /></button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

const ImagesTab: React.FC<{ productId: string; canEdit: boolean }> = ({ productId, canEdit }) => {
  const service = new ProductExtraService();
  const [rows, setRows] = useState<ProductImage[]>([]);
  const [filePath, setFilePath] = useState('');
  const [caption, setCaption] = useState('');

  const load = () => { try { setRows(service.getImages(productId)); } catch (e) { console.error(e); } };
  useEffect(() => { load(); }, [productId]);

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!filePath.trim()) return;
    try { service.addImage(productId, filePath.trim(), caption.trim() || undefined); setFilePath(''); setCaption(''); load(); }
    catch (err: any) { alert(err?.message); }
  };

  const remove = (id: string) => {
    if (!confirm('حذف هذه الصورة؟')) return;
    try { service.deleteImage(id); load(); } catch (err: any) { alert(err?.message); }
  };

  const makePrimary = (id: string) => {
    try { service.setPrimaryImage(productId, id); load(); } catch (err: any) { alert(err?.message); }
  };

  return (
    <div className="space-y-4">
      {canEdit && (
        <form onSubmit={add} className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs font-bold text-slate-700 mb-1">مسار الصورة أو رابطها</label>
            <input value={filePath} onChange={(e) => setFilePath(e.target.value)} placeholder="https://... أو C:\\images\\tile.jpg" className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-mono" />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-bold text-slate-700 mb-1">وصف الصورة</label>
            <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="مثال: صورة أمامية" className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs" />
          </div>
          <label className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 cursor-pointer">
            <Upload className="w-4 h-4" /> اختيار ملف
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setFilePath((f as any).path || f.name); }} />
          </label>
          <button type="submit" className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold">إضافة</button>
        </form>
      )}
      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 text-center text-slate-500 py-12 text-sm">لا توجد صور لهذا المنتج</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {rows.map((img) => (
            <div key={img.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="h-36 bg-slate-100 flex items-center justify-center overflow-hidden">
                <img src={img.filePath} alt={img.caption || ''} className="h-full w-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
              </div>
              <div className="p-3 space-y-2">
                <div className="flex items-center gap-1 text-xs font-bold text-slate-800">
                  {img.isPrimary ? <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" /> : <Image className="w-3.5 h-3.5 text-slate-400" />}
                  <span className="truncate">{img.caption || 'صورة المنتج'}</span>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1">
                    {!img.isPrimary && <button onClick={() => makePrimary(img.id)} className="text-[10px] font-bold text-sky-600 hover:bg-sky-50 rounded-lg px-2 py-1">تعيين كرئيسية</button>}
                    <button onClick={() => remove(img.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 ml-auto"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const DocumentsTab: React.FC<{ productId: string; canEdit: boolean }> = ({ productId, canEdit }) => {
  const service = new ProductExtraService();
  const [rows, setRows] = useState<ProductDocument[]>([]);
  const [form, setForm] = useState({ filePath: '', fileName: '', documentType: 'OTHER' });

  const load = () => { try { setRows(service.getDocuments(productId)); } catch (e) { console.error(e); } };
  useEffect(() => { load(); }, [productId]);

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.filePath.trim()) return;
    try {
      service.addDocument(productId, form.filePath.trim(), form.fileName.trim() || form.filePath.split(/[\\/]/).pop() || 'ملف', form.documentType);
      setForm({ filePath: '', fileName: '', documentType: 'OTHER' });
      load();
    } catch (err: any) { alert(err?.message); }
  };

  const remove = (id: string) => {
    if (!confirm('حذف هذا المستند؟')) return;
    try { service.deleteDocument(id); load(); } catch (err: any) { alert(err?.message); }
  };

  return (
    <div className="space-y-4">
      {canEdit && (
        <form onSubmit={add} className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs font-bold text-slate-700 mb-1">مسار المستند أو رابطها</label>
            <input value={form.filePath} onChange={(e) => setForm({ ...form, filePath: e.target.value })} placeholder="C:\\docs\\datasheet.pdf" className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-mono" />
          </div>
          <div className="min-w-[160px]">
            <label className="block text-xs font-bold text-slate-700 mb-1">اسم المستند</label>
            <input value={form.fileName} onChange={(e) => setForm({ ...form, fileName: e.target.value })} placeholder="ملف البيانات الفنية" className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs" />
          </div>
          <div className="min-w-[140px]">
            <label className="block text-xs font-bold text-slate-700 mb-1">النوع</label>
            <select value={form.documentType} onChange={(e) => setForm({ ...form, documentType: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold">
              {Object.entries(DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 cursor-pointer">
            <Upload className="w-4 h-4" /> اختيار ملف
            <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setForm((prev) => ({ ...prev, filePath: (f as any).path || f.name, fileName: prev.fileName || f.name })); }} />
          </label>
          <button type="submit" className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold">إضافة</button>
        </form>
      )}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {rows.length === 0 ? <div className="text-center text-slate-500 py-12 text-sm">لا توجد مستندات لهذا المنتج</div> : (
          <table className="w-full text-sm text-right">
            <thead className="bg-slate-50"><tr>{['المستند', 'النوع', 'المسار', 'التاريخ', canEdit ? 'حذف' : ''].filter(Boolean).map((h) => <th key={h} className="px-4 py-3 text-xs font-bold text-slate-500">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3 font-bold text-slate-900 flex items-center gap-2"><FileText className="w-4 h-4 text-sky-500" /> {d.fileName}</td>
                  <td className="px-4 py-3 text-slate-600">{DOC_TYPES[d.documentType] || d.documentType}</td>
                  <td className="px-4 py-3 text-xs font-mono text-slate-500 max-w-[260px] truncate">{d.filePath}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{d.createdAt ? new Date(d.createdAt).toLocaleDateString('ar-EG') : '—'}</td>
                  {canEdit && <td className="px-4 py-3"><button onClick={() => remove(d.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"><Trash2 className="w-4 h-4" /></button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

const PriceListsForProduct: React.FC<{ productId: string; unitLabel: string }> = ({ productId, unitLabel }) => {
  const rows = DatabaseManager.getInstance().query<{ id: string; name: string; priceM2: number; currency: string }>(
    `SELECT pl.id, pl.name, pli.price_m2 AS priceM2, pl.currency
     FROM price_list_items pli JOIN price_lists pl ON pl.id = pli.price_list_id
     WHERE pli.product_id = ? ORDER BY pl.name`, [productId]
  );
  if (rows.length === 0) return <div className="text-center text-slate-500 py-8 text-sm">لا توجد قوائم أسعار مرتبطة</div>;
  return (
    <table className="w-full text-sm text-right">
      <thead className="bg-slate-50"><tr>{['قائمة الأسعار', `السعر (${unitLabel})`, 'العملة'].map((h) => <th key={h} className="px-4 py-2 text-xs font-bold text-slate-500">{h}</th>)}</tr></thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((r) => (
          <tr key={r.id}><td className="px-4 py-2 font-medium">{r.name}</td><td className="px-4 py-2 font-mono text-sky-600 font-bold">{r.priceM2}</td><td className="px-4 py-2 text-slate-500">{r.currency}</td></tr>
        ))}
      </tbody>
    </table>
  );
};

const InventoryHistory: React.FC<{ productId: string; unitLabel: string }> = ({ productId, unitLabel }) => {
  const rows = DatabaseManager.getInstance().query<{ date: string; type: string; qty: number; warehouseName: string; notes: string }>(
    `SELECT it.created_at AS date, it.type, it.quantity_m2 AS qty, w.name AS warehouseName, COALESCE(it.notes, '') AS notes
     FROM inventory_transactions it LEFT JOIN warehouses w ON w.id = it.warehouse_id
     WHERE it.product_id = ? ORDER BY it.created_at DESC LIMIT 50`, [productId]
  );
  if (rows.length === 0) return <div className="text-center text-slate-500 py-8 text-sm">لا توجد حركات مخزون</div>;
  return (
    <table className="w-full text-sm text-right">
      <thead className="bg-slate-50"><tr>{['التاريخ', 'النوع', 'المخزن', `الكمية (${unitLabel})`, 'ملاحظات'].map((h) => <th key={h} className="px-4 py-2 text-xs font-bold text-slate-500">{h}</th>)}</tr></thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((r, i) => (
          <tr key={i}><td className="px-4 py-2 text-slate-500">{r.date ? new Date(r.date).toLocaleString('ar-EG') : '—'}</td><td className="px-4 py-2 font-bold text-slate-700">{r.type}</td><td className="px-4 py-2 text-slate-600">{r.warehouseName || '—'}</td><td className="px-4 py-2 font-mono">{r.qty} {unitLabel}</td><td className="px-4 py-2 text-slate-500 max-w-[240px] truncate">{r.notes}</td></tr>
        ))}
      </tbody>
    </table>
  );
};
