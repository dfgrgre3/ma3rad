import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Upload, FileSpreadsheet, Download, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { ProductImportService, ProductImportRow, ProductImportResult } from '../services/ProductImportService';
import { OperationsService } from '../services/OperationsService';
import { exportToExcel } from '../utils/export';
import { useToast } from './ui/Toast';

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

export const ProductImportModal: React.FC<Props> = ({ open, onClose, onImported }) => {
  const service = useMemo(() => new ProductImportService(), []);
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ProductImportRow[]>([]);
  const [missingColumns, setMissingColumns] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  const [warehouseId, setWarehouseId] = useState('wh_main');
  const [warehouses, setWarehouses] = useState<Array<{ id: string; name: string }>>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ProductImportResult | null>(null);

  useEffect(() => {
    if (!open) return;
    try {
      const list = new OperationsService().getWarehouses();
      setWarehouses(list);
      if (list[0]) setWarehouseId(list[0].id);
    } catch { /* ignore */ }
  }, [open]);

  if (!open) return null;

  const reset = () => {
    setRows([]);
    setMissingColumns([]);
    setFileName('');
    setResult(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const downloadTemplate = () => {
    exportToExcel({
      title: 'قالب استيراد المنتجات',
      subtitle: 'استخدم أسماء التصنيفات والماركات الموجودة في النظام. لا تغيّر صف العناوين.',
      fileName: 'products-import-template',
      columns: [
        { key: 'sku', label: 'الكود' }, { key: 'barcode', label: 'الباركود' },
        { key: 'name', label: 'اسم المنتج' }, { key: 'category', label: 'التصنيف' },
        { key: 'brand', label: 'الماركة' }, { key: 'grade', label: 'الفرز' },
        { key: 'size', label: 'المقاس' }, { key: 'pieces', label: 'قطع/كرتونة' },
        { key: 'meters', label: 'م²/كرتونة' }, { key: 'cost', label: 'التكلفة' },
        { key: 'price', label: 'سعر المتر' }, { key: 'wholesale', label: 'سعر الجملة' },
        { key: 'min', label: 'أقل سعر' }, { key: 'stock', label: 'المخزون' },
      ],
      rows: [{
        sku: 'SKU-001', barcode: '622100000001', name: 'سيراميك أرضيات 60×60',
        category: '', brand: '', grade: 'GRADE_1', size: '60x60', pieces: 4,
        meters: 1.44, cost: 120, price: 220, wholesale: 200, min: 150, stock: 100,
      }],
    });
  };

  const handleFile = async (file: File) => {
    setParsing(true);
    setResult(null);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = service.parseWorkbook(buffer);
      setRows(parsed.rows);
      setMissingColumns(parsed.missingColumns);
      setFileName(file.name);
      if (parsed.missingColumns.length > 0) {
        toast.error(`أعمدة مطلوبة غير موجودة: ${parsed.missingColumns.join('، ')}`);
      }
    } catch (error: any) {
      toast.error(error?.message || 'تعذر قراءة الملف.');
      reset();
    } finally {
      setParsing(false);
    }
  };

  const runImport = () => {
    const valid = rows.filter((row) => row.errors.length === 0);
    if (valid.length === 0) {
      toast.error('لا توجد صفوف صالحة للاستيراد.');
      return;
    }
    setImporting(true);
    try {
      const outcome = service.importRows(valid, warehouseId);
      setResult(outcome);
      if (outcome.created > 0) {
        toast.success(`تم استيراد ${outcome.created} صنف.${outcome.failed ? ` فشل ${outcome.failed}.` : ''}`);
        onImported();
      } else {
        toast.error('لم يتم استيراد أي صنف. راجع الأخطاء.');
      }
    } catch (error: any) {
      toast.error(error?.message || 'تعذر استيراد المنتجات.');
    } finally {
      setImporting(false);
    }
  };

  const validCount = rows.filter((row) => row.errors.length === 0).length;
  const invalidCount = rows.length - validCount;

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4" dir="rtl">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-sm font-black flex items-center gap-2"><FileSpreadsheet className="w-4 h-4 text-emerald-600" /> استيراد المنتجات من Excel</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">ارفع ملف .xlsx أو .xls أو .csv ثم راجع الصفوف قبل الاستيراد.</p>
          </div>
          <button onClick={() => { reset(); onClose(); }} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-4">
          {!fileName && (
            <div className="space-y-3">
              <button onClick={downloadTemplate} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700">
                <Download className="w-4 h-4" /> تنزيل قالب Excel جاهز
              </button>
              <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-2xl py-10 cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/30 transition">
                <Upload className="w-8 h-8 text-slate-400" />
                <span className="text-sm font-bold text-slate-700">اختر ملف Excel</span>
                <span className="text-[11px] text-slate-400">سيتم التحقق من التصنيفات والماركات والأسعار تلقائيًا</span>
                <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void handleFile(file); }} />
              </label>
            </div>
          )}

          {parsing && <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /></div>}

          {fileName && !parsing && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-bold text-slate-700">{fileName}</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">{validCount} صالح</span>
                  {invalidCount > 0 && <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 font-bold">{invalidCount} خطأ</span>}
                </div>
                <div className="flex items-center gap-2">
                  <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold">
                    {warehouses.map((w) => <option key={w.id} value={w.id}>مخزون افتتاحي: {w.name}</option>)}
                  </select>
                  <button onClick={() => { reset(); }} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600">تغيير الملف</button>
                </div>
              </div>

              {missingColumns.length > 0 && (
                <div className="flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5" /> أعمدة مطلوبة غير موجودة: {missingColumns.join('، ')}
                </div>
              )}

              <div className="border border-slate-200 rounded-xl overflow-auto max-h-72">
                <table className="w-full text-xs text-right">
                  <thead className="bg-slate-50 text-[10px] text-slate-500 border-b border-slate-200 sticky top-0">
                    <tr><th className="px-2 py-2">#</th><th className="px-2 py-2">الكود</th><th className="px-2 py-2">الاسم</th><th className="px-2 py-2">التصنيف</th><th className="px-2 py-2">الماركة</th><th className="px-2 py-2">المقاس</th><th className="px-2 py-2">سعر المتر</th><th className="px-2 py-2">الحالة</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row) => (
                      <tr key={row.rowNumber} className={row.errors.length ? 'bg-rose-50/40' : ''}>
                        <td className="px-2 py-1.5 text-slate-400">{row.rowNumber}</td>
                        <td className="px-2 py-1.5 font-mono">{row.sku}</td>
                        <td className="px-2 py-1.5 font-semibold">{row.name}</td>
                        <td className="px-2 py-1.5">{row.category}</td>
                        <td className="px-2 py-1.5">{row.brand}</td>
                        <td className="px-2 py-1.5 font-mono">{row.size}</td>
                        <td className="px-2 py-1.5 font-mono">{row.sellingPriceM2}</td>
                        <td className="px-2 py-1.5">
                          {row.errors.length === 0
                            ? <span className="inline-flex items-center gap-1 text-emerald-600 font-bold"><CheckCircle2 className="w-3.5 h-3.5" /> جاهز</span>
                            : <span className="text-rose-600 text-[10px]" title={row.errors.join('، ')}>{row.errors[0]}{row.errors.length > 1 ? ` (+${row.errors.length - 1})` : ''}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {result && (
                <div className={`rounded-xl border px-3 py-2 text-xs ${result.failed ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
                  تم إنشاء {result.created} صنف، وفشل {result.failed}.
                  {result.errors.length > 0 && (
                    <ul className="mt-1 list-disc pr-4 max-h-24 overflow-auto">
                      {result.errors.map((err) => <li key={`${err.row}-${err.message}`}>صف {err.row}: {err.message}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="border-t border-slate-200 px-5 py-3 flex items-center justify-between">
          <button onClick={() => { reset(); onClose(); }} className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600">إغلاق</button>
          <button onClick={runImport} disabled={!fileName || validCount === 0 || importing} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold disabled:opacity-40">
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} استيراد {validCount > 0 ? `(${validCount})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
};
