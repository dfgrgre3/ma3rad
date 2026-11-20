# توثيق طبقة الخدمات — `src/services/domains/platform/`

خدمات إدارة المنصة (Platform Admin / SaaS) في تطبيق ERP: إدارة العملاء (Tenants)، الخطط والاشتراكات، التراخيص والأجهزة، الفوترة، الموظفين وصلاحياتهم، الدعم الفني، التحليلات، الصحة والتشغيل، النسخ الاحتياطي، والتكاملات. كلها تعمل إما على قاعدة البيانات المحلية عبر `DatabaseManager` أو عبر خادم المنصة المركزي عبر جسر Electron (`PlatformAdminApiClient`).

ملاحظة عامة: معظم الخدمات تتبع نفس النمط — `requirePlatformAccess(modules, action)` للتحقق من الصلاحيات، `centralAuditService.log(...)` للتدقيق، ومappers لتحويل صفوف SQLite إلى أنواع `platformTypes`.

---

## الجذر (Root)

### `src/services/domains/platform/CentralAppBackupService.ts`
- **الغرض:** قناة نسخ احتياطي لتطبيق العميل (ERP) نحو المنصة المركزية.
- **الأعضاء الرئيسية:** `CentralAppBackupService` — `status()`، `listBackups()`، `pendingRestore()`، `createAndUploadBackup(type)`، `applyPendingRestore()`.
- **ملاحظات:** يستخدم `BackupService` من `services/infrastructure/backup` ويستدعي جسر Electron؛ الرفع مشفّر والملفات تُخزّن معتمّة على الخادم.

### `src/services/domains/platform/CentralAuditService.ts`
- **الغرض:** خدمة تدقيق مركزية بصيغة Singleton مع تجزئة سجلات (hash chain) وإشعارات.
- **الأعضاء الرئيسية:** `AuditRecordPayload`، `CentralAuditService` — `getInstance()`، `sanitize(value)` (إخفاء كلمات المرور والأسرار)، `inferSeverity(action)`، `log(...)`، `query(filters)`، `queryAllForExport(filters)`، `verifyIntegrity(sampleLimit)`؛ وثابت `centralAuditService`.
- **ملاحظات:** يستخدم `DatabaseManager` و`NotificationService`؛ تُستدعى من جميع خدمات المنصة عبر `centralAuditService`.

### `src/services/domains/platform/CentralAuditService.test.ts`
- اختبار وحدة لخدمة التدقيق المركزي (تنظيف الحقول الحساسة إلخ). (الاسم فقط)

### `src/services/domains/platform/CentralPlatformClient.ts`
- **الغرض:** نقطة دخول موحّدة لعملاء Super Admin عند `dataSource === 'central'`.
- **الأعضاء الرئيسية:** `CentralPlatformClient extends PlatformAdminApiClient`، وثابت `centralPlatformClient`.

### `src/services/domains/platform/IdentityLinkService.ts`
- **الغرض:** ربط الهويات بين موظفي المنصة ومستخدمي ERP/العملاء.
- **الأعضاء الرئيسية:** `IdentityLink`، `IdentityLinkService` — `ensureSchema()`، `link(input)`، `findByTenantUser/ErpUser/PlatformStaff(id)`؛ وثابت `identityLinkService`.
- **ملاحظات:** يستخدم `DatabaseManager` مباشرة؛ يُستخدم من `PlatformBootstrapService` و`ProvisioningExecutorService`.

### `src/services/domains/platform/PlatformAdminApiClient.ts`
- **الغرض:** عميل HTTP لعمليات Super Admin نحو الخادم المركزي عبر جسر Electron؛ النواة + دمج واجهات المجالات.
- **الأعضاء الرئيسية:** إعادة تصدير `CentralApiError` و`mapCentral*` وأنواع core؛ دمج الكلاسات بواجهة `PlatformAdminApiClient extends TenantApi, DirectoryApi, LicenseApi, AuditSecurityApi, IntegrationApi, BillingApi, OperationsApi, SupportApi, SettingsApi, TenantExperienceApi`؛ `PlatformAdminApiClient` — `setBaseUrl`، `setAuthToken/clearAuthToken/getAuthToken`، `isAvailable()`، `login(username,password)`، `getCurrentAdmin()`، `request(...)`؛ وثابت `platformAdminApiClient`.
- **ملاحظات:** يجمّع ملفات `PlatformAdminApiClient/*.ts` ويُلصقها على الـ prototype.

### `src/services/domains/platform/PlatformAdminControl.test.ts`
- اختبار نمذجة أدوار موظفي المنصة وصلاحياتهم. (الاسم فقط)

### `src/services/domains/platform/PlatformAdminService.ts`
- **الغرض:** واجهة (Facade) لتوافقية عكسية — يفوّض إلى الخدمات المتخصصة، ويحتفظ بعمليات محلية قديمة (bulk CSV، كشف الأجهزة المكررة، remote control).
- **الأعضاء الرئيسية:** `PlatformAdminService` — `isPlatformOwner/requirePlatformOwner/requirePlatformAccess`، `getDataSource/setDataSource('local'|'central')`، `auditPlatformOwnerAccounts()`، `changeTenantPlan()`، `resetTenantDevices()`، `exportLicenseComplianceReport()`، `detectCloneDevices()/detectCloneDevicesCentral()`، `bulkChangeTenantStatus/bulkChangeTenantPlan/bulkSendActivation/bulkExportTenants/bulkImportTenants/importTenantsCsv`، `getTenantRemoteControl/pushTenantConfig/forceTenantSync/getSignedClientRuntimeConfig`؛ `create*Api()` factories (tenants, billing, modulesLicenses, support, staff, configuration, operations)؛ وإعادة تصدير `PLATFORM_TENANT_STATUS_LABELS/PLATFORM_INVOICE_STATUS_LABELS`؛ وثابت `platformAdminService`.
- **ملاحظات:** عند `dataSource='central'` يفوّض إلى `platformAdminApiClient`، وإلا للخدمات المحلية؛ التوثيق الداخلي يحث على استخدام الخدمات المتخصصة مباشرة.

### `src/services/domains/platform/PlatformAnalyticsService.ts`
- **الغرض:** واجهة للتحليلات المركزية — تفوّض لدوال `PlatformAnalyticsService/*.ts`.
- **الأعضاء الرئيسية:** `PlatformAnalyticsService` — `requirePlatformAccess`، `audit`، `getBusinessPerformance/getCustomerMetrics/getSubscriptionMetrics/getLicenseMetrics/getOperationsMetrics(period, planId)`، `getOverviewWithPeriod`، `getAlertDetails`؛ وثابت `platformAnalyticsService`.

### `src/services/domains/platform/PlatformAppConfig.test.ts`
- اختبار نمذجة قوالب التكوين والتوزيعات. (الاسم فقط)

### `src/services/domains/platform/PlatformAuditService.ts`
- **الغرض:** استعلامات سجل تدقيق المنصة (محلي) مع تحقق من سلامة السلسلة.
- **الأعضاء الرئيسية:** `PlatformAuditService` — `listAudit(limit,search)`، `queryAuditPaginated(filters)`، `queryAuditForExport(filters)`، `verifyAuditIntegrity()`، `mapEntry`؛ وثابت `platformAuditService`.
- **ملاحظات:** يستخدم `DatabaseManager` + `AuthService` + `PlatformStaffAuthService` + `PlatformAuthorizationService` + `centralAuditService`.

