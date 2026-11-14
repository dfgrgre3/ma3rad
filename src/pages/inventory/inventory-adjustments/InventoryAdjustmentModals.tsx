import React from 'react';
import { Wrench, FileText, X, AlertTriangle } from 'lucide-react';
import { formatProductQuantity } from '../../../utils/products/productUnits';
import { ProductPicker } from '../../../components/products/ProductPicker';

interface Adjustment {
  id: string;
  code: string;
  warehouseId: string;
  warehouse: string;
  reason: string;
  date: string;
  adjustedBy: string;
  createdBy?: string;
  approvedByName?: string | null;
  postedByName?: string | null;
  approvalStatus?: string | null;
  type: 'ADD' | 'SUBTRACT' | 'DAMAGE' | 'OPENING_BALANCE';
  status: string;
  totalQuantityM2: number;
  totalValue: number;
  productType: 'CERAMIC' | 'GENERAL';
  baseUnit?: 'M2' | 'LINEAR_METER' | 'BOX' | 'PIECE' | 'KG' | 'TON' | 'SET' | 'CUSTOM';
  customUnit?: string;
}

interface AdjustmentItem {
  id: string;
  productId: string;
  productName: string;
  productType: 'CERAMIC' | 'GENERAL';
  baseUnit?: 'M2' | 'LINEAR_METER' | 'BOX' | 'PIECE' | 'KG' | 'TON' | 'SET' | 'CUSTOM';
  customUnit?: string;
  quantityM2: number;
  boxesCount: number;
  unitCost: number;
  totalValue: number;
  notes: string;
}

interface AdjustmentModalsProps {
  showDetailModal: boolean;
  setShowDetailModal: (open: boolean) => void;
  selectedAdjustment: Adjustment | null;
  selectedItems: AdjustmentItem[];
  fmt: (n: number) => string;
  showCreateModal: boolean;
  setShowCreateModal: (open: boolean) => void;
  errorMsg: string;
  warehouses: { id: string; name: string }[];
  selectedWarehouseId: string;
  setSelectedWarehouseId: (id: string) => void;
  adjType: 'ADD' | 'SUBTRACT' | 'DAMAGE';
  setAdjType: (t: 'ADD' | 'SUBTRACT' | 'DAMAGE') => void;
  products: { id: string; name: string; sku: string; costPrice: number; metersPerBox: number; productType: 'CERAMIC' | 'GENERAL'; baseUnit?: 'M2' | 'LINEAR_METER' | 'BOX' | 'PIECE' | 'KG' | 'TON' | 'SET' | 'CUSTOM'; customUnit?: string }[];
  selectedProductId: string;
  setSelectedProductId: (id: string) => void;
  selectedProduct: { id: string; name: string; sku: string; costPrice: number; metersPerBox: number; productType: 'CERAMIC' | 'GENERAL'; baseUnit?: 'M2' | 'LINEAR_METER' | 'BOX' | 'PIECE' | 'KG' | 'TON' | 'SET' | 'CUSTOM'; customUnit?: string } | undefined;
  selectedUnit: string;
  qtyM2: number;
  setQtyM2: (n: number) => void;
  reason: string;
  setReason: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  handleCreateAdjustment: (e: React.FormEvent) => void;
}

