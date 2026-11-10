import React from 'react';
import { Keyboard, Lock, PauseCircle, Unlock } from 'lucide-react';
import type { PosToolbarProps } from './PosToolbar';
import { PosToolbarMoreMenu } from './PosToolbarMoreMenu';

const btnBase = 'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition whitespace-nowrap';
const btnAccent = `${btnBase} bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200`;

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

export const PosToolbarActions: React.FC<PosToolbarActionsProps> = (props) => (
  <div className="flex shrink-0 flex-wrap items-center gap-1.5 max-[1100px]:justify-start">
    {props.activeShift && props.canCloseShift && (
      <button onClick={props.onCloseShift} title="إغلاق الوردية" className={`${btnBase} bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100`}>
        <Lock className="w-4 h-4" /> <span className="hidden sm:inline">إغلاق الوردية</span>
      </button>
    )}
    {!props.activeShift && props.canOpenShift && (
      <button onClick={props.onOpenShift} title="فتح وردية جديدة" className={`${btnBase} bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-500`}>
        <Unlock className="w-4 h-4" /> <span className="hidden sm:inline">فتح وردية</span>
      </button>
    )}
    <button onClick={props.onOpenHeldOrders} title="الفواتير المعلقة (F10)" className={`relative ${btnAccent}`}>
      <PauseCircle className="w-4 h-4" /> <span className="hidden sm:inline">المعلّقة</span>
      {props.heldCount > 0 && (
        <span className="absolute -top-1.5 -left-1.5 min-w-5 h-5 px-1 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black flex items-center justify-center">
          {props.heldCount}
        </span>
      )}
    </button>
    <button onClick={props.onOpenShortcuts} title="اختصارات لوحة المفاتيح (F1)" className={btnAccent}>
      <Keyboard className="w-4 h-4" /><span className="hidden lg:inline">F1</span>
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
