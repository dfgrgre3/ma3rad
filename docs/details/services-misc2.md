# توثيق طبقة الخدمات — الدومينات المتفرقة (الجزء الثاني)

هذا الملف يوثّق ملفات الخدمات تحت `src/services/domains/` للدومينات: products، documents، approvals، notifications، security، purchases، effects، crm، organization، والقطاعات العمودية أحادية الملف (workshop، suppliers، retail، restaurant، professional، hospitality، education، ceramics).

---

## products

### `src/services/domains/products/AttributeService.ts`
- **الغرض:** إدارة فئات السمات الديناميكية (خصائص المنتجات) والقيم المسموحة لكل سمة في الذاكرة/قاعدة البيانات.
- **الأعضاء الرئيسية:**
  - `AttributeCategory` — واجهة فئة سمة (id, name, values…).
  - `AttributeService.getCategories()` — جلب كل فئات السمات.
  - `AttributeService.getCategoryById(id)` — جلب فئة بالمعرّف.
  - `AttributeService.addCategory(input)` / `updateCategory(id, updates)` / `deleteCategory(id)` — CRUD لفئات السمات.
  - `AttributeService.addValue(attributeId, label)` / `removeValue(optionId)` — إدارة قيم السمة.
- **ملاحظات:** تُستخدم قيم السمات مع `dynamicAttributes.ts` وخدمة الحقول التشغيلية.

### `src/services/domains/products/BrandService.ts`
- **الغرض:** إدارة العلامات التجارية للمنتجات مع عدّاد المنتجات لكل علامة.
- **الأعضاء الرئيسية:**
  - `BrandWithCount` — واجهة Brand مع عدد المنتجات.
  - `BrandService.getAllBrands()` / `getBrandById(id)` — استعلامات.
  - `createBrand(name, country?)` / `updateBrand(id, updates)` / `deleteBrand(id)` — عمليات CRUD.

### `src/services/domains/products/CategoryService.ts`
- **الغرض:** إدارة شجرة فئات المنتجات الهرمية (أب/ابن) مع عمليات نقل المنتجات بين الفئات.
- **الأعضاء الرئيسية:**
  - `CategoryWithCount` — فئة مع عدد منتجاتها.
  - `getAllCategories()` / `getCategoryById(id)` / `getChildren(parentId)` / `getDescendantIds(id)` — استعلامات الشجرة.
  - `createCategory(name, parentId?, description?)` / `updateCategory(...)` / `deleteCategory(id)` — CRUD.
  - `moveProducts(fromCategoryId, toCategoryId)` — نقل كل منتجات فئة إلى أخرى.

### `src/services/domains/products/OperationalFieldService.ts`
- **الغرض:** نظام الحقول التشغيلية الديناميكية (تعريفات حقول مخصصة حسب نوع كيان مثل منتج/عميل) وتخزين قيمها لكل سجل، بما فيها خيارات "درجة المنتج".
- **الأعضاء الرئيسية:**
  - أنواع: `OperationalEntityType`، `OperationalFieldOption`، `OperationalFieldDefinition` (يمتد `DynamicAttributeDefinition`)، `ProductGradeOption`.
  - `OPERATIONAL_ENTITY_TYPES` — قائمة أنواع الكيانات المدعومة.
  - `getEntityTypes()` / `getDefinitions(entityType)` — تعريفات الحقول لكل كيان.
  - `addDefinition` / `updateDefinition` / `deleteDefinition` / `ensureSeedDefinitions` — إدارة التعريفات والتهيئة.
  - `addOption` / `updateOption` / `removeOption` — خيارات الحقول.
  - `getRecordValues` / `setRecordValues` / `copyRecordFieldValues` / `validateRecordValues` — قيم الحقول على السجلات.
  - `getFilterableDefinitions` / `getRecordValuesForExport` / `getRecordValuesForRecords` — أدوات فلترة وتصدير.
  - `getProductGradeOptions` / `updateProductGradeOption` / `addProductGradeOption` — إدارة درجات المنتجات.
- **ملاحظات:** يستخدم `MasterDataSyncService` للمزامنة؛ تستدعيه `ProductService` لقراءة/كتابة قيم الحقول التشغيلية للمنتجات.

### `src/services/domains/products/ProductExtraService.ts`
- **الغرض:** إدارة البيانات الإضافية للمنتج: المتغيرات (variants)، الصور، قيم السمات، والمستندات المرفقة.
- **الأعضاء الرئيسية:**
  - أنواع: `ProductVariant`، `ProductImage`، `ProductDocument`.
  - المتغيرات: `getVariantById` / `getVariants` / `createVariant` / `updateVariant` / `deleteVariant`.
  - الصور: `getImageById` / `getImages` / `addImage` / `setPrimaryImage` / `updateImage` / `deleteImage`.
  - `getAttributeValues(productId)` / `setAttributeValues(productId, values)` — قيم السمات الديناميكية.
  - المستندات: `getDocuments` / `addDocument` / `deleteDocument`.
- **ملاحظات:** طبقة مساعدة لـ `ProductService`؛ كل دالة كتابة تستدعي `requireWrite()` للتحقق من الصلاحية.

### `src/services/domains/products/ProductFormPreferencesService.ts`
- **الغرض:** حفظ تفضيلات نموذج المنتج لكل مستخدم (حقول مخفية/ظاهرة، نغمات مخصصة) في التخزين المحلي/الإعدادات.
- **الأعضاء الرئيسية:**
  - `ProductFormPreferencesService.getPreferences()` / `saveField(field, value)` / `clearField(field)` / `replacePreferences(prefs)`.
  - `getTones()` / `addTone(tone)` / `deleteTone(tone)` — إدارة قائمة "النغمات" المخصصة للنموذج.

### `src/services/domains/products/ProductService.ts`
- **الغرض:** الخدمة الأساسية للمنتجات: CRUD كامل، بحث وترقيم صفحات، إحصائيات، باركود/SKU تلقائي، نسخ المنتج، وتلخيص المخزون لكل مستودع.
- **الأعضاء الرئيسية:**
  - أنواع: `ProductQueryOptions`، `ProductStats`.
  - `getAllProducts(search?, categoryId?, brandId?)` / `getProductsPage(...)` — استعلامات مع ترقيم.
  - `getProductStats()` — إحصائيات المنتجات (نشط/غير نشط/مخزون…).
  - `getProductById(id)` / `getProductByBarcode(barcode)` — بحث مباشر.
  - `generateNextBarcode(currentValue?)` / `generateNextSku(currentValue?)` — توليد تلقائي للباركود وSKU.
  - `createProduct(...)` / `updateProduct(...)` / `deleteProduct(...)` / `setProductActive(id, active)` / `duplicateProduct(id)`.
  - `getProductStockSummary(productId)` — إجمالي المتر/الصناديق/القطع لكل مستودع.
