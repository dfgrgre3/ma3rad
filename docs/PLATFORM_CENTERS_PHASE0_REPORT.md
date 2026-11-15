# تقرير إنجاز المرحلة 0 — أساس منصة الإدارة المركزية

**التاريخ:** 2026-11-15
**الفرع:** `platform-centers-phase0`
**المرجع:** `docs/PLATFORM_CENTERS_IMPLEMENTATION_PLAN.md` — المرحلة 0

---

## 1. الهدف والنتيجة

الهدف كان تحويل `central-server` من ملف واحد (2151 سطراً، 27 مساراً، بلا صلاحيات على معظم المسارات) إلى خادم مركزي قابل للتوسع والاختبار، مع تأمين كل مسار، وسجل تدقيق غير قابل للتعديل، وسماحيات (Allowlist) مولّدة لطبقة Electron.

**النتيجة:** تم تحقيق معيار الخروج بالكامل:

- كل مسار حالي محمي بمصادقة جلسة + صلاحية دقيقة (أو أي-of مع الأكواد القديمة).
- 34 مسار/طريقة (route/method) على السيرفر، كلها مُعلنة ومُغطّاة باختبارات.
- `node --test central-server/test`: **14/14 اختبار ناجح**.
- الاختبارات القائمة: `test:platform` **12/12**، `test/central-api.test.cjs` **3/3**.
- لا كسر للتوافق: المسارات وأشكال الاستجابات القديمة كما هي.
- Allowlist الجسر مولّدة آلياً من ملف Manifest ومُتحقَّق منها مقابل المسارات المثبّتة فعلياً.

---

## 2. البنية الجديدة

```
central-server/
  server.js                     # Bootstrap فقط: init + seed + scheduler + listen
  app.js                        # إنشاء تطبيق Express بدون لمس قاعدة البيانات
  routeManifest.js              # مصدر الحقيقة لمسارات API وصلاحياتها
  routes/
    index.js                    # تركيب /api/v1
    auth.js  staff.js  tenants.js  plans.js  licenses.js  devices.js  system.js
  middleware/
    auth.js                     # authenticatePlatformUser / requirePlatformPermission / requireTenantScope
    request.js                  # requestId موحّد + X-Request-Id
    errors.js                   # 404 و معالج أخطاء مركزي
  lib/
    db.js                       # schema + migrations + seed RBAC + سلسلة التدقيق
    audit.js                    # append + تحقق السلسلة + محاولات الدخول
    signing.js  jwt.js  time.js
    routeIntrospection.js       # استخراج المسارات من شجرة Express
  test/                         # اختبارات node:test
  scripts/generate-catalog.mjs  # توليد كتالوج الصلاحيات
  scripts/generate-routes.mjs   # توليد Allowlist + التحقق من التطابق
```

`server.js` يحافظ على التصديرات القديمة: `app`, `signCertificate`, `verifyCertificate`, `checkExpiringLicensesAndSubscriptions`.

---

## 3. تأمين المسارات

- المصادقة أصبحت **مرتبطة بجلسة**: التوكن JWT يحتوي `sid`، ويُرفض إذا حُذفت الجلسة أو انتهت أو مرّت 30 دقيقة بلا نشاط. كما يدعم التوكنات القديمة غير الشفافة.
- `requirePlatformPermission` يقبل كوداً واحداً أو مصفوفة (any-of) للتوافق مع `staff:read` و`platform.tenants.manage` أثناء الانتقال للأكواد الدقيقة.
- كل رفض صلاحية يُسجَّل حدث تدقيق `ACCESS_DENIED`، وكل خروج عن نطاق العميل يُسجَّل `TENANT_SCOPE_DENIED` (البنية جاهزة وتُستخدم في المرحلة 1 عند تفعيل `data_scope=LIMITED`).
- حماية من التخمين: قفل الحساب 15 دقيقة بعد 5 محاولات فاشلة + جدول `platform_login_attempts` لكل محاولة.

### جدول المسارات والصلاحيات

