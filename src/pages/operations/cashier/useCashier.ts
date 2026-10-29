import { useState, useEffect, useMemo, useCallback, useContext } from 'react';
import { CashierService } from '../../../services/CashierService';
import { CashRegister, CashShift, Expense, ExpenseCategory, PaymentType } from '../../../types';
import { CeramicMath } from '../../../utils/ceramicMath';
import { LayoutContext } from '../../../layouts/MainLayout';

const cashierService = new CashierService();

export function useCashier() {
  const { currentUser } = useContext(LayoutContext);
  const [registers, setRegisters] = useState<CashRegister[]>([]);
  const [activeShift, setActiveShift] = useState<CashShift | null>(null);
  const [lastClosedShift, setLastClosedShift] = useState<CashShift | null>(null);
  const [shiftRegisterId, setShiftRegisterId] = useState('');
  const [autoCloseEnabled, setAutoCloseEnabled] = useState(true);
  const [autoCloseTime, setAutoCloseTime] = useState('23:59');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpenShiftModal, setIsOpenShiftModal] = useState(false);
  const [isCloseShiftModal, setIsCloseShiftModal] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showNotification = useCallback((type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  }, []);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const regs = cashierService.getAllRegisters();
      const shift = cashierService.getActiveShift(currentUser?.id);
      const exps = cashierService.getAllExpenses();
      const cats = cashierService.getExpenseCategories();
      const defaultRegister = regs.find((register) => register.isDefault) || regs[0];
      const schedule = cashierService.getShiftAutoCloseSchedule();

      setRegisters(regs);
      setActiveShift(shift);
      if (defaultRegister) {
        setShiftRegisterId((selected) => (regs.some((r) => r.id === selected) ? selected : defaultRegister.id));
        setLastClosedShift(cashierService.getLastClosedShift(shift?.registerId || defaultRegister.id));
      }
      setAutoCloseEnabled(schedule.enabled);
      setAutoCloseTime(schedule.closeTime);
      setExpenses(exps);
      setCategories(cats);
    } catch (e: any) {
      showNotification('error', `فشل تحميل البيانات: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [showNotification, currentUser?.id]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const onAutoClosed = (event: Event) => {
      const detail = (event as CustomEvent<CashShift[]>).detail || [];
      void loadData().then(() => {
        if (detail.length) {
          const total = detail.reduce(
            (sum, shift) => sum + Number(shift.actualEndingCash ?? shift.expectedEndingCash ?? 0),
            0
          );
          showNotification('success', `أُغلقت ${detail.length} وردية تلقائيًا. إجمالي الرصيد المُرحّل: ${CeramicMath.formatCurrency(total)}`);
        }
      });
    };
    window.addEventListener('cash-shift-auto-closed', onAutoClosed);
    return () => window.removeEventListener('cash-shift-auto-closed', onAutoClosed);
  }, [loadData, showNotification]);

  const expectedEndingCash = useMemo(() => {
    if (!activeShift) return 0;
    return Number((
      activeShift.openingBalance +
      activeShift.totalSalesCash +
      activeShift.totalCustomerPayments -
      activeShift.totalSupplierPayments -
      activeShift.totalExpenses -
      activeShift.totalRefunds
    ).toFixed(2));
  }, [activeShift]);

  const openShift = async (registerId: string, openingBalance: number) => {
    if (!currentUser) throw new Error('يجب تسجيل الدخول قبل فتح الوردية.');
    cashierService.openShift(registerId, currentUser.id, openingBalance);
    setIsOpenShiftModal(false);
    await loadData();
    showNotification('success', 'تم فتح الوردية بنجاح.');
  };

  const closeShift = async (closingNotes: string) => {
    if (!activeShift) return;
    cashierService.closeShift(activeShift.id, expectedEndingCash, closingNotes, currentUser?.id || activeShift.userId);
    setIsCloseShiftModal(false);
    await loadData();
    showNotification('success', `تم إغلاق الوردية. الرصيد المُرحّل: ${CeramicMath.formatCurrency(expectedEndingCash)}.`);
  };

  const addExpense = async (cat: string, amount: number, desc: string, recipient: string, paymentType: PaymentType) => {
    if (!activeShift) throw new Error('لا يمكن صرف مصروفات بدون فتح وردية نشطة.');
    cashierService.addExpense(cat, amount, desc, activeShift.registerId, activeShift.id, paymentType, recipient, currentUser?.id || activeShift.userId);
    setIsExpenseModalOpen(false);
    await loadData();
    showNotification('success', 'تم تسجيل سند الصرف وخصمه من الخزينة.');
  };

  return {
    currentUser, registers, activeShift, lastClosedShift, shiftRegisterId, setShiftRegisterId,
    autoCloseEnabled, setAutoCloseEnabled, autoCloseTime, setAutoCloseTime,
    expenses, categories, isLoading, isOpenShiftModal, setIsOpenShiftModal,
    isCloseShiftModal, setIsCloseShiftModal, isExpenseModalOpen, setIsExpenseModalOpen,
    notification, setNotification, expectedEndingCash, loadData, openShift, closeShift, addExpense,
    saveSchedule: () => {
      cashierService.saveShiftAutoCloseSchedule(autoCloseEnabled, autoCloseTime);
      showNotification('success', `تم حفظ جدول إغلاق الورديات عند ${autoCloseTime}.`);
    },
    suggestedOpeningBalance: (regId: string) => cashierService.getSuggestedOpeningBalance(regId),
  };
}
