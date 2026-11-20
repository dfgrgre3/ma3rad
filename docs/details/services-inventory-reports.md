# توثيق طبقة الخدمات — المخزون / الجرد / التقارير

> النطاق: `src/services/domains/inventory/` و `src/services/domains/inventory-count/` و `src/services/domains/reports/`.
> جميع الخدمات تقرأ/تكتب قاعدة البيانات مباشرة عبر `DatabaseManager` وتفرض الصلاحيات عبر `PermissionService` و`AuthService`، وتدعم تقييد الفروع عبر `BranchAccessService`.

---

## أولاً: المخزون — `src/services/domains/inventory/`

### خدمة المخزون الرئيسية (سلسلة الأصناف — Inheritance Chain)

سلسلة الوراثة: `InventoryServicePart01 → Part02 → Part03 → Part04 → InventoryWarehouseLocationService → Part05 → Part06 → Part07 → Part08 → Part09 → Part10 → Part11 → Part12 → Part13 → Part14 → InventoryService`.

### `src/services/domains/inventory/InventoryService.ts`
- **الغرض:** الصنف الواجه العام لخدمة المخزون؛ يرث كل قدرات الأجزاء الـ14.
- **الأعضاء الرئيسية:** `class InventoryService extends InventoryServicePart14 {}` — لا منطق خاص.
- **ملاحظات:** نقطة الدخول التي تُستورد عادةً في بقية النظام.

### `src/services/domains/inventory/InventoryServicePart01.ts`
- **الغرض:** الأساس في السلسلة؛ يعرّف `db` و`branchAccess` وأدوات مشتركة، وعمليات الاستعلام عن المستودعات والمخزون.
- **الأعضاء الرئيسية:**
  - `assertInventoryModuleEnabled()` — يتأكد من تفعيل وحدة المخزون.
  - `getUnitLabel()` — تسمية وحدة القياس للمنتج.
  - `getAllWarehouses()` / `getWarehouseStock()` / `getInactiveWarehouseStock()` — جلب المستودعات وأرصدة المخزون (نشطة/غير نشطة).
  - `getWarehouseStockAsync()` / `getInactiveWarehouseStockAsync()` — نسخ async من الاستعلام.
  - `getProductStock()` — رصيد منتج داخل مستودع.
  - دوال بناء الاستعلام والـ mapping: `buildWarehousesQuery`، `buildWarehouseStockQuery`، `buildProductStockQuery`، `mapWarehouseStockRows`، `queryWarehouseStock`، `mapProductStockRow`.
- **ملاحظات:** تحتوي أنواع `WarehouseStockView` و`WarehouseStock`.

### `src/services/domains/inventory/InventoryServicePart02.ts`
- **الغرض:** حلقة فارغة في السلسلة (Placeholder) لأغراض تقسيم الملف.
- **الأعضاء الرئيسية:** `class InventoryServicePart02 extends InventoryServicePart01 {}`.
- **ملاحظات:** لا منطق خاص.

### `src/services/domains/inventory/InventoryServicePart03.ts`
- **الغرض:** سجل حركات المخزون (inventory_transactions).
- **الأعضاء الرئيسية:**
  - `getTransactions(limit = 100)` — آخر حركات المخزون مع تصفية حسب صلاحيات الفرع عبر `buildTransactionsQuery`.
- **ملاحظات:** —

### `src/services/domains/inventory/InventoryServicePart04.ts`
- **الغرض:** تقارير التحويلات بين المستودعات.
- **الأعضاء الرئيسية:**
  - `getTransfersList()` — قائمة طلبات التحويل بتفاصيلها.
  - `getTransferSummaryByWarehouse()` — ملخص إجمالي الداخل/الخارج لكل مستودع من حركات `TRANSFER_IN`/`TRANSFER_OUT`.
- **ملاحظات:** —

### `src/services/domains/inventory/InventoryWarehouseLocationService.ts`
- **الغرض:** إدارة المواقع/الأرفف داخل المستودع (`warehouse_locations`) ونقل المخزون بينها. يربط نفسه في السلسلة بين Part04 وPart05.
- **الأعضاء الرئيسية:**
  - `getWarehouseLocations(warehouseId?, search?)` — قائمة المواقع.
  - `createWarehouseLocation(input)` — إنشاء موقع مع تحقق من السعة والشركة.
  - `updateWarehouseLocation(id, input)` — تعديل موقع.
  - `transferStockBetweenLocations(input)` — نقل مخزون بين موقعين.
  - `deleteWarehouseLocation(id)` — حذف موقع.
  - `getLocationOccupiedM2()` — المساحة المشغولة لموقع.
- **ملاحظات:** يرث من `InventoryServicePart04`؛ `InventoryServicePart05` يرث منه، أي أنه جزء من السلسلة رغم أن اسمه "خدمة مستقلة".

### `src/services/domains/inventory/InventoryServicePart05.ts`
- **الغرض:** تخصيص المنتجات على مواقع المستودع والمخزون الخاص (مخزون تالف/معرض/محجوز).
- **الأعضاء الرئيسية:**
  - `assignProductLocation(locationId, productId, quantityM2)` — إسناد كمية منتج لموقع مع تحقق من رصيد المستودع وسعة الموقع.
  - `getLocationProducts(locationId)` — المنتجات المسكنة في موقع.
  - `getSpecialStocks(filters)` — قائمة المخزون الخاص (تالف، مكسور، عينة عرض، مرتجع غير قابل للبيع، حجر صحي).
- **ملاحظات:** يرث من `InventoryWarehouseLocationService`؛ يستخدم `branchAccess`.

