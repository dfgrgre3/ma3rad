# توثيق خدمات المبيعات والمصادقة

يغطي هذا الملف جميع ملفات TypeScript تحت `src/services/domains/sales/` و`src/services/domains/auth/`. تم تنظيم المبيعات حسب ملفات الجذر والمجلدات الفرعية، والمصادقة بنفس الأسلوب. لم يتم العثور على ملفات `*.test.ts` أو `*.spec.ts` ضمن النطاقين، لذلك لا توجد مدخلات اختبار.

## المبيعات

**ملفات جذر `src/services/domains/sales/`:**

### `src/services/domains/sales/context.ts`
**الغرض:** يعرّف سياق مشترك تستخدمه دوال إنشاء الفواتير والاستعلامات والمرتجعات.
**الأعضاء الرئيسية:**
- `InvoiceWithItems` — نوع فاتورة مبيعات مرفق بعناصرها.
- `InvoiceLookup` — دالة بحث عن فاتورة بعناصرها بالمعرّف.
- `SalesContext` — كائن يجمع `DatabaseManager` و`BranchAccessService` ودالة جلب الفاتورة.
**ملاحظات:** يمرّر `SalesService` هذا السياق إلى وحدات `invoiceCreation` و`invoiceQueries` و`payments` و`returns` و`invoiceVoid` بدل تمرير الاعتماديات منفصلة.

### `src/services/domains/sales/discountPolicy.ts`
**الغرض:** يقيّم سياسة الخصم اليدوي ويقرر متى يتطلب الخصم موافقة.
**الأعضاء الرئيسية:**
- `ManualDiscountPolicyInput` — مدخلات تقييم الخصم والعتبات والإعدادات.
- `ManualDiscountPolicyResult` — نتيجة التقييم مع نسبة الخصم وهل يلزم اعتماد.
- `evaluateManualDiscountPolicy` — تحسب نسبة الخصم من الإجمالي قبل الخصم وتقرر اشتراط موافقة عند تجاوز الحد.
**ملاحظات:** يستخدمها مسار إنشاء الفاتورة عبر `invoiceCreation/approvals.ts` لضمان اتساق قاعدة الخصم في الواجهة والخدمة.

### `src/services/domains/sales/ElectronicInvoiceService.ts`
**الغرض:** يدير الفواتير الإلكترونية وحالات إرسالها ومزامنتها وإلغائها عبر مزود ETA مع عزل التكامل الخارجي.
**الأعضاء الرئيسية:**
- `ElectronicInvoiceProvider` — واجهة المزود للعمليات `submit` و`getStatus` و`cancel`.
- `EtaInvoiceDocumentBuilder` — واجهة لبناء مستند ETA القانوني.
- `EtaElectronicInvoiceProvider` — تنفيذ نقل ETA v1 مع مصادقة `client_credentials` وتوقيع المستند عبر حقن.
- `EtaElectronicInvoiceProvider.token` — يجلب رمز الوصول من `/connect/token`.
- `EtaElectronicInvoiceProvider.request` — ينفذ طلبات ETA المصرّح بها ويعالج الأخطاء.
- `EtaElectronicInvoiceProvider.submit` — يرسل المستند الموقع إلى `/documentsubmissions/`.
- `EtaElectronicInvoiceProvider.getStatus` — يقرأ حالة التقديم أو المستند ويحوّلها إلى حالة موحدة.
- `EtaElectronicInvoiceProvider.cancel` — يطلب إلغاء مستند بحالة `cancelled` وسبب.
- `ElectronicInvoiceService` — خدمة قاعدة البيانات والصلاحيات لدورة الفواتير الإلكترونية.
- `ElectronicInvoiceService.getIntegrationReadiness` — يقيّم جاهزية التكامل والإعدادات.
- `ElectronicInvoiceService.getAllElectronicInvoices` / `getElectronicInvoiceById` / `getElectronicInvoiceBySalesInvoice` — استعلامات قراءة محصورة بالفرع/الشركة.
- `ElectronicInvoiceService.createElectronicInvoice` — ينشئ سجل فاتورة إلكترونية مرتبطاً بفاتورة مبيعات.
- `ElectronicInvoiceService.submitElectronicInvoice` / `acceptElectronicInvoice` / `syncElectronicInvoice` / `reconcileFromProvider` / `reconcileState` — إدارة الإرسال والقبول والمزامنة والتسوية.
- `ElectronicInvoiceService.rejectElectronicInvoice` / `cancelElectronicInvoice` / `reconcileCancellation` — معالجة الرفض والإلغاء والتسوية اللاحقة.
- `ElectronicInvoiceService.getStats` — إحصاءات الفواتير الإلكترونية.
**ملاحظات:** يعتمد على `AuthService` و`PermissionService` و`BranchAccessService`، ويستخدم `unscaleMoneyRow` لتحويل القيم المالية من الوحدات الصغرى، ويترك توقيع المستند وبناء ETA للمزوّد المحقون لتجنب ربط الخدمة ببنية ETA الكاملة.

### `src/services/domains/sales/HeldOrderService.ts`
**الغرض:** يحفظ الطلبات المعلقة/الممسوكة ويسترجعها ويحذفها.
**الأعضاء الرئيسية:**
- `HeldOrderRecord` — سجل طلب ممسوك مع البيانات والوقت ومنشئه.
- `HeldOrderService.getAll` — يعيد الطلبات الممسوكة للمستخدم الحالي.
- `HeldOrderService.save` — يخزّن أو يحدّث طلباً ممسوكاً.
- `HeldOrderService.delete` — يحذف طلباً ممسوكاً.
**ملاحظات:** خدمة مستقلة عن دورة `OrderService`؛ تخزن الحمولة التسويقية/النقاطية مؤقتاً ولا تؤثر مباشرة على المخزون أو القيود قبل تحويلها إلى طلب أو فاتورة.

### `src/services/domains/sales/HistoricalReturnReconciliationService.ts`
**الغرض:** يكتشف المرتجعات التاريخية التي تحتاج تسوية مالية ويعتمد التصحيحات مع مراجعة القيود.
**الأعضاء الرئيسية:**
- `HistoricalReturnCandidate` — مرشح مرتجع تاريخي مع مبالغ الفاتورة والمرتجع والعميل والقيود.
- `HistoricalReturnApproval` — بيانات اعتماد التسوية للمبالغ النقدية والرصيد والضريبة والملاحظات.
- `HistoricalReturnReconciliationService.listPending` — يسرد المرتجعات المعلقة بعد صلاحية `returns.approve`.
- `HistoricalReturnReconciliationService.recordReportReview` — يسجل مراجعة تقرير/مستند قبل الاعتماد.
- `HistoricalReturnReconciliationService.approve` — يعتمد التصحيح وينشئ قيوداً محاسبية عند الحاجة.
- `HistoricalReturnReconciliationService.assertReportReview` — يتحقق أن المراجعة المطلوبة موجودة قبل الاعتماد.
- `HistoricalReturnReconciliationService.pendingRows` / `toCandidate` / `buildCorrectionLines` — استعلام وتحويل وبناء بنود التصحيح.
**ملاحظات:** يستخدم `BranchAccessService` و`AuditService` و`PermissionService`، ويقرأ `sales_returns` و`sales_invoices` و`customers` و`sales_registers` و`cash_shifts` و`journal_entries`/`journal_entry_lines` لبناء صورة تسوية دقيقة؛ يتطلب صلاحية اعتماد مرتجعات.

### `src/services/domains/sales/LoyaltyService.ts`
**الغرض:** يدير نقاط الولاء للعملاء: الشرائح، الكسب، الاستبدال، وسجل الحركات داخل المعاملات.
**الأعضاء الرئيسية:**
- `applyLoyaltyMovementInTransaction` — يطبق حركة ولاء ذرّياً ضمن معاملة قاعدة البيانات.
- `LoyaltyService.getAllLoyaltyTiers` / `getLoyaltyTierById` / `createLoyaltyTier` — إدارة شرائح الولاء.
- `LoyaltyService.getCustomerLoyalty` / `readCustomerLoyalty` / `getCustomerLoyaltyByCustomerId` — قراءة رصيد الولاء والعميل.
- `LoyaltyService.getRedeemablePointBalance` — يعيد الرصيد القابل للاستبدال.
- `LoyaltyService.initializeCustomerLoyalty` — ينشئ حساب ولاء للعميل عند الحاجة.
- `LoyaltyService.earnPoints` / `redeemPoints` — تسجيل كسب أو استبدال نقاط مع تحقق الصلاحيات.
- `LoyaltyService.getLoyaltyTransactions` / `getLoyaltyTransactionById` / `getLoyaltyStats` — استعلامات الحركات والإحصاءات.
- `LoyaltyService.validateMovementDto` / `requireCustomerId` / `readLoyaltyTierById` — تحقق داخلي للمدخلات والعميل والشرائح.
**ملاحظات:** يستدعيه `invoiceCreation.ts` لكسب النقاط واستبدالها داخل معاملة الفاتورة، وتستدعيه `invoiceVoid.ts` عبر `applyLoyaltyMovementInTransaction` لعكس حركات الولاء عند الإلغاء.

