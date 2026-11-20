# طبقة خدمات الموارد البشرية (HR Domain Services)

توثيق شامل لملفات `src/services/domains/hr/` في تطبيق **Ceramics ERP** (React + TypeScript). هذه الطبقة تغطي الحضور، الرواتب، العقود، التوظيف، الأداء، الإجازات، التدريب، الانضباط، الإخلاء، والتخطيط للقوى العاملة.

## نظرة عامة على المعمارية

- **النمط المعماري:** كل خدمة هي `class` تجمع `DatabaseManager.getInstance()` وتتحقق من الصلاحيات عبر `AuthService` + `PermissionService` + `BranchAccessService` + `EmployeeDepartmentAccessService`، مع فحص تفعيل الوحدة عبر `ModuleRegistryService` ('hr').
- **أسلوبان للتنفيذ:**
  1. **خدمة واحدة بـ facade:** `AttendanceService` و`LeaveService` و`EmployeeOrganizationService` و`EmployeeService` هي واجهات `static` تُفوّض المنطق لدوال حرة في مجلد فرعي بنفس الاسم، وتستقبل كائن اعتماديات (`deps`) أو `db` مباشرة.
  2. **خدمة واحدة متكاملة:** باقي الملفات خدمات `static` أو instance-methods مستقلة تُنفّذ كل شيء في ملف واحد.
- **ملاحظات عامة:**
  - معظم الاستعلامات raw SQL عبر `DatabaseManager.query/run` مع نطاق فروع (`sqlScope`) لضمان عزل البيانات بين الفروع.
  - الترحيل المحاسبي عبر `postLedgerEntry` / `reverseLedgerEntry` من `database/repositories/ledger` في العمولات، الرواتب، القروض، وتكاليف التدريب.
  - كل كُتّاب الخدمات تعيد استخدام `localDateString`/`addLocalDays` من `utils/shared/date` للتواريخ المحلية.
  - لا توجد ملفات اختبار (`*.test.ts`) داخل هذا المجلد.

---

## ملفات الجذر — الحضور والبصمة

### `src/services/domains/hr/AttendanceDeviceService.ts`

- **الغرض:** إدارة أجهزة البصمة واستيراد سجلاتها ومعالجة الجلسات المتنقلة.
- **الأعضاء الرئيسية:**
  - أنواع: `AttendanceDeviceType`، `DeviceEventType`، `ProcessingStatus`، `SyncStatus`، وواجهات `AttendanceDevice`، `AttendanceDeviceInput`، `AttendanceDeviceRecord`، `ImportDeviceRecordsInput`، `ImportResult`، `MobileAttendanceSession`، `CreateMobileSessionInput`، `DeviceStats`.
  - `class AttendanceDeviceService` (static): CRUD للأجهزة (`getAttendanceDevices`، `getAttendanceDevice`، `createAttendanceDevice`، `updateAttendanceDevice`، `deleteAttendanceDevice`، `toggleDeviceSyncStatus`)، استيراد ومعالجة السجلات (`getDeviceRecords`، `importDeviceRecords`، `processPendingRecords`)، جلسات الجوال (`createMobileAttendanceSession`، `getMobileAttendanceSession`، `getMobileAttendanceSessions`، `verifyMobileSession`)، وإحصائيات (`getDeviceStats`).
- **ملاحظات:** يستدعي `AttendanceTimeService.syncDailySummary` عند معالجة البصمات، ويتحقق من صلاحيات `employees.attendance.view/manage`.

### `src/services/domains/hr/AttendanceService.ts`

- **الغرض:** واجهة `static` شاملة لخدمة الحضور — تفوّض كل المنطق للوحدات الفرعية في `AttendanceService/`.
- **الأعضاء الرئيسية:**
  - `export type` يعيد تصدير كل أنواع `AttendanceService/types` (AttendanceEntry، AttendanceShift، AttendanceCorrection، AttendanceReportRow، إلخ).
  - `class AttendanceService` (static): كل دوال الحضور — الموظفون والتقارير (`getEmployees`، `getAttendanceByDate`، `getMonthlyReport`، `getMonthlyReportForExport`)، البصمات والاستراحات (`punchIn`، `punchOut`، `startBreak`، `endBreak`، `saveManualRecord`، `importPunches`)، التصحيحات والتدقيق (`getCorrectionRequests`، `decideCorrection`، `approveOvertime`، `getAuditHistory`)، الورديات والعطل (`getShifts`، `saveShift`، `assignShift`، `addHoliday`، `getHolidays`)، وفترات الحضور (`getAttendancePeriods`، `getOpenAttendancePeriod`، `clockAttendancePeriod`) — لكل منها نسخة sync وAsync.
- **ملاحظات:** يبني `deps` من `db` + `BranchAccessService` + `EmployeeDepartmentAccessService` ويمررها لدوال `reports`/`punches`/`corrections`/`shifts`/`periods`.

### `src/services/domains/hr/AttendanceTimeService.ts`

- **الغرض:** خدمة مساعدة تحسب الأيام الموحدة للحضور وتزامن الملخص اليومي.
- **الأعضاء الرئيسية:**
  - `interface UnifiedAttendanceDay` — تمثيل صف حضور موحد.
  - `class AttendanceTimeService` (static): `getUnifiedRows(branchId, from, to)` يجمع سجلات الحضور لكل الموظفين في نطاق زمني، و`syncDailySummary(employeeId, date, recordedBy?)` يعيد حساب وحفظ ملخص اليوم.
- **ملاحظات:** تُستدعى من `AttendanceService/periods.ts` (عند إغلاق فترات الحضور) ومن `AttendanceDeviceService`.

---

## ملفات الجذر — الموظفون والرواتب

### `src/services/domains/hr/EmployeeService.ts`

