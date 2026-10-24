جعل CeramiSys ERP تطبيقاً محلياً نظيفاً لفرع واحد:

## 1. حذف الملفات غير الضرورية
- 14 ملف `.bak` (7 لـ SalesView.tsx و7 لـ SalesService.ts)
- `src/services/SalesServicePatch.ts` (كود ميت — النسخة الحالية من SalesService.ts أحدث وأشمل منه)
- 11 ملف `.log` في جذر المشروع + `apply_invoice_pagination.py` + `test-domain.js`
- `src/database/Untitled-1.txt` (بعد التحقق من تتبعه في git)

## 2. حذف الربط السحابي بالكامل
- حذف `src/pages/settings/CloudSyncPage.tsx` و`src/services/CloudSyncService.ts`
- إزالة المسار من `src/App.tsx` (سطرا 280 و405)
- إزالة عنصر القائمة من `src/config/navigation.tsx` (سطر 204)
- إزالة الإشارات من `src/layouts/MainLayout.tsx` (سطرا 68 و147)
- تعديل اختبار `test/services.test.ts` (اختبار cloud sync عند السطر 152 يُحذف)
- جداول `sync_outbox` و`sync_conflict_logs` تبقى في المخطط بلا ضرر (تجنّب ترحيل هدّام)
- ملاحظة: صفحة الفروع (BranchesPage) تبقى كشاشة عرض/إدارة — التطبيق فعلياً أحادي الفرع (فرع افتراضي واحد br_main)

## 3. اختبارات أساسية جديدة (نفس نمط node:test الحالي)
- `test/permissions.test.ts`: PermissionService (منح/سحب/تحقق) وAuthService (قفل المحاولات الفاشلة، انتهاء الجلسة)
- `test/sales.test.ts`: مسار البيع — إنشاء فاتورة بنجاح، رفض سلة فارغة، مرتجع، إلغاء فاتورة، تسجيل دفعة
- إضافة الملفين لسكربت `test` في package.json
- التأكد أن `npm run check` (typecheck + test + build) يمر كاملاً

## 4. تحديث التوثيق
- تحديث `FEATURES_AND_PAGES.md` لإزالة ذكر الربط السحابي وتغطية الموديولات الأحدث باختصار

لا تغييرات على المخطط (schema) ولا auto-update — المثبّت اليدوي NSIS يبقى كما هو.