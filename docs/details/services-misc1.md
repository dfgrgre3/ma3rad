# توثيق طبقة الخدمات — الدومينات المتفرقة (الجزء الأول)

هذا الملف يوثّق ملفات الخدمات تحت `src/services/domains/` للدومينات: projects، manufacturing، customers، config، admin، licensing، dashboard، وprocurement.

---

## projects — المشاريع والإنشاءات

### `src/services/domains/projects/ApartmentEstimateService.ts`
- **الغرض:** خدمة مقاييس/تصميمات الشقق السكنية مع دورات إصدارات الاعتماد وربط عروض الأسعار.
- **الأعضاء الرئيسية:**
  - `ApartmentEstimateService` — الصنف الرئيسي.
  - `getByProject(projectId)` — جلب مقاييس الشقة لمشروع مع التحقق من الصلاحية.
  - `save(input)` — حفظ تصميم/مقايسة شقة وإنشاء إصدار جديد عند تغير الأسعار أو الكميات.
  - `getVersions(estimateId, projectId)` — عرض إصدارات المقايسة وحالاتها.
  - `submitVersionForReview(estimateId, versionId, projectId)` — إرسال أحدث إصدار مسودة/معاد للمراجعة.
  - `decideVersion(estimateId, versionId, projectId, decision, notes?)` — اعتماد أو إعادة إصدار من مراجع مختلف عن المنشئ.
  - `getQuotationLinks(estimateId, projectId)` / `linkQuotation(...)` — عرض وربط عروض الأسعار بتصميم الشقة.
- **ملاحظات:** يعتمد على `ProjectService` للتحقق من نطاق المشروع، وعلى `validateEstimateMeasurements`، ويخزن اللقطات كـ JSON داخل جداول `project_apartment_estimates` وإصداراتها.

### `src/services/domains/projects/ProjectBoqService.ts`
- **الغرض:** مقاييس كميات أعمال عامة (BOQ) للمشاريع غير السكنية، وتعيد استخدام خط أنابيب الإصدارات والاعتماد.
- **الأعضاء الرئيسية:**
  - `BoqLineInput` — مدخل بند مقايسة يدوي (الاسم، الوحدة، الكميات، أسعار المواد/العمالة/المعدات/المصاريف، الهالك، الخصم، الربح).
  - `BoqEstimateSummary` — ملخص مقايسة BOQ وحالة إصدارها الحالي.
  - `boqLineTotal(line)` — حساب قيمة بيع بند BOQ بعد الهالك والربح والخصم.
  - `ProjectBoqService.getByProject(projectId)` — قائمة مقايسات BOQ لمشروع.
  - `getSnapshot(estimateId, projectId)` — استرجاع لقطة إصدار محدد.
  - `save(input)` — إنشاء/تحديث مقايسة BOQ وحفظ إصدار مسودة.
- **ملاحظات:** يخزن BOQ في `project_apartment_estimates` مع `estimate_kind='BOQ'`، لذلك يمكن لخط التنفيذ (`ProjectExecutionService`) التعامل معه كأي مقاييس معتمدة.

### `src/services/domains/projects/ProjectExecutionService.ts`
- **الغرض:** تحويل المقايسة المعتمدة إلى تنفيذ فعلي: عقود، مستخلصات دفع، تكاليف فعلية، تتبع كميات منفذة وملخص محفظة المشاريع.
- **الأعضاء الرئيسية:**
  - `ProjectExecutionSummary` — ملخص عقد/تكلفة/مستخلص/جدول تنفيذي للمشروع.
  - `initializeFromApprovedEstimate(estimateId, projectId, versionId?)` — توليد مهام وبنود ميزانية من البنود المجمعة في الإصدار المعتمد.
  - `createContract(input)` / `getContracts(projectId)` / `updateContractStatus(...)` — دورة عقود المشروع المرتبطة بالإصدار المعتمد.
  - `getCertificates(projectId)` / `createCertificate(input)` / `submitCertificate(id)` / `reviewCertificate(...)` / `recordCertificatePayment(...)` — دورة مستخلصات الدفع والمراجعة.
  - `getActualCosts(projectId)` / `addActualCost(input)` — التكاليف الفعلية للمشروع أو لبند ميزانية.
  - `getVisibleProjects()` / `getContractsAcrossProjects()` / `getCertificatesAcrossProjects()` / `getActualCostsAcrossProjects()` — استعلامات مجمعة ضمن المشاريع المرئية.
  - `getApprovedEstimateOptions(projectId)` / `getLineProgress(...)` / `recordLineProgress(input)` / `getCertificateSuggestion(...)` — تتبع تقدم البنود ومقترحات المستخلصات.
  - `getPortfolioSummary()` / `getSummary(projectId)` — مؤشرات تنفيذ مجمعة وتفصيلية.
- **ملاحظات:** يفرض استخدام أحدث إصدار `APPROVED` فقط، ويتحقق من اعتماد المستخلص من مستخدم مختلف، ويمنع تجاوز قيمة العقود المعتمدة.

### `src/services/domains/projects/ProjectService.ts`
- **الغرض:** الواجهة العامة لإعادة تصدير `ProjectService` وكل أنواعه دون تغيير مسار الاستيراد.
- **الأعضاء الرئيسية:**
  - `ProjectService` — يعاد تصديره من `./ProjectService/index`.
  - أنواع معاد تصديرها: `ProjectStatus`، `ProjectType`، `Project`، `ProjectUnit`، `ProjectProduct`، `ProjectTaskStatus`، `ProjectTaskPriority`، `ProjectRiskSeverity`، `ProjectRiskProbability`، `ProjectRiskStatus`، `ProjectChangeStatus`، `ProjectDeliverableStatus`، `ProjectTask`، `ProjectTaskDependency`، `ProjectTimeEntry`، `ProjectBudgetLine`، `ProjectBudgetSummary`، `ProjectTimeSummary`، `ProjectRisk`، `ProjectChangeRequest`، `ProjectDeliverable`.
- **ملاحظات:** ملف توافق (facade) فقط؛ التنفيذ الفعلي في مجلد `ProjectService/` كسلسلة طبقات وراثية.

### `src/services/domains/projects/ProjectService/index.ts`
- **الغرض:** تركيب نهائي لخدمة المشاريع عبر وراثة سلسلة الطبقات.
- **الأعضاء الرئيسية:**
  - `ProjectService extends DeliverablesLayer` — نقطة الدخول المجمعة للخدمة.
- **ملاحظات:** ترتيب الوراثة: `ProjectServiceCore` ← `ProjectsLayer` ← `UnitsLayer` ← `ProductsLayer` ← `TasksLayer` ← `TimeLayer` ← `BudgetLayer` ← `RisksLayer` ← `ChangeRequestsLayer` ← `DeliverablesLayer`.

### `src/services/domains/projects/ProjectService/budget.ts`
- **الغرض:** طبقة بنود ميزانية المشروع وملخصها.
- **الأعضاء الرئيسية:**
  - `BudgetLayer extends TimeLayer`.
  - `getBudgetLines(projectId)` — بنود الميزانية المخططة والفعلية.
  - `addBudgetLine(input)` — إضافة بند ميزانية بعد التحقق من المشروع والمبالغ.
  - `updateBudgetLine(id, patch)` / `deleteBudgetLine(id)` — تعديل وحذف بند.
  - `getBudgetSummary(projectId)` — إجماليات وتباين الميزانية.
- **ملاحظات:** ترث حراسة الصلاحيات والفرع والتدقيق من الطبقات الأساسية.

### `src/services/domains/projects/ProjectService/changeRequests.ts`
- **الغرض:** طلبات تغيير نطاق/تكلفة/جدول المشروع ودورة اعتمادها.
- **الأعضاء الرئيسية:**
  - `ChangeRequestsLayer extends RisksLayer`.
  - `getChangeRequests(projectId)` — طلبات التغيير لمشروع.
  - `createChangeRequest(input)` — إنشاء طلب مع أثر مالي وزمني.
  - `decideChangeRequest(id, decision, note?)` — اعتماد أو رفض طلب قيد الانتظار.
  - `cancelChangeRequest(id, note?)` — إلغاء طلب من مقدمه أو مستخدم له صلاحية اعتماد.
- **ملاحظات:** يستخدم `ui.projects.list.approve` للقرارات والإلغاء من غير مقدم الطلب.

### `src/services/domains/projects/ProjectService/core.ts`
- **الغرض:** البنية التحتية المشتركة لخدمة المشاريع: قاعدة البيانات، نطاق الفرع/الشركة، صلاحيات الكتابة والاعتماد، التدقيق، وحساب التقدم.
- **الأعضاء الرئيسية:**
  - `ProjectServiceCore` (abstract) — الأساس المشترك لكل الطبقات.
  - `scopedProject(id)` — جلب مشروع ضمن نطاق صلاحيات المستخدم مع العميل وعدد الوحدات والفواتير.
  - `requireProject(id)` — إرجاع مشروع أو رمي خطأ عدم وجود/صلاحية.
  - `requireWrite(permission)` — التحقق من تفعيل وحدة المشاريع والصلاحية المطلوبة.
  - `requireApprove()` — التحقق من صلاحية اعتماد المشاريع.
  - `audit(action, recordId, values?)` — تسجيل حدث في `audit_logs`.
  - `computeProgress(project)` — حساب نسبة تقدم تقريبية من حالة المشروع/الوحدات المسلمة.
- **ملاحظات:** كل الطبقات التالية ترث منه؛ لا يُستخدم مباشرة من الواجهة.

### `src/services/domains/projects/ProjectService/deliverables.ts`
- **الغرض:** مخرجات/تسليمات المشروع ودورة حالتها.
- **الأعضاء الرئيسية:**
  - `DeliverablesLayer extends ChangeRequestsLayer`.
  - `getDeliverables(projectId)` — قائمة مخرجات المشروع.
  - `createDeliverable(input)` — إنشاء مخرج بعنوان وتاريخ استحقاق وحالة.
  - `updateDeliverable(id, patch)` — تعديل عنوان/موعد/حالة/ملاحظات المخرج.
  - `deleteDeliverable(id)` — حذف مخرج بعد التحقق من المشروع.
- **ملاحظات:** أعلى طبقة في السلسلة؛ لذلك `ProjectService` تجمع كل وظائف المشروع من خلالها.

### `src/services/domains/projects/ProjectService/products.ts`
- **الغرض:** بنود منتجات/خدمات مرتبطة بالمشروع (مثل القطع أو المسطحات المخططة).
- **الأعضاء الرئيسية:**
  - `ProductsLayer extends UnitsLayer`.
  - `getProjectProducts(projectId)` — بنود منتجات المشروع.
  - `addProjectProduct(input)` — إضافة منتج بكميات وسعر متفق، مع التحقق من المنتج والوحدة.
  - `updateProjectProduct(id, patch)` — تحديث الكمية المسلمة/السعر/الملاحظات.
  - `deleteProjectProduct(id)` — حذف بند منتج.
- **ملاحظات:** يتحقق أن الوحدة المختارة تتبع نفس المشروع قبل الربط.

### `src/services/domains/projects/ProjectService/projects.ts`
- **الغرض:** CRUD الأساسي للمشاريع: إنشاء، استعلام، تحديث، حذف.
- **الأعضاء الرئيسية:**
  - `ProjectsLayer extends ProjectServiceCore`.
  - `getProjects(search?, status?)` — قائمة مشاريع مع بحث وحالة.
  - `getProjectById(id)` — جلب مشروع واحد ضمن النطاق.
  - `createProject(input)` — إنشاء مشروع مرتبط بعميل وفرع.
  - `updateProject(id, patch)` — تعديل بيانات المشروع مع فحص صلاحية الفرع.
  - `deleteProject(id)` — حذف مشروع غير مرتبط بفواتير.
- **ملاحظات:** أول طبقة وظيفية بعد الأساس؛ تعتمد على `scopedProject` للتدقيق والفلترة.

### `src/services/domains/projects/ProjectService/risks.ts`
- **الغرض:** سجل مخاطر المشروع ودرجاتها.
- **الأعضاء الرئيسية:**
  - `RisksLayer extends BudgetLayer`.
  - `getRisks(projectId)` — مخاطر المشروع.
  - `createRisk(input)` — إضافة خطر بشدة واحتمالية وأثر.
  - `updateRisk(id, patch)` — تحديث بيانات/حالة الخطر.
  - `deleteRisk(id)` — حذف خطر.
- **ملاحظات:** يتحقق من القيم المسموحة من `RISK_SEVERITIES` و`RISK_PROBABILITIES` و`RISK_STATUSES`.

### `src/services/domains/projects/ProjectService/tasks.ts`
- **الغرض:** مهام المشروع وجدولها وتبعياتها.
- **الأعضاء الرئيسية:**
  - `TasksLayer extends ProductsLayer`.
  - `requireTask(projectId, taskId)` — التحقق أن المهمة تتبع المشروع.
  - `getTasks(projectId)` — مهام المشروع مع التبعيات.
  - `createTask(input)` — إنشاء مهمة بحالة/أولوية/تواريخ/تقدم.
  - `updateTask(id, patch)` — تعديل مهمة.
  - `deleteTask(id)` — حذف مهمة وتبعياتها.
  - `addTaskDependency(input)` — إضافة تبعية مع منع الدورات.
  - `removeTaskDependency(projectId, dependencyId)` / `removeTaskDependencyByPair(...)` — حذف تبعية.
