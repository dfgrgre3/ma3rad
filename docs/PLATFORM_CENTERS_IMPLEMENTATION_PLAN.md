# خطة تنفيذ التطويرات المطلوبة للمراكز الإدارية (Platform Admin Centers)

**التاريخ:** 2026-11-15  
**النطاق:** 18 مركزاً إدارياً في لوحة `Super Admin`  
**المرجع الوظيفي:** الجدول رقم 9 — «التطويرات المطلوبة لكل مركز إداري»  
**حالة المستند:** خطة تنفيذ — لم يُعدّل أي كود إنتاجي بعد.

---

## 1. الملخص التنفيذي

الواجهة الإدارية موجودة بالفعل في `src/pages/platform/*` وتغطي معظم المراكز شكلياً، لكنها تعمل حالياً على **قاعدة البيانات المحلية** داخل تطبيق Electron عبر `PlatformAdminService` (≈395KB، أكثر من 300 دالة)، وليس على السيرفر المركزي.

السيرفر المركزي `central-server/server.js` يمتلك **27 مساراً فقط**، ويغطي: المصادقة، الموظفين (إنشاء/عرض)، العملاء (إنشاء/عرض)، الخطط (عرض)، التراخيص (إصدار/تجديد/تعليق/إلغاء/نقل/ربط)، والأجهزة. بينما:

- لا توجد جداول أو واجهات لـ: الفواتير، المدفوعات، الاشتراكات (إدارة)، المنتج، الإصدارات، الإعدادات، الأمان المتقدم، التدقيق، العمليات، التكاملات، الإشعارات، النسخ الاحتياطي، السياسات، بوابة العملاء.
- مسارات تفعيل/تحقق الترخيص `licensing/activate|validate|heartbeat` مسموحة في جسر Electron لكنها **غير موجودة على السيرفر**.
- ثلاث صفحات فقط (التكاملات، الإشعارات، بوابة العملاء) تعمل ببيانات ثابتة/محاكاة بالكامل، وصفحة النسخ الاحتياطي تنسخ قاعدة البيانات المحلية وليست نسخة سيرفر.
- محرر الصلاحيات لكل صفحة وإجراء **غير موجود في الواجهة** رغم وجود كتالوج وجدول مصفوفة داخل الخدمة.

**القرار المقترح:** جعل السيرفر المركزي هو **مصدر الحقيقة الوحيد** لكل بيانات لوحة الإدارة، مع طبقة API موحّدة، وصلاحيات صارمة على كل مسار، وتدقيق غير قابل للتعديل، ثم تحويل الواجهة تدريجياً من الخدمة المحلية إلى عميل API مركزي عبر جسر Electron، مع الإبقاء على الخدمة المحلية كمرجع/توافق حتى اكتمال الترحيل.

**المدة التقديرية:** 17–19 أسبوعاً بفريق من مطورين اثنين، أو 9–10 أسابيع بفريق من أربعة (بدون احتساب اعتماد خارجي على مزودي الدفع/الرسائل).

---

## 2. مصفوفة الجاهزية الحالية

الرموز: 🟢 جاهز مركزياً | 🟠 منفّذ محلياً فقط | 🔴 واجهة وهمية/محاكاة | ⚫ غير موجود.

| # | المركز الإداري | المسار الحالي | مصدر البيانات الحالي | الحالة | الفجوة الأساسية |
|---|---|---|---|---|---|
| 1 | Dashboard | `/platform` | `getOverview()` محلي | 🟠 | لا توجد مؤشرات من السيرفر، ولا مرشحات زمنية على الصفحة (الدالة `getOverviewWithPeriod` موجودة وغير مستخدمة) |
| 2 | Staff Management | `/platform/staff` + `/platform/admin-control` | خدمة محلية كاملة | 🟠 | السيرفر يدعم العرض/الإنشاء فقط؛ لا دورة حياة ولا دعوات ولا جلسات ولا MFA |
| 3 | Roles & Permissions | — | لا صفحة | ⚫ | لا محرر صفحات/إجراءات، ولا حفظ مركزي، ولا حماية لكل مسار |
| 4 | Tenants | `/platform/tenants` | خدمة محلية كاملة | 🟠 | السيرفر يدعم العرض/الإنشاء فقط، وقراءة القائمة بلا فحص صلاحية |
| 5 | Subscriptions | `/platform/subscriptions` | خدمة محلية | 🟠 | جدول مركزي موجود بلا أي مسار إدارة أو تجديد تلقائي |
| 6 | Licenses | `/platform/licenses` + `/devices` | خدمة محلية + مسارات مركزية جزئية | 🟠 | لا مسارات تحقق/تفعيل runtime، ولا إلغاء/تصدير امتثال |
| 7 | Billing | `/platform/billing` | خدمة محلية | 🟠 | لا جداول فواتير/مدفوعات مركزية، ولا بوابات دفع |
| 8 | Product Control | `/platform/product` + `/platform/plans` | خدمة محلية | 🟠 | لا وحدات/مزايا/تجاوزات مركزية |
| 9 | Release Management | `/platform/releases` + تبويب المنتج | خدمة محلية | 🟠 | لا إصدارات مركزية ولا تغذية تحديث موقّعة للعملاء |
| 10 | Configuration | `/platform/settings|app-configuration|branding|customization|activity` | خدمة محلية | 🟠 | لا إعدادات مركزية ولا إصدارات/بث/إقرارات |
| 11 | Security Center | `/platform/security-center` | خدمة محلية | 🟠 | السيرفر يملك جلسات/MFA فقط؛ لا حوادث/أجهزة موثوقة/مفاتيح API |
| 12 | Audit Center | `/platform/audit` | سلسلة Hash محلية | 🟠 | سجل السيرفر عادي بلا سلسلة تجزئة ولا منع تعديل/حذف |
| 13 | Operations | `/platform/operations|emergency|support|sync` | خدمة محلية | 🟠 | لا مهام/صيانة/موافقات/سجلات مزامنة مركزية |
| 14 | Integrations | `/platform/integrations` | مصفوفات ثابتة في الصفحة | 🔴 | Webhooks وبوابات دفع ومزودو رسائل غير موجودين فعلياً |
| 15 | Notifications | `/platform/notifications` | سجلات ثابتة | 🔴 | لا إرسال فعلي ولا قوالب ولا تتبع تسليم |
| 16 | Backups | `/platform/backups` | نسخ قاعدة محلية عبر Electron | 🟠 | لا نسخ لقاعدة السيرفر، ولا تخزين بعيد، ولا استعادة مركزية |
| 17 | Policies | `/platform/policies` | إعدادات محلية (نص واحد) | 🟠 | لا إصدارات ولا دورة نشر ولا إقرارات |
| 18 | Customer Portal | `/platform/customer-portal` | محاكاة ببيانات ثابتة | 🔴 | لا بوابة مستقلة ولا مصادقة عملاء ولا عزل بيانات |

---

## 3. الفجوات المعمارية الحرجة

### 3.1 انفصال الواجهة عن السيرفر

`src/services/domains/platform/PlatformAdminApiClient.ts` موجود لكنه **غير مستخدم في أي صفحة** (لا مراجع له خارج تعريفه). كل الصفحات تنادي `platformAdminService.*` المحلية. هذا يعني:

- تعديلات المشرف لا تصل للسيرفر المركزي.
- أرقام اللوحة تعتمد على قاعدة العميل، وليس على مصدر الحقيقة.
- التراخيص الصادرة محلياً لا تُتحقق مركزياً.

