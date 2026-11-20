# طبقة خدمات المالية (Finance Domain Services)

توثيق لكل الملفات تحت `src/services/domains/finance/` (~59 ملف `.ts`).

---

## ملفات الجذر (Root)

### `src/services/domains/finance/AccountingService.ts`
- **الغرض:** واجهة خدمة المحاسبة/لوحة المؤشرات والتقارير المالية؛ تفوّض التنفيذ إلى وحدات `AccountingService/` الفرعية (operations + specs + mappers).
- **الأعضاء الرئيسية:**
  - `AccountingService` — كلاس رئيسي يملك `DatabaseManager.getInstance()` و`BranchAccessService`.
  - `getBranchScopeWarning()` — تحذير عند غياب نطاق فرع.
  - `getDashboardMetrics()` — مقاييس لوحة المعلومات.
  - `getTopSellingProducts()` / `getTopCustomers()` / `getPaymentMethodDistribution()` / `getSalesByGrade()` / `getRecentActivities()` — تحليلات لوحة المعلومات (نسخ متزامنة).
  - `getPurchaseReport()` / `getExpenseReport()` / `getProfitAndLossReport()` / `getInventoryValuationReport()` / `getDashboardProfitData()` — تقارير مالية.
  - `getCategorySalesReport()` / `getBrandSalesReport()` — تقارير مبيعات حسب الفئة/العلامة.
  - `getMonthlyComparison()` / `getDailyComparison()` / `getYearlyComparison()` / `getNetSalesAnalysis()` — مقارنات وتحليل صافي المبيعات.
  - أسماء بديلة للتوافق: `getDayComparison`, `getYearComparison`, `getNetSales`, `getNetSalesAfterReturns`.
- **ملاحظات:** يعيد تصدير أنواع `DashboardMetrics`, `MonthlyComparison`, `RecentDashboardActivity`, `DashboardProfitData` من `AccountingService/types`.

### `src/services/domains/finance/CashShiftPolicyService.ts`
- **الغرض:** سياسة مركزية لربط عمليات النقد بوردية الكاشير المفتوحة على فرع الفاتورة.
- **الأعضاء الرئيسية:**
  - `ResolvedCashShift` — واجهة `{ shiftId?, registerId? }`.
  - `CashShiftPolicyService.resolve(branchId, options)` — يتحقق من الوردية المفتوحة للكاشير الحالي في الفرع ويرمي أخطاء عربية عند المخالفة؛ خيار `required` يجعل الوردية إلزامية.
- **ملاحظات:** يستخدم `AuthService.requireAuth` و`BranchAccessService.requireBranchAccess`/`requireShiftAccess`؛ يستعلم `cash_shifts`/`cash_registers` مباشرة.

### `src/services/domains/finance/CashierService.ts`
- **الغرض:** خدمة الكاشير: صناديق النقد، الورديات (فتح/إغلاق/جدولة إغلاق تلقائي)، والمصروفات النقدية مع ترحيل قيود يومية.
- **الأعضاء الرئيسية:**
  - `CashierService` — الكلاس الرئيسي.
  - الورديات: `getAllRegisters`, `getActiveShift`, `getLastClosedShift`, `getSuggestedOpeningBalance`, `getShiftAutoCloseSchedule`, `saveShiftAutoCloseSchedule`, `closeScheduledShifts`, `openShift`, `openReplacementShift`, `closeShift`, `getCashShiftsForOperationShift`, `getCashShiftSummaryForOperationShift`.
  - المصروفات: `getExpenseCategories`, `getAllExpenses`, `addExpense`, `updateExpense`, `deleteExpense`.
  - داخليات: `calculateExpectedEndingCash`, `closeShiftInternal`, `validateOperationShiftLink`.
- **ملاحظات:** يستخدم `postLedgerEntry`/`reverseLedgerEntry`/`paymentAccountCode` من `database/repositories/ledger`، `BusinessRecordSyncService`، `OperationApprovalGate`، `AppConfigService`، و`round2` من `./financials`.

### `src/services/domains/finance/ConsistencyAuditService.ts`
- **الغرض:** خدمة تدقيق الاتساق المحاسبي والمخزني (فحوصات دورية تُسجَّل كـ audit runs).
- **الأعضاء الرئيسية:**
  - `AuditRunType`, `AuditDiscrepancy`, `CheckResult`, `AuditRunResult` — أنواع التدقيق.
  - `ConsistencyAuditService.runAudit(options)` — تشغيل تدقيق كامل/جزئي وتسجيل النتائج.
  - `runDailyCheck()` — فحص يومي (يُتخطى إن شُغّل مسبقاً).
  - `listRuns(limit)` / `getRun(id)` — استعلام سجل التشغيلات.
  - فحوصات داخلية: `checkJournalBalanceIntegrity`, `checkGlVsJournal`, `checkStockVsTransactions`, `checkStockVsBatches`, `checkInventoryVsGl`.