- **الغرض:** الخدمة المركزية للموظفين والرواتب — CRUD الموظفين، معاملات الرواتب، محرك تشغيلات الرواتب، والتقارير المالية.
- **الأعضاء الرئيسية:**
  - `export * from './EmployeeService/types'` — يعيد تصدير كل الأنواع (`Employee`، `PayrollRun`، `PayrollRunItem`، `PayrollTransaction`، `Attendance`، enums الحالات).
  - `class EmployeeService` (static):
    - الموظفون: `getAll`/`getAllAsync`، `getById`/`getByIdAsync`، `getBranchAssignments`، `getSalesReps`، `create`، `update`، `delete`.
    - معاملات الرواتب: `getTransactions`، `addTransaction`، `deleteTransaction`.
    - تشغيلات الرواتب: `accrueMonthlyPayroll`، `calculatePayrollRun`، `getPayrollRun`، `getPayrollRunById`، `getAllPayrollRuns`، `approvePayrollRun`، `payPayrollRun`، `closePayrollRun`، `getPayrollPayoutOptions`، `getPayrollPaymentReconciliation`، `getPayrollPayables`.
    - التقارير: `getEmployeeFinancials`، `getAllAttendance`، `getAttendanceByDate`، `upsertAttendance`، `getLocationCounts`، `getTotalWagesBill` — كل منها مع نسخة Async.
- **ملاحظات:** أكبر خدمة في النطاق؛ تفوّض المنطق للوحدات الفرعية في `EmployeeService/`، وتستخدم `AttendanceService`، `CentralUsageLimitService`، و`postLedgerEntry`/`reverseLedgerEntry` للترحيل المحاسبي. تُستدعى من `RecruitmentService` و`HrBenefitsService` و`PayrollCalendarService`.

### `src/services/domains/hr/PayrollTaxService.ts`

- **الغرض:** قواعد حساب ضريبة الرواتب والشرائح التصاعدية لكل شركة.
- **الأعضاء الرئيسية:**
  - أنواع: `PayrollTaxBasis`، `PayrollTaxSource`، وواجهات `PayrollTaxBracket(Input)`، `PayrollTaxRule(Input)`، `PayrollTaxBreakdownLine`، `PayrollTaxCalculation`، `PayrollTaxCalculationInput`.
  - `class PayrollTaxService` (static): CRUD للقواعد (`getRules`، `getActiveRule`، `saveRule`، `deleteRule`) ودالة `calculate(input)` التي تحسب تفصيل الضريبة بالشرائح.
- **ملاحظات:** يُستخدم من محرك تشغيلات الرواتب في `EmployeeService/payrollRunEngine.ts`.

### `src/services/domains/hr/PayrollSocialInsuranceService.ts`

- **الغرض:** قواعد وحسابات التأمينات الاجتماعية ومكافأة نهاية الخدمة لكل شركة.
- **الأعضاء الرئيسية:**
  - أنواع: `SocialInsuranceSystemType`، وواجهات `SocialInsuranceRule`، `SocialInsuranceCalculation`، `EndOfServiceRule`، `EndOfServiceCalculation`، وواجهات الإدخال الموافقة.
  - `class PayrollSocialInsuranceService` (static): `getSocialInsuranceRules`، `getActiveSocialInsuranceRule`، `saveSocialInsuranceRule`، `deleteSocialInsuranceRule`؛ `calculateSocialInsurance`؛ `getEndOfServiceRules`، `getActiveEndOfServiceRule`، `saveEndOfServiceRule`، `deleteEndOfServiceRule`، `calculateEndOfService`؛ وربط بنتائج الرواتب (`getSocialInsuranceContributions`، `persistSocialInsuranceContribution`، `removeSocialInsuranceContribution`)، و`getCurrentCompanyId`.
- **ملاحظات:** يُستخدم من `EmployeeService/payrollRunEngine.ts` لحساب خصومات التأمينات على بنود الرواتب.

### `src/services/domains/hr/PayrollCalendarService.ts`

- **الغرض:** تقويم الرواتب — مزامنة أحداث الرواتب مع التقويم المالي، تتبع المدفوعات والمستحقات.
- **الأعضاء الرئيسية:**
  - واجهات `PayrollCalendarEventView`، `PayrollCalendarMonthView`.
  - `class PayrollCalendarService` (instance): `ensureEventForRun(runId)` ينشئ/يحدث حدث تقويم لتشغيلة رواتب، `getCalendarMonth(year, month)` يعيد عرض الشهر، `getOverdueAndMissing` يكشف المستحقات المتأخرة والرواتب غير المجدولة، `recordPayment` يسجل دفعة ويزامن المبلغ المدفوع، `reschedule` يعيد جدولة حدث، و`getPayoutOptions` يعيد خيارات الصرف.
- **ملاحظات:** يستخدم `FinancialCalendarEventsService` من نطاق finance و`EmployeeService` لجلب بيانات التشغيلات.

### `src/services/domains/hr/PayrollNotificationSettingsService.ts`

- **الغرض:** إعدادات إشعارات الرواتب لكل فرع (آفاق التنبيه قبل الاستحقاق وبعده).
- **الأعضاء الرئيسية:**
  - واجهات `PayrollNotificationSettings` و`PayrollNotificationSettingsInput`.
  - `class PayrollNotificationSettingsService` (static): `getSettings`، `getAllSettings`، `upsertSettings`، `getEffectiveSettings` (مع القيم الافتراضية)، `shouldNotifyDue`، `shouldNotifyOverdue`، `getDueHorizonDays`، `getOverdueHorizonDays`.
- **ملاحظات:** يُستهلك من `HrAlertsService` لتحديد متى تُنشأ تنبيهات الرواتب.

### `src/services/domains/hr/CommissionService.ts`