### `src/services/domains/sales/OrderService.ts`
**الغرض:** واجهة `OrderService` العامة التي تفوّض جميع العمليات إلى وحدات `OrderService/*`.
**الأعضاء الرئيسية:**
- `OrderService` — كلاس واجهة للطلبات مع `DatabaseManager` و`SalesService` و`BranchAccessService`.
- `OrderService.getOrders` / `getOrder` / `getOrderItems` / `getOrderDeposits` / `getStats` / `getStatusHistory` — استعلامات الطلبات والعناصر والعربون والإحصاءات والتاريخ.
- `OrderService.createOrder` / `updateOrder` / `updateStatus` / `recordDelivery` / `cancelOrder` / `deleteCancelledOrder` — دورة حياة الطلب.
- `OrderService.recordDeposit` / `refundDeposit` — تسجيل واسترداد العربون.
- `OrderService.convertToInvoice` — تحويل الطلب إلى فاتورة مبيعات عبر `SalesService`.
- إعادة تصدير أنواع `OrderStatus` و`Order` و`OrderItem` و`OrderDeposit` و`OrderDeliveryLine` و`OrderStatusEntry` و`OrderItemInput` و`OrderInput` و`OrderFilters` و`OrderStats` و`ConvertOrderOptions` من `OrderService/types.ts`.
**ملاحظات:** لا يحتوي منطق قاعدة البيانات؛ هو غلاف يحافظ على واجهة قديمة بينما التنفيذ موزع على `queries.ts` و`lifecycle.ts` و`deposits.ts` و`invoicing.ts` و`internals.ts` و`types.ts`.

### `src/services/domains/sales/PricingService.ts`
**الغرض:** يدير قوائم الأسعار والعروض الترويجية وتجاوزات أسعار العملاء والخصومات الترويجية.
**الأعضاء الرئيسية:**
- `PriceList` — قائمة أسعار حسب نوع العميل والصلاحية والعملة.
- `PriceListItem` — بند سعر داخل قائمة لكل منتج.
- `Promotion` — عرض ترويجي بنسبة/مبلغ/اشترِ واحصل/حزمة مع حدود استخدام.
- `AppliedPromotion` — نتيجة تطبيق عرض على سلة.
- `PromotionCartItem` — عنصر سلة لتقييم العروض.
- `PricingService.getPriceLists` / `createPriceList` / `updatePriceList` / `togglePriceList` — إدارة قوائم الأسعار.
- `PricingService.getPriceListItems` / `addPriceListItem` / `deletePriceListItem` — إدارة بنود القوائم.
- `PricingService.getPromotions` / `queryPromotions` / `createPromotion` / `togglePromotion` / `deletePromotion` — إدارة العروض.
- `PricingService.getCustomerOverrides` / `setCustomerOverride` / `deleteCustomerOverride` — أسعار خاصة بالعملاء.
- `PricingService.getEffectivePrice` / `getBestPromotion` / `evaluatePromotions` — حساب السعر الفعلي وأفضل/كل العروض المطبقة.
- `PricingService.scopedPromotionItems` / `normalizeDate` / `assertDateRange` / `auditPriceChange` — نطاقات العروض والتحقق والتدقيق.
**ملاحظات:** يستخدم `AuthService` و`PermissionService`، ويخزن المال داخلياً بوحدات صغرى ويحوّله عند القراءة عبر `unscaleMoneyRow`؛ يكتب سجل تدقيق لتغييرات الأسعار/القوائم/العروض.

### `src/services/domains/sales/QuotationService.ts`
**الغرض:** يدير عروض الأسعار مع البنود والمنتجات والخدمات والمتابعة والتحويل إلى طلب أو فاتورة.
**الأعضاء الرئيسية:**
- `QuotationStatus` — حالات عرض السعر `PENDING`/`CONVERTED`/`EXPIRED`/`CANCELLED`.
- `QuotationItemInput` / `QuotationInput` / `QuotationServiceItemInput` — مدخلات إنشاء/تحديث عرض.
- `QuotationItem` / `QuotationServiceItem` / `Quotation` — نماذج عرض وبنود ومنتجات/خدمات.
- `QuotationFilters` / `QuotationStats` / `ConvertQuotationOptions` — فلاتر وإحصاءات وخيارات تحويل.
- `QuotationService.expireOverdue` — ينهي العروض المنتهية الصلاحية.
- `QuotationService.getQuotations` / `getQuotation` / `getServiceItems` / `getItems` / `getStats` — استعلامات العروض والبنود والإحصاءات.
- `QuotationService.createQuotation` / `updateQuotation` / `setStatus` / `deleteQuotation` / `duplicateQuotation` — دورة حياة العرض.
- `QuotationService.convertToOrder` / `convertToInvoice` — تحويل العرض إلى طلب أو فاتورة.
- `QuotationService.scheduleFollowUp` / `recordContact` — جدولة ومتابعة العملاء المحتملين.
- `QuotationService.getDefaultWarehouseId` / `conversionUnitPrice` / `prepareItems` / `prepareServiceItems` / `insertServiceItems` — تجهيز التحويل والوحدات.
**ملاحظات:** يعتمد على `SalesService` و`OrderService` و`OperationalFieldService` و`resolveSaleUnits`، ويحترم نطاق الفرع/الشركة عبر `BranchAccessService`، ويحوّل القيم المالية بين العرض والوحدات الداخلية.

### `src/services/domains/sales/ReservationService.ts`
**الغرض:** يدير حجوزات المخزون: الإنشاء، الإفراج، الاستهلاك، وانتهاء صلاحية الحجوزات المتأخرة.
**الأعضاء الرئيسية:**
- `ExpireOverdueResult` — نتيجة معالجة الحجوزات المنتهية (`candidates`/`released`/`failed`).
- `ReservationService.getReservations` — يسرد الحجوزات مع فلترة الحالة والبحث.
- `ReservationService.getAvailability` — يعيد onHand/reserved/available لوحدة تخزين.
- `ReservationService.createReservation` — ينشئ حجزاً نشطاً ويزيد `reserved_m2` بعد فحص التوفر.
- `ReservationService.releaseReservation` — يحرر حجزاً نشطاً.
- `ReservationService.consumeReservation` — يحول الحجز إلى خصم مخزون فعلي مع حركة جرد وقيود تكلفة.
- `ReservationService.expireOverdue` — ينهي الحجوزات المنتهية الصلاحية بشكل فردي متسامح مع الأخطاء.
- `ReservationService.releaseReservationInternal` — منطق الإفراج الداخلي داخل معاملة.
**ملاحظات:** يعيد تصدير أنواع `../../../types/sales/reservation`؛ يستخدم `InventoryCostingService` و`InventoryLocationStockService` و`postLedgerEntry`، ويتطلب صلاحية `ui.inventory.hub.view`/`adjust` ووصول المخزن عبر `BranchAccessService`.

### `src/services/domains/sales/SalesFinancialReconciliationService.ts`
**الغرض:** يبني ويغلق تسوية مالية للمبيعات على مستوى الفرع مع فحوصات الاستحقاق والقيد.
**الأعضاء الرئيسية:**
- `SalesFinancialCheck` — نتيجة فحص مالي واحد ضمن التسوية.
- `SalesFinancialClosure` — إغلاق/نتيجة التسوية للفترة.
- `SalesFinancialReconciliationService.canUseCentralClosure` — يقرر إمكانية استخدام الإغلاق المركزي.
- `SalesFinancialReconciliationService.getBranchScopeWarning` — يحذّر عند حدود نطاق الفرع.
- `SalesFinancialReconciliationService.validatePeriod` — يتحقق من صحة الفترة المطلوبة.
- `SalesFinancialReconciliationService.addCheck` — يضيف فحصاً إلى نتيجة التسوية.
- `SalesFinancialReconciliationService.getReconciliation` / `getLatestClosure` — قراءة التسوية/آخر إغلاق.
- `SalesFinancialReconciliationService.closeReconciliation` — يغلق التسوية بعد استيفاء الشروط.
**ملاحظات:** يفحص قيود اليومية وفواتير المبيعات والمرتجعات والتكاليف لضمان اتساق الإيراد/الضريبة/الأرصدة؛ يرتبط بحدود الفروع والشركات.

### `src/services/domains/sales/SalesService.ts`
**الغرض:** الواجهة العامة الرئيسية لخدمات المبيعات: الفواتير، المدفوعات، المرتجعات/الاستبدال، والإلغاء.
**الأعضاء الرئيسية:**
- `SalesService` — كلاس الخدمة الذي يجمع `DatabaseManager` و`BranchAccessService` ويبني `SalesContext`.
- `SalesService.getAllInvoices` / `getAllInvoicesAsync` — جلب الفواتير الأساسية مع استبعاد/تضمين الملغاة.
- `SalesService.getInvoicesFiltered` / `getInvoicesFilteredAsync` — فواتير مفلترة مع إجماليات المرتجع وعدد البنود.
- `SalesService.getStats` / `getStatsAsync` — إحصاءات الفواتير.
- `SalesService.getInvoiceById` / `getInvoiceByIdAsync` — فاتورة بعناصرها.
- `SalesService.createSale` — إنشاء فاتورة عبر `createSalesInvoice` بعد تفعيل وحدة `sales`.
- `SalesService.recordInvoicePayment` — تسجيل دفعة واحدة على فاتورة.
- `SalesService.recordInvoicePaymentComponents` — تسجيل تحصيل مختلط بعدة وسائل دفع.
- `SalesService.recordCustomerPaymentAllocations` — توزيع تحصيل واحد على عدة فواتير.
- `SalesService.getInvoicePayments` / `getInvoicePaymentsAsync` — قراءة مدفوعات فاتورة.
- `SalesService.deleteInvoicePayment` — حذف دفعة فاتورة عبر `deleteInvoicePaymentEntry`.
- `SalesService.returnSale` — إنشاء مرتجع عبر `createSaleReturn`.
- `SalesService.exchangeSale` — إرجاع الأصناف ورصيدها ثم بيع بدائل في معاملة واحدة.
- `SalesService.voidInvoice` — إلغاء فاتورة عبر `voidSalesInvoice`.
- `SalesService.getReturns` / `getReturnsAsync` / `getReturnById` / `getReturnByIdAsync` / `getReturnsStats` / `getReturnsStatsAsync` / `getTopReturnReasons` / `getTopReturnReasonsAsync` / `getReturnItems` / `getReturnItemsAsync` / `getReturnableItems` — استعلامات المرتجعات والإحصاءات والأسباب والبنود والمتاح للإرجاع.
- إعادة تصدير `CreateSaleDTO` و`InvoiceFilters` و`InvoiceStats` و`ReturnableItem` و`ReturnRequestItem` و`ReturnDisposition` و`ReturnStats`.
**ملاحظات:** يفرض `ui.sales.invoices.view` على القراءات العامة و`ModuleRegistryService.assertModuleEnabled('sales')` على الكتابات؛ لا يحتوي منطق إنشاء الفاتورة بل يفوّض إلى `invoiceCreation.ts` و`payments.ts` و`returns.ts` و`invoiceVoid.ts` وواجهات الاستعلام.

