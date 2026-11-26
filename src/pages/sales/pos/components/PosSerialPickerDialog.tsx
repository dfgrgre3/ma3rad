import React, { useEffect, useMemo, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import type { Product } from '../../../../types';
import type { ProductSerialService } from '../../../../services/domains/inventory/ProductSerialService';
import type { Toast } from '../../../../types/pos';

export interface PosSerialPickerDialogProps {
  product: Product;
  warehouseId: string;
  serialService: Pick<ProductSerialService, 'getAvailableSerials'>;
  /** Pre-selected serials when editing an existing cart line. */
  preset?: { id: string; serialNumber: string }[];
  onConfirm: (serials: { id: string; serialNumber: string }[]) => void;
  onClose: () => void;
  notify?: (message: string, type?: Toast['type']) => void;
}

/**
 * Lets the cashier pick the exact serial/IMEI units for a tracked product.
 * One serial = one sold unit; the cart line quantity follows the selection.
 */
export const PosSerialPickerDialog: React.FC<PosSerialPickerDialogProps> = ({
  product, warehouseId, serialService, preset, onConfirm, onClose, notify,
}) => {
  const [serials, setSerials] = useState<{ id: string; serialNumber: string; receivedAt?: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Map<string, { id: string; serialNumber: string }>>(new Map());

  useEffect(() => {
    setLoading(true);
    setLoadError('');
    try {
      const available = serialService.getAvailableSerials(product.id, warehouseId);
      setSerials(available.map((s) => ({ id: s.id, serialNumber: s.serialNumber, receivedAt: s.receivedAt })));
      const presetMap = new Map((preset || []).map((s) => [s.id, s]));
      const next = new Map<string, { id: string; serialNumber: string }>();
      available.forEach((s) => {
        const p = presetMap.get(s.id);
        if (p) next.set(s.id, p);
      });
      // Preserve preset serials even if they left the warehouse view — they were
      // validated as IN_STOCK when the line was created.
      (preset || []).forEach((s) => { if (!next.has(s.id)) next.set(s.id, s); });
      setSelected(next);
    } catch (e: any) {
      setLoadError(e?.message || 'تعذر تحميل الأرقام التسلسلية المتاحة.');
    } finally {
      setLoading(false);
    }
  }, [product.id, warehouseId, serialService, preset]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('ar-EG');
    if (!term) return serials;
    return serials.filter((s) => s.serialNumber.toLocaleLowerCase('ar-EG').includes(term));
  }, [serials, search]);

  const toggle = (serial: { id: string; serialNumber: string }) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(serial.id)) next.delete(serial.id);
      else next.set(serial.id, serial);
      return next;
    });
  };

  const confirm = () => {
    if (!selected.size) { notify?.('حدد رقماً تسلسلياً واحداً على الأقل.', 'warning'); return; }
    onConfirm([...selected.values()]);
  };

  return (
    <div className="fixed inset-0 z-[130] bg-primary/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface rounded-3xl border border-line shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-line p-4 pb-3">
          <div className="min-w-0">
            <h3 className="text-sm font-black text-ink truncate">الأرقام التسلسلية — {product.name}</h3>
            <p className="mt-1 text-[11px] text-muted">
              كل رقم تسلسلي يمثل وحدة مباعة واحدة. المتاح في المخزن: {serials.length}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-surface-muted">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="border-b border-line p-3">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث برقم تسلسلي / IMEI…"
              className="w-full rounded-xl border border-line bg-surface py-2 pr-9 pl-3 text-xs font-bold text-ink"
              autoFocus
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-1.5">
          {loading ? (
            <p className="py-8 text-center text-xs text-muted">جارٍ تحميل الأرقام المتاحة…</p>
          ) : loadError ? (
            <p className="py-8 text-center text-xs font-bold text-danger">{loadError}</p>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted">
              {serials.length === 0 ? 'لا توجد أرقام تسلسلية متاحة في هذا المخزن — سجّلها من صفحة الأرقام التسلسلية.' : 'لا توجد نتائج مطابقة للبحث.'}
            </p>
          ) : filtered.map((s) => {
            const isSelected = selected.has(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => toggle(s)}
                className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-right transition-colors ${isSelected ? 'border-primary bg-primary/5' : 'border-line bg-surface hover:bg-surface-muted'}`}
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${isSelected ? 'border-primary bg-primary text-white' : 'border-line text-transparent'}`}>
                  <Check className="w-3.5 h-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-xs font-black text-ink" dir="ltr">{s.serialNumber}</span>
                  {s.receivedAt && <span className="block text-[10px] text-muted">استُلم {String(s.receivedAt).slice(0, 10)}</span>}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-line p-3">
          <span className="text-[11px] font-black text-primary">{selected.size} وحدة محددة</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-xl border border-line px-4 py-2 text-xs font-bold text-muted">إلغاء</button>
            <button
              type="button"
              onClick={confirm}
              disabled={!selected.size}
              className="rounded-xl bg-primary px-5 py-2 text-xs font-black text-white disabled:opacity-40"
            >
              إضافة للسلة ({selected.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