export const AdjustmentModals: React.FC<AdjustmentModalsProps> = ({
  showDetailModal,
  setShowDetailModal,
  selectedAdjustment,
  selectedItems,
  fmt,
  showCreateModal,
  setShowCreateModal,
  errorMsg,
  warehouses,
  selectedWarehouseId,
  setSelectedWarehouseId,
  adjType,
  setAdjType,
  _products,
  selectedProductId,
  setSelectedProductId,
  selectedProduct,
  selectedUnit,
  qtyM2,
  setQtyM2,
  reason,
  setReason,
  notes,
  setNotes,
  handleCreateAdjustment,
}) => (
  <>
{/* Detail Modal */}
{showDetailModal && selectedAdjustment && (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-white backdrop-blur-sm">
    <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl">
      <div className="bg-slate-50 px-6 py-4 flex items-center justify-between border-b border-slate-200">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-orange-600" />
          <h3 className="text-base font-black text-slate-900">تفاصيل تسوية المخزون: {selectedAdjustment.code}</h3>
        </div>
        <button onClick={() => setShowDetailModal(false)} className="text-slate-500 hover:text-slate-900 transition">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs bg-white p-4 rounded-xl border border-slate-200/60">
          <div>
            <div className="text-slate-500 mb-0.5">المستودع</div>
            <div className="font-bold text-slate-900">{selectedAdjustment.warehouse}</div>
          </div>
          <div>
            <div className="text-slate-500 mb-0.5">نوع التسوية</div>
            <div className="font-bold text-slate-900">
              {selectedAdjustment.type === 'ADD' ? 'زيادة / إضافة (+)' : selectedAdjustment.type === 'DAMAGE' ? 'تالف (-)' : 'عجز / صرف (-)'}
            </div>
          </div>
          <div>
            <div className="text-slate-500 mb-0.5">السبب</div>
            <div className="font-bold text-slate-900">{selectedAdjustment.reason}</div>
          </div>
          <div>
            <div className="text-slate-500 mb-0.5">التاريخ</div>
            <div className="font-bold text-slate-900 font-mono">{selectedAdjustment.date}</div>
          </div>
          <div>
            <div className="text-slate-500 mb-0.5">منشئ الطلب</div>
            <div className="font-bold text-slate-900">{selectedAdjustment.adjustedBy}</div>
          </div>
          <div>
            <div className="text-slate-500 mb-0.5">المعتمد</div>
            <div className="font-bold text-slate-900">{selectedAdjustment.approvedByName || 'لم يعتمد بعد'}</div>
          </div>
          <div>
            <div className="text-slate-500 mb-0.5">المرحّل</div>
            <div className="font-bold text-slate-900">{selectedAdjustment.postedByName || 'لم ترحّل بعد'}</div>
          </div>
        </div>

        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50">
              <tr>
                {['الصنف', 'الكمية', 'عدد الصناديق', 'سعر التكلفة', 'القيمة الإجمالية'].map(h => (
                  <th key={h} className="px-4 py-2 text-right font-bold text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {selectedItems.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 text-slate-900 font-medium">{item.productName}</td>
                  <td className="px-4 py-3 font-mono font-bold text-sky-600">{formatProductQuantity(item.quantityM2, item)}</td>
                  <td className="px-4 py-3 font-mono text-slate-700">{item.boxesCount} صندوق</td>
                  <td className="px-4 py-3 font-mono text-slate-500">{fmt(item.unitCost)}</td>
                  <td className="px-4 py-3 font-mono font-bold text-emerald-600">{fmt(item.totalValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="bg-slate-50 px-6 py-4 flex justify-end gap-2 border-t border-slate-200">
        <button
          onClick={() => setShowDetailModal(false)}
          className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-bold transition border border-slate-200"
        >
          إغلاق التفاصيل
        </button>
      </div>
    </div>
  </div>
)}

{/* Create Modal Form */}
{showCreateModal && (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-white backdrop-blur-sm">
    <form onSubmit={handleCreateAdjustment} className="bg-white border border-slate-200 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl">
      <div className="bg-slate-50 px-6 py-4 flex items-center justify-between border-b border-slate-200">
        <div className="flex items-center gap-2">
          <Wrench className="w-5 h-5 text-orange-600" />
          <h3 className="text-base font-black text-slate-900">طلب تسوية مخزنية جديدة</h3>
        </div>
        <button type="button" onClick={() => setShowCreateModal(false)} className="text-slate-500 hover:text-slate-900 transition">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-6 space-y-4">
        {errorMsg && (
          <div className="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-600 text-xs font-semibold rounded-xl">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-xs text-slate-500 font-bold block">المخزن المستهدف</label>
          <select
            value={selectedWarehouseId}
            onChange={(e) => setSelectedWarehouseId(e.target.value)}
            className="w-full"
          >
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-slate-455 font-bold block">نوع التسوية</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setAdjType('ADD')}
              className={`px-3 py-2 text-xs font-bold rounded-xl border transition ${adjType === 'ADD' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/50' : 'bg-slate-50 border-slate-200 hover:bg-white text-slate-500'}`}
            >
              إضافة رصيد (+)
            </button>
            <button
              type="button"
              onClick={() => setAdjType('SUBTRACT')}
              className={`px-3 py-2 text-xs font-bold rounded-xl border transition ${adjType === 'SUBTRACT' ? 'bg-rose-500/10 text-rose-600 border-rose-500/50' : 'bg-slate-50 border-slate-200 hover:bg-white text-slate-500'}`}
            >
              عجز / سحب (-)
            </button>
            <button
              type="button"
              onClick={() => setAdjType('DAMAGE')}
              className={`px-3 py-2 text-xs font-bold rounded-xl border transition ${adjType === 'DAMAGE' ? 'bg-amber-500/10 text-amber-600 border-amber-500/50' : 'bg-slate-50 border-slate-200 hover:bg-white text-slate-500'}`}
            >
              تالف (-)
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-slate-455 font-bold block">الصنف المراد تسويته</label>
          <ProductPicker
            value={selectedProductId}
            selectedLabel={selectedProduct?.name}
            ariaLabel="استعراض أصناف التسوية المخزنية"
            onChange={setSelectedProductId}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-orange-500"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs text-slate-455 font-bold block">الكمية ({selectedUnit})</label>
            <input
              type="number"
              step={selectedProduct?.productType === 'GENERAL' && ['BOX', 'PIECE', 'SET'].includes(selectedProduct.baseUnit ?? '') ? 1 : 0.01}
              min="0.01"
              value={qtyM2 || ''}
              onChange={(e) => setQtyM2(Number.parseFloat(e.target.value) || 0)}
              placeholder={`كمية ${selectedUnit}`}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-orange-500"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-slate-455 font-bold block">سبب التسوية</label>
            <input
              type="text"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="مثال: تلف أثناء الترتيب، زيادة في الشحنة"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-orange-500"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-slate-455 font-bold block">ملاحظات إضافية</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="ملاحظات أو تفاصيل أكثر..."
            rows={2}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-orange-500 resize-none"
          />
        </div>
      </div>

      <div className="bg-slate-50 px-6 py-4 flex justify-end gap-2 border-t border-slate-200">
        <button
          type="button"
          onClick={() => setShowCreateModal(false)}
          className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-bold transition border border-slate-200"
        >
          إلغاء
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-bold transition"
        >
          حفظ التسوية
        </button>
      </div>
    </form>
  </div>
)}

  </>
);

export default AdjustmentModals;
