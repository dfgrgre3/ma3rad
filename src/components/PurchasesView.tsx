import React, { useState, useEffect } from 'react';
import { 
  Truck, Plus, Search, FileText, 
  Calendar, CheckCircle, AlertCircle
} from 'lucide-react';
import { PurchaseService } from '../services/PurchaseService';
import { SupplierService } from '../services/SupplierService';
import { ProductService } from '../services/ProductService';
import { InventoryService } from '../services/InventoryService';
import { PurchaseInvoice, Supplier, Product, Warehouse, PaymentType } from '../types';
import { CeramicMath } from '../utils/ceramicMath';

export const PurchasesView: React.FC = () => {
  const [purchases, setPurchases] = useState<PurchaseInvoice[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [search, setSearch] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [dto, setDto] = useState({
    supplierId: '',
    supplierInvoiceNumber: '',
    warehouseId: 'wh_main',
    items: [
      { productId: '', quantityM2: 100, boxesCount: 69.44, unitCost: 150 }
    ],
    discountAmount: 0,
    shippingCost: 0,
    paidAmount: 15000,
    paymentType: 'CASH' as PaymentType,
    notes: ''
  });

  const purchaseService = new PurchaseService();
  const supplierService = new SupplierService();
  const productService = new ProductService();
  const inventoryService = new InventoryService();

  const loadData = () => {
    try {
      const purs = purchaseService.getAllPurchases(search);
      const sups = supplierService.getAllSuppliers();
      const prods = productService.getAllProducts();
      const whs = inventoryService.getAllWarehouses();

      setPurchases(purs);
      setSuppliers(sups);
      setProducts(prods);
      setWarehouses(whs);

      if (sups.length > 0 && !dto.supplierId) {
        setDto(prev => ({
          ...prev,
          supplierId: sups[0].id,
          warehouseId: whs[0]?.id || 'wh_main',
          items: [{ productId: prods[0]?.id || '', quantityM2: 100, boxesCount: 69.44, unitCost: prods[0]?.costPrice || 150 }]
        }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, [search]);

  const handleCreatePurchase = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      purchaseService.createPurchase({
        supplierId: dto.supplierId,
        supplierInvoiceNumber: dto.supplierInvoiceNumber,
        warehouseId: dto.warehouseId,
        items: dto.items,
        discountAmount: dto.discountAmount,
        shippingCost: dto.shippingCost,
        paidAmount: dto.paidAmount,
        paymentType: dto.paymentType,
        notes: dto.notes,
        performedBy: 'usr_admin'
      });

      setIsModalOpen(false);
      loadData();
      alert('تم تسجيل فاتورة التوريد بنجاح وزيادة أرصدة المخازن آلياً.');
    } catch (err: any) {
      alert(`خطأ: ${err.message || err}`);
    }
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      {/* Header Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">فواتير المشتريات وتوريد السيراميك</h2>
          <p className="text-xs text-slate-500">إدخال بضائع المصانع والموردين، وتحديث تكلفة ومتوسط سعر الشراء</p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-sky-600/30 transition text-sm"
        >
          <Plus className="w-4 h-4" />
          <span>فاتورة توريد / مشتريات جديدة</span>
        </button>
      </div>

      {/* Purchases Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3.5">رقم الفاتورة</th>
                <th className="p-3.5">المورد / الشركة المصنعة</th>
                <th className="p-3.5">المخزن المستلم</th>
                <th className="p-3.5">التاريخ</th>
                <th className="p-3.5">الإجمالي</th>
                <th className="p-3.5">المدفوع</th>
                <th className="p-3.5">المتبقي (آجل)</th>
                <th className="p-3.5">حالة السداد</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 ">
              {purchases.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    لا توجد فواتير مشتريات مسجلة حتى الآن.
                  </td>
                </tr>
              ) : (
                purchases.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-100">
                    <td className="p-3.5 font-mono font-bold text-slate-900">
                      {p.invoiceNumber}
                      {p.supplierInvoiceNumber && <div className="text-[10px] text-slate-500 font-normal">فاتورة المصنع: {p.supplierInvoiceNumber}</div>}
                    </td>
                    <td className="p-3.5 font-bold text-slate-900">{p.supplierName}</td>
                    <td className="p-3.5 text-sky-600 font-semibold">{p.warehouseName}</td>
                    <td className="p-3.5 font-mono text-slate-500">{p.date}</td>
                    <td className="p-3.5 font-black text-slate-900">{CeramicMath.formatCurrency(p.totalAmount)}</td>
                    <td className="p-3.5 font-bold text-emerald-600">{CeramicMath.formatCurrency(p.paidAmount)}</td>
                    <td className="p-3.5 font-bold text-amber-600">{CeramicMath.formatCurrency(p.remainingAmount)}</td>
                    <td className="p-3.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
 p.paymentStatus === 'PAID' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'
 }`}>
                        {p.paymentStatus === 'PAID' ? 'مسددة بالكامل' : (p.paymentStatus === 'PARTIAL' ? 'مسدد جزء' : 'آجل بالكامل')}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Purchase Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-white backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-extrabold text-slate-900">إدخال فاتورة توريد سيراميك من مورد</h3>

            <form onSubmit={handleCreatePurchase} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">المورد / المصنع *</label>
                  <select
                    value={dto.supplierId}
                    onChange={(e) => setDto({ ...dto, supplierId: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold"
                  >
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.companyName || 'مصنع'})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">المخزن المستلم للبضاعة *</label>
                  <select
                    value={dto.warehouseId}
                    onChange={(e) => setDto({ ...dto, warehouseId: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold"
                  >
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Product Item in purchase */}
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2">
                <div className="font-bold text-slate-700">بيانات صنف السيراميك المورد:</div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-3">
                    <label className="text-[10px] text-slate-500 font-bold">الصنف</label>
                    <select
                      value={dto.items[0]?.productId}
                      onChange={(e) => {
                        const selProd = products.find(p => p.id === e.target.value);
                        const items = [...dto.items];
                        items[0].productId = e.target.value;
                        items[0].unitCost = selProd?.costPrice || 150;
                        setDto({ ...dto, items });
                      }}
                      className="w-full px-2 py-1.5 bg-white rounded-lg border border-slate-200 font-bold"
                    >
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.size} - {p.grade})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-500 font-bold">الكمية بالمتر المربع (م²)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={dto.items[0]?.quantityM2}
                      onChange={(e) => {
                        const q = parseFloat(e.target.value) || 0;
                        const items = [...dto.items];
                        items[0].quantityM2 = q;
                        items[0].boxesCount = Number((q / 1.44).toFixed(2));
                        setDto({ ...dto, items, paidAmount: q * items[0].unitCost });
                      }}
                      className="w-full px-2 py-1.5 bg-white rounded-lg border border-slate-200 font-bold"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-500 font-bold">سعر تكلفة المتر (شراء)</label>
                    <input
                      type="number"
                      value={dto.items[0]?.unitCost}
                      onChange={(e) => {
                        const c = parseFloat(e.target.value) || 0;
                        const items = [...dto.items];
                        items[0].unitCost = c;
                        setDto({ ...dto, items, paidAmount: items[0].quantityM2 * c });
                      }}
                      className="w-full px-2 py-1.5 bg-white rounded-lg border border-slate-200 font-bold"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-500 font-bold">إجمالي تكلفة البند</label>
                    <div className="py-1.5 font-black text-sky-600 text-sm">
                      {CeramicMath.formatCurrency((dto.items[0]?.quantityM2 || 0) * (dto.items[0]?.unitCost || 0))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">المبلغ المسدد للمورد (ج.م)</label>
                  <input
                    type="number"
                    value={dto.paidAmount}
                    onChange={(e) => setDto({ ...dto, paidAmount: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">طريقة السداد</label>
                  <select
                    value={dto.paymentType}
                    onChange={(e) => setDto({ ...dto, paymentType: e.target.value as PaymentType })}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold"
                  >
                    <option value="CASH">نقدي كاش (من الخزينة)</option>
                    <option value="BANK_TRANSFER">تحويل بنكي / شيك</option>
                    <option value="CREDIT">آجل بالكامل</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 ">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl shadow-lg shadow-sky-600/30"
                >
                  حفظ الفاتورة وإضافة للمخزن
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