### `src/services/domains/sales/invoiceCreation.ts`
**الغرض:** ينشئ فاتورة مبيعات كاملة داخل معاملة واحدة عبر تجميع وحدات `invoiceCreation/*`.
**الأعضاء الرئيسية:**
- `createSalesInvoice` — يتحقق من المدخلات والدفعات، يفرض الصلاحيات وحدود الاستخدام وسياسة المستودع، ينشئ الفاتورة والبنود والحركات والدفعات والقيود والتأثيرات، ويعيد تحميل الفاتورة.
**ملاحظات:** يتكامل مع `AuthService` و`PermissionService` و`SettingsService` و`ModuleRegistryService` و`CentralUsageLimitService` و`WarehouseTypePolicy` و`PartnerService` و`defaultEffectEngine`؛ يعيد حساب الضريبة من النسبة وليس من العميل، ويستهلك اعتمادات الخصم/التسعير عبر `invoiceCreation/approvals.ts`.

### `src/services/domains/sales/invoiceQueries.ts`
**الغرض:** واجهة إعادة تصدير لاستعلامات الفواتير المقسمة إلى جزأين.
**الأعضاء الرئيسية:**
- يعيد تصدير `buildInvoiceWhere` و`fetchInvoicesFiltered` و`fetchInvoicesFilteredAsync` من `invoiceQueries_part01.ts`.
- يعيد تصدير `fetchInvoiceStats` و`fetchInvoiceStatsAsync` و`fetchInvoiceById` و`fetchInvoiceByIdAsync` و`fetchInvoicePayments` و`fetchInvoicePaymentsAsync` من `invoiceQueries_part02.ts`.
**ملاحظات:** لا يحتوي منطقاً؛ يحافظ على مسار استيراد واحد قبل تقسيم الاستعلامات إلى ملفات أصغر.

### `src/services/domains/sales/invoiceQueries_part01.ts`
**الغرض:** يبني شروط استعلام الفواتير ويجلب القوائم المفلترة بشكل متزامن وغير متزامن.
**الأعضاء الرئيسية:**
- `buildInvoiceWhere` — يبني WHERE وparams مع نطاق الفرع/الشركة والفلاتر.
- `fetchInvoicesFiltered` — تنفيذ متزامن لاستعلام الفواتير مع حقول المرتجع/عدد البنود.
- `fetchInvoicesFilteredAsync` — نسخة Promise لنفس الاستعلام.
**ملاحظات:** يستخدم `SalesContext` و`BranchAccessService` و`unscaleMoneyRow`/`maskSensitiveFields` حسب الحاجة، ويُستدعى من `invoiceQueries.ts` و`SalesService`.

### `src/services/domains/sales/invoiceQueries_part02.ts`
**الغرض:** ينفذ إحصاءات الفواتير، جلب فاتورة بعناصرها، وجلب مدفوعات الفاتورة.
**الأعضاء الرئيسية:**
- `fetchInvoiceStats` / `fetchInvoiceStatsAsync` — إجماليات وإحصاءات للفواتير ضمن الفلاتر.
- `fetchInvoiceById` / `fetchInvoiceByIdAsync` — فاتورة واحدة مع عناصرها.
- `fetchInvoicePayments` / `fetchInvoicePaymentsAsync` — مدفوعات/تحصيلات مرتبطة بفاتورة.
**ملاحظات:** يكمل `invoiceQueries_part01.ts`؛ يعيد استخدام `SalesContext.getInvoiceById` عند الحاجة ويتعامل مع تحويل القيم المالية وإخفاء الحقول الحساسة.

### `src/services/domains/sales/invoiceVoid.ts`
**الغرض:** يلغي فاتورة مبيعات معكوساً كل آثارها: المخزون، الدفعات، الولاء، العروض، القيود، وروابط الطلبات.
**الأعضاء الرئيسية:**
- `voidSalesInvoice` — ينفذ الإلغاء داخل معاملة، يستعيد المخزون/المخزون الخاص/FIFO/الدفعات/الولاء/العروض/القيود، ويضع الفاتورة `VOID`.
- دوال داخلية: `reverseInvoiceLoyalty` و`reverseInvoicePromotionUsage` و`restoreInvoiceItem` و`restoreInvoicePayment` و`voidInvoiceLedger` و`markInvoiceVoid` وغيرها ضمن الملف.
**ملاحظات:** يستخدم `OperationApprovalGate` و`InventoryCostingService` و`InventoryLocationStockService` و`BatchService` و`PartnerService` و`defaultEffectEngine`؛ يتطلب صلاحيات مناسبة ويتحقق من عدم وجود مرتجعات تمنع الإلغاء.

### `src/services/domains/sales/paymentAccounts.ts`
**الغرض:** دوال مساعدة لحسابات الدفع البنكية داخل المبيعات.
**الأعضاء الرئيسية:**
- `getActiveBankAccount` — يعيد حساباً بنكياً نشطاً بالمعرّف أو الافتراضي مع رمز الحساب.
- `updateBankBalance` — يحدّث رصيد الحساب البنكي بمقدار الدفعة/العكس.
**ملاحظات:** يستخدمها مسار إنشاء الفاتورة والمدفوعات لربط التحصيلات البنكية بقيود الحسابات؛ يتعامل مع مبالغ بوحدات صغرى حسب جداول الحسابات.

### `src/services/domains/sales/payments.ts`
**الغرض:** يسجل مدفوعات الفواتير وتوزيعها على وسائط الدفع ويعكسها عند الحذف.
**الأعضاء الرئيسية:**
- `InvoicePaymentComponent` — مكوّن دفعة مختلطة (طريقة، مبلغ، مرجع، حساب بنكي).
- `recordInvoicePaymentEntry` — يسجل دفعة واحدة على فاتورة مع تحديث المدفوع/المتبقي.
- `recordInvoicePaymentComponentsEntry` — يسجل عدة مكونات دفع في نفس المعاملة.
- `recordCustomerPaymentAllocationsEntry` — يسجل تحصيلاً موزعاً على عدة فواتير.
- `deleteInvoicePaymentEntry` — يحذف دفعة ويعكس أثرها على الفاتورة والعميل.
**ملاحظات:** يستخدم `SalesContext` و`getActiveBankAccount`/`updateBankBalance` و`paymentAccountCode` والقيود والتدقيق؛ يدعم idempotency وpaymentDate وbankAccountId.

### `src/services/domains/sales/returnQueries.ts`
**الغرض:** واجهة إعادة تصدير لاستعلامات المرتجعات المقسمة إلى أربعة أجزاء.
**الأعضاء الرئيسية:**
- يعيد تصدير `fetchReturns` و`fetchReturnsAsync` و`fetchReturnById` و`fetchReturnByIdAsync` من `returnQueries_part01.ts`.
- يعيد تصدير `fetchReturnStats` و`fetchReturnStatsAsync` و`fetchTopReturnReasons` و`fetchTopReturnReasonsAsync` من `returnQueries_part02.ts`.
- يعيد تصدير `fetchReturnItems` و`fetchReturnItemsAsync` من `returnQueries_part03.ts`.
- يعيد تصدير `fetchReturnableItems` من `returnQueries_part04.ts`.
**ملاحظات:** لا يحتوي منطقاً؛ يحافظ على مسار استيراد موحد قبل تقسيم الاستعلامات.

### `src/services/domains/sales/returnQueries_part01.ts`
**الغرض:** يجلب قوائم المرتجعات ومرتجعاً بعناصره بشكل متزامن وغير متزامن.
**الأعضاء الرئيسية:**
- `fetchReturns` — مرتجعات مفلترة بالبحث والتاريخ مع اسم العميل ورقم الفاتورة.
- `fetchReturnsAsync` — نسخة Promise.
- `fetchReturnById` — مرتجع واحد مع عناصره وبيانات العميل/الفاتورة.
- `fetchReturnByIdAsync` — نسخة Promise.
**ملاحظات:** يستخدم `SalesContext` و`BranchAccessService`، ويستعلم `sales_returns` و`sales_return_items` و`customers` و`sales_invoices`.

### `src/services/domains/sales/returnQueries_part02.ts`
**الغرض:** يحسب إحصاءات المرتجعات وأعلى أسباب الإرجاع.
**الأعضاء الرئيسية:**
- `fetchReturnStats` / `fetchReturnStatsAsync` — إجماليات وأعداد المرتجعات والنقد/الرصيد.
- `fetchTopReturnReasons` / `fetchTopReturnReasonsAsync` — أكثر أسباب الإرجاع تكراراً مع العدد والمبلغ.
**ملاحظات:** يقرأ جداول المرتجعات والعناصر ويحوّل المقادير المالية إلى أرقام عادية.