- **الغرض:** عمولات المبيعات — توليد عمولات شهرية للمندوبين، اعتمادها ودفعها، وترحيلها محاسبياً.
- **الأعضاء الرئيسية:**
  - `export * from '../../../types/hr/commission'` — يعيد تصدير `CommissionRow`، `CommissionStats` وغيرها.
  - `class CommissionService` (instance): `getCommissions`، `getStats`، `getSalesReps`، `generateForMonth` (يحسب العمولات من المبيعات الشهرية)، `setStatus` (APPROVED/PAID/CANCELLED)، `deleteCommission`.
- **ملاحظات:** يستدعي `postLedgerEntry`/`reverseLedgerEntry` من `database/repositories/ledger` عند الدفع/الإلغاء، ويعتمد على `round2` من `finance/financials`.

### `src/services/domains/hr/HrBenefitsService.ts`

- **الغرض:** بدلات ومزايا وقروض وتسويات إجازات الموظفين.
- **الأعضاء الرئيسية:**
  - واجهات `HrAllowance`، `HrBenefit`، `HrLoan`، `HrLoanInstallment`، `HrLeaveSettlement`.
  - `class HrBenefitsService` (static): بدلات (`createAllowance`، `getAllowances`، `getAllowanceTotal`)، مزايا (`createBenefit`، `getBenefits`)، قروض (`createLoan`، `getLoans`، `getInstallments`، `getDueInstallments`، `markInstallmentsPaid`)، وتسويات إجازات (`createLeaveSettlement`، `getLeaveSettlements`، `approveLeaveSettlement`).
- **ملاحظات:** عند إنشاء قرض يسجّل `postLedgerEntry` ويستدعي `EmployeeService.addTransaction` عند سداد الأقساط لربطها بمعاملات الرواتب.

### `src/services/domains/hr/HrDisciplineService.ts`

- **الغرض:** انضباط الموظفين — مخالفات، إنذارات، جزاءات، شكاوى، تظلمات، ومرفقات.
- **الأعضاء الرئيسية:**
  - واجهات `HrViolation`، `HrWarning`، `HrPenalty`، `HrComplaint`، `HrAppeal`، `HrAttachment`.
  - `class HrDisciplineService` (static): `createViolation`/`getViolations`، `issueWarning`/`getWarnings`، `createPenalty`/`getPenalties` + `requestPenaltyApproval`/`approvePenalty`، `createComplaint`/`getComplaints`/`resolveComplaint`، `createAppeal`/`getAppeals`/`decideAppeal`، و`addAttachment`/`getAttachments`.
- **ملاحظات:** يستخدم `ApprovalService` من نطاق approvals لطلب اعتمادات الجزاءات، و`NotificationService` للإشعارات.

### `src/services/domains/hr/HrAlertsService.ts`

- **الغرض:** فحص دوري ينشئ تنبيهات HR تلقائية (عقود، فترة تجربة، مستندات، أرصدة إجازات، أقساط قروض، رواتب).
- **الأعضاء الرئيسية:**
  - `class HrAlertsService` (instance): `runHrAlerts()` يشغّل كل الفحوص ويعيد `{ created, details }`؛ فحوص خاصة: `checkContractExpiries`، `checkProbationEnds`، `checkDocumentExpiries`، `checkLeaveBalances`، `checkLoanInstallments`، `checkPayrollDues`، و`createNotification`.
- **ملاحظات:** يقرأ آفاق التنبيه من `PayrollNotificationSettingsService` ويُنشئ إشعارات من نوع `NotificationType`.

---

## ملفات الجذر — الموظفون والعقود والإجازات والتوظيف والأداء

### `src/services/domains/hr/ContractService.ts`

- **الغرض:** دورة حياة عقود الموظفين — إنشاء واعتماد وتفعيل وتجديد وإنهاء العقود والتسويات النهائية.
- **الأعضاء الرئيسية:**
  - `class ContractService` (instance): `getContracts`، `getContract`، `createContract`، `updateContract`، `approveContract`، `activateContract`، `renewContract`، `terminateContract`، `getFinalSettlements`، `getEmployeeLifecycleHistory`، `getSummary`، `deleteContract`؛ ودوال خاصة للتحقق (`assertNoActiveOverlap`، `effectiveStatus`، `requireEmployeeBranch`، `audit`).
- **ملاحظات:** يستدعي `LeaveService.getAnnualBalanceAsOf` لحساب رصيد الإجازات عند إنهاء العقد، ويستخدم أنواع `EmployeeContract` من `types/hr/contract`.

### `src/services/domains/hr/EmployeeOrganizationService.ts`

- **الغرض:** واجهة `static` شاملة للهيكل التنظيمي ودورة حياة الموظف — تفوّض المنطق للوحدات الفرعية.
- **الأعضاء الرئيسية:**
  - `export type` يعيد تصدير كل أنواع `EmployeeOrganizationService/types`.
  - `class EmployeeOrganizationService` (instance getters فوق `deps`): أقسام (`getDepartments`، `createDepartment`، `updateDepartment`، `deactivateDepartment`، `updateDepartmentStructure`، `getOrgTree`، `getVacancies`)؛ كتالوج (`getJobTitles`، `createJobTitle`، `updateJobTitle`، `deactivateJobTitle`، `getJobGrades`، `createJobGrade`، `deactivateJobGrade`، `getCostCenters`، `createCostCenter`، `deactivateCostCenter`)؛ حركات (`transferEmployee`، `getTransfers`، `addLifecycleEvent`، `getLifecycleEvents`)؛ onboarding (`createOnboardingChecklist`، `getOnboardingTasks`، `completeOnboardingTask`، `cancelOnboardingTask`، `getOnboardingReport`)؛ عهد (`assignCustodyItem`، `returnCustodyItem`، `getCustodyItems`)؛ مراجعات تجربة (`createProbationReview`، `getProbationReviews`، `submitProbationReview`، `getProbationReport`، `runProbationCycle`)؛ إنهاء/ترقية (`requestOffboardingApproval`، `finalizeOffboarding`، `promoteEmployee`، `notifyHrAlerts`).
