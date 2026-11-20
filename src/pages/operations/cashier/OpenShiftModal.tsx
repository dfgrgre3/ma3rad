import React, { useState } from 'react';
import { Clock } from 'lucide-react';
import type { CashRegister } from '../../../types';

interface Props {
  isOpen: boolean;
  registers: CashRegister[];
  defaultRegisterId: string;
  defaultOpeningBalance: number;
  onClose: () => void;
  onSubmit: (regId: string, balance: number) => Promise<void>;
  getSuggestedBalance: (regId: string) => number;
}

export const OpenShiftModal: React.FC<Props> = ({
  isOpen,
  registers,
  defaultRegisterId,
  defaultOpeningBalance,
  onClose,
  onSubmit,
  getSuggestedBalance,
}) => {
  const [registerId, setRegisterId] = useState(defaultRegisterId);
  const [openingBalance, setOpeningBalance] = useState(defaultOpeningBalance);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-surface/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-surface rounded-3xl border border-line shadow-2xl max-w-sm w-full p-6 space-y-5 animate-in zoom-in-95 duration-200">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-success-soft text-success flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-extrabold text-ink">فتح وردية جديدة</h3>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void onSubmit(registerId, openingBalance);
          }}
          className="space-y-4"
        >
          {registers.length > 1 && (
            <div>
              <label htmlFor="shift-reg" className="font-bold text-xs text-ink block mb-1.5">الخزينة</label>
              <select
                id="shift-reg"
                value={registerId}
                onChange={(e) => {
                  setRegisterId(e.target.value);
                  setOpeningBalance(getSuggestedBalance(e.target.value));
                }}
                className="w-full px-4 py-3 bg-surface-muted rounded-xl border border-line font-bold"
              >
                {registers.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}{r.branchName ? ` — ${r.branchName}` : ''}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="opening-bal" className="font-bold text-xs text-ink block mb-1.5">الرصيد الافتتاحي (ج.م) *</label>
            <input
              id="opening-bal"
              type="number"
              required
              value={openingBalance}
              onChange={(e) => setOpeningBalance(parseFloat(e.target.value) || 0)}
              className="w-full px-4 py-3 bg-surface-muted rounded-xl border border-line font-black text-lg focus:ring-2 focus:ring-success/20 focus:border-success outline-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-3 bg-surface-sunken text-ink font-bold rounded-xl hover:bg-surface-sunken">
              إلغاء
            </button>
            <button type="submit" className="flex-[2] px-5 py-3 bg-success hover:bg-success text-white font-bold rounded-xl shadow-lg shadow-success/20">
              تأكيد الفتح
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