- **ملاحظات:** يستخدم DFS لمنع التبعيات الدائرية؛ يدعم حالات TODO/IN_PROGRESS/BLOCKED/DONE/CANCELLED.

### `src/services/domains/projects/ProjectService/time.ts`
- **الغرض:** تسجيل ساعات العمل على المشاريع/المهام وملخص الوقت القابل للفوترة.
- **الأعضاء الرئيسية:**
  - `TimeLayer extends TasksLayer`.
  - `getTimeEntries(projectId)` — سجلات الوقت.
  - `addTimeEntry(input)` — إضافة ساعات (حتى 24) optionally مرتبطة بمهمة.
  - `deleteTimeEntry(id)` — حذف سجل وقت.
  - `getTimeSummary(projectId)` — إجمالي الساعات والساعات القابلة للفوترة.
- **ملاحظات:** يتحقق من المهمة عبر `requireTask` قبل ربط الوقت بها.

### `src/services/domains/projects/ProjectService/types.ts`
- **الغرض:** تعريفات الأنواع والثوابت والتحققات المشتركة لنطاق المشاريع.
- **الأعضاء الرئيسية:**
  - ثوابت الحقول المالية: `PROJECT_MONEY_FIELDS`، `PROJECT_PRODUCT_MONEY_FIELDS`، `PROJECT_BUDGET_MONEY_FIELDS`، `CHANGE_REQUEST_MONEY_FIELDS`.
  - حالات وأنواع أساسية: `ProjectStatus`، `ProjectType`، `ProjectTaskStatus`، `ProjectTaskPriority`، `ProjectRiskSeverity`، `ProjectRiskProbability`، `ProjectRiskStatus`، `ProjectChangeStatus`، `ProjectDeliverableStatus`.
  - واجهات الكيانات: `Project`، `ProjectUnit`، `ProjectProduct`، `ProjectTask`، `ProjectTaskDependency`، `ProjectTimeEntry`، `ProjectBudgetLine`، `ProjectBudgetSummary`، `ProjectTimeSummary`، `ProjectRisk`، `ProjectChangeRequest`، `ProjectDeliverable`.
  - قوائم الحالة: `TASK_STATUSES`، `TASK_PRIORITIES`، `RISK_SEVERITIES`، `RISK_PROBABILITIES`، `RISK_STATUSES`، `DELIVERABLE_STATUSES`.
  - دوال تحقق: `assertDate(value, label)` و`assertAmount(value, label)`.
- **ملاحظات:** الحقول المالية تحتاج `unscaleMoneyRow` عند القراءة من SQLite لأن المبالغ مخزنة بالسنتات.

### `src/services/domains/projects/ProjectService/units.ts`
- **الغرض:** وحدات/عقارات داخل المشروع (شقق، فيلات، محلات) مع تداخل هرمي محدود.
- **الأعضاء الرئيسية:**
  - `UnitsLayer extends ProjectsLayer`.
  - `getUnits(projectId)` — وحدات المشروع.
  - `createUnit(input)` — إضافة وحدة باسم/نوع/مساحة/حالة وربط اختياري بأب.
  - `updateUnit(id, patch)` — تعديل وحدة.
  - `deleteUnit(id)` — حذف وحدة.
- **ملاحظات:** يتحقق أن الأب إن وجد يتبع نفس المشروع؛ حالة التسليم تستخدم في حساب تقدم المشروع.

### `src/services/domains/projects/SiteManagementService.ts`
- **الغرض:** إدارة موقع التنفيذ: المقاولون الفرعيون، التقارير اليومية، ومستخلصات/مدفوعات المقاولين.
- **الأعضاء الرئيسية:**
  - `SubcontractorStatus`، `SiteReportStatus`، `SiteReportItemType`، `SiteReportItemInput` — أنواع حالة/إدخال التقرير.
  - `SiteManagementService.getSubcontractors(projectId?)` / `createSubcontractor(input)` / `updateSubcontractorStatus(id, status)` — مقاولو الباطن.
  - `getDailyReports(projectId?)` / `getDailyReport(id)` / `createDailyReport(input)` / `approveDailyReport(id)` — تقارير الموقع اليومية.
  - `getSubCertificates(projectId?)` / `createSubCertificate(input)` / `submitSubCertificate(id)` / `approveSubCertificate(id)` / `paySubCertificate(id, paymentReference?)` — مستخلصات المقاولين.
- **ملاحظات:** كل الوصول يمر عبر `ProjectService.getProjectById` لفرض نطاق الفرع والصلاحية، مع استقطاع نسبة `retentionPercent` في المستخلصات.

### `src/services/domains/projects/estimateValidation.ts`
- **الغرض:** تحقق محلي من اكتمال وملاءمة بيانات مقاييس الشقق (غرف، جدران، فتحات، بنود تكلفة، دفعات).
- **الأعضاء الرئيسية:**
  - `validateEstimateMeasurements(input)` — دالة التحقق الرئيسية التي تعيد قائمة أخطاء عربية.
- **ملاحظات:** تفحص الأبعاد الموجبة، مساحة الغرف والمضلعات، تداخل الفتحات مع الجدران، بنود التكلفة، ومجموع الدفعات مقابل القيمة النهائية.

---

## manufacturing — التصنيع

### `src/services/domains/manufacturing/ManufacturingService.ts`
- **الغرض:** الواجهة/الواجهة المجمعة لنطاق التصنيع؛ تفوّض التنفيذ إلى وحدات داخل `ManufacturingService/`.
- **الأعضاء الرئيسية:**
  - `ManufacturingService` — الصنف المجمّع الذي ينشئ `ManufacturingContext` وكل الوحدات.
  - إعادة تصدير كل أنواع `ManufacturingService/types` وأنواع HSE.
  - مجموعات أساليب عامة: مراكز العمل وخطوط الإنتاج، BOM، أوامر الإنتاج ودورة حياتها، العمليات والمواد، الجودة والعيوب، الصيانة، التكاليف والقدرة والجدولة وOEE وعمالة المشغلين، التوقفات، MRP/MPS، التتبع، وHSE.
- **ملاحظات:** هو نقطة الدخول الوحيدة المفضلة للمستهلكين؛ يحتوي أساليب delegation لكل دوال الوحدات الفرعية.

### `src/services/domains/manufacturing/ManufacturingService/boms.ts`
- **الغرض:** قوائم المواد (BOM): إنشاء/تعديل/تفعيل/أرشفة، تكلفة مقدرة، متطلبات الأوراق، وتنبيهات المخزون.
- **الأعضاء الرئيسية:**
  - `BomsModule` — وحدة BOM.
  - `getBoms(productId?)` / `getBom(id)` — استعلام BOMs مع عناصرها.
  - `createBom(input)` / `updateBom(id, input)` — إنشاء وتعديل BOM في حالة `DRAFT` فقط.
  - `activateBom(id)` / `archiveBom(id)` — دورة حالة BOM مع منع تعدد النسخ النشطة لنفس المنتج.
  - `getBomCostEstimate(bomId)` / `getBomLeafRequirements(bomId, quantity?)` — تكلفة متدرجة ومتطلبات المواد النهائية.
  - `getBomStockAlerts()` — تنبيهات نقص مكونات BOM حسب نقاط إعادة الطلب.
  - `getBomOperations(bomId)` / `setBomOperations(...)` — عمليات التوجيه لمراكز العمل.
- **ملاحظات:** يحسب تكلفة المكونات المتداخلة بشكل تكراري، ويتحقق من وحدات القياس ومراكز العمل التابعة لنفس الفرع.

### `src/services/domains/manufacturing/ManufacturingService/context.ts`
- **الغرض:** سياق مشترك للوحدات: قاعدة البيانات، نطاق الفرع، صلاحيات، حارس تفعيل الوحدة، والتدقيق.
- **الأعضاء الرئيسية:**
  - `ManufacturingContext` — يحمل `db` و`branchAccess`.
  - `require(permission)` — مستخدم مصادق مع صلاحية محددة.
  - `requireAny(permissions)` — قبول أي صلاحية من قائمة مع fallback لتوافق manufacturing.manage/view.
  - `guardWrites()` — التأكد أن وحدة manufacturing مفعّلة.
  - `audit(action, recordId, values?)` — تسجيل حدث في `audit_logs`.
- **ملاحظات:** كل الوحدات تستقبل نفس النسخة من السياق من `ManufacturingService`.

### `src/services/domains/manufacturing/ManufacturingService/costing.ts`
- **الغرض:** تقارير التكاليف والقدرة والجدولة وتحليلات التصنيع.
- **الأعضاء الرئيسية:**
  - `CostingModule` — وحدة التحليلات والتخطيط.
  - `getProductionOrderCost(orderId)` — تكلفة أمر إنتاج (مواد + وقت تشغيل/أوفرهيد).
  - `getProductionCostReport()` — تقرير تكاليف مجمع.
  - `getMaterialShortages()` / `getPurchaseSuggestions()` / `createPurchaseRequestsFromShortages(input?)` — نواقص المواد واقتراحات/طلبات شراء.
  - `getCapacityPlan()` / `getProductionSchedule(options?)` — أحمال مراكز العمل وجدولة الأوامر حسب الورديات والسعات.
  - `getManufacturingAnalytics()` / `getOeeAnalytics()` / `getOperatorLaborSummary()` / `getOperatorLaborDaily()` — مؤشرات تشغيلية، OEE، وملخصات عمالة المشغلين.
- **ملاحظات:** يعتمد على `ProductionOrdersModule` لقراءة الأوامر والعمليات، ويستخدم `InventoryCostingService` و`postLedgerEntry` في مسارات المخزون/التكلفة.

### `src/services/domains/manufacturing/ManufacturingService/downtime.ts`
- **الغرض:** تسجيل واستعلام توقفات الإنتاج.
- **الأعضاء الرئيسية:**
  - `DowntimeModule` — وحدة التوقفات.
  - `recordDowntime(input)` — تسجيل توقف بدقائق وسبب وربط اختياري بمركز عمل/عملية/أمر إنتاج.
  - `getDowntimeRecords(filter?)` — استعلام توقفات حسب مركز/أمر/فترة.
  - `getDowntimeRecord(id)` — سجل توقف مفرد.
- **ملاحظات:** يتحقق من صحة الارتباطات ويستخدمها `CostingModule` في حساب OEE.

### `src/services/domains/manufacturing/ManufacturingService/hse.ts`
- **الغرض:** الصحة والسلامة والبيئة (HSE): حوادث، تصاريح عمل، فحوصات، وتدريبات.
- **الأعضاء الرئيسية:**
  - واجهات: `HseIncident`، `HsePermit`، `HseInspection`، `HseTraining`.
  - `HseModule` — وحدة HSE.
  - الحوادث: `getHseIncidents(filter?)` / `createHseIncident(input)` / `updateHseIncidentStatus(id, status, correctiveAction?)`.
  - التصاريح: `getHsePermits(filter?)` / `createHsePermit(input)` / `approveHsePermit(id, conditions?)` / `cancelHsePermit(id)` / `getHsePermitAlerts(withinDays?)`.
  - الفحوصات والتدريبات: `getHseInspections(filter?)` / `createHseInspection(input)` / `getHseTrainings(filter?)` / `createHseTraining(input)`.
- **ملاحظات:** يفصل العرض عن الإدارة عبر `requireView`/`requireManage` ويفحص انتهاء التصاريح والتدريبات.

### `src/services/domains/manufacturing/ManufacturingService/maintenance.ts`
- **الغرض:** صيانة المعدات والمراكز الوقائية/التصحيحية/التنبؤية وجدولة التكرار.
- **الأعضاء الرئيسية:**
  - `MaintenanceModule` — وحدة الصيانة.
  - `createMaintenance(input)` — إنشاء سجل صيانة بجدولة وتكرار اختياري.
  - `getMaintenance(id)` / `getMaintenanceRecords(filters?)` — استعلام سجلات الصيانة.
  - `updateMaintenance(id, input)` — تحديث الحالة/التكلفة/الملاحظات، وإنشاء الصيانة الوقائية التالية عند الإكمال.
  - `getMaintenanceAlerts(withinDays?)` — الصيانة المتأخرة والقريبة الاستحقاق.
- **ملاحظات:** يرحّل تكلفة الصيانة إلى دفتر الأستاذ عند الإكمال، ويكرار السجلات الوقائية تلقائيًا.

### `src/services/domains/manufacturing/ManufacturingService/mrp.ts`
- **الغرض:** تخطيط متطلبات المواد (MRP) وجدول MPS زمني الأفق واحتياجات الشراء/الإنتاج.
- **الأعضاء الرئيسية:**
  - واجهات: `MrpMaterialNeed`، `MrpPlannedProduction`، `MrpPlan`، `MrpMpsPlanned`، `MrpTimeBucket`، `TimePhasedMrp`.
  - `MrpModule` — وحدة التخطيط.
  - `getMrpPlan()` — خطة احتياجات المواد من أوامر البيع/الإنتاج والمخزون المتاح.
  - `createPurchaseRequestsFromMrp(input?)` / `createProductionOrdersFromMrp(input?)` — تحويل الخطة إلى طلبات.
  - `getMpsEntries(status?)` / `createMpsEntry(input)` / `cancelMpsEntry(id)` — سجل التخطيط الرئيسي للمبيعات.
  - `getTimePhasedMrp(weeks?)` — MRP مجدول على فترات زمنية.