- **ملاحظات:** يبني `deps` من `db` + `BranchAccessService` + `EmployeeDepartmentAccessService` ويمررها للوحدات `departments`/`catalog`/`people`/`onboarding`/`reviews`/`lifecycle`.

### `src/services/domains/hr/EmployeeDocumentService.ts`

- **الغرض:** مستندات الموظفين — إصدارات المستندات، سجل التدقيق، والتحكم بسرّية المستندات.
- **الأعضاء الرئيسية:**
  - `class EmployeeDocumentService` (instance): `getDocuments`، `getDocument`، `createDocument`، `updateDocument`، `archiveDocument`، `addVersion`، `getVersions`، `getAuditHistory`، `getVersionForAccess`، `isVersionStorageAttached`، `getSummary`؛ ودوال خاصة `canSeeConfidentiality`/`confidentialityCondition` لتصفية حسب مستوى السرّية.
- **ملاحظات:** يستخدم أنواع `EmployeeDocument`/`EmployeeDocumentVersion` من `types/hr/document` ويكتب سجلات تدقيق لكل تعديل.

### `src/services/domains/hr/EmployeeClearanceService.ts`

- **الغرض:** إخلاء الموظفين عند المغادرة — قوائم تحقق للأصول والمالية وشهادات الإخلاء.
- **الأعضاء الرئيسية:**
  - أنواع: `ClearanceStatus`، `ClearanceItemStatus`، `AssetClearanceStatus`، `FinancialClearanceStatus`، وواجهات `EmployeeClearance`، `ClearanceChecklistItem`، `ClearanceChecklistItemInput`، `CreateClearanceInput`، `ExitInterviewInput`، `ClearanceSummary`.
  - `class EmployeeClearanceService` (static): `getEmployeeClearances`، `getEmployeeClearance`، `createEmployeeClearance`، `updateChecklistItem`، `verifyAssetReturn`، `createExitInterview`، `issueClearanceCertificate`، `approveClearance`، `rejectClearance`، `cancelClearance`، `getClearanceSummary`.
- **ملاحظات:** يُشعر `NotificationService` عند إنشاء/اعتماد/رفض الإخلاء، ويتحقق من صلاحيات `employees.clearance.*`.

### `src/services/domains/hr/EmployeeSelfServiceService.ts`

- **الغرض:** بوابة الخدمة الذاتية للموظف — كل الموظف يرى بياناته فقط ويقدّم طلباته.
- **الأعضاء الرئيسية:**
  - `SELF_SERVICE_REQUEST_TYPES` ونوع `SelfServiceRequestType`؛ واجهات `My*` الكثيرة: `MyProfile`، `MyPayslip`، `MyAttendanceRecord`، `MyLeaveRequestRecord`، `MyDiscipline` (مع `MyViolation`/`MyWarning`/`MyPenalty`/`MyComplaint`/`MyAppeal`)، `MyDocument`، `MyEnrollment`، `MyPerformance` (مع `MyEvaluation`/`MyGoal`)، `MyBenefits` (مع `MyAllowance`/`MyBenefit`/`MyLoan`)، و`MySelfServiceRequest`.
  - `class EmployeeSelfServiceService` (static): قراءات `getMyProfile`، `getMyPayslips`، `getMyPayslipDetail`، `getMyAttendance`، `getMyLeaveRequests`، `getMyLeaveBalances`، `getMyDiscipline`، `getMyDocuments`، `getMyTraining`، `getMyPerformance`، `getMyBenefits`، `getMyRequests`؛ وتقديمات `submitLeaveRequest`، `submitComplaint`، `submitAppeal`، `submitRequest`، `requestPersonalDataUpdate`، `requestSalaryCertificate`، `requestExperienceCertificate`، `requestAdvance`، `submitAttendanceObjection`، `requestApprovedDocument`.
- **ملاحظات:** يربط كل عملية بالموظف المرتبط بـ `employees.user_id` للحساب الحالي، ويستدعي `LeaveService` لطلبات الإجازات وأرصدتها، و`NotificationService` للإشعارات.

### `src/services/domains/hr/LeaveService.ts`

- **الغرض:** واجهة `static` شاملة للإجازات — تفوّض المنطق للوحدات الفرعية في `LeaveService/`.
- **الأعضاء الرئيسية:**
  - `export type` يعيد تصدير أنواع `LeaveService/types` (LeaveBalanceSummary، LeaveTypePolicy، AnnualLeaveAccrualPolicy، LeaveCalendarEntry، إلخ).
  - `class LeaveService` (instance فوق `deps`): الأرصدة (`getBalanceSummary`، `getAnnualBalanceAsOf`، `getBalanceTransactions`، `adjustAnnualBalance`)؛ السياسات (`getAnnualAccrualPolicyState`، `saveAnnualAccrualPolicy`، `getTypePolicies`/`getTypePoliciesAsync`، `saveTypePolicy`)؛ التقويم والتقارير (`getCalendar`/`getCalendarAsync`، `getSummary`/`getSummaryAsync`)؛ الطلبات (`getRequests`/`getRequestsAsync`، `getRequest`، `requestLeave`، `decide`، `cancel`).
- **ملاحظات:** يبني `deps` من `db` + `BranchAccessService` + `EmployeeDepartmentAccessService` ويمررها للوحدات `policies`/`balance`/`reports`/`requests`. يُستدعى من `ContractService` و`EmployeeSelfServiceService`.

### `src/services/domains/hr/PerformanceService.ts`