### `src/services/domains/inventory/InventoryServicePart06.ts`
- **الغرض:** تسجيل وفحص المخزون الخاص.
- **الأعضاء الرئيسية:**
  - `recordSpecialStock(input)` — عزل كمية من المخزون إلى فئة خاصة (DAMAGED/BROKEN/DISPLAY_SAMPLE/…) مع استهلاك FIFO.
  - `inspectSpecialStock(...)` — تسجيل نتيجة فحص سجل خاص بعد تسجيله وقبل القرار.
- **ملاحظات:** يستدعي `InventoryCostingService.consumeFifo` و`InventoryLocationStockService`.

### `src/services/domains/inventory/InventoryServicePart07.ts`
- **الغرض:** معالجة المخزون الخاص بعد الفحص (قرار/تسعير/مخزون مخفض).
- **الأعضاء الرئيسية:**
  - `resolveSpecialStock(...)` — اعتماد قرار بشأن المخزون الخاص.
  - `setSpecialStockSalePrice(...)` — تسعير بيع للمخزون الخاص.
  - `getDiscountedSaleStocks(...)` — المخزون المعروض بسعر مخفض.
  - `getTransfersWithDetails()` — تحويلات مع تفاصيلها.
- **ملاحظات:** —

### `src/services/domains/inventory/InventoryServicePart08.ts`
- **الغرض:** إنشاء واعتماد وتجهيز طلبات التحويل بين المستودعات.
- **الأعضاء الرئيسية:**
  - `getTransferItems(transferId)` — أصناف طلب تحويل.
  - `getTransferBatchAllocations(transferId)` — تخصيصات الدفعات (batches) لطلب التحويل.
  - `createTransferRequest(...)` — إنشاء طلب تحويل.
  - `approveTransfer(...)` — اعتماد الطلب.
  - `prepareTransfer(...)` — تجهيزه للشحن.
  - `requireTransferWarehouseAuthorization(...)` — تحقق صلاحيات المستودع المصدر/الوجهة.
- **ملاحظات:** —

### `src/services/domains/inventory/InventoryServicePart09.ts`
- **الغرض:** ملف إعادة تصدير فقط؛ التنفيذ في `InventoryServicePart09_part01.ts`.
- **الأعضاء الرئيسية:** `export { InventoryServicePart09 } from './InventoryServicePart09_part01'`.
- **ملاحظات:** —

### `src/services/domains/inventory/InventoryServicePart09_part01.ts`
- **الغرض:** إرسال/شحن التحويل المعتمد (dispatch) مع حجز الكميات والدفعات.
- **الأعضاء الرئيسية:**
  - `dispatchTransfer(...)` — تنفيذ الشحن داخل معاملة، مع idempotency عبر `InventoryTransferTrackingService` واستهلاك FIFO.
- **ملاحظات:** يعتمد على `InventoryTransferTrackingService.findOperation/recordOperation` لمنع التكرار.

### `src/services/domains/inventory/InventoryServicePart10.ts`
- **الغرض:** استلام التحويلات (جزئي/كامل) مع تسجيل الفروقات والخسائر.
- **الأعضاء الرئيسية:**
  - `receiveTransfer(...)` — تسجيل استلام كميات محولة.
  - `processTransferReceipts` / `processTransferReceipt` — معالجة تفاصيل الاستلام.
  - `recordTransferReceipt` / `recordTransferLoss` — تسجيل الاستلام والخسارة في القيود.
  - `updateTransferReceiptStatus(...)` — تحديث حالة الاستلام.
- **ملاحظات:** يستدعي `postLedgerEntry` لإثبات قيود الخسائر.

### `src/services/domains/inventory/InventoryServicePart11.ts`
- **الغرض:** رفض التحويلات.
- **الأعضاء الرئيسية:** `rejectTransfer(transferId, ...)` — رفض تحويل وإرجاع الكميات المرسلة من المستودع العابر (transit) إلى المصدر.
- **ملاحظات:** يستخدم `InventoryTransferTrackingService.revertBatches`.

### `src/services/domains/inventory/InventoryServicePart12.ts`
- **الغرض:** تخطيط إعادة الطلب (Reorder Planning) ومعاملات التخطيط لكل منتج.
- **الأعضاء الرئيسية:**
  - `getReorderPlanning(...)` — تحليل مخزون/products مع min/max/reorder/safety stock والطلب المتوقع لتحديد منتجات تحتاج طلباً.
  - `updateProductPlanningParameters(...)` — تحديث معاملات التخطيط (`pwp`) للمنتج.
- **ملاحظات:** —

### `src/services/domains/inventory/InventoryServicePart13.ts`
- **الغرض:** مطابقة المخزون مع دفتر الأستاذ العام (GL) وسجل المطابقات.
- **الأعضاء الرئيسية:**
  - `reconcileInventoryWithGL(warehouseId?)` — حساب فروقات المخزون مقابل GL.
  - `saveReconciliationLog(input)` / `getReconciliationLogs()` — حفظ وعرض سجلات المطابقة.
  - `calculateInventoryReconciliation(...)` — الحساب الداخلي.
- **ملاحظات:** —

