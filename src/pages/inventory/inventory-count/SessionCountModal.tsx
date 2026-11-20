import React from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { CheckCircle2, ClipboardList, Search, X } from 'lucide-react';
import { formatProductQuantity } from '../../../utils/products/productUnits';
import { fmtCountCurrency } from './helpers';
import { exportToExcel, exportToPdf } from '../../../utils/export/export';
import type { CountItem, CountSession, VisibleCountItem } from '../../../types/inventory/countSessions';

interface SessionCountModalProps {
  session: CountSession;
  items: CountItem[];
  visibleItems: VisibleCountItem[];
  itemSearch: string;
  onItemSearchChange: (value: string) => void;
  countedItems: number;
  varianceItems: number;
  onCountChange: (index: number, value: string) => void;
  onDiscrepancyReasonChange: (index: number, value: string) => void;
  onNoteChange: (index: number, value: string) => void;
  onSaveDraft: () => void;
  onPost: () => void;
  canApprove: boolean;
  onApprove: () => void;
  onReject: () => void;
  onCancelSession: () => void;
  onClose: () => void;
}


const isBlindCounting = (session: CountSession) =>
  session.isBlind && session.status === 'COUNTING';

const QuantityVariance: React.FC<{ value: number; item: CountItem }> = ({ value, item }) => {
  if (value > 0) return <span className="text-success">+{formatProductQuantity(value, item)}</span>;
  if (value < 0) return <span className="text-danger">{formatProductQuantity(value, item)}</span>;
  return <span className="text-muted">مطابق</span>;
};

const FinancialVariance: React.FC<{ value: number }> = ({ value }) => {
  if (value > 0) return <span className="text-success">+{fmtCountCurrency(value)}</span>;
  if (value < 0) return <span className="text-danger">{fmtCountCurrency(value)}</span>;
  return <span className="text-muted">0 ج</span>;
};

const countCellState = (item: CountItem, session: CountSession) => ({
  blindCounting: isBlindCounting(session),
  isPosted: session.status !== 'COUNTING',
  isCounted: item.countedQuantityM2 !== null,
  hasVariance: item.varianceM2 !== 0 && item.countedQuantityM2 !== null,
});

