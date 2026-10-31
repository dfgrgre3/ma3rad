import React from 'react';
import {
  Keyboard, Lock, PauseCircle, ShoppingCart, Unlock, UserPlus, Wallet,
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

export const PosToolbar: React.FC<PosToolbarProps> = ({
  activeShift,
  actingUserName,
  canCloseShift,
  canOpenShift,
  touchMode,
  heldCount,
  onCloseShift,
  onSwitchUser,
  onResetActingUser,
  onOpenCustomerDisplay,
  onToggleTouchMode,
  onOpenShift,
  onOpenCashboxes,
  onOpenHeldOrders,
  onOpenShortcuts,
}) => (
  <div className="px-4 py-3 bg-white border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
        <ShoppingCart className="w-5 h-5 text-white" />
      </div>
      <div>
        <h1 className="text-sm font-black text-slate-900 leading-tight">نقطة البيع السريعة</h1>
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          {activeShift ? (
            <>
              <span className="flex items-center gap-1 text-emerald-600 font-bold">
                <Unlock className="w-3 h-3" /> وردية مفتوحة
              </span>
              <span className="font-mono">{activeShift.shiftNumber}</span>
              <span>•</span>
              <span>{activeShift.registerName}</span>
            </>
          ) : (
            <span className="flex items-center gap-1 text-amber-600 font-bold">
              <Lock className="w-3 h-3" /> لا توجد وردية مفتوحة
            </span>
          )}
        </div>
      </div>
    </div>

    <div className="flex items-center gap-2 flex-wrap">
      {activeShift && (
        <>
          <div className="hidden xl:flex items-center gap-3 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px]">
            <span className="text-slate-500">كاش الوردية:</span>
            <span className="font-black text-emerald-600">{CeramicMath.formatCurrency(activeShift.totalSalesCash)}</span>
            <span className="text-slate-500">بطاقة:</span>
            <span className="font-black text-sky-600">{CeramicMath.formatCurrency(activeShift.totalSalesCard)}</span>
          </div>
          {canCloseShift && <button onClick={onCloseShift} className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition"><Lock className="w-4 h-4" /> إغلاق الوردية</button>}
          <button onClick={onSwitchUser} className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition"><UserPlus className="w-4 h-4" /> {actingUserName || 'تبديل المستخدم'}</button>
          {actingUserName && (
            <button onClick={onResetActingUser} className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl text-xs font-bold transition">عودة</button>
          )}
          <button onClick={onOpenCustomerDisplay} className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition">عرض العميل</button>
          <button onClick={onToggleTouchMode} className={`flex items-center gap-1.5 px-3 py-2 border rounded-xl text-xs font-bold transition ${touchMode ? 'bg-sky-600 text-white border-sky-500' : 'bg-slate-50 text-slate-700 border-slate-200'}`}>شاشة لمس</button>
        </>
      )}
      {!activeShift && canOpenShift && (
        <button
          onClick={onOpenShift}
          className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-600 border border-emerald-500/30 rounded-xl text-xs font-bold transition"
        >
          <Unlock className="w-4 h-4" /> فتح وردية
        </button>
      )}
      <button
        onClick={onOpenCashboxes}
        className="hidden md:flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition"
      >
        <Wallet className="w-4 h-4" /> الخزينة
      </button>
      <button
        onClick={onOpenHeldOrders}
        className="relative flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition"
      >
        <PauseCircle className="w-4 h-4" /> المعلّقة
        {heldCount > 0 && (
          <span className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black flex items-center justify-center">
            {heldCount}
          </span>
        )}
      </button>
      <button
        onClick={onOpenShortcuts}
        title="اختصارات لوحة المفاتيح (F1)"
        className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition"
      >
        <Keyboard className="w-4 h-4" /> F1
      </button>
    </div>
  </div>
);
