import React from 'react';
import { Loader2, X, CheckCheck, DollarSign } from 'lucide-react';
import type { Order } from '../../../services/OrderService';
import { fmtCurrency } from './helpers';
import type { DepositPaymentType } from './types';

interface DepositModalProps {
  order: Order;
  amount: string;
  onAmountChange: (value: string) => void;
  paymentType: DepositPaymentType;
  onPaymentTypeChange: (value: DepositPaymentType) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  submitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export const DepositModal: React.FC<DepositModalProps> = ({
  order,
  amount,
  onAmountChange,
  paymentType,
  onPaymentTypeChange,
  notes,
  onNotesChange,
  submitting,
  onSubmit,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in-95">
        <div className="flex justify-between items-center pb-4 border-b border-slate-100 dark:border-slate-700">
          <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-600" />
            تسجيل عربون / دفعة مقدمة
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 mt-4">
          <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-600 dark:text-slate-300">
              <span>رقم الطلب:</span>
              <span className="font-bold text-slate-900 dark:text-white">{order.orderNumber}</span>
            </div>
            <div className="flex justify-between text-slate-600 dark:text-slate-300">
              <span>العميل:</span>
              <span className="font-semibold text-slate-900 dark:text-white">{order.customerName || 'نقدي'}</span>
            </div>
            <div className="flex justify-between text-slate-600 dark:text-slate-300">
              <span>إجمالي الطلب:</span>
              <span className="font-bold text-slate-900 dark:text-white">{fmtCurrency(order.totalAmount)}</span>
            </div>
            <div className="flex justify-between text-slate-600 dark:text-slate-300">
              <span>المدفوع مسبقاً:</span>
              <span className="font-semibold text-emerald-600">{fmtCurrency(order.paidAmount)}</span>
            </div>
            <div className="flex justify-between text-slate-600 dark:text-slate-300 font-bold border-t border-slate-200 dark:border-slate-600 pt-1">
              <span>المبلغ المتبقي:</span>
              <span className="text-rose-600">{fmtCurrency(order.remainingAmount)}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              مبلغ العربون الجديد (ج.م) *
            </label>
            <input
              type="number"
              step="0.01"
              required
              max={order.remainingAmount}
              placeholder="0.00"
              value={amount}
              onChange={(e) => onAmountChange(e.target.value)}
              className="w-full px-3 py-2 text-base font-bold text-slate-900 dark:text-white bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              طريقة الدفع
            </label>
            <select
              value={paymentType}
              onChange={(e) => onPaymentTypeChange(e.target.value as DepositPaymentType)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="CASH">نقدي (خزينة المعرض)</option>
              <option value="CARD">بطاقة بنكية / فيزا</option>
              <option value="BANK_TRANSFER">تحويل بنكي / إنستاباي</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              ملاحظات الدفعة / رقم الإيصال
            </label>
            <input
              type="text"
              placeholder="ملاحظات العربون أو رقم المرجع البنكي..."
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-xl transition"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow transition flex items-center justify-center gap-1.5"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
              تأكيد وحفظ العربون
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