- **ملاحظات:** يستخدم `PermissionChecker` و`BranchAccessService` و`StockLedgerMovementPolicy` و`InventoryService` من `../inventory`.

### `src/services/domains/finance/DebtService.ts`
- **الغرض:** خدمة ديون العملاء والموردين (ذمم مدينة/دائنة) لعرض جدول الديون والإجماليات.
- **الأعضاء الرئيسية:**
  - `DebtRow` — صف دين موحّد (عملاء/موردين) مع `overdue`, `daysOverdue`, إلخ.
  - `DebtService.getDebts(search)` — دمج ديون العملاء والموردين مع فلترة بحث.
  - `DebtService.getTotals()` — إجمالي ذمم مدينة/دائنة/صافي.
- **ملاحظات:** يتطلب صلاحية `finance.debts.view`؛ يستخدم `BranchAccessService` للاستعلامات المقيدة بالفرع.

### `src/services/domains/finance/FinanceEnterpriseContract01.ts`
- **الغرض:** العقد المجرد (abstract contract) الذي يعرّف الواجهة الكاملة لخدمة FinanceEnterprise و`ledgerScope` المشترك.
- **الأعضاء الرئيسية:**
  - `FinanceEnterpriseContract01` — كلاس مجرد مع `db` (DatabaseManager) و`branchAccess`.
  - `ledgerScope(alias)` — يبني شرط SQL يجمع نطاق الفرع ونطاق الشركة لقيود اليومية.
  - دوال مجردة: `requireView`, `requireManage`, `getFiscalYears`, `getFiscalPeriods`, `getUnpostedJournalEntryCount`, `createFiscalYear`, `closePeriod`, `reopenPeriod`, `closeFiscalYear`, `getBankAccounts`, `saveBankAccount`, `getUnreconciledBankTransactions`, `createBankReconciliation`, `getBankReconciliations`, `getBankReconciliationById`, `transitionChequeStatus`, `getChequeHistory`, `getCostCenters`, `saveCostCenter`, `getBudgets`, `getBudgetWithItems`, `saveBudget`, `getCashFlowForecast`, `getPaymentGateways`, `savePaymentGateway`, `getPaymentGatewaySettlements`, `recordGatewaySettlement`, `getMultiDimensionalPnL`.
- **ملاحظات:** قاعدة كل سلسلة الوراثة FinanceEnterprisePart01..10؛ يستورد الأنواع من `types/finance`.

### `src/services/domains/finance/FinanceEnterprisePart01.ts`
- **الغرض:** حلقة فارغة في سلسلة الوراثة (يمتد `FinanceFiscalCloseService` دون إضافات).
- **الأعضاء الرئيسية:** `FinanceEnterprisePart01` — كلاس مجرد فارغ.

### `src/services/domains/finance/FinanceEnterprisePart02.ts`
- **الغرض:** إغلاق/إعادة فتح الفترات والسنة المالية مع قيد إقفال الأرباح المحتجزة.
- **الأعضاء الرئيسية:**
  - `reopenPeriod(periodId, reason)` — إعادة فتح فترة مقفلة مع تدقيق وسبب إلزامي.
  - `closeFiscalYear(fiscalYearId, retainedEarningsCode)` — إغلاق السنة المالية وإنشاء قيد إقفال/مبيعات.
- **ملاحظات:** يتطلب `finance.reopen`؛ يستخدم `postLedgerEntry` و`round2` و`buildFiscalYearReadiness`/`validateRetainedEarningsAccount`.

### `src/services/domains/finance/FinanceEnterprisePart03.ts`
- **الغرض:** حسابات البنوك والكشف غير المسوّى.
- **الأعضاء الرئيسية:**
  - `getBankAccounts()` / `saveBankAccount(input)` — إدارة حسابات البنوك وربطها بحساب GL.
  - `getUnreconciledBankTransactions(bankAccountId, asOfDate)` — حركات البنك غير المسوّاة.
- **ملاحظات:** يستخدم نوع `BankAccount` من `types/finance`.

### `src/services/domains/finance/FinanceEnterprisePart04.ts`
- **الغرض:** التسويات البنكية (Bank Reconciliation).
- **الأعضاء الرئيسية:**
  - `createBankReconciliation(input)` — إنشاء تسوية من كشف حساب البنكي.
  - `getBankReconciliations(bankAccountId?)` / `getBankReconciliationById(id)` — استعلام التسويات.
- **ملاحظات:** يستخدم نوع `BankReconciliation`.

