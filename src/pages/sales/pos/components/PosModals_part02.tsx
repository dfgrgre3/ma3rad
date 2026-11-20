import React from 'react';
import { CheckCircle2, Printer, Receipt, Trash2 } from 'lucide-react';
import { CeramicMath } from '../../../../utils/products/ceramicMath';
import { usePosActivityCopy } from '../../../../hooks/pages/sales/pos/usePosActivityCopy';

export const SuccessInvoiceModal: React.FC<{
  invoice: any;
  onPrintThermal: () => void;
  onPreview: () => void;
  onClose: () => void;
  onVoid?: () => void;
  canVoid?: boolean;
}> = ({ invoice, onPrintThermal, onPreview, onClose, onVoid, canVoid }) => {
  const copy = usePosActivityCopy();
  const changeDue = Math.max(0, (invoice.paidAmount || 0) - (invoice.totalAmount || 0));
  return (
  <div className="fixed inset-0 bg-primary/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div className="bg-surface p-6 rounded-3xl border border-line shadow-2xl max-w-md w-full text-center space-y-4">
      <div className="w-16 h-16 rounded-full bg-success/10 text-success flex items-center justify-center mx-auto">
        <CheckCircle2 className="w-10 h-10" />
      </div>
      <h3 className="text-lg font-black text-ink">{copy.successTitle}</h3>
      <div className="text-xs text-muted space-y-1">
        <p>{copy.invoiceNumberLabel}: <strong className="font-mono text-ink">{invoice.invoiceNumber}</strong></p>
        <p>الإجمالي: <strong className="text-primary">{CeramicMath.formatCurrency(invoice.totalAmount)}</strong></p>
        {invoice.paidAmount > 0 && (
          <p>المدفوع: <strong className="text-ink">{CeramicMath.formatCurrency(invoice.paidAmount)}</strong></p>
        )}
        {changeDue > 0 && (
          <p>الباقي للعميل: <strong className="text-success">{CeramicMath.formatCurrency(changeDue)}</strong></p>
        )}
        {invoice.remainingAmount > 0 && (
          <p>المتبقي: <strong className="text-warning">{CeramicMath.formatCurrency(invoice.remainingAmount)}</strong></p>
        )}
        <p className="text-[11px]">تم خصم الكميات من المخزن وتحديث حساب العميل آلياً.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
        <button
          onClick={onPrintThermal}
          className="py-2.5 bg-warning hover:bg-warning text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5"
        >
          <Receipt className="w-4 h-4" /> إيصال حراري
        </button>
        <button
          onClick={onPreview}
          className="py-2.5 bg-primary hover:bg-primary text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5"
        >
          <Printer className="w-4 h-4" /> معاينة وطباعة
        </button>
        <button
          onClick={onClose}
          className="py-2.5 bg-surface-sunken hover:bg-surface-sunken text-ink font-bold rounded-xl text-xs"
        >
          إغلاق
        </button>
      </div>
      {canVoid && onVoid && (
        <button
          onClick={onVoid}
          className="w-full py-2 bg-danger-soft hover:bg-danger-soft text-danger border border-danger-border font-bold rounded-xl text-xs flex items-center justify-center gap-1.5"
        >
          <Trash2 className="w-4 h-4" /> {copy.voidInvoiceLabel}
        </button>
      )}
    </div>
  </div>
  );
};
