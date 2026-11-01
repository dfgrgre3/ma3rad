import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { CashShift } from '../../types';
import type { CashierService } from '../../services/CashierService';
import { CeramicMath } from '../../utils/ceramicMath';
import type { Toast } from './types';

interface UsePosShiftActionsOptions {
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

export const usePosShiftActions = ({
  can,
  notify,
  cashierService,
  registerId,
  openingBalance,
  setOpeningBalance,
  currentUserId,
  effectiveUserId,
  activeShift,
  expectedClosingCash,
  setActiveShift,
  closingCash,
  setClosingCash,
  closingNotes,
  setClosingNotes,
  setIsOpenShiftModalOpen,
  setIsCloseShiftModalOpen,
}: UsePosShiftActionsOptions) => {
  const handleOpenShift = () => {
    if (!can('cashier.shift.open')) {
      notify('غير مصرح لك بفتح وردية كاشير', 'error');
      return;
    }
    try {
      const shift = cashierService.openShift(
        registerId,
        currentUserId || 'usr_admin',
        openingBalance || 0
      );
      setActiveShift(shift);
      setIsOpenShiftModalOpen(false);
      setOpeningBalance(0);
      notify(`تم فتح الوردية ${shift.shiftNumber}`, 'success');
    } catch (error: any) {
      notify(error.message || 'تعذر فتح الوردية', 'error');
    }
  };

  const handleCloseShift = () => {
    if (!activeShift) return;
    if (!can('cashier.shift.close')) {
      notify('غير مصرح لك بإغلاق وردية الكاشير', 'error');
      return;
    }
    try {
      cashierService.closeShift(
        activeShift.id,
        Math.max(0, closingCash),
        closingNotes,
        effectiveUserId || currentUserId || 'usr_admin'
      );
      setActiveShift(null);
      setIsCloseShiftModalOpen(false);
      setClosingCash(0);
      setClosingNotes('');
      notify('تم إغلاق الوردية وحفظ فرق الصندوق', 'success');
    } catch (error: any) {
      notify(error.message || 'تعذر إغلاق الوردية', 'error');
    }
  };

  const printZReport = useCallback(() => {
    if (!activeShift) return;
    const reportWindow = window.open('', '_blank', 'width=420,height=720');
    if (!reportWindow) {
      notify('يرجى السماح بالنوافذ المنبثقة', 'error');
      return;
    }
    const html = `
      <!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>Z-Report ${activeShift.shiftNumber}</title>
      <style>body{font-family:Tahoma,sans-serif;width:76mm;margin:0 auto;padding:6px;font-size:12px;} .c{text-align:center;} .b{font-weight:800;} .row{display:flex;justify-content:space-between;} .div{border-top:1px dashed #000;margin:6px 0;}</style></head><body>
      <div class="c b">${activeShift.shiftNumber ? 'تقرير Z - إقفال الوردية' : ''}</div>
      <div class="div"></div>
      <div class="row"><span>رقم الوردية</span><span>${activeShift.shiftNumber}</span></div>
      <div class="row"><span>الافتتاحي</span><span>${CeramicMath.formatCurrency(activeShift.openingBalance)}</span></div>
      <div class="row"><span>مبيعات نقدية</span><span>${CeramicMath.formatCurrency(activeShift.totalSalesCash)}</span></div>
      <div class="row"><span>تحصيلات العملاء</span><span>${CeramicMath.formatCurrency(activeShift.totalCustomerPayments)}</span></div>
      <div class="row"><span>مصروفات/مرتجعات</span><span>${CeramicMath.formatCurrency((activeShift.totalExpenses || 0) + (activeShift.totalRefunds || 0))}</span></div>
      <div class="row b"><span>النقد المتوقع</span><span>${CeramicMath.formatCurrency(expectedClosingCash)}</span></div>
      <div class="row"><span>النقد الفعلي</span><span>${CeramicMath.formatCurrency(closingCash)}</span></div>
      <div class="row"><span>الفرق</span><span>${CeramicMath.formatCurrency(closingCash - expectedClosingCash)}</span></div>
      <div class="div"></div>
      <div class="c" style="font-size:10px;">${new Date().toLocaleString('ar')}</div>
      <script>window.onload=function(){window.print();setTimeout(function(){window.close();},500);}</script>
      </body></html>`;
    reportWindow.document.write(html);
    reportWindow.document.close();
  }, [activeShift, expectedClosingCash, closingCash, notify]);

  return { handleOpenShift, handleCloseShift, printZReport };
};