- **ملاحظات:** يعتمد على `BomsModule` و`ProductionOrdersModule`، ويحسب تواريخ الاحتياج من توجيهات العمليات والمخزون/الحجوزات.

### `src/services/domains/manufacturing/ManufacturingService/productionOrders.ts`
- **الغرض:** دورة حياة أوامر الإنتاج: إنشاء، اعتماد، إصدار، تشغيل العمليات، صرف/استهلاك المواد، الإكمال، الجودة، إعادة العمل، وربط أوامر البيع.
- **الأعضاء الرئيسية:**
  - `ProductionOrdersModule` — وحدة أوامر الإنتاج.
  - استعلامات: `getProductionOrders(branchId?)` / `getProductionOrder(id)` / `getProductionFloor()` / `getOrderInternal(id)` / `loadOrderMaterials(orderId)` / `loadOrderOperations(orderId)`.
  - دورة الأمر: `createProductionOrder(input)` / `updateProductionOrder(...)` / `requestOrderApproval(id)` / `approveProductionOrder(id)` / `rejectProductionOrder(...)` / `releaseOrder(id)` / `startOrder(...)` / `completeOrder(...)` / `cancelOrder(...)`.
  - العمليات والمواد: `startOperation` / `completeOperation` / `skipOperation` / `setOperationOperator` / `consumeMaterial` / `assignOrderToShift`.
  - الجودة/إعادة العمل/المخزون: `getQcHeldQuantity` / `createReworkOrder` / `getReworkOrders` / `getWipValuation`.
  - ربط البيع: `getSalesOrderProductionCandidates` / `createProductionOrderFromSalesItem` / `getSalesOrderProductionProgress` / `syncSalesOrderStatus`.
- **ملاحظات:** الوحدة الأكبر والأكثر ارتباطًا؛ تستخدم FIFO/التكلفة، القيود المحاسبية، حجوزات المخزون، وحالات اعتماد منفصلة عن حالة التنفيذ.

### `src/services/domains/manufacturing/ManufacturingService/quality.ts`
- **الغرض:** فحوصات الجودة على الإنتاج: إنشاء/تعديل الفحوص، أكواد العيوب، وقرارات قبول/إتلاف/إعادة عمل/إرجاع.
- **الأعضاء الرئيسية:**
  - `QualityModule` — وحدة الجودة.
  - `createQualityCheck(input)` / `getQualityCheck(id)` / `getQualityChecks(productionOrderId?)` / `updateQualityCheck(...)` — دورة فحوصات الجودة.
  - `recordQualityDisposition(id, disposition, quantity, notes?)` — تنفيذ قرار ACCEPT/SCRAP/REWORK/RETURN على الكميات المحجوزة.
  - `getDefectCodes(includeInactive?)` / `createDefectCode(input)` / `deactivateDefectCode(id)` — إدارة أكواد العيوب.
- **ملاحظات:** يعتمد على `ProductionOrdersModule` لإرجاع أوامر إعادة العمل ومزامنة حالة أمر البيع، ويستخدم حركات مخزون وقيودًا محاسبية عند الإفراج/الإتلاف.

### `src/services/domains/manufacturing/ManufacturingService/shared.ts`
- **الغرض:** ثوابت ودوال تحقق مشتركة صغيرة للوحدات.
- **الأعضاء الرئيسية:**
  - `DATE_PATTERN` — نمط تاريخ YYYY-MM-DD.
  - `PRIORITIES` — أولويات الإنتاج LOW/MEDIUM/HIGH/URGENT.
  - `assertDate(value, label)` — التحقق من صيغة التاريخ.
- **ملاحظات:** لا يحتوي منطق أعمال؛ يقلل التكرار بين الوحدات.

### `src/services/domains/manufacturing/ManufacturingService/traceability.ts`
- **الغرض:** تتبع دفعات المواد والمنتجات من المشتريات/استلام البضائع إلى أوامر الإنتاج.
- **الأعضاء الرئيسية:**
  - `TraceabilityModule` — وحدة التتبع.
  - `getOrderTraceability(orderId)` — تتبع مكونات أمر إنتاج إلى دفعات/موردين/سندات استلام/عمليات.
  - `getMaterialTraceability(filter)` — استعلام عكسي حسب دفعة منتج، إذن استلام، شراء، أو مورد.
- **ملاحظات:** يقرأ طبقات المخزون (`inventory_layers`) و`material_issue_lines` لربط الإنتاج بالمشتريات.

### `src/services/domains/manufacturing/ManufacturingService/types.ts`
- **الغرض:** كل نماذج البيانات وDTOs الخاصة بنطاق التصنيع.
- **الأعضاء الرئيسية:**
  - الحالات: `BomStatus`، `ProductionOrderStatus`، `ProductionPriority`، `ProductionMaterialStatus`، `ProductionOperationStatus`.
  - الكيانات الأساسية: `WorkCenter`، `ProductionLine`، `BomItem`، `BillOfMaterials`، `BomOperation`، `ProductionOrderMaterial`، `ProductionOrderOperation`، `ProductionOrder`، `ProductionOrderCost`، `ProductionCostReport`، `ProductionScheduleRow`، `WorkCenterLoad`، `SalesOrderProductionCandidate`، `MaterialShortage`، `BomStockAlert`، `BomLeafRequirement`، `BomCostEstimate`، `MpsEntry`، `OrderTraceability`، `MaterialTraceability`، `PurchaseSuggestion`، `QualityCheckDefect`، `QualityCheck`، `QualityDefectCode`، `DowntimeRecord`، `MaintenanceRecord`، `ProductionFloorRow`، `WipOrder`، `OeeWorkCenterRow`، `OperatorLaborRow`، `OperatorLaborDailyRow`، `ProductionScheduleOptions`.
  - DTOs: `CreateMpsEntryDTO`، `QualityCheckDefectInput`، `CreateQualityCheckDTO`، `UpdateQualityCheckDTO`، `CreateDowntimeDTO`، `CreateMaintenanceDTO`، `UpdateMaintenanceDTO`، `CreateWorkCenterDTO`، `UpdateWorkCenterDTO`، `CreateProductionLineDTO`، `UpdateProductionLineDTO`، `UpdateBomDTO`، `CreateBomDTO`، `CreateProductionOrderDTO`، `UpdateProductionOrderDTO`، `CreateProductionOrderFromSalesItemDTO`.
- **ملاحظات:** هذا الملف هو المصدر الوحيد للأنواع التي يعيد `ManufacturingService.ts` تصديرها؛ لا يحتوي منطق تنفيذ.

### `src/services/domains/manufacturing/ManufacturingService/workCenters.ts`
- **الغرض:** مراكز العمل وخطوط الإنتاج مع التكاليف والسعات.
- **الأعضاء الرئيسية:**
  - `WorkCentersModule` — وحدة مراكز العمل.
  - `getWorkCenters(branchId?)` / `createWorkCenter(input)` / `updateWorkCenter(id, input)` — CRUD مراكز العمل.
  - `getProductionLines(branchId?)` / `createProductionLine(input)` / `updateProductionLine(id, input)` — CRUD خطوط الإنتاج.
  - `assertLineBelongsToBranch(lineId, branchId)` — التحقق أن خط الإنتاج يتبع نفس فرع مركز العمل.
- **ملاحظات:** يتحقق من الصلاحيات على الفرع، ويفرض عدم ربط مركز عمل غير نشط/فرع آخر بخط إنتاج غير صالح.

---

## customers — العملاء والشركاء

### `src/services/domains/customers/CustomerService.ts`
- **الغرض:** خدمة العملاء: CRUD، بحث/ترقيم، حذف آمن، سندات قبض، كشف حساب، ومزامنة البيانات الرئيسية.
- **الأعضاء الرئيسية:**
  - `CustomerPageFilters` — فلاتر نوع العميل/الحالة/البحث بالرقم الضريبي.
  - `CustomerService.getAllCustomers(search?)` / `getAllCustomersAsync(search?)` — قوائم العملاء ضمن نطاق الشركة.
  - `getCustomersPage(...)` / `getCustomersPageAsync(...)` — استعلام مرقم بفلاتر.
  - `getCustomerById(id)` / `getCustomerByIdAsync(id)` / `getCustomerByPhone(phone)` / `getCustomerByPhoneAsync(phone)` — بحث مفرد.
  - `createCustomer(customer, performedBy?)` / `updateCustomer(id, updates)` / `deleteCustomer(id)` — دورة بيانات العميل مع منع الحذف عند وجود رصيد/فواتير.
  - `recordPayment(...)` — إنشاء سند قبض، تخصيصه على الفواتير المفتوحة، وتحديث النقدية/البنك ودفتر الأستاذ.
  - `deletePayment(paymentId)` — حذف سند قبض غير مرتبط بفواتير/أقساط مع عكس أثره.
  - `getCustomerStatement(customerId)` — كشف حساب العميل بالحركات والفواتير.
- **ملاحظات:** يستخدم `BranchAccessService` و`MasterDataSyncService` و`postLedgerEntry`؛ `recordPayment` يدعم idempotency ويمنع إعادة استخدام مفتاح الدفعة لطلب مختلف.

### `src/services/domains/customers/CustomerSupplyService.ts`
- **الغرض:** طلبات توريد/تجهيز العملاء من المخزون: تسجيل احتياج الفاتورة، تتبع الكميات المستلمة، وتجهيز الطلبات للتسليم.
- **الأعضاء الرئيسية:**
  - `CustomerSupplyStatus` — OPEN/PARTIAL/READY/CANCELLED.
  - `CustomerSupplyRequestItem` و`CustomerSupplyRequest` — نماذج الطلب وبنوده.
  - `CustomerSupplyService.getOpenRequests(filters?)` — طلبات مفتوحة/جزئية/جاهزة ضمن نطاق الشركة والفرع.
  - `getReadyRequests(filters?)` — الطلبات الجاهزة للتسليم.
  - `recordInvoiceDemand(input)` — تسجيل أو زيادة كمية منتج مطلوب لفاتورة/عميل.
  - `allocateReceivedQuantity(warehouseId, productId, receivedQuantity, db?)` — توزيع الكمية المستلمة على الطلبات القديمة.
  - `getReadyForDelivery(filters?)` — طلبات جاهزة مع بحث.
  - `ensureTables()` — إنشاء جداول `customer_supply_requests` و`customer_supply_request_items` عند الحاجة.
- **ملاحظات:** ينشئ الجداول ذاتيًا (`CREATE TABLE IF NOT EXISTS`) ويعتمد على `warehouse_stock`/فواتير المبيعات لتخصيص الواردات.

### `src/services/domains/customers/PartnerService.ts`
- **الغرض:** الواجهة العامة لإعادة تصدير خدمة الشركاء وأنواعها ودالة `signedAmount`.
- **الأعضاء الرئيسية:**
  - `export * from './PartnerService/types'` — جميع أنواع الشركاء.
  - `signedAmount` — إعادة تصدير دالة حساب الإشارة المالية للحركات.
  - `PartnerService` — إعادة تصدير الصنف من `PartnerService/PartnerService`.
- **ملاحظات:** ملف توافق؛ التنفيذ مقسم في مجلد `PartnerService/` كطبقات وراثية.

### `src/services/domains/customers/PartnerService/PartnerService.ts`
- **الغرض:** خدمة الشركاء التجارية: سجل الشركاء، رأس المال، نسب الملكية/الأرباح، كشوفات الحساب، وسجل الحركات.
- **الأعضاء الرئيسية:**
  - `PartnerService extends PartnerTransactionOperations` — الصنف النهائي.
  - `getPartners()` — قائمة الشركاء مع الأرصدة المحسوبة.
  - `getOverview()` — إجماليات الشركاء (رأس مال، مسدد، أرصدة).
  - `getAvailableRegisters()` / `getAvailableBankAccounts()` — وجهات الدفع المتاحة.
  - `getOwnershipBasis()` — أساس حساب الملكية الحالي.
  - `getPartnerCapitalHistory(partnerId)` / `getPartnerStatement(partnerId, filters?)` — تاريخ رأس المال وكشف حركة الشريك.
  - `createPartner(draft)` / `updatePartner(partnerId, draft)` — إنشاء/تعديل شريك مع نسب ودفعات أولية.
  - `getPartnerById(partnerId)` — استرجاع شريك ضمن النطاق (protected).
- **ملاحظات:** يستخدم طبقات `ownership` و`ledger` و`transactions` و`profits`؛ إنشاء/تحديث الشريك يحدّث حسابات الأستاذ والتاريخ ونسب الملكية حسب الوضع AUTO/MANUAL.

### `src/services/domains/customers/PartnerService/attachments.ts`
- **الغرض:** التحقق من مرفقات حركات الشريك (PDF/صور) وتحليلها من JSON.
- **الأعضاء الرئيسية:**
  - `isPartnerAttachment(value)` — type guard لمدخل المرفق.
  - `validateAttachments(attachments)` — التحقق من العدد (3 كحد أقصى) والنوع وحجم/صيغة base64.
  - `parseAttachments(value)` — تحليل حقل `attachments` المخزن كنص JSON.
- **ملاحظات:** يُستخدم عند حفظ مسودات/حركات الشركاء قبل الكتابة.

### `src/services/domains/customers/PartnerService/audit.ts`
- **الغرض:** تسجيل تدقيق موحد لعمليات الشركاء.
- **الأعضاء الرئيسية:**
  - `auditPartner(db, actor, action, recordId, oldValues?, newValues?)` — كتابة حدث في `audit_logs` بالوحدة `PARTNERS`.
