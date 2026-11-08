import React, { useEffect, useRef, useState } from 'react';
import {
  Keyboard, Lock, PauseCircle, ShoppingCart, Unlock, Wallet,
  MoreHorizontal, MonitorSmartphone, Users, Undo2, Tv,
} from 'lucide-react';
import type { CashShift } from '../../types';
import { CeramicMath } from '../../utils/ceramicMath';

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

const btnBase = 'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition whitespace-nowrap';
const btnAccent = `${btnBase} bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200`;

export const PosToolbar: React.FC<PosToolbarProps> = ({
  activeShift,
  actingUserName,
  canCloseShift,
  canOpenShift,
  touchMode,
  heldCount,
  isFullScreen = false,
  onToggleFullScreen,
  onCloseShift,
  onSwitchUser,
  onResetActingUser,
  onOpenCustomerDisplay,
  onToggleTouchMode,
  onOpenShift,
  onOpenCashboxes,
  onOpenHeldOrders,
  onOpenShortcuts,
}) => {
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
    <div className="px-4 py-2.5 bg-white border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
      {/* الهوية + حالة الوردية */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20 shrink-0">
          <ShoppingCart className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <h1 className="text-sm font-black text-slate-900 leading-tight">نقطة البيع السريعة</h1>
          <div className="flex items-center gap-2 text-[11px] text-slate-500 whitespace-nowrap">
            {activeShift ? (
              <>
                <span className="flex items-center gap-1 text-emerald-600 font-bold">
                  <Unlock className="w-3 h-3" /> وردية مفتوحة
                </span>
                <span className="font-mono hidden sm:inline">{activeShift.shiftNumber}</span>
                <span className="hidden md:inline">•</span>
                <span className="hidden md:inline truncate max-w-[140px]">{activeShift.registerName}</span>
                <span className="hidden xl:flex items-center gap-2 mr-2 pr-2 border-r border-slate-200">
                  <span>كاش: <span className="font-black text-emerald-600">{CeramicMath.formatCurrency(activeShift.totalSalesCash)}</span></span>
                  <span>بطاقة: <span className="font-black text-sky-600">{CeramicMath.formatCurrency(activeShift.totalSalesCard)}</span></span>
                </span>
              </>
            ) : (
              <span className="flex items-center gap-1 text-amber-600 font-bold">
                <Lock className="w-3 h-3" /> لا توجد وردية مفتوحة
              </span>
            )}
          </div>
        </div>
      </div>

      {/* الإجراءات الأساسية */}
      <div className="flex items-center gap-1.5 shrink-0">
        {activeShift && canCloseShift && (
          <button onClick={onCloseShift} title="إغلاق الوردية" className={`${btnBase} bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100`}>
            <Lock className="w-4 h-4" /> <span className="hidden sm:inline">إغلاق الوردية</span>
          </button>
        )}
        {!activeShift && canOpenShift && (
          <button onClick={onOpenShift} title="فتح وردية جديدة" className={`${btnBase} bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-500`}>
            <Unlock className="w-4 h-4" /> <span className="hidden sm:inline">فتح وردية</span>
          </button>
        )}

        <button onClick={onOpenHeldOrders} title="الفواتير المعلقة (F10)" className={`relative ${btnAccent}`}>
          <PauseCircle className="w-4 h-4" /> <span className="hidden sm:inline">المعلّقة</span>
          {heldCount > 0 && (
            <span className="absolute -top-1.5 -left-1.5 min-w-5 h-5 px-1 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black flex items-center justify-center">
              {heldCount}
            </span>
          )}
        </button>

        <button onClick={onOpenShortcuts} title="اختصارات لوحة المفاتيح (F1)" className={btnAccent}>
          <Keyboard className="w-4 h-4" /><span className="hidden lg:inline">F1</span>
        </button>

        {/* قائمة المزيد — الإجراءات الثانوية */}
        <div className="relative" ref={moreRef}>
          <button
            onClick={() => setMoreOpen((v) => !v)}
            title="المزيد من الخيارات"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            className={`${btnAccent} ${moreOpen ? 'bg-slate-200' : ''}`}
          >
            <MoreHorizontal className="w-4 h-4" />
            <span className="hidden lg:inline">المزيد</span>
          </button>
          {moreOpen && (
            <div role="menu" className="absolute left-0 z-40 mt-2 w-64 rounded-2xl border border-slate-200 bg-white shadow-2xl py-1.5 overflow-hidden">
              {activeShift && (
                <button role="menuitem" onClick={() => { setMoreOpen(false); onSwitchUser(); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition">
                  <Users className="w-4 h-4 text-slate-400" /> {actingUserName ? `المستخدم: ${actingUserName}` : 'تبديل المستخدم (PIN)'}
                </button>
              )}
              {actingUserName && (
                <button role="menuitem" onClick={() => { setMoreOpen(false); onResetActingUser(); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-amber-700 hover:bg-amber-50 transition">
                  <Undo2 className="w-4 h-4 text-amber-500" /> العودة للمستخدم الأصلي
                </button>
              )}
              {activeShift && (
                <button role="menuitem" onClick={() => { setMoreOpen(false); onOpenCustomerDisplay(); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition">
                  <Tv className="w-4 h-4 text-slate-400" /> شاشة عرض العميل
                </button>
              )}
              {activeShift && (
                <button role="menuitem" onClick={() => { setMoreOpen(false); onToggleTouchMode(); }} aria-pressed={touchMode} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition">
                  <MonitorSmartphone className="w-4 h-4 text-slate-400" /> وضع شاشة اللمس
                  <span className={`mr-auto text-[10px] px-2 py-0.5 rounded-full ${touchMode ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{touchMode ? 'مفعل' : 'متوقف'}</span>
                </button>
              )}
              <button role="menuitem" onClick={() => { setMoreOpen(false); onOpenCashboxes(); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition">
                <Wallet className="w-4 h-4 text-slate-400" /> الخزينة وصناديق الكاش
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