### 3.2 جسر Electron محدود يدوياً

`electron/centralApi.js` يحتوي قائمة مسارات مسموحة ثابتة (Allowlist). أي مسار جديد يجب إضافته يدوياً، وإلا فشل الطلب. القائمة تحتوي مسارات غير موجودة على السيرفر (`/admin/invoices`, `/admin/audit`, `/admin/settings`, `/api/v1/licensing/*`, `/api/v1/releases`).

### 3.3 الصلاحيات غير مطبقة على كل المسارات

معظم مسارات السيرفر تستخدم `authenticatePlatformUser` فقط دون `requirePlatformPermission`. مثال: `GET /api/v1/admin/tenants` بلا فحص `tenants:view`، وكل مسارات التراخيص والأجهزة بلا فحص صلاحية. كما أن الكتالوج يصف `module.action` ولا يصف **الصفحات** المطلوبة في الجدول.

### 3.4 التدقيق غير غير-قابل للتعديل

السيرفر يسجّل في `platform_audit_events` كصفوف عادية، بلا `prev_hash`/`record_hash`، وبلا Triggers تمنع `UPDATE`/`DELETE`، وبلا فصل صلاحيات. بينما الواجهة تعرض «Tamper-evident Hash Chain» من السجل المحلي.

### 3.5 واجهات وهمية بالكامل

- `PlatformIntegrationsPage.tsx`: مصفوفة Webhooks ثابتة + مفاتيح دفع ونصوص SMS وهمية.
- `PlatformNotificationsHubPage.tsx`: سجلات إشعارات ثابتة و«إرسال» يعدّل الحالة محلياً فقط.
- `PlatformCustomerPortalSimulatorPage.tsx`: تسجيل دخول وهمي يقبل أي كلمة مرور ويعرض بيانات ثابتة.
- `platformAdminService.triggerCentralBackup()`: يستخدم `window.ceramisys.db.backup('central')` أي نسخة محلية، وليس `central-server`.

### 3.6 غياب مسارات التشغيل الفعلية

لا توجد على السيرفر مسارات:
- تفعيل/تحقق/نبض الترخيص.
- تغذية تحديثات العملاء.
- إرسال بريد/SMS.
- Webhooks صادرة.
- نسخ احتياطي/استعادة.
- بوابة عميل.

---

## 4. القرار المعماري

### 4.1 حدود المسؤولية

| الطبقة | المسؤولية |
|---|---|
| `central-server` | مصدر الحقيقة لكل بيانات المنصة، التحقق من التراخيص، الفوترة، التكاملات، الإشعارات، النسخ، بوابة العملاء، التدقيق |
| `electron/centralApi.js` | جسر IPC آمن فقط (Allowlist + Origin + Headers) |
| `src/services/domains/platform/CentralPlatformClient.ts` (جديد) | عميل TypeScript موحّد لكل مسارات الإدارة، مع أنواع واستدعاءات `async` |
| صفحات `src/pages/platform/*` | عرض/تفاعل فقط، بلا وصول مباشر لقاعدة البيانات المحلية |
| `PlatformAdminService` المحلي | يبقى للتوافق، ثم يُقيّد تدريجياً بوظائف runtime/الترخيص المحلي، ويُزال من مسارات الإدارة |

### 4.2 نمط الوصول

```
React Page
  → CentralPlatformClient (typed, async)
    → window.ceramisys.central.request()
      → electron/centralApi.js (allowlist + auth header)
        → central-server /api/v1/admin/*
```

### 4.3 نمط الترحيل

1. بناء مسارات السيرفر أولاً مع اختبارات عقد.
2. إضافة `CentralPlatformClient` وتغليف كل مجموعة دوال محلية بنفس التوقيع لكن `async`.
3. إدخال علم تشغيل `platform.dataSource = 'central' | 'local'` أثناء الفترة الانتقالية (افتراضي `local` حتى اكتمال كل مركز).
4. عند اكتمال مركز: تحويل صفحاته إلى `central` واختبار E2E، ثم منع الكتابة المحلية له.
5. بعد اعتماد كل المراكز: حذف مسارات الإدارة المحلية وتثبيت `central` فقط.

### 4.4 معايير التصميم الإلزامية لكل مسار

- **المصادقة:** `Authorization: Bearer <session token>` + جلسة غير منتهية + تحقق من الجهاز الموثوق عند تفعيل السياسة.
- **الصلاحية:** `requirePlatformPermission('<module>.<action>')` على **كل** مسار، بما فيها `GET`.
- **نطاق البيانات:** `requireTenantScope` للمشرفين ذوي النطاق المحدود.
- **الاستجابة:** `{ data, meta? }` للنجاح، `{ error: { code, message, details? } }` للفشل، مع `requestId`.
- **الترقيم:** `page`, `limit` (بحد أقصى 200), `sort`, `q`, مع `meta.total`.
- **الكتابة الآمنة:** `Idempotency-Key` لكل POST مالي/تشغيلي، و`If-Match`/`version` للتحديثات conflict-safe.
- **التدقيق:** كل كتابة تُسجّل قبل/بعد + الفاعل + IP + User-Agent داخل نفس المعاملة.
- **الأسرار:** تُشفّر AES-256-GCM بمفتاح من `PLATFORM_SECRET_KEY`، ولا تُعاد للواجهة أبداً (تُعرض مقنّعة).
- **المال:** أعداد صحيحة بأصغر وحدة نقدية (قروش) + `currency`, `amountMinor`، وتُمنع `REAL` في الحسابات.
- **الوقت:** UTC ISO-8601 مع `timezone` للعرض فقط.

---

## 5. البنية المقترحة للسيرفر

إعادة هيكلة `central-server/server.js` (2027 سطراً) إلى وحدات قابلة للاختبار:

```
central-server/
  server.js                  # bootstrap فقط
  app.js                     # express app + middleware + mount routers
  config.js                  # env + secrets + feature flags
  db/
    index.js                 # sqlite open + PRAGMA
    migrations/              # 0001_init.js ... (idempotent, versioned)
    seed.js                  # كتالوج الصلاحيات + الخطط الافتراضية
  middleware/
    auth.js                  # authenticate, requirePermission, requireTenantScope
    errors.js                # envelope + requestId
    validate.js              # schema validation (zod)
    idempotency.js
    rateLimit.js
  modules/
    auth/ tenants/ subscriptions/ licenses/ billing/ plans/ product/
    releases/ config/ security/ audit/ operations/ integrations/
    notifications/ backups/ policies/ staff/ roles/ dashboard/ portal/
  workers/
    scheduler.js             # expiry, renewals, notifications, backups
    dispatcher.js            # outbox → webhooks/email/sms
  services/                  # business logic (لا SQL في الراوتر)
  repositories/              # SQL فقط
  openapi.yaml               # عقد موحّد يُولّد منه العميل
  test/                      # node:test + fixtures + fetch
```

**ملاحظة:** نقل المسارات الحالية إلى `modules/*` مع الحفاظ على نفس المسارات والتوافق الخلفي، ثم إضافة الجديد.

---

## 6. نموذج البيانات المركزي

### 6.1 موجود حالياً

