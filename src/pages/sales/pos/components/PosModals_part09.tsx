import React from 'react';
import { AlertCircle } from 'lucide-react';
import type { ToneMixingConflict } from '../../../../types';

export const ToneWarningModal: React.FC<{
  conflicts: ToneMixingConflict[];
  onCancel: () => void;
  onContinue: () => void;
}> = ({ conflicts, onCancel, onContinue }) => (
  <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
    <div className="bg-surface rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-warning-border">
      <div className="px-6 py-4 bg-warning-soft border-b border-warning-border flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-warning-soft flex items-center justify-center">
          <AlertCircle className="w-5 h-5 text-warning" />
        </div>
        <div>
          <h2 className="text-sm font-black text-ink">تحذير: خلط نغمات ألوان مختلفة</h2>
          <p className="text-xs text-warning">الكمية المطلوبة ستُسحب من دفعات بنغمات أو عيارات مختلفة</p>
        </div>
      </div>

      <div className="p-5 space-y-4 max-h-[55vh] overflow-y-auto">
        {conflicts.map((conflict) => (
          <div key={conflict.productId} className="bg-warning-soft border border-warning-border rounded-xl p-4">
            <div className="font-bold text-ink text-sm mb-3">{conflict.productName}</div>
            <div className="space-y-2">
              {conflict.batches.map((b, i) => (
                <div key={i} className="flex items-center justify-between bg-surface border border-warning-border rounded-lg px-3 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold bg-accent-soft text-primary">
                      نغمة: {b.toneShade}
                    </span>
                    {b.caliber && b.caliber !== '0' && (
                      <span className="px-2 py-0.5 rounded-full font-bold bg-warning-soft text-warning">
                        عيار: {b.caliber}
                      </span>
                    )}
                    <span className="font-mono text-muted">دفعة: {b.batchNumber}</span>
                  </div>
                  <span className="font-mono font-bold text-primary">{b.requiredM2.toFixed(2)} م²</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-warning mt-3">
              ⚠️ قد يؤدي خلط هذه الدفعات إلى تباين في لون البلاط عند التركيب في موقع العميل.
            </p>
          </div>
        ))}
      </div>

      <div className="px-6 py-4 bg-surface-muted border-t border-line flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 px-4 py-2.5 bg-surface-sunken hover:bg-surface-sunken text-ink rounded-xl text-sm font-bold transition"
        >
          إلغاء — مراجعة الكميات
        </button>
        <button
          onClick={onContinue}
          className="flex-1 px-4 py-2.5 bg-warning hover:bg-warning text-white rounded-xl text-sm font-bold transition"
        >
          متابعة على مسؤوليتي
        </button>
      </div>
    </div>
  </div>
);