- **ملاحظات:** يعتمد على `OperationApprovalGate` (اعتماد العمليات الحساسة مثل حذف/تعديل أسعار)، `InventoryCostingService`، `MasterDataSyncService`، `CentralUsageLimitService`، و`SettingsService`. يبني استعلامات SQL خام عبر `DatabaseManager`.

### `src/services/domains/products/dynamicAttributes.ts`
- **الغرض:** أنواع ودوال مساعدة للسمات الديناميكية (أنواع البيانات المسموحة وتطبيع القيم).
- **الأعضاء الرئيسية:**
  - `DynamicAttributeDataType` — اتحاد أنواع البيانات (نص/رقم/تاريخ/منطقية…).
  - `DynamicAttributeDefinition` — تعريف سمة ديناميكية.
  - `normalizeDynamicAttributeValue(...)` — تطبيع قيمة سمة حسب نوعها.
- **ملاحظات:** أساس أنواع تستخدمه `OperationalFieldService` و`ProductExtraService`.

---

## documents

### `src/services/domains/documents/DocumentService.ts`
- **الغرض:** نقطة دخول عامة تُعيد تصدير `DocumentService` من مجلد `DocumentService/` للحفاظ على الواجهة الأصلية.
- **الأعضاء الرئيسية:** `export { DocumentService }` فقط (re-export).

### `src/services/domains/documents/DocumentService/DocumentService.ts`
- **الغرض:** الصنف النهائي لخدمة المستندات والعقود؛ يجمع عمليات المستندات والعقود ويضيف خيارات الشركات وطلبات الاعتماد والأحداث.
- **الأعضاء الرئيسية:**
  - `DocumentService extends ContractOperations`.
  - `getCompanyOptions()` — قائمة الشركات المتاحة.
  - `requestActivationApproval(id, kind)` — إنشاء طلب موافقة لتفعيل مستند/عقد (يستخدم `ApprovalService`).
  - `getSummary()` — ملخص وحدة المستندات.
  - `getEvents(entityType, entityId)` — سجل أحداث الكيان.
- **ملاحظات:** يرث `ContractOperations` → `DocumentOperations` → `DocumentServiceBase`؛ يعتمد على `ModuleRegistryService` للتحقق من تفعيل الوحدة.

### `src/services/domains/documents/DocumentService/base.ts`
- **الغرض:** الأساس المجرد لخدمات المستندات: نطاقات الشركة/الفرع، التحقق من الوصول، تسجيل الأحداث والتدقيق، وأدوات التطبيع.
- **الأعضاء الرئيسية:**
  - `DocumentServiceBase` (abstract).
  - `companyScope(alias, actor)` / `branchScope(alias, actor)` — بناء جمل نطاق SQL حسب صلاحيات المستخدم.
  - `assertCompany` / `assertBranch` / `assertUser` — تحقق من الوصول.
  - `recordEvent(...)` / `audit(action, module, recordId, actor, before?, after?)` — تسجيل أحداث وتدقيق.
  - `normalizeNumber(value, label)` — تطبيع أرقام المستندات.

### `src/services/domains/documents/DocumentService/contracts.ts`
- **الغرض:** عمليات العقود المؤسسية: استعلام، إنشاء، تحديث، تفعيل، إنهاء، وتجديد.
- **الأعضاء الرئيسية:**
  - `ContractOperations extends DocumentOperations` (abstract).
  - `getContracts(filters)` / `getContract(id)` — استعلامات.
  - `createContract(dto)` / `updateContract(id, patch)` — إنشاء وتعديل.
  - `activateContract(id, effectiveFrom?)` / `terminateContract(id, reason)` / `renewContract(id, newEndDate, newValue?)` — دورة حياة العقد.
  - `assertContractDocument` / `defaultCurrency` — مساعدات داخلية.
- **ملاحظات:** يعتمد على `CONTRACT_STATUSES` و`MODULE_ID` من `validation.ts`؛ يتحقق من ربط المستند بالعقد ونطاق الشركة.

### `src/services/domains/documents/DocumentService/documents.ts`
- **الغرض:** عمليات المستندات المؤسسية: استعلام، إنشاء، تحديث، إصدارات، وتغيير الحالة.
- **الأعضاء الرئيسية:**
  - `DocumentOperations extends DocumentServiceBase` (abstract).
  - `getDocuments(filters)` / `getDocument(id)` — استعلامات.
  - `createDocument(dto)` / `updateDocument(id, patch)` — CRUD.
  - `addDocumentVersion(id, dto)` / `setDocumentStatus(id, status)` — الإصدارات والحالات.
  - `assertUniqueDocumentNumber` / `normalizeVersion` / `insertVersion` — مساعدات داخلية.
- **ملاحظات:** يستخدم `DOCUMENT_STATUSES` و`NUMBER_PATTERN` من `validation.ts` ويضمن فرادة رقم المستند لكل شركة.

### `src/services/domains/documents/DocumentService/mapping.ts`
- **الغرض:** تحويل صفوف قاعدة البيانات إلى كيانات المستندات والعقود والإصدارات.
- **الأعضاء الرئيسية:**
  - `mapDocument(row)` → `EnterpriseDocument`.
  - `mapVersion(row)` → `EnterpriseDocumentVersion`.
  - `mapContract(row, today)` → `EnterpriseContract` (يحسب الحالة الفعلية حسب التاريخ).

### `src/services/domains/documents/DocumentService/utils.ts`
- **الغرض:** أدوات مساعدة صغيرة لخدمة المستندات.
- **الأعضاء الرئيسية:**
  - `nowIso()` — الطابع الزمني الحالي ISO.
  - `newId(prefix)` — توليد معرّف جديد بالبادئة.

### `src/services/domains/documents/DocumentService/validation.ts`
- **الغرض:** ثوابت الأنماط والتحقق وصلاحية البيانات للمستندات والعقود.
- **الأعضاء الرئيسية:**
  - ثوابت: `DOCUMENT_STATUSES`، `CONFIDENTIALITY`، `PARTY_TYPES`، `CONTRACT_STATUSES`، `MODULE_ID = 'documents'`، وأنماط regex للأرقام/التواريخ/العملة/أسماء الملفات، و`MAX_ATTACHMENT_BYTES`.
  - `requireText` / `optionalText` / `optionalDate` / `requiredDate` — مدققات الإدخال.
  - `toEpochDay(date)` / `daysBetween(from, to)` — حسابات التواريخ.
  - `effectiveContractStatus(row, today)` → `ContractEffectiveStatus` — الحالة الفعلية للعقد.
  - `NormalizedVersion` — نوع الإصدار المطبّع.