| المسار | الطرق | الصلاحية |
|---|---|---|
| `/api/v1/health` | GET | عام |
| `/api/v1/configuration/public-key` | GET | عام |
| `/api/v1/admin/auth/login` | POST | عام |
| `/api/v1/admin/auth/{me,effective}` | GET | جلسة |
| `/api/v1/admin/auth/{logout,refresh}` | POST | جلسة |
| `/api/v1/admin/auth/mfa/{setup,verify,disable}` | POST | جلسة |
| `/api/v1/admin/staff` | GET / POST | `staff:read` أو `platform.staff.view` / `staff:manage` أو `platform.staff.create` |
| `/api/v1/admin/roles`, `/roles/:code/permissions`, `/permissions/catalog` | GET | `platform.staff.view` أو `platform.staff.manage_permissions` |
| `/api/v1/admin/tenants` | GET / POST | `platform.tenants.view/manage` / `platform.tenants.create/manage` |
| `/api/v1/admin/tenants/:id` | GET | `platform.tenants.view/manage` |
| `/api/v1/admin/plans` | GET | `platform.plans.view/manage` |
| `/api/v1/admin/licenses` | GET | `platform.licenses.view/manage` |
| `/api/v1/admin/licenses/issue` | POST | `platform.licenses.create/manage` |
| `/api/v1/admin/licenses/:id/{renew,suspend,transfer,coupling}` | POST | `platform.licenses.update/manage` |
| `/api/v1/admin/licenses/:id/revoke` | POST | `platform.licenses.delete/manage` |
| `/api/v1/admin/devices` | GET | `platform.devices.view` |
| `/api/v1/admin/devices/:id/{suspend,release,revoke}` | POST | `platform.devices.update` |
| `/api/v1/admin/devices/detect-clones` | POST | `platform.devices.view/update` |
| `/api/v1/admin/audit`, `/audit/verify`, `/audit/:id` | GET | `platform.audit.view` |

كل الاستجابات تحمل `X-Request-Id`. المسارات القديمة تُرجع نفس الأشكال السابقة، بينما المسارات الجديدة (audit / catalog / roles) تُرجع `{ data, meta?, requestId }`.

---

## 4. سلسلة التدقيق غير القابلة للتعديل

- أعمدة جديدة: `sequence`, `prev_hash`, `record_hash`.
- `recordAuditEvent` يحسب `SHA-256(prev_hash|id|sequence|actor|action|resource|before|after|created_at)`، ويعيد المحاولة عند تصادم `sequence` (فهرس فريد).
- Triggers على `platform_audit_events` ترفض أي `UPDATE` أو `DELETE` برسالة `platform_audit_events is append-only`.
- `GET /admin/audit/verify` يعيد حساب السلسلة كاملة ويكشف: `SEQUENCE_GAP` / `PREV_HASH_MISMATCH` / `RECORD_HASH_MISMATCH`.
- ترحيل تلقائي عند أول تشغيل: يضيف الأعمدة، يعبّئ الصفوف القديمة بسلسلة صحيحة، ثم ينشئ الـ triggers وفهرس `sequence` الفريد.
- اختبارات تثبت: التحقق الناجح، رفض UPDATE/DELETE، وكشف التلاعب حتى عند تعطيل الـ trigger.

---

## 5. كتالوج الصلاحيات والصفحات

- أُضيف `PLATFORM_PAGE_CATALOG` إلى المصدر القانوني `src/services/domains/platform/platformPermissionCatalog.ts` (32 صفحة: المسار + الوحدة + العنوان + صلاحية العرض).
- أُعيد توليد `central-server/platformPermissionCatalog.js` (132 صلاحية، 6 أدوار).
- `GET /admin/permissions/catalog` يعيد الأقسام + الصفحات + الصلاحيات + مصفوفات الأدوار في استجابة واحدة جاهزة لمصفوفة RBAC في الواجهة.

---

## 6. Allowlist مولّدة للجسر

- `central-server/routeManifest.js`: 39 نمط مسار مع طرق السيرفر وصلاحياتها + مسارات العميل الخارجية (licensing / configuration / telemetry / releases).
- `scripts/generate-routes.mjs` يبني التطبيق فعلياً، يستخرج كل المسارات من شجرة Express، ويفشل إذا:
  - مسار معلن غير مثبّت، أو
  - مسار مثبّت غير معلن.
