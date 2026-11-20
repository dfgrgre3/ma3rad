# طبقة الخدمات — مجالك العمليات (operations)

توثيق لكل ملفات `src/services/operations` (~49 ملفًا). جميع الخدمات مبنية على `DatabaseManager` (SQLite) وتفرض الصلاحيات عبر `PermissionService`/`AuthService` وتحدد نطاق الفروع عبر `BranchAccessService`، مع تسجيل معظم عمليات الكتابة في `audit_logs`.

## الملفات الجذرية

### `src/services/domains/operations/OperationsService.ts`
- **الغرض:** خدمة عملياتيّة شاملة تُغطي الفروع، المستودعات (ونوعها)، السائقين، المركبات، والتسليمات مع فحوصات الجودة للشحنات.
- **الأعضاء الرئيسية:**
  - `OperationsService` — كلاس رئيسي بصلاحية `operations.update` و`operations.view`.
  - الواجهات: `Branch`، `WarehouseRow`، `Driver`، `Vehicle`، `Delivery`، `DeliveryItem`، `ShipmentQcCheck`.
  - دوال الفروع: `getBranches`، `toggleBranch`.
  - دوال المستودعات: `getWarehouses`، `updateWarehouseType`، `setWarehouseActive`، `setDefaultWarehouse`.
  - دوال الأسطول: `getDrivers`، `toggleDriver`، `getVehicles`، `updateVehicleStatus`، `getCustomersForSelect`.
  - دوال التسليم: `getDeliveries`، `updateDeliveryStatus`، `addDeliveryItem`، `getDeliveryItems`، `removeDeliveryItem`، `getShippableBatches`، `recordShipmentQc`، `getShipmentQcChecks`، `setDeliveryShipmentQcRequired`.
- **ملاحظات:** يستدعي `WarehouseTypePolicy` لضبط أنواع المستودعات، ويعتمد على `InventoryCostingService` و`BranchService` و`CentralUsageLimitService` و`ModuleRegistryService`.

### `src/services/domains/operations/DailyOperationsService.ts`
- **الغرض:** تجميع تقارير "عمليات اليوم" — المبيعات والمشتريات والمصروفات والديون — ليوم محدد مع ملخصات.
- **الأعضاء الرئيسية:**
  - الواجهات: `DailySalesRow`/`DailySalesResult`، `DailyPurchaseRow`/`DailyPurchaseItemRow`/`DailyPurchaseTrendPoint`/`DailyPurchaseResult`، `DailyExpenseRow`/`DailyExpenseResult`، `DailyDebtRow`/`DailyDebtPaymentRow`/`DailyDueInstallmentRow`/`DailyDebtResult`.
  - `DailyOperationsService` — كلاس بدوال: `today()`، `getSales(date)`، `getPurchases(date)`، `getExpenses(date)`، `getDebts(date)`.
- **ملاحظات:** قراءة فقط (تقارير)؛ تجمع من جداول الفواتير والمشتريات والمصروفات والديون عبر SQL مباشر.