- **ملاحظات:** يستدعيه `PartnerServiceBase` ومعظم دوال الملكية/الحركات.

### `src/services/domains/customers/PartnerService/base.ts`
- **الغرض:** الأساس المشترك لعمليات الشركاء: قاعدة البيانات، نطاق الشركة/الفرع، والمساعد `audit`.
- **الأعضاء الرئيسية:**
  - `PartnerServiceBase` (abstract) — يعرّف `db` و`branchAccess` و`auth` المشتركة.
  - `audit(...)` — غلاف محمي حول `auditPartner`.
- **ملاحظات:** بداية سلسلة الوراثة: `PartnerServiceBase` ← `PartnerProfitOperations` ← `PartnerTransactionOperations` ← `PartnerService`.

### `src/services/domains/customers/PartnerService/ledger.ts`
- **الغرض:** حسابات الشريك في شجرة الحسابات، قيود الترحيل، وتأثير الحركات النقدية على الصناديق.
- **الأعضاء الرئيسية:**
  - `partnerCapitalAccountCode(partnerId)` / `partnerCurrentAccountCode(partnerId)` / `partnerReceivableAccountCode(partnerId)` — أكواد حسابات الشريك.
  - `createPartnerLedgerAccounts(db, partnerId, partnerName)` — إنشاء حسابات رأس المال/حساب جاري/ذمم لكل شريك.
  - `transactionLabel(type)` — تسمية عربية لنوع حركة الشريك.
  - `cashDelta(type, amount)` — أثر الحركة على النقدية.
  - `getPostingLines(...)` — بنود القيد المحاسبي للحركة.
  - `applyCashMovement(...)` — تحديث رصيد الصندوق عند الدفع/الاسترداد النقدي.
- **ملاحظات:** يضمن أن كل حركة مالية للشريك لها حسابات مقابلة وأثر صحيح على النقدية أو البنك.

### `src/services/domains/customers/PartnerService/money.ts`
- **الغرض:** أدوات المبالغ والتواريخ وحركات النقد للشركاء.
- **الأعضاء الرئيسية:**
  - `MONEY_EPSILON` — تسامح المقارنة المالية.
  - `money(value)` — تقريب المبلغ لحدود العملة.
  - `assertAmount(amount)` / `assertDate(value)` — تحقق من المبلغ/التاريخ.
  - `signedAmount(type, amount)` — إشارة الحركة حسب نوعها.
  - `CASH_AFFECTING_TYPES` — أنواع الحركات التي تؤثر على النقدية.
- **ملاحظات:** `signedAmount` معاد تصديره من `PartnerService.ts` للواجهة العامة.

### `src/services/domains/customers/PartnerService/ownership.ts`
- **الغرض:** محرك نسب الملكية وتوزيع الأرباح وسجل التغييرات التاريخي للشركاء.
- **الأعضاء الرئيسية:**
  - تحققات السعة: `assertOwnershipPercent` / `assertOwnershipCapacity` / `assertProfitShareCapacity` / `areProfitSharesAligned`.
  - حساب وتطبيق: `calculateOwnershipShares` / `applyOwnershipShares` / `applyProfitShares` / `calculateCurrentOwnershipShares`.
  - السجل التاريخي: `recordOwnershipHistory` / `recordCapitalHistory` / `recordProfitShareHistory` / `setOwnershipBasis`.
  - إعادة الحساب: `recalculateOwnershipAfterCapitalMovement`.
- **ملاحظات:** يدعم أساسين للملكية (`AGREED_CAPITAL` و`PAID_CONTRIBUTIONS`) ويمنع تجاوز 100% مع سجل تدقيق لكل تغيير.

### `src/services/domains/customers/PartnerService/profits.ts`
- **الغرض:** توزيع أرباح المبيعات على الشركاء حسب نسب الأرباح، مع دفعات جماعية وتسويات بعد المرتجعات.
- **الأعضاء الرئيسية:**
  - `PartnerProfitOperations extends PartnerServiceBase` (abstract).
  - `distributeProfits(...)` — توزيع ربح إجمالي على جميع الشركاء كدفعة واحدة.
  - `allocateSaleProfit(...)` — تخصيص ربح فاتورة بيع واحدة تلقائيًا.
  - `adjustSaleProfitAllocation(...)` — تعديل التخصيص عند تغيير ربح الفاتورة/المرتجعات.
  - `getProfitDistributionHistory()` / `getProfitDistributionBatch(batchId)` — استعلام دفعات توزيع الأرباح.
  - `postSaleProfitMovement(...)` — ترحيل حركة توزيع الربح محاسبيًا.
- **ملاحظات:** يستدعيه مسار فواتير المبيعات؛ يحترم مجموع نسب الأرباح ≤100% ويسجل حركات `PROFIT_ALLOCATION` و`REVERSAL`.

### `src/services/domains/customers/PartnerService/sql.ts`
- **الغرض:** مقاطع SQL مشتركة لتجميع بيانات الشركاء.
- **الأعضاء الرئيسية:**
  - `PARTNER_SUMMARY_SQL` — تجميع حركات الشريك (أرصدة/إجماليات).
  - `PARTNER_SUMMARY_JOIN` — الربط بين الشركاء وحركاتهم.
  - `PARTNER_SELECT_COLUMNS` — أعمدة عرض الشريك المحسوبة.
- **ملاحظات:** يضمن اتساق استعلامات `getPartners` و`getPartnerById`.

### `src/services/domains/customers/PartnerService/transactions.ts`
- **الغرض:** حركات حسابات الشركاء: إيداعات، مسحوبات، قروض، توزيعات أرباح، وعكس الحركات.
- **الأعضاء الرئيسية:**
  - `PartnerTransactionOperations extends PartnerProfitOperations` (abstract).
  - `postTransaction(draft)` — تسجيل حركة شريك مع تحقق من الرصيد/الصلاحيات.
  - `reverseTransaction(transactionId, reason)` — إنشاء حركة عكسية وإعادة آثارها المحاسبية/النقدية/الملكية.
  - `postTransactionInDb(...)` — تنفيذ الحركة داخل معاملة قاعدة البيانات.
  - `validatePaymentDestination(...)` — التحقق من الصندوق/الحساب البنكي المستلم.
- **ملاحظات:** يعتمد على `ledger` و`ownership` و`money`؛ يدعم الدفع نقدًا أو تحويلًا بنكيًا ويتحقق من أرصدة الصندوق/البنك قبل الخصم.

### `src/services/domains/customers/PartnerService/types.ts`
- **الغرض:** تعريفات كيانات وأنواع الشركاء وحركاتهم.
- **الأعضاء الرئيسية:**
  - أنواع: `PartnerActor`، `PartnerTransactionType`، `PartnerTransactionAction`، `PartnerPaymentType`.
  - واجهات: `BusinessPartner`، `PartnerTransaction`، `PartnerAttachment`، `PartnerDraft`، `PartnerTransactionDraft`، `ProfitAllocation`، `PartnerCashRegister`، `PartnerBankAccount`، `PartnerCapitalHistory`، `PartnerStatementFilters`، `PartnerStatement`، `PartnerOverview`، `PartnerProfitBatch`، `PartnerProfitBatchLine`.
- **ملاحظات:** هذه هي كل الأنواع التي يعيد `PartnerService.ts` تصديرها؛ أنواع الدفع مستمدة من أنواع `PaymentType` العامة.

---

## config — الإعدادات والتكوين

### `src/services/domains/config/ActionRegistryService.ts`
- **الغرض:** حل أوامر/أزرار الإجراءات الحساسة ضد السجل المركزي، الإعدادات، الوحدات، الميزات، والصلاحيات.
- **الأعضاء الرئيسية:**
  - `ResolvedAction` — نتيجة حل الإجراء (visible/enabled/allowed/reason/confirm/sensitive/definition).
  - `ActionRegistryService.list()` — كل تعريفات `ACTION_REGISTRY`.
  - `resolve(id, user?)` — حساب الحالة الكاملة للإجراء وسبب المنع.
  - `assertAllowed(id, actor?)` — فرض التنفيذ قبل أي إجراء حساس.
  - `isVisible(id, user?)` / `isEnabled(id, user?)` — اختصارات حالة.
  - إعادة تصدير: `getActionDefinition`، `isKnownAction`، `ACTION_REGISTRY`.
- **ملاحظات:** يقرأ تجاوزات `AppConfigService` للمجال `action`، ويدعم صلاحيات/أدوار إضافية من `entry.props`.

### `src/services/domains/config/AppConfigService.ts`
- **الغرض:** محرك التكوين الديناميكي للتطبيق: إدخالات ونطاقات متداخلة، صفحات/أقسام/حقول، قواعد نصوص، ترقيم المستندات، قوالب طباعة، إصدارات، واستيراد/تصدير.
- **الأعضاء الرئيسية:**
  - `MAX_APP_CONFIG_IMPORT_LENGTH` — حد حجم JSON المستورد.
  - أنواع: `ScopedAppConfigEntry`، `AppConfigOrigin`، `ResolvedAppConfigEntry`، `AppConfigState`، `AppConfigPageState`، `AppConfigSectionState`، `AppConfigFieldState`، `AppConfigVersion`، `AppConfigScopeVersion`، `ImportedScopeSnapshot`.
  - سياق/تخزين مؤقت: `invalidate()`، `setActiveContext(context)`، `getActiveContext()`، `getState()`، `getResolvedState(context)`، `subscribe(listener)`.
  - قراءة الإدخالات: `getEntry`، `getOrigin`، `resolveEntry`، `getScopeEntries`، `isConfigurationScopeType`، `isEnabled`، `getLabel`، `getText`، `resolveText`.
  - صفحات وحقول: `getPage`، `isPageEnabled`، `getPageLabel`، `getSection`، `getField`.
  - سياسات/قوالب: `getPolicyString`، `getPolicyNumber`، `getPolicyBoolean`، `getPolicyCatalog`، `getNumbering`، `formatNextNumber`، `installNumbering`، `getPrintTemplate`، `getSelectorsForPage`، `getTextRulesForPage`.
  - كتابة الأساس والنطاقات: `saveScopeEntry`، `deleteScopeEntry`، `getScopeVersions`، `restoreScopeVersion`، `saveConfig`، `upsertEntry`، `deleteEntry`، `upsertRule`، `deleteRule`، `reset`.
  - إصدارات/نقل: `exportJson`، `importJson`، `getVersions`، `restoreVersion`.
- **ملاحظات:** القراءة مفتوحة لكل الشاشات لكن الكتابة تتطلب `ui.settings.hub.update`؛ كل تغيير يُتحقق ويُدقق ويُرقّم. حل النطاقات يحترم ترتيب سلطة النطاقات و`canOverrideAtScope`.

### `src/services/domains/config/BusinessProfileService.ts`
- **الغرض:** تطبيق ملف النشاط التجاري على النظام: إنشاء سمات/تعريفات مخصصة للملف، تطبيق صلاحيات مقترحة، وتوحيد تعريفات الحقول.
- **الأعضاء الرئيسية:**
  - `BusinessProfileService.ensureProfileAttributes(names)` — إنشاء سمات نصية للملف وإرجاع المنشأ/الموجود.
  - `ensureProfileAttributeDefinitions(definitions)` — إنشاء تعريفات حقول وسمات بخيارات حسب ملف النشاط.
  - `applyPermissionsFromSettings()` — إنشاء الأدوار والصلاحيات المقترحة من إعدادات الملف.
  - `applyFromSettings()` — مزامنة تعريفات الحقول/السمات مع ملف النشاط الحالي.
- **ملاحظات:** يستخدم جداول السمات والحقول التشغيلية/التعريفات؛ يتجنب ازدواج الأكواد والأسماء.

### `src/services/domains/config/BusinessTypeService.ts`
- **الغرض:** تحديد نوع النشاط التجاري الفعال الافتراضي.
- **الأعضاء الرئيسية:**
  - `DEFAULT_BUSINESS_TYPE` — القيمة الاحتياطية `'ceramics'`.
  - `getEffectiveBusinessType()` — قراءة `businessType` من الإعدادات مع fallback.
  - `BusinessTypeService.getEffectiveBusinessType()` — غلاف ثابت للخدمة.
- **ملاحظات:** نقطة موحدة يستخدمها `ModuleRegistryService` و`TerminologyService` و`ActivityDashboardService` و`ConfigurationVersionService`.

### `src/services/domains/config/CapabilityRegistryService.ts`
- **الغرض:** سجل القدرات (capabilities) كمفردات بديلة عن الوحدات، مع تفعيل واعتماديات ومسارات شاشات.
- **الأعضاء الرئيسية:**
  - `CapabilityActivationAction`، `CapabilityActivationEntry`، `CapabilityState`، `CapabilityChangeResult` — أنواع التفعيل والحالة.
  - `CapabilityRegistryService extends ModuleRegistryService`.
  - `getCapabilityDefinitions()` / `getDefinitions()` / `getCapabilityDefinition(id)` / `isKnownCapability(id)` — كتالوج القدرات.
  - `getEnabledCapabilityIds()` / `isCapabilityEnabled(id)` / `assertCapabilityEnabled(id)` / `getCapabilityState()` — حالة التفعيل.
  - `validateCapabilities(...)` / `withCapabilityDependencies(ids)` — تحقق واعتماديات.
  - `getCapabilityPathOwner(pathname)` / `isKnownScreen(pathname)` / `getManagedCapabilityPaths()` / `getHiddenCapabilityPaths(enabledIds)` — ربط المسارات.
  - `setEnabledCapabilities(...)` / `activateCapability(...)` / `deactivateCapability(...)` — دورة التفعيل.
  - `getCapabilitySettings(id)` / `setCapabilitySetting(...)` — إعدادات القدرة.