### `src/services/domains/sales/returnQueries_part03.ts`
**الغرض:** يجلب بنود مرتجع معين.
**الأعضاء الرئيسية:**
- `fetchReturnItems` — بنود `sales_return_items` المرتبطة بـ returnId.
- `fetchReturnItemsAsync` — نسخة Promise.
**ملاحظات:** مساعد مركزي تستدعيه `returnQueries.ts` و`SalesService.getReturnItems`.

### `src/services/domains/sales/returnQueries_part04.ts`
**الغرض:** يحسب الكميات المتبقية القابلة للإرجاع لكل بند فاتورة بعد خصم المرتجعات السابقة.
**الأعضاء الرئيسية:**
- `fetchReturnableItems` — يعيد `ReturnableItem[]` مع مراعاة المرتجعات المرتبطة بالبند والمرتجعات القديمة/غير المرتبطة.
**ملاحظات:** منطق حساس لأنه يدمج المرتجعات الحديثة `return_items` مع البيانات القديمة لتجنب السماح بإرجاع أكثر من الكمية المباعة.

### `src/services/domains/sales/returns.ts`
**الغرض:** ينشئ مرتجع مبيعات كامل الأثر داخل معاملة: استعادة مخزون/مخزون خاص، تحديث عميل ومرتجع، ضريبة وقيود، وموافقات.
**الأعضاء الرئيسية:**
- `createSaleReturn` — ينفذ إنشاء المرتجع من `invoiceId` و`returnItems` مع خيارات الاسترداد والمخزون والدفعات.
- دوال داخلية لمعالجة المخزون العادي/الخاصة، ضريبة المرتجع، رصيد العميل، وردّ الدفعة/القيود.
**ملاحظات:** يستخدم `SalesContext` و`BranchAccessService` و`InventoryCostingService`/`InventoryLocationStockService`/`BatchService` والقيود والتأثيرات؛ يتطلب صلاحيات مناسبة وقد يستهلك اعتمادات عبر `OperationApprovalGate`.

### `src/services/domains/sales/unitResolution.ts`
**الغرض:** يوحّد حل وحدات البيع لأسطر الفواتير/العروض/الطلبات.
**الأعضاء الرئيسية:**
- `ResolvedSaleUnits` — نتيجة توحيد الوحدة: الكمية بالوحدة الأساسية، الكمية المدخلة، معامل التحويل، تسميات الوحدات.
- `resolveSaleUnits` — يحول الوحدة المباعة الصريحة إلى الوحدة الأساسية مع الحفاظ على إجماليات الوحدة المدخلة.
**ملاحظات:** مشترك بين `invoiceCreation/itemPreparation.ts` و`QuotationService` و`OrderService/internals.ts` لضمان أن الكميات المخزنية بالوحدة الأساسية بينما يبقى سعر/عرض الوحدة كما أدخله المستخدم.

### `src/services/domains/sales/WarrantyClaimService.ts`
**الغرض:** يدير مطالبات الضمان/الإصلاح/الاستبدال/الشكاوى على فواتير المبيعات مع انتقالات الحالة والتنفيذ.
**الأعضاء الرئيسية:**
- `WarrantyClaimStatus` — حالات `OPEN`/`UNDER_REVIEW`/`APPROVED`/`REJECTED`/`RESOLVED`/`CANCELLED`.
- `WarrantyClaimType` — `WARRANTY`/`REPAIR`/`REPLACEMENT`/`COMPLAINT`.
- `WarrantyResolutionType` — `REPAIR`/`REPLACEMENT`/`REFUND`/`REJECTED`/`OTHER`.
- `WarrantyClaimAction` — إجراءات `review`/`approve`/`reject`/`resolve`/`cancel`.
- `WarrantyClaimEvent` — حدث انتقال حالة للمطالبة.
- `WarrantyClaim` — كيان المطالبة مع الفاتورة/العميل/المنتج/الضمان/القرار/التنفيذ.
- `EligibleWarrantyItem` — بند فاتورة مؤهل للضمان مع الكميات المتاحة وتواريخ الانتهاء.
- `WarrantyInvoiceHeader` — رأس فاتورة مختصر لقراءة المطالبات.
- `WarrantyClaimsStats` — إحصاءات المطالبات.
- `CreateWarrantyClaimInput` — مدخل إنشاء مطالبة.
- `WarrantyClaimService` — الخدمة الرئيسية.
- `WarrantyClaimService.listClaims` / `getClaim` / `getInvoiceHeader` / `getEligibleItems` — استعلامات محصورة.
- `WarrantyClaimService.createClaim` — إنشاء مطالبة جديدة.
- `WarrantyClaimService.transition` — تغيير الحالة بإجراء مدقق.
- `WarrantyClaimService.executeResolution` — تنفيذ الحل مثل إرجاع/استبدال/استرداد.
- `WarrantyClaimService.stats` — إحصاءات المطالبات.
**ملاحظات:** يعتمد على `SalesService` لقراءة الفواتير/المرتجعات، و`BranchAccessService` للنطاق، و`PermissionService` للصلاحيات؛ يربط التنفيذ بسجلات المبيعات/المرتجعات عند الحل.

**ملفات فرعية `src/services/domains/sales/invoiceCreation/`:**

### `src/services/domains/sales/invoiceCreation/approvals.ts`
**الغرض:** بوابات الاعتماد داخل إنشاء الفاتورة للخصم/الائتمان/التسعير دون التكلفة/العروض.
**الأعضاء الرئيسية:**
- `validateDiscountAndCredit` — يتحقق من حدود الخصم والائتمان ويستهلك اعتمادات الخصم عند الحاجة.
- `validateBelowCostPricing` — يمنع البيع تحت التكلفة أو دون الحد الأدنى ما لم يوجد اعتماد.
- `validatePromotionEligibility` — يتحقق من صلاحية العروض المرفقة قبل تثبيت الفاتورة.
**ملاحظات:** تستدعيها `invoiceCreation.ts` بعد حساب الإجماليات وتجهيز البنود؛ تعمل داخل نفس معاملة قاعدة البيانات لاستهلاك الاعتمادات ذرّياً.

### `src/services/domains/sales/invoiceCreation/itemPersistence.ts`
**الغرض:** يدرج بنود الفاتورة وينشر حركات المخزون والتكلفة المرتبطة بها داخل معاملة الإنشاء.
**الأعضاء الرئيسية:**
- `insertInvoiceItems` — يدرج بنود `sales_invoice_items` وينشر حركات المخزون/المخزون الخاص/FIFO/الدفعات.
**ملاحظات:** تستدعيها `invoiceCreation.ts` بعد نجاح التحضير والاعتمادات؛ تتعامل مع `preparedItems` و`costingMethod` و`allowNegativeStock`.

### `src/services/domains/sales/invoiceCreation/itemPreparation.ts`
**الغرض:** يحضّر بنود الفاتورة: حل الوحدات، التحقق من المخزون، تخطيط FIFO، المخزون الخاص، وحساب الإجماليات/التكلفة/الربح.
**الأعضاء الرئيسية:**
- `PRODUCT_PRICE_MONEY_FIELDS` — حقول أسعار المنتجات المخزنة بالوحدات الصغرى.
- `prepareSaleItems` — يعيد `preparedItems` و`totalLineDiscount` مع كل فحوصات المخزون والتسعير.
**ملاحظات:** يستخدم `resolveSaleUnits` و`InventoryCostingService`/`InventoryLocationStockService`/`BatchService`؛ هو الجزء الأكبر من منطق الفاتورة قبل الكتابة.

### `src/services/domains/sales/invoiceCreation/ledger.ts`
**الغرض:** يبني بنود القيد اليومي المتوازنة لفاتورة المبيعات.
**الأعضاء الرئيسية:**
- `buildLedgerEntries` — ينشئ قيود المقابل: التحصيل، الذمم، الإيراد، الضريبة، تكلفة المخزون، وتكلفة الخدمات.
**ملاحظات:** تستدعيها `invoiceCreation.ts` ثم تمرر الناتج إلى `EffectEngine` عبر `ledger.post`؛ يجب أن تتوازن مع إجماليات الفاتورة.

### `src/services/domains/sales/invoiceCreation/payments.ts`
**الغرض:** يحل دفعات الفاتورة، يحدد الصندوق/الوردية، ويحدث رصيد العميل والصندوق.
**الأعضاء الرئيسية:**
- `resolvePayments` — يحول `CreateSaleDTO` إلى قائمة دفعات موحدة `method/amount/reference/bankAccountId`.
- `capPayments` — يحد المدفوعات ضمن حد أقصى.
- `resolveCashRegister` — يحدد الفرع/الصندوق/الوردية من المدخلات أو الافتراضيات.
- `updateCustomerAndCash` — يحدث رصيد العميل وحركة الصندوق/الوردية داخل المعاملة.
**ملاحظات:** تستخدمها `invoiceCreation.ts` قبل الإدراج وبعده؛ ترتبط بـ `paymentAccounts.ts` و`sales_registers` و`cash_shifts` و`customers`.

### `src/services/domains/sales/invoiceCreation/pricingValidation.ts`
**الغرض:** يتحقق من أسعار البنود مقابل اتفاقات الطلب/العرض وسعر POS الفعال.
**الأعضاء الرئيسية:**
- `validateProductPricing` — يفرض قواعد السعر المتفق عليها ويمنع التلاعب بأسعار البيع.
**ملاحظات:** تستدعيها مسارات إنشاء الفاتورة عند وجود `orderId`/`quotationId` أو سعر فعّال؛ تعمل على `sqliteDb` داخل المعاملة.