### `src/services/domains/inventory/InventoryServicePart14.ts`
- **الغرض:** الذروة في السلسلة: تحويلات مباشرة، تسويات المخزون، ونظام اعتمادات التسويات.
- **الأعضاء الرئيسية:**
  - `transferStock(...)` / `transferWarehouseStock(...)` / `requestWarehouseStockTransfer(...)` — تحويل مخزون مباشر أو عبر طلب.
  - `createAdjustment(input)` — إنشاء قيد تسوية مخزون.
  - `approveAdjustment` / `postAdjustment` / `approveAndPostAdjustmentInTransaction` — دورة اعتماد وترحيل التسوية.
  - `adjustStock(...)` — تسوية سريعة.
  - دوال داخلية: `postAdjustmentInTransaction`, `getAdjustmentProduct`, `getAdjustmentHeader`, `validateAdjustmentStock`, `applyPostedAdjustmentStock`, `recordPostedAdjustmentAudit`.
  - `registerApprovalEffect` / `registerApprovalRejectionEffect` — تسجيل تأثيرات الاعتماد/الرفض.
- **ملاحظات:** —

### `src/services/domains/inventory/InventoryCostingService.ts`
- **الغرض:** طبقات التكلفة FIFO/متوسط التكلفة على مستوى المستودع (`inventory_cost_layers`).
- **الأعضاء الرئيسية (كلها static على `class InventoryCostingService`):**
  - `costingMethod(db)` — طريقة التكلفة المفعّلة.
  - `addLayer(db, input)` — إضافة طبقة تكلفة.
  - `planFifo(db, productId, warehouseId, qty)` — حساب خطة استهلاك FIFO.
  - `consumeFifo(db, txId, plan, invoiceItemId?)` — استهلاك الطبقات لحركة صرف.
  - `restoreIssue` / `previewRestoreCost` / `restoreInvoiceIssue` — استرجاع التكلفة عند إرجاع/إلغاء.
  - `getSourceLayerPlan` / `consumeSpecific` — استهلاك من مصدر محدد.
  - `moveLayers` / `transferLayers` / `removeUnusedSource` — نقل/تنظيف الطبقات عند التحويلات.
- **ملاحظات:** النوع `FifoCostPlan`. يستخدمه `InventoryCostingPolicyService` لقراءة الطريقة و`countSessionService` لتسويات الجرد.

### `src/services/domains/inventory/InventoryCostingPolicyService.ts`
- **الغرض:** سياسة التكلفة على مستوى الشركة (FIFO أو AVERAGE_COST).
- **الأعضاء الرئيسية:**
  - `getCostingMethod()` / `setCostingMethod(method, updatedBy)` — قراءة/تعيين طريقة التكلفة.
  - أنواع: `ProductGradeOption`, `SlowMovingAnalysis`, `ProfitMarginAlert`, `InventoryValuation`.
- **ملاحظات:** الأنواع المُصدّرة قد تُستخدم في تقارير/واجهات أخرى رغم أن الدوال الفعلية الوحيدة هي الطريقتان.

### `src/services/domains/inventory/InventoryIntelligenceService.ts`
- **الغرض:** ذكاء تحليلي للمخزون: توفر الدفعات، اقتراحات نقل، تنبيهات هامش منخفض، مخزون ميت، وتحليل فروقات الجرد.
- **الأعضاء الرئيسية:**
  - `getBatchAvailability(filter)` — توفر المخزون حسب الدفعات/المواقع.
  - `suggestTransfers(filter)` — اقتراحات نقل بين المستودعات بناءً على فائض/عجز.
  - `getLowMarginAlerts(filter)` — أصناف بهامش ربح منخفض.
  - `getDeadStock(filter)` — مخزون ميت (بلا حركة).
  - `getCountVarianceAnalysis(filter)` — تحليل فروقات جلسات الجرد.
  - أنواع: `BatchLocationInfo`, `BatchAvailabilityGroup`, `TransferSuggestion`, `LowMarginAlert`, `DeadStockRow`, `CountVarianceRow`, `CountVarianceAnalysis`.
- **ملاحظات:** يطبق `warehouseScope` لتقييد الفروع؛ `requireView` للتحقق من الصلاحية.

### `src/services/domains/inventory/InventoryLocationStockService.ts`
- **الغرض:** حركات المخزون على مستوى المواقع/الأرفف (`product_location_stock`) — static helpers تُستدعى داخل معاملات.
- **الأعضاء الرئيسية:**
  - `receive(db, input)` / `release(db, input)` — استلام/إخراج كميات من المواقع.
  - `transferBetweenBins(db, input)` — نقل بين خانتين.
  - `adjustBin(db, input)` — تسوية خانة.
  - `applyDelta(db, input, mode)` — تطبيق فرق كمية على المواقع.
  - خاصة: `bins`, `assign`, `releaseFromBins`, `logMovement`.
- **ملاحظات:** تعمل على `txDb` داخل `executeFinancialTransaction`؛ تُستخدم من `countSessionService_part03/04/05` وأجزاء InventoryService.

### `src/services/domains/inventory/InventoryReceiptService.ts`
- **الغرض:** ترحيل استلام مخزون (إدخال رصيد) داخل معاملة.
- **الأعضاء الرئيسية:**
  - `post(db, input: InventoryReceiptPostingInput)` — ينشئ حركة `RECEIPT` ويحدث `warehouse_stock` ويرجع المعرف.
  - النوع `InventoryReceiptPostingInput`.
- **ملاحظات:** —