---

## approvals

### `src/services/domains/approvals/ApprovalDecisionService.ts`
- **الغرض:** تنفيذ قرارات الموافقة/الرفض على الطلبات وتطبيق التأثيرات المسجلة عند الاعتماد.
- **الأعضاء الرئيسية:**
  - `ApprovalDecisionService.decide(id, approved, notes?)` — تسجيل القرار وتحديث الطلب.
  - `applyApprovedEffect(row, db)` — تطبيق التأثير بعد الاعتماد (داخلية).
- **ملاحظات:** يستخدم `ApprovalPolicyService` و`ApprovalEffectRegistry` لتطبيق التأثيرات المسجّلة لكل نوع طلب.

### `src/services/domains/approvals/ApprovalEffectRegistry.ts`
- **الغرض:** سجلّ (registry) لتأثيرات ما بعد الاعتماد/الرفض لكل نوع طلب موافقة.
- **الأعضاء الرئيسية:**
  - `registerApprovalEffect(requestType, effect)` / `registerApprovalRejectionEffect(requestType, effect)` — تسجيل المعالجات.
  - `applyRegisteredApprovalEffect(...)` / `applyRegisteredRejectionEffect(...)` — تنفيذ التأثيرات المسجلة.
- **ملاحظات:** نقطة ربط بين قرارات الموافقة والعمليات الفعلية (مثل خصم مخزون أو ترحيل قيد).

### `src/services/domains/approvals/ApprovalPolicyService.ts`
- **الغرض:** سياسات الموافقات لكل عملية: تحديد هل العملية تتطلب موافقة مباشرة أو عبر طلب اعتماد أو معطّلة، مع عتبات قيمية.
- **الأعضاء الرئيسية:**
  - أنواع: `ApprovalPolicyMode = 'DIRECT' | 'APPROVAL' | 'DISABLED'`، `ApprovalPolicy`، `ApprovalOperationDefinition`.
  - `APPROVAL_OPERATIONS` — قائمة العمليات القابلة للضبط.
  - `ApprovalPolicyService.getPolicies()` / `getPolicy(operationCode)` / `setPolicy(input)`.
  - `assertCanExecute(operationCode, actor)` — رفض التنفيذ إن كانت السياسة تتطلب اعتمادًا.
  - `isOperation(operationCode)` — تحقق من أن الكود عملية معروفة.

### `src/services/domains/approvals/ApprovalQueryService.ts`
- **الغرض:** استعلامات طلبات الموافقة والإحصائيات وإنهاء الصلاحية تلقائيًا.
- **الأعضاء الرئيسية:**
  - `ApprovalQueryService.getRequests(status, search, type)` — قائمة الطلبات مع فلاتر.
  - `getStats()` — عدّادات حسب الحالة (pending/approved/rejected/cancelled/expired).
  - `expireRequests()` — تعليم الطلبات منتهية الصلاحية (داخلية).

### `src/services/domains/approvals/ApprovalRequestService.ts`
- **الغرض:** إنشاء طلبات الموافقة وإلغاؤها ومساعدات متخصصة (مثل طلبات تسوية المخزون والخصومات المعتمدة).
- **الأعضاء الرئيسية:**
  - `ApprovalRequestService.createRequest(input)` — إنشاء طلب عام.
  - `createInventoryAdjustmentRequest(input)` — طلب تسوية مخزون مخصص.
  - `cancel(id)` — إلغاء طلب.
  - `findApprovedDiscountRequest(customerId, amount)` — البحث عن خصم معتمد مطابق.
  - `resolveReferenceBranch(...)` — تحديد فرع المرجع (داخلية).
- **ملاحظات:** يتحقق من السياسة عبر `ApprovalPolicyService` قبل الإنشاء؛ يستخدم `BranchAccessService` و`AuthService`.

### `src/services/domains/approvals/ApprovalService.ts`
- **الغرض:** الواجهة الموحّدة (facade) لخدمة الموافقات؛ يجمع الوظائف من الخدمات المتخصصة ويعيد تصدير الأنواع.
- **الأعضاء الرئيسية:**
  - `export type { ApprovalRequest, ApprovalType, CreateApprovalRequestInput }`.
  - `ApprovalService` مع `getRequests` / `getStats` / `createRequest` / `decide` / `cancel` / `findApprovedDiscountRequest` — تفويض للخدمات الفرعية.

### `src/services/domains/approvals/OperationApprovalGate.ts`
- **الغرض:** بوابة تشغيلية لتقييم سياسات الموافقة على العمليات: هل يُنفَّذ مباشرة أم يتطلب طلب اعتماد، وإنشاء الطلب ومتابعته واستهلاكه.
- **الأعضاء الرئيسية:**
  - أنواع: `OperationApprovalEvaluation`، `PendingOperationApprovalInput`.
  - `OperationApprovalGate.evaluate(operationCode, value?)` — تقييم السياسة للعملية.
  - `requestApproval(input, db?)` — إنشاء طلب اعتماد معلق.
  - `findApproved(...)` / `assertApproved(...)` — البحث عن اعتماد صالح والتأكد منه.
  - `consume(approvalId, referenceType, referenceId, db?)` — استهلاك الاعتماد بعد استخدامه.
  - `throwRequested(approvalId)` — رمي خطأ يشير إلى طلب معلق.
- **ملاحظات:** يُستخدم مباشرة من `ProductService` وخدمات أخرى؛ يعتمد على `ApprovalPolicyService` و`ApprovalService` و`AuthService` و`BranchAccessService`.

### `src/services/domains/approvals/approvalTypes.ts`
- **الغرض:** تعريفات الأنواع لطلبات الموافقة.
- **الأعضاء الرئيسية:**
  - `ApprovalType` — اتحاد أنواع الطلبات (DISCOUNT، PRICE_CHANGE، SALES_RETURN، STOCK_ADJUSTMENT، PURCHASE_ORDER، EXPENSE، INVOICE_VOID، LEAVE… إلخ).
  - `ApprovalRequest` — بنية طلب الموافقة الكاملة (الحالة، القيم، القرار، السجل).
  - `CreateApprovalRequestInput` — مدخلات إنشاء الطلب.

---

## notifications

### `src/services/domains/notifications/LicenseNotificationService.ts`
- **الغرض:** إشعارات المنصة المتعلقة بالتراخيص/الاشتراكات لكل مستأجر (إنشاء، قراءة، تعليم كمقروء).
- **الأعضاء الرئيسية:**
  - `LicenseNotificationService` (singleton عبر `getInstance`).
  - `getNotifications(tenantId, options)` — جلب إشعارات المستأجر.
  - `markAsRead(notificationId)` / `markAllAsRead(tenantId)` — تحديث حالة القراءة.
  - `createNotification(input)` — إنشاء إشعار داخلي.
  - `licenseNotificationService` — مثيل مُصدَّر جاهز.
