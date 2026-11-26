import React, { useMemo, useState } from 'react';
import { History, PlayCircle, Trash2, AlertTriangle, Clock, User, GitBranch } from 'lucide-react';
import { CeramicMath } from '../../../../utils/products/ceramicMath';
import { Modal } from './PosShared';
import type { HeldOrder } from '../../../../types/pos';

const ageHours = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? (Date.now() - t) / 3600_000 : 0;
};

const ageLabel = (hours: number) => {
  if (hours < 1) return 'أقل من ساعة';
  if (hours < 24) return `${Math.floor(hours)} ساعة`;
  const days = Math.floor(hours / 24);
  return `${days} يوم ${Math.floor(hours % 24)} ساعة`.trim();
};

export const HeldOrdersModal: React.FC<{
  orders: HeldOrder[];
  ttlHours?: number;
  staleHours?: number;
  onResume: (order: HeldOrder) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}> = ({ orders, ttlHours = 72, staleHours = 24, onResume, onDelete, onClose }) => {
  const [userFilter, setUserFilter] = useState('ALL');
  const [branchFilter, setBranchFilter] = useState('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const heldTotal = (h: HeldOrder) => {
    const lines = (h.items || []).reduce((sum, item) => sum + (item.quantityM2 * item.unitPrice - (item.discountAmount || 0)), 0);
    const base = Math.max(0, lines - (h.discountAmount || 0));
    const withTax = base + (h.taxPercentage ? base * (h.taxPercentage / 100) : 0);
    return withTax + (h.shippingCost || 0) + (h.extraFees || 0);
  };

  const owners = useMemo(() => {
    const map = new Map<string, string>();
    orders.forEach((o) => { if (o.createdBy) map.set(o.createdBy, o.ownerName || o.createdBy); });
    return [...map.entries()];
  }, [orders]);
  const branches = useMemo(() => {
    const set = new Set(orders.map((o) => o.branchName).filter((b): b is string => !!b));
    return [...set];
  }, [orders]);

  const filtered = useMemo(() => orders.filter((o) => {
    if (userFilter !== 'ALL' && o.createdBy !== userFilter) return false;
    if (branchFilter !== 'ALL' && (o.branchName || 'بدون فرع') !== branchFilter) return false;
    const day = o.createdAt?.slice(0, 10);
    if (fromDate && day && day < fromDate) return false;
    if (toDate && day && day > toDate) return false;
    return true;
  }), [orders, userFilter, branchFilter, fromDate, toDate]);

  const hasManaged = orders.some((o) => o.managed);

  return (
  <Modal title="الطلبات المعلّقة" icon={<History className="w-5 h-5" />} onClose={onClose}>
    {orders.length === 0 ? (
      <div className="text-center text-muted text-xs py-10">لا توجد طلبات معلّقة حالياً</div>
    ) : (
      <div className="space-y-2">
        {/* Filters: employee / branch / period */}
        <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-line bg-surface-muted/60 p-2 sm:grid-cols-4">
          <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} aria-label="تصفية حسب الموظف" className="min-h-9 rounded-lg border border-line bg-surface px-2 text-[11px] font-bold text-ink">
            <option value="ALL">كل الموظفين</option>
            {owners.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} aria-label="تصفية حسب الفرع" className="min-h-9 rounded-lg border border-line bg-surface px-2 text-[11px] font-bold text-ink">
            <option value="ALL">كل الفروع</option>
            {branches.map((b) => <option key={b} value={b}>{b}</option>)}
            {orders.some((o) => !o.branchName) && <option value="بدون فرع">بدون فرع</option>}
          </select>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} aria-label="من تاريخ" className="min-h-9 rounded-lg border border-line bg-surface px-2 text-[11px] font-bold text-ink" />
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} aria-label="إلى تاريخ" className="min-h-9 rounded-lg border border-line bg-surface px-2 text-[11px] font-bold text-ink" />
        </div>
        <p className="text-[10px] text-muted">{filtered.length} من {orders.length} طلب{hasManaged ? ' — الطلبات الموسومة بموظف آخر تتطلب صلاحية إدارة الطلبات المعلقة' : ''}</p>

        {filtered.length === 0 ? (
          <div className="text-center text-muted text-xs py-8">لا توجد طلبات مطابقة للفلاتر</div>
        ) : filtered.map((h) => {
          const hours = ageHours(h.createdAt);
          const expired = hours > ttlHours;
          const nearExpiry = !expired && hours > ttlHours * 0.75;
          const stale = !expired && hours > staleHours;
          return (
          <div key={h.id} className={`bg-surface border rounded-xl p-3 flex items-center justify-between gap-3 ${expired ? 'border-danger/50' : stale ? 'border-warning/50' : 'border-line'}`}>
            <div className="min-w-0">
              <div className="text-xs font-bold text-ink truncate flex items-center gap-1.5 flex-wrap">
                {h.customerName}
                {h.managed && h.ownerName && (
                  <span className="inline-flex items-center gap-0.5 rounded bg-accent-soft px-1.5 py-0.5 text-[9px] font-black text-primary">
                    <User className="w-2.5 h-2.5" />{h.ownerName}
                  </span>
                )}
                {h.branchName && (
                  <span className="inline-flex items-center gap-0.5 rounded bg-surface-sunken px-1.5 py-0.5 text-[9px] font-bold text-muted">
                    <GitBranch className="w-2.5 h-2.5" />{h.branchName}
                  </span>
                )}
              </div>
              <div className="text-[10px] text-muted flex items-center gap-1.5 flex-wrap">
                <span>{h.items.length} أصناف • {new Date(h.createdAt).toLocaleString('ar-EG')}</span>
                <span className="inline-flex items-center gap-0.5">
                  <Clock className="w-3 h-3" />{ageLabel(hours)}
                </span>
              </div>
              {stale && (
                <div className="mt-1 inline-flex items-center gap-1 rounded bg-warning-soft px-1.5 py-0.5 text-[9px] font-black text-warning">
                  <AlertTriangle className="w-2.5 h-2.5" /> معلق منذ فترة
                </div>
              )}
              {expired && (
                <div className="mt-1 inline-flex items-center gap-1 rounded bg-danger-soft px-1.5 py-0.5 text-[9px] font-black text-danger">
                  <AlertTriangle className="w-2.5 h-2.5" /> منتهي الصلاحية — لا يمكن استرجاعه
                </div>
              )}
              {!expired && nearExpiry && (
                <div className="mt-1 inline-flex items-center gap-1 rounded bg-accent-soft px-1.5 py-0.5 text-[9px] font-black text-primary">
                  <Clock className="w-2.5 h-2.5" /> يقترب من انتهاء الصلاحية
                </div>
              )}
              <div className="text-[11px] font-black text-primary tabular-nums mt-0.5">{CeramicMath.formatCurrency(heldTotal(h))}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => onResume(h)}
                disabled={expired}
                title={expired ? 'انتهت صلاحية الطلب المعلق' : 'استرجاع الطلب إلى السلة'}
                className="px-3 py-1.5 bg-primary hover:bg-primary text-white rounded-lg text-[11px] font-bold flex items-center gap-1 disabled:opacity-40"
              >
                <PlayCircle className="w-3.5 h-3.5" /> استرجاع
              </button>
              <button onClick={() => onDelete(h.id)} aria-label="حذف الطلب المعلق" className="p-1.5 text-muted hover:text-danger">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
          );
        })}
      </div>
    )}
  </Modal>
  );
};