### `src/services/domains/inventory/InventoryTransferTrackingService.ts`
- **الغرض:** تتبع عمليات التحويل idempotent-ياً: المستودع العابر (transit)، الدفعات المصروفة/المستلمة، وسجلات العمليات.
- **الأعضاء الرئيسية (كلها static):**
  - `changedRows` — عدد الصفوف المتأثرة.
  - `assertSameCompany` / `resolveTransitWarehouse` — التحقق من الشركة وتهيئة مستودع العبور.
  - `ensureWarehouseStock` — ضمان وجود سجل `warehouse_stock`.
  - `findOperation` / `recordOperation` — منع تكرار عمليات الشحن/الاستلام.
  - `findReceiptByKey` / `createReceipt` / `finalizeReceipt` — استلامات التحويل.
  - `dispatchBatches` / `receiveBatches` / `revertBatches` — نقل تخصيصات الدفعات بين المستودعات أو إرجاعها.
  - خاصة: `consumeTransitBatch`, `findOrCreateBatch`.
- **ملاحظات:** شريك أساسي لـ Part09/10/11؛ يعتمد على `stock_transfers.transit_warehouse_id`.

### `src/services/domains/inventory/InventoryValuationService.ts`
- **الغرض:** ملف تجميع/إعادة تصدير فقط (Facade) لتقييم المخزون.
- **الأعضاء الرئيسية:** يعيد تصدير `WarehouseValuation`, `InventoryKpi`, `InventoryKpiPermission` من `InventoryValuationService_part01` و`InventoryValuationService` من `part02`.
- **ملاحظات:** نقطة الاستيراد المفضلة للكود الخارجي.

### `src/services/domains/inventory/InventoryValuationService_part01.ts`
- **الغرض:** أنواع تقييم المخزون.
- **الأعضاء الرئيسية:** `interface WarehouseValuation`, `interface InventoryKpi`, `type InventoryKpiPermission` (`'ui.inventory.valuation.view' | 'ui.reports.inventory.view'`).
- **ملاحظات:** —

### `src/services/domains/inventory/InventoryValuationService_part02.ts`
- **الغرض:** حساب تقييم المخزون ومؤشرات KPI لكل مستودع.
- **الأعضاء الرئيسية:**
  - `getByWarehouse()` — تقييم المخزون لكل مستودع حسب طريقة FIFO/متوسط.
  - `getKpi(requiredPermission)` — مؤشرات المخزون (قيمة، رصيد، …) مع فرض صلاحية.
  - `valuePlan()` — بناء خطة تقييم حسب طريقة التكلفة.
- **ملاحظات:** يستدعيه `reports/InventoryReportService.loadInventoryKpi`.

### `src/services/domains/inventory/BatchService.ts`
- **الغرض:** إدارة دفعات المنتجات (product_batches) والتأكد من عدم خلط الدرجات (tone mixing).
- **الأعضاء الرئيسية:**
  - `getBatchesForProduct`, `getBatchById`, `getTotalRemainingM2` — استعلامات الدفعات.
  - `createBatch`, `updateBatch`, `deleteBatch` — CRUD للدفعات.
  - `checkToneMixing` — التحقق من خلط الدرجات.
  - `deductFromBatches` — استهلاك من الدفعات.
  - `restoreForSaleReturn` / `restoreForInvoiceVoid` — استرجاع كميات للدفعات عند إرجاع/إلغاء فاتورة.
  - `CreateBatchDTO`, `ProductBatch`, `ToneMixingConflict`.
- **ملاحظات:** `requireWrite(manageCost)` يفرض صلاحيات الكتابة والتكلفة.

### `src/services/domains/inventory/ExpiryService.ts`
- **الغرض:** إدارة تواريخ انتهاء الصلاحية (expiry lots) وسياسة FEFO وتتبع المنتجات المنتهية.
- **الأعضاء الرئيسية:**
  - `getLots(filters)` / `createLot` / `consumeLot` / `deleteLot` — إدارة دفعات الصلاحية.
  - `getExpiryTrackedProducts` / `setExpiryTracking` — تفعيل تتبع الصلاحية لكل منتج.
  - `getExpiredQuantity` / `getNonExpiredLotQuantity` — حساب كميات منتهية/صالحة.
  - `assertNotExpired` — منع صرف كمية منتهية (مع override).
  - `getFefoLots` — دفعات بترتيب أول انتهاء أولاً.
  - `getDashboardStats` — إحصائيات لوحة الصلاحية.
  - أنواع: `ExpiryLot`, `ExpiryProductFlag`.
- **ملاحظات:** —

### `src/services/domains/inventory/StockBalanceAuditService.ts`
- **الغرض:** تدقيق تطابق أرصدة المخزون (warehouse_stock مقابل حركات المخزون والمواقع).
- **الأعضاء الرئيسية:**
  - `runAudit(options)` — تشغيل تدقيق شامل وإرجاع `StockBalanceAuditReport`.
  - أنواع: `StockAuditCheckKey`, `StockAuditStatus`, `StockAuditCheck`, `StockBalanceAuditRow`, `StockBalanceAuditReport`.
  - مثيل جاهز: `export const stockBalanceAuditService`.
- **ملاحظات:** —

### `src/services/domains/inventory/StockLedgerMovementPolicy.ts`
- **الغرض:** المصدر الوحيد لحقيقة حسابات دفتر المخزون — مخرجات SQL fragments لضمان معالجة `TRANSFER_LOSS` باتساق (لا يُخصم مرتين من المصدر، لكن يُخصم من العبور).
- **الأعضاء الرئيسية:**
  - `getStockLedgerBalanceSql(alias)` — الرصيد الموقّع لكل حركة.
  - `getStockLedgerQtyInSql` / `getStockLedgerQtyOutSql` / `getStockLedgerTotalOutSql` / `getStockLedgerQtyLossSql` — شظايا كميات الداخل/الخارج/الخسائر.
  - `class StockLedgerMovementPolicy` — getters ثابتة (`balanceSql`, `qtyInSql`, `qtyOutSql`, `totalOutSql`, `qtyLossSql`) باسم alias `it`.
