import React from 'react';
import { Download, FileSpreadsheet, Loader2, PackagePlus, Upload, CheckCircle } from 'lucide-react';
import type { Product } from '../../../types';
import { CeramicMath } from '../../../utils/products/ceramicMath';
import { getProductUnitLabel } from '../../../utils/products/productUnits';
import { round } from '../productFormModel';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import { Field } from '../ProductUi';

export interface StockRow {
  warehouseId: string;
  warehouseName: string;
  currentM2: number;
  addBoxes: number;
}

export interface ProductStockModalProps {
  open: boolean;
  onClose: () => void;
  stockProduct: Product | null;
  stockRows: StockRow[];
  setStockRows: React.Dispatch<React.SetStateAction<StockRow[]>>;
  stockReason: string;
  setStockReason: (value: string) => void;
  stockSaving: boolean;
  onSave: () => void;
}

export const ProductStockModal: React.FC<ProductStockModalProps> = ({
  open, onClose, stockProduct, stockRows, setStockRows, stockReason, setStockReason, stockSaving, onSave,
}) => (
  <Modal
    open={open}
    onClose={onClose}
    title="إضافة كمية للمخزون"
    description={stockProduct ? `${stockProduct.name}${stockProduct.productType === 'GENERAL' ? ` • الوحدة: ${getProductUnitLabel(stockProduct)}` : ` • ${stockProduct.metersPerBox} م²/كرتونة`}` : undefined}
    icon={<PackagePlus className="h-5 w-5" />}
    size="lg"
    footer={
      <>
        <Button variant="secondary" onClick={onClose}>إلغاء</Button>
        <Button variant="success" onClick={onSave} loading={stockSaving} leadingIcon={<PackagePlus className="h-4 w-4" />}>
          إضافة للمخزون
        </Button>
      </>
    }
  >
    {stockProduct && (
      <div className="space-y-4 text-xs">
        <div className="space-y-2">
          {stockRows.map((row, index) => (
            <div key={row.warehouseId} className="grid grid-cols-1 sm:grid-cols-3 items-end gap-2 rounded-[var(--ui-radius-sm)] border border-[var(--win-border)] bg-[var(--cerami-surface-muted)] p-3">
              <Field label="المخزن"><div className="px-3 py-2 font-bold">{row.warehouseName}</div></Field>
              <div className="rounded-[var(--ui-radius-sm)] border border-[var(--win-success-border)] bg-[var(--win-success-soft)] px-3 py-2">
                <div className="text-[10px] font-bold text-[var(--win-success-text)]">الرصيد الحالي</div>
                <div className="font-black text-[var(--win-success-text)]">{stockProduct.productType === 'GENERAL' ? `${round(row.currentM2, 3)} ${getProductUnitLabel(stockProduct)}` : CeramicMath.formatM2(row.currentM2)}</div>
              </div>
              <Field label={stockProduct.productType === 'GENERAL' ? `الكمية المضافة (${getProductUnitLabel(stockProduct)})` : 'عدد الكراتين المضافة'}>
                <input type="number" min="0" step="0.01" value={row.addBoxes || ''} onChange={(e) => { const value = Number.parseFloat(e.target.value) || 0; setStockRows((prev) => prev.map((r, i) => i === index ? { ...r, addBoxes: value } : r)); }} className="ui-input w-full font-bold" placeholder="0" />
              </Field>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={stockProduct.productType === 'GENERAL' ? `القيمة المضافة (${getProductUnitLabel(stockProduct)})` : 'القيمة المضافة (م²)'}>
            <div className="rounded-[var(--ui-radius-sm)] border border-[var(--win-success-border)] bg-[var(--win-success-soft)] px-3 py-2 font-black text-[var(--win-success-text)]">
              {round(stockRows.reduce((sum, r) => sum + r.addBoxes, 0) * (stockProduct.productType === 'GENERAL' ? 1 : (stockProduct.metersPerBox || 0)), 3)} {getProductUnitLabel(stockProduct)}
            </div>
          </Field>
          <Field label="سبب الإضافة / ملاحظة">
            <input value={stockReason} onChange={(e) => setStockReason(e.target.value)} className="ui-input w-full font-bold" />
          </Field>
        </div>
      </div>
    )}
  </Modal>
);

export interface ProductImportResult {
  created: number;
  errors: string[];
}

export interface ProductImportModalProps {
  open: boolean;
  onClose: () => void;
  isImporting: boolean;
  importResult: ProductImportResult | null;
  onDownloadTemplate: () => void;
  onImportFile: (file: File) => void;
  importInputRef: React.RefObject<HTMLInputElement>;
}

export const ProductImportModal: React.FC<ProductImportModalProps> = ({
  open, onClose, isImporting, importResult, onDownloadTemplate, onImportFile, importInputRef,
}) => (
  <Modal
    open={open}
    onClose={onClose}
    title="استيراد الأصناف من جدول بيانات"
    description="ارفع ملف جدول بيانات (.xlsx) لإضافة الأصناف دفعة واحدة"
    icon={<FileSpreadsheet className="h-5 w-5" />}
    size="lg"
    footer={<Button variant="secondary" onClick={onClose}>إغلاق</Button>}
  >
    <div className="space-y-4 text-xs">
      <button type="button" onClick={onDownloadTemplate} className="erp-btn erp-btn--secondary w-full justify-between">
        <span className="flex items-center gap-2"><Download className="h-4 w-4 text-[var(--cerami-primary-readable)]" /> تحميل قالب جدول بيانات جاهز</span>
        <span className="text-[10px] text-[var(--cerami-muted)]">xlsx</span>
      </button>
      <button type="button" onClick={() => importInputRef.current?.click()} className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--ui-radius-lg)] border-2 border-dashed border-[var(--win-accent-border)] bg-[var(--win-accent-soft)] px-4 py-10 text-center hover:border-[var(--win-accent)]">
        {isImporting ? <Loader2 className="h-8 w-8 animate-spin text-[var(--cerami-primary-readable)]" /> : <Upload className="h-8 w-8 text-[var(--cerami-primary-readable)]" />}
        <span className="text-sm font-bold">{isImporting ? 'جارٍ استيراد الأصناف...' : 'اضغط لاختيار ملف جدول بيانات'}</span>
        <span className="text-[10px] text-[var(--cerami-muted)]">يتم إنشاء الأنواع والماركات غير الموجودة تلقائيًا</span>
      </button>
      <input ref={importInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) onImportFile(file); e.target.value = ''; }} />
      {importResult && (
        <div className={`rounded-[var(--ui-radius-sm)] border p-3 ${importResult.errors.length > 0 ? 'border-[var(--win-warning-border)] bg-[var(--win-warning-soft)]' : 'border-[var(--win-success-border)] bg-[var(--win-success-soft)]'}`}>
          <div className="flex items-center gap-2 font-black">
            <CheckCircle className="h-4 w-4 text-[var(--cerami-success)]" />
            تم إنشاء {importResult.created} صنفًا
          </div>
          {importResult.errors.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pe-5 text-[10px] text-[var(--cerami-warning)]">
              {importResult.errors.slice(0, 8).map((err, i) => <li key={i}>{err}</li>)}
              {importResult.errors.length > 8 && <li>... و{importResult.errors.length - 8} أخطاء أخرى</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  </Modal>
);