- **الغرض:** تقييم الأداء — دورات التقييم، مؤشرات KPI، الأهداف، التقييمات، خطط التحسين (PIP)، والمكافآت.
- **الأعضاء الرئيسية:**
  - أنواع: `PerformancePeriodType`، `PerformanceCycleStatus`، `PerformanceEvaluatorType`، `PerformanceEvaluationStatus`، `PerformanceGoalStatus`، `PerformancePipStatus`، `PerformanceRewardType`، `PerformanceRewardStatus`، وواجهات `PerformanceCycle`، `PerformanceKpi`، `PerformanceGoal`، `PerformanceEvaluationItem`، `PerformanceEvaluation`، `PerformancePip`، `PerformanceReward`.
  - `class PerformanceService` (static): دورات (`createCycle`، `getCycles`، `updateCycleStatus`)؛ KPI (`createKpi`، `getKpis`، `deactivateKpi`)؛ أهداف (`createGoal`، `getGoals`، `updateGoalProgress`)؛ تقييمات (`createEvaluation`، `getEvaluations`، `addEvaluationItem`، `submitEvaluation`، `approveEvaluation`)؛ PIP (`createPip`، `getPips`، `updatePip`)؛ مكافآت (`createReward`، `getRewards`، `approveReward`)؛ وأتمتة (`autoCreateEvaluations`، `syncAttendanceKpi`، `autoScoreAllAttendance`) التي تسحب بيانات الحضور لحساب درجات KPI.
- **ملاحظات:** `syncAttendanceKpi`/`autoScoreAllAttendance` تستعلمان مباشرة عن سجلات الحضور لتحديث تقييمات الموظفين.

### `src/services/domains/hr/RecruitmentService.ts`

- **الغرض:** التوظيف — وظائف شاغرة، مرشحون، مقابلات، عروض توظيف، وتحويل المرشح لموظف.
- **الأعضاء الرئيسية:**
  - `class RecruitmentService` (instance): وظائف (`getJobs`، `createJob`، `approveJob`، `setJobPublished`، `setJobStatus`)، مرشحون (`getCandidates`، `getSummary`، `createCandidate`، `setCandidateStatus`)، مقابلات (`getInterviews`، `scheduleInterview`، `evaluateInterview`)، عروض (`getOffer`، `createOffer`، `setOfferStatus`)، وتوظيف `hireCandidate`.
- **ملاحظات:** `hireCandidate` يستدعي `EmployeeService.create` لإنشاء الموظف ثم `ContractService.createContract` لإنشاء عقده — سلسلة تكامل رئيسية بين خدمات HR.

### `src/services/domains/hr/TrainingService.ts`

- **الغرض:** التدريب والمهارات — مدربون، دورات، تسجيلات، مصروفات، مهارات، وفجوات مهارات.
- **الأعضاء الرئيسية:**
  - واجهات `TrainingTrainer`، `TrainingCourse`، `TrainingEnrollment`، `TrainingExpense`، `Skill`، `JobSkill`، `EmployeeSkill`، `TrainingGap`.
  - `class TrainingService` (static): مدربون (`createTrainer`، `getTrainers`)؛ دورات (`createCourse`، `getCourses`)؛ تسجيل (`enroll`، `updateEnrollment`، `getEnrollmentsByCourse`، `getEnrollmentsByEmployee`)؛ مهارات (`createSkill`، `getSkills`، `addJobSkill`، `getJobSkills`، `addEmployeeSkill`، `getEmployeeSkills`، `getTrainingGaps`)؛ شهادات ومصروفات (`getExpiringCertificates`، `recordExpense`، `getExpenses`، `getTotalExpenses`، `postCourseCost`).
- **ملاحظات:** `recordExpense`/`postCourseCost` يستدعيان `postLedgerEntry` للترحيل المحاسبي لتكاليف الدورات، و`getTrainingGaps` يقارن مهارات الموظف بمتطلبات المسمى الوظيفي.

### `src/services/domains/hr/WorkforcePlanningService.ts`

- **الغرض:** تخطيط القوى العاملة — خطط توظيف شهرية، طلبات توظيف، ومقارنة الكادر الفعلي بالمخطط.
- **الأعضاء الرئيسية:**
  - أنواع: `WorkforcePlanStatus`، `HiringRequisitionStatus`، وواجهات `WorkforcePlan`، `WorkforcePlanJob`، `WorkforcePlanInput`، `HiringRequisition`، `HiringRequisitionInput`، `HeadcountComparison`، `WorkforceSummary`.
  - `class WorkforcePlanningService` (static): خطط (`getWorkforcePlans`، `getWorkforcePlan`، `saveWorkforcePlan`، `approveWorkforcePlan`، `closeWorkforcePlan`، `deleteWorkforcePlan`)؛ طلبات (`getHiringRequisitions`، `createHiringRequisition`، `decideHiringRequisition`، `closeHiringRequisition`)؛ تقارير (`getHeadcountComparison`، `generateShortageSurplusAlerts`).
- **ملاحظات:** `generateShortageSurplusAlerts` ينشئ تنبيهات عبر `NotificationService` عند وجود عجز أو فائض في الكادر.

---

## مجلد `AttendanceService/` — وحدات الحضور الداخلية

### `src/services/domains/hr/AttendanceService/types.ts`

- **الغرض:** أنواع البيانات المشتركة لخدمة الحضور.
- **الأعضاء الرئيسية:** واجهات `AttendanceEntry`، `AttendanceShift`، `AttendanceCorrection`، `AttendanceCorrectionHistory`، `AttendanceBreakEntry`، `AttendanceAuditEntry`، `AttendanceReportRow`، `AttendanceSaveResult`، `AttendanceEmployee`، `AttendancePeriod`، `AttendanceSnapshot`، `ShiftRow`، و`AttendanceDeps` (تجميع db + الخدمات المساعدة).

### `src/services/domains/hr/AttendanceService/context.ts`

- **الغرض:** سياق الصلاحيات والبيانات المشتركة بين وحدات الحضور.
- **الأعضاء الرئيسية:** `employeeDataScope` (يبني شرط نطاق البيانات حسب صلاحيات المستخدم)، `requireView`، `requireManage`، `requireApproval` (فحوص صلاحيات)، `requireEmployeeBranch` (يتحقق أن الموظف يتبع فرع المستخدم).

### `src/services/domains/hr/AttendanceService/utils.ts`

