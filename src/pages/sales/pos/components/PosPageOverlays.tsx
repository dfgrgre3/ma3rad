import React from 'react';
import { DocumentPreviewModal } from '../../../../components/documents/DocumentPreviewModal';
import { CeramicCalculatorModal } from '../../../../components/products/CeramicCalculatorModal';
import { formatProductQuantity, getProductUnitLabel } from '../../../../utils/products/productUnits';
import {
  CloseShiftModal, HeldOrdersModal, ManagerOverrideModal, NewCustomerModal, OpenShiftModal, PinLoginModal,
  ShortcutsModal, SuccessInvoiceModal, ToneWarningModal,
} from './PosModals';
import type { PosViewVm } from '../../../../hooks/pages/sales/pos/usePosView';

export const PosPageOverlays: React.FC<{ vm: PosViewVm }> = ({ vm }) => {
  const {
    isDiscountedStocksOpen, setIsDiscountedStocksOpen, discountedStocks, products, addDiscountedToCart,
    successInvoice, printService, openInvoicePreview, setSuccessInvoice, can, handleVoidInvoice,
    isOverrideOpen, handleManagerOverride, setIsOverrideOpen, setPendingVoid,
    isPinLoginOpen, handlePinLogin, setIsPinLoginOpen,
    invoicePreview, setInvoicePreview,
    isHeldModalOpen, heldOrders, resumeHeldOrder, deleteHeldOrder, setIsHeldModalOpen,
    isCustomerModalOpen, newCustName, newCustPhone, newCustType, newCustCredit, customerError,
    setNewCustName, setNewCustPhone, setNewCustType, setNewCustCredit, handleCreateCustomer, setIsCustomerModalOpen,
    isShiftModalOpen, registers, shiftRegisterId, openingBalance, setShiftRegisterId, setOpeningBalance,
    cashierService, handleOpenShift, setIsShiftModalOpen,
    isCloseShiftModalOpen, activeShift, expectedClosingCash, closingCash, closingNotes,
    setClosingCash, setClosingNotes, handleCloseShift, settings, currentUser, printZReport, setIsCloseShiftModalOpen,
    isToneWarningOpen, toneConflicts, setIsToneWarningOpen, setToneConflicts, handleCheckout,
    isShortcutsOpen, setIsShortcutsOpen, isCalculatorOpen, setIsCalculatorOpen, addCalculatedToCart,
  } = vm;

  return (
    <>
      {isDiscountedStocksOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-label="مخزون البيع المخفض">
          <div className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-sm font-black text-slate-900">مخزون البيع المخفض</h2>
                <p className="mt-1 text-xs text-slate-500">كل بند يُخصم من سجل الحجر وتُستخدم تكلفته وسعره المعتمدان.</p>
              </div>
              <button type="button" onClick={() => setIsDiscountedStocksOpen(false)} className="rounded-lg px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">إغلاق</button>
            </div>
            <div className="max-h-[65vh] space-y-2 overflow-auto p-4">
              {discountedStocks.map((source) => {
                const product = products.find((candidate) => candidate.id === source.productId);
                if (!product) return null;
                return (
                  <div key={source.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-purple-100 bg-purple-50/50 p-3">
                    <div className="min-w-0">
                      <div className="text-sm font-black text-slate-900">{source.productName} <span className="font-mono text-xs text-purple-700">({source.specialNumber})</span></div>
                      <div className="mt-1 text-xs text-slate-600">
                        المتاح {formatProductQuantity(Number(source.availableQuantityM2), product)} • السعر {Number(source.discountedUnitPrice).toLocaleString('ar-EG')} ج.م / {getProductUnitLabel(product)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        addDiscountedToCart(product, source);
                        setIsDiscountedStocksOpen(false);
                      }}
                      className="rounded-lg bg-purple-700 px-3 py-2 text-xs font-black text-white hover:bg-purple-800"
                    >
                      أضف للسلة
                    </button>
                  </div>
                );
              })}
              {discountedStocks.length === 0 && <p className="py-8 text-center text-sm text-slate-500">لا توجد كميات مسعّرة للبيع المخفض في هذا المخزن.</p>}
            </div>
          </div>
        </div>
      )}

      {successInvoice && (
        <SuccessInvoiceModal
          invoice={successInvoice}
          onPrintThermal={() => printService.printThermalReceipt(successInvoice)}
          onPreview={() => openInvoicePreview(successInvoice)}
          onClose={() => setSuccessInvoice(null)}
          canVoid={can('sales.void')}
          onVoid={() => handleVoidInvoice(successInvoice)}
        />
      )}

      {isOverrideOpen && (
        <ManagerOverrideModal
          onConfirm={handleManagerOverride}
          onClose={() => { setIsOverrideOpen(false); setPendingVoid(null); }}
        />
      )}

      {isPinLoginOpen && (
        <PinLoginModal
          onConfirm={handlePinLogin}
          onClose={() => setIsPinLoginOpen(false)}
        />
      )}

      {invoicePreview && (
        <DocumentPreviewModal
          title={invoicePreview.title}
          subtitle={invoicePreview.subtitle}
          fileName={invoicePreview.fileName}
          html={invoicePreview.html}
          onClose={() => setInvoicePreview(null)}
          onDownloadExcel={invoicePreview.excel}
          onWhatsApp={invoicePreview.whatsapp}
        />
      )}

      {isHeldModalOpen && (
        <HeldOrdersModal
          orders={heldOrders}
          onResume={resumeHeldOrder}
          onDelete={deleteHeldOrder}
          onClose={() => setIsHeldModalOpen(false)}
        />
      )}

      {isCustomerModalOpen && (
        <NewCustomerModal
          name={newCustName}
          phone={newCustPhone}
          type={newCustType}
          creditLimit={newCustCredit}
          error={customerError}
          onNameChange={setNewCustName}
          onPhoneChange={setNewCustPhone}
          onTypeChange={setNewCustType}
          onCreditLimitChange={setNewCustCredit}
          onSave={handleCreateCustomer}
          onClose={() => setIsCustomerModalOpen(false)}
        />
      )}

      {isShiftModalOpen && (
        <OpenShiftModal
          registers={registers}
          registerId={shiftRegisterId}
          openingBalance={openingBalance}
          onRegisterChange={(registerId) => {
            setShiftRegisterId(registerId);
            setOpeningBalance(cashierService.getSuggestedOpeningBalance(registerId));
          }}
          onOpeningBalanceChange={setOpeningBalance}
          onConfirm={handleOpenShift}
          onClose={() => setIsShiftModalOpen(false)}
        />
      )}

      {isCloseShiftModalOpen && activeShift && (
        <CloseShiftModal
          shift={activeShift}
          expectedClosingCash={expectedClosingCash}
          actualClosingCash={closingCash}
          notes={closingNotes}
          onActualClosingCashChange={(value) => setClosingCash(Math.max(0, Number(value) || 0))}
          onNotesChange={setClosingNotes}
          onConfirm={handleCloseShift}
          hideExpected={settings?.blindCloseShift === true && currentUser?.role !== 'ADMIN'}
          onPrintZReport={printZReport}
          onClose={() => {
            setIsCloseShiftModalOpen(false);
            setClosingCash(expectedClosingCash);
          }}
        />
      )}

      {isToneWarningOpen && toneConflicts.length > 0 && (
        <ToneWarningModal
          conflicts={toneConflicts}
          onCancel={() => {
            setIsToneWarningOpen(false);
            setToneConflicts([]);
          }}
          onContinue={() => {
            setIsToneWarningOpen(false);
            setToneConflicts([]);
            handleCheckout(true);
          }}
        />
      )}

      {isShortcutsOpen && <ShortcutsModal onClose={() => setIsShortcutsOpen(false)} />}

      <CeramicCalculatorModal
        isOpen={isCalculatorOpen}
        onClose={() => setIsCalculatorOpen(false)}
        products={products}
        onAddToCart={addCalculatedToCart}
      />
    </>
  );
};