### `src/services/domains/operations/FacilityManagementService.ts`
- **الغرض:** إدارة مرافق الفرع — المواقع الهرمية، الأصول، أوامر العمل (وقائية/تصحيحية/تنبؤية)، عقود المرافق، وسجلات السلامة.
- **الأعضاء الرئيسية:**
  - أنواع داخلية: `LocationType`، `WorkOrderType`، `ContractType`، `SafetyRecordType`، وواجهات `Location`، `FacilityAsset`، `WorkOrder`، `MaintenanceSchedule`، `FacilityContract`، `SafetyRecord`، `WorkOrderLog`، `WorkOrderAttachment` وخيارات lookup (`BranchOption`، `UserOption`، `EmployeeOption`، `FixedAssetOption`، `ExpenseOption`، `StockIssueOption`).
  - `FacilityManagementService` — صلاحية `operations.view`/`operations.update` مع نطاق الفروع.
  - استعلامات: `getBranches`، `getUsers`، `getEmployees`، `getFixedAssets`، `getExpenses`، `getStockIssueTransactions`، `getMaintenanceSchedules`، `getLocations`، `getAssets`، `getWorkOrders`، `getWorkOrderHistory`، `getWorkOrderAttachments`، `getAssetMaintenanceLogs`، `getContracts`، `getSafetyRecords`، `runFacilityReminders`، `runFacilityRemindersForActor`.
  - أوامر العمل: `createWorkOrder`، `createDueScheduleWorkOrder`، `updateWorkOrder`، `updateWorkOrderStatus`، `approveWorkOrder`، `startWorkOrder`، `assignTechnician`، `completeWorkOrder`، `reopenWorkOrder`، `cancelWorkOrder`، `addWorkOrderAttachment`، `removeWorkOrderAttachment`.
  - المواقع/الأصول: `createLocation`، `updateLocation`، `archiveLocation`، `restoreLocation`، `createAsset`، `updateAsset`، `archiveAsset`، `restoreAsset`، `retireAsset`، `transferAsset`.
  - عقود وسلامة: `createContract`، `updateContract`، `createSafetyRecord`، `updateSafetyRecord`، `closeSafetyRecord`.
- **ملاحظات:** يخزّن استهلاك قطع الغيار عبر `inventoryTransactionId` ومصروفات عبر `expenseId`؛ يولّد تذكيرات الصيانة الوقائية وجدولة متكررة (`repeatIntervalDays`).

### `src/services/domains/operations/FacilityPredictiveMaintenanceService.ts`
- **الغرض:** صيانة تنبؤية للأصول — تسجيل صحة الأصل، محفزات الحالة، تنبؤات الأعطال، وتتبع العمر المتبقي (RUL).
- **الأعضاء الرئيسية:**
  - أنواع: `HealthStatus`، `TriggerType`، `TriggerSeverity`، `ActivationStatus`، `PredictionStatus`.
  - واجهات: `AssetHealth`، `AssetHealthInput`، `ConditionTrigger`، `ConditionTriggerInput`، `ConditionActivation`، `ConditionActivationInput`، `FailurePrediction`، `FailurePredictionInput`، `RULTracking`، `RULTrackingInput`، `PredictiveMaintenanceStats`.
  - `FacilityPredictiveMaintenanceService` — static methods: `getAssetHealth`، `createAssetHealth`، `getConditionTriggers`، `createConditionTrigger`، `getConditionActivations`، `createConditionActivation`، `acknowledgeActivation`، `getFailurePredictions`، `createFailurePrediction`، `getRULTracking`، `createRULTracking`، `getPredictiveMaintenanceStats`.
- **ملاحظات:** يعمل على جداول `facility_*` الخاصة بالصيانة التنبؤية ويكمل `FacilityManagementService` (الذي يدعم نوع أمر عمل `PREDICTIVE`).

### `src/services/domains/operations/FacilityCleaningService.ts`
- **الغرض:** إدارة التنظيف — جداول تنظيف دورية، قوائم تحقق، مهام تنظيف مع نتائج بنود، ومخزون مستلزمات التنظيف واستهلاكها.
- **الأعضاء الرئيسية:**
  - أنواع: `CleaningFrequency`، `CleaningType`، `CleaningTaskStatus`، `TaskItemResult`، `SupplyType`، `SupplyStatus`، `SupplyUnit`.
  - واجهات: `CleaningSchedule`/`Input`، `CleaningChecklistItem`/`Input`، `CleaningTask`/`Input`، `CleaningTaskItem`، `CleaningSupply`/`Input`، `CleaningSupplyUsage`/`Input`، `CleaningStats`.
  - `FacilityCleaningService` — static methods: `getCleaningSchedules`، `createCleaningSchedule`، `updateCleaningSchedule`، `getCleaningChecklists`، `createCleaningChecklist`، `getCleaningTasks`، `createCleaningTask`، `updateCleaningTaskStatus`، `getCleaningSupplies`، `createCleaningSupply`، `updateCleaningSupplyStock`، `recordSupplyUsage`، `getSupplyUsages`، `getCleaningStats`.