- **الغرض:** أدوات مساعدة نقية للتواريخ والأوقات والحسابات.
- **الأعضاء الرئيسية:** `VALID_STATUSES`، `isValidDate`، `isValidTime`، `toLocalDateTime`، `localNow`، `durationMinutes`، `dateOffset`، `dateRangesOverlap`، `timeMinutes`، `snapshot` (يبني `AttendanceSnapshot` من صف قاعدة البيانات).

### `src/services/domains/hr/AttendanceService/core.ts`

- **الغرض:** نواة منطق الحضور — التحقق من قابلية التعديل، جلب الورديات والسجلات، التدقيق، وإعادة الحساب.
- **الأعضاء الرئيسية:** `assertPeriodEditable`، `getShift`، `getAttendanceRow`، `recordAudit`، `recalculate` (يعيد حساب حالة الحضور والوقت الإضافي)، `mapShiftRows`.

### `src/services/domains/hr/AttendanceService/punches.ts`

- **الغرض:** عمليات البصمة والاستراحات والإدخال اليدوي والاستيراد.
- **الأعضاء الرئيسية:** `validateSnapshot`، `punch`، `manageBreak`، `saveManualRecord`، `importPunches` — كلها تعمل على `AttendanceDeps` وتدعم sync وAsync.

### `src/services/domains/hr/AttendanceService/corrections.ts`

- **الغرض:** طلبات تصحيح الحضور وسجل التدقيق والوقت الإضافي.
- **الأعضاء الرئيسية:** `getCorrectionRequests`/`Async`، `getCorrectionHistory`/`Async`، `getAuditHistory`/`Async`، `decideCorrection` (اعتماد/رفض التصحيح)، `approveOvertime`.

### `src/services/domains/hr/AttendanceService/shifts.ts`

- **الغرض:** إدارة الورديات وتعيينها للموظفين والعطل الرسمية.
- **الأعضاء الرئيسية:** `getShifts`/`Async`، `saveShift`، `assignShift`، `getAssignments`/`Async`، `addHoliday`، `removeHoliday`، `getHolidays`/`Async`.

### `src/services/domains/hr/AttendanceService/periods.ts`

- **الغرض:** فترات الحضور المفتوحة/المغلقة وإغلاق الفترات.
- **الأعضاء الرئيسية:** `getAttendancePeriods`، `getOpenAttendancePeriod`، `clockAttendancePeriod` (فتح/إغلاق فترة حضور).
- **ملاحظات:** يستدعي `AttendanceTimeService.syncDailySummary` عند إغلاق الفترة.

### `src/services/domains/hr/AttendanceService/reports.ts`

- **الغرض:** تقارير الحضور — قوائم الموظفين، الحضور اليومي، التقرير الشهري، والاستراحات.
- **الأعضاء الرئيسية:** `getEmployees`/`Async`، `getAttendanceByDate`/`Async`، `getMonthlyReport`/`Async`، `getMonthlyReportForExport`/`Async`، `getBreaks`، `getBreaksByDate`/`Async`.

---

## مجلد `EmployeeOrganizationService/` — وحدات الهيكل التنظيمي الداخلية

### `src/services/domains/hr/EmployeeOrganizationService/types.ts`

- **الغرض:** أنواع الهيكل التنظيمي ودورة الحياة.
- **الأعضاء الرئيسية:** واجهات `EmployeeDepartment`، `EmployeeJobTitle`، `EmployeeJobGrade`، `EmployeeCostCenter`، `EmployeeTransfer`، `EmployeeLifecycleEvent`، `EmployeeOnboardingTask`، `EmployeeCustodyItem`، `EmployeeProbationReview`، `DepartmentNode`، وأنواع الصفوف `*Row` و`OrgServiceDeps`.

### `src/services/domains/hr/EmployeeOrganizationService/context.ts`

- **الغرض:** سياق الصلاحيات والتدقيق المشترك.
- **الأعضاء الرئيسية:** `requireManage`، `requireView`، `audit` (يسجل عمليات التعديل)، `requireDepartment` (يجلب قسماً ويتحقق منه).

### `src/services/domains/hr/EmployeeOrganizationService/departments.ts`

- **الغرض:** إدارة الأقسام وهيكلها الشجري والشواغر.
- **الأعضاء الرئيسية:** `getDepartments`، `createDepartment`، `updateDepartment`، `deactivateDepartment`، `updateDepartmentStructure`، `getOrgTree`، `getVacancies`.

### `src/services/domains/hr/EmployeeOrganizationService/catalog.ts`

- **الغرض:** كتالوج المسميات الوظيفية والدرجات ومراكز التكلفة.
- **الأعضاء الرئيسية:** مسميات (`getJobTitles`، `createJobTitle`، `updateJobTitle`، `deactivateJobTitle`)؛ درجات (`getJobGrades`، `createJobGrade`، `deactivateJobGrade`)؛ مراكز تكلفة (`getCostCenters`، `createCostCenter`، `deactivateCostCenter`).

### `src/services/domains/hr/EmployeeOrganizationService/people.ts`

- **الغرض:** نقل الموظفين وأحداث دورة الحياة الوظيفية.
- **الأعضاء الرئيسية:** `transferEmployee`، `getTransfers`، `addLifecycleEvent`، `getLifecycleEvents`.

### `src/services/domains/hr/EmployeeOrganizationService/onboarding.ts`

- **الغرض:** قوائم مهام الإلحاق (onboarding) وأصناف العهد.
- **الأعضاء الرئيسية:** `getOnboardingTasks`، `createOnboardingChecklist`، `completeOnboardingTask`، `cancelOnboardingTask`، `getOnboardingReport`؛ عهد: `getCustodyItems`، `assignCustodyItem`، `returnCustodyItem`.

### `src/services/domains/hr/EmployeeOrganizationService/reviews.ts`