- **ملاحظات:** يرث سلوك ModuleRegistryService؛ القدرات مدعومة حاليًا 1:1 مع الوحدات عبر `CAPABILITY_CATALOG`.

### `src/services/domains/config/ConfigurationVersionService.ts`
- **الغرض:** تتبع إصدارات تكوين النشاط (نوع النشاط، الملف، الوحدات المفعلة، المصطلحات) واسترجاعها.
- **الأعضاء الرئيسية:**
  - `ActivityConfigurationSnapshot` — لقطة التكوين المحفوظة.
  - `ActivityConfigurationVersion` — إصدار محفوظ مع منشئه وسببه.
  - `ConfigurationVersionService.recordCurrent(reason, actor?)` — إنشاء إصدار جديد فقط إذا تغيرت اللقطة.
  - `getVersions(actor?, limit?)` — قائمة الإصدارات بحد أقصى 100.
- **ملاحظات:** يتطلب `settings.update` للتسجيل و`audit.view` للقراءة، ويتحقق من صلاحية الوحدات قبل حفظ اللقطة.

### `src/services/domains/config/FeatureService.ts`
- **الغرض:** حل الميزات التجارية (entitlements) مع تفعيل الوحدة والصلاحيات.
- **الأعضاء الرئيسية:**
  - `FeatureResolution` — available/enabled/permitted/allowed وسبب المنع.
  - `FeatureService.getDefinition(id)` / `list()` — كتالوج `FEATURE_REGISTRY`.
  - `setEntitled(id, entitled, actor?)` — حفظ استحقاق ميزة في الإعدادات.
  - `resolve(id, user?, context?)` / `isAllowed(id, user?)` — قرار استخدام الميزة.
- **ملاحظات:** يقرأ `featureEntitlements` من `SettingsService`؛ الافتراضي `defaultEntitled` عندما لا توجد قيمة محفوظة.

### `src/services/domains/config/ModuleRegistryService.ts`
- **الغرض:** سجل وحدات النظام: تعريفات، تفعيل، اعتماديات، إعدادات، وسجل تغييرات.
- **الأعضاء الرئيسية:**
  - `ModuleActivationAction`، `ModuleActivationEntry`، `ModuleState`، `ModuleChangeResult` — أنواع التفعيل.
  - `getDefinitions()` / `getBusinessType()` / `isInventoryTracked()` / `getEnabledModuleIds()` / `isModuleEnabled(moduleId)` / `assertModuleEnabled(moduleId)` — قراءة حالة الوحدات.
  - `getModuleState()` — حالة كل وحدة متاحة/مفعلة.
  - `validate(...)` / `withDependencies(ids)` / `getDeactivationBlocker(moduleId, nextEnabled)` / `countLiveRecords(moduleId)` — تحقق ومنع إيقاف وحدات مستخدمة.
  - `setEnabledModules(...)` / `activate(moduleId, actor?, reason?)` / `deactivate(moduleId, actor?, reason?)` — تغييرات مجمعة/فردية مع تدقيق.
  - `getActivationLog(limit?)` — سجل تفعيل/إيقاف الوحدات.
  - `getModuleSettings(moduleId)` / `setModuleSetting(moduleId, key, value, actor?)` — إعدادات خاصة بالوحدة.
- **ملاحظات:** يعتمد على `MODULE_REGISTRY` و`SettingsService` و`AuditService`؛ يخفي مسارات التنقل تلقائيًا للوحدات غير المفعلة.

### `src/services/domains/config/NavigationService.ts`
- **الغرض:** بناء قائمة التنقل الفعلية حسب الوحدات والقدرات المركزية والصلاحيات وتفضيلات المستخدم والتسميات.
- **الأعضاء الرئيسية:**
  - `NavOverrides` — العناصر المخفية/المجموعات/التسميات/الترتيب/تخصيصات المجموعات.
  - `getRequiredPermission(pathname)` / `getRequiredPermissions(pathname)` / `getRequiredPermissionGroups(pathname)` — اشتراطات صلاحية المسار.
  - `getOverrides()` / `getGroups()` / `getAccessibleGroups(user)` / `getNavigationGroups(user)` / `getFirstAccessiblePath(user)` — مجموعات التنقل المتاحة.
  - `merge(...)` — دمج المجموعات الأساسية مع التخصيصات والترتيب.
  - `saveOverrides(next, actor?)` / `reset()` — حفظ/إعادة تعيين تخصيصات التنقل.
  - `getFlatItems()` — قائمة مسطحة من عناصر القائمة.
- **ملاحظات:** يدمج `ModuleRegistryService` و`CentralLicenseService`/`CentralFeaturePermissionService` و`TerminologyService` و`AppConfigService` و`ROUTE_PERMISSIONS`؛ يعالج ترحيل المجموعات/المسارات القديمة.

### `src/services/domains/config/SettingsService.ts`
- **الغرض:** قراءة وكتابة إعدادات النظام العامة مع تحقق وتطبيع وتحويل FIFO وسلامة المستمعين.
- **الأعضاء الرئيسية:**
  - إعادة تصدير: `bool`، `num`، `Listener`، `SettingsPatch` من `settingsUtils`.
  - `SettingsService.getAllRaw()` — كل الإعدادات كنصوص خام.
  - `getSettings()` — كائن `SystemSettings` الكامل مع القيم الافتراضية.
  - `getValue(key)` — قيمة خام لمفتاح واحد.
  - `update(patch, actor?)` — تحقق من الصلاحية، تطبيق التصحيحات (مثل قيود المستخدمين القابلين للتبديل)، حفظ التغييرات، ومعالجة تفعيل FIFO.
  - `validate(patch)` — تغليف `validateSettings`.
  - `applyCentral(patch)` — تطبيق إعدادات من المنصة المركزية مع إشعار المستمعين.
  - `subscribe(listener)` — الاشتراك في تغييرات الإعدادات.
- **ملاحظات:** عند التحويل إلى `costingMethod='FIFO'` ينشئ قيود افتتاحية للمخزون التاريخي؛ يعتمد على `settingsValidation` و`notifySettings`.

### `src/services/domains/config/settingsUtils.ts`
- **الغرض:** أدوات مساعدة للإعدادات: أنواع، تحويلات أولية، والتحقق من اللون.
- **الأعضاء الرئيسية:**
  - `SettingsPatch` — نوع التعديل الجزئي للإعدادات.
  - `Listener` — دالة مستمع لتغييرات الإعدادات.
  - `HEX_COLOR` — نمط ألوان HEX.
  - `bool(value)` / `num(value, fallback?)` — تحويل قيم خام إلى boolean/number.
  - `subscribeSettings(listener)` / `notifySettings(settings)` — إدارة مستمعي الإعدادات.
- **ملاحظات:** `SettingsService` يعيد تصدير هذه الأعضاء؛ `notifySettings` يعزل أخطاء المستمعين.

### `src/services/domains/config/settingsValidation.ts`
- **الغرض:** التحقق من قيم إعدادات النظام وتحويلها إلى صيغة تخزين نصية آمنة.
- **الأعضاء الرئيسية:**
  - `validateSettings(patch)` — الدالة الوحيدة المصدرة؛ تعيد `Record<string,string>`.
- **ملاحظات:** تتحقق من الألوان، أنماط الأزرار/الزوايا/الكثافة/الخط/الاتجاه/الوضع/التنقل، طريقة التكلفة، طول PIN، اسم المعرض، والعملة؛transform القيم إلى strings/JSON.

### `src/services/domains/config/TerminologyService.ts`
- **الغرض:** حل المصطلحات التجارية (مصطلحات واجهة/تقارير) مع تجاوزات المؤسسة وملف النشاط.
- **الأعضاء الرئيسية:**
  - `BusinessTermSource` — 'organization' | 'profile' | 'language-default'.
  - `TerminologyService.getOverrides()` — قراءة `businessTerminologyOverrides` مع تحقق وسجل تحذير.
  - `getTerm(key)` — حل المصطلح الفعلي بالعربية.
  - `getSource(key, businessType?, overrides?)` — تحديد مصدر المصطلح.
  - `validateOverrides(value)` / `saveOverrides(value, actor?)` — تحقق وحفظ التجاوزات.
- **ملاحظات:** يعتمد على `businessTerminology` و`businessProfiles` و`BusinessTypeService`؛ التجاوزات تُخزن في `SettingsService`.

---

## admin — إدارة البيانات والاستيراد

### `src/services/domains/admin/DataAdminBaseService.ts`
- **الغرض:** أساس خدمات إدارة البيانات: قاعدة البيانات، فحص الصلاحية، حماية الجداول الأساسية، وتسجيل الحذف.
- **الأعضاء الرئيسية:**
  - `DataAdminBaseService` (abstract).
  - `require(permission)` — مستخدم مصادق مع صلاحية محددة.
  - `assertDeletableTable(table)` — رفض الأسماء غير الصالحة والجداول المحمية.
  - `logDeletion(user, description, details)` — تسجيل حدث حذف في `AuditService`.
- **ملاحظات:** ترث منه خدمات التصفح/التصدير/الاستيراد/الحذف؛ يملك `db` من `DatabaseManager`.

### `src/services/domains/admin/DataAdminBrowseService.ts`
- **الغرض:** تصفح قاعدة البيانات المحلية: الجداول، الأعمدة، الصفوف، إحصاءات التخزين، وفحص السلامة.
- **الأعضاء الرئيسية:**
  - `DataAdminBrowseService extends DataAdminBaseService`.
  - `listTables()` — كل جداول SQLite مع عدد الصفوف.
  - `getColumns(table)` — مخطط أعمدة الجدول عبر `PRAGMA table_info`.
  - `getRows(table, options?)` — صفوف مع limit/offset/بحث في الأعمدة النصية.
  - `getStorageStats()` — حجم قاعدة البيانات والتخزين المحلي وعدد الجداول/الصفوف.
  - `integrityCheck()` / `vacuum()` — فحص SQLite وضغط القاعدة مع تدقيق.
  - `getPrimaryKeyColumns(table)` / `listDeletableTables()` / `countTableRows(tables)` — أدوات الحذف والعد.
- **ملاحظات:** يتطلب `admin.data` للقراءة و`admin.data` لإعادة `vacuum`؛ `getPrimaryKeyColumns` لا يفحص الصلاحية داخليًا ويعتمد على الطبقات الأعلى.

### `src/services/domains/admin/DataAdminDeletionService.ts`
- **الغرض:** حذف بيانات الجداول أو سجلات محددة أو نطاق تاريخي بعد أخذ نسخة احتياطية إلزامية.
- **الأعضاء الرئيسية:**
  - `DataAdminDeletionService extends DataAdminBaseService`.
  - `prepareDeletion(reason)` — صلاحية `admin.data.delete` + سبب ≥5 أحرف + snapshot احتياطي.
  - `deleteTableData(tables, reason)` — تفريغ جداول كاملة داخل معاملة مع `defer_foreign_keys`.
  - `deleteRows(table, keys, reason)` — حذف سجلات بمفاتيحها الأساسية.
  - `countByDateRange(table, column, from, to)` — عد سجلات ضمن نطاق تاريخي.
  - `deleteByDateRange(table, column, from, to, reason)` — حذف سجلات ضمن نطاق تاريخي.
  - `getColumns(table)` / `getPrimaryKeyColumns(table)` — مساعدات داخلية.
- **ملاحظات:** أي فشل في `BackupService.createLocalSnapshot` يلغي الحذف؛ الحذف الفعلي يُسجّل ويُفرّغ إلى التخزين.

### `src/services/domains/admin/DataAdminExportService.ts`
- **الغرض:** تصدير جداول قاعدة البيانات إلى بنية أوراق Excel مع إخفاء الأعمدة الحساسة وتسجيل التصدير.
- **الأعضاء الرئيسية:**
  - `DataAdminExportService extends DataAdminBaseService`.
  - `exportTableData(table)` — ورقة واحدة لجدول واحد مع اسم ملف مؤرخ.
  - `exportAllData()` — كل الجداول القابلة للتصدير في ملف `ceramisys_full_export_*`.
  - `getExportSheet(table)` — بناء `{name, columns, rows}` مع استبعاد الأعمدة الحساسة.
  - `logExport(user, description, tables, rowCount)` — تدقيق `DATA_EXPORT`.
- **ملاحظات:** يتطلب `admin.data.export`؛ يحترم `EXPORT_PROTECTED_TABLES` و`isSensitiveExportColumn`.

### `src/services/domains/admin/DataAdminService.ts`
- **الغرض:** واجهة مجمعة لإدارة البيانات؛ تفوّض إلى خدمات التصفح/الحذف/التصدير/الاستيراد وتعيد أنواعها.
- **الأعضاء الرئيسية:**
  - `DataAdminService` — يملك `browse` و`deletion` و`exportService` و`transfer`.
  - استعلامات التصفح: `listTables`، `getColumns`، `getRows`، `getStorageStats`، `integrityCheck`، `vacuum`.
  - تصدير: `exportTableData`، `exportAllData`.
  - استيراد مرن: `previewDataImport`، `importData`.
  - حذف: `deleteTableData`، `deleteRows`، `countByDateRange`، `deleteByDateRange`.
  - مفاتيح/عدّادات: `getPrimaryKeyColumns`، `listDeletableTables`، `countTableRows`.
  - إعادة تصدير: كل أنواع `types/admin/dataAdmin` وثوابت `dataAdminConstants`.
