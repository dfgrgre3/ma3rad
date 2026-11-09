import { type Dispatch, type SetStateAction } from 'react';
import type { CashShift } from '../../types';
import type { CashierService } from '../../services/finance/CashierService';
import type { Toast } from '../../types/pos';

export const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character] || character));

export interface UsePosShiftActionsOptions {
  can: (permission: string) => boolean;
  notify: (message: string, type?: Toast['type']) => void;
  cashierService: CashierService;
  registerId: string;
  openingBalance: number;
  setOpeningBalance: Dispatch<SetStateAction<number>>;
  currentUserId?: string;
  effectiveUserId?: string;
  activeShift: CashShift | null;
  expectedClosingCash: number;
  setActiveShift: Dispatch<SetStateAction<CashShift | null>>;
  closingCash: number;
  setClosingCash: Dispatch<SetStateAction<number>>;
  closingNotes: string;
  setClosingNotes: Dispatch<SetStateAction<string>>;
  setIsOpenShiftModalOpen: Dispatch<SetStateAction<boolean>>;
  setIsCloseShiftModalOpen: Dispatch<SetStateAction<boolean>>;
}
