import React from 'react';
import { ShoppingCart, X } from 'lucide-react';
import { CeramicMath } from '../../../utils/products/ceramicMath';
import { PosToast } from './components/PosModals';
import { usePosView } from '../../../hooks/pages/sales/pos/usePosView';
import { PosToolbar } from './components/PosToolbar';
import { PosCatalogFilters } from './components/PosCatalogFilters';
import { PosProductGrid } from './components/PosProductGrid';
import { PosCartPanel } from './components/PosCartPanel';
import { PosCheckoutPanel } from './components/PosCheckoutPanel';
import { PosPageOverlays } from './components/PosPageOverlays';
import { usePosActivityCopy } from '../../../hooks/pages/sales/pos/usePosActivityCopy';

export const PosView: React.FC = () => {
  const vm = usePosView();
  const posCopy = usePosActivityCopy();
  const {
    navigate, currentUser, actingUser, setActingUser,
    productsTotal, gradeOptions,
    customers, customersTotal, warehouses, registers, activeShift, setActiveShift, settings,
    discountedStocks, setIsDiscountedStocksOpen,
    selectedWarehouseId, setSelectedWarehouseId, selectedCustomer, setSelectedCustomer,
    salesRepId, setSalesRepId, salesReps,
    discountAmount, setDiscountAmount, discountMode, setDiscountMode, discountPercent,
    shippingCost, setShippingCost, extraFees, setExtraFees, taxPercentage, setTaxPercentage,
    paidAmount, setPaidAmount, paymentType, setPaymentType,
    splitCash, setSplitCash, splitCard, setSplitCard, splitBank, setSplitBank,
    paymentBankAccountId, setPaymentBankAccountId, paymentBankAccounts,
    splitCheque, setSplitCheque, splitCredit, setSplitCredit,
    activeCartIndex, setActiveCartIndex, productViewMode, setProductViewMode,
    couponCode, setCouponCode, appliedPromotion, promotionDiscount, redeemPoints, setRedeemPoints,
    loyaltyDiscount, setLoyaltyDiscount, notes, setNotes,
    setIsCalculatorOpen, setIsCustomerModalOpen, setCustomerError,
    setIsHeldModalOpen, setIsShortcutsOpen,
    setIsShiftModalOpen, setIsCloseShiftModalOpen,
    shiftRegisterId, setShiftRegisterId, setOpeningBalance,
    barcodeInputRef, paidInputRef,
    cashierService, customerService, loyaltyService,
    notify, can, stockOf,
    searchQuery, setSearchQuery, selectedCategory, setSelectedCategory,
    selectedBrand, setSelectedBrand, selectedGrade, setSelectedGrade,
    selectedSize, setSelectedSize, selectedColor, setSelectedColor,
    customerSearch, setCustomerSearch, inStockOnly, setInStockOnly,
    sortMode, setSortMode,
    filteredProducts, visibleCategories, visibleBrands, hasCeramicCatalog,
    visibleSizes, visibleColors, filteredCustomers, hasActiveFilters, clearFilters,
    cart, applyCustomerPricing, addToCart,
    updateCartQuantity, stepCartQuantity, updateCartUnit, updateCartPrice,
    updateCartLineDiscount, removeFromCart, recentlyRemoved, undoRemoveFromCart,
    handleSearchSubmit, loadStock,
    loadMoreProducts, loadMoreCustomers,
    lineSubtotal, lineDiscountTotal, taxAmount, totalAmount,
    remainingAmount, changeDue, cartQuantitySummary,
    visiblePaymentTypes, handleDiscountPercentChange,
    isProcessing, handleCheckout,
    openCustomerDisplay, clearCart,
    setIsPinLoginOpen, touchMode, setTouchMode,
    isMobileCheckoutOpen, setIsMobileCheckoutOpen,
    mobileCheckoutTriggerRef, mobileCheckoutCloseRef, mobileCheckoutPanelRef,
    gradeLabel,
    heldOrders, holdCurrentOrder,
    toast,
  } = vm;

  return (
    <div className={`relative flex h-full min-h-0 overflow-hidden bg-surface-muted text-ink max-[900px]:flex-col ${touchMode ? 'pos-touch-mode' : ''}`}>
      {/* ═══ Left: Catalog ═══ */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden border-l border-line min-w-0">
        <PosToolbar
          activeShift={activeShift}
          actingUserName={actingUser?.fullName}
          canCloseShift={can('cashier.shift.close')}
          canOpenShift={can('cashier.shift.open')}
          touchMode={touchMode}
          heldCount={heldOrders.length}
          onCloseShift={() => setIsCloseShiftModalOpen(true)}
          onSwitchUser={() => setIsPinLoginOpen(true)}
          onResetActingUser={() => { setActingUser(null); notify('تم العودة للمستخدم الأصلي', 'info'); }}
          onOpenCustomerDisplay={openCustomerDisplay}
          onToggleTouchMode={() => setTouchMode((v) => !v)}
          onOpenShift={() => {
            setOpeningBalance(cashierService.getSuggestedOpeningBalance(shiftRegisterId));
            setIsShiftModalOpen(true);
          }}
          onOpenCashboxes={() => navigate('/cashboxes')}
          onOpenHeldOrders={() => setIsHeldModalOpen(true)}
          onOpenShortcuts={() => setIsShortcutsOpen(true)}
        />

        <PosCatalogFilters
          barcodeInputRef={barcodeInputRef}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          onSearchSubmit={handleSearchSubmit}
          searchSuggestions={filteredProducts}
          onSelectSuggestion={(product) => {
            addToCart(product);
            setSearchQuery('');
            barcodeInputRef.current?.focus();
          }}
          stockOf={stockOf}
          warehouses={warehouses}
          selectedWarehouseId={selectedWarehouseId}
          onWarehouseChange={(warehouseId) => {
            const warehouse = warehouses.find((item) => item.id === warehouseId);
            setSelectedWarehouseId(warehouseId);
            loadStock(warehouseId);
            setActiveShift(cashierService.getActiveShift(currentUser?.id, warehouse?.branchId));
            const branchRegister = registers.find((register) => register.branchId === warehouse?.branchId && register.isDefault)
              || registers.find((register) => register.branchId === warehouse?.branchId);
            if (branchRegister) setShiftRegisterId(branchRegister.id);
          }}
          sortMode={sortMode}
          onSortModeChange={setSortMode}
          inStockOnly={inStockOnly}
          onToggleInStockOnly={() => setInStockOnly((v) => !v)}
          visibleBrands={visibleBrands}
          selectedBrand={selectedBrand}
          onBrandChange={setSelectedBrand}
          hasCeramicCatalog={hasCeramicCatalog}
          selectedGrade={selectedGrade}
          gradeOptions={gradeOptions}
          onGradeChange={setSelectedGrade}
          visibleSizes={visibleSizes}
          selectedSize={selectedSize}
          onSizeChange={setSelectedSize}
          visibleColors={visibleColors}
          selectedColor={selectedColor}
          onColorChange={setSelectedColor}
          onOpenCalculator={() => setIsCalculatorOpen(true)}
          productsCount={productsTotal}
          visibleCategories={visibleCategories}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          resultCount={filteredProducts.length}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={clearFilters}
        />

        <div className="flex items-center justify-between border-b border-line bg-accent-soft/70 px-4 py-2">
          <div className="text-xs font-bold text-primary">مخزون الفرز الثاني والبواقي له سعر وتكلفة منفصلان</div>
          <button
            type="button"
            onClick={() => setIsDiscountedStocksOpen(true)}
            disabled={!selectedWarehouseId || discountedStocks.length === 0}
            className="rounded-lg border border-accent-border bg-surface px-3 py-1.5 text-xs font-black text-primary hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
          >
            البيع المخفض ({discountedStocks.length})
          </button>
        </div>

        <PosProductGrid
          products={filteredProducts}
          productsTotal={productsTotal}
          onLoadMore={loadMoreProducts}
          cart={cart}
          stockOf={stockOf}
          gradeLabel={gradeLabel}
          allowNegativeStock={settings?.enableNegativeStock ?? false}
          onAddToCart={addToCart}
          onAddMultipleToCart={(prods) => {
            prods.forEach((prod) => addToCart(prod));
            notify(`تمت إضافة ${prods.length} أصناف إلى السلة بنجاح`, 'success');
          }}
          multiSelectEnabled={!!settings?.posMultiSelectSearch}
          viewMode={productViewMode}
          onViewModeChange={setProductViewMode}
        />
      </div>

      {/* ═══ Right: Cart & Checkout ═══ */}
      {isMobileCheckoutOpen && (
        <button
          type="button"
          aria-label="إغلاق السلة وإتمام البيع"
          onClick={() => setIsMobileCheckoutOpen(false)}
          className="fixed inset-0 z-30 bg-primary/45 min-[901px]:hidden"
        />
      )}
      <div
        ref={mobileCheckoutPanelRef}
        id="pos-mobile-order-panel"
        role={isMobileCheckoutOpen ? 'dialog' : undefined}
        aria-modal={isMobileCheckoutOpen ? 'true' : undefined}
        aria-label="السلة وإتمام البيع"
        className={`hidden h-full min-h-0 w-[26rem] max-w-[90vw] shrink-0 flex-col border-r border-line bg-surface shadow-2xl min-[901px]:flex max-[900px]:fixed max-[900px]:inset-x-0 max-[900px]:bottom-0 max-[900px]:z-40 max-[900px]:h-[94dvh] max-[900px]:max-h-[94dvh] max-[900px]:w-full max-[900px]:max-w-none max-[900px]:rounded-t-2xl max-[900px]:border-r-0 max-[900px]:border-t ${isMobileCheckoutOpen ? 'max-[900px]:flex' : ''}`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line px-3 py-2 min-[901px]:hidden">
          <div className="min-w-0">
            <p className="text-sm font-black text-ink ">{posCopy.cartTitle} وإتمام البيع</p>
            <p className="text-xs text-ink-secondary ">{cart.length} أصناف · {CeramicMath.formatCurrency(totalAmount)} ج.م</p>
          </div>
          <button
            ref={mobileCheckoutCloseRef}
            type="button"
            onClick={() => setIsMobileCheckoutOpen(false)}
            aria-label="إغلاق السلة"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line text-ink-secondary transition hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:hover:bg-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <PosCartPanel
          selectedCustomer={selectedCustomer}
          hasMoreCustomers={customers.length < customersTotal}
          onLoadMoreCustomers={loadMoreCustomers}
          customerSearch={customerSearch}
          filteredCustomers={filteredCustomers}
          canCreateCustomer={can('customers.create')}
          canSearchTaxNumber={can('customers.update')}
          canViewCustomerFinancials={can('customers.payment')}
          onCustomerSearchChange={(value) => {
            setCustomerSearch(value);
            setSelectedCustomer(null);
            setRedeemPoints(0);
            setLoyaltyDiscount(0);
          } }
          onSelectCustomer={(customer) => {
            setSelectedCustomer(customer);
            applyCustomerPricing(customer);
            setCustomerSearch('');
            setRedeemPoints(0);
            setLoyaltyDiscount(0);
          } }
          onCreateNewCustomer={() => { setCustomerError(''); setIsCustomerModalOpen(true); } }
          cart={cart}
          cartQuantitySummary={cartQuantitySummary}
          enableNegativeStock={settings?.enableNegativeStock ?? false}
          gradeLabel={gradeLabel}
          onRemove={removeFromCart}
          recentlyRemoved={recentlyRemoved}
          onUndoRemove={undoRemoveFromCart}
          onUpdateUnit={updateCartUnit}
          onStepQuantity={stepCartQuantity}
          onUpdateQuantity={updateCartQuantity}
          onUpdatePrice={updateCartPrice}
          onUpdateLineDiscount={updateCartLineDiscount}
          sellingPriceTiersCount={settings?.sellingPriceTiersCount ?? 1}
          sellingPriceTierNames={settings?.sellingPriceTierNames}
          customerService={customerService}
          activeCartIndex={activeCartIndex}
          onSelectCartLine={setActiveCartIndex}
        />

        <PosCheckoutPanel
          cartLength={cart.length}
          cartQuantitySummary={cartQuantitySummary}
          lineSubtotal={lineSubtotal}
          lineDiscountTotal={lineDiscountTotal}
          discountAmount={discountAmount}
          setDiscountAmount={setDiscountAmount}
          discountMode={discountMode}
          onDiscountModeChange={setDiscountMode}
          discountPercent={discountPercent}
          onDiscountPercentChange={handleDiscountPercentChange}
          promotionDiscount={promotionDiscount}
          loyaltyDiscount={loyaltyDiscount}
          extraFees={extraFees}
          setExtraFees={setExtraFees}
          taxPercentage={taxPercentage}
          setTaxPercentage={setTaxPercentage}
          taxAmount={taxAmount}
          shippingCost={shippingCost}
          setShippingCost={setShippingCost}
          paymentType={paymentType}
          setPaymentType={setPaymentType}
          bankAccounts={paymentBankAccounts}
          bankAccountId={paymentBankAccountId}
          setBankAccountId={setPaymentBankAccountId}
          visiblePaymentTypes={visiblePaymentTypes}
          showCouponCode={settings?.posShowCouponCode !== false}
          showLoyaltyPoints={settings?.posShowLoyaltyPoints !== false}
          splitCash={splitCash}
          setSplitCash={setSplitCash}
          splitCard={splitCard}
          setSplitCard={setSplitCard}
          splitBank={splitBank}
          setSplitBank={setSplitBank}
          splitCheque={splitCheque}
          setSplitCheque={setSplitCheque}
          splitCredit={splitCredit}
          setSplitCredit={setSplitCredit}
          couponCode={couponCode}
          setCouponCode={setCouponCode}
          appliedPromotion={appliedPromotion}
          selectedCustomer={selectedCustomer}
          canRedeemPoints={can('loyalty.redeem')}
          redeemPoints={redeemPoints}
          setRedeemPoints={setRedeemPoints}
          onRedeemPoints={() => {
            if (!selectedCustomer) {
              notify('اختر العميل قبل تطبيق نقاط الولاء', 'warning');
              return;
            }
            if (!Number.isInteger(redeemPoints) || redeemPoints < 0) {
              notify('أدخل عددًا صحيحًا موجبًا من النقاط، أو صفرًا لإلغاء الخصم', 'error');
              return;
            }
            if (!can('loyalty.redeem')) {
              notify('لا تملك صلاحية استبدال نقاط الولاء', 'error');
              return;
            }
            try {
              if (redeemPoints === 0) {
                setLoyaltyDiscount(0);
                notify('تم إلغاء خصم نقاط الولاء', 'info');
                return;
              }
              const availablePoints = loyaltyService.getRedeemablePointBalance(selectedCustomer.id);
              if (redeemPoints > availablePoints) {
                notify(`رصيد الولاء غير كافٍ: المتاح ${availablePoints} نقطة`, 'error');
                return;
              }
              setLoyaltyDiscount(redeemPoints);
              notify(`تم تطبيق خصم ${redeemPoints} ج.م من النقاط؛ ستُخصم النقاط عند حفظ الفاتورة`, 'success');
            } catch (e: any) { notify(e?.message || 'تعذر التحقق من رصيد نقاط الولاء', 'error'); }
          }}
          paidAmount={paidAmount}
          setPaidAmount={setPaidAmount}
          paidInputRef={paidInputRef}
          totalAmount={totalAmount}
          remainingAmount={remainingAmount}
          changeDue={changeDue}
          notes={notes}
          setNotes={setNotes}
          hasCeramicCatalog={hasCeramicCatalog}
          isProcessing={isProcessing}
          onHoldOrder={holdCurrentOrder}
          onClearOrder={clearCart}
          onOpenCalculator={() => setIsCalculatorOpen(true)}
          onCheckout={() => handleCheckout()}
          salesReps={salesReps}
          salesRepId={salesRepId}
          onSalesRepChange={setSalesRepId}
        />
      </div>

      <div className="absolute inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 px-3 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-[0_-8px_18px_rgba(15,23,42,0.10)] backdrop-blur min-[901px]:hidden dark:bg-primary/95">
        <button
          ref={mobileCheckoutTriggerRef}
          type="button"
          aria-controls="pos-mobile-order-panel"
          aria-expanded={isMobileCheckoutOpen}
          onClick={() => setIsMobileCheckoutOpen(true)}
          className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl bg-primary px-3 py-2 text-white transition hover:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <span className="flex min-w-0 items-center gap-2 text-right">
            <ShoppingCart className="h-5 w-5 shrink-0" />
            <span className="truncate text-sm font-bold">{cart.length === 0 ? 'ابدأ البيع' : `السلة · ${cart.length} أصناف`}</span>
          </span>
          <span className="shrink-0 text-left text-sm font-black tabular-nums">{CeramicMath.formatCurrency(totalAmount)} ج.م</span>
        </button>
      </div>

      <PosToast toast={toast} />

      <PosPageOverlays vm={vm} />
    </div>
  );
};

export default PosView;
