import React from 'react';
import { Loader2, X, CheckCheck, DollarSign } from 'lucide-react';
import type { Order } from '../../../services/domains/sales/OrderService';
import { fmtCurrency } from './helpers';
import type { DepositPaymentType } from '../../../types/sales/reservationsPage';
import type { BankAccount } from '../../../types/finance';

interface DepositModalProps {
  order: Order;
  amount: string;
  onAmountChange: (value: string) => void;
  paymentType: DepositPaymentType;
  onPaymentTypeChange: (value: DepositPaymentType) => void;
  bankAccounts: BankAccount[];
  bankAccountId: string;
  onBankAccountChange: (value: string) => void;
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
  bankAccounts,
  bankAccountId,
  onBankAccountChange,
  notes,
  onNotesChange,
  submitting,
  onSubmit,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface rounded-2xl border border-line w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in-95">
        <div className="flex justify-between items-center pb-4 border-b border-line ">
          <h3 className="text-lg font-black text-ink dark:text-white flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-success" />
            تسجيل عربون / دفعة مقدمة
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-muted hover:text-ink-secondary dark:hover:text-muted rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 mt-4">
          <div className="p-3 bg-surface-muted dark:bg-primary/50 rounded-xl space-y-1.5 text-xs">
            <div className="flex justify-between text-ink-secondary ">
              <span>رقم الطلب:</span>
              <span className="font-bold text-ink dark:text-white">{order.orderNumber}</span>
            </div>
            <div className="flex justify-between text-ink-secondary ">
              <span>العميل:</span>
              <span className="font-semibold text-ink dark:text-white">{order.customerName || 'نقدي'}</span>
            </div>
            <div className="flex justify-between text-ink-secondary ">
              <span>إجمالي الطلب:</span>
              <span className="font-bold text-ink dark:text-white">{fmtCurrency(order.totalAmount)}</span>
            </div>
            <div className="flex justify-between text-ink-secondary ">
              <span>المدفوع مسبقاً:</span>
              <span className="font-semibold text-success">{fmtCurrency(order.paidAmount)}</span>
            </div>
            <div className="flex justify-between text-ink-secondary font-bold border-t border-line pt-1">
              <span>المبلغ المتبقي:</span>
              <span className="text-danger">{fmtCurrency(order.remainingAmount)}</span>
            </div>
          </div>

          {paymentType === 'BANK_TRANSFER' && (
            <div>
              <label className="block text-xs font-bold text-ink mb-1">الحساب البنكي المستلم *</label>
              <select required value={bankAccountId} onChange={(event) => onBankAccountChange(event.target.value)} className="w-full px-3 py-2 text-sm bg-surface border border-line-strong rounded-xl">
                <option value="">اختر الحساب البنكي</option>
                {bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.accountName} — {account.bankName}</option>)}
              </select>
              {bankAccounts.length === 0 && <p className="mt-1 text-xs text-danger">لا توجد حسابات بنكية متاحة؛ اختر وسيلة أخرى.</p>}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-ink mb-1">
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
              className="w-full px-3 py-2 text-base font-bold text-ink dark:text-white bg-surface border border-line-strong rounded-xl focus:outline-none focus:ring-2 focus:ring-success"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-ink mb-1">
              طريقة الدفع
            </label>
            <select
              value={paymentType}
              onChange={(e) => onPaymentTypeChange(e.target.value as DepositPaymentType)}
              className="w-full px-3 py-2 text-sm bg-surface border border-line-strong rounded-xl focus:outline-none focus:ring-2 focus:ring-success"
            >
              <option value="CASH">نقدي (خزينة المعرض)</option>
              <option value="CARD">بطاقة بنكية / فيزا</option>
              <option value="CHEQUE">شيك</option>
              <option value="BANK_TRANSFER">تحويل بنكي / إنستاباي</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-ink mb-1">
              ملاحظات الدفعة / رقم الإيصال
            </label>
            <input
              type="text"
              placeholder="ملاحظات العربون أو رقم المرجع البنكي..."
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-surface border border-line-strong rounded-xl focus:outline-none focus:ring-2 focus:ring-success"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 text-xs font-bold text-ink-secondary bg-surface-sunken hover:bg-surface-sunken dark:hover:bg-primary rounded-xl transition"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-2.5 text-xs font-bold text-white bg-success hover:bg-success rounded-xl shadow transition flex items-center justify-center gap-1.5"
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