- **ملاحظات:** يعمل على جدول `platform_notifications` ويخدم لوحة المنصة المركزية.

### `src/services/domains/notifications/NotificationPreferencesService.ts`
- **الغرض:** إدارة تفضيلات الإشعارات لكل مستخدم (تنبيهات المخزون/المدفوعات/النظام).
- **الأعضاء الرئيسية:**
  - `NotificationPreferencesService.getPreferences()` — جلب تفضيلات المستخدم الحالي.
  - `updatePreferences(dto)` — تحديث التفضيلات.
  - `getDefaultPreferences()` — القيم الافتراضية.
- **ملاحظات:** تستهلكها `NotificationServicePart01` لتصفية الإشعارات حسب التفضيلات.

### `src/services/domains/notifications/NotificationService.ts`
- **الغرض:** الصنف العام لخدمة الإشعارات؛ يرث السلسلة Part02 → Part01 ويعيد تصدير أنواع الإشعارات.
- **الأعضاء الرئيسية:**
  - `export * from '../../../types/notifications'` — إعادة تصدير الأنواع.
  - `NotificationService extends NotificationServicePart02 {}` — لا منطق إضافي.

### `src/services/domains/notifications/NotificationServicePart01.ts`
- **الغرض:** الطبقة الأولى من خدمة الإشعارات: استعلامات الجلب، العدّ، تعليم كمقروء/محذوف، إنشاء الإشعارات، وفحص تنبيهات المخزون المنخفض/النافد.
- **الأعضاء الرئيسية:**
  - `NotificationServicePart01` (abstract).
  - `getNotifications(userId?, unreadOnly)` / `getUnreadCount(userId?)` — استعلامات مع تصفية حسب التفضيلات.
  - `markAsRead(id)` / `markAllAsRead(userId?)` / `deleteNotification(id)` / `deleteAllNotifications(userId?)`.
  - `createNotification(type, title, message, userId?, referenceType?, referenceId?)` — إدراج إشعار.
  - `notifyOnce(...)` — إنشاء إشعار فقط إن لم يوجد غير مقروء بنفس المرجع.
  - `checkLowStockAlerts()` — فحص المخزون المنخفض والنافد وإنشاء تنبيهات.
  - `preferencesFor` / `isNotificationEnabled` — منطق تصفية التفضيلات (داخلية).
- **ملاحظات:** يستخدم `AuthService` و`PermissionService` (صلاحية `ui.notifications.list.manage`) وجدول `notification_preferences`.

### `src/services/domains/notifications/NotificationServicePart02.ts`
- **الغرض:** الطبقة الثانية: الفحوصات المجدولة للتنبيهات (أقساط، شيكات، أحداث مالية، موافقات معلقة، فواتير متأخرة) وتنبيهات العملاء غير المكتملين.
- **الأعضاء الرئيسية:**
  - `NotificationServicePart02 extends NotificationServicePart01`.
  - `runScheduledChecks()` — تشغيل كل فحوصات التنبيه المجدولة وإرجاع عدد الجديد.
  - `notifyFinancialEventOnce(userId, eventId, reminderKey, ...)` — تنبيه حدث مالي مرة واحدة لكل مفتاح تذكير.
  - `notifyIncompleteCustomer(customerId, customerName, missingFields)` — تنبيه بيانات عميل ناقصة.
- **ملاحظات:** يعتمد على `HrAlertsService` لتنبيهات الموارد البشرية، و`BranchAccessService` و`PermissionService` لحدود الفروع، ويستعلم جداول installments/cheques/financial_calendar_events/approval_requests/sales_invoices.

---

## security

### `src/services/domains/security/AuditService.ts`
- **الغرض:** خدمة تدقيق SQL للقراءة: سجل التدقيق، الخط الزمني الموحّد (أعمال + دخول)، الإحصائيات، وقائمة الوحدات.
- **الأعضاء الرئيسية:**
  - أنواع: `AuditLogEntry`، `AuditFilters`، `AuditStats`، `AuditTimelineSource`، `AuditTimelineEntry`، `AuditTimelineFilters`، `AuditTimelineStats`.
  - `AuditService.getAuditTimeline(filters)` / `getAuditTimelineStats()` / `getAuditTimelineModules()` — استعلامات الخط الزمني.
  - `log(entry)` — كتابة قيد تدقيق.
  - `getAuditLogs(filters)` / `getAuditLogById(id)` / `getAuditStats()` / `getModulesList()` — استعلامات السجل.
  - `getTimelineQuery` / `getTimelineWhere` — بناء الاستعلامات (داخلية).
- **ملاحظات:** يقرأ من جدول `audit_logs` ويجمع مصادر "business" و"login" في خط زمني واحد.

### `src/services/domains/security/SecurityService.ts`
- **الغرض:** خدمة الأمان المركزية (singleton): تشفير AES، جلسات المستخدمين، كلمات المرور، النسخ الاحتياطية المشفرة، المصادقة الثنائية، إعدادات الأمان، المقاييس، ونظرة عامة أمنية.
- **الأعضاء الرئيسية:**
  - `export type { ActiveSession, LoginRecord, SecurityOverview }`.
  - `SecurityService.getInstance()` / `initialize()` — دورة حياة المفرد.
  - `encryptData(data, key)` / `decryptData(encryptedData, key)` — تشفير/فك تشفير.
  - `createUserSession` / `verifyPassword` / `logout` — إدارة الجلسات وكلمات المرور.
  - `createEncryptedBackup(backupData, password)` / `validateBackupIntegrity(...)` — النسخ المشفرة.
  - `setupTwoFactorAuth` / `confirmTwoFactorAuth` / `disableTwoFactorAuth` / `setTwoFactorAuth` — المصادقة الثنائية.
  - `getPasswordPolicy` / `getSecurityStatus` / `getMetrics` / `trends` / `getOverview` — تقارير الأمان.
  - `generateSecurityReport` — تقرير نصي مع توصيات.
  - `getActiveSessions` / `getLoginHistory` / `revokeSession` / `revokeUserSessions` — مراقبة الجلسات.
  - `updateConfig` / `loadConfig` / `saveConfig` / `defaultConfig` / `isValidConfig` — إدارة الإعدادات.
  - `securityService` — مثيل مُصدَّر.
