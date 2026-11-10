# 07 — سجل التنفيذ

> كل تغيير موثّق هنا: السبب، الملفات، الأثر، والتحقق. لا تُدرج تغييرات تجميلية بلا قيمة.

---

## 2026-11-07 — الجلسة الحالية

### 7.1 إصلاح أخطاء TypeScript في خدمة الشركاء

**المشكلة:** `npm run typecheck` كان يفشل في `src/services/PartnerService.ts`.

**التغييرات:**

| الملف | التغيير |
|---|---|
| `src/services/PartnerService.ts` | إضافة معامل اختياري `bankAccountCode` إلى `getPostingLines` واستخدام حساب البنك في `BANK_TRANSFER` |
| `src/services/PartnerService.ts` | تقييد `ownershipMode` إلى `'AUTO' \| 'MANUAL'` عند الإنشاء والتحديث |
| `src/services/PartnerService.ts` | إصلاح فرع `AUTO` غير القابل للوصول في `updatePartner` |
| `src/services/PartnerService.ts` | الشريك المعطّل يحصل على ملكية 0 مع حفظ التاريخ، ولا يُعاد الحساب التلقائي إلا للنشط |
| `src/services/PartnerService.ts` | توحيد رسالة خطأ السحب لتشمل «رأس المال المتاح» |

**التحقق:**
- `npm run typecheck` ✅
- `test/partners.test.ts` → 14/14 ✅

**الأثر على البيانات:** لا تغيير في المخطط، ولا ترحيل مطلوب.

---

### 7.2 تدقيق قاعدة الإنتاج (للقراءة فقط)

**الأدوات المضافة:**

| الملف | الدور |
|---|---|
| `scripts/db-audit.cjs` | فحص سلامة SQLite، الجداول، الفهارس، 15 فحصاً مالياً — قراءة فقط |
| `scripts/db-decrypt-audit.cjs` | فك تشفير نسخة من القاعدة عبر Electron `safeStorage` |

**النتائج:** 224 جدولاً، 133 ترحيلاً، `integrity_check=ok`، 0 مخالفات مفاتيح أجنبية، 15/15 فحصاً مالياً ناجحاً.

**الأثر:** لا كتابة على قاعدة الإنتاج.

---

### 7.3 إصلاح إزاحة المنطقة الزمنية في تواريخ الأعمال

**المشكلة:** استخدام `new Date().toISOString().slice(0, 10)` (UTC) لتوليد «تاريخ اليوم»، ودوال `addDays` التي تُنشئ تاريخاً محلياً ثم تُحوّله إلى UTC. في مصر (UTC+2) هذا يُنتج **اليوم السابق** بين منتصف الليل والساعة 2 صباحاً، ويُنقص يوماً من حسابات الانتهاء.

**الحل:** استخدام `localDateString` / `addLocalDays` من `src/utils/date.ts` (تاريخ محلي بصيغة `YYYY-MM-DD`).

**الملفات المعدّلة:**

| الملف | التغيير |
|---|---|
| `src/pages/customers/PartnersPage.tsx` | `today()` → `localDateString()` |
| `src/components/ProjectControlsPanel.tsx` | `today()` → `localDateString()` |
| `src/pages/hr/EmployeeContractsPage.tsx` | `today()` → `localDateString()` |
| `src/components/sales/CustomerStatementWhatsAppOptions.tsx` | تاريخ كشف الواتساب → `localDateString()` |
| `src/services/ContractService.ts` | `addDays()` يعيد تاريخاً محلياً |
| `src/services/EmployeeDocumentService.ts` | `addDays()` وعتبة «ينتهي خلال 30 يوماً» |
| `src/services/ApprovalService.ts` | تاريخ البحث عن الطلبات المتأخرة |
| `src/services/ManufacturingService.ts` | `completed_date` لأمر الصيانة |
| `src/services/ProductService.ts` | تاريخ حركة الرصيد الافتتاحي |
| `src/services/PrintService.ts` | تاريخ عرض السعر/الاستحقاق/التسليم |
| `src/services/BackupServicePart02.ts` | تاريخ قطع الاحتفاظ بالنسخ |