### `src/services/domains/platform/PlatformAuthorizationService.ts`
- **الغرض:** RBAC للمنصة — تعريف الأدوار، خرائط المسارات/الأذونات، وفحص الصلاحيات.
- **الأعضاء الرئيسية:** `PLATFORM_ROLE_DEFINITIONS`، `PLATFORM_ROUTE_MODULE_MAP`، `PLATFORM_ROUTE_PERMISSION_MAP`، `PLATFORM_PERMISSION_SECTIONS_FOR_UI`، `invalidatePlatformRolePermissionsCache()`؛ `PlatformAuthorizationService` — `getRolePermissions/roleHasPermission/canAccessPermission/canAccessRouteGranular/listRolePermissionMatrix/setRolePermissions/canAccessModule/canAccessRoute/getStaffByEmail`.
- **ملاحظات:** يستورد `PLATFORM_ROLE_DEFAULT_PERMISSIONS` و`PLATFORM_ALL_PERMISSION` و`PLATFORM_PERMISSION_SECTIONS` من `platformPermissionCatalog.ts`.

### `src/services/domains/platform/PlatformBootstrapService.ts`
- **الغرض:** تهيئة لمرة واحدة لحساب مالك المنصة (SUPER_ADMIN) بكلمة مرور قوية — لا توجد كلمة مرور افتراضية.
- **الأعضاء الرئيسية:** `PlatformOwnerBootstrapInput/Result/AuditEntry`؛ `PlatformBootstrapService(db)` — `isBootstrapped()`، `auditOwnerAccounts()`، `bootstrap(input)`، `assertStrongPassword`.
- **ملاحظات:** يستخدم `bcryptjs` و`identityLinkService`؛ دور SUPER_ADMIN لا يُنشأ إلا عبر هذه الخدمة.

### `src/services/domains/platform/PlatformBranding.test.ts`
- اختبار نمذجة الهوية البصرية. (الاسم فقط)

### `src/services/domains/platform/PlatformBrandingService.ts`
- **الغرض:** هوية المنصة والعميل (white-label) وتخصيص الواجهة وملفات UI، مع إصدارات واسترجاع.
- **الأعضاء الرئيسية:** `PlatformBrandingService` — `getPlatformBranding/getTenantBranding/saveTenantBranding/listTenantBrandingVersions/rollbackTenantBranding`، `listUiProfiles/createUiProfile`، `getTenantUiCustomization/saveTenantUiCustomization/listTenantUiVersions/rollbackTenantUi` + mappers؛ وثابت `platformBrandingService`.

### `src/services/domains/platform/PlatformConfigService.ts`
- **الغرض:** محرك التكوين الديناميكي — قوالب، تكوين لكل عميل، rollouts واستجابات (acks).
- **الأعضاء الرئيسية:** `PlatformConfigService` — `listConfigTemplates/getConfigTemplate/createConfigTemplate`، `getTenantConfig/saveTenantConfig/listTenantConfigVersions/rollbackTenantConfig`، `createConfigRollout/listConfigRollouts/getConfigRollout/startConfigRollout/completeConfigRollout/cancelConfigRollout`، `listConfigAcks/acknowledgeConfig`؛ وثابت `platformConfigService`.

### `src/services/domains/platform/PlatformCouponService.ts`
- **الغرض:** إدارة كوبونات الخصم والتحقق منها.
- **الأعضاء الرئيسية:** `PlatformCouponService` — `listCoupons/getCoupon/createCoupon/updateCoupon/deleteCoupon`، `validateCoupon(code,subtotal)`، `applyCoupon(code,planId)`؛ وثابت `platformCouponService`.

### `src/services/domains/platform/PlatformCustomization.test.ts`
- اختبار نمذجة ملفات تخصيص الواجهة. (الاسم فقط)

### `src/services/domains/platform/PlatformHealth.test.ts`
- اختبار نمذجة قياسات صحة النظام. (الاسم فقط)

### `src/services/domains/platform/PlatformHealthScore.test.ts`
- اختبار نمذجة مقاييس الصحة التقنية (نقاط الجاهزية والتشغيل). (الاسم فقط)

### `src/services/domains/platform/PlatformHealthService.ts`
- **الغرض:** صحة المنصة الشاملة والتشخيص، النسخ الاحتياطية المركزية، الحوادث، مهام التشغيل، نوافذ الصيانة، الموافقات، وسجل المزامنة.
- **الأعضاء الرئيسية:** `PlatformHealthService` — `getPlatformComprehensiveHealth/getTechnicalHealthMetrics/getPlatformHealthDashboard`، `listCentralBackups/triggerCentralBackup/getCentralBackup/deleteCentralBackup`، `listServiceIncidents/createServiceIncident/getServiceIncident/resolveServiceIncident`، `listOpsJobs/createOpsJob/cancelOpsJob/retryOpsJob/getOpsJob`، `listMaintenanceWindows/createMaintenanceWindow/cancelMaintenanceWindow/getMaintenanceWindow`، `listOpApprovals/requestOpApproval/approveOp/rejectOp/getOpApproval`، `listSyncStatus/logSyncEvent/getSyncLogEntry`؛ وثابت `platformHealthService`.
- **ملاحظات:** يستدعي `platformAnalyticsService` لبيانات المقاييس.

### `src/services/domains/platform/PlatformInvoiceService.ts`
- **الغرض:** فواتير ومدفوعات المنصة.
- **الأعضاء الرئيسية:** `PlatformInvoiceService` — `listInvoices/getInvoice/createInvoice/setInvoiceStatus/voidInvoice`، `listPayments/addPayment/voidPayment/getPayment`؛ وثابت `platformInvoiceService`.

### `src/services/domains/platform/PlatformLicenseService.ts`
- **الغرض:** إصدار وتجديد وإدارة التراخيص والأجهزة وربط العتاد وكشف الأجهزة المكررة.
- **الأعضاء الرئيسية:** `PlatformLicenseService` — `listLicenses/getLicense/issueLicense/renewLicense/setLicenseStatus/setLicenseCouplingMode/bindLicenseHardware/deactivateLicenseDevice/listLicenseActivations`، `listDevices/registerDevice/setDeviceStatus/deleteDevice/markDeviceCloneSuspected/reassignDeviceSeat/suspendDevice/releaseDevice/revokeDevice/getDevice/detectCloneDevices`؛ وثابت `platformLicenseService`.
- **ملاحظات:** يستخدم `randomBytes` لتوليد مفاتيح الترخيص.