- **ملاحظات:** يعتمد على `twoFactorAuth`/`twoFactorAuthRepository` و`passwordPolicy` (من دومين auth)، `auditLogger`، `localCache`، `performanceMonitor`، `bcryptjs`، و`backupEncryption` من البنية التحتية.

### `src/services/domains/security/auditLogger.ts`
- **الغرض:** مسجّل تدقيق على مستوى النظام (singleton) مع حفظ دوري على القرص، تنبيهات للأحداث الحرجة، وتصدير CSV وأرشفة.
- **الأعضاء الرئيسية:**
  - أنواع: `AuditLog`، `SecurityEvent`.
  - `AuditLoggerService.getInstance()` / `initialize()` / `stopScheduledFlush()` — دورة الحياة.
  - `log(...)` — تسجيل حدث تدقيق.
  - `logSecurityEvent(...)` — تسجيل حدث أمني بمستوى خطورة محسوب.
  - `getLogs(filter?)` / `exportLogsToCSV(filter?)` / `archiveLogs(dateBefore)` — استعلام وتصدير وأرشفة.
  - `getSystemStats()` — إحصائيات النظام.
  - `emitAlert` / `getSeverityForEvent` / `flushToDisk` / `startScheduledFlush` — داخليات.
  - `auditLogger` — مثيل مُصدَّر.

### `src/services/domains/security/auditWriter.ts`
- **الغرض:** كاتب خفيف لقيود التدقيق (دالة واحدة) يُستخدم من الخدمات الأخرى لكتابة سجل تدقيق موحّد.
- **الأعضاء الرئيسية:**
  - `AuditWriteEntry` — واجهة مدخل القيد.
  - `writeAuditLog(entry)` — كتابة قيد تدقيق في قاعدة البيانات.
- **ملاحظات:** يُستورد مباشرة (مثلًا في `salesInvoiceHandlers` ضمن effects) بدلًا من `AuditService.log`.

---

## purchases

### `src/services/domains/purchases/PurchaseOrderService.ts`
- **الغرض:** أوامر الشراء (PO): إنشاء، تتبع حالة، استقبال كميات، سجل استلامات، ومتابعة التوريد.
- **الأعضاء الرئيسية:**
  - أنواع: `PurchaseOrderStatus` (DRAFT…CANCELLED)، `PurchaseOrderRow`، `PurchaseOrderItem`، `CreatePurchaseOrderDTO`.
  - `getAllOrders(search, status)` / `getOrderById(id)` — استعلامات.
  - `createOrder(dto)` — إنشاء أمر شراء.
  - `updateStatus(id, status)` / `cancelOrder(id)` — دورة الحياة.
  - `receiveOrder(id)` / `receiveQuantities(id, requested, notes?)` — الاستلام (ينشئ فاتورة شراء عبر `PurchaseService`).
  - `getReceiptHistory(orderId)` / `updateFollowUp(id, expectedDate, notes)` — سجل ومتابعة.
- **ملاحظات:** يستورد `PurchaseService` لإنشاء فواتير الشراء عند الاستلام، و`CustomerSupplyService` و`round2` و`unscaleMoneyRow`.

### `src/services/domains/purchases/PurchaseRequestService.ts`
- **الغرض:** طلبات الشراء الداخلية (PR): إنشاء، عرض، وقرارات الاعتماد/الرفض/التحويل لأمر شراء.
- **الأعضاء الرئيسية:**
  - أنواع: `PurchaseRequestStatus` (PENDING…CANCELLED)، `RequestPriority`، `PurchaseRequest`، `PurchaseRequestItemInput`.
  - `getRequests(search, status)` / `getProjectRequests(projectId)` / `getItems(requestId)` — استعلامات.
  - `createRequest(input)` — إنشاء طلب مع بنود.
  - `decide(id, status)` — قرار على الطلب (APPROVED/REJECTED/ORDERED/CANCELLED).
- **ملاحظات:** يستورد `ProjectService` لربط الطلبات بالمشاريع، و`BranchAccessService` لتحديد النطاق.

### `src/services/domains/purchases/PurchaseReturnService.ts`
- **الغرض:** مرتجعات المشتريات: عرض المرتجعات، الأصناف القابلة للإرجاع، إنشاء مرتجع مع حركة مخزون ودفعة/قيد، إحصائيات وأسباب الإرجاع.
- **الأعضاء الرئيسية:**
  - أنواع: `ReturnablePurchaseItem`، `PurchaseRefundMethod` (CASH/BALANCE)، `PurchaseReturnRow`، `PurchaseReturnStats`، `CreatePurchaseReturnDTO`.
  - `getAllReturns(search, dateFrom?, dateTo?)` / `getReturnById(id)` — استعلامات.
  - `getReturnableItems(purchaseId)` — الأصناف المتاحة للإرجاع من فاتورة.
  - `createReturn(dto)` — إنشاء مرتجع (يعكس المخزون ويسجل دفعة/قيد).
  - `getStats()` / `getTopReturnReasons(limit?)` — تقارير.
- **ملاحظات:** يستخدم `InventoryCostingService` و`InventoryLocationStockService` لعكس تكلفة الطبقات، `postLedgerEntry` للقيود، ويتحقق من نطاق الفروع والصلاحيات.

### `src/services/domains/purchases/PurchaseService.ts`
- **الغرض:** فواتير المشتريات: إنشاء مع بنود وتكاليف وصول وتوزيعها، تسجيل دفعات، حذف/إلغاء مع عكس المخزون والدفعات والقيود، وتكلفة متوسط مرجّحة.
- **الأعضاء الرئيسية:**
  - `CreatePurchaseDTO` — مدخلات الفاتورة (بنود، تكاليف وصول، دفعات…).
  - `PurchaseService.getAllPurchases(search?)` / `getPurchaseById(id)` — استعلامات.
  - `createPurchase(dto)` — إنشاء فاتورة شراء كاملة (مخزون + تكلفة + قيود).
  - `recordPayment(...)` — تسجيل دفعة على الفاتورة.
  - `deletePurchase(purchaseId, reason)` — حذف/إلغاء مع التحقق والعكس.
  - داخليات: `preparePurchaseItems`، `distributeLandedCosts`، `calculateMatchingVariance`، `persistPurchaseItems`، `linkGoodsReceiptCostLayers`، `reversePurchaseInventory`، `reversePurchasePayments`، `postPurchaseVoidLedger`، `logPurchaseDeletion`، `ensurePurchaseHasNoReturns`، `validatePurchaseInventoryDeletion`، `ensurePurchaseItemStockIsAvailable`، `costingMethod`.
- **ملاحظات:** أكبر خدمة مشتريات؛ تتكامل مع `InventoryCostingService`/`InventoryLocationStockService` (طبقات تكلفة)، `CustomerSupplyService`، `computeWeightedAverageCost`/`round2` من finance، `postLedgerEntry`، `ModuleRegistryService`، و`BusinessRecordSyncService`.