`platform_tenants`, `platform_plans`, `platform_subscriptions`, `platform_licenses`, `platform_license_activations`, `platform_devices`, `platform_license_changes`, `platform_subscription_changes`, `platform_roles`, `platform_users`, `platform_sessions`, `platform_permissions`, `platform_role_permissions`, `platform_user_roles`, `platform_user_permissions`, `platform_scopes`, `platform_mfa`, `platform_login_attempts`, `platform_approval_policies`, `platform_audit_events`, `platform_rbac_meta`, `platform_signing_keys`.

### 6.2 جداول جديدة مطلوبة (مجمّعة حسب المركز)

| المجموعة | الجداول |
|---|---|
| العملاء | `platform_tenant_accounts`, `platform_tenant_users`, `platform_tenant_overrides`, `platform_tenant_branches`, `platform_tenant_config_pushes`, `platform_tenant_health_snapshots` |
| الاشتراكات | `platform_coupons`, `platform_coupon_redemptions`, `platform_subscription_events`, `platform_plan_versions`, `platform_price_history`, `platform_plan_upgrade_rules` |
| التراخيص | `platform_license_events`, `platform_license_nonces`, `platform_license_seats` |
| الفوترة | `platform_invoices`, `platform_invoice_items`, `platform_payments`, `platform_refunds`, `platform_credit_notes`, `platform_payment_gateway_events` |
| المنتج | `platform_modules`, `platform_feature_flags`, `platform_feature_overrides`, `platform_plan_modules` |
| الإصدارات | `platform_releases`, `platform_release_targets`, `platform_release_rollouts` |
| الإعدادات | `platform_settings`, `platform_tenant_configs`, `platform_tenant_config_versions`, `platform_config_rollouts`, `platform_config_acks`, `platform_branding`, `platform_branding_versions`, `platform_ui_profiles`, `platform_activity_configs`, `platform_activity_versions` |
| الأمان | `platform_security_incidents`, `platform_trusted_devices`, `platform_api_keys`, `platform_ip_rules`, `platform_staff_invites`, `platform_password_resets` |
| التدقيق | تعديل `platform_audit_events` بإضافة `sequence`, `prev_hash`, `record_hash`, `anchored_at` + Triggers |
| العمليات | `platform_ops_jobs`, `platform_ops_job_events`, `platform_maintenance_windows`, `platform_approvals`, `platform_sync_logs`, `platform_service_incidents` |
| الدعم | `platform_support_tickets`, `platform_support_messages`, `platform_canned_replies`, `platform_remote_sessions` |
| التكاملات | `platform_webhook_endpoints`, `platform_webhook_deliveries`, `platform_integration_providers`, `platform_provider_secrets` |
| الإشعارات | `platform_notification_templates`, `platform_notifications`, `platform_notification_deliveries`, `platform_notification_preferences` |
| النسخ | `platform_backups`, `platform_backup_verifications`, `platform_restore_jobs` |
| السياسات | `platform_policies`, `platform_policy_versions`, `platform_policy_publications`, `platform_policy_acks` |
| البوابة | `portal_sessions`, `portal_invites`, `portal_password_resets`, `portal_audit_events`, `portal_payment_intents` |
| اللوحة | `platform_metrics_daily`, `platform_metrics_hourly`, `platform_alert_acks` |

**قاعدة:** كل جدول يحتوي `created_at`, `updated_at`, و`created_by` عند الحاجة، وFOREIGN KEYS مع `ON DELETE` مناسب. لا حذف فعلي للكيانات المالية/التدقيقية — أرشفة أو `void`.

---

## 7. عقد API موحّد

### 7.1 مجموعات المسارات

| المركز | البادئة |
|---|---|
| Dashboard | `/api/v1/admin/dashboard/*` |
| Staff | `/api/v1/admin/staff/*` |
| Roles | `/api/v1/admin/roles/*`, `/api/v1/admin/permissions/*` |
| Tenants | `/api/v1/admin/tenants/*` |
| Subscriptions | `/api/v1/admin/subscriptions/*` |
| Licenses | `/api/v1/admin/licenses/*`, `/api/v1/licensing/*` |
| Billing | `/api/v1/admin/billing/*` |
| Product | `/api/v1/admin/product/*` |
| Releases | `/api/v1/admin/releases/*`, `/api/v1/releases` |
| Configuration | `/api/v1/admin/config/*`, `/api/v1/configuration/*` |
| Security | `/api/v1/admin/security/*` |
| Audit | `/api/v1/admin/audit/*` |
| Operations | `/api/v1/admin/operations/*` |
| Integrations | `/api/v1/admin/integrations/*` |
| Notifications | `/api/v1/admin/notifications/*` |
| Backups | `/api/v1/admin/backups/*` |
| Policies | `/api/v1/admin/policies/*` |
| Portal | `/api/v1/portal/*` |

### 7.2 أمثلة للأعراف

```http
GET /api/v1/admin/tenants?q=&status=&planId=&page=1&limit=25
→ 200 { data: [...], meta: { total, page, limit } }

POST /api/v1/admin/licenses/issue
Idempotency-Key: 3f1c...
→ 201 { data: { license, certificate } }

PATCH /api/v1/admin/security/incidents/:id
If-Match: "7"
→ 200 { data: { ... } }

GET /api/v1/admin/audit?action=&actorId=&from=&to=&page=1
→ 200 { data: [...], meta: { total, chainValid: true } }
```

### 7.3 توليد العميل

- `central-server/openapi.yaml` هو العقد.
- سكربت `npm run generate:client` يولّد أنواع `CentralApiTypes.ts` وعميلاً رفيعاً، ثم يُضاف غلاف يدوي `CentralPlatformClient` للوظائف المركّبة.
- اختبار عقد يفشل إذا اختلف المسار/الطريقة بين العميل والسيرفر.
- **مهم:** توليد `electron/centralApi.js` Allowlist من نفس العقد بدل الصيانة اليدوية، مع قائمة استثناءات أمنية صريحة.

---

## 8. المراحل

### المرحلة 0 — الأساس (أسبوعان)

**الهدف:** جعل السيرفر قابلاً للتوسع والاختبار، وتأمين كل المسارات الحالية.

- تفكيك `server.js` إلى `app.js` + modules + migrations.
- إضافة `zod` للتحقق، `requestId`, envelope موحد، معالج أخطاء مركزي.
- تطبيق `requirePlatformPermission` على كل مسار حالي + اختبارات سلبية.
- توسيع كتالوج الصلاحيات بمفاتيح الصفحات (`pageKey`) وربطها بالوحدات والإجراءات.
- إضافة جدول الصفحات/الإجراءات وواجهة `GET /admin/permissions/catalog` (بيانات فقط).
- توليد Allowlist من OpenAPI.
- زرع `CentralPlatformClient` + علم `platform.dataSource`.
- إضافة `platform_audit_events` سلسلة تجزئة + Triggers + خدمة تحقق.
- إعداد بيئة اختبار: قاعدة مؤقتة، مستخدم SUPER_ADMIN، توكن، بيانات fixture.
- CI: تشغيل اختبارات السيرفر مع باقي الاختبارات.

**معيار الخروج:** كل مسار حالي محمي ومختبر؛ `npm test` يمر؛ لا كسر للتوافق؛ Allowlist مولّد.

---

### المرحلة 1 — التجاري الأساسي: Dashboard + Tenants + Subscriptions (3 أسابيع)

#### 1.1 Dashboard

**الحالة:** محلي فقط. **الفجوة:** لا مؤشرات سيرفر ولا مرشحات زمنية فعلية.