### `src/services/domains/platform/PlatformModuleFeatureService.ts`
- **الغرض:** وحدات المنتج وأعلام الميزات (feature flags) والتجاوزات وحزم الإصدارات وأهدافها.
- **الأعضاء الرئيسية:** `PlatformModuleFeatureService` — `listModules/listModulesForRuntime/setModuleEnabled`، `listFeatureFlags/listFeatureFlagsForRuntime/listFeatureOverrides/setFeatureOverride/removeFeatureOverride/upsertFeatureFlag/setFeatureEnabled/deleteFeatureFlag`، `listReleases/listReleaseTargets/setReleaseTargets/updateReleaseTargetStatus/disableRelease/rollbackRelease/upsertRelease`؛ وثابت `platformModuleFeatureService`.

### `src/services/domains/platform/PlatformNotificationService.ts`
- **الغرض:** إشعارات المنصة للعميل، مع فحص التراخيص/الاشتراكات المنتهية ومعالجة إجراءات الإشعار.
- **الأعضاء الرئيسية:** `PlatformNotification`، `PlatformNotificationService` — `listNotifications/getNotification/createNotification/markAsRead/markAllAsRead/deleteNotification`، `checkExpiringLicensesAndSubscriptions()`، `handleNotificationAction(id,action)`؛ وثابت `platformNotificationService`.

### `src/services/domains/platform/PlatformPlanService.ts`
- **الغرض:** خطط الاشتراك — إصداراتها، سجل الأسعار، قواعد الترقية، النسخ، وتأثير تغيير الخطة.
- **الأعضاء الرئيسية:** `PlatformPlanService` — `listPlans/createPlan/updatePlan/setPlanActive`، `listPlanVersions/getPlanVersion/listPriceHistory/copyPlan`، `listPlanUpgradeRules/setPlanUpgradeRule`، `previewPlanChangeImpact/validatePlanDeactivation`؛ وثابت `platformPlanService`.

### `src/services/domains/platform/PlatformSecurityCenter.test.ts`
- اختبار نمذجة جلسات الموظفين والحوادث ومفاتيح التوقيع. (الاسم فقط)

### `src/services/domains/platform/PlatformSettingsService.ts`
- **الغرض:** إعدادات المنصة العامة والسياسات (شروط/خصوصية/احتفاظ)، تدوير مفاتيح التشفير، وإعدادات النشاط لكل عميل مع إصدارات.
- **الأعضاء الرئيسية:** `PlatformSettingsService` — `getSettings/getSetting/updateSettings`، `getPlatformPolicies/savePlatformPolicies/rotatePlatformEncryptionKeys`، `getTenantActivity/saveTenantActivity/listTenantActivityVersions/rollbackTenantActivity`؛ وثابت `platformSettingsService`.

### `src/services/domains/platform/PlatformStaffAuthService.ts`
- **الغرض:** مصادقة موظفي المنصة — جلسات، قفل بعد محاولات فاشلة، أجهزة موثوقة، MFA.
- **الأعضاء الرئيسية:** `computePlatformDeviceFingerprint()`، `platformDeviceName()`؛ `PlatformStaffAuthService` — `SESSION_KEY`، `getCurrentSessionId/getCurrentPermissionsOverride/touchCurrentSession/trustCurrentDevice/isCurrentDeviceTrusted/endCurrentSession/revokeSessionsForStaff/revokeAllSessions`، `login(email,password,twoFactorCode)`، `recordLogin` (private).
- **ملاحظات:** يستخدم `authSession` و`platformStaffTwoFactorAuth` من `../auth` و`DatabaseManager`.

### `src/services/domains/platform/PlatformStaffService.ts`
- **الغرض:** إدارة موظفي المنصة — CRUD، الدعوات، كلمات المرور، MFA، الجلسات، الحوادث الأمنية، مفاتيح التوقيع، مصفوفة الصلاحيات، مفاتيح API.
- **الأعضاء الرئيسية:** `PlatformStaffService` — `listPlatformStaffRoles/listPlatformStaff/getPlatformStaff/createPlatformStaff/updatePlatformStaff/setPlatformStaffActive/deletePlatformStaff`، `createStaffInvite/listStaffInvites/revokeStaffInvite/getStaffInviteByToken/acceptStaffInvite/getStaffInvite`، `resetPlatformStaffPassword/forcePlatformStaffPasswordChange/changeOwnStaffPassword`، `listTrustedDevices/revokeTrustedDevice/trustCurrentStaffDevice`، `getOwnStaffMfaStatus/getStaffMfaEnforcement/setStaffMfaEnforcement/getStaffMfaCompliance/startMfaEnrollmentForStaffSelf/confirmMfaForStaffSelf/disableMfaForStaffSelf/resetStaffMfa`، `listStaffSessions/revokeStaffSession/revokeAllOtherStaffSessions/revokeStaffSessionsForStaff/listStaffLogins/recordStaffLoginAttempt`، `listPlatformSecurityIncidents/recordSecurityIncident/respondToSecurityIncident/getSecurityIncident/listPlatformSigningKeys/rotatePlatformSigningKey/getPlatformSecurityOverview`، `getStaffDataScope/setStaffDataScope/getRolePermissionMatrix/setRolePermissions/transferStaffPermissions`، `listApiKeys/createApiKey/revokeApiKey/rotateApiKey/validateApiKey`، `generateTotp`؛ وثابت `platformStaffService`.
- **ملاحظات:** معظم المنطق مفوّض لدوال `PlatformStaffService/*.ts` عبر `StaffServiceContext`.

### `src/services/domains/platform/PlatformSubscriptionService.ts`
- **الغرض:** الاشتراكات — إنشاء/تجريبي/تجديد/إلغاء/تغيير خطة مع كوبونات وموافقات ومفاتيح ترخيص وأحداث outbox.
- **الأعضاء الرئيسية:** `PlatformSubscriptionService` — `listSubscriptions/getSubscription/createSubscription/createTrialSubscription/renewTenantSubscription/cancelTenantSubscription/changeSubscriptionPlan` + private `assertPlanChangeApproved/getOpApproval/getTenant/getPlan/getUpgradeRule/validateCoupon/generateLicenseKey/enqueueTenantOutboxEvent/mapSubscription`؛ وثابت `platformSubscriptionService`.
- **ملاحظات:** يستورد `platformAdminApiClient`، `provisioningQueueService`، `provisioningExecutorService`.

### `src/services/domains/platform/PlatformSupport.test.ts`
- اختبار نمذجة تذاكر الدعم. (الاسم فقط)

### `src/services/domains/platform/PlatformSupportService.ts`
- **الغرض:** تذاكر الدعم الفني، الرسائل، الردود الجاهزة، والوصول عن بُعد (جلسات).
- **الأعضاء الرئيسية:** `PlatformSupportService` — `listSupportTickets/createSupportTicket/getSupportTicket/setSupportTicketStatus/assignSupportTicket/setSupportTicketPriority/rateSupportTicket/requestRemoteAccess/approveRemoteAccess/addSupportMessage/listSupportMessages/getSupportMessage/getSupportTicketDetails`، `listCannedReplies/createCannedReply/getCannedReply`، `startRemoteSession/endRemoteSession/listRemoteSessions/getRemoteSession`؛ وثابت `platformSupportService`.

