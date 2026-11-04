# Interactive UI Audit — المنهجية والحالة

## الهدف
كل عنصر تفاعلي في CeramiSys (زر/حقل/قائمة/خيار/توجل/تاب/رابط) يُصنَّف بإحدى الحالات:

| الحالة | المعنى |
|---|---|
| `PASS` | ينفذ الإجراء، يحفظ/يؤثر في كل الأجزاء المرتبطة |
| `PARTIAL` | ينفذ جزءًا؛ أجزاء مرتبطة لا تتحدث (تُوثَّق في note) |
| `UI_ONLY` | يستجيب بصريًا بلا أثر في البيانات/الوظيفة |
| `DISCONNECTED` | لا توجد عملية خلف العنصر أو لا مستهلك للقيمة |
| `BROKEN` | يفشل/خطأ في تنفيذ وظيفته |
| `UNVERIFIED` | لم يُختبر بعد (الوضع الافتراضي) |

## الأدوات

1. **`scripts/ui-audit/scan.mjs`** — جرد ثابت لكل عناصر `.tsx` تحت `src/`؛ يكتب `docs/ui-audit/manifest.json` بكل عنصر (ملف، سطر، نوع، مقتطف، الحالة=`UNVERIFIED`).
   - التشغيل: `node scripts/ui-audit/scan.mjs`
   - العدد الحالي (2026-11-04): **4023 عنصرًا في 244 ملفًا** (button 1328 · click-handler 1260 · input 800 · select 323 · submit-handler 161 · textarea 60 · checkbox 57 · link 21 · toggle 12 · tab 1).
   - تقريبي متعمد: يطابق بالأسطر؛ لا يُثبت التفرد؛ والعناصر المولّدة ديناميكيًا تُحصى مرة واحدة عند موقع إنشائها.

2. **`e2e/ui-audit.spec.ts`** — smoke على المسارات عالية المخاطر (25 مسارًا): التحقق أن الشاشة تُرسم بعناصر تفاعلية و**بلا pageerror** أثناء الإقلاع. أي مسار لا يُرسم ⇒ `BROKEN`.
   - التشغيل: `npm run build && npx playwright test e2e/ui-audit.spec.ts`

3. **`e2e/support/app.fixture.ts`** — fixture مشترك (تفعيل ← دخول ← seeded returning installation) مستخرج من `app.spec.ts`.

4. **`test/` (node:test)** — يبقى للمنطق والخدمات والـDB؛ لا يُستخدم لإثبات عمل الواجهة.

## workflow التصنيف

1. شغّل المسح الثابت → حدّث `manifest.json`.
2. شغّل smoke → أي route يفشل ⇒ عناصر ذاك المسار تُوسم `BROKEN` مبدئيًا.
3. راجع كل عنصر في المسارات عالية المخاطر يدويًا أو عبر سيناريوهات E2E (Phase 7):
   - تحقق من استدعاء الخدمة (grep لمعرّف المعالج)، ومن أثرها في DB (SELECT قبل/بعد)، ومن تحديث الصفحات المرتبطة (IMPACT_MAP).
4. حدّث `status` + `note` في الـmanifest؛ الحالات غير المُتحقق منها تبقى `UNVERIFIED` — لا تُغلق كـ`PASS` بلا دليل.
5. التحقق من النجاح ≠ ظهور toast؛ يجب فحص DB/الصفحات المتأثرة.

## نطاق المسارات عالية المخاطر (smoke)
`dashboard, pos, sales, sales/cycle, returns, orders, quotations, products, inventory, inventory/counts, inventory/transfers, purchases, purchases/orders, purchases/returns, customers, suppliers, cashboxes, finance, finance/expenses, finance/journal, reports, settings, admin, users, audit`

## ملاحظات
- `OPEN_ALL_PAGES=true` (وضع التطوير) يُظهر كل الشاشات؛ عند قلبه للإنتاج، تُحجب المسارات حسب الوحدات — يجب إعادة تشغيل smoke حينها.
- `data-testid` غير مستخدمة؛ التصنيف اليدوي يعتمد على `getByRole` + أسماء الوصول (أي إضافة `data-testid` للأزرار الحرجة ستُبسّط التوسعة).
- الـCI لا يشغّل e2e بعد؛ إضافة job (xvfb/headless) مدرجة في خطة Phase 7.
