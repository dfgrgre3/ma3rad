import React from 'react';
import { AlertCircle, CheckCircle, Loader2, X } from 'lucide-react';
import { useCashier } from './cashier/useCashier';
import { CashierHeader } from './cashier/CashierHeader';
import { CashStatusCards } from './cashier/CashStatusCards';
import { AutoCloseScheduleCard } from './cashier/AutoCloseScheduleCard';
import { ExpensesTable } from './cashier/ExpensesTable';
import { OpenShiftModal } from './cashier/OpenShiftModal';
import { CloseShiftModal } from './cashier/CloseShiftModal';
import { AddExpenseModal } from './cashier/AddExpenseModal';
import { PermissionService } from '../../services/PermissionService';

export const CashierPage: React.FC = () => {
  const {
    currentUser,
    registers,
    activeShift,
    lastClosedShift,
    shiftRegisterId,
    autoCloseEnabled,
    setAutoCloseEnabled,
    autoCloseTime,
    setAutoCloseTime,
    expenses,
    categories,
    isLoading,
    isOpenShiftModal,
    setIsOpenShiftModal,
    isCloseShiftModal,
    setIsCloseShiftModal,
    isExpenseModalOpen,
    setIsExpenseModalOpen,
    notification,
    setNotification,
    expectedEndingCash,
    loadData,
    openShift,
    closeShift,
    addExpense,
    saveSchedule,
    suggestedOpeningBalance,
  } = useCashier();

  const defaultReg = registers.find((r) => r.isDefault) || registers[0];
  const canManageShifts = PermissionService.can(currentUser, 'cashier.manage');

  if (isLoading && registers.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin ml-2" />
        جاري تحميل بيانات الخزينة...
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full relative" dir="rtl">
      {notification && (
        <div className={`fixed top-6 left-6 z-[60] px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top-2 fade-in duration-300 ${
          notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {notification.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <span className="font-bold text-sm">{notification.message}</span>
          <button onClick={() => setNotification(null)} className="opacity-70 hover:opacity-100"><X className="w-4 h-4" /></button>
        </div>
      )}

      <CashierHeader
        currentUser={currentUser}
        activeShift={activeShift}
        isLoading={isLoading}
        onOpenShiftModal={() => setIsOpenShiftModal(true)}
        onCloseShiftModal={() => setIsCloseShiftModal(true)}
        onOpenExpenseModal={() => setIsExpenseModalOpen(true)}
        onRefresh={loadData}
      />

      <AutoCloseScheduleCard
        lastClosedShift={lastClosedShift}
        autoCloseEnabled={autoCloseEnabled}
        onAutoCloseEnabledChange={setAutoCloseEnabled}
        autoCloseTime={autoCloseTime}
        onAutoCloseTimeChange={setAutoCloseTime}
        canManageShifts={canManageShifts}
        onSaveSchedule={saveSchedule}
      />

      <CashStatusCards defaultRegister={defaultReg} activeShift={activeShift} expenses={expenses} />

      <ExpensesTable expenses={expenses} />

      <OpenShiftModal
        isOpen={isOpenShiftModal}
        registers={registers}
        defaultRegisterId={shiftRegisterId}
        defaultOpeningBalance={suggestedOpeningBalance(shiftRegisterId || defaultReg?.id || '')}
        onClose={() => setIsOpenShiftModal(false)}
        onSubmit={openShift}
        getSuggestedBalance={suggestedOpeningBalance}
      />

      <CloseShiftModal
        isOpen={isCloseShiftModal}
        activeShift={activeShift}
        expectedEndingCash={expectedEndingCash}
        onClose={() => setIsCloseShiftModal(false)}
        onSubmit={closeShift}
      />

      <AddExpenseModal
        isOpen={isExpenseModalOpen}
        categories={categories}
        onClose={() => setIsExpenseModalOpen(false)}
        onSubmit={addExpense}
      />
    </div>
  );
};

export default CashierPage;