---

## effects

### `src/services/domains/effects/EffectEngine.ts`
- **الغرض:** محرك تنفيذ التأثيرات الجانبية (side effects) عبر السجل المسجّل.
- **الأعضاء الرئيسية:**
  - `EffectEngine` — `run(ctx, effects)` ينفّذ كل التأثيرات، و`runIfAny` ينفّذ إن وُجدت.
  - `defaultEffectEngine` — مثيل افتراضي مربوط بـ `defaultEffectRegistry`.
- **ملاحظات:** الأنواع (`Effect`، `EffectContext`، `EffectHandler`، `EffectPayload`، `EffectType`) تأتي من `types/effects`.

### `src/services/domains/effects/EffectRegistry.ts`
- **الغرض:** سجلّ (registry) يربط كل نوع تأثير بمعالجاته، مع دعم إلغاء التسجيل.
- **الأعضاء الرئيسية:**
  - `EffectRegistry.register(type, handler)` — يعيد دالة إلغاء التسجيل.
  - `handlersFor(type)` / `has(type)` / `clear()`.
  - `defaultEffectRegistry` — سجل مشترك افتراضي.

### `src/services/domains/effects/handlers/salesInvoiceHandlers.ts`
- **الغرض:** تسجيل المعالجات الجانبية لفاتورة المبيعات على السجل الافتراضي عند استيراد الوحدة.
- **الأعضاء الرئيسية:** (لا صادرات؛ تأثيرات جانبية فقط)
  - تسجيل `ledger.post` — ترحيل قيد محاسبي عبر `postLedgerEntry`.
  - تسجيل `audit.log` — كتابة سجل تدقيق في `audit_logs`.
  - تسجيل `sync.capture` — التقاط السجل للمزامنة عبر `BusinessRecordSyncService`.
- **ملاحظات:** الاستيراد وحده يوصل المعالجات؛ الخدمات تبث التأثيرات والمحرك يوزّعها.

### `src/services/domains/effects/index.ts`
- **الغرض:** نقطة تصدير موحّدة لموديول التأثيرات.
- **الأعضاء الرئيسية:**
  - إعادة تصدير `EffectEngine`/`defaultEffectEngine` و`EffectRegistry`/`defaultEffectRegistry` والأنواع من `types/effects`.

---

## crm

### `src/services/domains/crm/CrmService.ts`
- **الغرض:** الصنف العام لخدمة CRM؛ يرث السلسلة Part02 → Part01 ويعيد تصدير أنواع CRM.
- **الأعضاء الرئيسية:**
  - `export * from '../../../types/crm'` — إعادة تصدير الأنواع.
  - `CrmService extends CrmServicePart02 {}`.

### `src/services/domains/crm/CrmServicePart01.ts`
- **الغرض:** الطبقة الأولى من CRM: إدارة العملاء المحتملين (Leads) وأنشطتهم.
- **الأعضاء الرئيسية:**
  - `CrmServicePart01` (مع `db` و`requireView`).
  - `getLeads(search, stage?)` / `getLeadById(id)` — استعلامات.
  - `createLead(input)` / `updateLead(id, patch)` / `deleteLead(id)` — CRUD للعملاء المحتملين.
  - `convertLeadToCustomer(id)` — تحويل العميل المحتمل إلى عميل فعلي (ينشئ سجل عميل).
  - `getActivities(search, status?)` — أنشطة CRM.

### `src/services/domains/crm/CrmServicePart02.ts`
- **الغرض:** الطبقة الثانية من CRM: إدارة الأنشطة (إنشاء/إكمال/إلغاء/حذف)، إحصائيات مسار المبيعات، وقائمة العملاء المحتملين النشطين.
- **الأعضاء الرئيسية:**
  - `CrmServicePart02 extends CrmServicePart01`.
  - `createActivity(input)` / `completeActivity(id)` / `cancelActivity(id)` / `deleteActivity(id)`.
  - `getPipelineStats()` — إحصائيات حسب مرحلة العميل المحتمل.
  - `getActiveLeadsForSelect()` — قائمة مبسطة للنماذج.

---

## organization

### `src/services/domains/organization/BranchService.ts`
- **الغرض:** إدارة الفروع: CRUD، الفرع الافتراضي، إحصائيات، ربط المستودعات بالفروع، وإسناد المستخدمين للفروع ونطاق وصولهم (فرع معيّن أو الكل).
- **الأعضاء الرئيسية:**
  - `BranchService.getAllBranches()` / `getBranchById(id)` / `getDefaultBranch()` — استعلامات.
  - `createBranch(dto)` / `updateBranch(id, updates)` / `setBranchActive` / `deleteBranch(id)` — CRUD.
  - `getBranchWarehouses(branchId)` / `assignWarehouseToBranch` / `removeWarehouseFromBranch` — ربط المستودعات.
  - `getBranchUserAssignments(branchId)` / `updateBranchUserAssignments(branchId, userIds)` — إسناد المستخدمين.
  - `getUserBranches(userId)` / `getUserBranchScope(userId)` / `getUserAssignedBranchIds(userId)` — نطاق المستخدم.
  - `assignUserToBranch` / `removeUserFromBranch` / `setUserBranchScope` / `updateUserBranchAccess` — إدارة وصول المستخدم.
  - `getBranchStats()` / `isUserAssignedToBranch` / `requireBranchAccess` — فحص وإحصائيات.
  - داخليات: `resolveCompanyForNewBranch`، `getBranchRow`، `mapBranch`، `hasBranchesOutsideScope`.
- **ملاحظات:** يستخدم `BranchAccessService` في خدمات أخرى للتحقق من نطاق الفرع؛ `requireBranchAccess` بوابة أساسية للصلاحيات على مستوى الفرع.

### `src/services/domains/organization/CompanyService.ts`
- **الغرض:** إدارة الشركات (مستوى أعلى من الفروع): CRUD، التفعيل/التعطيل، والتحقق من الهرمية بين الشركات.
- **الأعضاء الرئيسية:**
  - `CompanyService.getAllCompanies(includeInactive?)` / `getCompanyById(id)` — استعلامات.
  - `createCompany(dto)` / `updateCompany(id, patch)` / `deactivateCompany(id)` — CRUD.
  - `scopeClause(actor)` — بناء نطاق الشركة حسب المستخدم (داخلية).
  - `isDescendant(candidateId, ancestorId)` — التحقق من الهرمية (داخلية).
  - `mapCompany(row)` — تحويل الصف (داخلية).

---

## workshop

