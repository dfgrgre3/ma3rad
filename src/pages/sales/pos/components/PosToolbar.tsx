import React from 'react';
import type { CashShift } from '../../../../types';
import { PosShiftStatus } from './PosShiftStatus';
import { PosToolbarActions } from './PosToolbarActions';

export interface PosToolbarProps {
  activeShift: CashShift | null;
  actingUserName?: string;
  canCloseShift: boolean;
  canOpenShift: boolean;
  touchMode: boolean;
  heldCount: number;
  isFullScreen?: boolean;
  onToggleFullScreen?: () => void;
  onCloseShift: () => void;
  onSwitchUser: () => void;
  onResetActingUser: () => void;
  onOpenCustomerDisplay: () => void;
  onToggleTouchMode: () => void;
  onOpenShift: () => void;
  onOpenCashboxes: () => void;
  onOpenHeldOrders: () => void;
  onOpenShortcuts: () => void;
}

export const PosToolbar: React.FC<PosToolbarProps> = (props) => (
  <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2 max-[1100px]:flex-col max-[1100px]:items-stretch">
    <PosShiftStatus activeShift={props.activeShift} />
    <PosToolbarActions {...props} />
  </div>
);