### `src/services/domains/finance/FinanceEnterprisePart05.ts`
- **الغرض:** دورة حياة حالات الشيكات (استلام/إيداع/تحصيل/ارتداد) وسجل الحالة.
- **الأعضاء الرئيسية:**
  - `transitionChequeStatus(chequeId, toStatus, options)` — انتقال حالة شيك مع خيارات (حساب بنك، سبب ارتداد، رسوم).
  - `getChequeHistory(chequeId)` — سجل تغييرات حالة الشيك.
- **ملاحظات:** يستخدم `unscaleMoneyRow`، `postLedgerEntry`، نوع `Cheque` من `FinanceExtrasService`، و`localDateString`.

### `src/services/domains/finance/FinanceEnterprisePart06.ts`
- **الغرض:** مراكز التكلفة والميزانيات (قراءة).
- **الأعضاء الرئيسية:**
  - `getCostCenters()` / `saveCostCenter(input)` — إدارة مراكز التكلفة.
  - `getBudgets(fiscalYearId?)` / `getBudgetWithItems(budgetId)` — استعلام الميزانيات وبنودها.
- **ملاحظات:** يستخدم أنواع `CostCenter`, `Budget`.

### `src/services/domains/finance/FinanceEnterprisePart07.ts`
- **الغرض:** حفظ الميزانيات وبنودها.
- **الأعضاء الرئيسية:** `saveBudget(input)` — إنشاء/تحديث ميزانية سنة مالية ببنود حسابية موزعة.

### `src/services/domains/finance/FinanceEnterprisePart08.ts`
- **الغرض:** توقع التدفق النقدي المستقبلي.
- **الأعضاء الرئيسية:** `getCashFlowForecast(daysAhead)` — رصيد نقدي حالي، متوقعات دخول/خروج يومية.
- **ملاحظات:** يستخدم `localDateString` ونوع `CashForecastDaySummary`.

### `src/services/domains/finance/FinanceEnterprisePart09.ts`
- **الغرض:** بوابات الدفع وتسوياتها (Payment Gateways).
- **الأعضاء الرئيسية:**
  - `getPaymentGateways()` / `savePaymentGateway(input)` — إدارة بوابات الدفع وربطها بحساب GL.
  - `getPaymentGatewaySettlements()` / `recordGatewaySettlement(input)` — تسجيل تسويات البوابات (إجمالي، عمولة، خصم ضريبة).
- **ملاحظات:** يستخدم `postLedgerEntry` وأنواع `PaymentGateway`, `PaymentGatewaySettlement`.

### `src/services/domains/finance/FinanceEnterprisePart10.ts`
- **الغرض:** تقرير الربح/الخسارة متعدد الأبعاد (حسب مركز تكلفة/فرع/فترة).
- **الأعضاء الرئيسية:** `getMultiDimensionalPnL(filters)` — إيرادات، COGS، مصروفات، صافي ربح، وتفصيل حسابات.
- **ملاحظات:** يستخدم نوع `MultiDimensionalReportFilters`.

### `src/services/domains/finance/FinanceEnterpriseService.ts`
- **الغرض:** الصنف النهائي المكشوف لخدمة المؤسسة؛ يجمع السلسلة كاملة.
- **الأعضاء الرئيسية:** `FinanceEnterpriseService extends FinanceEnterprisePart10` (بدون إضافات).

### `src/services/domains/finance/FinanceExtrasService.ts`
- **الغرض:** الصنف النهائي المكشوف لخدمة "الإضافات" المالية (حسابات، قيود، شيكات، أصول ثابتة...).
- **الأعضاء الرئيسية:** يعيد تصدير كل أنواع `FinanceExtrasService/types`؛ `FinanceExtrasService extends ExtrasCountCampaignsBase`.

### `src/services/domains/finance/FinanceFiscalCloseService.ts`
- **الغرض:** إغلاق الفترة المالية وإنشاء السنوات المالية والفترات.
- **الأعضاء الرئيسية:**
  - `CreateFiscalYearInput` — مدخلات إنشاء سنة مالية (فترات مخصصة، عملة، نطاق فرع...).
  - `FinanceFiscalCloseService` — كلاس مجرد يمتد `FinancePeriodCloseService`.
  - `requireView`/`requireManage`/`requireClose` — فحوص صلاحيات.
  - `getFiscalYears()` / `getFiscalPeriods(fiscalYearId?)` — استعلام السنوات والفترات.
  - `getUnpostedJournalEntryCount(startDate, endDate)` — عدد القيود غير المرحّلة.
  - `getPeriodCloseChecklist(periodId)` — قائمة فحص إغلاق الفترة.
  - `createFiscalYear(input)` — إنشاء سنة مالية مع فتراتها (تلقائية أو مخصصة).
  - `closePeriod(periodId, notes)` — إغلاق فترة مالية.
- **ملاحظات:** يستخدم `AuthService`, `PermissionService`, `uuidv4`، أنواع `FiscalYear`/`FiscalPeriod`.