### `src/services/domains/workshop/WorkshopService.ts`
- **الغرض:** أوامر ورشة العمل: إنشاء وإدارة أوامر العمل، فحص الجودة (قائمة فحص)، قطع الغيار، موافقة العميل بالتوقيع، وإحصائيات لوحة التحكم.
- **الأعضاء الرئيسية:**
  - أنواع: `WorkOrderStatus`، `InspectionStatus`، `PartStatus`، `WorkshopWorkOrder`، `InspectionItem`، `WorkOrderPart`، `CustomerApproval`.
  - `DEFAULT_INSPECTION_CHECKLIST` — قائمة الفحص الافتراضية حسب الفئة.
  - `getWorkOrders(filters?)` / `getWorkOrderById(id)` — استعلامات.
  - `createWorkOrder(input)` / `updateWorkOrder(id, patch)` / `transitionStatus(id, status)` — دورة حياة أمر العمل.
  - `recalculateTotals(id)` — إعادة حساب الإجماليات.
  - `getInspectionItems` / `saveInspectionItem` / `deleteInspectionItem` — بنود الفحص.
  - `getWorkOrderParts` / `addPart` / `updatePartStatus` — قطع الغيار.
  - `approveWorkOrder(workOrderId, input)` / `getApprovals(workOrderId)` — موافقة العميل.
  - `getDashboardStats(branchId?)` — إحصائيات الورشة.
- **ملاحظات:** يستخدم `currentBranchId` و`requireView`/`requireManage` للتحقق من الصلاحية؛ مرتبط بالعملاء والمنتجات عبر معرّفات.

---

## suppliers

### `src/services/domains/suppliers/SupplierService.ts`
- **الغرض:** إدارة الموردين: دليل الموردين، تسجيل الدفعات وتخصيصها لفواتير الشراء، كشف حساب المورد، وإعادة تخصيص الدفعات.
- **الأعضاء الرئيسية:**
  - `SupplierService.getAllSuppliers(search?, includeInactive?)` / `getSupplierById(id)` — استعلامات.
  - `createSupplier(supplier)` / `updateSupplier(id, updates)` — CRUD.
  - `recordPayment(...)` — تسجيل دفعة مورد مع تخصيص لفواتير.
  - `getSupplierStatement(supplierId, fromDate?, toDate?)` — كشف حساب المورد.
  - `getInvoicesWithAllocations(supplierId)` / `getPaymentsWithAllocations(supplierId)` — فواتير ودفعات مع التخصيصات.
  - `reallocateSupplierPayment(paymentId, allocations)` — إعادة توزيع دفعة على فواتير.
  - `requireSuppliersView` / `requireSuppliersDirectory` / `readSupplier` / `buildSuppliersQuery` / `fetchSuppliers` — داخليات.
- **ملاحظات:** يكمل `PurchaseService` في تتبع مستحقات الموردين؛ يستخدم `OperationApprovalGate` لاعتماد دفعات الموردين الكبيرة و`MasterDataSyncService` للمزامنة، و`AuthService`/`PermissionService` للبوابات.

---

## retail

### `src/services/domains/retail/RetailWorkspaceService.ts`
- **الغرض:** لوحة تحكم مساحة التجزئة: إحصائيات المبيعات، المنتجات الأكثر مبيعًا، المخزون المنخفض، ملخص انتهاء الصلاحية، الضمانات، والطلبات المفتوحة.
- **الأعضاء الرئيسية:**
  - أنواع: `RetailWorkspaceStats`، `RetailTopProduct`، `RetailLowStockRow`، `RetailExpirySummary`، `RetailOpenOrder`.
  - `RetailWorkspaceService.getStats()` — إحصائيات عامة.
  - `getTopProducts(days?, limit?)` — المنتجات الأكثر مبيعًا.
  - `getLowStockRows(limit?)` — صفوف المخزون المنخفض.
  - `getExpirySummary()` — ملخص قرب انتهاء الصلاحية.
  - `getWarrantyStats()` — إحصائيات الضمانات (من `WarrantyClaimService`).
  - `getOpenOrders(limit?)` — الطلبات المفتوحة.
- **ملاحظات:** يستخدم `ExpiryService` للانتهاء و`WarrantyClaimService` للضمان؛ يطبّق نطاقات الفواتير والطلبات حسب الفرع/الصلاحية.

---

## restaurant

### `src/services/domains/restaurant/RestaurantService.ts`
- **الغرض:** إدارة المطعم: الطاولات، قائمة الطعام، الطلبات بأنماط (محلي/سفري/توصيل)، حالة المطبخ، الفوترة عبر `SalesService`، وإنتاج الوصفات عبر `ManufacturingService`.
- **الأعضاء الرئيسية:**
  - أنواع: `RestaurantServiceMode`، `RestaurantKitchenStatus`، `RestaurantTable`، `RestaurantMenuItem`، `RestaurantOrderItem`، `RestaurantOrder`، `CreateRestaurantOrderInput`.
  - `getTables()` / `createTable(tableNumber, capacity?)` / `setTableActive` — إدارة الطاولات.
  - `getMenuItems()` / `addMenuItem(productId, warehouseId)` / `setMenuItemAvailability` — إدارة القائمة.
  - `getOpenOrders()` / `createOrder(input)` / `updateKitchenStatus(itemId, nextStatus)` / `cancelOrder(orderId)` — دورة الطلب.
  - `billOrder(orderId, paymentType?)` — إنشاء فاتورة مبيعات (`SalesService`) وإرجاع `SalesInvoice`.
  - داخليات: `getOrder`، `getOrderItems`، `getItemForUpdate`، `startRecipeProduction`، `completeRecipeProduction`، `audit`.
- **ملاحظات:** يتكامل مع `ManufacturingService` لإنتاج الوصفات (`ProductionOrder`) و`SalesService` للفوترة، ويسجل تدقيقًا لكل عملية.

---

## professional

### `src/services/domains/professional/TimeBillingService.ts`
- **الغرض:** خدمات احتساب الوقت للمحترفين: قيود الوقت على المشاريع، دورة الحالة (مسودة/مُرسل/معتمد/مفوتر)، دفعات فوترة، الربحية، وملخص غير المفوتر.
- **الأعضاء الرئيسية:**
  - أنواع: `TimeEntryStatus`، `TimeEntry`، `BillingBatch`.
  - `getProjects()` / `getEmployees()` — قوائم مساعدة.
  - `getTimeEntries(filters?)` / `getTimeEntryById(id)` — استعلامات.
  - `createTimeEntry(input)` / `updateTimeEntry(id, patch)` / `transitionStatus(id, status)` — CRUD ودورة الحالة.
  - `submitEntries(ids)` / `approveEntries(ids)` — إجراءات جماعية.
  - `getBatches(status?)` / `createBatch(input)` / `markBatchInvoiced(batchId, invoiceId)` — دفعات الفوترة.
  - `getProfitability(filters?)` / `getUnbilledSummary()` — تقارير.
