import React from 'react';
import { Unlock } from 'lucide-react';
import type { CashRegister } from '../../../../types';
import { Field, Modal, inputCls } from './PosShared';

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
      <Field label="الخزينة / نقطة الكاشير" id="open-shift-register">
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
      <Field label="الرصيد الافتتاحي (نقدي)" id="open-shift-opening-balance">
        <input type="number" value={openingBalance || ''} placeholder="0" onChange={(e) => onOpeningBalanceChange(Number.parseFloat(e.target.value) || 0)} className={inputCls} />
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