### `src/services/domains/finance/FinancePeriodCloseService.ts`
- **الغرض:** نقطة دخول سلسلة الإغلاق المالي؛ تجمع أنواع الإغلاق وتُعيد تصديرها.
- **الأعضاء الرئيسية:**
  - يعيد تصدير `CloseCheckStatus`, `PeriodWorkflowState`, `FiscalCloseIssue`, `FiscalCloseCheck`, `PeriodCloseTask`, `PeriodAdjustment`, `PeriodCloseReport`, `PeriodCloseReportPayload`, `FiscalYearOpening` من `./FinancePeriodCloseService/types`.
  - `FinancePeriodCloseService extends PeriodYearEndBase` (كلاس مجرد).
  - يعيد تصدير نوع `Database` من `sql.js`.

### `src/services/domains/finance/FinancialCalendarEventsService.ts`
- **الغرض:** خدمة تقويم الأحداث المالية: توليد أحداث من فواتير المبيعات/المشتريات والأقساط، وتتبع الاستحقاقات والدفعات.
- **الأعضاء الرئيسية:**
  - الأنواع: `FinancialSourceType` (SALES_INVOICE/PURCHASE_INVOICE/INSTALLMENT), `FinancialEventType`, `FinancialPartyType`, `FinancialCalendarEventInput`, `FinancialCalendarEvent`.
  - `FinancialCalendarEventsService.getEvents(startDate, endDate)` — أحداث الفترة من كل المصادر.
  - `getEventDetails(eventId)` / `getOptions()` — تفاصيل الحدث وبيانات القوائم المنسدلة.
  - `saveEvent(input, eventId?)` — إنشاء/تحديث حدث يدوي.
  - `recordPayment(input)` — تسجيل دفعة على الحدث.
  - `reschedule(eventId, dueDate)` / `cancelEvent(eventId)` / `addAttachment(eventId, input)`.
  - داخليات: `validateInput`, `getInvoiceEvents`, `mapInvoiceEvent`, `mapInstallmentEvent`, `parseSourceId`, `getSourceEvent`, `recordSourcePayment`, `parseReminderDays`, `writeAudit`.
- **ملاحظات:** يستخدم `SalesService`, `SupplierService`, `InstallmentService`, `AuthService`, `PermissionService`, `BranchAccessService`, `DatabaseManager`.

### `src/services/domains/finance/FinancialStatementsService.ts`
- **الغرض:** ملف فارغ (0 بايت) — لم يُنفَّذ بعد؛ يُفترض أن يكون خدمة القوائم المالية (ميزانية/دخل/تدفقات).

### `src/services/domains/finance/InstallmentService.ts`
- **الغرض:** خدمة خطط التقسيط على فواتير العملاء: إنشاء خطة، سداد أقساط، عكس مدفوعات، إلغاء.
- **الأعضاء الرئيسية:**
  - `InstallmentService.getPageData()` — بيانات جدول الفواتير/الخطط/الأقساط لصفحة.
  - `createPlan(input)` — إنشاء خطة تقسيط (دفعة أولى + عدد أقساط + تاريخ بدء) مع ترحيل قيود.
  - `payInstallment(installmentId, requestedAmount?, paymentDate?, notes)` — سداد قسط.
  - `reverseInstallmentPayment(installmentId)` — عكس دفعة قسط.
  - `cancelPlan(planId)` — إلغاء خطة.
- **ملاحظات:** يستخدم `postLedgerEntry`/`reverseLedgerEntry`/`paymentAccountCode`، `AuthService`, `PermissionService`, `BranchAccessService`، `unscaleMoneyRow`.

### `src/services/domains/finance/financials.ts`
- **الغرض:** نقطة تجميع (barrel) لحسابات مالية نقية (دوال بدون قاعدة بيانات).
- **الأعضاء الرئيسية:** يعيد تصدير كل ما في `financials_part01..04`: `toMinorUnits`, `fromMinorUnits`, `round2`, `calculateReturnTax`, `calculateInclusiveReturnTax`, `calculateDiscountedReturnAmount`, `returnTaxSql`, `inclusiveReturnTaxSql`, `computeSaleLine`, `computeSaleTotals`, `computeWeightedAverageCost`, `computeReturnImpact` والأنواع المرافقة.

### `src/services/domains/finance/financials_part01.ts`
- **الغرض:** أدوات تحويل عملات (minor/major units) وتقريب وضريبة المرتجعات.
- **الأعضاء الرئيسية:**
  - `toMinorUnits(amount)` / `fromMinorUnits(amount)` — تحويل أرقام عشري↔أصغر وحدة.
  - `round2(amount)` — تقريب لرقمين عشريين.
  - `calculateReturnTax(...)`, `calculateInclusiveReturnTax(...)`, `calculateDiscountedReturnAmount(...)` — حساب ضريبة المرتجعات.