- **ملاحظات:** مرتبط بالمشاريع والموظفين عبر معرّفات؛ يستخدم `currentBranchId` و`requireView`/`requireManage` للتحقق من النطاق.

---

## hospitality

### `src/services/domains/hospitality/HospitalityService.ts`
- **الغرض:** إدارة الفنادق: أنواع الغرف والغرف وحالاتها، الحجوزات ودورة إقاماتها، حساب النزيل (folio) والرسوم الليلية، ومهام التدبير المنزلي، وإحصائيات لوحة التحكم.
- **الأعضاء الرئيسية:**
  - أنواع: `RoomStatus`، `HousekeepingStatus`، `ReservationStatus`، `HotelRoomType`، `HotelRoom`، `HotelReservation`، `HotelFolioEntry`، `HousekeepingTask`.
  - `getRoomTypes` / `saveRoomType` — أنواع الغرف.
  - `getRooms` / `getRoomsByFloor` / `saveRoom` / `setRoomStatus` / `setHousekeepingStatus` — الغرف والحالات.
  - `getReservations(filters?)` / `getReservationById` / `createReservation` / `updateReservationStatus` — الحجوزات.
  - `getFolio` / `getFolioBalance` / `postNightlyCharges(date?)` / `addFolioEntry` — حساب النزيل والرسوم.
  - `getHousekeepingTasks` / `createHousekeepingTask` / `updateHousekeepingTask` — مهام التدبير.
  - `getDashboardStats(branchId?)` — إحصائيات.
  - داخليات: `nightsBetween`، `currentBranchId`، `requireView`/`requireManage`.
- **ملاحظات:** يعمل على مستوى الفرع؛ `postNightlyCharges` يرحّل رسوم الإقامة الليلية تلقائيًا لحجوزات CHECKED_IN.

---

## education

### `src/services/domains/education/EducationService.ts`
- **الغرض:** إدارة التعليم: الفصول الدراسية والجداول الأسبوعية، تسجيل الطلاب (كعملاء)، الحضور، وأقساط الرسوم مع تسجيل المدفوعات.
- **الأعضاء الرئيسية:**
  - أنواع: `EnrollmentStatus`، `AttendanceStatus`، `FeeStatus`، `EduClass`، `ClassSchedule`، `Enrollment`، `AttendanceRecord`، `FeeInstallment`.
  - `DAY_NAMES` — أسماء أيام الأسبوع بالعربية.
  - `getTeachers()` / `getClasses` / `saveClass` — المعلمون والفصول.
  - `getSchedules` / `getWeeklyGrid` / `saveSchedule` / `deleteSchedule` — الجداول.
  - `getEnrollments` / `enrollStudent` / `updateEnrollmentStatus` — التسجيل.
  - `getAttendance` / `getClassRoster` / `markAttendance` / `getAttendanceStats` — الحضور والإحصائيات.
  - `getFeeInstallments` / `addFeeInstallment` / `recordFeePayment` / `markOverdueFees` — الرسوم.
  - `currentBranchId` / `requireView` / `requireManage` — تحكم الوصول (داخلية).
- **ملاحظات:** الطلاب هم سجلات `customers`؛ مرتبط بالفروع والصلاحيات.

---

## ceramics

### `src/services/domains/ceramics/CeramicsService.ts`
- **الغرض:** قطاع السيراميك: مخزون السيراميك بالدفعات، التصميمات ومتغيراتها، حساب المساحات وعروض أسعار التوريد، عينات العرض، أوامر خدمات التركيب/القص، والعمولات.
- **الأعضاء الرئيسية:**
  - أنواع: `CeramicQuoteStatus`، `CeramicDesignVariant`، `CeramicDesign`، `CeramicStockRow`، `CeramicAreaQuote`، `CeramicAreaCalculation`، `CeramicSampleRow`، `CeramicTopDesign`، `CeramicServiceType`، `CeramicServiceStatus`، `CeramicServiceOrder`، `CeramicCommissionStatus`، `CeramicCommission`.
  - `getStockRows(search?)` — مخزون السيراميك.
  - `getDesigns(search?)` — التصميمات مع المتغيرات.
  - `calculateArea(input)` — حساب المساحة والتكلفة.
  - `getAreaQuotes` / `saveAreaQuote` / `updateAreaQuoteStatus` / `deleteAreaQuote` — عروض أسعار المساحات.
  - `getProductBatches(productId)` — دفعات المنتج (من `BatchService`).
  - `getDisplaySamples()` / `getTopSellingDesigns(days?, limit?)` — عينات وأكثر التصميمات مبيعًا.
  - `convertTakeoffToQuotation(quoteNumber)` — تحويل عرض المساحة إلى عرض سعر عبر `QuotationService`.
  - `getServiceOrders` / `saveServiceOrder` / `updateServiceOrderStatus` / `deleteServiceOrder` — أوامر الخدمات.
  - `getCommissions` / `saveCommission` / `updateCommissionStatus` / `deleteCommission` — العمولات.
  - `getDashboardStats()` — إحصائيات لوحة التحكم.
- **ملاحظات:** يتكامل مع `QuotationService` (عروض الأسعار)، `BatchService` (دفعات المنتج)، و`OperationalFieldService` (الحقول التشغيلية للتصاميم)، ويتحقق من تفعيل الوحدة عبر `ModuleRegistryService`.

---

## ملاحظات عامة

- كل الخدمات تعتمد على `DatabaseManager` للاستعلامات (غالبًا SQL خام) وعلى `AuthService`/`PermissionService`/`BranchAccessService` للتحقق من الصلاحيات ونطاق الفروع.
- نمط التقسيم `Part01/Part02` متكرر في `notifications` و`crm` لبناء صنف واحد متدرّج.
- بوابة الموافقات المركزية (`OperationApprovalGate` + `ApprovalPolicyService` + `ApprovalEffectRegistry`) تُستخدم من `ProductService` وخدمات أخرى لعمليات مثل الخصومات وتسويات المخزون.
- خدمات القطاعات العمودية (workshop، hospitality، education، professional، restaurant، ceramics، retail) تتبع نمطًا موحّدًا: أنواع TypeScript في أعلى الملف، `currentBranchId()`، `requireView()`/`requireManage()`، ودوال `getDashboardStats`.
- لا توجد ملفات `*.test.ts` ضمن هذه الدومينات في النطاق الموثّق.
</content>
</invoke>