- **ملاحظات:** يُستخدم في الاستعلامات التقريرية و`InventoryServicePart04` وغيرها لتجنب تكرار المنطق.

### `src/services/domains/inventory/StockTrackedProductPolicy.ts`
- **الغرض:** تحديد ما إذا كان المنتج "قابل لتتبع المخزون" (غير خدمي) وفرض ذلك.
- **الأعضاء الرئيسية (static):**
  - `isStockTracked(product)` — هل المنتج متتبع للمخزون.
  - `assertStockTracked(product, context)` — رمي خطأ إن لم يكن كذلك.
  - `assertStockTrackedBatch(db, productIds, context)` — التحقق لدفعة منتجات.
- **ملاحظات:** يستخدمه `countSessionService_part01` عند بدء الجرد.

---

## ثانياً: الجرد — `src/services/domains/inventory-count/`

> تطبيق دالة-محور (لا كلاس): كل ملف `_part0X` يصدّر دوال مستقلة، والملف الرئيسي `countSessionService.ts` يعيد تجميعها. أنواع الجلسة في `src/types/inventory/countSessions`.

### `src/services/domains/inventory-count/branchAccess.ts`
- **الغرض:** مثيل مشترك من `BranchAccessService` لتحقق نطاق الفروع في عمليات الجرد.
- **الأعضاء الرئيسية:** `export const branchAccess`.
- **ملاحظات:** يُستورد في كل ملفات `countSessionService_part0X`.

### `src/services/domains/inventory-count/countSessionService.ts`
- **الغرض:** واجهة عامة لنظام الجرد — يستورد كل الأجزاء ويعيد تصدير الدوال العامة.
- **الأعضاء الرئيسية:**
  - يعيد تصدير: `startCountSession` + `StartCountSessionInput` (part01)، `saveCountDraft` (part02)، `submitCountSession` (part05)، `approveCountSession`/`rejectCountSession` (part06)، `cancelCountSession` (part07).
- **ملاحظات:** نقطة الاستيراد المفضلة للواجهة.

### `src/services/domains/inventory-count/countSessionData.ts`
- **الغرض:** طبقة قراءة بيانات الجرد لواجهة المستخدم.
- **الأعضاء الرئيسية:**
  - `loadBranchCountSessions()` — جلسات الجرد لنطاق فرع المستخدم.
  - `loadCountWarehouses()` — المستودعات المتاحة للجرد.
  - `loadCountProducts(warehouseId)` — المنتجات القابلة للجرد في مستودع.
  - `loadCountSessionItems(session)` — أصناف جلسة معينة.
- **ملاحظات:** استعلامات خام مع `COALESCE` للافتراضيات العربية.

### `src/services/domains/inventory-count/countSessionService_part01.ts`
- **الغرض:** بدء جلسة جرد جديدة (إنشاء `stock_counts` + `stock_count_items`).
- **الأعضاء الرئيسية:**
  - `StartCountSessionInput` — warehouseId, countType, selectedProductIds, isBlindCount, notes, locationId؟.
  - `startCountSession(input)` — يتحقق من نوع الجرد (FULL/PARTIAL/SPOT/PERIODIC/SURPRISE/BLIND)، الموقع، وتتبع المخزون، ثم ينشئ الجلسة بحالة COUNTING داخل معاملة.
- **ملاحظات:** يدعم جرد خانة (locationId) ويستخدم `StockTrackedProductPolicy`.

### `src/services/domains/inventory-count/countSessionService_part02.ts`
- **الغرض:** حفظ مسودة العدّاد + أدوات مساعدة للتحقق.
- **الأعضاء الرئيسية:**
  - `saveCountDraft(activeSession, sessionItems)` — تحديث كميات العدّ الفعلية والفروقات لكل صنف.
  - `getCountStockInfo(txDb, item, warehouseId)` — معلومات مخزون الصنف (محجوز، وحدات).
  - `validateCountItemMembership` / `validateCountedQuantity` — تحققات داخلية.
  - أنواع: `CountStockInfo`, `CountVarianceTotals`.
- **ملاحظات:** —

### `src/services/domains/inventory-count/countSessionService_part03.ts`
- **الغرض:** تحديثات المخزون الخام أثناء ترحيل فروقات الجرد.
- **الأعضاء الرئيسية:**
  - `updateCountItem(txDb, item, actorId, countId)` — تحديث صف الصنف المعدود.
  - `updateWarehouseStock(txDb, item, warehouseId, actorId, delta)` — تحديث/إنشاء `warehouse_stock` وتطبيق الفرق على المواقع عبر `InventoryLocationStockService.applyDelta`.
- **ملاحظات:** تُستدعى من part04/05 داخل المعاملة.

### `src/services/domains/inventory-count/countSessionService_part04.ts`
- **الغرض:** ترحيل فرق صنف واحد من الجرد: تحديث المخزون + حركة `inventory_transactions` + طبقات FIFO + قيد GL.
- **الأعضاء الرئيسية:**
  - `postCountVariance(txDb, activeSession, item, actorId, warehouseId, stockInfo)` — ينشئ `ADJUSTMENT_ADD/SUB` بنوع مرجعي `STOCK_COUNT` ويقيد `1104`/`5201` عبر `postLedgerEntry`، مع دعم FIFO (`planFifo`/`consumeFifo`/`addLayer`).
- **ملاحظات:** —