### `src/services/domains/finance/financials_part02.ts`
- **الغرض:** حساب سطر البيع وضريبة المبيعات (SQL + JS) وحالات الدفع.
- **الأعضاء الرئيسية:**
  - `returnTaxSql(...)`, `inclusiveReturnTaxSql(...)` — تعابير SQL لضريبة المبيعات الشاملة.
  - `SaleLineInput`, `SaleLineResult`, `computeSaleLine(input)` — حساب سطر بيع.
  - `PaymentStatus` ('PAID'|'PARTIAL'|'UNPAID'), `SaleTotalsInput`.

### `src/services/domains/finance/financials_part03.ts`
- **الغرض:** إجماليات البيع، التكلفة المتوسطة المرجحة، ومدخلات أثر المرتجع.
- **الأعضاء الرئيسية:**
  - `SaleTotalsResult`, `computeSaleTotals(input)` — إجماليات فاتورة بيع (ضريبة، خصم، صافي).
  - `computeWeightedAverageCost(...)` — تكلفة متوسط مرجحة.
  - `ReturnImpactInput` (مُعاد تصديره إلى part04).

### `src/services/domains/finance/financials_part04.ts`
- **الغرض:** حساب أثر المرتجع على المخزون/الأرباح.
- **الأعضاء الرئيسية:** `ReturnImpactResult`, `computeReturnImpact(input)` — أثر إرجاع صنف (إيراد مرتجع، تكلفة مرتجعة، صافي الأثر).

---

## `src/services/domains/finance/AccountingService/` (وحدات فرعية)

### `src/services/domains/finance/AccountingService/analyticsOperations.ts`
- **الغرض:** عمليات تحليلية للوحة المعلومات (مزامنة + async) مع فحص صلاحيات.
- **الأعضاء الرئيسية:** لكل دالة نسختان متزامنة وasync: `getSalesTrendLast7Days`, `getTopSellingProducts`, `getMonthlyComparison`, `getTopCustomers`, `getPaymentMethodDistribution`, `getSalesByGrade`, `getRecentActivities`.
- **ملاحظات:** كلها تأخذ `(db: DatabaseManager, access: BranchAccessService, ...)`؛ تستخدم `requireDashboard*View` من `permissions.ts`.

### `src/services/domains/finance/AccountingService/comparisons.ts`
- **الغرض:** مقارنات المبيعات (يومية/سنوية) وتحليل صافي المبيعات بعد المرتجعات.
- **الأعضاء الرئيسية:**
  - `getDailyComparison(db, access)` / `getYearlyComparison(db, access)` — `MonthlyComparison` يومي/سنوي.
  - `getNetSalesAnalysis(db, access, dateFrom?, dateTo?)` — مبيعات إجمالية، مرتجعات، صافي، معدل إرجاع، إلخ.
- **ملاحظات:** تعمل على نوع `Db` وتستخدم `sqlScope`/`ledgerScope`.

### `src/services/domains/finance/AccountingService/dashboardOperations.ts`
- **الغرض:** جلب مقاييس لوحة المعلومات الرئيسية (مزامن + async).
- **الأعضاء الرئيسية:** `getDashboardMetrics(db, access)` و`getDashboardMetricsAsync(...)` — تجميع نتائج الـ specs في `DashboardMetrics`.
- **ملاحظات:** يستخدم `buildDashboardContext` و`dashboardQuerySpecs` من `dashboardSpecs` و`assembleDashboardMetrics` من `mappers`.

### `src/services/domains/finance/AccountingService/dashboardSpecs.ts`
- **الغرض:** بناء استعلامات SQL (specs) للوحة المعلومات ومقاييس المخزون/الأرباح.
- **الأعضاء الرئيسية:**
  - `buildDashboardContext(access)` — سياق نطاق الفرع/الشركة.
  - `dashboardQuerySpecs(ctx)` — خريطة استعلامات اللوحة.
  - `buildInvStatsSpec`, `buildProfitBalancesSpec`, `buildSalesTrendSpec`, `buildTopSellingProductsSpec`, `buildMonthlyComparisonSpec`, `buildTopCustomersSpec`, `buildPaymentMethodSpec`, `buildSalesByGradeSpec`, `buildRecentActivitySpecs` — بناء `{sql, params}` لكل تقرير.
- **ملاحظات:** تُستهلك من `dashboardOperations` و`analyticsOperations` و`reportOperations`.

### `src/services/domains/finance/AccountingService/mappers.ts`
- **الغرض:** تحويل صفوف SQL الخام إلى نماذج تقارير/لوحة.
- **الأعضاء الرئيسية:**
  - `assembleDashboardMetrics(...)` — تجميع كل مقاييس اللوحة.
  - `mapSalesTrendRows`, `mapPurchaseReport`, `mapExpenseReport`, `mapMonthlyComparison`, `mapInventoryValuation`, `mapRecentActivities` — تعيين الصفوف.
  - `computeProfitAndLoss(balances, sourceExpensesValue)` — حساب قائمة الدخل من أرصدة الحسابات.
  - `computeDashboardProfitData(balances)` — بيانات ربح لوحة المعلومات.
  - `maskReportProfit(rows)` — إخفاء الربح عند غياب الصلاحية.