- **ملاحظات:** يتحقق من وجود الموقع/الفرع/العامل قبل الإنشاء ويكتب سجلات `audit_logs` بنوع `OPERATIONS`؛ مستقل عن خدمات المرافق الأخرى.

### `src/services/domains/operations/WarehouseTypePolicy.ts`
- **الغرض:** سياسات مركزية لقواعد أنواع المستودعات — ما يمكن بيعه/شراؤه/تسويته/إدارة مواقع فيه.
- **الأعضاء الرئيسية:**
  - `WarehouseType` — union: `MAIN_WAREHOUSE`، `SHOWROOM`، `BRANCH_WAREHOUSE`، `TRANSIT_WAREHOUSE`، `RETURNS_WAREHOUSE`، `QUARANTINE_WAREHOUSE`.
  - `WarehouseTypePolicy` — static: `typeOf`، `isSellable`، `isPurchasable`، `isAdjustable`، `isLocationManaged`، `assertSellable`، `assertPurchasable`، `assertAdjustable`، `assertLocationManaged`.
- **ملاحظات:** تُستخدم من `OperationsService` ومن `services/domains/sales/invoiceCreation.ts`؛ المستودع العابر (TRANSIT) لا يقبل شراءً أو تسوية.

## `FacilityContractSLAService/` (مجلد فرعي — عقود الموردين واتفاقيات مستوى الخدمة)

### `FacilityContractSLAService.ts` (المجلد الجذر)
- **الغرض:** واجهة كلاس `FacilityContractSLAService` تجمّع كل دوال الموردين والعقود والـSLA وتعيد تصدير الأنواع.
- **الأعضاء الرئيسية:**
  - `export * from './FacilityContractSLAService/types'`.
  - `FacilityContractSLAService` — static delegates لكل وحدة فرعية: بائعو الخدمات (`getServiceVendors`، `createServiceVendor`، `getServiceVendor`، `updateServiceVendor`)؛ العقود (`getExtendedContracts`، `updateContractSLA`)؛ المدفوعات (`getContractPayments`، `createContractPayment`، `recordContractPayment`)؛ التجديدات (`getContractRenewals`، `createContractRenewal`، `decideContractRenewal`)؛ التقييمات (`getVendorEvaluations`، `createVendorEvaluation`)؛ التعديلات (`getContractAmendments`، `createContractAmendment`)؛ المخالفات (`getSLASeverityViolations`، `acknowledgeSLASeverity`)؛ الإحصاءات (`getVendorStats`).
- **ملاحظات:** يستخدم `NotificationService` لإشعارات المخالفات/التجديدات؛ الحالة `company_id` مشتقة من الفرع الحالي.

### `FacilityContractSLAService/types.ts`
- **الغرض:** كل الأنواع والواجهات المشتركة للنطاق.
- **الأعضاء الرئيسية:** أنواع `FacilityServiceCategory`، `ContractStatus`، `PaymentStatus`، `RenewalStatus`؛ واجهات `FacilityServiceVendor`، `FacilityServiceVendorInput`، `FacilityContractExtended`، `SLAViolation`، `ContractPayment`، `ContractRenewal`، `VendorEvaluation`، `ContractAmendment`، `VendorStats`.

### `FacilityContractSLAService/shared.ts`
- **الغرض:** أدوات مشتركة بين وحدات المجلد — الوصول لقاعدة البيانات، التحقق من الصلاحيات، الشركة الحالية، والتدقيق.
- **الأعضاء الرئيسية:** `db`، `branchAccess`، `requireView()`، `requireManage()`، `currentCompanyId(actor)`، `auditActor(...)`، `roundNumber`، `isValidDate`.

### `FacilityContractSLAService/vendors.ts`
- **الغرض:** CRUD لبائعي خدمات المرافق (صيانة/تنظيف/أمن/مرافق/إيجار).
- **الأعضاء الرئيسية:** `getServiceVendors(category?)`، `createServiceVendor(input)`، `getServiceVendor(vendorId)`، `updateServiceVendor(vendorId, input)`.