- **ملاحظات:** هذا هو نقطة الدخول المفضلة لواجهة إدارة البيانات؛ لا يحتوي منطق قاعدة بيانات مباشر.

### `src/services/domains/admin/DataAdminTransferService.ts`
- **الغرض:** استيراد بيانات خام من ملفات Excel/جداول إلى جداول SQLite مع معاينة تعارضات وسياسات overwrite/skip.
- **الأعضاء الرئيسية:**
  - `DataAdminTransferService extends DataAdminBaseService`.
  - `previewDataImport(sheets, conflictPolicy?)` — ملخص new/conflict/skipped/sample conflicts لكل ورقة/جدول.
  - `importData(sheets, conflictPolicy?)` — تنفيذ الاستيراد داخل معاملة مع `defer_foreign_keys`.
  - `validateImportSheets(sheets)` — التحقق من أسماء الجداول/الأعمدة/القيم/المفاتيح المكررة.
  - `importValuesEqual(left, right)` — مقارنة قيم مستوردة/موجودة مع تطبيع null/undefined/binary.
- **ملاحظات:** يتطلب `admin.data.import`؛ الجداول في `IMPORT_PROTECTED_TABLES` تُتخطى دائمًا، ويستخدم `queryColumnName` لتحويل snake_case إلى camelCase عند قراءة SQLite.

### `src/services/domains/admin/DataImportBatchService.ts`
- **الغرض:** تسجيل دفعات استيراد العملاء/المنتجات وتتبع السجلات المستوردة وإمكانية التراجع عنها.
- **الأعضاء الرئيسية:**
  - `DataImportBatchService`.
  - `createBatch(entity, sourceName, userId)` — إنشاء دفعة استيراد.
  - `recordImportedEntity(batchId, entityId)` — ربط سجل منشأ بالدفعة.
  - `completeBatch(batchId, created, skipped)` — إغلاق الدفعة بالنتائج.
  - `getImportBatches(entity)` — عرض دفعات الاستيراد.
  - `rollbackImportBatch(batchId)` — حذف السجلات المستوردة إن لم تكن مرتبطة ببيانات أخرى.
  - `getRecordReferences(entityType, entityId)` — فحص المراجع الأجنبية قبل التراجع.
- **ملاحظات:** للتراجع عن العملاء يستخدم `CustomerService.deleteCustomer` ويتحقق من عدم وجود رصيد؛ يفحص جداول FK ديناميكيًا قبل الحذف.

### `src/services/domains/admin/DataImportEntityWriter.ts`
- **الغرض:** كتابة صفوف الاستيراد إلى كيانات محددة (عملاء، موردون، تصنيفات، ماركات، مخازن، موظفون، منتجات).
- **الأعضاء الرئيسية:**
  - `DataImportEntityWriter`.
  - `createContext(options)` — بناء سياق الاستيراد (خيارات الأرصدة/المخزون/المخزن).
  - `importRow(entity, values, context)` — توجيه الصف إلى كيان مناسب وإرجاع id المنشأ عند الحاجة.
  - `getErrorMessage(error)` — استخراج رسالة خطأ مفهومة.
  - دوال داخلية: `importCustomer`، `getCustomerType`، `notifyIncompleteCustomer`، `importSupplier`، `importCategory`، `importBrand`، `importWarehouse`، `importEmployee`، `importProduct`.
- **ملاحظات:** يستخدم خدمات نطاقات أخرى مثل `BrandService` و`OperationsService` و`CustomerService`؛ يمنع التكرار بالاسم/الكود/الهاتف وينشئ أرصدة افتتاحية عند السماح.

### `src/services/domains/admin/DataImportService.ts`
- **الغرض:** خدمة استيراد البيانات المنظمة من جداول البيانات: تحليل، تعيين أعمدة، تحقق، كتابة، دفعات، وتراجع.
- **الأعضاء الرئيسية:**
  - `DataImportService` — يملك `batches` و`writer`.
  - إعادة تصدير: `ENTITY_META`، وأنواع `ImportEntity`/`ImportField`/`ImportIssue`/`ParsedImport`/`ImportOptions`.
  - `parseSheets(sheets)` / `parseRows(headers, rows, preferred?)` — تحويل أوراق بيانات إلى `ParsedImport`.
  - `canOpen(user)` — التحقق من صلاحيات فتح الاستيراد.
  - `getOpeningStockWarehouses()` — مخازن نشطة لرصيد افتتاحي المنتجات.
  - `validate(data)` — التحقق من كل الصفوف.
  - `import(data, options)` — تنفيذ الاستيراد مع تخطي الصفوف الخاطئة وتتبع الدفعة.
  - `getImportBatches(entity)` / `rollbackImportBatch(batchId)` — تفويض لخدمة الدفعات.
  - `createRowValues(row, mapping)` — بناء قيم الصف من تعيين الأعمدة.
- **ملاحظات:** يرفض `entity='dynamic'` هنا لأن الاستيراد الديناميكي يمر عبر `DataAdminTransferService`؛ يتحقق من صلاحية `ENTITY_META[entity].permission` لكل كيان.

### `src/services/domains/admin/dataAdminConstants.ts`
- **الغرض:** ثوابت وأدوات حماية بيانات إدارة النظام.
- **الأعضاء الرئيسية:**
  - `IDENTIFIER` — نمط أسماء الجداول/الأعمدة الآمنة.
  - `CORE_PROTECTED_TABLES` — جداول لا يجوز تفريغها.
  - `EXPORT_PROTECTED_TABLES` و`IMPORT_PROTECTED_TABLES` — قوائم الحماية.
  - `isSensitiveExportColumn(column)` — إخفاء أعمدة حساسة من التصدير.
  - `assertExportableTable(table)` — التحقق قبل التصدير.
  - `RESET_KEEP_BY_DEFAULT` — جداول تُستثنى عند إعادة الضبط.
- **ملاحظات:** تخدم كل خدمات `DataAdmin*` كطبقة أمان موحدة ضد أسماء SQL غير الآمنة والبيانات الحساسة.

### `src/services/domains/admin/dataImportMetadata.ts`
- **الغرض:** بيانات وصفية لكل كيان استيراد: التسمية، الصلاحية، الحقول، والأسماء المستعارة للأعمدة.
- **الأعضاء الرئيسية:**
  - `ENTITY_META` — خريطة للكيانات customers/suppliers/categories/brands/products/employees/warehouses.
- **ملاحظات:** يحدد الحقول المطلوبة والأسماء العربية/الإنجليزية البديلة المستخدمة في `parseImportRows` والكتابة.

### `src/services/domains/admin/dataImportTypes.ts`
- **الغرض:** أنواع الاستيراد المنظم.
- **الأعضاء الرئيسية:**
  - `ImportEntity` — 'customers' | 'suppliers' | 'categories' | 'brands' | 'products' | 'employees' | 'warehouses' | 'dynamic'.
  - `ExistingImportEntity` — كل الكيانات ما عدا dynamic.
  - `ImportField` — حقل مستورد (key/label/aliases/required).
  - `ParsedImport` — بيانات محوّلة (entity/headers/rows/mapping/confidence).
  - `ImportIssue` — أخطاء صف (row/messages).
  - `ImportOptions` — خيارات الأرصدة/المخزون/المخزن/اسم المصدر.
  - `ImportValue` و`ImportRowValues` — أدوات قراءة/رقمنة قيم الصف.
- **ملاحظات:** أساس `dataImportValidation.ts` و`DataImportEntityWriter` و`DataImportService`.

### `src/services/domains/admin/dataImportValidation.ts`
- **الغرض:** تحليل ملفات الاستيراد، تخمين الكيان، تعيين الأعمدة، والتحقق من صحة الصفوف.
- **الأعضاء الرئيسية:**
  - `parseImportRows(headers, rows, preferred?)` — بناء `ParsedImport` مع entity/mapping/confidence.
  - `createImportRowValues(row, mapping)` — كائن قراءة قيم `val/opt/num` للصف.
  - `validateImport(data)` — قائمة `ImportIssue` لكل الصفوف.
- **ملاحظات:** يحتوي دوال داخلية لتخمين الكيان من الأسماء المستعارة، التحقق من الحقول المطلوبة/الفريدة/الرقمية، وقواعد خاصة بكل كيان.

---

## licensing — الترخيص المركزي

### `src/services/domains/licensing/CentralConfigApplier.ts`
- **الغرض:** تطبيق التكوين المركزي الموقّع محليًا: نوع النشاط والوحدات المسموحة.
- **الأعضاء الرئيسية:**
  - `CentralConfigApplier.apply()` — يقرأ `CentralLicenseService.getCachedConfig()` ويحوّل `activityType`/`allowedModules` إلى `SettingsService.applyCentral`.
- **ملاحظات:** يعمل best-effort ولا يعطل التطبيق؛ يعيد استخدام `withModuleDependencies` ويتحقق من معرفات ملفات النشاط المعروفة.

### `src/services/domains/licensing/CentralEstablishmentService.ts`
- **الغرض:** سحب بيانات المنشأة والفروع من المنصة المركزية وتطبيقها على قاعدة البيانات المحلية.
- **الأعضاء الرئيسية:**
  - `CentralEstablishmentSyncResult` — inserted/updated/skipped/error.
  - `CentralEstablishmentService.sync()` — جلب الحمولة من `CentralLicenseService.fetchEstablishment` ثم تطبيقها.
  - `apply(payload)` — تحديث الشركة الافتراضية `cmp_main` وإنشاء/تحديث الفروع بأكواد `CTR-*`، مع احترام `maxBranches`.
- **ملاحظات:** ينشئ خزينة افتراضية لكل فرع جديد، يسجل تدقيق `SYSTEM`، ويكتب `centralEstablishmentSyncedAt` في الإعدادات.

### `src/services/domains/licensing/CentralFeaturePermissionService.ts`
- **الغرض:** واجهة ثابتة لصلاحيات الصفحات/الميزات المركزية؛ تفوّض التنفيذ إلى الجزءين.
- **الأعضاء الرئيسية:**
  - `CentralFeaturePermission` — صلاحية صفحة مركزية (pageUrl, pageVisible, featureEnabled, allowViewOnly, canEdit/Delete/ExportPrint).
  - `CentralAction` — 'view' | 'create' | 'edit' | 'delete' | 'export'.
  - `CentralFeaturePermissionService` — أساليب static تغلف دوال part01/part02: current path، list/forPath، visibility، canView/Edit/Delete/ExportPrint، actionOf/isActionAllowed، disabledPermissions/isPermissionDisabled/allowsPermission.
- **ملاحظات:** هذه هي نقطة الاستيراد العامة؛ المنطق الفعلي في `CentralFeaturePermissionService_part01.ts` و`_part02.ts`.

### `src/services/domains/licensing/CentralFeaturePermissionService_part01.ts`
- **الغرض:** منطق رؤية الصفحات/الميزات حسب المسار والتكوين المركزي المخزن.
- **الأعضاء الرئيسية:**
  - `setCurrentPath(pathname)` / `getCurrentPath()` — تتبع المسار الحالي.
  - `list()` — قائمة `featurePermissions` من الكاش المركزي.
  - `forPath(pathname)` — أفضل تطابق إذن لصفحة (أطول URL مطابق).
  - `isPageVisible(pathname)` — إخفاء القوائم المخفية أو الصفحات/الميزات المعطلة.
  - `canView(pathname)` — يساوي `isPageVisible` حاليًا.
- **ملاحظات:** يقرأ فقط `centralConfigStore`؛ لا يستورد `CentralLicenseService` لتجنب دورة استيراد.

### `src/services/domains/licensing/CentralFeaturePermissionService_part02.ts`
- **الغرض:** صلاحيات الإجراءات على الصفحات بناءً على نوع كود الصلاحية وإعدادات الصفحة المركزية.
- **الأعضاء الرئيسية:**
  - `canEdit(pathname)` / `canDelete(pathname)` / `canExportPrint(pathname)` — فحص إجراء محدد.
  - `actionOf(permissionCode)` — تحويل لاحقة كود الصلاحية إلى `CentralAction`.
  - `isActionAllowed(pathname, action)` — تحقق allowViewOnly/canEdit/canDelete/canExportPrint.
  - `disabledPermissions()` / `isPermissionDisabled(code)` — الصلاحيات المعطلة مركزيًا.
  - `allowsPermission(permissionCode, pathname?)` — دمج التعطيل المركزي مع صلاحية المسار.
- **ملاحظات:** يستخدم `getCurrentPath()` عند عدم تمرير `pathname`؛ الافتراضي للإجراءات المجهولة هو `edit`.