### `src/services/domains/inventory-count/countSessionService_part05.ts`
- **الغرض:** إرسال/اعتماد مبدئي لنتائج الجرد (REVIEW) وترحيل كل الفروقات.
- **الأعضاء الرئيسية:**
  - `postCountItems(txDb, activeSession, items, actorId, warehouseId)` — يمر على كل الأصناف ذات الفروقات ويستدعي `postCountVariance`، ويعيد إحصائيات الفروقات.
  - `submitCountSession(activeSession, sessionItems)` — حفظ العدّ النهائي ثم ترحيل الفروقات وتحديث حالة الجلسة إلى REVIEW داخل معاملة.
- **ملاحظات:** يستدعي `saveCountDraft` و`updateCountItem`/`getCountStockInfo` من part02 و`postCountVariance` من part04.

### `src/services/domains/inventory-count/countSessionService_part06.ts`
- **الغرض:** اعتماد أو رفض جلسة جرد في حالة REVIEW.
- **الأعضاء الرئيسية:**
  - `approveCountSession(activeSession)` — ترحيل نهائي: يستدعي `postCountItems` ويغلق الجلسة POSTED/APPROVED مع سجل تدقيق `APPROVE_AND_POST`.
  - `rejectCountSession(activeSession, reason)` — إعادة الجلسة إلى COUNTING بحالة REJECTED مع سبب.
- **ملاحظات:** يمنع منشئ الجلسة من اعتمادها/مراجعتها (فصل المهام). يسجل عبر `AuditService`.

### `src/services/domains/inventory-count/countSessionService_part07.ts`
- **الغرض:** إلغاء جلسة جرد مفتوحة.
- **الأعضاء الرئيسية:** `cancelCountSession(activeSession)` — يضبط الحالة CANCELLED فقط إذا كانت COUNTING، مع تحقق فرع/صلاحية.
- **ملاحظات:** —

---

## ثالثاً: التقارير — `src/services/domains/reports/`

> خدمات قراءة فقط. كلها تفرض `reports.view` (أو صلاحيات أدق) وتقيّد النتائج حسب فروع المستخدم عبر `BranchAccessService`.

### `src/services/domains/reports/AnalyticsService.ts`
- **الغرض:** تحليلات المبيعات وسجل اللقطات التاريخية (`analytics_snapshots`).
- **الأعضاء الرئيسية:**
  - `getSalesAnalytics(...)` — تحليلات مبيعات لفترة.
  - `recordSnapshot(...)` — حفظ لقطة تحليلية.
  - `getSnapshots(...)` — استرجاع اللقطات.
  - `getDashboardMetrics(...)` — مقاييس لوحة التحكم.
  - خاصة: `aggregateInvoices`, `aggregateInvoiceItem`, `aggregateReturns`, `aggregateReturnItem`, `addDailySales`, `addCustomerSpend`, `addProductRevenue`.
- **ملاحظات:** —

### `src/services/domains/reports/CustomerReportsService.ts`
- **الغرض:** تقارير العملاء: التعرض الائتماني، استحقاق الشيكات، تقادم الذمم.
- **الأعضاء الرئيسية:** `creditExposure(...)`, `chequeMaturity(...)`, `customerAging(...)` — كلها scoped بنطاق المبيعات (`salesScope`/`tableScope`).
- **ملاحظات:** —

### `src/services/domains/reports/FinancialReportsService.ts`
- **الغرض:** تقارير مالية: حركة النقد، الأرباح والخسائر، المركز المالي.
- **الأعضاء الرئيسية:** `cashMovement(...)`, `profitLoss(...)`, `balanceSheet(...)`.
- **ملاحظات:** يملك scopes منفصلة للمبيعات/المشتريات/كل الفروع.

### `src/services/domains/reports/FinancialStatementsService.ts`
- **الغرض:** القوائم المالية الرسمية من دفتر الأستاذ: ميزانية، تدفق نقدي، تقادم ذمم/دائنين، كشوف حسابات، دفتر أستاذ، تسوية.
- **الأعضاء الرئيسية:**
  - `getBranchScopeWarning()` — تحذير عند تجاوز نطاق الفرع.
  - `getReconciliation(...)` — تسوية الأرصدة.
  - `getBalanceSheet(...)` — الميزانية.
  - `getCashFlow(...)` — قائمة التدفقات النقدية.
  - `getCustomerAging` / `getSupplierAging` — تقادم العملاء/الموردين (عبر `buildAging`).
  - `getSubledgerParties` / `getPartyStatement` — أطراف دفتر الأستاذ الفرعي وكشف حساب طرف.
  - `getAccountsForLedger` / `getGeneralLedger` — حسابات وقيود دفتر الأستاذ.
  - `ledgerScope`, `requireView`, `scalar` — داخلية.
  - أنواع: `StatementLine`, `BalanceSheet`, `CashFlowMonth`, `AgingBucket`, `AgingRow`, `LedgerLine`, `PartyStatementLine`, `PartyStatement`, `PartyOption`, `ReconciliationCheck`.
- **ملاحظات:** الأغنى في قراءة `journal_entries`/`accounts`.

### `src/services/domains/reports/InventoryReportService.ts`
- **الغرض:** دوال مساعدة (ليست كلاساً) لتحميل KPI المشتريات وتقييم المخزون للوحة التقارير.
- **الأعضاء الرئيسية:**
  - `loadPurchaseKpi(from, to)` — إجماليات فواتير/مرتجعات الشراء، أفضل الموردين والفئات.
  - `loadInventoryKpi()` — يستدعي `InventoryValuationService.getKpi('ui.reports.inventory.view')`.
  - نوع `PurchaseKpi`.
