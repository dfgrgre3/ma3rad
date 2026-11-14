import React, { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, MonitorSmartphone, Tv, Undo2, Users, Wallet } from 'lucide-react';
import type { PosToolbarProps } from './PosToolbar';

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
        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition whitespace-nowrap bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200 ${moreOpen ? 'bg-slate-200' : ''}`}
      >
        <MoreHorizontal className="w-4 h-4" />
        <span className="hidden lg:inline">المزيد</span>
      </button>
      {moreOpen && (
        <div role="menu" className="absolute left-0 z-40 mt-2 w-64 rounded-2xl border border-slate-200 bg-white shadow-2xl py-1.5 overflow-hidden">
          {props.activeShift && (
            <button type="button" role="menuitem" onClick={() => { setMoreOpen(false); props.onSwitchUser(); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition">
              <Users className="w-4 h-4 text-slate-400" /> {props.actingUserName ? `المستخدم: ${props.actingUserName}` : 'تبديل المستخدم (PIN)'}
            </button>
          )}
          {props.actingUserName && (
            <button type="button" role="menuitem" onClick={() => { setMoreOpen(false); props.onResetActingUser(); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-amber-700 hover:bg-amber-50 transition">
              <Undo2 className="w-4 h-4 text-amber-500" /> العودة للمستخدم الأصلي
            </button>
          )}
          {props.activeShift && (
            <button type="button" role="menuitem" onClick={() => { setMoreOpen(false); props.onOpenCustomerDisplay(); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition">
              <Tv className="w-4 h-4 text-slate-400" /> شاشة عرض العميل
            </button>
          )}
          {props.activeShift && (
            <button type="button" role="menuitem" onClick={() => { setMoreOpen(false); props.onToggleTouchMode(); }} aria-pressed={props.touchMode} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition">
              <MonitorSmartphone className="w-4 h-4 text-slate-400" /> وضع شاشة اللمس
              <span className={`mr-auto text-[10px] px-2 py-0.5 rounded-full ${props.touchMode ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{props.touchMode ? 'مفعل' : 'متوقف'}</span>
            </button>
          )}
          <button type="button" role="menuitem" onClick={() => { setMoreOpen(false); props.onOpenCashboxes(); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition">
            <Wallet className="w-4 h-4 text-slate-400" /> الخزينة وصناديق الكاش
          </button>
        </div>
      )}
    </div>
  );
};