**الجداول:** `platform_metrics_daily`, `platform_metrics_hourly`, `platform_alert_acks`.

**المسارات:**
- `GET /admin/dashboard/overview?period=7d|30d|90d|12m|custom&from=&to=&planId=`
- `GET /admin/dashboard/timeseries?metric=revenue|tenants|licenses|subscriptions&granularity=day|week|month`
- `GET /admin/dashboard/alerts`
- `GET /admin/dashboard/export?format=csv`
- `POST /admin/dashboard/alerts/:id/ack`

**الخوارزمية:** استعلامات SQL مباشرة للفترة الحالية والسابقة + لقطات يومية للرسوم. لا تُحمّل كل السجلات إلى Node.

**الواجهة:** مرشح فترة (اليوم/7/30/90/سنة/مخصص) + مرشح خطة + زر تحديث + «آخر تحديث» + بطاقات مقارنة بالفترة السابقة + Drill-down موجود مسبقاً.

**الاختبارات:** صحة الحدود الزمنية، الفترات الفارغة، مقارنة الفترة السابقة، تطابق CSV، الأداء < 500ms على 100k صف.

**القبول:** الصفحة لا تقرأ قاعدة محلية؛ الأرقام تطابق Fixtures SQL؛ كل مرشح يعمل.

#### 1.2 Tenants

**الحالة:** محلي غني؛ السيرفر minimal. **الفجوة:** دورة حياة كاملة، حسابات، فروع، مستخدمون، تجاوزات، بث إعدادات.

**المسارات:**
- CRUD: `GET/POST /admin/tenants`, `GET/PUT/DELETE /admin/tenants/:id`
- الحالة: `POST /:id/status`, `/archive`, `/restore`
- الملف: `GET /:id/profile` (حساب + مستخدمون + أجهزة + اشتراك + فواتير + تراخيص + تدقيق)
- الحساب: `GET/POST /:id/account`, `POST /:id/account/reset-password`, `/account/status`
- المستخدمون: `GET/POST /:id/users`, `PUT/DELETE /:id/users/:userId`, `/resend-invite`
- التجاوزات: `GET/POST /:id/overrides`, `PATCH/DELETE /:id/overrides/:overrideId`
- الفروع: `GET/POST /:id/branches`
- العمليات الجماعية: `POST /admin/tenants/bulk/status`, `/bulk/plan`, `/bulk/activation`, `/import`, `GET /export`
- التحكم عن بعد: `GET /:id/remote`, `POST /:id/config-push`, `POST /:id/force-sync`

**الجداول:** المذكورة في 6.2 + إضافة أعمدة `archived_at`, `health_score`, `last_seen_at`.

**الواجهة:** ربط الصفحة بالعميل المركزي، إبقاء تبويبات الملف، إضافة شريط تحديد جماعي و«آخر مزامنة» وحالة الصحة.

**الاختبارات:** منع تكرار الكود، انتقالات الحالة المسموحة فقط، عزل النطاق، استيراد CSV جزئي/فاشل، إرسال التفعيل يُسجّل في Outbox.

**القبول:** إنشاء/تعديل/تعليق/تفعيل/أرشفة يعمل من السيرفر ويظهر في قاعدة السيرفر؛ قراءة القائمة تتطلب `tenants.view`.

#### 1.3 Subscriptions

**الحالة:** محلي. **الفجوة:** إدارة مركزية + دورة حياة + تجديد.

**المسارات:**
- `GET/POST /admin/subscriptions`, `GET/PUT /:id`
- `POST /:id/renew`, `/cancel`, `/suspend`, `/reactivate`, `/change-plan`, `/preview-change`
- `POST /trial`
- `GET/POST /admin/coupons`, `POST /admin/coupons/validate`, `PATCH /:id`
- `GET /:id/events`

**الجداول:** `platform_subscriptions` + `platform_coupons`, `platform_coupon_redemptions`, `platform_subscription_events`, `platform_plan_versions`, `platform_price_history`.

**الوظائف المجدولة:** يومياً: انتهاء الاشتراكات، تذكيرات 30/14/7/1، التجديد التلقائي → إنشاء فاتورة → `PAST_DUE` عند الفشل، تعليق بعد فترة سماح.

**الواجهة:** المؤشرات الفعلية، Timeline للاشتراك، معاينة أثر تغيير الخطة، تصدير.

**الاختبارات:** حساب التواريخ (شهر/ربع/سنة)، التجديد التلقائي مرة واحدة فقط (Idempotency)، عدم تجاوز حدود الخطة، Coupon once-per-tenant، Job في منطقة زمنية UTC.

**القبول:** لا اشتراك ينتهي دون تحديث حالة؛ كل تغيير له حدث وAudit.

---

### المرحلة 2 — المال والمنتج: Billing + Licenses + Product Control (3 أسابيع)

#### 2.1 Billing

**الحالة:** محلي فقط. **الفجوة:** لا جداول/مسارات مركزية، ولا بوابات دفع.

**الجداول:** `platform_invoices`, `platform_invoice_items`, `platform_payments`, `platform_refunds`, `platform_credit_notes`, `platform_payment_gateway_events`.

**المسارات:**
- `GET/POST /admin/billing/invoices`, `GET/PUT /:id`, `POST /:id/void`, `/send`, `/mark-paid`
- `GET/POST /admin/billing/payments`, `POST /:id/void`
- `POST /admin/billing/refunds`, `GET /admin/billing/refunds`
- `GET /admin/billing/statements/:tenantId`
- `POST /admin/billing/gateway/:provider/webhook` (عام، موقّع)
- `POST /admin/billing/reconcile`

**القواعد:** ترقيم فواتير ذري (`nextSequence` داخل معاملة)، تجميد الفاتورة بعد الإرسال، `VOID` يتطلب سبباً وصلاحية، المدفوعات لا تتجاوز الرصيد إلا كرصيد دائن، العملات في `minor units`.

**الاختبارات:** الضرائب/الخصومات/الدفع الجزئي/الدفع الزائد/الإلغاء/الاسترداد، تسلسل الأرقام تحت التزامن، Webhook idempotent وتوقيع صحيح.

**القبول:** فاتورة → دفعة → رصيد صحيح؛ لا تعديل مبلغ بعد السداد إلا باسترداد/إشعار دائن.

#### 2.2 Licenses

**الحالة:** مسارات إدارة مركزية جزئية؛ **مسارات التشغيل غائبة تماماً**. **الفجوة:** تفعيل/تحقق/نبض، إلغاء، امتثال، مقاعد.

**المسارات الإدارية:** `GET/POST /admin/licenses`, `/issue`, `/:id/renew|cancel|suspend|revoke|transfer|coupling`, `/:id/activations`, `GET /admin/licenses/compliance?format=csv`, `POST /admin/licenses/:id/seats/reassign`.

**المسارات التشغيلية (حرجة):**
- `POST /api/v1/licensing/activate`
- `POST /api/v1/licensing/validate`
- `POST /api/v1/licensing/heartbeat`
- `POST /api/v1/licensing/deactivate`
- `GET /api/v1/configuration/public-key`
- `GET /api/v1/releases?channel=&version=&tenantId=` (في مرحلة الإصدارات)

**التصميم:** شهادة موقّعة Ed25519 تحتوي `licenseId`, `tenantId`, `hardwareId`, `expiresAt`, `features`, `nonce`; منع إعادة الاستخدام عبر `platform_license_nonces`; فحص توقيع/انتهاء/ساعة العميل؛ حد الأجهزة داخل معاملة؛ تسجيل كل محاولة.