### `src/services/domains/sales/invoiceCreation/types.ts`
**الغرض:** أنواع داخلية مشتركة بين وحدات إنشاء الفاتورة.
**الأعضاء الرئيسية:**
- `PreparedSaleItem` — بند فاتورة مُجهّز بكل الحقول اللازمة للإدراج والتكلفة/الربح.
- `DiscountApprovalRow` — صف اعتماد خصم مسترجع من قاعدة البيانات.
**ملاحظات:** لا يحتوي منطقاً؛ يضمن اتساق الأنواع بين `itemPreparation` و`itemPersistence` و`approvals`.

### `src/services/domains/sales/invoiceCreation/validation.ts`
**الغرض:** تحقق أولي من مدخلات فاتورة المبيعات قبل بدء المعاملة.
**الأعضاء الرئيسية:**
- `assertSaleHasItems` — يضمن وجود بنود.
- `validateSaleNumbers` — يتحقق من الحقول الرقمية والمدفوعات والخصومات الأساسية.
**ملاحظات:** تستدعيها `invoiceCreation.ts` في أول `createSalesInvoice` قبل المصادقة؛ رسائل الأخطاء عربية وموجهة للمستخدم.

**ملفات فرعية `src/services/domains/sales/OrderService/`:**

### `src/services/domains/sales/OrderService/deposits.ts`
**الغرض:** تسجيل واسترداد عربون الطلبات.
**الأعضاء الرئيسية:**
- `recordDeposit` — يسجل دفعة عربون على طلب مع تحديث المدفوع/المتبقي والقيود عند الحاجة.
- `refundDeposit` — يسترد عربوناً مسجلاً ويعكس أثره.
**ملاحظات:** تستخدم `DatabaseManager` و`BranchAccessService`؛ تستدعيها `OrderService.recordDeposit` و`refundDeposit`، وتدعم idempotency وbankAccountId.

### `src/services/domains/sales/OrderService/internals.ts`
**الغرض:** دوال داخلية مشتركة لدورة الطلبات: التحقق، المستودع، تطبيع البنود، الإجماليات، المخزون، السجل، والتدقيق.
**الأعضاء الرئيسية:**
- `validateSalesRep` — يتحقق من المندوب النشط.
- `resolveWarehouse` — يحل المستودع الافتراضي/المسموح.
- `normalizeItems` — يطبّع بنود الطلب ويحسب الكميات بالوحدة الأساسية.
- `computeTotals` — يحسب إجماليات الطلب والضريبة/الخصم.
- `validateOrderDiscounts` — يتحقق من حدود الخصم والاعتمادات.
- `assertStockAndReserve` — يفحص المخزون ويحجزه عند الحاجة.
- `releaseReservations` — يحرر حجوزات البنود.
- `logStatus` — يسجل انتقال حالة الطلب.
- `audit` — يكتب سجل تدقيق موحد.
**ملاحظات:** لا تُصدَّر كواجهة عامة؛ تستخدمها `lifecycle.ts` و`queries.ts` و`invoicing.ts` للحفاظ على اتساق الطلبات.

### `src/services/domains/sales/OrderService/invoicing.ts`
**الغرض:** يحول طلباً إلى فاتورة مبيعات عبر `SalesService` مع خصم العربون والودائع.
**الأعضاء الرئيسية:**
- `convertToInvoice` — ينشئ `CreateSaleDTO` من الطلب، يطبق العربون/الخصومات/الضريبة، ويستدعي `SalesService.createSale`.
**ملاحظات:** يستقبل `SalesService` كمعامل لتجنب دورة اعتماد؛ يستهلك حجوزات/بنود الطلب ويحدث حالة التحويل.

### `src/services/domains/sales/OrderService/lifecycle.ts`
**الغرض:** ينفذ دورة حياة الطلب: الإنشاء، التحديث، الحالة، التسليم، الإلغاء، والحذف.
**الأعضاء الرئيسية:**
- `createOrder` — ينشئ طلباً مع بنود وحجوزات وسجل حالة.
- `updateOrder` — يحدث طلباً موجوداً مع إعادة حساب البنود/الإجماليات.
- `updateStatus` — يغير حالة الطلب ويسجلها.
- `recordDelivery` — يسجل كميات مسلمة جزئياً/كلياً ويحدث الحالة.
- `cancelOrder` — يلغي طلباً ويحرر الحجوزات.
- `deleteCancelledOrder` — يحذف طلباً ملغى فقط.
**ملاحظات:** تعتمد على `internals.ts` و`BranchAccessService`؛ كل العمليات الكتابية داخل معاملات وتكتب audit/status history.

### `src/services/domains/sales/OrderService/queries.ts`
**الغرض:** استعلامات الطلبات والبنود والعربون والإحصاءات وسجل الحالات.
**الأعضاء الرئيسية:**
- `getOrders` — طلبات مفلترة بالبحث/الحالة/التاريخ.
- `getOrderItems` — بنود طلب.
- `getOrder` — طلب واحد.
- `getOrderDeposits` — عربونات طلب.
- `getStats` — إحصاءات الطلبات.
- `getStatusHistory` — تاريخ انتقالات الحالة.
**ملاحظات:** تستخدم `BranchAccessService` لنطاق الفرع/الشركة و`unscaleMoneyRow`/إخفاء الحقول الحساسة؛ تقرأ فقط.

### `src/services/domains/sales/OrderService/types.ts`
**الغرض:** أنواع وثوابت الطلبات المشتركة بين `OrderService` ووحداتها.
**الأعضاء الرئيسية:**
- `ORDER_MONEY_FIELDS` / `ORDER_ITEM_MONEY_FIELDS` — قوائم حقول المال المخزنة بالوحدات الصغرى.
- `OrderStatus` — حالات `PENDING`/`CONFIRMED`/`PROCESSING`/`PARTIAL`/`READY`/`ON_HOLD`/`COMPLETED`/`CANCELLED`.
- `Order` — كيان طلب رئيسي.
- `OrderItem` — بند طلب.
- `OrderDeposit` — عربون/دفعة مقدمة.
- `OrderDeliveryLine` — سطر تسليم بكميات مسلمة.
- `OrderStatusEntry` — سجل انتقال حالة.
- `OrderItemInput` / `OrderInput` — مدخلات إنشاء/تحديث.
- `OrderFilters` — فلاتر الاستعلام.
- `OrderStats` — إحصاءات مجمعة.
- `ConvertOrderOptions` — خيارات التحويل إلى فاتورة.
- `NormalizedOrderItem` — بند مطبّع بالوحدة الأساسية.
**ملاحظات:** يصدّرها `OrderService.ts` للواجهة العامة؛ لا يحتوي منطقاً.

## المصادقة

**ملفات جذر `src/services/domains/auth/`:**

### `src/services/domains/auth/AuthService.ts`
**الغرض:** النقطة العامة لـ `AuthService` بعد دمج سلسلة المسؤوليات في `AuthService/*`.
**الأعضاء الرئيسية:**
- `AuthService` — كلاس نهائي يرث `AuthServiceAccountSecurity` ويحتفظ بالواجهة العامة كما كانت.
- إعادة تصدير `LOGIN_LOCKOUT_WINDOW_MINUTES` و`SECURITY_KEY_LOGIN_GUARD_KEY` و`TwoFactorRequiredError` و`LoginGuardStatus`.
**ملاحظات:** الواجهة العامة لم تتغير؛ السلسلة الفعلية هي `AuthServiceCore → AuthServiceSession → AuthServiceLogin → AuthServicePins → AuthServiceUserAdmin → AuthServiceAccountSecurity`.

### `src/services/domains/auth/BranchAccessService.ts`
**الغرض:** يدير نطاق الفروع/الشركات/المستودعات/الصناديق/الورديات للمستخدم الحالي.
**الأعضاء الرئيسية:**
- `BranchSqlScope` — نطاق SQL للفرع/المستودع.
- `BranchAccessService.getAccessibleBranchIds` / `getSelectableBranches` / `getCurrentBranchId` / `setCurrentBranchId` — قراءة/تعيين الفرع الحالي.
- `BranchAccessService.getAccessibleCompanyIds` / `companyScope` / `companyScopeViaBranch` / `hasCompanyAccess` / `requireCompanyAccess` — نطاق الشركات.
- `BranchAccessService.hasBranchAccess` / `hasBranchAuthorization` / `requireBranchAuthorization` / `requireBranchAccess` — تحقق الفرع.
- `BranchAccessService.requireRegisterAccess` / `requireShiftAccess` / `getDefaultRegisterId` / `getDefaultAccessibleBranchId` — الصناديق والورديات.
- `BranchAccessService.requireWarehouseAccess` / `requireWarehouseAuthorization` / `warehouseBranchScope` / `supplierClaimBranchScope` / `sqlScope` — نطاق المستودعات وSQL.
**ملاحظات:** يخزن الفرع الحالي محلياً عبر `branchStorageKey`؛ تستخدمه كل خدمات المبيعات/المخزون/المالية لبناء `WHERE` scopes وفشل مغلق عند غياب الصلاحية.