- **الغرض:** مراجعات فترة التجربة (probation) والتقارير الدورية.
- **الأعضاء الرئيسية:** `getProbationReviews`، `createProbationReview`، `submitProbationReview`، `getProbationReport`، `runProbationCycle`.

### `src/services/domains/hr/EmployeeOrganizationService/lifecycle.ts`

- **الغرض:** إنهاء الخدمة (offboarding)، الترقية، وتنبيهات HR.
- **الأعضاء الرئيسية:** `requestOffboardingApproval`، `finalizeOffboarding`، `promoteEmployee`، `notifyHrAlerts`.

---

## مجلد `EmployeeService/` — وحدات الموظفين والرواتب الداخلية

### `src/services/domains/hr/EmployeeService/types.ts`

- **الغرض:** الأنواع المركزية للموظفين والرواتب والحضور.
- **الأعضاء الرئيسية:** enums `EmployeeStatus`، `SalaryType`، `EmploymentType`، `PayrollTxType`، `AttendanceStatus`؛ وواجهات `Employee`، `EmployeeBranchAssignment`، `SalesRepOption`، `PayrollTransaction`، `Attendance`، `EmployeeFinancials`، `EmployeePayrollPayable`، `PayrollPaymentInstruction`، `PayrollPayOptions`، `PayrollPaymentReconciliation(Item)`، `PayrollRunItem`، `PayrollRun`، `PayrollTransactionInput`، و`PayrollRunStatus`/`PayrollPaymentMethod`/`PayrollPayoutStatus`.

### `src/services/domains/hr/EmployeeService/utils.ts`

- **الغرض:** أدوات حسابية نقية للرواتب (أيام عمل، مبالغ، تواريخ).
- **الأعضاء الرئيسية:** `roundMoney`، `daysBetweenInclusive`، `countScheduledWorkdays`، `countLeaveDays`، `isEmployeeScheduledOn`، `isValidPayrollPeriod`، `WORKING_HOURS_PER_DAY`، `isValidDate`، `fingerprintPayrollSources` (بصمة مصادر الرواتب لكشف التغييرات)، `normalizePhone`.

### `src/services/domains/hr/EmployeeService/employeeQueries.ts`

- **الغرض:** بناء استعلامات الموظفين وتحقق الحقول وتعيينات الفروع.
- **الأعضاء الرئيسية:** `EmployeeListOptions`؛ `buildEmployeeListQuery`، `buildEmployeeByIdQuery`، `hydrateEmployee`، `normalizeAdditionalBranchIds`، `syncBranchAssignments`، `listBranchAssignments`، `getSalesReps`، `validateEmployeeFields`، `validateEmployeeOrganization`.

### `src/services/domains/hr/EmployeeService/employeeMutations.ts`

- **الغرض:** كتابة سجلات الموظفين (INSERT/UPDATE) داخل معاملة قاعدة البيانات.
- **الأعضاء الرئيسية:** أنواع `EmployeeCreateInput`، `EmployeeUpdateInput`، `InsertEmployeeArgs`، `UpdateEmployeeArgs`؛ ودالتان `insertEmployeeRecord`، `updateEmployeeRecord`.

### `src/services/domains/hr/EmployeeService/payrollTransactions.ts`

- **الغرض:** معاملات الرواتب — السلف، الاستحقاقات،resolution الدفع، والترحيل المحاسبي.
- **الأعضاء الرئيسية:** `PayrollQueryServices`؛ `buildTransactionsQuery`، `ensureSalaryAccrual`، `applyAdvancesToSalary`، `getPayrollPayable`، `getPayrollPostingLines`، `resolveBankAccount`، `PayrollPaymentResolution`، `resolvePayrollPayment`، `persistPayrollTransaction`، `assertPayrollPeriodEditable`.
- **ملاحظات:** يستدعي `postLedgerEntry` من `database/repositories/ledger`.

### `src/services/domains/hr/EmployeeService/payrollRunReaders.ts`

- **الغرض:** قراءة تشغيلات الرواتب وبنودها من قاعدة البيانات (sync وAsync وbatch).
- **الأعضاء الرئيسية:** `buildPayrollRunQuery`، `readPayrollRunItemsSync`/`Async`/`BatchAsync`، `readPayrollRunSync`/`Async`، `mapPayrollRunRows`.

### `src/services/domains/hr/EmployeeService/payrollRunEngine.ts`

- **الغرض:** محرك حساب وتشغيل الرواتب — جلب مصادر الرواتب، حساب البنود، حفظ المسودة، الاعتماد، وخطط الدفع.
- **الأعضاء الرئيسية:** `getPayrollSourceRows`/`PayrollSourceRows`؛ `CalculatedPayrollItem`؛ `computePayrollRunItems` (يحسب بنود كل موظف)؛ `SavePayrollRunDraftArgs`؛ `savePayrollRunDraft`؛ `approvePayrollRunInTransaction`؛ `PayrollPayoutResolution`؛ `buildPayrollPayoutPlan`؛ `resolvePayrollBatchReference`؛ `persistPayrollPayouts`.
- **ملاحظات:** يُستخدم من `EmployeeService` ويستهلك حسابات `PayrollTaxService` و`PayrollSocialInsuranceService` وبيانات الحضور/الإجازات.

### `src/services/domains/hr/EmployeeService/payrollReports.ts`

- **الغرض:** تقارير الرواتب — تسوية المدفوعات، خيارات الصرف، المستحقات، الحضور المالي، وإجمالي فاتورة الرواتب.
- **الأعضاء الرئيسية:** `ScopedQueryServices`؛ `buildPaymentReconciliation`؛ `getPayrollPayoutOptionsData`/`Async`؛ `buildPayrollPayablesSpec`؛ `queryPayrollPayables`/`Async`؛ `buildEmployeeFinancials`؛ `buildAttendanceQuery`؛ `listAttendance`/`Async`؛ `listLocationCounts`/`Async`؛ `fetchActiveEmployeeSalaries`/`Async`؛ `computeTotalWagesBill`.