- **ملاحظات:** يرتبط بـ `domains/inventory` (InventoryValuationService) ويطبق نطاق فروع المشتريات.

### `src/services/domains/reports/InventoryReportsService.ts`
- **الغرض:** تقرير المخزون: الأصناف بطيئة الحركة.
- **الأعضاء الرئيسية:** `slowMovingStock(...)` — مع `stockScope`/`tableScope` لتقييد الفروع.
- **ملاحظات:** —

### `src/services/domains/reports/PayrollReportsService.ts`
- **الغرض:** تقارير الرواتب: الملخص والمدفوعات.
- **الأعضاء الرئيسية:** `payrollSummary(...)`, `payrollPayouts(...)` — بنطاق `payrollScope`.
- **ملاحظات:** —

### `src/services/domains/reports/ReportCacheService.ts`
- **الغرض:** تعريفات مشتركة لعقد التقارير + ذاكرة تخزين مؤقت بسيطة (TTL 15 ثانية) + ترقيم صفحات.
- **الأعضاء الرئيسية:**
  - أنواع: `ReportValueType`, `ReportTone`, `ReportColumn`, `ReportKpi`, `ReportResult`, `ReportParams`, `PaginatedReportResult`.
  - `ReportCacheService` (static): `clearCache`, `getCached(key, compute)`, `hasCache`, `removeCache`, `getCacheSize`, `paginate(result, page, pageSize)`.
- **ملاحظات:** يكرر نفس الأنواع الموجودة في `ReportCenterService/types.ts` (ازدواجية مقصودة للتوافق).

### `src/services/domains/reports/ReportCenterService.ts`
- **الغرض:** نقطة إعادة التصدير العامة لخدمة مركز التقارير بعد إعادة الهيكلة إلى مجلد.
- **الأعضاء الرئيسية:** `export { ReportCenterService } from './ReportCenterService/service'` + `export * from './ReportCenterService/types'`.
- **ملاحظات:** —

### مجلد `src/services/domains/reports/ReportCenterService/`

#### `ReportCenterService/types.ts`
- **الغرض:** أنواع عقد التقرير المشتركة.
- **الأعضاء الرئيسية:** `ReportValueType`, `ReportTone`, `ReportColumn`, `ReportKpi`, `ReportResult` (kpis/columns/rows/notes), `ReportParams` (from/to + فلاتر منتج/مستخدم/فرع/مستودع/عميل/مورد/موظف/حالة/طريقة دفع/بُعد مقارنة).
- **ملاحظات:** المرجع الأساسي الذي تستورده كل الـ mixins.

#### `ReportCenterService/cache.ts`
- **الغرض:** خريطة كاش عامة للتقارير.
- **الأعضاء الرئيسية:** `CacheEntry`, `reportCache` (Map)، `CACHE_TTL_MS = 15_000`.
- **ملاحظات:** تُستخدم عبر `ReportCenterContext.withCache` و`ReportCenterService.clearCache`.

#### `ReportCenterService/helpers.ts`
- **الغرض:** دوال مساعدة نقية للتقارير.
- **الأعضاء الرئيسية:**
  - `num`, `sum` — تحويل/جمع آمن.
  - `classifyExpense` — تصنيف المصروف ثابت/متغير/شبه ثابت بالنص العربي.
  - `daysBetween`, `shiftDate`, `previousRange` — حسابات تواريخ وفترة سابقة.
  - `normalizeReportFilterValue`, `rowPropertyVariants` — توحيد الفلاتر ومطابقة أسماء الأعمدة البديلة (camelCase/snake_case).
  - `fmtMoney` — تنسيق عملة عربية، `dimensionLabel` — تسميات أبعاد التحليل.
- **ملاحظات:** `rowPropertyVariants` يقود `applyAdvancedFilters` في service.ts.

#### `ReportCenterService/context.ts`
- **الغرض:** الكلاس الأساسي `ReportCenterContext` الذي تبنى عليه كل تقارير الـ mixins: DB، صلاحيات، scopes الفروع، والكاش.
- **الأعضاء الرئيسية:**
  - `withCache(key, compute)` — كاش TTL للنتائج.
  - `actor`, `salesScope`, `purchaseScope`, `allBranchesScope`, `allBranchesTableScope`, `cachePartition`, `tableScope`, `withAdvancedQueryScope` — نطاقات SQL حسب صلاحيات المستخدم.
  - `periodMetrics` — مقاييس فترة مساعدة.
- **ملاحظات:** كل mixin يمرر `ReportCenterContext` كـ Base.

#### `ReportCenterService/service.ts`
- **الغرض:** تجميع كل الـ mixins في `ReportCenterService` واحدة + فلترة متقدمة عامة على النتائج.
- **الأعضاء الرئيسية:**
  - `class ReportCenterService extends OperationsReports(SalesReports(ReceivablesReports(InventoryReports(PurchaseReports(AuditLogsReports(FinanceReports(CustomerAnalyticsReports(HrPayrollReports(HrStaffReports(HrPerformanceReports(BusinessKpisReports(ConstructionReports(CeramicsReports(ActivityReports(ManufacturingReports(ReportCenterContext))))))))))))))))))`.
  - `clearCache()` — تفريغ كاش التقارير.
  - `applyAdvancedFilters(result, params)` — فلترة الصفوف في الذاكرة حسب فلاتر `ReportParams` مع مطابقة بدائل أسماء الأعمدة.