### `FacilityContractSLAService/contracts.ts`
- **الغرض:** قراءة العقود الموسّعة (مع بيانات المورد) وتحديث شروط/مستوى الخدمة للعقد.
- **الأعضاء الرئيسية:** `getExtendedContracts()`، `updateContractSLA(...)`.

### `FacilityContractSLAService/payments.ts`
- **الغرض:** إدارة مدفوعات عقود الخدمات — جلب، إنشاء مستحق، وتسجيل دفعة فعلية تحدّث حالة العقد.
- **الأعضاء الرئيسية:** `getContractPayments(contractId)`، `createContractPayment(...)`، `recordContractPayment(...)`.

### `FacilityContractSLAService/renewals.ts`
- **الغرض:** دورة تجديد العقود — قائمة، إنشاء طلب تجديد، وقرار قبول/رفض.
- **الأعضاء الرئيسية:** `getContractRenewals(contractId?)`، `createContractRenewal(...)`، `decideContractRenewal(renewalId, approve, notes?)`.

### `FacilityContractSLAService/evaluations.ts`
- **الغرض:** تقييم أداء الموردين (نتائج دورية مرتبطة بالعقود).
- **الأعضاء الرئيسية:** `getVendorEvaluations(vendorId?)`، `createVendorEvaluation(...)`.

### `FacilityContractSLAService/amendments.ts`
- **الغرض:** تعديلات/ملحقات العقود.
- **الأعضاء الرئيسية:** `getContractAmendments(contractId)`، `createContractAmendment(...)`.

### `FacilityContractSLAService/violations.ts`
- **الغرض:** رصد مخالفات مستوى الخدمة (SLA) وإقرارها.
- **الأعضاء الرئيسية:** `getSLASeverityViolations()`، `acknowledgeSLASeverity(violationId)`.

### `FacilityContractSLAService/stats.ts`
- **الغرض:** إحصاءات الموردين (تقييمات، عقود نشطة، مخالفات...).
- **الأعضاء الرئيسية:** `getVendorStats()`.

## `FacilitySafetyService/` (مجلد فرعي — السلامة والصحة المهنية للمرافق)

### `FacilitySafetyService.ts` (المجلد الجذر)
- **الغرض:** واجهة كلاس ثابتة `FacilitySafetyService` تجمع كل وحدات السلامة وتنشئ `SafetyContext` مشتركًا.
- **الأعضاء الرئيسية:**
  - `FacilitySafetyService` — static delegates: سجل المخاطر (`getRiskRegister`، `createRiskRegisterItem`، `updateRiskRegisterItem`، `closeRiskRegisterItem`)؛ الفحوصات (`getInspectionChecklists`، `createInspectionChecklist`، `getInspectionChecklistItems`، `getInspectionRecords`، `createInspectionRecord`، `closeInspectionRecord`)؛ الحوادث (`getAccidents`، `createAccidentRecord`، `investigateAccident`)؛ CAPA (`getCAPA`، `createCAPA`، `updateCAPAStatus`)؛ معدات الحريق (`getFireEquipment`، `createFireEquipment`، `updateFireEquipmentStatus`)؛ الإخلاء (`getEvacuationDrills`، `createEvacuationDrill`)؛ معدات الوقاية (`getPPEInventory`، `createPPEInventory`، `assignPPE`، `getPPEAssignments`، `returnPPE`)؛ التدريب (`getSafetyTraining`، `createSafetyTraining`، `addTrainingAttendee`، `getTrainingAttendees`)؛ الإحصاءات (`getSafetyStats`، `generateCriticalRiskAlerts`).
- **ملاحظات:** يتطلب `operations.view`/`operations.update` أو `facility_management.*`، ويتحقق من تفعيل موديول `hr` عند الكتابة.