### `src/services/domains/licensing/CentralLicenseService.ts`
- **الغرض:** عميل الترخيص والتكوين المركزي: التفعيل، التحقق، heartbeat، التكوين الموقع، الأجهزة، وإدارة التراخيص.
- **الأعضاء الرئيسية:**
  - `CENTRAL_CONFIG_CHANGED_EVENT` — حدث إعادة تقييم الواجهة عند تغير التكوين.
  - `CentralActivationResult`، `CentralActivationCredentials`، `CentralConfig` — أنواع التفعيل والحمولة الموقعة.
  - إعداد/حالة: `getConfigRevision()`، `getServerUrl()`، `getSecureServerUrl()`، `getStatus()`، `hasCredential()`، `initHardwareBinding()`، `getDeviceId()`، `isConfigured()`.
  - التفعيل: `activate(...)`، `activateFirstRun(...)`، `performActivation(...)`، `hasCompletedFirstRunActivation()`، `markFirstRunActivationComplete()`، `clearActivation()`.
  - التحقق/heartbeat/telemetry: `validate()`، `heartbeat()`، `fetchEstablishment()`، `postTelemetryError(...)`، `fetchReleases()`، `fetchPublicKey()`.
  - التكوين: `verifyConfig(data)`، `fetchConfig()`، `getCachedConfig()`، `subscribe(listener)`، `getActivityType()`، `getAllowedModules()`، `getHiddenMenus()`، `getFeaturePermissions()`، `getUsageLimits()`، `getDisabledPermissions()`.
  - إدارة تراخيص/أجهزة مركزية: `issueLicenseCentral`، `renewLicenseCentral`، `suspendLicenseCentral`، `revokeLicenseCentral`، `transferLicenseCentral`، `setLicenseCouplingModeCentral`، `fetchDevicesCentral`، `suspendDeviceCentral`، `releaseDeviceCentral`، `revokeDeviceCentral`، `detectCloneDevicesCentral`.
- **ملاحظات:** يعتمد على جسر Electron الآمن (`window.ceramisys`)؛ التكوين غير القابل للتحقق يفشل مغلقًا، والتفعيل يخزن الاعتماد عبر الجسر فقط.

### `src/services/domains/licensing/CentralTelemetryService.ts`
- **الغرض:** تقارير الأخطاء وفحص الإصدارات الجديدة من المنصة المركزية.
- **الأعضاء الرئيسية:**
  - `ReleaseInfo` — بيانات إصدار منشور.
  - `isNewerVersion(currentVersion, version)` — مقارنة إصدارات رقمية.
  - `getLatestNewerRelease(releases, currentVersion)` — أحدث إصدار أحدث من الحالي.
  - `CentralTelemetryService.reportError(payload)` / `fetchReleases()` / `checkForUpdates(currentVersion)`.
- **ملاحظات:** كل العمليات best-effort ولا تعطل العمل المحلي؛ يستدعي `CentralLicenseService` للنقل.

### `src/services/domains/licensing/CentralUsageLimitService.ts`
- **الغرض:** الواجهة العامة لخدمة حدود الاستخدام المركزية؛ تعيد تصدير النوع/الحالة/الصنف.
- **الأعضاء الرئيسية:**
  - إعادة تصدير: `CentralUsageMetric` و`CentralUsageState` من part01، و`CentralUsageLimitService` من part02.
- **ملاحظات:** ملف توافق فقط؛ المنطق في part01 (التعريفات/المفاتيح/العدّادات) وpart02 (الحالة والفرض).

### `src/services/domains/licensing/CentralUsageLimitService_part01.ts`
- **الغرض:** تعريفات مقاييس وحدود الاستخدام المركزي ومفاتيحها وعداداتها ورسائلها.
- **الأعضاء الرئيسية:**
  - `CentralUsageMetric` — maxUsers/maxBranches/maxWarehouses/maxEmployees/maxInvoices/maxProducts/maxFacilities/maxPos/storageGb.
  - `CentralUsageState` — metric/limited/allowed/used/reached.
  - `UNLIMITED_TOKENS` — قيم تعني بلا حدود.
  - `METRIC_KEYS` — مفاتيح payload المقبولة لكل مقياس.
  - `COUNTERS` — استعلامات عدّ محلية لكل مقياس ما عدا storageGb.
  - `UNLIMITED_STATE(metric)` — حالة غير محدودة جاهزة.
  - `LIMIT_MESSAGES` — رسائل عربية عند بلوغ الحد.
- **ملاحظات:** `maxInvoices` يعد فواتير الشهر الحالي فقط؛ `storageGb` يُقاس لاحقًا من حجم SQLite.

### `src/services/domains/licensing/CentralUsageLimitService_part02.ts`
- **الغرض:** حساب حالة كل حد استخدام مركزي وفرضه على مستوى الخدمة.
- **الأعضاء الرئيسية:**
  - `CentralUsageLimitService.metrics()` — كل المقاييس.
  - `getState(metric)` — قراءة الحد من `CentralLicenseService.getUsageLimits` وعدّ الاستخدام المحلي.
  - `isReached(metric)` — هل بلغ الاستخدام السقف.
  - `assertWithin(metric)` — رمي خطأ عربي عند بلوغ الحد.
  - `listAll()` — حالات كل المقاييس.
  - `readAllowed`/`toAllowed`/`count`/`storageGb` — قراءة الحدود، تطبيع القيم، عدّ الصفوف، وقياس حجم DB.
- **ملاحظات:** فشل القياس لا يمنع العمل؛ `storageGb` يستخدم `PRAGMA page_count/page_size`.

### `src/services/domains/licensing/centralConfigStore.ts`
- **الغرض:** قراءة مخزنة/مخزنة مؤقتًا للتكوين المركزي من `localStorage` بدون اعتماديات خدمات.
- **الأعضاء الرئيسية:**
  - `readCachedCentralConfig()` — JSON مخزن مع memoization.
  - `getCachedHiddenMenus()` / `getCachedFeaturePermissions()` / `getCachedDisabledPermissions()` / `getCachedUsageLimits()` — قراءات مجالية من `config`.
  - `CachedPermissionLimit` — نوع حدود صلاحيات المنصة.
  - `getCachedPermissionLimits()` — حدود الصلاحيات المركزية للتطبيق في AuthorizationService.
- **ملاحظات:** صُمم لتجنب دورة الاستيراد بين صلاحيات الترخيص والخدمات؛ يعيد null/[] عند غياب البيانات.

---

## dashboard — لوحات المؤشرات

### `src/services/domains/dashboard/ActivityDashboardService.ts`
- **الغرض:** لوحة نشاط مخصصة حسب نوع النشاط التجاري (ceramics/restaurant/hospitality/education/workshop/manufacturing/construction/professional/distribution/retail/generic).
- **الأعضاء الرئيسية:**
  - `ActivityTile`، `ActivityListRow`، `ActivityListSection`، `ActivityProgress`، `ActivityDashboardData` — نماذج لوحة النشاط.
  - `ActivityDashboardService.getDashboard(businessType?)` — اختيار `ActivityDashboardKind` وبناء tiles/progress/sections.
- **ملاحظات:** يجمع خدمات قطاعات متعددة (`RetailWorkspaceService`, `CeramicsService`, `RestaurantService`, `HospitalityService`, `EducationService`, `WorkshopService`, `ManufacturingService`, `ProjectExecutionService`, `TimeBillingService`) و`AccountingService` للمقاييس العامة؛ كل باني يحمي أخطاءه عبر `safe`.

### `src/services/domains/dashboard/DashboardMetricsService.ts`
- **الغرض:** مصدر موحد لمقاييس لوحات التحكم التنفيذية والنظرة العامة مع معالجة أخطاء الصلاحيات/التقييم جزئيًا.
- **الأعضاء الرئيسية:**
  - `ExecutiveDashboardData` — مبيعات/ربح/ديون/مشتريات/اتجاه/منتجات/فواتير/ديون عملاء/فروع/مخزون منخفض.
  - `OverviewDashboardData` — metrics، chartData، topProducts، monthlyComparison، topCustomers، categorySales، gradeSales، paymentDistribution، recentActivities، todayPurchases، purchase aggregates.
  - `PartialDataError` — خطأ قسم جزئي.
  - `DashboardMetricsService.getExecutiveDashboardData(fromStr, toStr)` — لوحة تنفيذية بنطاق الفرع/الشركة.
  - `getOverviewDashboardData()` — لوحة النظرة العامة مع أنشطة ومشتريات اليوم.
  - `getErrors()` — أخطاء الأقسام الجزئية.
  - `translatePaymentMethod(method)` / `formatActivityTimestamp(timestamp)` — تنسيق داخلي.
  - `getRangeDates(range)` / `formatCurrency(value)` — أدوات ثابتة للتواريخ/العملة.
- **ملاحظات:** يصدّر أيضًا `dashboardMetricsService` singleton؛ يتطلب صلاحيات sales/purchases/finance ويستخدم `BranchAccessService` لكل الاستعلامات.

### `src/services/domains/dashboard/DashboardQueryScopeService.ts`
- **الغرض:** نقطة إعادة تصدير موحدة لنطاقات استعلامات اللوحة ودالة مقاييس المالية.
- **الأعضاء الرئيسية:**
  - إعادة تصدير `DashboardQueryScopeService`، `DashboardDb`، `FinanceOverviewMetrics` من part01.
  - إعادة تصدير `queryFinanceOverviewMetrics` من part02.
- **ملاحظات:** يحافظ على مسار الاستيراد القديم بينما التنفيذ مقسم إلى part01/part02.

### `src/services/domains/dashboard/DashboardQueryScopeService_part01.ts`
- **الغرض:** بناة نطاقات SQL للفرع/المصروف/المستودع/الشركة لاستعلامات اللوحات، وواجهات DB/مقاييس.
- **الأعضاء الرئيسية:**
  - `DashboardQueryScopeService.branch(alias, user, includeAllAuthorizedBranches?)` — نطاق فرع عام.
  - `expenseBranch(alias, user)` — نطاق فرع المصروف عبر `cash_registers`.
  - `warehouseBranch(alias, user)` — نطاق فرع المستودع.
  - `company(alias, user)` — نطاق شركة.
  - `DashboardDb` — واجهة تنفيذ SQL (exec).
  - `FinanceOverviewMetrics` — إيرادات/مصروفات/ربح/ذمم/التزامات/نقد/مخزون.
  - `scalar(result)` — استخراج رقم من نتيجة exec.
- **ملاحظات:** يجب تمرير المستخدم صراحة حتى لا ترث الاستعلامات صلاحيات مستخدم آخر.

### `src/services/domains/dashboard/DashboardQueryScopeService_part02.ts`
- **الغرض:** استعلام مجاميع المالية للوحة ضمن نطاقات المستخدم.
- **الأعضاء الرئيسية:**
  - `queryFinanceOverviewMetrics(db, from, to, user)` — يحسب totalRevenue/totalExpenses/netProfit/receivables/payables/cash/inventory من حركات الفرع وليس الأرصدة العامة.
- **ملاحظات:** يراعي فواتير البيع/الشراء/المصروفات/الصناديق/المخازن عبر `DashboardQueryScopeService` و`scalar`.

### `src/services/domains/dashboard/ExecutiveCommandService.ts`
- **الغرض:** مركز قيادة تنفيذي: لمحة KPI شاملة + استعلامات تفصيلية (drilldowns) لكل مؤشر.
- **الأعضاء الرئيسية:**
  - `ExecutiveCommandService` — يملك `aggregates` و`drilldowns`.
  - `getOverview(range)` — يجمع المبيعات/الربح/المصروفات/التحصيلات/الذمم/السيولة/المخزون/النقد/أعلى المنتجات/البطيء/الفروع/الموظفين/الاتجاه/التصنيع.
  - `getDrilldown(key, range)` — توجيه مفتاح المؤشر إلى استعلام سجلات مطابق.
  - `executiveCommandService` — singleton مُصدّر.
  - `commandFormatters` — `{ money, count, numberAr }` للمكونات.
- **ملاحظات:** يتطلب صلاحيات sales/purchases/finance/inventory؛ يعرض ملخص التصنيع فقط عند السماح بالوحدة والصلاحية. أنواع `CommandRange`/`DrilldownKey`/`ExecutiveCommandOverview` تأتي من `types/dashboard/executiveCommand`.

### `src/services/domains/dashboard/ExecutiveCommandService/aggregates.ts`
- **الغرض:** استعلامات تجميعية للقراءة فقط خلف `getOverview`.
- **الأعضاء الرئيسية:**
  - `ExecutiveCommandAggregates` — كل دوال التجميع.
  - المبيعات/المشتريات: `getSalesTotals`، `getExpenseTotals`، `getCollections`.
  - المالية: `getReceivables`، `getLiquidity`، `getProfit`، `getCashFlow`، `getTrend`.
  - المخزون: `getInventoryRows`، `getLowStockRows`، `getTopProducts`، `getSlowMoving`.
  - التشغيل: `getBranchPerformance`، `getEmployeeSales`، `getReceivableInvoiceRows`، `getOverdueInvoiceRows`، `getManufacturingSummary`.
- **ملاحظات:** يعتمد على `CommandScopes` ونطاقات الفرع/الشركة؛ كل دالة تعيد صفوف/مجاميع جاهزة للتنسيق.

### `src/services/domains/dashboard/ExecutiveCommandService/drilldowns.ts`
- **الغرض:** استعلامات السجلات التفصيلية التي تفسر كل مؤشر تنفيذي.
- **الأعضاء الرئيسية:**
  - `ExecutiveCommandDrilldowns` — يبنى فوق `ExecutiveCommandAggregates`.
  - `invoiceDrilldown` / `expenseDrilldown` / `collectionsDrilldown` / `receivablesDrilldown` / `cashDrilldown`.
  - `inventoryDrilldown` / `topProductsDrilldown` / `slowMovingDrilldown` / `lowStockDrilldown`.
  - `branchesDrilldown` / `employeesDrilldown` / `purchasesDrilldown` / `profitDrilldown` / `cashFlowDrilldown` / `manufacturingDrilldown`.
