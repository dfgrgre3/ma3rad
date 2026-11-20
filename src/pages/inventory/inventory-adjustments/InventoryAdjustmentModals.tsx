import React from 'react';
import { DataTable } from '../../../components/ui/DataTable';
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
  products,
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
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface backdrop-blur-sm">
    <div className="bg-surface border border-line rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl">
      <div className="bg-surface-muted px-6 py-4 flex items-center justify-between border-b border-line">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-warning" />
          <h3 className="text-base font-black text-ink">تفاصيل تسوية المخزون: {selectedAdjustment.code}</h3>
        </div>
        <button onClick={() => setShowDetailModal(false)} className="text-muted hover:text-ink transition">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs bg-surface p-4 rounded-xl border border-line/60">
          <div>
            <div className="text-muted mb-0.5">المستودع</div>
            <div className="font-bold text-ink">{selectedAdjustment.warehouse}</div>
          </div>
          <div>
            <div className="text-muted mb-0.5">نوع التسوية</div>
            <div className="font-bold text-ink">
              {selectedAdjustment.type === 'ADD' ? 'زيادة / إضافة (+)' : selectedAdjustment.type === 'DAMAGE' ? 'تالف (-)' : 'عجز / صرف (-)'}
            </div>
          </div>
          <div>
            <div className="text-muted mb-0.5">السبب</div>
            <div className="font-bold text-ink">{selectedAdjustment.reason}</div>
          </div>
          <div>
            <div className="text-muted mb-0.5">التاريخ</div>
            <div className="font-bold text-ink font-mono">{selectedAdjustment.date}</div>
          </div>
          <div>
            <div className="text-muted mb-0.5">منشئ الطلب</div>
            <div className="font-bold text-ink">{selectedAdjustment.adjustedBy}</div>
          </div>
          <div>
            <div className="text-muted mb-0.5">المعتمد</div>
            <div className="font-bold text-ink">{selectedAdjustment.approvedByName || 'لم يعتمد بعد'}</div>
          </div>
          <div>
            <div className="text-muted mb-0.5">المرحّل</div>
            <div className="font-bold text-ink">{selectedAdjustment.postedByName || 'لم ترحّل بعد'}</div>
          </div>
        </div>

        <div className="border border-line rounded-xl overflow-hidden">
          <DataTable
            ariaLabel="أصناف التسوية"
            rows={selectedItems}
            rowKey={(item: any) => String(item.id)}
            dense
            tableClassName="text-xs"
            columns={[
              { key: 'name', header: 'الصنف', render: (item: any) => <span className="font-medium text-ink">{item.productName}</span> },
              { key: 'qty', header: 'الكمية', render: (item: any) => <span className="font-mono font-bold text-primary">{formatProductQuantity(item.quantityM2, item)}</span> },
              { key: 'boxes', header: 'عدد الصناديق', render: (item: any) => <span className="font-mono text-ink">{item.boxesCount} صندوق</span> },
              { key: 'cost', header: 'سعر التكلفة', render: (item: any) => <span className="font-mono text-muted">{fmt(item.unitCost)}</span> },
              { key: 'total', header: 'القيمة الإجمالية', render: (item: any) => <span className="font-mono font-bold text-success">{fmt(item.totalValue)}</span> },
            ]}
          />
        </div>
      </div>
      <div className="bg-surface-muted px-6 py-4 flex justify-end gap-2 border-t border-line">
        <button
          onClick={() => setShowDetailModal(false)}
          className="px-4 py-2 bg-surface-muted hover:bg-surface-sunken text-ink-secondary rounded-xl text-xs font-bold transition border border-line"
        >
          إغلاق التفاصيل
        </button>
      </div>
    </div>
  </div>
)}