### `src/services/domains/finance/AccountingService/permissions.ts`
- **الغرض:** فحوص صلاحيات موحّدة لكل عمليات المحاسبة/التقارير.
- **الأعضاء الرئيسية:** `requireView`, `requireDashboardView`, `requireDashboardSalesView`, `requireProfitAndLossView`, `requireProfitView`, `requireSalesReportView`, `requireMonthlyComparisonView`, `requireDashboardCustomersSalesView`, `requireDashboardFinanceSalesView`, `requireRecentActivitiesView`.

### `src/services/domains/finance/AccountingService/reportOperations.ts`
- **الغرض:** عمليات التقارير المالية (مشتريات، مصروفات، ربح/خسارة، فئات، علامات، تقييم مخزون) — متزامنة وasync.
- **الأعضاء الرئيسية:** أزواج `getX`/`getXAsync` لـ: `getPurchaseReport`, `getExpenseReport`, `getProfitAndLossReport`, `getDashboardProfitData`, `getCategorySalesReport`, `getBrandSalesReport`, `getInventoryValuationReport`.
- **ملاحظات:** تستدعي `require*View` من `permissions.ts` وتبني specs من `reportSpecs` وتحوّل عبر `mappers`.

### `src/services/domains/finance/AccountingService/reportSpecs.ts`
- **الغرض:** بناء استعلامات SQL للتقارير المالية.
- **الأعضاء الرئيسية:**
  - `buildPurchaseReportSpec`, `buildExpenseReportSpec`, `buildProfitAndLossSpecs`, `buildSalesReportWhere` — فلاتر تاريخ/فرع.
  - `buildCategorySalesSpec`, `buildBrandSalesSpec` — تقارير الفئات/العلامات.
  - `buildInventoryValuationSpecs(access)` — تقييم المخزون حسب المستودع.

### `src/services/domains/finance/AccountingService/scopes.ts`
- **الغرض:** مساعدات بناء نطاق SQL للفرع ودفتر الأستاذ.
- **الأعضاء الرئيسية:**
  - `branchScope(access, expression, fallback?)` — نطاق فرع تعبيري.
  - `ledgerScope(access, alias)` — نطاق دفتر الأستاذ (فرع + شركة).

### `src/services/domains/finance/AccountingService/types.ts`
- **الغرض:** أنواع مشتركة وواجهات لوحدة المحاسبة.
- **الأعضاء الرئيسية:** `isValidDate`, `DashboardMetrics`, `MonthlyComparison`, `RecentDashboardActivity`, `DashboardProfitData`, `DashboardActivityRow`, `SqlScope`, `DashboardContext`, `ProfitAndLossReport`, `NetSalesAnalysis`.

---

## `src/services/domains/finance/FinanceExtrasService/` (سلسلة وراثة للإضافات)

### `src/services/domains/finance/FinanceExtrasService/types.ts`
- **الغرض:** أنواع وقيم ثابتة مشتركة لكل وحدات Extras (حسابات، قيود، شيكات، أصول ثابتة، جرد).
- **الأعضاء الرئيسية:**
  - ثوابت الحقول المالية: `FA_MONEY_FIELDS`, `FA_DISPOSAL_MONEY_FIELDS`, `FA_DEPR_MONEY_FIELDS`.
  - أنواع الحسابات والقيود: `AccountType`, `Account`, `JournalLineInput`, `JournalEntry`, `JournalLine`.
  - الشيكات: `ChequeType` (RECEIVED/ISSUED), `ChequeStatus`, `Cheque`.
  - الأصول الثابتة: `FixedAsset`, `FixedAssetTransfer`, `FixedAssetMaintenance`, `FixedAssetDisposal`, `FixedAssetDepreciationPeriod`, `FixedAssetDepreciationRequest`, `FixedAssetAttachment`, `FixedAssetSettlementSource`, `FixedAssetCountCampaign/Observation/Snapshot/Audit`, `FixedAssetTimelineEvent`.
  - أدوات: `round2`, `validDate`.

### `src/services/domains/finance/FinanceExtrasService/core.ts`
- **الغرض:** قاعدة السلسلة: فحوص صلاحيات عامة وتحقق من تاريخ الترحيل.
- **الأعضاء الرئيسية:** `ExtrasCoreBase` — `requireView`, `requireManage`, `assertPostingDate(date, allowCurrentMonthEnd)`.