**التحقق:**
- `npm run typecheck` ✅
- `test/hr-contracts.test.ts` + `test/hr-documents.test.ts` + `test/partners.test.ts` → 14/14 ✅
- `npm run lint` → 0 أخطاء (1,093 تحذيراً) ✅

**الأثر على البيانات:** لا تغيير في المخططات أو القيم المخزنة سابقاً.

---

### 7.4 التحقق من تغطية واجهة الشركاء

تمت مراجعة `PartnersPage.tsx` والتأكد من أن الحقول الجديدة موصولة فعلياً بالخدمة:

- حقل `ownershipMode` (تلقائي/يدوي) و`ownershipBasis` و`ownershipEffectiveDate`.
- `initialPaidAmount` و`initialPaymentType`.
- اختيار الخزينة/البنك للحركات النقدية.
- مرفقات الحركة (`PartnerAttachment`).
- سجل رأس المال والملكية والأرباح.

**النتيجة:** لا فجوة وظيفية؛ لم يُعدّل الكود.

---

### 7.5 تشغيل حزمة الاختبارات الكاملة

```bash
npm test
```

| المؤشر | القيمة |
|---|---|
| الاختبارات | 460 |
| الناجحة | 460 |
| الفاشلة | 0 |
| المتخطاة | 0 |
| المدة | 374.9 ثانية |

التفاصيل في `08-test-report.md`.

---

### 7.6 إنشاء وثائق التدقيق

تم إنشاء `docs/system-audit/` بالمستندات الـ11 المطلوبة، مع أدلة من الكود والقاعدة والاختبارات.

### 7.7 ربط العقود بدورة الموظف والراتب

**التغييرات:**

| الملف | التغيير |
|---|---|
| `src/database/migrations/part30.ts` | ترحيل 142 لإضافة اعتماد العقد ومكونات الراتب وروابط التجديد وسجلات تاريخ الحالة والراتب والتسوية النهائية |
| `src/services/domains/hr/ContractService.ts` | اعتماد منفصل قبل التفعيل، مزامنة راتب العقد وسجل تاريخه، وتجديد بعقد جديد يحفظ العقد السابق |
| `src/services/domains/hr/ContractService.ts` | إنهاء خدمة مؤرخ ومسبب يحدّث حالة الموظف ويعطّل ملفه، وينشئ لقطة تسوية تشمل الأجر حتى تاريخ الخدمة ورصيد الإجازة بعد خصم الدفعات السابقة |
| `src/services/domains/hr/EmployeeService.ts` | احتساب الرواتب من العقد ومكوناته، استخدام تاريخ الراتب الساري، واستبعاد الموظف بعد انتهاء عقده أو وجود تسوية نهائية للشهر |
| `src/services/domains/hr/LeaveService.ts` | احتساب رصيد الإجازة السنوية المتبقي حتى تاريخ إنهاء الخدمة |
| `src/pages/hr/employee-contracts/EmployeeContractsPage.tsx` | اعتماد وتفعيل منفصلان، إنشاء تجديد كمسودة، إدخال تاريخ/سبب الإنهاء، وعرض التسوية والسجل الوظيفي |
| `src/pages/operations/employees/EmployeeFormModal.tsx` | إظهار حالة «تحت الاختبار» ومنع تسجيل حالات الخروج من نموذج الموظف |

**التحقق:**
- `npm run typecheck` ✅
- `hr-contracts.test.ts`, `hr-leave.test.ts`, `services.test.ts` ✅
- ESLint على الملفات المتغيرة: 0 أخطاء؛ بقي تحذير سابق غير متعلق بالمهمة في `services.test.ts:671`.
- `git diff --check` ✅

**ملاحظة تشغيلية:** تُمنع تواريخ إنهاء الخدمة المستقبلية حالياً؛ تسجيل الإنهاء عند سريانه يضمن اتساق الحالة الوظيفية مع أهلية الرواتب، وتُمنع التسوية إذا كانت دورة رواتب الموظف في شهر الإنهاء معتمدة أو مصروفة.