### `src/services/domains/auth/EmployeeDepartmentAccessService.ts`
**الغرض:** يقيّد وصول الموظفين للأقسام بنطاق `ALL` أو `ASSIGNED`.
**الأعضاء الرئيسية:**
- `DepartmentScope` — `ALL` أو `ASSIGNED`.
- `EmployeeDepartmentAccessService.requireManageUsers` — يفرض صلاحية إدارة المستخدمين.
- `EmployeeDepartmentAccessService.sqlScope` — يبني شرط SQL للأقسام المسموحة.
- `EmployeeDepartmentAccessService.requireEmployeeAccess` / `requireAllDepartmentAccess` — يتحقق من الوصول لموظف/كل الأقسام.
- `EmployeeDepartmentAccessService.getScope` / `getAssignedDepartmentIds` / `getAvailableDepartments` / `updateAccess` — قراءة وتحديث نطاق الأقسام.
**ملاحظات:** يعمل مع `AuthService` و`PermissionService` و`DatabaseManager`؛ يخدم شاشات إدارة المستخدمين والموظفين.

### `src/services/domains/auth/PermissionService.ts`
**الغرض:** الواجهة العامة لنظام الصلاحيات: الكتالوج، الأدوار، التجاوزات، الفحص الفعال، والتحقق.
**الأعضاء الرئيسية:**
- `PermissionService.seed` — يزرع الكتالوج والأدوار والافتراضيات.
- `PermissionService.getCatalog` / `getModules` / `getCatalogGroups` / `getPermission` / `isKnownPermission` / `getCatalogSize` / `getModuleLabels` — استعلامات الكتالوج.
- `PermissionService.getRoles` / `getRolePermissions` / `setRolePermissions` / `createRole` / `updateRole` / `deleteRole` — إدارة الأدوار.
- `PermissionService.getUserOverrides` / `setUserOverride` / `clearUserOverrides` — تجاوزات المستخدم.
- `PermissionService.getEffectiveCodes` / `can` / `hasRoleGrant` / `canAny` — فحص الصلاحيات الفعالة.
- `PermissionService.getPagePermission` / `canAccessPage` / `requirePage` — ربط الصفحات بالصلاحيات.
- `PermissionService.require` / `requireAny` / `invalidate` — فرض/إبطال الصلاحيات.
**ملاحظات:** يفوّض إلى `PermissionSeeder` و`RolePermissionService` و`UserPermissionService` و`PermissionChecker` و`catalog.ts`؛ هو الواجهة التي تستدعيها الخدمات مثل `SalesService` و`AuthService`.

### `src/services/domains/auth/passwordPolicy.ts`
**الغرض:** يعرّف سياسة كلمة المرور الافتراضية والمكوّنة من الإعدادات.
**الأعضاء الرئيسية:**
- `PasswordPolicy` — حقول السياسة (الطول، التعقيد، إلخ).
- `DEFAULT_PASSWORD_POLICY` — السياسة الافتراضية.
- `getConfiguredPasswordPolicy` — يدمج الإعدادات المحفوظة مع الافتراضي.
**ملاحظات:** تستخدمه `AuthServiceSession.validatePasswordPolicy` و`AuthServiceUserAdmin` عند إنشاء/تغيير كلمات المرور.

### `src/services/domains/auth/sensitiveFields.ts`
**الغرض:** يحدد رؤية الحقول المالية الحساسة ويخفيها من الصفوف حسب صلاحيات المستخدم.
**الأعضاء الرئيسية:**
- `FinancialFieldVisibility` — أعلام رؤية التكلفة/الربح/الحقول الحساسة.
- `financialFieldVisibility` — يحسب الرؤية من صلاحيات المستخدم الحالي.
- `maskSensitiveFields` — يخفي/يصفّر حقولاً حسب الرؤية.
- `maskCostFields` / `maskProfitFields` — مساعدان مخصصان للتكلفة والربح.
**ملاحظات:** يستخدم `PermissionService.hasRoleGrant` و`AuthService.getCurrentUser`؛ تستدعيه استعلامات المبيعات/الفواتير/التقارير لإخفاء بيانات التكلفة والربح عن غير المخولين.

### `src/services/domains/auth/session.ts`
**الغرض:** حالة جلسة المصادقة منخفضة المستوى بدون اعتماديات خدمات لتجنب الدورات.
**الأعضاء الرئيسية:**
- `authSession.getCurrentUser` — يعيد المستخدم الحالي في الذاكرة.
- `authSession.requireAuth` — يرمي خطأ إذا لم يكن هناك مستخدم أو كان `mustChangePassword` بدون سماح.
- `authSession.setCurrentUser` — يضبط/يمسح مستخدم الجلسة.
**ملاحظات:** يستخدمه `AuthServiceCore` و`BranchAccessService` وخدمات أخرى تحتاج المستخدم الحالي دون استيراد `AuthService` كاملاً.

### `src/services/domains/auth/twoFactorAuth.ts`
**الغرض:** الواجهة العامة للمصادقة الثنائية: إعداد، تحقق، تمكين/تعطيل، أكواد استرداد، ورموز الأجهزة.
**الأعضاء الرئيسية:**
- `twoFactorAuth` — مثيل Singleton لخدمة `TwoFactorAuthService` على جدول `user_2fa`.
- `platformStaffTwoFactorAuth` — مثيل مستقل لطاقم المنصة على `platform_staff_2fa`.
- `deletePlatformStaffTwoFactorRow` — حذف صف 2FA لطاقم المنصة في حالات الطوارئ.
- إعادة تصدير `base32Decode` و`base32Encode` و`generateHOTP` و`generateTOTP` وأنواع `TwoFactorConfig`/`TwoFactorSetup`.
- `TwoFactorAuthService.isEnabled` / `setup2FA` / `verify2FA` / `verify2FASync` / `verifyLoginCodeSync` / `enable2FA` / `disable2FA` / `getStatus` / `generateTestCode` / `generateCurrentCode` / `enableHardwareToken` / `disableHardwareToken`.
**ملاحظات:** الفئة `TwoFactorAuthService` غير مصدّرة مباشرة لكن السلوك متاح عبر `twoFactorAuth` و`platformStaffTwoFactorAuth`؛ تخزن الأسرار/الإعدادات في `TwoFactorAuthRepository` وتجزّئ أكواد الاسترداد بـ bcrypt.

### `src/services/domains/auth/twoFactorAuthRepository.ts`
**الغرض:** مستودع قاعدة البيانات لصفوف المصادقة الثنائية.
**الأعضاء الرئيسية:**
- `TwoFactorAuthRepository` — يعمل على جدول قابل للحقن (`user_2fa` أو `platform_staff_2fa`).
- `TwoFactorAuthRepository.findByUserId` — يقرأ صف المستخدم.
- `TwoFactorAuthRepository.savePendingSetup` — يحفظ إعداداً معلقاً وسر/أكواد استرداد مجزأة.
- `TwoFactorAuthRepository.advanceHotpCounter` / `setLastUsedCounter` — تحديث عدادات HOTP/TOTP.
- `TwoFactorAuthRepository.setRecoveryCodes` / `disable` / `enable` / `setHardwareToken` / `deleteRow` — تحديثات الحالة.
**ملاحظات:** يعزل SQL عن منطق `TwoFactorAuthService`؛ يدعم جدولين منفصلين لمستخدمي ERP وطاقم المنصة.

### `src/services/domains/auth/twoFactorCrypto.ts`
**الغرض:** أدوات تشفير/توليد لأكواد TOTP/HOTP وBase32 والمقارنة الآمنة.
**الأعضاء الرئيسية:**
- `DEFAULT_PERIOD` — فترة TOTP الافتراضية 30 ثانية.
- `DEFAULT_DIGITS` — عدد خانات الكود الافتراضي 6.
- `generateRandomBytes` — بايتات عشوائية آمنة.
- `base32Decode` / `base32Encode` — ترميز/فك Base32 للأسرار.
- `generateTOTP` — توليد رمز زمني.
- `generateHOTP` — توليد رمز عدّاد.
- `safeEqual` — مقارنة ثابتة الزمن لتجنب timing attacks.
**ملاحظات:** لا يعتمد على قاعدة البيانات؛ تستخدمه `twoFactorAuth.ts` و`twoFactorAuthRepository.ts` والاختبارات/الأدوات.

### `src/services/domains/auth/twoFactorTypes.ts`
**الغرض:** أنواع بيانات المصادقة الثنائية المشتركة.
**الأعضاء الرئيسية:**
- `TwoFactorSetup` — نتيجة الإعداد المعلق: السر، QR، أكواد الاسترداد، حالة التحقق.
- `TwoFactorConfig` — إعداد خوارزمية/فترة/رقائق 2FA.
- `TwoFactorRow` — صف قاعدة البيانات لصف 2FA.
**ملاحظات:** أنواع فقط؛ تستخدمها `twoFactorAuth.ts` و`twoFactorAuthRepository.ts`.

**مجلد `src/services/domains/auth/authorization/`:**

### `src/services/domains/auth/authorization/AuthorizationService.ts`
**الغرض:** محرك التقييم متعدد الأبعاد للصلاحيات: مركزي، شاشة، نطاق، منح، مبلغ، وحساسية.
**الأعضاء الرئيسية:**
- `AuthDimension` — أبعاد القرار `central`/`screen`/`scope`/`grant`/`amount`/`sensitivity`.
- `AuthContext` — سياق التقييم (مستخدم، عملية، فرع/مستودع، مبلغ، شاشة).
- `Decision` — نتيجة السماح/الرفض مع السبب/البعد.
- `AuthorizationService.invalidate` — إبطال الكاش عند تغير الصلاحيات.
- `AuthorizationService.scopeResolution` / `checkScope` / `checkWarehouseScope` — نطاق الفرع/المستودع.
- `AuthorizationService.createAmountApprovalRequest` / `checkAmountLimit` / `consumeApprovedAmountRequest` — حدود المبلغ والاعتمادات.
- `AuthorizationService.checkCentralPermissionLimits` / `checkScreen` / `checkSensitivity` — أبعاد أخرى.
- `AuthorizationService.evaluate` / `allows` / `require` — التقييم النهائي والفرض.
**ملاحظات:** هو الطبقة التي تجمع `PermissionChecker` و`BranchAccessService` و`EmployeeDepartmentAccessService` و`AuthorizationAdminService`؛ تستدعيه `PermissionService.require`/الخدمات قبل العمليات الحساسة.