**الاختبارات:** توقيع صحيح/مزيف، انتهاء، فرق ساعة، تجاوز حد الأجهزة، إعادة استخدام Nonce، تعليق فوري، نقل جهاز، تعافي بعد انقطاع.

**القبول:** تطبيق ERP يستطيع التفعيل والتحقق من السيرفر فقط؛ لا مسار محلي للإصدار في الإنتاج.

#### 2.3 Product Control

**الحالة:** محلي. **الفجوة:** كتالوج وحدات/مزايا/تجاوزات مركزي.

**الجداول:** `platform_modules`, `platform_feature_flags`, `platform_feature_overrides`, `platform_plan_modules`.

**المسارات:**
- `GET/POST /admin/product/modules`, `PATCH /:id`
- `GET/POST /admin/product/features`, `PATCH /:id`
- `GET/POST /admin/product/features/:id/overrides`, `DELETE /overrides/:overrideId`
- `POST /admin/product/plan-modules`
- `GET /admin/product/resolve?tenantId=` (التقييم الفعلي)

**قاعدة الأولوية:** تجاوز العميل > تجاوز الخطة > الوحدة الافتراضية > الافتراضي العام. Rollout % عبر Hash ثابت لـ `tenantId+featureCode`.

**الواجهة:** مصفوفة وحدات/مزايا، معاينة الأثر قبل التفعيل، سجل تغييرات.

**الاختبارات:** سلسلة الأولوية، تفعيل/تعطيل فوري، Rollout ثابت، لا تعطيل وحدة عليها اشتراكات نشطة دون تحذير/موافقة.

---

### المرحلة 3 — الثقة: Security + Audit + Operations (أسبوعان ونصف)

#### 3.1 Security Center

**الحالة:** السيرفر يملك جلسات/MFA/محاولات دخول/مفاتيح توقيع؛ الواجهة محلية. **الفجوة:** حوادث، أجهزة موثوقة، مفاتيح API، قواعد IP، تنبيهات.

**الجداول:** `platform_security_incidents`, `platform_trusted_devices`, `platform_api_keys`, `platform_ip_rules`.

**المسارات:**
- `GET /admin/security/overview`
- `GET /admin/security/sessions`, `DELETE /sessions/:id`, `POST /sessions/revoke-others`
- `GET /admin/security/trusted-devices`, `DELETE /:id`
- `GET/POST /admin/security/incidents`, `PATCH /:id/respond`
- `GET/POST /admin/security/api-keys`, `POST /:id/rotate`, `DELETE /:id`
- `GET/PUT /admin/security/mfa-policy`
- `GET/PUT /admin/security/ip-rules`

**القواعد:** مفاتيح API تُخزّن Hash فقط وتُعرض مرة واحدة؛ تدوير الجلسات فور تغيير الصلاحيات؛ اكتشاف Brute Force (5 محاولات/15 دقيقة) → قفل + حادثة؛ تنبيه عند دخول من جهاز جديد إذا فُعّلت السياسة.

**الاختبارات:** قفل الحساب، إبطال الجلسات، MFA إلزامي حسب الدور، صلاحية المفتاح ونطاقه، منع IP.

**القبول:** كل حدث أمني يظهر في السجل ويُنبّه فوراً؛ لا مفتاح API يعود كنص بعد الإنشاء.

#### 3.2 Audit Center

**الحالة:** محلي بسلسلة Hash؛ السيرفر عادي. **الفجوة:** عدم قابلية التعديل، تحقق، تصدير، احتفاظ.

**التعديلات:** إضافة `sequence INTEGER`, `prev_hash`, `record_hash`; Trigger:
```sql
CREATE TRIGGER audit_no_update BEFORE UPDATE ON platform_audit_events
BEGIN SELECT RAISE(ABORT, 'audit_append_only'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON platform_audit_events
BEGIN SELECT RAISE(ABORT, 'audit_append_only'); END;
```
مع اتصال قاعدة منفصل للكتابة فقط (`audit_writer`) وعدم منح `UPDATE/DELETE` لتطبيق الإدارة.

**المسارات:**
- `GET /admin/audit` (فلاتر: action, actor, tenant, entity, from, to, page)
- `GET /admin/audit/:id`
- `GET /admin/audit/verify` → `{ valid, checked, brokenAt }`
- `POST /admin/audit/export` (CSV/JSON موقّع)
- `POST /admin/audit/anchor` (تثبيت يومي Hash خارجي — اختياري)

**الواجهة:** عارض السلسلة، زر تحقق، تصدير، إزالة أي أزرار حذف/تعديل.

**الاختبارات:** `UPDATE`/`DELETE` يفشلان، كسر سلسلة يُكتشف، إدراج متزامن لا يفسد السلسلة، فلاتر دقيقة.

**القبول:** لا يمكن لأي مستخدم عادي (ولا SUPER_ADMIN عبر API) تعديل/حذف سجل؛ التحقق يعمل على مليون صف < 3 ثوان.

#### 3.3 Operations

**الحالة:** محلي. **الفجوة:** مهام/صيانة/موافقات/مزامنة/طوارئ مركزية.

**الجداول:** `platform_ops_jobs`, `platform_ops_job_events`, `platform_maintenance_windows`, `platform_approvals`, `platform_sync_logs`, `platform_service_incidents`.

**المسارات:**
- `GET/POST /admin/operations/jobs`, `POST /:id/cancel|retry`
- `GET/POST /admin/operations/maintenance`, `POST /:id/cancel`
- `GET /admin/operations/approvals`, `POST /:id/approve|reject`
- `GET /admin/operations/sync`, `POST /admin/operations/sync/:id/retry`
- `POST /admin/operations/emergency/:action` (suspend tenant, disable release, revoke keys, revoke sessions)

**العامل:** `workers/scheduler.js` ينفّذ المهام بقفل `advisory` (جدول `job_locks`) و`attempts`, `next_run_at`, `last_error`، وإعادة محاولة أسّية.

**القبول:** كل إجراء طارئ يتطلب سبباً + موافقة ثانية إذا تجاوز الحد، ويُسجّل Audit فوراً؛ المهمة لا تُنفّذ مرتين.

---

### المرحلة 4 — التوصيل: Integrations + Notifications + Backups + Policies (3 أسابيع)

#### 4.1 Integrations

**الحالة:** واجهة وهمية. **الفجوة:** كل شيء.

**الجداول:** `platform_webhook_endpoints`, `platform_webhook_deliveries`, `platform_integration_providers`, `platform_provider_secrets`.

**المسارات:**
- `GET/POST /admin/integrations/webhooks`, `PATCH/DELETE /:id`, `POST /:id/test`, `GET /:id/deliveries`, `POST /deliveries/:id/replay`
- `GET/PUT /admin/integrations/providers/payments/:provider`
- `GET/PUT /admin/integrations/providers/sms/:provider`
- `GET/PUT /admin/integrations/providers/email/:provider`

**الأمان:** توقيع `X-CeramiSys-Signature: t=...,v1=HMAC_SHA256(secret, timestamp.body)`؛ حد زمني 5 دقائق؛ منع SSRF (رفض العناوين الخاصة/loopback وDNS rebinding)؛ إخفاء الأسرار؛ تخزين مشفّر.

**العامل:** Outbox → Dispatcher مع `max 8 retries` وbackoff وDead Letter، وتحديث الحالة من رد المزود.