### 7.8 توسيع ملف الموظف والهيكل التنظيمي

**التغييرات:**

| الملف | التغيير |
|---|---|
| `src/database/migrations/part31.ts` | ترحيل 143 لإضافة بيانات الملف الشخصي والتواصل والطوارئ والاختبار والدفع والتأمين والتعليم والخبرة، وإنشاء سجل للمسميات الوظيفية |
| `src/services/domains/hr/EmployeeOrganizationService.ts` | إدارة الأقسام والمسميات الوظيفية مع نطاق الفرع والتدقيق |
| `src/services/domains/hr/EmployeeService.ts` | قراءة وحفظ الحقول الجديدة والتحقق من الهوية والقسم والمدير المباشر ومنع الدورات الإدارية، وحجب البيانات الحساسة عن مستخدمي العرض فقط |
| `src/pages/operations/employees/EmployeesPage.tsx` و`EmployeeFormModal.tsx` | توصيل حقول الملف وخيارات القسم والمدير، مع إجراءات إنشاء وتعديل وتعطيل الأقسام والمسميات |
| `test/hr-contracts.test.ts` | تغطية حفظ الملف والهيكل والمدير، صلاحيات عرض البيانات الحساسة، وتعطيل القسم والمسمى والتحقق من الدورة الإدارية |

**التحقق:**
- `npm run typecheck` ✅
- `hr-contracts.test.ts`: 9 اختبارات ناجحة ✅
- بناء الواجهة `npm run build` ✅
- ESLint على الملفات المتغيرة: لا أخطاء؛ بقيت تحذيرات سابقة في `EmployeesPage.tsx`.
- `git diff --check` ✅

### 7.9 مرفقات مستندات الموظفين وسجل النسخ

**التغييرات:**

| الملف | التغيير |
|---|---|
| `src/database/migrations/part32.ts` | ترحيل 144 لإضافة سجل نسخ ملفات المستندات ومستخدم آخر تعديل |
| `electron/documentHandlers.js` و`electron/preload.js` | استخدام مخزن المرفقات المشفر القائم لرفع PDF والصور، والمعاينة والتنزيل، مع التحقق من نوع المحتوى وحجم الملف ومسارات التخزين |
| `src/services/domains/hr/EmployeeDocumentService.ts` | ربط المستند بالموظف، تسجيل النسخ بأرقام متتابعة وبصمات ومستخدم الرفع، حفظ سجل التعديل، وتطبيق صلاحيات العرض والتنزيل والسرية ونطاق الفرع في الخدمة |
| `src/pages/hr/employee-documents/EmployeeDocumentsPage.tsx` | رفع النسخة الأولى والنسخ اللاحقة، معاينة الملفات داخل النظام، تنزيلها، عرض سجل النسخ والتعديلات، وتنبيه انتهاء الصلاحية |
| `src/services/domains/auth/PermissionService.ts` | صلاحيات مستقلة للمستندات المقيّدة والسرية وتنزيل الملفات |
| `test/hr-documents.test.ts` و`test/electron-documents.test.cjs` | اختبار صلاحيات السرية والتنزيل، النسخ المتتابعة، التشفير، توقيع المحتوى، القراءة والتنزيل والتنظيف |

تُخزن الملفات مشفرة بتشفير AES-GCM ومفتاح ملف مغلّف عبر `safeStorage`. لا يُحفظ المستند إذا لم يكن التشفير متاحاً. معاينة PDF والصور تتم في النظام دون إنشاء نسخة مؤقتة غير مشفرة؛ أما التنزيل فيكتب النسخة الصريحة فقط إلى المسار الذي يختاره المستخدم.

**التحقق:** `npm run typecheck`، بناء الواجهة، واختبارات مستندات الموظفين ومخزن الملفات المشفر.

---

## قوالب مستقبلية

عند أي تغيير لاحق، أضف قسماً بالشكل:

```md
## YYYY-MM-DD — عنوان مختصر
**المشكلة:** ...
**الملفات:** ...
**التحقق:** ...
**الأثر على البيانات:** ...
```