---

## مجلد `LeaveService/` — وحدات الإجازات الداخلية

### `src/services/domains/hr/LeaveService/types.ts`

- **الغرض:** أنواع الإجازات المشتركة بين الوحدات.
- **الأعضاء الرئيسية:** واجهات `LeaveBalanceSummary`، `LeaveBalanceTransaction`، `LeaveTypePolicy`، `AnnualLeaveAccrualPolicy`، `AnnualLeaveAccrualPolicyState`، `LeaveCalendarEntry`، `AnnualLeavePolicyRow`، `AttendanceSnapshot`، `LeaveScheduleRow`، و`LeaveServiceDeps`.

### `src/services/domains/hr/LeaveService/utils.ts`

- **الغرض:** أدوات تاريخية نقية للإجازات.
- **الأعضاء الرئيسية:** `LEAVE_TYPES`، `DATE_PATTERN`، `assertDate`، `dateOffset`، `yearStart`، `yearEnd`، `monthStart`، `monthEnd`، `daysInMonth`، `roundLeaveDays`، `dateYears`.

### `src/services/domains/hr/LeaveService/access.ts`

- **الغرض:** نطاق بيانات الموظف للصلاحيات.
- **الأعضاء الرئيسية:** `employeeDataScope` — يبني شرط SQL لعزل بيانات الموظف حسب صلاحيات المستخدم.

### `src/services/domains/hr/LeaveService/accrual.ts`

- **الغرض:** استحقاق الإجازات السنوية — السياسة الفعالة وتوليد معاملات الرصيد.
- **الأعضاء الرئيسية:** `queryAnnualLeavePolicy`، `effectiveAnnualLeavePolicy`، `insertGeneratedBalanceTransaction`، `ensureAnnualLeaveAccrual`.

### `src/services/domains/hr/LeaveService/attendanceBridge.ts`

- **الغرض:** جسر بين الإجازات المعتمدة وسجلات الحضور — تطبيق/استعادة أيام الإجازة في الحضور.
- **الأعضاء الرئيسية:** `attendanceSnapshot`، `applyApprovedLeaveAttendance`، `restoreLeaveAttendance`.

### `src/services/domains/hr/LeaveService/balance.ts`

- **الغرض:** أرصدة الإجازات — الملخصات والمعاملات والتسويات اليدوية.
- **الأعضاء الرئيسية:** `getBalanceSummary`، `getAnnualBalanceAsOf`، `getBalanceTransactions`، `adjustAnnualBalance`.

### `src/services/domains/hr/LeaveService/balanceRules.ts`

- **الغرض:** قواعد تحقق من الأرصدة — الحد الأقصى للرصيد السنوي وحدود كل نوع إجازة.
- **الأعضاء الرئيسية:** `assertAnnualBalance`، `assertTypeLimits`.

### `src/services/domains/hr/LeaveService/policies.ts`

- **الغرض:** إدارة سياسات الاستحقاق السنوي وسياسات كل نوع إجازة.
- **الأعضاء الرئيسية:** `getAnnualAccrualPolicyState`، `saveAnnualAccrualPolicy`، `getTypePolicies`/`Async`، `saveTypePolicy`.

### `src/services/domains/hr/LeaveService/reports.ts`

- **الغرض:** تقارير الإجازات — التقويم، الطلبات، والملخصات.
- **الأعضاء الرئيسية:** `getCalendar`/`Async`، `getRequests`/`Async`، `getSummary`/`Async`.

### `src/services/domains/hr/LeaveService/requestQueries.ts`

- **الغرض:** استعلامات مساعدة لطلبات الإجازات — التحقق من الفترات، عدم التداخل، أيام محسوبة، وفلاتر.
- **الأعضاء الرئيسية:** `assertPayrollPeriodsEditable`، `assertNoOverlap`، `assertEmploymentPeriod`، `getChargeableDates`/`Async`، `getChargeableDays`/`Async`، `getYearlyRequests`/`Async`، `getYearlyRequestDays`/`Async`، `buildRequestFilterConditions`.

### `src/services/domains/hr/LeaveService/requests.ts`

- **الغرض:** عمليات طلبات الإجازات — الاستعلام، التقديم، القرار، والإلغاء.
- **الأعضاء الرئيسية:** `queryRequest`، `requireRequestExists`، `requestLeave`، `decide`، `cancel`.
- **ملاحظات:** يستدعي `requestQueries` للتحققات و`attendanceBridge` لتحديث الحضور عند الاعتماد.

---

## ملخص العلاقات بين الخدمات

- **RecruitmentService** → `EmployeeService.create` + `ContractService.createContract` (عند التوظيف النهائي).
- **ContractService** → `LeaveService.getAnnualBalanceAsOf` (حساب رصيد الإجازات عند إنهاء العقد).
- **EmployeeSelfServiceService** → `LeaveService` (أرصدة وطلبات الإجازات).
- **HrAlertsService** → `PayrollNotificationSettingsService` (آفاق التنبيهات) + `NotificationService`.
- **PayrollCalendarService** → `EmployeeService` (تشغيلات الرواتب) + `FinancialCalendarEventsService` (التقويم المالي).
- **HrDisciplineService** → `ApprovalService` (اعتماد الجزاءات) + `NotificationService`.
- **HrBenefitsService** → `EmployeeService.addTransaction` + `postLedgerEntry` (سداد الأقساض).
- **CommissionService** / **TrainingService** / **payrollTransactions** → `postLedgerEntry`/`reverseLedgerEntry` (ترحيل محاسبي).
- **AttendanceService** → `AttendanceTimeService` (عبر `periods.ts`)؛ **AttendanceDeviceService** → `AttendanceTimeService` أيضاً.
- **PerformanceService** → استعلامات مباشرة لجدول الحضور لحساب درجات KPI الآلية.