- **ملاحظات:** الـ mixins تُركّب بترتيب ثابت؛ كل طريقة تقرير ترجع `Promise<ReportResult>`.

#### `ReportCenterService/OperationsReports.ts`
- **الغرض:** تقارير تشغيلية.
- **الأعضاء الرئيسية:** `operationsLog`, `userActivity`, `dailyMovements`.
- **ملاحظات:** mixin.

#### `ReportCenterService/SalesReports.ts`
- **الغرض:** تحليلات المبيعات بُعداً (مخزن/عميل/مندوب/صنف) + ربحية + مقارنة فترات.
- **الأعضاء الرئيسية:** `salesAnalysis`, `productSales`, `productDetail`, `productProfitability`, `customerProfitability`, `periodComparison`؛ داخلية `salesActivityRows` (فواتير + مرتجعات).
- **ملاحظات:** mixin؛ يستخدم `salesScope`.

#### `ReportCenterService/ReceivablesReports.ts`
- **الغرض:** تقارير الذمم المدينة والتحصيل.
- **الأعضاء الرئيسية:** `arAging`, `creditExposure`, `chequeMaturity`, `bouncedCheques`, `installmentAging`.
- **ملاحظات:** mixin.

#### `ReportCenterService/InventoryReports.ts`
- **الغرض:** تقارير المخزون في مركز التقارير.
- **الأعضاء الرئيسية:** `inventoryBalances`, `slowMoving`.
- **ملاحظات:** mixin.

#### `ReportCenterService/PurchaseReports.ts`
- **الغرض:** تقارير المشتريات والموردين وتباين الجرد.
- **الأعضاء الرئيسية:** `purchaseAnalysis`, `supplierPrices`, `countVariance`.
- **ملاحظات:** mixin؛ `countVariance` مرتبط بالجرد.

#### `ReportCenterService/AuditLogsReports.ts`
- **الغرض:** تقارير التدقيق والسجلات.
- **الأعضاء الرئيسية:** `shiftClosing`, `approvalsLog`, `exceptionsLog`, `receivedReports`, `alertsSummary`.
- **ملاحظات:** mixin.

#### `ReportCenterService/FinanceReports.ts`
- **الغرض:** تقارير مالية إدارية.
- **الأعضاء الرئيسية:** `branchPerformance`, `financialPosition`, `cashMovement`, `cashFlowForecast`, `breakEven`.
- **ملاحظات:** mixin.

#### `ReportCenterService/CustomerAnalyticsReports.ts`
- **الغرض:** تحليلات متقدمة للعملاء والمبيعات.
- **الأعضاء الرئيسية:** `customerChurn`, `paymentBehavior`, `basketAnalysis`, `cashFlowDetailed`, `salesRepPerformance`, `demandForecast`.
- **ملاحظات:** mixin.

#### `ReportCenterService/HrPayrollReports.ts`
- **الغرض:** تقارير الرواتب والموارد البشرية المالية.
- **الأعضاء الرئيسية:** `hrPayrollSummary`, `hrPayrollPayouts`, `hrAttendanceSummary`, `hrLeaveSummary`, `hrTaxSummary`.
- **ملاحظات:** mixin.

#### `ReportCenterService/HrStaffReports.ts`
- **الغرض:** تقارير شؤون الموظفين الإدارية.
- **الأعضاء الرئيسية:** `hrVacancies`, `hrOnboarding`, `hrProbation`, `hrViolations`, `hrComplaints`, `hrPenaltiesReport`, `hrWarnings`, `hrAppeals`, `hrAttachments`, `hrAllowances`, `hrBenefits`, `hrLoans`.
- **ملاحظات:** mixin.

#### `ReportCenterService/HrPerformanceReports.ts`
- **الغرض:** تقارير الأداء والتدريب.
- **الأعضاء الرئيسية:** `hrPerformanceEvaluations`, `hrPerformanceGoals`, `hrPerformancePips`, `hrTrainingExpenses`.
- **ملاحظات:** mixin.

#### `ReportCenterService/BusinessKpisReports.ts`
- **الغرض:** مؤشرات الأداء الرئيسية للأعمال.
- **الأعضاء الرئيسية:** `mfgProductionKpis`, `salesTargetKpis`, `workforceAnalytics`, `assetAnalytics`, `facilityAnalytics`.
- **ملاحظات:** mixin.

#### `ReportCenterService/ManufacturingReports.ts`
- **الغرض:** تقارير التصنيع.
- **الأعضاء الرئيسية:** `manufacturingProduction`, `manufacturingWip`, `manufacturingOee`.
- **ملاحظات:** mixin.

#### `ReportCenterService/CeramicsReports.ts`
- **الغرض:** تقارير متخصصة لقطاع السيراميك.
- **الأعضاء الرئيسية:** `ceramicsDesignSales`, `ceramicTakeoffs`, `ceramicStockCoverage`.
- **ملاحظات:** mixin.

#### `ReportCenterService/ConstructionReports.ts`
- **الغرض:** تقارير المقاولات والمشاريع.
- **الأعضاء الرئيسية:** `projectCertificates`, `projectCostVariance`, `siteDailyReports`.
- **ملاحظات:** mixin.

#### `ReportCenterService/ActivityReports.ts`
- **الغرض:** تقارير أنشطة القطاعات الأخرى (فندق/مطعم/تعليم/ورش/وقت).
- **الأعضاء الرئيسية:** `hotelOccupancy`, `restaurantOperations`, `educationAttendance`, `educationFees`, `workshopOrders`, `timeBillingReport`.
- **ملاحظات:** mixin.