### `FacilitySafetyService/types.ts`
- **الغرض:** كل أنواع السلامة والواجهات.
- **الأعضاء الرئيسية:** أنواع `RiskLevel`، `RiskStatus`، `RiskCategory`، `RiskType`، `Probability`، `Impact`، `InspectionResult`، `AccidentType/Severity/Status`، `CAPAStatus/Type/Priority`، `FireEquipmentType/Status`، `DrillType/Result`، `PPEType/Status`، `PPEAssignmentStatus`، `TrainingType/Status`، `AttendanceStatus`؛ واجهات `RiskRegisterItem`، `InspectionChecklist`، `InspectionRecord`، `AccidentRecord`، `CAPAItem`، `FireEquipment`، `EvacuationDrill`، `PPEInventory`، `PPEAssignment`، `SafetyTraining`، `SafetyTrainingAttendee`، `SafetyStats` ومعات كل منها.

### `FacilitySafetyService/context.ts`
- **الغرض:** تعريف `SafetyContext` — حاوية الاعتماديات (db، branchAccess، notification، requireView/Manage، audit) تمرّر لدوال الوحدات.
- **الأعضاء الرئيسية:** `interface SafetyContext`.

### `FacilitySafetyService/helpers.ts`
- **الغرض:** أدوات حسابية مشتركة.
- **الأعضاء الرئيسية:** `computeRiskScore(probability, impact)`، `computeRiskLevel(score)`، `isValidDate(value)`.

### `FacilitySafetyService/riskRegister.ts`
- **الغرض:** سجل المخاطر — تقييم الاحتمالية/الأثر، تحديث، وإغلاق.
- **الأعضاء الرئيسية:** `getRiskRegister(ctx)`، `createRiskRegisterItem(ctx, input)`، `updateRiskRegisterItem(ctx, id, input)`، `closeRiskRegisterItem(ctx, id)`.

### `FacilitySafetyService/inspections.ts`
- **الغرض:** قوائم تحقق الفحص وسجلاتها (بند-بند) وإغلاق السجل.
- **الأعضاء الرئيسية:** `getInspectionChecklists`، `createInspectionChecklist`، `getInspectionChecklistItems`، `getInspectionRecords`، `createInspectionRecord`، `closeInspectionRecord`.

### `FacilitySafetyService/accidents.ts`
- **الغرض:** سجلات الحوادث (إصابة/شبه حادث/حريق...) والتحقيق فيها.
- **الأعضاء الرئيسية:** `getAccidents`، `createAccidentRecord`، `investigateAccident`.

### `FacilitySafetyService/capa.ts`
- **الغرض:** إجراءات تصحيحية/وقائية (CAPA) وحالاتها.
- **الأعضاء الرئيسية:** `getCAPA`، `createCAPA`، `updateCAPAStatus`.

### `FacilitySafetyService/fireEquipment.ts`
- **الغرض:** معدات الحريق — حالة الصلاحية/الصيانة وتحديثها.
- **الأعضاء الرئيسية:** `getFireEquipment`، `createFireEquipment`، `updateFireEquipmentStatus`.

### `FacilitySafetyService/drills.ts`
- **الغرض:** تمارين الإخلاء/الطوارئ ونتائجها.
- **الأعضاء الرئيسية:** `getEvacuationDrills`، `createEvacuationDrill`.

### `FacilitySafetyService/ppe.ts`
- **الغرض:** مخزون معدات الوقاية الشخصية (PPE) وإسنادها/إرجاعها للموظفين.
- **الأعضاء الرئيسية:** `getPPEInventory`، `createPPEInventory`، `assignPPE`، `getPPEAssignments`، `returnPPE`.

### `FacilitySafetyService/training.ts`
- **الغرض:** دورات السلامة وحضور الموظفين.
- **الأعضاء الرئيسية:** `getSafetyTraining`، `createSafetyTraining`، `addTrainingAttendee`، `getTrainingAttendees`.

### `FacilitySafetyService/stats.ts`
- **الغرض:** إحصاءات السلامة وتنبيهات المخاطر الحرجة.
- **الأعضاء الرئيسية:** `getSafetyStats(ctx)`، `generateCriticalRiskAlerts(ctx)`.

## `FacilityUtilityService/` (مجلد فرعي — المرافق: عدادات، قراءات، فواتير، انقطاعات)