**الاختبارات:** توقيع، إعادة محاولة، SSRF، إخفاء الأسرار، تكرار الحدث (Idempotency)، فشل المزود.

#### 4.2 Notifications

**الحالة:** واجهة وهمية. **الفجوة:** إرسال فعلي + تتبع.

**الجداول:** القوالب، الإشعارات، محاولات التسليم، التفضيلات.

**المسارات:**
- `GET/POST /admin/notifications/templates`, `PATCH /:id`
- `POST /admin/notifications/send`, `/broadcast`
- `GET /admin/notifications`, `GET /:id/deliveries`, `POST /:id/retry`
- `GET/PUT /admin/notifications/preferences/:tenantId`
- `POST /api/v1/webhooks/providers/:provider/status` (حالة التسليم)

**المزودون:** Email عبر SMTP أو API (SendGrid/Mailgun)، SMS عبر مزود محلي (Vodafone/WE/Viomis) قابل للتبديل، In-App داخلي. كل مزود Adapter بواجهة واحدة.

**القواعد:** قالب + متغيرات مُتحققة، قائمة حظر/إلغاء اشتراك، حدود معدل يومية، عدم إرسال بيانات سرية في الرسالة، تتبع `QUEUED→SENT→DELIVERED→FAILED→BOUNCED`.

**الاختبارات:** Render، تفضيلات، Retry، Webhook حالة، حدود يومية، منع التكرار.

#### 4.3 Backups

**الحالة:** نسخ محلي عبر Electron. **الفجوة:** نسخ/استعادة مركزية.

**المسارات:**
- `GET /admin/backups`
- `POST /admin/backups` (نوع: FULL/INCREMENTAL، تشفير إلزامي)
- `GET /admin/backups/:id`
- `POST /admin/backups/:id/verify`
- `POST /admin/backups/:id/restore` (يتطلب تأكيداً + صلاحية + وضع صيانة)
- `DELETE /admin/backups/:id` (سياسة احتفاظ فقط)
- `GET /admin/backups/:id/download` (رابط موقّع قصير)

**التنفيذ:** SQLite Online Backup API → AES-256-GCM → Manifest (SHA-256, size, schemaVersion) → تخزين محلي + هدف بعيد S3-compatible/SSH → التحقق بإعادة فك التشفير ومقارنة الهاش. الاستعادة إلى قاعدة جديدة ثم Switch ذري، مع نسخة أمان قبلها.

**الاختبارات:** round-trip على قاعدة Fixture، كشف تعديل بايت، مفتاح خاطئ، استعادة معطلة، احتفاظ GFS.

**القبول:** يمكن استعادة قاعدة السيرفر بالكامل من نسخة مشفرة تم التحقق منها، وكل عملية Audit.

#### 4.4 Policies

**الحالة:** نص واحد محلي. **الفجوة:** إصدارات ونشر وإقرارات.

**الجداول:** `platform_policies`, `platform_policy_versions`, `platform_policy_publications`, `platform_policy_acks`.

**المسارات:**
- `GET/POST /admin/policies`
- `GET/POST /admin/policies/:id/versions`
- `POST /admin/policies/:id/versions/:version/submit|approve|publish`
- `GET /admin/policies/:id/acks`
- `GET /api/v1/policies/:slug` (عام، آخر إصدار منشور)
- `POST /api/v1/policies/:slug/ack`

**القواعد:** الإصدار المنشور غير قابل للتعديل؛ التعديل ينشئ إصداراً جديداً؛ النشر يتطلب صلاحية `policies.approve`؛ تاريخ سريان؛ إقرار العميل يُخزّن مع الإصدار.

**الاختبارات:** تجميد الإصدار، صلاحية النشر، سريان التاريخ، تتبع الإقرار.

---

### المرحلة 5 — الهوية والبوابة: Staff + Roles & Permissions + Customer Portal (أسبوعان ونصف)

#### 5.1 Staff Management

**الحالة:** محلي كامل؛ السيرفر عرض/إنشاء. **الفجوة:** دورة حياة.

**المسارات:**
- `GET/POST /admin/staff`, `GET/PUT/DELETE /:id`, `POST /:id/restore`
- `POST /admin/staff/invites`, `GET /invites`, `POST /invites/:id/revoke`, `POST /invites/accept` (عام)
- `POST /:id/reset-password`, `/force-password-change`, `/reset-mfa`, `/unlock`
- `GET /:id/sessions`, `DELETE /sessions/:sessionId`
- `GET /:id/trusted-devices`, `DELETE /:id/trusted-devices/:deviceId`
- `GET/PUT /:id/data-scope`
- `POST /:id/transfer-permissions`
- `GET /:id/logins`

**آلة الحالة:** `INVITED → ACTIVE → SUSPENDED → DELETED` مع منع حذف آخر مالك، ومنع تعليق النفس، وإبطال الجلسات عند التعليق/الحذف.

**القبول:** كل انتقال مسجّل ومحمي؛ دعوة صالحة مرة واحدة وتنتهي؛ MFA/الجلسات تعمل مركزياً.

#### 5.2 Roles & Permissions

**الحالة:** الكتالوج موجود (module.action) والمصفوفة داخل الخدمة بلا واجهة. **الفجوة:** محرر لكل صفحة وإجراء + فرض مركزي.

**التصميم:**
- توسيع `PLATFORM_PERMISSION_CATALOG` ليشمل `pageKey`, `route`, `label`, `actions` لكل صفحة.
- جدول `platform_pages` (اختياري) + ربط `permission_code → page_key`.
- المصفوفة: صفوف = صفحات، أعمدة = `view/create/update/delete/approve/export` (حسب الصفحة).
- صلاحية فعالة = اتحاد صلاحيات الأدوار − المنع الصريح؛ مع `ALL` للمالك.
- منع تعديل دور نظامي محمي إلا بنسخه (`clone`).

**المسارات:**
- `GET /admin/permissions/catalog`
- `GET /admin/roles`, `POST /admin/roles`, `PATCH /:code`
- `GET/PUT /admin/roles/:code/permissions`
- `POST /admin/roles/:code/clone`, `/reset`
- `GET /admin/staff/:id/effective-permissions`
- `GET /admin/permissions/audit`

**الواجهة:** صفحة جديدة `/platform/roles` — جدول صفحات × إجراءات، بحث، تحديد الكل، «معاينة الفروق»، «إعادة للافتراضي»، «نسخ الدور»، وعدّاد مستخدمين لكل دور.

**الاختبارات:** كل مسار إداري له اختبار 403 لمستخدم بلا صلاحية؛ حفظ المصفوفة يبطل كاش الصلاحيات فوراً؛ لا يمكن منح رمز غير موجود؛ الأدوار النظامية محمية.

**القبول:** يمكن لمالك المنصة منح مستخدم «عرض الفواتير فقط» أو «تدقيق بلا تعديل» بدقة، وتُطبق فوراً على السيرفر والواجهة.

#### 5.3 Customer Portal

**الحالة:** محاكاة. **الفجوة:** تطبيق مستقل ومصادقة وعزل.

**القرار:** تطبيق SPA مستقل يخدمه السيرفر على `/portal` (أو أصل منفصل `portal.ceramisys.com`)، وليس داخل تطبيق ERP.

**الجداول:** `portal_sessions`, `portal_invites`, `portal_password_resets`, `portal_audit_events`, `portal_payment_intents` (+ إعادة استخدام `platform_tenant_users`).