### `src/services/domains/platform/PlatformTenantService.ts`
- **الغرض:** إدارة العملاء (Tenants) — CRUD، الحساب، المستخدمون، التجاوزات، مع نطاق بيانات الموظف.
- **الأعضاء الرئيسية:** `PlatformTenantService` — `listTenants/getTenant/createTenant/updateTenant/setTenantStatus/archiveTenant`، `getTenantProfile/getTenantAccount/createTenantAccount/resetTenantAccountPassword/setTenantAccountActive`، `listTenantUsers/createTenantUser/updateTenantUser/setTenantUserActive/deleteTenantUser/resendTenantUserInvite/markTenantUserProvisioned`، `listTenantOverrides/addTenantOverride/setTenantOverrideEnabled/removeTenantOverride` + private `staffTenantScope/nextSequence`؛ وثابت `platformTenantService`.
- **ملاحظات:** يفوّض لدوال `PlatformTenantService/*.ts` عبر `TenantServiceContext`.

### `src/services/domains/platform/ProvisioningExecutorService.ts`
- **الغرض:** تنفيذ مهام تزويد هوية العميل المعلّقة في الطابور (لا يُعلن PROVISIONED إلا بتأكيد فعلي).
- **الأعضاء الرئيسية:** `ProvisioningDrainResult`؛ `ProvisioningExecutorService` — `requestDrain()`، `processPending(limit)`، private `processJob/markFailed/defer/audit/bridge/setting`؛ وثابت `provisioningExecutorService`.
- **ملاحظات:** يستخدم `provisioningQueueService`، `identityLinkService`، `centralAuditService`، وجسر Electron.

### `src/services/domains/platform/ProvisioningQueueService.ts`
- **الغرض:** طابور مهام التزويد بحالات صارمة ودعم إعادة المحاولة.
- **الأعضاء الرئيسية:** `PROVISIONING_JOB_STATUSES`، `ProvisioningJobStatus`، `ProvisioningJob`، `PROVISIONING_MAX_ATTEMPTS=5`؛ `ProvisioningQueueService` — `ensureSchema/enqueue/listPending/listExpired/markProcessing/markDone/markFailed/markRetrying/markCancelled`؛ وثابت `provisioningQueueService`.

### `src/services/domains/platform/platformPermissionCatalog.ts`
- **الغرض:** كتالوج الصلاحيات الدقيقة للمنصة — بلا اعتماديات ليستخدمه الترحيل والتفويض معاً.
- **الأعضاء الرئيسية:** `PlatformPermissionDefinition/Section`، `PLATFORM_PERMISSION_SECTIONS`، `PLATFORM_PERMISSION_CATALOG`، `PLATFORM_PERMISSION_CODES`، `PLATFORM_ALL_PERMISSION='*'`، `STANDARD_ACTION_LABELS`، `PLATFORM_MODULE_KEYS`، `PLATFORM_ROLE_DEFAULT_PERMISSIONS`، `PLATFORM_ROLE_CODES`، `PlatformPageDefinition`، `PLATFORM_PAGE_CATALOG` (خرائط الصفحات→الأذونات بالعربية).

### `src/services/domains/platform/platformTypes.ts`
- **الغرض:** ملف re-export barrel لكل أنواع `platformTypes/*` (توافقية عكسية).
- **الأعضاء الرئيسية:** `export *` لكل ملفات المجلد الفرعي الـ20.

### `src/services/domains/platform/platformUtils.ts`
- **الغرض:** أدوات مشتركة لخدمات المنصة.
- **الأعضاء الرئيسية:** `nowIso`، `toNumber`، `formatCount`، `formatMoneyText`، `safeJsonArray/Object`، `addMonths/addDays`، `randomToken`، `generateTemporaryPassword`، `generateActivationCode`، `generateLicenseActivationCode`، `signCertificate`، `mapTenantAccount`، `mapTenantOverride`، `formatDate`.

### `src/services/domains/platform/PlatformAdminApiClient/*.ts` — انظر القسم المخصص أدناه

---

## `PlatformAdminApiClient/` — نقاط نهاية الخادم المركزي

كل ملف يعرّف واجهة `*Api` ودالة `create*Api()` تُلصق على `PlatformAdminApiClient`؛ جميعها تستدعي `this.request(...)` من core.

### `src/services/domains/platform/PlatformAdminApiClient/auditSecurity.ts`
- **الغرض:** مركز التدقيق، تقارير الأخطاء، مركز الأمان، مراقب المزامنة، مفاتيح التوقيع، مفاتيح API، وحظر IP.
- **الأعضاء الرئيسية:** `AuditSecurityApi` — `listAuditEvents/getAuditEvent/verifyAuditChain`، `listErrorReports/getErrorReportsSummary/setErrorReportStatus`، `getSecurityOverview/listSecurityEvents/listSyncEvents/getSyncStatus`، `listCentralSigningKeys/rotateCentralSigningKey`، `listApiKeys/createApiKey/revokeApiKey`، `listIpBans/banIp/liftIpBan`؛ `createAuditSecurityApi()`.

### `src/services/domains/platform/PlatformAdminApiClient/billing.ts`
- **الغرض:** نقاط الاشتراكات والفواتير والمدفوعات.
- **الأعضاء الرئيسية:** `BillingApi` — `listSubscriptions/renewSubscription/cancelSubscription/changeSubscriptionPlan`، `listInvoices/getInvoice/createInvoice/setInvoiceStatus/voidInvoice`، `listPayments/addPayment/voidPayment/createPayment`؛ `createBillingApi()`.

### `src/services/domains/platform/PlatformAdminApiClient/core.ts`
- **الغرض:** نواة العميل — أنواع الطلب/المغلّف، الخطأ، mappers لصفوف الخادم، وواجهة `PlatformAdminApiCore` المشتركة.
- **الأعضاء الرئيسية:** `CentralRequest`، `CentralApiEnvelope<T>`، `CentralApiError`، `PlatformAuditEvent/Query/Page/Verification`، `TenantFeaturePermissions`، `PlatformRoleSummary`، `safeJsonArray/toNumber`، `mapCentralLicense/Device/Invoice/Payment`، `PlatformAdminApiCore` (عقد getAuthToken/request/getSettings... إلخ).

### `src/services/domains/platform/PlatformAdminApiClient/directory.ts`
- **الغرض:** الدليل — الخطط، الأدوار وكتالوج الصلاحيات، موظفو المنصة، جلساتهم وأجهزتهم ودعواتهم، الإشعارات، وموظفو مركز التحكم الإداري.
- **الأعضاء الرئيسية:** `DirectoryApi` — `listPlans/createPlan/updatePlan`، `listStaff/createStaff`، `listRoles/getRolePermissions/getPermissionCatalog/updateRolePermissions`، `listStaffSessions/revokeStaffSession/listStaffDevices/revokeStaffDevice`، `listStaffInvites/createStaffInvite/revokeStaffInvite`، `listNotifications/sendNotification/listNotificationTemplates`، `listAdminControlStaff*/createAdminControlStaff/updateAdminControlStaff/deleteAdminControlStaff`؛ `createDirectoryApi()`.