- الناتج `electron/centralRoutes.generated.js` أصبح المصدر الوحيد لـ `electron/centralApi.js` بدل القائمة اليدوية.
- تم حذف المسارات الوهمية غير المنفذة (invoices/payments/settings و CRUD غير الموجود) من Allowlist.
- اختبار `route-manifest.test.cjs` يفشل إذا انحرف الملف المولّد عن الـ Manifest.

---

## 7. عميل TypeScript

أُضيفت إلى `PlatformAdminApiClient` أنواع ودوال مراكز الأدوار والتدقيق:

- `listRoles()`, `getRolePermissions(code)`, `getPermissionCatalog()`
- `listAuditEvents(query)`, `getAuditEvent(id)`, `verifyAuditChain(fromSequence)`
- أنواع: `PlatformAuditEvent`, `PlatformAuditQuery`, `PlatformAuditPage`, `PlatformAuditVerification`, `PlatformRoleSummary`

---

## 8. الاختبارات

| المجموعة | الملف | النتيجة |
|---|---|---|
| المصادقة والصلاحيات (إيجابي/سلبي، رفض مسجّل، كتالوج، خروج) | `central-server/test/auth-permissions.test.cjs` | 5/5 |
| سلسلة التدقيق + Append-only + كشف التلاعب | `central-server/test/audit-chain.test.cjs` | 3/3 |
| ترحيل السجلات القديمة + ترحيل جداول الهوية + idempotency | `central-server/test/schema-migration.test.cjs` | 2/2 |
| تغطية الـ Manifest وتطابق Allowlist | `central-server/test/route-manifest.test.cjs` | 4/4 |
| اختبارات المنصة القائمة | `npm run test:platform` | 12/12 |
| اختبار الجسر القائم | `node --test test/central-api.test.cjs` | 3/3 |

أوامر التشغيل:

```bash
npm run test:central-server     # من جذر المستودع
cd central-server && npm test
node central-server/scripts/generate-catalog.mjs
node central-server/scripts/generate-routes.mjs
```

---

## 9. انحرافات عن الخطة (مقصودة)

1. **`zod`:** لم يُضف كاعتماد للسيرفر في هذه المرحلة؛ التحقق الحالي صريح داخل كل مسار (حقول مطلوبة، enums، حدود). إضافته تحتاج تثبيت اعتماد جديد في `central-server` وسيُطبّقها مع مخططات المرحلة 1.
2. **توليد Allowlist من OpenAPI:** لا يوجد OpenAPI في المستودع بعد. تم التوليد من `routeManifest.js` + تحقق آلي من شجرة Express، وهو أقوى من قائمة يدوية ويحقق نفس الهدف الأمني. عند إدخال OpenAPI في المرحلة 2 يمكن جعل الـ Manifest مشتقاً منه.
3. **`platform.dataSource` و`CentralPlatformClient`:** العميل موجود (`PlatformAdminApiClient`) وموسّع، لكن علم مصدر البيانات وتفعيل القراءة من السيرفر في الواجهات مؤجل للمرحلة 1 لأن المرحلة 0 تُبقي `PlatformAdminService` المحلي متوافقاً حتى القطع التدريجي.
4. **التحقق من الأنواع:** `npm run typecheck` يفشل بأخطاء سابقة غير متعلقة بهذه المرحلة (صفحات finance / procurement / reports). الملفات المعدّلة هنا (`PlatformAdminApiClient.ts`, `platformPermissionCatalog.ts`, `centralApi.js`) بلا أخطاء ESLint أو TS.

---

## 10. الخطوة التالية

المرحلة 1 — التجاري الأساسي:

1. `Dashboard` مع مؤشرات وفترات من السيرفر (`platform_metrics_daily`).
2. توسيع `Tenants` إلى دورة حياة كاملة (حساب، مستخدمون، فروع، تجاوزات، استيراد/تصدير).
3. `Subscriptions` المركزية مع التجديد والموافقات.

شرط البدء: تثبيت مخططات `zod` في `central-server` وتوسيع `routeManifest.js` مع كل مسار جديد (المولّد يفشل تلقائياً إذا نُسي ذلك).
