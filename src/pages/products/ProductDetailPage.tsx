import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { DatabaseManager } from '../../database/db';
import { ProductService } from '../../services/ProductService';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import { Product } from '../../types';
import { getProductUnitLabel } from '../../utils/productUnits';
import { Tab } from './product-detail/constants';
import {
  StockSummary, SalesRow, PurchaseRow, ActivityRow, ProductEditForm,
} from './product-detail/types';
import { ProductDetailHeader } from './product-detail/ProductDetailHeader';
import { ProductEditModal } from './product-detail/ProductEditModal';
import { OverviewTab } from './product-detail/OverviewTab';
import { InventoryTab } from './product-detail/InventoryTab';
import { SalesTab } from './product-detail/SalesTab';
import { PurchasesTab } from './product-detail/PurchasesTab';
import { BatchesTab } from './product-detail/BatchesTab';
import { VariantsTab } from './product-detail/VariantsTab';
import { ImagesTab } from './product-detail/ImagesTab';
import { DocumentsTab } from './product-detail/DocumentsTab';
import { ActivityTab } from './product-detail/ActivityTab';
import { PriceListsForProduct } from './product-detail/PriceListsForProduct';
import { InventoryHistory } from './product-detail/InventoryHistory';

export const ProductDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const db = DatabaseManager.getInstance();
  const productService = new ProductService();
  const currentUser = AuthService.getCurrentUser();
  const canEdit = PermissionService.can(currentUser, 'products.update');

  const [tab, setTab] = useState<Tab>('overview');
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [stock, setStock] = useState<StockSummary>({ totalM2: 0, totalBoxes: 0, totalPieces: 0, rows: [] });
  const [sales, setSales] = useState<SalesRow[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ProductEditForm | null>(null);

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
      <ProductDetailHeader
        product={product}
        stock={stock}
        canEdit={canEdit}
        tab={tab}
        onTabChange={setTab}
        onBack={() => navigate('/products')}
        onEdit={openEdit}
      />

      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'overview' && <OverviewTab product={product} margin={margin} />}

        {tab === 'inventory' && <InventoryTab product={product} stock={stock} />}

        {tab === 'sales' && <SalesTab product={product} sales={sales} />}

        {tab === 'purchases' && <PurchasesTab product={product} purchases={purchases} />}

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

        {tab === 'activity' && <ActivityTab activity={activity} />}
      </div>

      {editOpen && form && (
        <ProductEditModal
          product={product}
          form={form}
          saving={saving}
          onChange={setForm}
          onSubmit={saveEdit}
          onClose={() => setEditOpen(false)}
        />
      )}
    </div>
  );
};