### `src/services/domains/platform/PlatformAdminApiClient/integrations.ts`
- **الغرض:** التكاملات — webhooks الصادرة ومزودو الدفع/SMS.
- **الأعضاء الرئيسية:** `IntegrationApi` — `listWebhooks/createWebhook/updateWebhook/deleteWebhook/testWebhook`، `listIntegrationProviders/updateIntegrationProvider`؛ `createIntegrationApi()`.

### `src/services/domains/platform/PlatformAdminApiClient/licenses.ts`
- **الغرض:** التراخيص والأجهزة — إصدار، تجديد/تعليق/إلغاء/إعادة تفعيل/نقل، إدارة مقاعد الأجهزة، وكشف الاستنساخ.
- **الأعضاء الرئيسية:** `LicenseApi` — `renewLicense/suspendLicense/revokeLicense/issueLicense/listLicenses/reactivateLicense/transferLicense`، `listDevices/suspendDevice/releaseDevice/revokeDevice/detectCloneDevices`؛ `createLicenseApi()`.

### `src/services/domains/platform/PlatformAdminApiClient/operations.ts`
- **الغرض:** التشغيل — النسخ الاحتياطية (مركزية + تطبيق)، استعادة النسخ، مهام العمليات، استخدام العملاء، وحزم الإصدارات.
- **الأعضاء الرئيسية:** `OperationsApi` — `listBackups/createBackup/getBackup/downloadBackupArtifact/restoreBackup`، `listAppBackups/getAppBackup/requestAppBackupRestore/cancelAppBackupRestore/listBackupRestores`، `listOpsJobs/createOpsJob/cancelOpsJob/retryOpsJob`، `listTenantUsage/getTenantUsageDetail`، `listReleases/createRelease/updateRelease/publishRelease/rollbackRelease/deleteRelease`؛ `createOperationsApi()`.

### `src/services/domains/platform/PlatformAdminApiClient/settings.ts`
- **الغرض:** إعدادات المنصة، السياسات، الوحدات، أعلام الميزات، تجاوزات أذونات الميزات لكل عميل/خطة، النظرة العامة ومقاييس التحليلات.
- **الأعضاء الرئيسية:** `SettingsApi` — `getFeaturePermissions/setFeaturePermissions`، `getOverview/getSettings/updateSettings/getPlatformPolicies/savePlatformPolicies`، `listModules/createModule/updateModule`، `listFeatureFlags/createFeatureFlag/updateFeatureFlag/deleteFeatureFlag`، `getBusinessPerformance/getCustomerMetrics/getLicenseMetrics/getSubscriptionMetrics/getOperationsMetrics`؛ `createSettingsApi()`.

### `src/services/domains/platform/PlatformAdminApiClient/support.ts`
- **الغرض:** الدعم — التذاكر، الرسائل، والوصول عن بُعد.
- **الأعضاء الرئيسية:** `SupportApi` — `listSupportTickets/createSupportTicket/getSupportTicket/updateSupportTicket/addSupportTicketMessage/deleteSupportTicket`، `requestRemoteAccess/approveRemoteAccess`، `startRemoteSession/endRemoteSession/listRemoteSessions`؛ `createSupportApi()`.

### `src/services/domains/platform/PlatformAdminApiClient/tenantExperience.ts`
- **الغرض:** تجربة العميل — الهوية البصرية، تخصيص الواجهة، قوالب التكوين والتوزيعات، وإعدادات النشاط.
- **الأعضاء الرئيسية:** `TenantExperienceApi` — `getPlatformBranding/getTenantBranding/saveTenantBranding/listTenantBrandingVersions/rollbackTenantBranding`، `listUiProfiles/getTenantUiCustomization/saveTenantUiCustomization/listTenantUiVersions/rollbackTenantUi`، `listConfigTemplates/listConfigRollouts/createConfigRollout/startConfigRollout/listConfigAcks/getTenantConfig/saveTenantConfig/listTenantConfigVersions/rollbackTenantConfig`، `getTenantActivity/saveTenantActivity/listTenantActivityVersions/rollbackTenantActivity`؛ `createTenantExperienceApi()`.

### `src/services/domains/platform/PlatformAdminApiClient/tenants.ts`
- **الغرض:** نقاط العميل — CRUD، الحساب، مستخدمو الدليل، التجاوزات، المدفوعات، التحكم عن بُعد، والفروع.
- **الأعضاء الرئيسية:** `TenantApi` — `listTenants/createTenant/updateTenant/setTenantStatus/archiveTenant/getTenantProfile`، `createTenantAccount/resetTenantAccountPassword/setTenantAccountActive`، `listTenantUsers/createTenantUser/updateTenantUser/deleteTenantUser/setTenantUserActive/resendTenantUserInvite`، `listTenantOverrides/addTenantOverride/removeTenantOverride`، `recordTenantPayment/getTenantRemoteControl/pushTenantConfig/forceTenantSync`، `listTenantBranches/createTenantBranch/updateTenantBranch/closeTenantBranch`؛ `createTenantApi()`.

---

## `PlatformAdminService/` — تفويضات الواجهة (Local/Facade)

كل ملف يعرّف واجهة `*Api` ودالة `create*Api()` تفوّض لإحدى الخدمات المتخصصة؛ تُدمج في `PlatformAdminService`.

### `src/services/domains/platform/PlatformAdminService/billing.ts`
- **الغرض:** تفويضات تجارية → Plan/Subscription/Coupon/Invoice services.
- **الأعضاء الرئيسية:** `BillingApi` (خطط، اشتراكات، كوبونات، فواتير، مدفوعات — توقيعات مطابقة للخدمات)؛ `createBillingApi()`.

### `src/services/domains/platform/PlatformAdminService/configuration.ts`
- **الغرض:** تفويضات التكوين → Settings/Branding/Config services.
- **الأعضاء الرئيسية:** `ConfigurationApi` — `getSettings/updateSettings/getPlatformPolicies/savePlatformPolicies/rotatePlatformEncryptionKeys`، `getTenantActivity/saveTenantActivity/listTenantActivityVersions/rollbackTenantActivity`، `getPlatformBranding/getTenantBranding/saveTenantBranding/listTenantBrandingVersions/rollbackTenantBranding`، `listUiProfiles/getTenantUiCustomization/saveTenantUiCustomization/listTenantUiVersions/rollbackTenantUi`، `listConfigTemplates/getTenantConfig/saveTenantConfig/listTenantConfigVersions/rollbackTenantConfig/createConfigRollout/startConfigRollout/listConfigRollouts/listConfigAcks`؛ `createConfigurationApi()`.

### `src/services/domains/platform/PlatformAdminService/modulesLicenses.ts`
- **الغرض:** تفويضات الوحدات/الميزات/الإصدارات → ModuleFeatureService، والتراخيص/الأجهزة → LicenseService.
- **الأعضاء الرئيسية:** `ModulesLicensesApi` — `listModules/listModulesForRuntime`، `listFeatureFlags(+Runtime)/listFeatureOverrides/setFeatureOverride/removeFeatureOverride/upsertFeatureFlag/setFeatureEnabled/deleteFeatureFlag`، `listReleases/listReleaseTargets/setReleaseTargets/updateReleaseTargetStatus/disableRelease/rollbackRelease/upsertRelease`، `listLicenses/getLicense/issueLicense/renewLicense/setLicenseStatus/setLicenseCouplingMode/bindLicenseHardware/deactivateLicenseDevice/listLicenseActivations/listDevices/registerDevice/setDeviceStatus/deleteDevice/markDeviceCloneSuspected/reassignDeviceSeat/suspendDevice/releaseDevice/revokeDevice/getDevice`، ونسخ مركزية `listDevicesCentral/suspendDeviceCentral/releaseDeviceCentral/revokeDeviceCentral`؛ `createModulesLicensesApi()`.