**مجلد `src/services/domains/auth/AuthService/`:**

### `src/services/domains/auth/AuthService/accountSecurity.ts`
**الغرض:** أمن الحساب الشخصي: تغيير كلمة المرور، مفتاح الأمان، وإكمال الإعداد الأولي للمدير.
**الأعضاء الرئيسية:**
- `AuthServiceAccountSecurity.changeOwnPassword` / `changeOwnPasswordAsync` — تغيير كلمة مرور المستخدم الحالي.
- `AuthServiceAccountSecurity.setOwnSecurityKeyAsync` — تعيين مفتاح الأمان للحساب.
- `AuthServiceAccountSecurity.completeFirstRunAdminSetup` — إنهاء إعداد المدير الأول عند أول تشغيل.
**ملاحظات:** يرث `AuthServiceUserAdmin`؛ يستخدم `AuthServiceSession` و`passwordPolicy` و`twoFactorAuth` عند الحاجة.

### `src/services/domains/auth/AuthService/core.ts`
**الغرض:** الأساس المشترك لـ `AuthService`: المستخدم الحالي، المصادقة، التمثيل، التدقيق، واعتمادات العمليات.
**الأعضاء الرئيسية:**
- `AuthServiceCore.getCurrentUser` / `requireAuth` / `requireSetupAuth` / `setCurrentUser` — إدارة جلسة المستخدم.
- `AuthServiceCore.requireActor` — يعيد المستخدم الحالي بعد التحقق.
- `AuthServiceCore.prepareOperationApproval` — يجهز طلب اعتماد عملية.
- `AuthServiceCore.mapUser` — يحول صف المستخدم إلى كائن `User`.
- `AuthServiceCore.audit` — يكتب سجل تدقيق موحد.
**ملاحظات:** جذر سلسلة الوراثة؛ يستخدم `authSession` و`AuditService` و`OperationApprovalGate`.

### `src/services/domains/auth/AuthService/login.ts`
**الغرض:** تسجيل الدخول بكلمة المرور/PIN/مفتاح الأمان مع قفل المحاولات وإكمال 2FA.
**الأعضاء الرئيسية:**
- `AuthServiceLogin.getLoginGuardStatus` / `lockoutMessage` / `getLoginRecord` — حالة/رسائل قفل الدخول.
- `AuthServiceLogin.rejectInvalidPassword` — تسجيل/منع كلمة مرور خاطئة.
- `AuthServiceLogin.finishLogin` — إنهاء الجلسة بعد نجاح المصادقة.
- `AuthServiceLogin.loginByPin` / `loginBySecurityKey` / `pinLoginLabel` — بدائل دخول.
- `AuthServiceLogin.login` / `loginAsync` — تسجيل الدخول الرئيسي المتزامن/غير المتزامن.
**ملاحظات:** يرث `AuthServiceSession`؛ يستخدم `twoFactorAuth` و`LOGIN_LOCKOUT_WINDOW_MINUTES` و`SECURITY_KEY_LOGIN_GUARD_KEY`؛ يرمي `TwoFactorRequiredError` عند الحاجة.

### `src/services/domains/auth/AuthService/pins.ts`
**الغرض:** إدارة PINs الدخول: إنشاء/تشفير/تجزئة، طلبات التغيير، الاعتمادات، والاسترداد.
**الأعضاء الرئيسية:**
- `AuthServicePins.getOwnLoginPinStatus` / `requestOwnLoginPinChange` — حالة وطلب PIN للمستخدم الحالي.
- `AuthServicePins.getPendingLoginPinChanges` / `approveLoginPinChange` / `rejectLoginPinChange` — اعتماد تغييرات PIN.
- `AuthServicePins.getRecoverableLoginPins` / `regenerateAllLoginPinsForAdmin` — استرداد/إعادة توليد جماعية.
- `AuthServicePins.generateUniqueLoginPin` / `hashPin` / `encryptLoginPin` / `assertUniqueActivePin` / `requirePinChangeApprover` — أدوات داخلية/حماية.
**ملاحظات:** يرث `AuthServiceLogin`؛ يخزن PINs مشفرة/مجزأة ويفرض موافقة إدارية لتغييرها.

### `src/services/domains/auth/AuthService/session.ts`
**الغرض:** دورة الجلسة: بدء/لمس/إنهاء الجلسة، تسجيل الدخول، تبديل المستخدم، استعادة الجلسة، وسياسة كلمة المرور.
**الأعضاء الرئيسية:**
- `AuthServiceSession.deviceLabel` / `startSession` / `touchSession` / `endSession` / `getSessionId` / `logout` / `clearPersistedSession` — إدارة الجلسة.
- `AuthServiceSession.recordLogin` / `getLoginPinLength` / `getSwitchableUsers` / `switchToUser` / `restoreSession` — دخول/تبديل/استعادة.
- `AuthServiceSession.validatePasswordPolicy` / `assertSetupCompleted` — تحقق الإعداد.
**ملاحظات:** يرث `AuthServiceCore`؛ يخزن الجلسة في `sessionStorage`/`localStorage` عبر `SESSION_KEY`/`SESSION_ID_KEY` ويكتب سجل دخول.

### `src/services/domains/auth/AuthService/shared.ts`
**الغرض:** ثوابت وأخطاء مشتركة لسلسلة `AuthService`.
**الأعضاء الرئيسية:**
- `SESSION_KEY` / `SESSION_ID_KEY` — مفاتيح تخزين الجلسة.
- `LOGIN_LOCKOUT_WINDOW_MINUTES` — نافذة قفل الدخول 15 دقيقة.
- `SECURITY_KEY_LOGIN_GUARD_KEY` — مفتاح حارس مفتاح الأمان.
- `LoginGuardStatus` — نوع حالة حارس الدخول.
- `TwoFactorRequiredError` — خطأ يتطلب إدخال رمز 2FA.
**ملاحظات:** لا يحتوي منطق خدمة؛ يشارك الثوابت بين وحدات `AuthService/*` والواجهة العامة.

### `src/services/domains/auth/AuthService/userAdmin.ts`
**الغرض:** إدارة مستخدمي النظام: CRUD، إنشاء حساب مركزي، صلاحيات المستخدم، وسجل الدخول.
**الأعضاء الرئيسية:**
- `AuthServiceUserAdmin.getAllUsers` / `createUser` / `provisionCentralAccount` — قراءة/إنشاء/توفير مستخدمين.
- `AuthServiceUserAdmin.checkPermission` — فحص صلاحية المستخدم.
- `AuthServiceUserAdmin.getUserById` / `updateUser` / `resetPassword` / `deleteUser` — إدارة مستخدم.
- `AuthServiceUserAdmin.getLoginHistory` — سجل دخول المستخدم.
**ملاحظات:** يرث `AuthServicePins`؛ يستخدم `PermissionService` و`BranchAccessService` و`EmployeeDepartmentAccessService` و`passwordPolicy` و`twoFactorAuth`.

**مجلد `src/services/domains/auth/permissions/`:**

### `src/services/domains/auth/permissions/index.ts`
**الغرض:** نقطة إعادة تصدير لوحدة الصلاحيات.
**الأعضاء الرئيسية:**
- يعيد تصدير `types` و`catalog` و`permissionSeeder` و`rolePermissionService` و`userPermissionService` و`permissionChecker`.
**ملاحظات:** يسمح للاستيراد من `permissions/index` بدل الملفات المنفصلة.

### `src/services/domains/auth/permissions/permissionChecker.ts`
**الغرض:** فاحص الصلاحيات الفعلي مع كاش، حل الافتراضيات/قاعدة البيانات/التجاوزات، وربط الصفحات.
**الأعضاء الرئيسية:**
- `PermissionChecker.loadSets` / `getEffectiveCodes` — تحميل/حساب الرموز الفعالة.
- `PermissionChecker.can` / `evaluate` / `hasRoleGrant` / `canAny` — فحص الصلاحيات.
- `PermissionChecker.getPagePermission` / `canAccessPage` / `requirePage` — صلاحيات الصفحات.
- `PermissionChecker.require` / `requireAny` / `invalidate` — فرض/إبطال.
**ملاحظات:** يخزن الأدوار والتجاوزات مؤقتاً ويحترم `ROLE_DEFAULTS` و`PERMISSIONS` و`EMPLOYEE_PERMISSION_ALIASES`؛ يكتب audit عند الرفض.

### `src/services/domains/auth/permissions/permissionSeeder.ts`
**الغرض:** يزرع كتالوج الصلاحيات والأدوار الافتراضية ويشغّل عمليات backfill للهجرات.
**الأعضاء الرئيسية:**
- `PermissionSeeder.seed` — نقطة الزرع الرئيسية.
- `PermissionSeeder.seedScreenPermissions` / `seedPermissionCatalog` / `seedBuiltInRoles` / `seedRoleDefaults` — مزامنة الكتالوج والأدوار.
- `PermissionSeeder.reconcileSeededRole` / `backfillGranularPermissions` / `backfillAllRolesGranular` / `backfillPartnerPermissions` / `backfillReceivablesPermissions` / `backfillPermissionMappings` / `backfillSensitivityViewPermissions` / `backfillExportPermissions` / `ensureAdminDataPermissions` / `backfillRecruitmentPermissions` / `backfillInventoryCountApproval` / `reconcileManagerPermissions` — عمليات تحديث/تصحيح دورية.
**ملاحظات:** يستخدم `catalog.ts` و`roleDefaults.ts` و`DatabaseManager`؛ يستدعيه `PermissionService.seed` عند الإقلاع/الترقية.