- **ملاحظات:** كل دالة تعيد `DrilldownResult` بأعمدة/صفوف/إجماليات؛ `MAX_DRILLDOWN_ROWS` يحد حجم النتائج.

### `src/services/domains/dashboard/ExecutiveCommandService/formatters.ts`
- **الغرض:** ثوابت وتنسيقات مشتركة لنتائج مركز القيادة.
- **الأعضاء الرئيسية:**
  - `MAX_DRILLDOWN_ROWS` و`SLOW_MOVING_DAYS` — حدود الاستعلامات.
  - `toNumber` / `round2` — تحويلات رقمية.
  - `money` / `count` / `numberAr` — تنسيق عربي للعرض.
  - `paymentStatusLabel` / `paymentTypeLabel` — ترجمات حالة/طريقة الدفع.
- **ملاحظات:** لا يوجد منطق قاعدة بيانات هنا؛ تُستخدم من `ExecutiveCommandService` والمكونات.

### `src/services/domains/dashboard/ExecutiveCommandService/period.ts`
- **الغرض:** تحويل `CommandRange` إلى فترة تنفيذية مع فترة سابقة للمقارنة.
- **الأعضاء الرئيسية:**
  - `resolvePeriod(range)` — يرجع `CommandPeriod` للتواريخ from/to/previous/label/days.
- **ملاحظات:** يدعم today/week/month/year؛ الفترة السابقة لها نفس عدد الأيام مباشرة قبل البداية.

### `src/services/domains/dashboard/ExecutiveCommandService/scopes.ts`
- **الغرض:** بناة نطاقات SQL المشتركة لاستعلامات مركز القيادة.
- **الأعضاء الرئيسية:**
  - `CommandScopes.salesScopes()` / `purchaseScopes()` / `expenseScopes()` — نطاقا branch+company للمبيعات/المشتريات/المصروفات.
  - `warehouseScope()` / `manufacturingScope()` — نطاق المستودع وأوامر الإنتاج.
- **ملاحظات:** يستخدم `AuthService.requireAuth()` و`BranchAccessService`؛ يضمن عزل بيانات كل مستخدم.

---

## procurement — المشتريات والموردون

### `src/services/domains/procurement/ProcurementService.ts`
- **الغرض:** الواجهة النهائية لخدمة المشتريات؛ تجميع كل طبقات السلسلة وإعادة تصدير أنواع المشتريات.
- **الأعضاء الرئيسية:**
  - `export * from '../../../types/procurement'` — إعادة تصدير أنواع مثل `ReorderSuggestion`، `SupplierRfqRow/Item`، `SupplierQuotationRow/Item`، `GoodsReceiptRow/Item`، `SupplierClaimRow/Item`، `ThreeWayMatchingResult`، `LandedCostBreakdownItem`، `SupplierScorecard`، `ProductPriceHistoryEntry`.
  - `ProcurementService extends ProcurementServicePart08` — نقطة الدخول المجمعة.
- **ملاحظات:** كل دوال المشتريات متاحة عبر هذا الكلاس بفضل سلسلة الوراثة Part01→…→Part08.

### `src/services/domains/procurement/ProcurementServicePart01.ts`
- **الغرض:** جذر سلسلة المشتريات: تعريفات مجردة لقراءة سندات الاستلام والمطالبات وحقن DB.
- **الأعضاء الرئيسية:**
  - `ProcurementServicePart01` (abstract).
  - `getGoodsReceiptById(id)` — مجرد.
  - `getClaimById(id)` — مجرد.
  - `readClaimById(id, actor)` — مجرد محمي.
  - `db` — `DatabaseManager` مشترك.
- **ملاحظات:** beginning of chain; implementations arrive in later parts.

### `src/services/domains/procurement/ProcurementServicePart02.ts`
- **الغرض:** طبقة فارغة في سلسلة الوراثة تفصل RFQ عن بقية التنفيذ.
- **الأعضاء الرئيسية:**
  - `ProcurementServicePart02 extends ProcurementSupplierRfqService` (abstract، بلا أعضاء جديدة).
- **ملاحظات:** موجودة فقط للحفاظ على ترتيب السلسلة القابل للقراءة.

### `src/services/domains/procurement/ProcurementServicePart03.ts`
- **الغرض:** إنشاء سندات استلام البضائع (GRN) مع المخزون والدفعات وحالة أمر الشراء.
- **الأعضاء الرئيسية:**
  - `ProcurementServicePart03 extends ProcurementServicePart02` (abstract).
  - `createGoodsReceipt(dto)` — إنشاء GRN داخل معاملة مالية مع `nextNumber('GRN')`.
  - `createGoodsReceiptInTransaction(...)` — إدراج الرأس والبنود وتحديث المخزون/أمر الشراء.
  - `calculateGoodsReceiptTotals` / `goodsReceiptStatus` — مجاميع وحالة القبول.
  - `insertGoodsReceiptHeader` / `insertGoodsReceiptItem` / `insertGoodsReceiptItemRow` — كتابة GRN والبنود.
  - `receiveGoodsReceiptInventory` / `insertProductBatch` — إدخال المخزون والدفعات للمنتجات غير العامة.
  - `updatePurchaseOrderStatus` — تحويل أمر الشراء إلى PARTIAL/RECEIVED.
- **ملاحظات:** يتطلب `ui.purchases.invoices.create`؛ يستخدم `InventoryReceiptService` و`ModuleRegistryService.isInventoryTracked` و`isServiceProduct` لتجنب إدخال الخدمات/المنتجات غير المخزنية.

### `src/services/domains/procurement/ProcurementServicePart04.ts`
- **الغرض:** استعلامات سندات الاستلام والتحقق من تكرار فاتورة المورد ومطابقة ثلاثية (فاتورة/استلام/أمر شراء).
- **الأعضاء الرئيسية:**
  - `ProcurementServicePart04 extends ProcurementServicePart03` (abstract).
  - `getAllGoodsReceipts(search?, status?)` / `getAllGoodsReceiptsAsync(...)` — قوائم GRN مع تفصيل الكميات حسب وحدة المنتج.
  - `getGoodsReceiptById(id)` / `getGoodsReceiptByIdAsync(id)` — GRN مفرد مع البنود.
  - `validateSupplierInvoiceNumber(supplierId, supplierInvoiceNumber?, excludeInvoiceId?)` — منع تكرار رقم فاتورة المورد.
  - `perform3WayMatching(params)` — مقارنة سعر/كمية الفاتورة مقابل أمر الشراء والاستلام.
  - مساعدات: `buildGoodsReceiptsQuery`، `buildReceiptsBreakdownQuery`، `mapReceiptsWithBreakdown`، `buildGoodsReceiptByIdQueries`، `getPurchaseOrderMatchingItems`، `getGoodsReceiptMatchingItems`، `createThreeWayMatchingItem`، `getItemMatchingStatus`، `getOverallMatchingStatus`.
- **ملاحظات:** يستخدم `unscaleMoneyRow`/`getProductUnitLabel`؛ يعيد حالات `MATCHED`/`PRICE_DIFF`/`QTY_DIFF`/`BOTH_DIFF` ومثيلاتها على مستوى الإجمالي.

### `src/services/domains/procurement/ProcurementServicePart05.ts`
- **الغرض:** التكاليف المستلمة (landed cost) وإنشاء مطالبات الموردين.
- **الأعضاء الرئيسية:**
  - `ProcurementServicePart05 extends ProcurementServicePart04` (abstract).
  - `calculateLandedCost(items, expenses, method?)` — توزيع شحن/تحميل/جمارك/تأمين/أخرى على البنود حسب القيمة أو الكمية أو الوزن.
  - `createClaim(dto)` — إنشاء مطالبة مورد مرتبطة بفاتورة/GRN/أمر شراء داخل معاملة مالية.
- **ملاحظات:** `createClaim` يتطلب `ui.purchases.invoices.create` ويتحقق أن كل المستندات المرجعية تتبع الفرع النشط؛ يدرج `supplier_claims` و`supplier_claim_items`.

### `src/services/domains/procurement/ProcurementServicePart06.ts`
- **الغرض:** استعلامات وتسوية مطالبات الموردين بقيود محاسبية.
- **الأعضاء الرئيسية:**
  - `ProcurementServicePart06 extends ProcurementServicePart05` (abstract).
  - `getAllClaims(search?, status?, supplierId?)` / `getAllClaimsAsync(...)` — قوائم مطالبات ضمن نطاق الفرع/الشركة.
  - `getClaimById(id)` / `getClaimByIdAsync(id)` / `readClaimById(id, actor)` — مطالبة مفردة مع البنود وبيانات الفرع الداخلية.
  - `settleClaim(claimId, resolutionType, agreedAmount, notes?)` — تسوية DEBIT_NOTE/REPLACEMENT/REFUND مع تحديث المورد/الصندوق ودفتر الأستاذ.
  - مساعدات: `claimBranchAccess`، `claimScope`، `claimJoins`، `buildClaimsQuery`، `buildClaimByIdQueries`.
- **ملاحظات:** التسوية تتطلب `ui.purchases.invoices.approve`؛ `DEBIT_NOTE` ينشئ قيد 2101/5202 و`REFUND` يزيد الخزينة الافتراضية للفرع.

### `src/services/domains/procurement/ProcurementServicePart07.ts`
- **الغرض:** بطاقة تقييم المورد وتاريخ أسعار المنتج.
- **الأعضاء الرئيسية:**
  - `ProcurementServicePart07 extends ProcurementServicePart06` (abstract).
  - `getSupplierScorecard(supplierId)` — يحسب on-time delivery، قبول/تلف الاستلام، عدد/قيمة المطالبات، ورصيد المورد producing score 0-100 وratingLabel.
  - `getProductPriceHistory(productId)` — سجل أسعار شراء المنتج حسب المورد/الفاتورة/الدفعة.
  - دوال داخلية غير مصدرة: `getDeliveryMetrics` و`getSupplierRatingLabel`.
- **ملاحظات:** كل مقاييسه تحترم نطاقات الفروع (`orderScope`/`grnScope`/`claimScope`/`invoiceScope`) رغم أن بيانات المورد الرئيسية مشتركة.

### `src/services/domains/procurement/ProcurementServicePart08.ts`
- **الغرض:** مقارنة أسعار الموردين لمنتج معين من فواتير الشراء.
- **الأعضاء الرئيسية:**
  - `ProcurementServicePart08 extends ProcurementServicePart07` (abstract).
  - `compareSuppliersForProduct(productId)` — يرجع لكل مورد آخر سعر/أدنى/أقصى/متوسط سعر، كمية، وتاريخ آخر شراء.
- **ملاحظات:** ينهي السلسلة؛ `ProcurementService` ترث منه مباشرة.

### `src/services/domains/procurement/ProcurementSupplierRfqService.ts`
- **الغرض:** طلبات عروض أسعار الموردين (RFQ)، عروض الأسعار، المقارنة، والترسية إلى أمر شراء.
- **الأعضاء الرئيسية:**
  - `ProcurementSupplierRfqService extends ProcurementServicePart01` (abstract).
  - `getReorderSuggestions(warehouseId?)` — منتجات تحت حد الطلب مع كمية مقترحة وتكلفة.
  - `createRfq(dto)` — إنشاء RFQ وبنوده.
  - `getAllRfqs(search?, status?)` / `getAllRfqsAsync(...)` — قوائم RFQ.
  - `getRfqById(id)` / `getRfqByIdAsync(id)` — RFQ مع البنود وعروض الأسعار.
  - `compareQuotationsForRfq(rfqId)` — أفضل سعر لكل منتج وأقل إجمالي.
  - `addSupplierQuotation(dto)` — إضافة عرض سعر وبنوده وتحويل RFQ إلى EVALUATING.
  - `awardQuotation(quotationId, createPurchaseOrder?, warehouseId?)` — قبول عرض، رفض البقية، إنشاء أمر شراء اختياري.
- **ملاحظات:** الترسية تتطلب `ui.purchases.invoices.approve` والإنشاء/إضافة العروض تتطلب `ui.purchases.invoices.create`؛ يُستخدم `unscaleMoneyRow` لتطبيع المبالغ.

---

## ملاحظات عامة

- جميع الخدمات تعتمد غالبًا على `DatabaseManager.getInstance()` و`AuthService`/`PermissionService` و`BranchAccessService`؛ لذلك أي استدعاء خارج جلسة مستخدم مصادق سيفشل مبكرًا.
- المبالغ مخزنة في قاعدة البيانات بالسنتات؛ كثير من الخدمات تستخدم `unscaleMoneyRow` أو `/100.0` عند القراءة و`ROUND(?*100)` عند الكتابة.
- الخدمات الكبيرة مقسمة عمدًا إلى طبقات/وحدات (`ProjectService/`، `ManufacturingService/`، `PartnerService/`، `ProcurementServicePart*`)؛ ملفات الواجهة الرئيسية غالبًا re-export فقط.
- لم يُعثر على ملفات `*.test.ts` داخل النطاقات المطلوبة ضمن هذه الوثيقة.