### `FacilityUtilityService.ts` (المجلد الجذر)
- **الغرض:** واجهة كلاس ثابتة `FacilityUtilityService` تجمع وحدات المرافق وتعيد تصدير الأنواع.
- **الأعضاء الرئيسية:**
  - `export * from './FacilityUtilityService/types'`.
  - `FacilityUtilityService` — static delegates: عدادات (`getUtilityMeters`، `createUtilityMeter`، `updateUtilityMeter`، `toggleMeterActive`)؛ قراءات (`getUtilityReadings`، `createUtilityReading`)؛ فواتير (`getUtilityBills`، `createUtilityBill`، `payUtilityBill`)؛ عقود (`getUtilityContracts`، `createUtilityContract`، `updateUtilityContractStatus`)؛ انقطاعات (`getUtilityOutages`، `createUtilityOutage`، `resolveUtilityOutage`)؛ إحصاءات (`getConsumptionComparison`، `getUtilityStats`).
- **ملاحظات:** يستخدم `NotificationService`؛ `company_id` مشتقة من الفرع الحالي عبر `shared.ts`.

### `FacilityUtilityService/types.ts`
- **الغرض:** أنواع المرافق والواجهات.
- **الأعضاء الرئيسية:** `UtilityType` (كهرباء/ماء/غاز/إنترنت/HVAC/مولد/مصعد/إطفاء/نفايات)، `UnitOfMeasure`، `BillStatus`، `OutageType`، `OutageStatus`؛ واجهات `UtilityMeter`، `UtilityReading`، `UtilityBill`، `UtilityBillPaymentInput`، `UtilityContract`، `UtilityOutage`، `UtilityConsumptionComparison`، `UtilityStats` ومعاتها.

### `FacilityUtilityService/shared.ts`
- **الغرض:** أدوات مشتركة — db، branchAccess، requireView/Manage، currentCompanyId، auditActor/auditDB، roundNumber، isValidDate.
- **الأعضاء الرئيسية:** `db`، `branchAccess`، `requireView()`، `requireManage()`، `currentCompanyId(actor)`، `auditActor(...)`، `auditDB(...)`، `roundNumber`، `isValidDate`.

### `FacilityUtilityService/meters.ts`
- **الغرض:** عدادات المرافق لكل موقع/فرع.
- **الأعضاء الرئيسية:** `getUtilityMeters(utilityType?)`، `createUtilityMeter(input)`، `updateUtilityMeter(id, input)`، `toggleMeterActive(id, isActive)`.

### `FacilityUtilityService/readings.ts`
- **الغرض:** تسجيل قراءات العدادات (استهلاك دوري).
- **الأعضاء الرئيسية:** `getUtilityReadings(options)`، `createUtilityReading(input)`.

### `FacilityUtilityService/bills.ts`
- **الغرض:** فواتير المرافق — إنشاء، عرض مع فلاتر، وتسجيل دفعة.
- **الأعضاء الرئيسية:** `getUtilityBills(options)`، `createUtilityBill(input)`، `payUtilityBill(billId, input)`.

### `FacilityUtilityService/contracts.ts`
- **الغرض:** عقود توريد المرافق (مزود/تعرفة/دورة).
- **الأعضاء الرئيسية:** `getUtilityContracts()`، `createUtilityContract(input)`، `updateUtilityContractStatus(id, status)`.

### `FacilityUtilityService/outages.ts`
- **الغرض:** انقطاعات المرافق المخططة/الطارئة وحلّها.
- **الأعضاء الرئيسية:** `getUtilityOutages(options)`، `createUtilityOutage(input)`، `resolveUtilityOutage(id, resolvedByNote?)`.

### `FacilityUtilityService/stats.ts`
- **الغرض:** إحصاءات الاستهلاك والمقارنة بين الفترات.
- **الأعضاء الرئيسية:** `getConsumptionComparison(periodMonth)`، `getUtilityStats()`.

## `OperationsShiftService/` (مجلد فرعي — الورديات والجدولة والحضور)