**المسارات:**
- `POST /api/v1/portal/auth/login|logout|refresh|forgot-password|reset-password|mfa/verify`
- `GET /api/v1/portal/me`
- `GET /api/v1/portal/subscription`
- `GET /api/v1/portal/invoices`, `GET /invoices/:id`, `GET /invoices/:id/pdf`
- `POST /api/v1/portal/invoices/:id/pay` → Payment Intent
- `GET /api/v1/portal/licenses`, `GET /licenses/:id/activations`
- `GET /api/v1/portal/devices`, `POST /devices/:id/release`
- `GET /api/v1/portal/users`, `POST /users/invite`, `PATCH /users/:id`
- `GET /api/v1/portal/support/tickets`, `POST /support/tickets`
- `GET /api/v1/portal/downloads`
- `GET/PUT /api/v1/portal/profile`

**العزل:** كل استعلام يُقيّد بـ `tenant_id` من الجلسة، وليس من الطلب؛ اختبارات Cross-Tenant إلزامية (IDOR) لكل مسار؛ جلسات قصيرة + تدوير Refresh؛ Rate limiting على الدخول؛ MFA اختياري/إلزامي حسب الخطة.

**الواجهة:** صفحة `/platform/customer-portal` تتحول إلى «معاينة/إدارة» فقط، مع رابط فتح البوابة الحقيقية. بناء واجهة البوابة في `central-admin/` أو `apps/customer-portal` (Vite + React) — يجب حسم المسار في بداية المرحلة.

**القبول:** عميل حقيقي يسجّل الدخول بحسابه، يرى اشتراكه وفواتيره وتراخيصه فقط، يدفع فاتورة (Sandbox) ويفتح تذكرة؛ لا يستطيع الوصول لبيانات عميل آخر بأي معرّف.

---

### المرحلة 6 — التثبيت والتحويل (أسبوعان)

- تغطية اختبارات ≥ 85% لمسارات السيرفر الجديدة + اختبارات عقد + E2E.
- ترحيل بيانات الإدارة المحلية إلى السيرفر (سكربت `scripts/migrate-local-platform-data.mjs`) مع تقرير فروق.
- تشغيل مزدوج محدود (Dark Launch) لمدة أسبوعين: السيرفر مصدر الحقيقة، والواجهة تقارن النتائج محلياً دون كتابة.
- تحويل علم `platform.dataSource` إلى `central` لكل المراكز.
- إزالة الاستدعاءات المحلية من صفحات الإدارة + حذف الجداول المحلية غير المستخدمة (بعد نسخة احتياطية).
- توثيق تشغيلي: `docs/PLATFORM_CENTERS_RUNBOOK.md` + تحديث OpenAPI + دليل الاستعادة.
- مراجعة أمنية نهائية (Secrets, SSRF, IDOR, Rate limits, Audit).

**معيار الخروج:** كل المراكز تعمل من السيرفر فقط، والنسخ الاحتياطي/الاستعادة مجرّبان، والتدقيق سليم.

---

## 9. تفصيل معايير القبول لكل مركز (ملخص تنفيذي)

| المركز | معيار قبول واحد حاسم |
|---|---|
| Dashboard | كل رقم في الصفحة مصدره SQL على السيرفر، وكل مرشح زمني يغيّر النتائج فعلياً |
| Staff | دورة حياة كاملة (دعوة→تفعيل→تعليق→حذف) مع منع حذف آخر مالك |
| Roles & Permissions | محرر صفحات×إجراءات، وحفظه يغيّر وصول المستخدم فوراً |
| Tenants | إنشاء/تعليق/تفعيل/أرشفة/حساب/مستخدمون/تجاوزات من السيرفر |
| Subscriptions | لا اشتراك يبقى نشطاً بعد انتهائه؛ التجديد التلقائي Idempotent |
| Licenses | التطبيق لا يعمل إلا بعد تحقق مركزي موقّع؛ الإلغاء يسري فوراً |
| Billing | فاتورة→دفعة→رصيد/استرداد صحيح، وأرقام فواتير بلا تكرار |
| Product Control | الأولوية (عميل>خطة>افتراضي) مطبقة ومختبرة |
| Release Management | تحديث موقّع، Rollout تدريجي، Rollback آمن |
| Configuration | إعدادات مُصدّرة موقّعة، بث وإقرار، Rollback |
| Security Center | كل حادثة أمنية مرئية، وكل جلسة/مفتاح قابل للإبطال |
| Audit Center | `UPDATE`/`DELETE` على السجل يفشلان، والتحقق يكشف أي كسر |
| Operations | المهمة تُنفّذ مرة واحدة، والموافقة الثانية مطلوبة للإجراءات الحساسة |
| Integrations | Webhook موقّع مع Retries وسجل تسليم حقيقي |
| Notifications | إرسال فعلي وتتبع `DELIVERED/FAILED` من المزود |
| Backups | استعادة كاملة من نسخة مشفرة تم التحقق منها |
| Policies | إصدار منشور غير قابل للتعديل + إقرارات العملاء |
| Customer Portal | عزل تام بين العملاء + دفع/فواتير/تراخيص حقيقية |

---

## 10. الأمان والامتثال (إلزامي عبر كل المراحل)

1. **الأسرار:** كل مفتاح/كلمة مرور مزود تُشفّر بمفتاح رئيسي من متغير بيئة، ولا يُسجّل في Logs ولا يُعاد في API.
2. **الصلاحيات:** لا مسار بلا `requirePlatformPermission`؛ اختبار آلي يفحص كل مسار مسجّل مقابل الصلاحية.
3. **عزل العملاء:** `tenant_id` من الجلسة/التوكن، واختبارات IDOR إلزامية.
4. **التدقيق:** كل كتابة إدارية تُسجّل داخل نفس المعاملة، وسلسلة Hash غير قابلة للتعديل.
5. **المصادقة:** جلسات مع انتهاء خمول 30 دقيقة، تدوير للتوكن، قفل بعد المحاولات، MFA للتداول الحساس.
6. **الشبكة:** HTTPS فقط، CORS مقيد، Helmet، Rate limiting، حماية CSRF للبوابة (SameSite + CSRF token).
7. **الملفات:** رفع النسخ/الشعارات بفحص نوع/حجم، وتخزين خارج جذر الويب.
8. **SSRF:** قائمة بروتوكولات محددة، رفض IPs الخاصة، إعادة تحقق DNS عند كل محاولة.
9. **السجلات:** إخفاء PII/الأسرار، مدة احتفاظ محددة، تصدير موقّع.
10. **الامتثال:** سياسات الخصوصية/الاحتفاظ قابلة للنشر والإقرار، وسجل تدقيق قابل للتصدير.

---

## 11. خطة الاختبار

### 11.1 مستويات الاختبار

- **وحدة:** خدمات الأعمال (حسابات، حالات، أولويات المزايا، التجزئة).
- **تكامل API:** `node:test` + قاعدة مؤقتة + `fetch` على منفذ عشوائي؛ تغطية كل مسار (نجاح/فشل/صلاحية/تحقق).
- **عقد:** مقارنة OpenAPI بالعميل والـ Allowlist.
- **أمني:** 403 لكل مسار، IDOR، SSRF، حقن SQL، XSS في القوالب، Rate limit، إعادة استخدام Nonce، تعديل Audit.
- **E2E (Playwright):** مسار المشرف لكل مركز، ومسار عميل البوابة.
- **أداء:** Dashboard < 500ms، قائمة 10k عميل < 800ms، تحقق Audit مليون صف < 3s.
- **استعادة:** سيناريو كارثة كامل من نسخة احتياطية.