### `src/services/domains/auth/permissions/rolePermissionService.ts`
**الغرض:** إدارة أدوار الصلاحيات وتعيين رموز الصلاحيات لكل دور.
**الأعضاء الرئيسية:**
- `RolePermissionService.getRoles` — يسرد الأدوار.
- `RolePermissionService.getRolePermissions` / `setRolePermissions` — قراءة/تعيين صلاحيات دور.
- `RolePermissionService.createRole` / `updateRole` / `deleteRole` — CRUD الأدوار.
- `RolePermissionService.audit` — تدقيق تغييرات الأدوار.
**ملاحظات:** يستخدم `DatabaseManager` و`AuthService` و`PermissionService` للتحقق؛ يخدم شاشات إدارة الصلاحيات.

### `src/services/domains/auth/permissions/types.ts`
**الغرض:** أنواع نظام الصلاحيات.
**الأعضاء الرئيسية:**
- `PermissionDef` — تعريف صلاحية (الرمز، الوصف، الشاشة، الوحدة، الأثر).
- `PermissionEffect` — `GRANT` أو `DENY`.
**ملاحظات:** مشتركة بين الكتالوج والخدمات؛ لا منطق.

### `src/services/domains/auth/permissions/userPermissionService.ts`
**الغرض:** إدارة تجاوزات صلاحيات المستخدم على مستوى القاعدة.
**الأعضاء الرئيسية:**
- `UserPermissionService.getUserOverrides` — قراءة تجاوزات مستخدم.
- `UserPermissionService.setUserOverride` — تعيين/تحديث تجاوز.
- `UserPermissionService.clearUserOverrides` — مسح تجاوزات مستخدم.
- `UserPermissionService.audit` — تدقيق التغييرات.
**ملاحظات:** يخزن في `user_permission_overrides`؛ يدمجه `PermissionChecker.getEffectiveCodes` مع أدوار المستخدم.

### `src/services/domains/auth/permissions/catalog.ts`
**الغرض:** واجهة إعادة تصدير لثوابت كتالوج الصلاحيات.
**الأعضاء الرئيسية:**
- يعيد تصدير `PERMISSIONS` و`BASE_PERMISSIONS` و`EMPLOYEE_PERMISSION_ALIASES` و`ALL` و`MANAGER_RESTRICTED` و`ROLE_DEFAULTS` و`EXPORT_PERMISSION_SOURCES` و`RECEIVABLE_PERMISSION_BACKFILL` و`PERMISSION_BACKFILL_SOURCES` و`ROLE_NAMES`.
**ملاحظات:** يحافظ على المسار القديم `permissions/catalog` بينما البيانات الفعلية في `permissions/catalog/*`.

### `src/services/domains/auth/permissions/authorizationAdminService.ts`
**الغرض:** إدارة صلاحيات التفويض المتقدمة: حدود المبالغ ومنح المستودعات.
**الأعضاء الرئيسية:**
- `AmountLimit` — حد مبلغ لصلاحية/عملية.
- `WarehouseGrant` — منح مستودع لمستخدم/دور.
- `AuthorizationAdminService.listAmountLimits` / `upsertAmountLimit` / `deleteAmountLimit` — إدارة حدود المبالغ.
- `AuthorizationAdminService.listWarehouseGrants` / `setWarehouseGrants` — إدارة منح المستودعات.
- `AuthorizationAdminService.listWarehouses` — قائمة مستودعات متاحة للإدارة.
**ملاحظات:** يستخدمها `AuthorizationService` عند تقييم `amount` و`scope`؛ تتطلب صلاحية إدارة الصلاحيات وتكتب audit.

**مجلد `src/services/domains/auth/permissions/catalog/`:**

### `src/services/domains/auth/permissions/catalog/adminPermissions.ts`
**الغرض:** ثوابت صلاحيات الإدارة/النظام.
**الأعضاء الرئيسية:**
- `ADMIN_PERMISSIONS` — قائمة `PermissionDef[]` لصلاحيات الإدارة.
**ملاحظات:** تدخل في `PERMISSIONS` عبر `permissions/catalog/permissions.ts`؛ تغطي إعدادات/مستخدمين/صلاحيات/أمان.

### `src/services/domains/auth/permissions/catalog/aliases.ts`
**الغرض:** أسماء مستعارة لصلاحيات الموظفين لتوافق الشاشات القديمة.
**الأعضاء الرئيسية:**
- `EMPLOYEE_PERMISSION_ALIASES` — خريطة رموز قديمة إلى رموز جديدة.
**ملاحظات:** يستخدمها `PermissionChecker`/`PermissionSeeder` عند حل الرموز القديمة.

### `src/services/domains/auth/permissions/catalog/basePermissions.ts`
**الغرض:** الصلاحيات الأساسية العامة.
**الأعضاء الرئيسية:**
- `BASE_PERMISSIONS` — قائمة `PermissionDef[]` الأساسية.
**ملاحظات:** جزء من تجميع `PERMISSIONS`؛ غالباً صلاحيات العرض/الوصول العامة.

### `src/services/domains/auth/permissions/catalog/businessPermissions.ts`
**الغرض:** صلاحيات الوحدات التجارية (مبيعات، مخزون، مالية، إلخ).
**الأعضاء الرئيسية:**
- `BUSINESS_PERMISSIONS` — قائمة `PermissionDef[]` للأعمال.
**ملاحظات:** أكبر مساهم في `PERMISSIONS`؛ يصف `ui.sales.*` و`ui.inventory.*` و`ui.finance.*` وغيرها.

### `src/services/domains/auth/permissions/catalog/granularPermissions.ts`
**الغرض:** صلاحيات دقيقة على مستوى الصفحات/الإجراءات.
**الأعضاء الرئيسية:**
- `GRANULAR_PAGE_PERMISSIONS` — قائمة `PermissionDef[]` للحبيبات الدقيقة.
**ملاحظات:** تستخدمها `PermissionChecker.getPagePermission` و`canAccessPage`؛ تزرع عبر `PermissionSeeder.seedScreenPermissions`.

### `src/services/domains/auth/permissions/catalog/permissions.ts`
**الغرض:** الكتالوج الموحد لكل الصلاحيات.
**الأعضاء الرئيسية:**
- `PERMISSIONS` — تجميع `BASE_PERMISSIONS` و`BUSINESS_PERMISSIONS` و`ADMIN_PERMISSIONS` و`GRANULAR_PAGE_PERMISSIONS`.
**ملاحظات:** هو المصدر الرئيسي الذي يقرأه `PermissionChecker` و`PermissionService.getCatalog` و`PermissionSeeder`.

### `src/services/domains/auth/permissions/catalog/roleDefaults.ts`
**الغرض:** افتراضيات الأدوار ومصادر الصلاحيات للزرع والـ backfill.
**الأعضاء الرئيسية:**
- `ALL` — كل رموز الصلاحيات.
- `MANAGER_RESTRICTED` — مجموعة صلاحيات مقيّدة للمدير.
- `ROLE_DEFAULTS` — خريطة الدور إلى رموز الصلاحيات الافتراضية.
- `EXPORT_PERMISSION_SOURCES` — مصادر صلاحيات التصدير.
- `RECEIVABLE_PERMISSION_BACKFILL` — صلاحيات الذمم القابلة للاستكمال.
- `PERMISSION_BACKFILL_SOURCES` — مصادر backfill عامة.
- `ROLE_NAMES` — أسماء الأدوار بالعربية.
**ملاحظات:** يستخدمها `PermissionSeeder` و`RolePermissionService` و`PermissionChecker` لحل الافتراضيات عند غياب تعيين صريح.

---

**ملاحظة:** لم يتم تعديل أي ملف تحت `src/`؛ هذا المستند يصف البنية الحالية فقط.

الملفات الاختبارية: لم يتم العثور على `*.test.ts` أو `*.spec.ts` ضمن `src/services/domains/sales/` أو `src/services/domains/auth/`.

العدد الكلي للملفات الموثقة: 75 ملفاً (41 مبيعات + 34 مصادقة).

التحقق من الدقة: تم استخراج الصادرات من الملفات الفعلية عبر فحص `export` وقراءة الواجهات/الكلاسات/الدوال الرئيسية؛ لا تعتمد الأوصاف على أسماء الملفات فقط.

الاعتماديات الخارجية داخل النطاق: تستدعي خدمات المبيعات `AuthService` و`PermissionService` و`BranchAccessService` و`EmployeeDepartmentAccessService` و`AuthorizationService` عند الحاجة؛ وتستدعي المصادقة خدمات المبيعات فقط في حالات محدودة مثل `WarrantyClaimService` عبر `SalesService` وليس العكس في `AuthService`.

ملاحظة تشغيلية: بعض الخدمات تستخدم `DatabaseManager.executeTransaction(..., { immediatePersist: true })` أو `executeFinancialTransaction` للعمليات المالية/المخزنية، و`unscaleMoneyRow`/`maskSensitiveFields` للتعامل مع القيم بالوحدات الصغرى وإخفاء الحقول الحساسة.

انتهى التوثيق.