{/* Create Modal Form */}
{showCreateModal && (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface backdrop-blur-sm">
    <form onSubmit={handleCreateAdjustment} className="bg-surface border border-line rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl">
      <div className="bg-surface-muted px-6 py-4 flex items-center justify-between border-b border-line">
        <div className="flex items-center gap-2">
          <Wrench className="w-5 h-5 text-warning" />
          <h3 className="text-base font-black text-ink">طلب تسوية مخزنية جديدة</h3>
        </div>
        <button type="button" onClick={() => setShowCreateModal(false)} className="text-muted hover:text-ink transition">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-6 space-y-4">
        {errorMsg && (
          <div className="flex items-center gap-2 p-3 bg-danger/10 border border-danger/20 text-danger text-xs font-semibold rounded-xl">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-xs text-muted font-bold block">المخزن المستهدف</label>
          <select
            value={selectedWarehouseId}
            onChange={(e) => setSelectedWarehouseId(e.target.value)}
            className="w-full"
          >
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-muted font-bold block">نوع التسوية</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setAdjType('ADD')}
              className={`px-3 py-2 text-xs font-bold rounded-xl border transition ${adjType === 'ADD' ? 'bg-success/10 text-success border-success/50' : 'bg-surface-muted border-line hover:bg-surface text-muted'}`}
            >
              إضافة رصيد (+)
            </button>
            <button
              type="button"
              onClick={() => setAdjType('SUBTRACT')}
              className={`px-3 py-2 text-xs font-bold rounded-xl border transition ${adjType === 'SUBTRACT' ? 'bg-danger/10 text-danger border-danger/50' : 'bg-surface-muted border-line hover:bg-surface text-muted'}`}
            >
              عجز / سحب (-)
            </button>
            <button
              type="button"
              onClick={() => setAdjType('DAMAGE')}
              className={`px-3 py-2 text-xs font-bold rounded-xl border transition ${adjType === 'DAMAGE' ? 'bg-warning/10 text-warning border-warning/50' : 'bg-surface-muted border-line hover:bg-surface text-muted'}`}
            >
              تالف (-)
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-muted font-bold block">الصنف المراد تسويته</label>
          <ProductPicker
            value={selectedProductId}
            selectedLabel={selectedProduct?.name}
            ariaLabel="استعراض أصناف التسوية المخزنية"
            onChange={setSelectedProductId}
            className="w-full px-3.5 py-2.5 bg-surface-muted border border-line rounded-xl text-xs text-ink focus:outline-none focus:border-warning"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs text-muted font-bold block">الكمية ({selectedUnit})</label>
            <input
              type="number"
              step={selectedProduct?.productType === 'GENERAL' && ['BOX', 'PIECE', 'SET'].includes(selectedProduct.baseUnit ?? '') ? 1 : 0.01}
              min="0.01"
              value={qtyM2 || ''}
              onChange={(e) => setQtyM2(Number.parseFloat(e.target.value) || 0)}
              placeholder={`كمية ${selectedUnit}`}
              className="w-full px-3.5 py-2.5 bg-surface-muted border border-line rounded-xl text-xs text-ink focus:outline-none focus:border-warning"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted font-bold block">سبب التسوية</label>
            <input
              type="text"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="مثال: تلف أثناء الترتيب، زيادة في الشحنة"
              className="w-full px-3.5 py-2.5 bg-surface-muted border border-line rounded-xl text-xs text-ink focus:outline-none focus:border-warning"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-muted font-bold block">ملاحظات إضافية</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="ملاحظات أو تفاصيل أكثر..."
            rows={2}
            className="w-full px-3.5 py-2.5 bg-surface-muted border border-line rounded-xl text-xs text-ink focus:outline-none focus:border-warning resize-none"
          />
        </div>
      </div>

      <div className="bg-surface-muted px-6 py-4 flex justify-end gap-2 border-t border-line">
        <button
          type="button"
          onClick={() => setShowCreateModal(false)}
          className="px-4 py-2 bg-surface-muted hover:bg-surface-sunken text-ink-secondary rounded-xl text-xs font-bold transition border border-line"
        >
          إلغاء
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-warning hover:bg-warning text-white rounded-xl text-xs font-bold transition"
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