### `src/services/domains/finance/FinanceExtrasService/accounts.ts`
- **الغرض:** شجرة الحسابات (إنشاء/تعديل/حذف مع تحقق من التسلسل الهرمي).
- **الأعضاء الرئيسية:** `ExtrasAccountsBase extends ExtrasCoreBase` — `getAccounts`, `createAccount`, `updateAccount`, `validateParent` (خاص), `deleteAccount`.

### `src/services/domains/finance/FinanceExtrasService/cheques.ts`
- **الغرض:** إدارة الشيكات الواردة/الصادرة وحالاتها الأساسية.
- **الأعضاء الرئيسية:** `ExtrasChequesBase extends ExtrasTaxBase` — `getCheques`, `saveCheque`, `setChequeStatus`, `deleteCheque`.

### `src/services/domains/finance/FinanceExtrasService/journal.ts`
- **الغرض:** القيود اليومية: إنشاء/حذف/عكس، أسطر القيد، ميزان المراجعة.
- **الأعضاء الرئيسية:** `ExtrasJournalBase extends ExtrasAccountsBase` — `getJournalEntries`, `getJournalLines`, `createJournalEntry`, `deleteJournalEntry`, `reverseJournalEntry`, `getTrialBalance`؛ داخليات `attachSourceLabels`, `getScopedJournalEntry`.
- **ملاحظات:** يستخدم `postLedgerEntry`/`reverseLedgerEntry` ونطاق الفرع/الشركة.

### `src/services/domains/finance/FinanceExtrasService/tax.ts`
- **الغرض:** ملخصات الضريبة (إجمالي وضريبة شهرية، مبيعات مقابل مشتريات مرتجعة).
- **الأعضاء الرئيسية:** `ExtrasTaxBase extends ExtrasJournalBase` — `getTaxSummary(dateFrom, dateTo)`, `getTaxByMonth(dateFrom, dateTo)`، ودالة نطاق `taxScope`.

### `src/services/domains/finance/FinanceExtrasService/fixedAssets.ts`
- **الغرض:** بيانات الأصول الثابتة وحفظها (شراء/حالة/فئة).
- **الأعضاء الرئيسية:** `ExtrasFixedAssetsBase extends ExtrasChequesBase` — `getFixedAssets`, `saveFixedAsset`, `requireAssetAccess` (محمي).

### `src/services/domains/finance/FinanceExtrasService/depreciation.ts`
- **الغرض:** الإهلاك: جدولة، طلبات اعتماد، ترحيل فترات إهلاك.
- **الأعضاء الرئيسية:** `ExtrasDepreciationBase extends ExtrasFixedAssetsBase` — `postMonthlyDepreciation`, `getDepreciationSchedule`, `requestFixedAssetDepreciation`, `postDepreciationPeriod`, `getFixedAssetDepreciationRequests`, `approveFixedAssetDepreciationRequest`, `getFixedAssetDepreciationPeriods`, `accountByCode` (خاص).

### `src/services/domains/finance/FinanceExtrasService/assetOps.ts`
- **الغرض:** عمليات الأصول: نقل، صيانة، مرفقات، خط زمني.
- **الأعضاء الرئيسية:** `ExtrasAssetOpsBase extends ExtrasDepreciationBase` — `getFixedAssetTransfers`, `getFixedAssetTimeline`, `transferFixedAsset`, `getFixedAssetMaintenance`, `recordFixedAssetMaintenance`, `getFixedAssetAttachments`, `addFixedAssetAttachment`.

### `src/services/domains/finance/FinanceExtrasService/disposal.ts`
- **الغرض:** استبعاد/بيع الأصول الثابتة وحساب ربح/خسارة الاستبعاد.
- **الأعضاء الرئيسية:** `ExtrasDisposalBase extends ExtrasAssetOpsBase` — `getFixedAssetDisposal`, `getFixedAssetSettlementSources`, `disposeFixedAsset`, `deleteFixedAsset`.
- **ملاحظات:** يستخدم `FA_DISPOSAL_MONEY_FIELDS` للحقول النقدية.

### `src/services/domains/finance/FinanceExtrasService/countCampaigns.ts`
- **الغرض:** حملات جرد الأصول الثابتة (إنشاء، ملاحظات، لقطات، تدقيق نهائي).
- **الأعضاء الرئيسية:** `ExtrasCountCampaignsBase extends ExtrasDisposalBase` — `getFixedAssetCountCampaigns`, `getFixedAssetBranches`, `getFixedAssetCurrentBranch`, `getFixedAssetDepartments`, `getFixedAssetResponsibleUsers`, `getFixedAssetCountObservations`, `getFixedAssetCountSnapshots`, `getFixedAssetCountAudit`, `createFixedAssetCountCampaign`, `recordFixedAssetCountObservation`, `finalizeFixedAssetCountCampaign`؛ داخليات `ensureFixedAssetCountSnapshotColumns`.