### `OperationsShiftService.ts` (المجلد الجذر)
- **الغرض:** كلاس واجهة (instance) يبني `ShiftServiceContext` ويربط كل دوال الوحدات الفرعية مع صلاحيات مرنة (`operations.*` أو `cashier.*` أو `employees.attendance.*` أو `manufacturing.*`).
- **الأعضاء الرئيسية:**
  - `export * from './OperationsShiftService/types'`.
  - `OperationsShiftService` — constructor يبني `ctx`؛ `requireView`/`requireManage`/`audit` خاصة؛ ودوال عامة تفوّض للوحدات: تعريفات الورديات (`getShiftDefinitions`، `getWorkMode`، `saveWorkMode`، `saveShiftDefinition`، `deactivateShiftDefinition`)؛ الموظفون/الإسناد (`getEmployees`، `getAssignments`، `assignEmployee`، `removeAssignment`)؛ الجدولة (`ensureShiftInstances`، `syncShiftLifecycle`، `generateWorkforceSchedule`)؛ التبديلات (`getShiftSwapRequests`، `requestShiftSwap`، `decideShiftSwap`)؛ الاستعلامات (`getShiftBoard`، `getOpenShiftForBranch`، `getCashSummary`، `getShiftDetail`، `getPeriods`)؛ دورة الحياة (`openShift`، `addStaff`، `replaceAbsentStaff`، `approveShiftOvertime`، `recordStaffPresence`، `submitHandover`، `confirmHandover`، `closeShift`)؛ النشاط (`addIncident`، `resolveIncident`، `recordProduction`، `getProduction`)؛ التقارير/الرواتب (`getShiftReport`، `getLinkableOpenShift`، `getShiftAttendanceForPayroll`، `getEmployeeShiftSummary`).
- **ملاحظات:** `ctx` يحقن دوال cross-module (definitionRows، currentAssignments، ensureShiftInstances، getShiftBoard...) تسمح للوحدات بالاستدعاء المتبادل دون اعتماد دائري مباشر.

### `OperationsShiftService/types.ts`
- **الغرض:** كل أنواع الورديات.
- **الأعضاء الرئيسية:** `OperationsWorkMode` (NORMAL/TWO_SHIFTS/THREE_SHIFTS/CONTINUOUS)، `OperationShiftStatus` (PLANNED/OPEN/HANDOVER_PENDING/CLOSED/MISSED/CANCELLED)، `OperationStaffRole`، `OperationStaffStatus`؛ واجهات `OperationShiftDefinition`، `OperationShiftInstance`، `OperationShiftStaff`، `OperationShiftHandover`، `OperationShiftIncident`، `OperationShiftProductionRow`، `OperationShiftDetail`، `OperationCashSummary`، `EmployeeAttendancePeriod`، `OperationShiftReportRow`، `OperationEmployee`، `ShiftPayrollRow`، `OperationShiftAssignmentRow`، `OperationShiftSwapRequest`.

### `OperationsShiftService/context.ts`
- **الغرض:** تعريف `ShiftServiceContext` — اعتماديات + دوال cross-module بين الوحدات.
- **الأعضاء الرئيسية:** `interface ShiftServiceContext` (db، branchAccess، requireView/Manage، audit، definitionRows، currentAssignments، ensureShiftInstances، getShiftBoard، assertEmployeeAvailable، getInstance، getCashSummary، getShiftDetail، getProduction، getPeriods...).

### `OperationsShiftService/helpers.ts`
- **الغرض:** ثوابت وأدوات تاريخ/وقت مشتركة.
- **الأعضاء الرئيسية:** `WORK_MODES`، `WORK_MODE_KEY`، `isValidDate`، `isValidTime`، `dateOffset`، `localNow`، `toDateTime`، `timeMinutes`، `durationMinutes`، `bool`، `scheduledWindow`.