### `src/services/domains/platform/PlatformAdminService/operations.ts`
- **الغرض:** تفويضات التشغيل → Health/Analytics/Audit services.
- **الأعضاء الرئيسية:** `OperationsApi` — صحة المنصة (`getPlatformComprehensiveHealth/getTechnicalHealthMetrics/getPlatformHealthDashboard`)، نسخ احتياطية وحوادث، مهام ops ونوافذ صيانة وموافقات ومزامنة، مقاييس وتحليلات (`getBusinessPerformance` … `getAlertDetails`)، واستعلامات التدقيق (`listAudit/queryAuditPaginated/queryAuditForExport/verifyAuditIntegrity`)؛ `createOperationsApi()`.

### `src/services/domains/platform/PlatformAdminService/staff.ts`
- **الغرض:** تفويضات الموظفين → StaffService.
- **الأعضاء الرئيسية:** `StaffApi` — مفاتيح API، CRUD موظفين ودعوات، كلمات مرور، أجهزة موثوقة، MFA، جلسات، تسجيلات دخول، حوادث أمنية، مفاتيح توقيع، نطاق البيانات، مصفوفة الأدوار، نظرة أمنية عامة؛ `createStaffApi()`.

### `src/services/domains/platform/PlatformAdminService/support.ts`
- **الغرض:** تفويضات الدعم → SupportService + فحوصات الإشعارات → NotificationService.
- **الأعضاء الرئيسية:** `SupportApi` — تذاكر/رسائل/ردود جاهزة/جلسات عن بُعد، `checkExpiringLicensesAndSubscriptions`، `handleNotificationAction`؛ `createSupportApi()`.

### `src/services/domains/platform/PlatformAdminService/tenants.ts`
- **الغرض:** تفويضات العملاء → TenantService.
- **الأعضاء الرئيسية:** `TenantApi` — CRUD عملاء، ملف العميل، حساب العميل، مستخدمو العميل، التجاوزات، `sendTenantActivation`؛ `createTenantApi()`.

---

## `PlatformAnalyticsService/` — منطق التحليلات (دوال نقية عبر `AnalyticsServiceContext`)

### `src/services/domains/platform/PlatformAnalyticsService/alerts.ts`
- **الغرض:** تفاصيل التنبيهات (تراخيص/اشتراكات منتهية، أجهزة مشتبهة…) باستعلامات SQL مباشرة.
- **الأعضاء الرئيسية:** `getAlertDetails(ctx)`.

### `src/services/domains/platform/PlatformAnalyticsService/business.ts`
- **الغرض:** مقاييس الأداء التجاري (إيرادات، مقارنات، سلاسل زمنية) لفترة وخطة.
- **الأعضاء الرئيسية:** `getBusinessPerformance(ctx, period, planId)`.

### `src/services/domains/platform/PlatformAnalyticsService/context.ts`
- **الغرض:** عقد سياق التحليلات المشترك.
- **الأعضاء الرئيسية:** `RequirePlatformAccessFn`، `AnalyticsServiceContext` (db + دوال getBusinessPerformance/getCustomerMetrics/…).

### `src/services/domains/platform/PlatformAnalyticsService/customers.ts`
- **الغرض:** مقاييس العملاء (حسب الحالة/الخطة).
- **الأعضاء الرئيسية:** `getCustomerMetrics(ctx, planId)`.

### `src/services/domains/platform/PlatformAnalyticsService/licenses.ts`
- **الغرض:** مقاييس التراخيص والأجهزة (نشطة/معلقة/مشتبهة).
- **الأعضاء الرئيسية:** `getLicenseMetrics(ctx)`.

### `src/services/domains/platform/PlatformAnalyticsService/operations.ts`
- **الغرض:** مقاييس التشغيل (أجهزة متصلة/غير متصلة، مهام، مزامنة).
- **الأعضاء الرئيسية:** `getOperationsMetrics(ctx)`.

### `src/services/domains/platform/PlatformAnalyticsService/overview.ts`
- **الغرض:** تجميع كل المقاييس في `PlatformOverview` واحد.
- **الأعضاء الرئيسية:** `getOverviewWithPeriod(ctx, period, planId)`.

### `src/services/domains/platform/PlatformAnalyticsService/periods.ts`
- **الغرض:** مساعدات الفترات والمقارنات والسلاسل الزمنية.
- **الأعضاء الرئيسية:** `createMetricComparison(current,previous)`، `createTimeSeriesPoint(period,value,label)`، `getPeriodRange(period)`، `getPreviousPeriodRange(period)`.

### `src/services/domains/platform/PlatformAnalyticsService/subscriptions.ts`
- **الغرض:** مقاييس الاشتراكات (MRR/ARR/حالات).
- **الأعضاء الرئيسية:** `getSubscriptionMetrics(ctx)`.

---

## `PlatformStaffService/` — منطق الموظفين (دوال نقية عبر `StaffServiceContext`)

### `src/services/domains/platform/PlatformStaffService/apiKeys.ts`
- **الغرض:** مفاتيح API للعملاء (CRUD/rotate/validate).
- **الأعضاء الرئيسية:** `listApiKeys/createApiKey/revokeApiKey/rotateApiKey/validateApiKey(ctx, …)`.

### `src/services/domains/platform/PlatformStaffService/context.ts`
- **الغرض:** عقد سياق خدمة الموظفين.
- **الأعضاء الرئيسية:** `StaffAuditOptions`، `StaffAuditFn`، `RequirePlatformAccessFn`، `AssertOwnerRoleGrantFn`، `StaffServiceContext`.

### `src/services/domains/platform/PlatformStaffService/devices.ts`
- **الغرض:** الأجهزة الموثوقة للموظفين.
- **الأعضاء الرئيسية:** `listTrustedDevices/revokeTrustedDevice/trustCurrentStaffDevice(ctx, …)`.

### `src/services/domains/platform/PlatformStaffService/invites.ts`
- **الغرض:** دعوات الموظفين (إنشاء/قبول/إلغاء/استعلام بالتوكن).
- **الأعضاء الرئيسية:** `createStaffInvite/listStaffInvites/revokeStaffInvite/getStaffInviteByToken/acceptStaffInvite/getStaffInvite`.

### `src/services/domains/platform/PlatformStaffService/mappers.ts`
- **الغرض:** تحويل صفوف DB إلى أنواع الموظفين.
- **الأعضاء الرئيسية:** `mapStaff/mapInvite/mapTrustedDevice/mapSession/mapLogin/mapSecurityIncident/mapSigningKey`.

