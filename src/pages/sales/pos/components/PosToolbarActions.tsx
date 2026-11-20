import React from 'react';
import { Keyboard, Lock, PauseCircle, Unlock } from 'lucide-react';
import type { PosToolbarProps } from './PosToolbar';
import { PosToolbarMoreMenu } from './PosToolbarMoreMenu';
import { usePosActivityCopy } from '../../../../hooks/pages/sales/pos/usePosActivityCopy';

const btnBase = 'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2';
const btnAccent = `${btnBase} bg-surface-sunken text-ink border-line-strong hover:bg-surface-sunken`;

type PosToolbarActionsProps = Pick<
  PosToolbarProps,
  | 'activeShift'
  | 'actingUserName'
  | 'canCloseShift'
  | 'canOpenShift'
  | 'touchMode'
  | 'heldCount'
  | 'onCloseShift'
  | 'onSwitchUser'
  | 'onResetActingUser'
  | 'onOpenCustomerDisplay'
  | 'onToggleTouchMode'
  | 'onOpenShift'
  | 'onOpenCashboxes'
  | 'onOpenHeldOrders'
  | 'onOpenShortcuts'
>;

export const PosToolbarActions: React.FC<PosToolbarActionsProps> = (props) => {
  const copy = usePosActivityCopy();
  return (
  <div className="flex shrink-0 flex-wrap items-center gap-1.5 max-[1100px]:justify-start">
    {props.activeShift && props.canCloseShift && (
      <button type="button" onClick={props.onCloseShift} title="إغلاق الوردية" aria-label="إغلاق الوردية" className={`${btnBase} bg-danger-soft text-danger border-danger-border hover:bg-danger-soft`}>
        <Lock className="w-4 h-4" aria-hidden="true" /> <span>إغلاق الوردية</span>
      </button>
    )}
    {!props.activeShift && props.canOpenShift && (
      <button type="button" onClick={props.onOpenShift} title="فتح وردية جديدة" aria-label="فتح وردية جديدة" className={`${btnBase} bg-success text-white border-success hover:bg-success`}>
        <Unlock className="w-4 h-4" aria-hidden="true" /> <span>فتح وردية</span>
      </button>
    )}
    <button type="button" onClick={props.onOpenHeldOrders} title={`عرض ${copy.heldLabel} (F10)`} aria-label={`${copy.heldLabel}، العدد ${props.heldCount} (F10)`} className={`relative ${btnAccent}`}>
      <PauseCircle className="w-4 h-4" aria-hidden="true" /> <span>{copy.heldLabel}</span>
      {props.heldCount > 0 && (
        <span className="absolute -top-1.5 -left-1.5 min-w-5 h-5 px-1 rounded-full bg-warning text-ink text-[10px] font-black flex items-center justify-center">
          {props.heldCount}
        </span>
      )}
    </button>
    <button type="button" onClick={props.onOpenShortcuts} title="عرض اختصارات لوحة المفاتيح (F1)" aria-label="اختصارات لوحة المفاتيح (F1)" className={btnAccent}>
      <Keyboard className="w-4 h-4" aria-hidden="true" /><span>الاختصارات</span>
    </button>
    <PosToolbarMoreMenu
      activeShift={props.activeShift}
      actingUserName={props.actingUserName}
      touchMode={props.touchMode}
      onSwitchUser={props.onSwitchUser}
      onResetActingUser={props.onResetActingUser}
      onOpenCustomerDisplay={props.onOpenCustomerDisplay}
      onToggleTouchMode={props.onToggleTouchMode}
      onOpenCashboxes={props.onOpenCashboxes}
    />
  </div>
  );
};
