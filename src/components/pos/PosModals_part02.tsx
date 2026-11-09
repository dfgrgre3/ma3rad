import React from 'react';
import { CheckCircle2, Printer, Receipt, Trash2 } from 'lucide-react';
import { CeramicMath } from '../../utils/products/ceramicMath';

export const SuccessInvoiceModal: React.FC<{
  invoice: any;
  onPrintThermal: () => void;
  onPreview: () => void;
  onClose: () => void;
  onVoid?: () => void;
  canVoid?: boolean;
}> = ({ invoice, onPrintThermal, onPreview, onClose, onVoid, canVoid }) => {
  const changeDue = Math.max(0, (invoice.paidAmount || 0) - (invoice.totalAmount || 0));
  return (
  <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full text-center space-y-4">
      <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto">
        <CheckCircle2 className="w-10 h-10" />
      </div>
      <h3 className="text-lg font-black text-slate-900">تم إصدار الفاتورة بنجاح</h3>
      <div className="text-xs text-slate-500 space-y-1">
        <p>رقم الفاتورة: <strong className="font-mono text-slate-800">{invoice.invoiceNumber}</strong></p>
        <p>الإجمالي: <strong className="text-sky-600">{CeramicMath.formatCurrency(invoice.totalAmount)}</strong></p>
        {invoice.paidAmount > 0 && (
          <p>المدفوع: <strong className="text-slate-700">{CeramicMath.formatCurrency(invoice.paidAmount)}</strong></p>
        )}
        {changeDue > 0 && (
          <p>الباقي للعميل: <strong className="text-emerald-600">{CeramicMath.formatCurrency(changeDue)}</strong></p>
        )}
        {invoice.remainingAmount > 0 && (
          <p>المتبقي: <strong className="text-amber-600">{CeramicMath.formatCurrency(invoice.remainingAmount)}</strong></p>
        )}
        <p className="text-[11px]">تم خصم الكميات من المخزن وتحديث حساب العميل آلياً.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
        <button
          onClick={onPrintThermal}
          className="py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5"
        >
          <Receipt className="w-4 h-4" /> إيصال حراري
        </button>
        <button
          onClick={onPreview}
          className="py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5"
        >
          <Printer className="w-4 h-4" /> معاينة وطباعة
        </button>
        <button
          onClick={onClose}
          className="py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
        >
          إغلاق
        </button>
      </div>
      {canVoid && onVoid && (
        <button
          onClick={onVoid}
          className="w-full py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5"
        >
          <Trash2 className="w-4 h-4" /> إلغاء هذه الفاتورة
        </button>
      )}
    </div>
  </div>
  );
};