### 11.2 بيانات الاختبار

- `central-server/test/fixtures/` بذور: 3 خطط، 20 عميلاً بحالات مختلفة، 40 اشتراكاً، 60 ترخيصاً، 100 فاتورة، 200 حدث تدقيق.
- سكربت `seed:test` يُعيد الحالة قبل كل مجموعة.

### 11.3 بوابات الجودة

- `npm run lint`, `npm run typecheck`, اختبارات السيرفر، اختبارات المنصة، E2E — كلها إلزامية قبل الدمج.
- لا يُقبل أي مركز دون: اختبار صلاحية سلبي + اختبار Audit + توثيق OpenAPI.

---

## 12. الترحيل والتحويل

1. **ازدواجية القراءة:** الواجهة تقرأ من السيرفر وتعرض فرقاً مقابل المحلي في وضع التطوير.
2. **ترحيل البيانات:** نسخ العملاء/الخطط/التراخيص/الفواتير/الإعدادات المحلية إلى السيرفر مع `source='local-migration'`، ومعالجة التعارضات بالكود/البريد.
3. **تجميد الكتابة المحلية:** بعد مطابقة 100% لكل مركز، تُمنع الكتابة المحلية وتصبح القراءة فقط.
4. **التراجع:** علم `platform.dataSource='local'` يبقى متاحاً إصداراً واحداً، مع نسخة احتياطية كاملة قبل التحويل.
5. **التوافق:** الحفاظ على مسارات API الحالية وأسماء الحقول أثناء الانتقال، وإضافة الجديد بجانبها.

---

## 13. المخاطر والاعتماديات

| الخطر | الأثر | التخفيف |
|---|---|---|
| حجم إعادة الهيكلة (395KB خدمة محلية) | تأخر التسليم | ترحيل مجموعة-مجموعة، وعدم لمس الخدمة المحلية قبل اكتمال التوازي |
| اعتماد مزودي الدفع/SMS | تعطل التكاملات | تجريد Adapter + Sandbox + مزود بديل + طابور إعادة محاولة |
| اختلاف بيانات الإدارة المحلية | فقدان/تعارض | سكربت ترحيل + تقرير فروق + إبقاء قراءة محلية مؤقتة |
| تعقيد عزل العملاء | ثغرة IDOR | `tenant_id` من الجلسة + اختبارات آلية لكل مسار |
| الأداء مع نمو البيانات | بطء اللوحة | لقطات مجمّعة + فهارس + ترقيم إجباري |
| الأسرار في العميل | تسريب | نقل كل المفاتيح للسيرفر، وتنقية أي قيم حقيقية من الصفحات الحالية |
| تعارض العمل غير الملتزم في المستودع | فقدان تعديلات | إنشاء Worktree/فرع قبل البدء، ومراجعة `git diff` الحالي |

**اعتماديات خارجية:** مفاتيح Sandbox للدفع، حساب مزود SMS/Email، هدف تخزين بعيد للنسخ، نطاق للبوابة، شهادة TLS.

---

## 14. التقديرات

| المرحلة | المدة (مطوران) | المدة (4 مطورين) |
|---|---|---|
| 0 — الأساس | 2 أسبوع | 1 أسبوع |
| 1 — Dashboard/Tenants/Subscriptions | 3 أسابيع | 1.5 أسبوع |
| 2 — Billing/Licenses/Product | 3 أسابيع | 1.5 أسبوع |
| 3 — Security/Audit/Operations | 2.5 أسبوع | 1.5 أسبوع |
| 4 — Integrations/Notifications/Backups/Policies | 3 أسابيع | 1.5 أسبوع |
| 5 — Staff/Roles/Portal | 2.5 أسبوع | 1.5 أسبوع |
| 6 — التثبيت والتحويل | 2 أسبوع | 1 أسبوع |
| **الإجمالي** | **18 أسبوعاً** | **9.5 أسابيع** |

**ملاحظة:** التقدير لا يشمل وقت اعتماد مزودي الدفع/الرسائل ولا بناء تصميم بصري جديد؛ يفترض إعادة استخدام مكوّنات `PlatformUI`.

---

## 15. الخطوة التالية المقترحة

**ابدأ بالمرحلة 0 فقط** (أسبوعان) لأنها تخفض مخاطر كل ما بعدها:

1. إنشاء فرع/Worktree مستقل لحماية العمل الحالي غير الملتزم.
2. تفكيك السيرفر وتطبيق الصلاحيات على كل المسارات الحالية + اختباراتها.
3. إضافة سلسلة تجزئة التدقيق + Triggers.
4. توليد عميل API + Allowlist تلقائياً.
5. تسليم «المرحلة 0» مع تقرير: المسارات المحمية، الاختبارات المضافة، وجاهزية المرحلة 1.

بعد اعتماد المرحلة 0، تُنفّذ المرحلة 1 (Dashboard + Tenants + Subscriptions) كأول شريحة وظيفية كاملة من السيرفر إلى الواجهة.

---

## ملحق أ — ملفات مرجعية

- الواجهة: `src/pages/platform/` (30 صفحة + `components/`).
- الخدمة المحلية: `src/services/domains/platform/PlatformAdminService.ts` و`platformTypes.ts`.
- عميل API غير المستخدم: `src/services/domains/platform/PlatformAdminApiClient.ts`.
- الكتالوج: `src/services/domains/platform/platformPermissionCatalog.ts` (يُولّد إلى `central-server/platformPermissionCatalog.js`).
- جسر Electron: `electron/centralApi.js`.
- السيرفر: `central-server/server.js` + `identity.js` + `ed25519.js` + `totp.js`.
- الاختبارات الحالية: `test/platform-admin.test.ts`, `test/central-api.test.cjs`, `test/central-license.test.ts`, `test/central-config.test.ts`.
- وثائق جزئية: `docs/openapi-platform-admin.yaml`, `PLAN_TENANTS_ENHANCEMENT.md`, `docs/tenants-plan.md`.

## ملحق ب — حالات الصفحات الوهمية التي يجب حذف بياناتها الثابتة

| الملف | ما يجب حذفه/استبداله |
|---|---|
| `PlatformIntegrationsPage.tsx` | `useState<WebhookEndpoint[]>([...])` والمفاتيح الوهمية `FAWRY_MERCH_*`, `paymobApiKey`, `smsConfig.apiKey` |
| `PlatformNotificationsHubPage.tsx` | `useState<NotificationLog[]>([...])` وسجلات `DELIVERED` الثابتة |
| `PlatformCustomerPortalSimulatorPage.tsx` | `tenantData` الثابت و`handleLogin` الذي يقبل أي كلمة مرور |
| `PlatformBackupsPage.tsx` | `triggerCentralBackup()` المحلي → مسار النسخ المركزي |
| `PlatformAuditPage.tsx` | يبقى العرض، لكن مصدره API السيرفر بدل `queryAuditPaginated` المحلي |
| `PlatformSecurityCenterPage.tsx` | مصدره API السيرفر بدل `getPlatformSecurityOverview` المحلي |
| `PlatformOperationsSettingsPage.tsx` | مصدره API السيرفر بدل `listOpsJobs` المحلي |

---

**نهاية الخطة.**