export const SessionCountModal: React.FC<SessionCountModalProps> = ({
  session,
  items,
  visibleItems,
  itemSearch,
  onItemSearchChange,
  countedItems,
  varianceItems,
  onCountChange,
  onDiscrepancyReasonChange,
  onNoteChange,
  onSaveDraft,
  onPost,
  canApprove,
  onApprove,
  onReject,
  onCancelSession,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface backdrop-blur-sm">
      <div className="bg-surface border border-line rounded-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden shadow-2xl flex flex-col">
        <div className="bg-surface-muted px-6 py-4 flex items-center justify-between border-b border-line shrink-0">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-primary" />
            <h3 className="text-base font-black text-ink">
              جلسة الجرد: {session.code} ({session.warehouse})
            </h3>
          </div>
          <div className="flex gap-2">
            {session.status === 'POSTED' && <>
              <button onClick={() => exportToExcel({ title: `Inventory count ${session.code}`, subtitle: `${session.warehouse} · ${session.startDate}`, fileName: `count-${session.code}`, columns: [{ key: 'product', label: 'Product' }, { key: 'system', label: 'System quantity' }, { key: 'counted', label: 'Counted quantity' }, { key: 'variance', label: 'Variance' }, { key: 'reason', label: 'Reason' }, { key: 'notes', label: 'Notes' }], rows: items.map(item => ({ product: item.productName, system: item.systemQuantityM2, counted: item.countedQuantityM2, variance: item.varianceM2, reason: item.discrepancyReason, notes: item.notes })), permission: 'inventory.export' })} className="rounded-lg border px-3 py-1 text-xs">Excel</button>
              <button onClick={() => exportToPdf({ title: `Inventory count ${session.code}`, subtitle: `${session.warehouse} · ${session.startDate}`, fileName: `count-${session.code}`, columns: [{ key: 'product', label: 'Product' }, { key: 'system', label: 'System quantity' }, { key: 'counted', label: 'Counted quantity' }, { key: 'variance', label: 'Variance' }, { key: 'reason', label: 'Reason' }, { key: 'notes', label: 'Notes' }], rows: items.map(item => ({ product: item.productName, system: item.systemQuantityM2, counted: item.countedQuantityM2, variance: item.varianceM2, reason: item.discrepancyReason, notes: item.notes })), permission: 'inventory.export' })} className="rounded-lg border px-3 py-1 text-xs">PDF / Print</button>
            </>}
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-4">
          {session.rejectionReason && session.status === 'COUNTING' && <div className="rounded-lg border border-danger-border bg-danger-soft p-3 text-xs text-danger"><strong>سبب الرفض السابق:</strong> {session.rejectionReason}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
            <div className="rounded-xl border border-line bg-surface-muted p-3"><div className="text-lg font-black text-ink">{countedItems}/{items.length}</div><div className="text-[11px] text-muted">أصناف تم جردها</div></div>
            <div className="rounded-xl border border-line bg-surface-muted p-3"><div className="text-lg font-black text-warning">{Math.max(0, items.length - countedItems)}</div><div className="text-[11px] text-muted">أصناف متبقية</div></div>
            <div className="rounded-xl border border-line bg-surface-muted p-3"><div className="text-lg font-black text-primary">{varianceItems}</div><div className="text-[11px] text-muted">فروقات مسجلة</div></div>
          </div>
          <div className="relative"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" /><input value={itemSearch} onChange={(e) => onItemSearchChange(e.target.value)} placeholder="بحث داخل أصناف الجرد..." className="w-full pr-9 pl-3 py-2 bg-surface border border-line rounded-xl text-sm" /></div>
          <div className="flex items-center justify-between text-xs text-muted bg-surface p-3 rounded-lg border border-line">
            <div>النوع: <span className="text-ink font-bold">{session.status === 'POSTED' ? 'مرحل ومعتمد' : 'قيد الجرد الفعلي'}</span></div>
            <div>القائم بالجرد: <span className="text-ink font-bold">{session.countedBy}</span></div>
            <div>التاريخ: <span className="text-ink font-bold font-mono">{session.startDate}</span></div>
          </div>

          <div className="border border-line rounded-xl overflow-hidden">
            <DataTable
              ariaLabel="أصناف جلسة الجرد"
              rows={visibleItems}
              rowKey={(row: any) => String(row.item.id)}
              stickyHeader
              tableClassName="text-xs"
              columns={[
                { key: 'name', header: 'اسم الصنف', render: (row: any) => <span className="font-semibold text-ink">{row.item.productName}</span> },
                {
                  key: 'system', header: 'رصيد النظام',
                  render: (row: any) => {
                    const { blindCounting } = countCellState(row.item, session);
                    return blindCounting ? (
                      <span className="rounded border border-accent-border bg-accent-soft px-2 py-0.5 text-[10px] text-primary">🔒 مخفي (عدّ أعمى)</span>
                    ) : (
                      <span className="font-mono font-bold text-muted">{formatProductQuantity(row.item.systemQuantityM2, row.item)}</span>
                    );
                  },
                },
                {
                  key: 'actual', header: 'الجرد الفعلي',
                  render: (row: any) => {
                    const { blindCounting, isPosted } = countCellState(row.item, session);
                    const item = row.item;
                    return isPosted ? (
                      <span className="font-mono font-bold text-ink">{formatProductQuantity(Number(item.countedQuantityM2), item)}</span>
                    ) : (
                      <input
                        type="number"
                        step="0.01"
                        value={item.countedQuantityM2 ?? ''}
                        onChange={(e) => onCountChange(row.index, e.target.value)}
                        placeholder="أدخل الجرد الفعلي"
                        className="w-28 rounded-lg border border-line bg-surface px-2 py-1 font-mono text-xs text-ink focus:border-primary focus:outline-none"
                      />
                    );
                  },
                },
                {
                  key: 'variance', header: 'الفارق',
                  render: (row: any) => {
                    const { blindCounting, isCounted } = countCellState(row.item, session);
                    const item = row.item;
                    if (blindCounting) return <span className="text-[11px] text-muted">يحتسب بعد الإدخال</span>;
                    if (isCounted) return <QuantityVariance value={item.varianceM2} item={item} />;
                    return <span className="font-mono font-bold text-muted">—</span>;
                  },
                },
                {
                  key: 'reason', header: 'سبب الفارق',
                  render: (row: any) => {
                    const { hasVariance, isPosted } = countCellState(row.item, session);
                    const item = row.item;
                    if (!hasVariance) return <span className="text-xs text-muted">—</span>;
                    if (isPosted) return <span className="text-xs font-bold text-ink">{item.discrepancyReason || 'غير محدد'}</span>;
                    return (
                      <select
                        value={item.discrepancyReason || ''}
                        onChange={(e) => onDiscrepancyReasonChange(row.index, e.target.value)}
                        className="w-28 rounded-lg border border-line bg-surface px-2 py-1 text-[10px] font-bold text-ink focus:border-primary focus:outline-none"
                      >
                        <option value="">-- سبب الفارق --</option>
                        <option value="BREAKAGE">كسر وتلف</option>
                        <option value="THEFT">عجز / فقد</option>
                        <option value="MISCOUNT">خطأ في العد</option>
                        <option value="INPUT_ERROR">خطأ إدخال سابق</option>
                        <option value="SUPPLIER_SHORTAGE">عجز توريد</option>
                        <option value="OTHER">أخرى</option>
                      </select>
                    );
                  },
                },
                { key: 'cost', header: 'سعر التكلفة', render: (row: any) => <span className="font-mono text-muted">{fmtCountCurrency(row.item.unitCost)}</span> },
                {
                  key: 'finvar', header: 'الفارق المالي',
                  render: (row: any) => {
                    const { blindCounting, isCounted } = countCellState(row.item, session);
                    const item = row.item;
                    if (blindCounting) return <span className="font-mono font-bold text-muted">—</span>;
                    if (isCounted) return <FinancialVariance value={item.varianceValue} />;
                    return <span className="font-mono font-bold text-muted">—</span>;
                  },
                },
                {
                  key: 'notes', header: 'ملاحظات',
                  render: (row: any) => {
                    const { isPosted } = countCellState(row.item, session);
                    const item = row.item;
                    return (
                      <input
                        value={item.notes}
                        disabled={isPosted}
                        onChange={(e) => onNoteChange(row.index, e.target.value)}
                        maxLength={250}
                        placeholder="ملاحظة"
                        className="w-28 rounded-lg border border-line bg-surface px-2 py-1 text-xs disabled:border-transparent"
                      />
                    );
                  },
                },
              ]}
              emptyTitle="لا توجد أصناف تطابق البحث"
            />
          </div>
        </div>

        <div className="bg-surface-muted px-6 py-4 border-t border-line flex justify-between shrink-0">
          <div>
            {session.status === 'COUNTING' && (
              <button
                onClick={onSaveDraft}
                className="px-4 py-2 bg-surface-sunken hover:bg-surface-sunken text-ink rounded-xl text-xs font-bold transition border border-line-strong"
              >
                حفظ كمسودة
              </button>
            )}
            {session.status === 'COUNTING' && <button onClick={onCancelSession} className="mr-2 px-4 py-2 text-danger rounded-xl text-xs font-bold border border-danger-border">إلغاء الجلسة</button>}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-surface-muted hover:bg-surface-sunken text-ink-secondary rounded-xl text-xs font-bold transition border border-line"
            >
              إغلاق
            </button>
            {session.status === 'COUNTING' && (
              <button
                onClick={onPost}
                className="px-4 py-2 bg-primary hover:bg-primary text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                اعتماد وترحيل فروقات الجرد
              </button>
            )}
            {session.status === 'REVIEW' && canApprove && <>
              <button onClick={onReject} className="px-4 py-2 bg-danger-soft text-danger rounded-xl text-xs font-bold border border-danger-border">رفض وإعادة للعد</button>
              <button onClick={onApprove} className="px-4 py-2 bg-success text-white rounded-xl text-xs font-bold">اعتماد وترحيل الفروقات</button>
            </>}
          </div>
        </div>
      </div>
    </div>
  );
};