---

## `src/services/domains/finance/FinancePeriodCloseService/` (سلسلة وراثة للإغلاق)

### `src/services/domains/finance/FinancePeriodCloseService/types.ts`
- **الغرض:** أنواع ومداخلات سير عمل إغلاق الفترة والسنة المالية.
- **الأعضاء الرئيسية:** `CloseCheckStatus` (PASS/WARNING/FAIL/NOT_APPLICABLE), `PeriodWorkflowState` (OPEN→IN_REVIEW→PENDING_APPROVAL→CLOSED/LOCKED), `FiscalCloseIssue`, `FiscalCloseCheck`, `PeriodCloseTask`, `PeriodAdjustment`, `PeriodCloseReport`, `PeriodCloseReportPayload`, `FiscalYearOpening`, `QueryFn`, `PeriodRow`, `TaskInput`, `AdjustmentInput`, `DEFAULT_CLOSE_TASKS` (قائمة مهام إغلاق افتراضية).

### `src/services/domains/finance/FinancePeriodCloseService/helpers.ts`
- **الغرض:** قاعدة سلسلة الإغلاق: مساعدات التدقيق وبناء الفحوصات.
- **الأعضاء الرئيسية:** `PeriodCloseHelpersBase extends FinanceEnterpriseContract01` — `closeActor`, `requireCloseControl`, `getPeriodRow`, `fiscalAudit`, `issue`, `count`, `money`, `makeCheck`.
- **ملاحظات:** يربط سلسلة الإغلاق بعقد Enterprise أعلاه.

### `src/services/domains/finance/FinancePeriodCloseService/tasks.ts`
- **الغرض:** مهام إغلاق الفترة (إنشاء، توليد افتراضي، تحديث، حذف).
- **الأعضاء الرئيسية:** `PeriodCloseTasksBase extends PeriodCloseRunsBase` — `getPeriodCloseTasks`, `createPeriodCloseTask`, `generateDefaultPeriodTasks`, `updatePeriodCloseTask`, `deletePeriodCloseTask`.

### `src/services/domains/finance/FinancePeriodCloseService/closeChecks.ts`
- **الغرض:** بناء فحوصات إغلاق الفترة (قيود غير مرحّلة، أرصدة أطراف، تسويات subledger).
- **الأعضاء الرئيسية:** `PeriodCloseChecksBase extends PeriodCloseHelpersBase` — `buildPeriodCloseChecks`, `buildPartyBalanceChecks`, `recordLegacySubledgerReconciliation`, `getPeriodCloseChecks`.

### `src/services/domains/finance/FinancePeriodCloseService/closeRuns.ts`
- **الغرض:** تشغيلات الإغلاق ولقطات مالية وتقارير الفترة.
- **الأعضاء الرئيسية:** `PeriodCloseRunsBase extends PeriodCloseChecksBase` — `createCloseRun`, `buildFinancialSnapshot`, `capturePartySubledgerSnapshot`, `captureCloseSnapshot`, `getPeriodCloseReport`, `getCloseRuns`.

### `src/services/domains/finance/FinancePeriodCloseService/workflow.ts`
- **الغرض:** سير عمل اعتماد إغلاق الفترة (مراجعة→اعتماد→إغلاق→قفل).
- **الأعضاء الرئيسية:** `PeriodCloseWorkflowBase extends PeriodCloseTasksBase` — `getPeriodWorkflow`, `startPeriodReview`, `submitPeriodForApproval`, `approveAndClosePeriod`, `lockPeriod`؛ داخليات `resolveWorkflowState`, `transitionPeriod`.

### `src/services/domains/finance/FinancePeriodCloseService/adjustments.ts`
- **الغرض:** تسويات نهاية الفترة (إنشاء، تقديم، اعتماد/رفض، ترحيل قيد).
- **الأعضاء الرئيسية:** `PeriodAdjustmentsBase extends PeriodCloseWorkflowBase` — `getPeriodAdjustments`, `createPeriodAdjustment`, `submitPeriodAdjustment`, `approvePeriodAdjustment`, `rejectPeriodAdjustment`, `postPeriodAdjustment`، ودالة `requireAdjustment`.

### `src/services/domains/finance/FinancePeriodCloseService/yearEnd.ts`
- **الغرض:** إقفال نهاية السنة: جاهزية، أرصدة افتتاحية، ملخص، توليد سنة لاحقة.
- **الأعضاء الرئيسية:** `PeriodYearEndBase extends PeriodAdjustmentsBase` — `getFiscalYearReadiness`, `getFiscalYearOpenings`, `generateFiscalYearOpenings`, `getFiscalCloseAudit`, `getFiscalYearSummary`, `validateRetainedEarningsAccount`, `finalizeFiscalYearClose`, `generateSuccessorOpenings`.
