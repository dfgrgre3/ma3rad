import React, { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, MonitorSmartphone, Tv, Undo2, Users, Wallet } from 'lucide-react';
import type { PosToolbarProps } from './PosToolbar';
import { usePosActivityCopy } from '../../../../hooks/pages/sales/pos/usePosActivityCopy';

type PosToolbarMoreMenuProps = Pick<
  PosToolbarProps,
  | 'activeShift'
  | 'actingUserName'
  | 'touchMode'
  | 'onSwitchUser'
  | 'onResetActingUser'
  | 'onOpenCustomerDisplay'
  | 'onToggleTouchMode'
  | 'onOpenCashboxes'
>;

export const PosToolbarMoreMenu: React.FC<PosToolbarMoreMenuProps> = (props) => {
  const copy = usePosActivityCopy();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) setMoreOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [moreOpen]);

  return (
    <div className="relative" ref={moreRef}>
      <button
        type="button"
        onClick={() => setMoreOpen((value) => !value)}
        title="المزيد من الخيارات"
        aria-haspopup="menu"
        aria-expanded={moreOpen}
        aria-label="المزيد من خيارات نقطة البيع"
        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition whitespace-nowrap bg-surface-sunken text-ink border-line-strong hover:bg-surface-sunken ${moreOpen ? 'bg-surface-sunken' : ''}`}
      >
        <MoreHorizontal className="w-4 h-4" />
        <span className="hidden lg:inline">المزيد</span>
      </button>
      {moreOpen && (
        <div role="menu" className="absolute left-0 z-40 mt-2 w-64 rounded-2xl border border-line bg-surface shadow-2xl py-1.5 overflow-hidden">
          {props.activeShift && (
            <button type="button" role="menuitem" onClick={() => { setMoreOpen(false); props.onSwitchUser(); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-ink hover:bg-surface-muted transition">
              <Users className="w-4 h-4 text-muted" /> {props.actingUserName ? `المستخدم: ${props.actingUserName}` : 'تبديل المستخدم (PIN)'}
            </button>
          )}
          {props.actingUserName && (
            <button type="button" role="menuitem" onClick={() => { setMoreOpen(false); props.onResetActingUser(); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-warning hover:bg-warning-soft transition">
              <Undo2 className="w-4 h-4 text-warning" /> العودة للمستخدم الأصلي
            </button>
          )}
          {props.activeShift && (
            <button type="button" role="menuitem" onClick={() => { setMoreOpen(false); props.onOpenCustomerDisplay(); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-ink hover:bg-surface-muted transition">
              <Tv className="w-4 h-4 text-muted" /> شاشة {copy.displayTitle}
            </button>
          )}
          {props.activeShift && (
            <button type="button" role="menuitem" onClick={() => { setMoreOpen(false); props.onToggleTouchMode(); }} aria-pressed={props.touchMode} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-ink hover:bg-surface-muted transition">
              <MonitorSmartphone className="w-4 h-4 text-muted" /> وضع شاشة اللمس
              <span className={`ms-auto text-[10px] px-2 py-0.5 rounded-full ${props.touchMode ? 'bg-success-soft text-success' : 'bg-surface-sunken text-muted'}`}>{props.touchMode ? 'مفعل' : 'متوقف'}</span>
            </button>
          )}
          <button type="button" role="menuitem" onClick={() => { setMoreOpen(false); props.onOpenCashboxes(); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-ink hover:bg-surface-muted transition">
            <Wallet className="w-4 h-4 text-muted" /> الخزينة وصناديق الكاش
          </button>
        </div>
      )}
    </div>
  );
};