### `OperationsShiftService/definitions.ts`
- **الغرض:** تعريفات الورديات (أنماط العمل)، الموظفون، وإسنادهم للتعريفات.
- **الأعضاء الرئيسية:** `definitionRows(ctx, branchId?)`، `getShiftDefinitions`، `getWorkMode`، `saveWorkMode`، `saveShiftDefinition`، `deactivateShiftDefinition`، `getEmployees`، `getAssignments`، `assignEmployee`، `removeAssignment`، `currentAssignments`.

### `OperationsShiftService/scheduling.ts`
- **الغرض:** توليد نسخ الورديات الفعلية (instances) ومزامنة دورة حياتها، وجدولة Workforce، وفحص توفر الموظف.
- **الأعضاء الرئيسية:** `ensureShiftInstances(ctx, from, to, branchId?)`، `syncShiftLifecycle(ctx, today)`، `assertEmployeeAvailable(...)`، `generateWorkforceSchedule(ctx, from, to, branchId?)`.

### `OperationsShiftService/lifecycle.ts`
- **الغرض:** دورة حياة الوردية — فتح، طاقم، تغطية الغياب، إضافة ساعات، حضور، تسليم (handover)، إغلاق.
- **الأعضاء الرئيسية:** `openShift`، `addStaff`، `replaceAbsentStaff`، `approveShiftOvertime`، `recordStaffPresence`، `submitHandover`، `confirmHandover`، `closeShift`.

### `OperationsShiftService/queries.ts`
- **الغرض:** استعلامات لوحة الورديات والتفاصيل والملخصات النقدية وفترات الحضور.
- **الأعضاء الرئيسية:** `getShiftBoard`، `getOpenShiftForBranch`، `getInstance`، `getCashSummary`، `getShiftDetail`، `getPeriods`.

### `OperationsShiftService/swaps.ts`
- **الغرض:** طلبات تبديل الورديات بين الموظفين وقراراتها.
- **الأعضاء الرئيسية:** `getShiftSwapRequests(ctx, from?, to?)`، `requestShiftSwap(ctx, input)`، `decideShiftSwap(ctx, requestId, approve, notes?)`.

### `OperationsShiftService/activity.ts`
- **الغرض:** نشاط الوردية — حوادث، إنتاج، تقرير وردية، حضور للرواتب، وملخص موظف.
- **الأعضاء الرئيسية:** `addIncident`، `resolveIncident`، `recordProduction`، `getProduction`، `getShiftReport`، `getShiftAttendanceForPayroll`، `getEmployeeShiftSummary`.

## ملاحظات عامة

- **نمط موحّد:** كل خدمة كبيرة مجزأة إلى كلاس واجهة + مجلد وحدات وظيفية + `types.ts` + `shared.ts`/`context.ts`، مع تمرير `ctx`/`shared` لتجنّب الاعتماد الدائري.
- **الصلاحيات:** `operations.view`/`operations.update` أساسية، مع توسيع مرن في الورديات (`cashier.*`, `employees.*`, `manufacturing.*`) و`facility_management.*` في السلامة.
- **النطاق:** `company_id` تُشتق من الفرع الحالي عبر `BranchAccessService`؛ الجداول تُكتب في `audit_logs` بإجراء `OPERATIONS` أو ما يعادله.
- **علاقات عابرة للنطاق:** `WarehouseTypePolicy` مستخدمة في المبيعات (`invoiceCreation.ts`)؛ أوامر العمل تربط `expenseId`/`inventoryTransactionId`؛ تقارير الورديات تغذي الرواتب (`getShiftAttendanceForPayroll`).
- **لا توجد ملفات `*.test.ts`** داخل هذا المجلد.
- **ملاحظة عن النطاق المطلوب:** ملفات الفروع/المستودعات/السائقين/المركبات/التسليمات موجودة داخل `OperationsService.ts`؛ الموظفون والورديات داخل `OperationsShiftService/` — لا توجد ملفات منفصلة بأسماء branches/warehouses/fleet/deliveries/employees.
</content>
</invoke>"<|sep|>unused<|sep|>
<functions.invoke name="exec">
<parameter name="command">wc -l "D:\edarty\ma3rad\docs\details\services-operations.md"