### `src/services/domains/platform/PlatformStaffService/mfa.ts`
- **الغرض:** MFA للموظفين — حالة/سياسة/امتثال/تسجيل ذاتي/إعادة تعيين.
- **الأعضاء الرئيسية:** `getOwnStaffMfaStatus/getStaffMfaEnforcement/setStaffMfaEnforcement/getStaffMfaCompliance/startMfaEnrollmentForStaffSelf/confirmMfaForStaffSelf/disableMfaForStaffSelf/resetStaffMfa`.
- **ملاحظات:** يستخدم `platformStaffTwoFactorAuth` و`AuthService`.

### `src/services/domains/platform/PlatformStaffService/passwords.ts`
- **الغرض:** كلمات مرور الموظفين — إعادة تعيين/فرض التغيير/تغيير ذاتي.
- **الأعضاء الرئيسية:** `resetPlatformStaffPassword/forcePlatformStaffPasswordChange/changeOwnStaffPassword`.

### `src/services/domains/platform/PlatformStaffService/permissions.ts`
- **الغرض:** نطاق بيانات الموظف ومصفوفة الأدوار ونقل الصلاحيات.
- **الأعضاء الرئيسية:** `getStaffDataScope/setStaffDataScope/getRolePermissionMatrix/setRolePermissions/transferStaffPermissions`.
- **ملاحظات:** يستورد `PlatformAuthorizationService` و`STANDARD_ACTION_LABELS`.

### `src/services/domains/platform/PlatformStaffService/security.ts`
- **الغرض:** الحوادث الأمنية ومفاتيح التوقيع ومركز الأمان.
- **الأعضاء الرئيسية:** `listPlatformSecurityIncidents/recordSecurityIncident/respondToSecurityIncident/getSecurityIncident/listPlatformSigningKeys/rotatePlatformSigningKey/getPlatformSecurityOverview`.
- **ملاحظات:** يستدعي `platformAdminApiClient` لتدوير مفاتيح التوقيع مركزياً.

### `src/services/domains/platform/PlatformStaffService/sessions.ts`
- **الغرض:** جلسات الموظفين وتسجيلات الدخول.
- **الأعضاء الرئيسية:** `listStaffSessions/revokeStaffSession/revokeAllOtherStaffSessions/revokeStaffSessionsForStaff/listStaffLogins/recordStaffLoginAttempt`.

### `src/services/domains/platform/PlatformStaffService/shared.ts`
- **الغرض:** ثوابت مشتركة داخل المجموعة.
- **الأعضاء الرئيسية:** `PLATFORM_ROLE_CODES_SET`، `sanitizeStaffUsername(raw)`.

### `src/services/domains/platform/PlatformStaffService/staffManagement.ts`
- **الغرض:** CRUD موظفي المنصة والأدوار.
- **الأعضاء الرئيسية:** `listPlatformStaffRoles/listPlatformStaff/getPlatformStaff/createPlatformStaff/updatePlatformStaff/setPlatformStaffActive/deletePlatformStaff`.

---

## `PlatformTenantService/` — منطق العملاء (دوال نقية عبر `TenantServiceContext`)

### `src/services/domains/platform/PlatformTenantService/context.ts`
- **الغرض:** عقد سياق خدمة العملاء.
- **الأعضاء الرئيسية:** `TenantAuditOptions`، `TenantAuditFn`، `RequirePlatformAccessFn`، `TenantServiceContext`.

### `src/services/domains/platform/PlatformTenantService/helpers.ts`
- **الغرض:** مولّدات وأدوات مساعدة للعميل.
- **الأعضاء الرئيسية:** `generateTenantCode(db,name)`، `generateUsername(db,name,tenantId)`، `getActiveLicenseKey(db,tenantId)`، `getPlanModules(db,planId)`.

### `src/services/domains/platform/PlatformTenantService/mappers.ts`
- **الغرض:** تحويل صفوف DB إلى أنواع العملاء والفوترة.
- **الأعضاء الرئيسية:** `mapTenantJoinedRow/mapTenantBaseRow/mapTenantUser/mapPlan/mapSubscription/mapLicense/mapInvoice/mapPayment/mapAuditEntry`.

### `src/services/domains/platform/PlatformTenantService/tenantAccount.ts`
- **الغرض:** حساب العميل الرئيسي (إنشاء/إعادة تعيين كلمة مرور/تفعيل).
- **الأعضاء الرئيسية:** `getTenantAccount/createTenantAccount/resetTenantAccountPassword/setTenantAccountActive`؛ `buildActivationDetails` (private).
- **ملاحظات:** يستخدم `generateUsername/getActiveLicenseKey/getPlanModules` من helpers.

### `src/services/domains/platform/PlatformTenantService/tenantCrud.ts`
- **الغرض:** CRUD العملاء وحالاتهم وأرشفتهم.
- **الأعضاء الرئيسية:** `listTenants/getTenant/createTenant/updateTenant/setTenantStatus/archiveTenant`.
- **ملاحظات:** يراعي `staffTenantScope` (تقييد نطاق البيانات) ويستخدم `generateTenantCode`.

### `src/services/domains/platform/PlatformTenantService/tenantOverrides.ts`
- **الغرض:** تجاوزات لكل عميل (overrides).
- **الأعضاء الرئيسية:** `listTenantOverrides/addTenantOverride/setTenantOverrideEnabled/removeTenantOverride`.

### `src/services/domains/platform/PlatformTenantService/tenantProfile.ts`
- **الغرض:** ملف العميل التجميعي (خطة، اشتراك، ترخيص، فواتير، مدفوعات، تدقيق).
- **الأعضاء الرئيسية:** `getTenantProfile(ctx,id)`.

### `src/services/domains/platform/PlatformTenantService/tenantUsers.ts`
- **الغرض:** مستخدمو العميل وتزويد هوياتهم.
- **الأعضاء الرئيسية:** `listTenantUsers/createTenantUser/updateTenantUser/setTenantUserActive/deleteTenantUser/resendTenantUserInvite/markTenantUserProvisioned`.
- **ملاحظات:** يضع مهام في `provisioningQueueService` ويشغّل `provisioningExecutorService.requestDrain()`.

---

## `platformTypes/` — تعريفات الأنواع (Type-only)

### `src/services/domains/platform/platformTypes/analytics.ts`
- أنواع التحليلات: `PlatformPeriod`، `PLATFORM_PERIODS`، `PlatformTimeSeriesPoint`، `PlatformMetricComparison`، `PlatformBusinessPerformance`، `PlatformCustomerMetrics`، `PlatformSubscriptionMetrics`، `PlatformLicenseMetrics`، `PlatformOperationsMetrics`، `PlatformAlertDetail`، `PlatformReportFilters`، `PlatformComparisonReport`.

### `src/services/domains/platform/platformTypes/apiKeys.ts`
- `PlatformApiKey`، `PlatformApiKeyCreated`.

### `src/services/domains/platform/platformTypes/appConfig.ts`
- محرك التكوين: `PlatformConfigTemplate`، `PlatformTenantConfig`، `PlatformTenantConfigInput/Version`، `RolloutTargetType`، `RolloutStatus`، `PlatformConfigRollout`، `PlatformConfigRolloutInput`، `PlatformConfigAck`.

