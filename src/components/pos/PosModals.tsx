import React from 'react';
import {
  AlertCircle, CheckCircle2, History, Info, Keyboard, Lock, PlayCircle,
  Printer, Receipt, Trash2, Unlock, UserPlus,
} from 'lucide-react';
import type { CashRegister, CashShift, Customer, ToneMixingConflict } from '../../types';
import { CeramicMath } from '../../utils/ceramicMath';
import { Field, Modal, inputCls } from './PosShared';
import type { HeldOrder, Toast } from './types';

const toastColor: Record<Toast['type'], string> = {
  success: 'bg-emerald-600 border-emerald-400',
  error: 'bg-rose-600 border-rose-400',
  info: 'bg-sky-600 border-sky-400',
  warning: 'bg-amber-500 border-amber-400',
};

export const PosToast: React.FC<{ toast: Toast | null }> = ({ toast }) => {
  if (!toast) return null;
  return (
    <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-xl border text-slate-900 text-xs font-bold shadow-2xl flex items-center gap-2 ${toastColor[toast.type]}`}>
      {toast.type === 'error' ? <AlertCircle className="w-4 h-4" /> : toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <Info className="w-4 h-4" />}
      {toast.message}
    </div>
  );
};

export const SuccessInvoiceModal: React.FC<{
  invoice: any;
  onPrintThermal: () => void;
  onPreview: () => void;
  onClose: () => void;
}> = ({ invoice, onPrintThermal, onPreview, onClose }) => (
  <div className="fixed inset-0 bg-white backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full text-center space-y-4">
      <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto">
        <CheckCircle2 className="w-10 h-10" />
      </div>
      <h3 className="text-lg font-black text-slate-900">تم إصدار الفاتورة بنجاح</h3>
      <div className="text-xs text-slate-500 space-y-1">
        <p>رقم الفاتورة: <strong className="font-mono text-slate-800">{invoice.invoiceNumber}</strong></p>
        <p>الإجمالي: <strong className="text-sky-600">{CeramicMath.formatCurrency(invoice.totalAmount)}</strong></p>
        {invoice.remainingAmount > 0 && (
          <p>المتبقي: <strong className="text-amber-600">{CeramicMath.formatCurrency(invoice.remainingAmount)}</strong></p>
        )}
        <p className="text-[11px]">تم خصم الكميات من المخزن وتحديث حساب العميل آلياً.</p>
      </div>

      <div className="grid grid-cols-3 gap-2 pt-1">
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
    </div>
  </div>
);

export const HeldOrdersModal: React.FC<{
  orders: HeldOrder[];
  onResume: (order: HeldOrder) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}> = ({ orders, onResume, onDelete, onClose }) => (
  <Modal title="الطلبات المعلّقة" icon={<History className="w-5 h-5" />} onClose={onClose}>
    {orders.length === 0 ? (
      <div className="text-center text-slate-500 text-xs py-10">لا توجد طلبات معلّقة حالياً</div>
    ) : (
      <div className="space-y-2">
        {orders.map((h) => (
          <div key={h.id} className="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-900 truncate">{h.customerName}</div>
              <div className="text-[10px] text-slate-500">
                {h.items.length} صفوف • {new Date(h.createdAt).toLocaleString('ar-EG')}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => onResume(h)}
                className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-[11px] font-bold flex items-center gap-1"
              >
                <PlayCircle className="w-3.5 h-3.5" /> استرجاع
              </button>
              <button onClick={() => onDelete(h.id)} className="p-1.5 text-slate-500 hover:text-rose-600">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    )}
  </Modal>
);

export const NewCustomerModal: React.FC<{
  name: string;
  phone: string;
  type: Customer['customerType'];
  creditLimit: number;
  error: string;
  onNameChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onTypeChange: (value: Customer['customerType']) => void;
  onCreditLimitChange: (value: number) => void;
  onSave: () => void;
  onClose: () => void;
}> = ({ name, phone, type, creditLimit, error, onNameChange, onPhoneChange, onTypeChange, onCreditLimitChange, onSave, onClose }) => (
  <Modal title="إضافة عميل سريع" icon={<UserPlus className="w-5 h-5" />} onClose={onClose}>
    <div className="space-y-3">
      <Field label="اسم العميل *">
        <input value={name} onChange={(e) => onNameChange(e.target.value)} placeholder="مثال: أحمد محمد" className={inputCls} />
      </Field>
      <Field label="رقم الهاتف *">
        <input value={phone} onChange={(e) => onPhoneChange(e.target.value)} placeholder="01xxxxxxxxx" className={inputCls} />
      </Field>
      {error && <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800">{error}</div>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="نوع العميل">
          <select value={type} onChange={(e) => onTypeChange(e.target.value as Customer['customerType'])} className={inputCls}>
            <option value="RETAIL">قطاعي</option>
            <option value="WHOLESALE">جملة</option>
            <option value="CONTRACTOR">مقاول</option>
            <option value="ENGINEER">مهندس</option>
          </select>
        </Field>
        <Field label="حد الائتمان">
          <input type="number" value={creditLimit || ''} placeholder="0" onChange={(e) => onCreditLimitChange(parseFloat(e.target.value) || 0)} className={inputCls} />
        </Field>
      </div>
      <button
        onClick={onSave}
        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2"
      >
        <UserPlus className="w-4 h-4" /> حفظ واختيار العميل
      </button>
    </div>
  </Modal>
);

export const OpenShiftModal: React.FC<{
  registers: CashRegister[];
  registerId: string;
  openingBalance: number;
  onRegisterChange: (registerId: string) => void;
  onOpeningBalanceChange: (value: number) => void;
  onConfirm: () => void;
  onClose: () => void;
}> = ({ registers, registerId, openingBalance, onRegisterChange, onOpeningBalanceChange, onConfirm, onClose }) => (
  <Modal title="فتح وردية كاشير" icon={<Unlock className="w-5 h-5" />} onClose={onClose}>
    <div className="space-y-3">
      <Field label="الخزينة / نقطة الكاشير">
        <select value={registerId} onChange={(e) => onRegisterChange(e.target.value)} className={inputCls}>
          {registers.length === 0 ? (
            <option value="">لا توجد خزائن متاحة لهذا المستخدم</option>
          ) : (
            registers.map((r) => (
              <option key={r.id} value={r.id}>{r.name}{r.branchName ? ` — ${r.branchName}` : ''}
              </option>
            ))
          )}
        </select>
      </Field>
      <Field label="الرصيد الافتتاحي (نقدي)">
        <input type="number" value={openingBalance || ''} placeholder="0" onChange={(e) => onOpeningBalanceChange(parseFloat(e.target.value) || 0)} className={inputCls} />
      </Field>
      <button
        onClick={onConfirm}
        disabled={!registerId || registers.length === 0}
        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2"
      >
        <Unlock className="w-4 h-4" /> فتح الوردية
      </button>
    </div>
  </Modal>
);

export const CloseShiftModal: React.FC<{
  shift: CashShift;
  expectedClosingCash: number;
  notes: string;
  onNotesChange: (value: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}> = ({ shift, expectedClosingCash, notes, onNotesChange, onConfirm, onClose }) => (
  <Modal title="إقفال الوردية ومطابقة الصندوق" icon={<Lock className="w-5 h-5" />} onClose={onClose}>
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-slate-500">رقم الوردية</span><strong>{shift.shiftNumber}</strong></div>
        <div className="flex justify-between"><span className="text-slate-500">الرصيد الافتتاحي</span><strong>{CeramicMath.formatCurrency(shift.openingBalance)}</strong></div>
        <div className="flex justify-between"><span className="text-slate-500">مبيعات نقدية</span><strong>{CeramicMath.formatCurrency(shift.totalSalesCash)}</strong></div>
        <div className="flex justify-between"><span className="text-slate-500">تحصيلات العملاء</span><strong>{CeramicMath.formatCurrency(shift.totalCustomerPayments)}</strong></div>
        <div className="flex justify-between"><span className="text-slate-500">مصروفات / مرتجعات</span><strong>{CeramicMath.formatCurrency((shift.totalExpenses || 0) + (shift.totalRefunds || 0))}</strong></div>
        <div className="flex justify-between border-t border-slate-200 pt-2 text-base"><span className="font-bold">النقد المتوقع بالصندوق</span><strong className="text-emerald-700">{CeramicMath.formatCurrency(expectedClosingCash)}</strong></div>
      </div>
      <Field label="النقد الفعلي بعد العد">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm font-bold text-emerald-800">سيُسجّل الرصيد المتوقع تلقائيًا: {CeramicMath.formatCurrency(expectedClosingCash)}</div>
      </Field>
      <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">فرق الصندوق المحسوب: {CeramicMath.formatCurrency(0)}</div>
      <Field label="ملاحظات الإقفال">
        <textarea rows={2} value={notes} onChange={(e) => onNotesChange(e.target.value)} placeholder="سبب العجز أو الزيادة، إن وجد..." className={inputCls} />
      </Field>
      <button onClick={onConfirm} className="w-full py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl">تأكيد الرصيد المحسوب وإغلاق الوردية</button>
    </div>
  </Modal>
);

export const ToneWarningModal: React.FC<{
  conflicts: ToneMixingConflict[];
  onCancel: () => void;
  onContinue: () => void;
}> = ({ conflicts, onCancel, onContinue }) => (
  <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
    <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-amber-200">
      <div className="px-6 py-4 bg-amber-50 border-b border-amber-200 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
          <AlertCircle className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <h2 className="text-sm font-black text-slate-900">تحذير: خلط نغمات ألوان مختلفة</h2>
          <p className="text-xs text-amber-700">الكمية المطلوبة ستُسحب من دفعات بنغمات أو عيارات مختلفة</p>
        </div>
      </div>

      <div className="p-5 space-y-4 max-h-[55vh] overflow-y-auto">
        {conflicts.map((conflict) => (
          <div key={conflict.productId} className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="font-bold text-slate-900 text-sm mb-3">{conflict.productName}</div>
            <div className="space-y-2">
              {conflict.batches.map((b, i) => (
                <div key={i} className="flex items-center justify-between bg-white border border-amber-100 rounded-lg px-3 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold bg-violet-100 text-violet-700">
                      نغمة: {b.toneShade}
                    </span>
                    {b.caliber && b.caliber !== '0' && (
                      <span className="px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-700">
                        عيار: {b.caliber}
                      </span>
                    )}
                    <span className="font-mono text-slate-500">دفعة: {b.batchNumber}</span>
                  </div>
                  <span className="font-mono font-bold text-sky-700">{b.requiredM2.toFixed(2)} م²</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-amber-700 mt-3">
              ⚠️ قد يؤدي خلط هذه الدفعات إلى تباين في لون البلاط عند التركيب في موقع العميل.
            </p>
          </div>
        ))}
      </div>

      <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-sm font-bold transition"
        >
          إلغاء — مراجعة الكميات
        </button>
        <button
          onClick={onContinue}
          className="flex-1 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-bold transition"
        >
          متابعة على مسؤوليتي
        </button>
      </div>
    </div>
  </div>
);

const SHORTCUTS: Array<[string, string]> = [
  ['F1', 'عرض شاشة الاختصارات'],
  ['F2', 'التركيز على حقل البحث / الباركود'],
  ['F4', 'التركيز على المبلغ المدفوع'],
  ['F8', 'فتح حاسبة السيراميك والمقايسة'],
  ['F9', 'اعتماد وحفظ الفاتورة'],
  ['Esc', 'إغلاق النوافذ المفتوحة'],
];

export const ShortcutsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <Modal title="اختصارات لوحة المفاتيح" icon={<Keyboard className="w-5 h-5" />} onClose={onClose}>
    <div className="space-y-1.5 text-xs">
      {SHORTCUTS.map(([key, desc]) => (
        <div key={key} className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-2">
          <span className="text-slate-700">{desc}</span>
          <kbd className="font-mono bg-slate-100 text-sky-700 px-2 py-0.5 rounded text-[11px]">{key}</kbd>
        </div>
      ))}
    </div>
  </Modal>
);