### `src/services/domains/platform/platformTypes/audit.ts`
- `AuditSeverity`، `AuditActorType`، `AuditStatus`، `PlatformAuditEntry`، `PlatformAuditFilters`، `PlatformAuditPaginatedResult`.

### `src/services/domains/platform/platformTypes/billing.ts`
- حالات الفوترة والاشتراك: `PlatformLicenseStatus`، `PlatformSubscriptionStatus`، `PlatformPaymentMethod`، `PlatformBillingCycle`، `PlatformCouplingMode`، `PlatformInvoiceStatus` + `PLATFORM_INVOICE_STATUS_LABELS`، `PlatformInvoiceItem`، `PlatformInvoice`، `PlatformInvoiceInput`، `PlatformPayment`، `PlatformPaymentInput`، `PlatformSubscription`، `PlatformCoupon`، `PlatformCouponInput`.

### `src/services/domains/platform/platformTypes/branding.ts`
- الهوية البصرية: `PlatformInvoiceTemplate`، `PlatformAllowedCustomizations`، `PlatformBrandingConfig`، `PlatformBrandingInput`، `PlatformBrandingVersion`.

### `src/services/domains/platform/platformTypes/catalog.ts`
- كتالوج المنتج: `PlatformAlert`، `PlatformModuleUsage`، `PlatformModule`، `PlatformFeatureFlag`، `PlatformFeatureOverride`، `PlatformRelease`، `PlatformReleaseTarget`، `PlatformSettingsMap`.

### `src/services/domains/platform/platformTypes/central.ts`
- عقد خادم الترخيص المركزي: `CentralLicenseIssueAction/Request/Response`، `CentralDeviceActionRequest/Response`، `CentralLicenseRenew/Suspend/Revoke/Transfer Request/Response`، `CentralDeviceListItem`، `CentralLicenseListItem`.

### `src/services/domains/platform/platformTypes/comms.ts`
- اتصالات/عمليات جماعية: `PlatformConfigPush`، `PlatformTenantConfigPushInput`، `PlatformOutboxEvent`، `PlatformNotification`.

### `src/services/domains/platform/platformTypes/health.ts`
- الصحة والتشغيل: `PlatformServerTelemetry`، `PlatformPolicyDocument`، `PlatformPolicyRetention`، `PlatformPolicySettings`، `PlatformCentralBackup`، `PlatformServiceIncident`، `PlatformComprehensiveHealth`، `PlatformTechnicalHealthMetrics`، `PlatformHealthDashboardData`.

### `src/services/domains/platform/platformTypes/license.ts`
- `PlatformLicense`، `PlatformLicenseActivation`، `PlatformDevice`.

### `src/services/domains/platform/platformTypes/operations.ts`
- مركز العمليات: `PlatformOpsJobStatus`، `PlatformOpsJobType`، `PlatformOpsJob`، `PlatformMaintenanceStatus`، `PlatformMaintenanceWindow`، `PlatformOpApprovalStatus`، `PlatformOpApproval`، `PlatformSyncStatus`، `PlatformSyncLogEntry`.

### `src/services/domains/platform/platformTypes/overview.ts`
- `PlatformOverview` (تجميعة كل المقاييس والتنبيهات والإصدارات).

### `src/services/domains/platform/platformTypes/plans.ts`
- الخطط: `PlatformPlan`، `PlatformPlanInput`، `PlatformPlanChangeType`، `PlatformPlanVersion`، `PlatformPlanVersionInput`، `PlatformPriceHistoryEntry`، `PlatformSubscriptionPriceLock`، `PlatformPlanUpgradeRule(+Input)`، `PlatformPlanCopyResult`، `PlatformPlanEffectivePricing`، `PlatformPlanImpactPreview`، `PlatformPlanChangeRequest/Result`، `PlatformPlanVersioningInput`، `PlatformSubscriptionCreateInput`، `PlatformTrialCreateInput`.

### `src/services/domains/platform/platformTypes/security.ts`
- مركز أمان المنصة: `PlatformStaffLogin`، `PlatformStaffSession`، `PlatformCentralSecurityIncident`، `PlatformSigningKey`، `PlatformCentralSecurityOverview`.

### `src/services/domains/platform/platformTypes/staff.ts`
- موظفو المنصة وRBAC: `PlatformStaffRole`، `PlatformStaff`، `PlatformStaffInput`، `PlatformStaffRoleDefinition`، `PlatformStaffInviteStatus`، `PlatformStaffInvite`، `PlatformStaffInviteInput/Created`، `PlatformTrustedDevice`، `PlatformStaffDataScope`، `PlatformStaffDataScopeState`، `PlatformRoleMatrix`.

### `src/services/domains/platform/platformTypes/support.ts`
- الدعم: `PlatformSupportTicket`، `PlatformSupportMessage`، `PlatformCannedReply`، `PlatformRemoteSession`، `PlatformSupportTicketDetails`.

### `src/services/domains/platform/platformTypes/tenant.ts`
- العملاء: `PlatformTenantStatus` + `PLATFORM_TENANT_STATUS_LABELS`، `PlatformTenant`، `PlatformTenantInput`، `PlatformTenantAccount`، `PlatformTenantAccountInput`، `PlatformTenantUsage`، `PlatformTenantProfile`، `PlatformActivationDetails`، `PlatformTenantOverride`، `PlatformTenantOverrideInput`.

### `src/services/domains/platform/platformTypes/tenantUsers.ts`
- مستخدمو العميل: `PlatformTenantUserProvisioningStatus`، `PlatformTenantUser`، `PlatformTenantUserInput`، `PlatformTenantUserProvisioningResult`.

### `src/services/domains/platform/platformTypes/uiCustomization.ts`
- تخصيص الواجهة: `FormFieldRule`، `PlatformUiProfile`، `PlatformTenantUiCustomization`، `PlatformTenantUiInput`، `PlatformTenantUiVersion`، `PlatformTenantActivityConfig`، `PlatformTenantActivityVersion`، `PlatformTenantActivityInput`.

---

## ملخص العلاقات

- **مصدر البيانات:** معظم الخدمات تستعلم `DatabaseManager` مباشرة (SQLite)؛ `PlatformAdminService.getDataSource()==='central'` يحوّل العمليات إلى `platformAdminApiClient`/`centralPlatformClient` عبر جسر Electron نحو خادم المنصة.
- **التدقيق:** كل الخدمات تستدعي `centralAuditService.log()` بعد التحقق عبر `PlatformAuthorizationService` + `PlatformStaffAuthService`.
- **التفويض:** `PlatformStaffService` → دوال `PlatformStaffService/*`؛ `PlatformTenantService` → `PlatformTenantService/*`؛ `PlatformAnalyticsService` → `PlatformAnalyticsService/*`؛ `PlatformAdminService` → كل الخدمات + `PlatformAdminApiClient`؛ `platformTypes.ts` → barrel لكل `platformTypes/*`.
- **التزويد:** `PlatformTenantService/tenantUsers` و`PlatformSubscriptionService` → `ProvisioningQueueService` + `ProvisioningExecutorService` → `IdentityLinkService`.
