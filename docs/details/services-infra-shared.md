# طبقة الخدمات — البنية التحتية والخدمات المشتركة والمزامنة

توثيق لملفات `src/services/infrastructure/` (النسخ الاحتياطي واستيراد البيانات)، و`src/services/shared/` (الطباعة والتصدير والأداء والصحة)، و`src/services/sync/`، وملف التجميع `src/services/index.ts`.

---

## البنية التحتية (`src/services/infrastructure/`)

### `infrastructure/backup/BackupService.ts`
- **الغرض:** نقطة الدخول للكلاس الرئيسي لخدمة النسخ الاحتياطي — يرث السلسلة الكاملة من الأجزاء.
- **الأعضاء الرئيسية:** `class BackupService extends BackupServicePart02 {}` — لا يضيف أي أعضاء؛ كل الوظائف تأتي من Part01/Part02.
- **ملاحظات:** يُستخدم ديناميكيًا عبر `import('./BackupService')` في `BackupScheduler` لتجنب التحميل المبكر.

### `infrastructure/backup/BackupServicePart01.ts`
- **الغرض:** الجزء الأساسي من خدمة النسخ الاحتياطي: التصدير والاستعادة واللقطات المحلية والنسخ التلقائي وسجل النسخ.
- **الأعضاء الرئيسية:**
  - `class BackupServicePart01` — الكلاس الأساسي (يُمدّد في Part02).
  - `require()` / `requireRestore()` — خاصتان تتحققان من صلاحيات المستخدم (تصدير/استعادة) عبر `PermissionService` و`AuthService`.
  - `exportBackupFile(password?)` — يصدّر نسخة SQLite مضغوطة داخل ملف XLSX مشفر اختياريًا بكلمة مرور، مع تسجيل تدقيق.
  - `exportRecoveryKeyFile(password)` — يصدّر ملف استرداد مفتاح النسخ (scrypt + AES-256-GCM) بحجم أقصى 16KB.
  - `isEncryptedBackupFile(file)` — يتحقق مما إذا كان الملف المشفوع نسخة احتياطية مشفرة.
  - `verifyBackupFile(bytes)` — يفحص سلامة ملف النسخة قبل الاستعادة.
  - `readBackupBytes(file, ...)` — يقرأ الملف ويفك تشفيره/استخراج قاعدة البيانات منه (يدعم XLSX العادي والمشفر).
  - `importBackupWithRollback(bytes, currentSnapshot, snapshotPath?)` — يستعيد قاعدة البيانات مع لقطة تراجع.
  - `verifyRestoredDatabase(currentSnapshot)` — يتحقق من سلامة القاعدة بعد الاستعادة.
  - `restoreBackupFromFile(file, password?)` — نقطة الاستعادة العامة: فحص، لقطة حالية، استبدال، تحقق، وتدقيق.
  - `readBackupDataForImport(file, password?)` — يقرأ بيانات النسخة للاستيراد (يرجع صفوفًا مجمعة).
  - `createLocalSnapshot(label, actor?)` — ينشئ لقطة/نسخة محلية في مجلد النسخ مع سجل `MANUAL`/`AUTO`.
  - `runAutoBackupIfDue(intervalHours)` — يشغّل النسخة التلقائية عند حلول الموعد ويسجّل النجاح/الفشل ونتائج الإجراءات الخارجية.
  - `openBackupFolder()` — يفتح مجلد النسخ في مدير الملفات.
  - `getBackupHistory()` / `getLastBackup()` — قراءة سجل النسخ من قاعدة البيانات.
  - `isBackupDue(intervalHours)` — يتحقق هل حان موعد النسخة التالية.
- **ملاحظات:** يعتمد على `DatabaseManager`، `AuthService`، `PermissionService`، `AuditService`، `backupEncryption` و`xlsxBackup`. الحد الأقصى لحجم ملف النسخة 700MB.

### `infrastructure/backup/BackupServicePart02.ts`
- **الغرض:** الجزء الثاني من خدمة النسخ: سياسات الاحتفاظ وتنظيف النسخ القديمة.
- **الأعضاء الرئيسية:**
  - `class BackupServicePart02 extends BackupServicePart01`.
  - `cleanupOldBackups(retentionDays = 90, maxCount = 50)` — يحذف النسخ القديمة وفق قواعد الاحتفاظ ويعيد `{ deleted, errors }`.
  - `shouldRetainBackup(createdAt, index, cutoffDate, maxCount)` — خاصة تحدد إبقاء/حذف نسخة.
  - `getRetentionSettings()` / `setRetentionSettings(retentionDays, maxBackups)` — قراءة/حفظ إعدادات الاحتفاظ من `SettingsService`.
- **ملاحظات:** يستدعيها `BackupScheduler.maintainAutomaticBackups` بعد كل نسخة تلقائية.

### `infrastructure/backup/BackupScheduler.ts`
- **الغرض:** جدولة النسخ الاحتياطي التلقائي على مستوى الواجهة (React).
- **الأعضاء الرئيسية:**
  - `maintainAutomaticBackups(backupService, interval)` — يشغّل `runAutoBackupIfDue` ثم `cleanupOldBackups` مع تحذيرات للأخطاء الخارجية.
  - `runAutomaticBackupCheck(BackupServiceClass)` — فحص لمرة واحدة بقراءة `autoBackupIntervalHours` من الإعدادات.
  - `scheduleAutomaticBackupChecks(backupTimer)` — يستورد `BackupService` ديناميكيًا ويشغّل فحصًا فوريًا ثم كل 15 دقيقة عبر `setInterval`، مع إلغاء المؤقت السابق.
- **ملاحظات:** مصمم ليُستدعى من مكوّن React (يستقبل `MutableRefObject` للمؤقت).

### `infrastructure/backup/backupEncryption.ts`
- **الغرض:** وحدة تجميع (barrel) لدوال تشفير وفك تشفير النسخ الاحتياطية الموقّعة.
- **الأعضاء الرئيسية:** يعيد تصدير: `isEncryptedBackup`, `isEncryptedLocalDatabase`, `encryptExternalBackup` (part01)؛ `decryptExternalBackup`, `generateBackupSignature`, `verifyBackupSignature` (part02)؛ `encryptBackupWithSignature` (part03)؛ `decryptBackupWithSignature` (part04).
- **ملاحظات:** الواجهة الموحدة التي يستورد منها `BackupServicePart01`.

### `infrastructure/backup/backupEncryption_part01.ts`
- **الغرض:** الثوابت والتوليد الأساسي للتشفير: اشتقاق المفتاح وفحص الصيغ.
- **الأعضاء الرئيسية:**
  - ثوابت: `BACKUP_MAGIC` (`'CERAMISYS-BACKUP\n1\n'`)، `LOCAL_DATABASE_MAGIC`، `SALT_LENGTH=16`، `IV_LENGTH=12`، `PBKDF2_ITERATIONS=310_000`، `SIGNATURE_LENGTH=64`.
  - `startsWithBytes(data, prefix)` — مقارنة بادئة بايتات.
  - `deriveKey(password, salt)` — اشتقاق `CryptoKey` عبر PBKDF2.
  - `isEncryptedBackup(bytes)` / `isEncryptedLocalDatabase(bytes)` — كشف الصيغ المشفرة.
  - `encryptExternalBackup(bytes, password)` — تشفير نسخة خارجية بكلمة مرور (AES-GCM + magic).
- **ملاحظات:** أساس WebCrypto المستخدم في الأجزاء 2–4.

### `infrastructure/backup/backupEncryption_part02.ts`
- **الغرض:** فك تشفير النسخ الخارجية والتوقيع الرقمي ECDSA/SHA-512.
- **الأعضاء الرئيسية:**
  - `decryptExternalBackup(bytes, password)` — يفك تشفير النسخة الخارجية.
  - `generateBackupSignature(bytes, secretKey)` — يوقّع البيانات بنص صريح قبل التشفير.
  - `verifyBackupSignature(bytes, signature, secretKey)` — يتحقق من التوقيع (يعيد `false` عند الخطأ).
- **ملاحظات:** التوقيع يُنشأ على النص الصريح ثم يُخزّن داخل الحاوية المشفرة.

### `infrastructure/backup/backupEncryption_part03.ts`
- **الغرض:** بناء حاوية النسخة المشفرة الموقعة.
- **الأعضاء الرئيسية:** `encryptBackupWithSignature(bytes, password, secretKey)` — يولّد salt/iv عشوائيين، يوقّع ثم يشفّر AES-GCM، ويرجع `MAGIC + SALT + IV + SIGNATURE + CIPHERTEXT`.
- **ملاحظات:** يُستخدم في مسار النسخ الاحتياطية المشفرة بكلمة مرور.

### `infrastructure/backup/backupEncryption_part04.ts`
- **الغرض:** فك حاوية النسخة الموقعة مع التحقق من التوقيع قبل إرجاع البيانات.
- **الأعضاء الرئيسية:** `decryptBackupWithSignature(bytes, password, secretKey)` — يتحقق من الصيغة، يستخرج الحقول، يتحقق من التوقيع على النص المفكوك، ثم يفك التشفير.
- **ملاحظات:** يرمي أخطاء عربية عند ملف ناقص/تالف أو توقيع غير صالح.

### `infrastructure/backup/xlsxBackup.ts`
- **الغرض:** وحدة تجميع (barrel) لتغليف/استخراج قاعدة SQLite داخل ملف XLSX.
- **الأعضاء الرئيسية:** يعيد تصدير `hasOfficeCompoundFileSignature` (part01)، `createXlsxBackupWorkbook` (part02)، `extractDatabaseFromXlsxBackup` (part03).
- **ملاحظات:** `BackupServicePart01` يستورد منها جميع الدوال الثلاث.

### `infrastructure/backup/xlsxBackup_part01.ts`
- **الغرض:** ثوابت وأدوات base64 للكشف عن ملفات Office وملفات XLSX.
- **الأعضاء الرئيسية:**
  - ثوابت: `INFO_SHEET='معلومات النسخة'`، `PAYLOAD_SHEET='_CERAMISYS_BACKUP'`، `PAYLOAD_MARKER`، `PAYLOAD_VERSION='1'`، `PAYLOAD_START_ROW=4`، `MAX_BASE64_CELL_LENGTH=32_000`، `RAW_CHUNK_SIZE=24_000`، `OLE_SIGNATURE` (توقيع الملفات الثنائية القديمة).
  - `encodeBase64(bytes)` / `decodeBase64(value)` — تحويل base64 يدوي.
  - `hasOfficeCompoundFileSignature(bytes)` — يكشف توقيع OLE للملفات الثنائية.
- **ملاحظات:** تحدد بنية ورقة الحمولة داخل ملف Excel.

### `infrastructure/backup/xlsxBackup_part02.ts`
- **الغرض:** إنشاء ملف XLSX يحمل قاعدة البيانات.
- **الأعضاء الرئيسية:** `createXlsxBackupWorkbook(databaseBytes)` — يبني workbook بورقة معلومات وورقة `_CERAMISYS_BACKUP` تحوي قاعدة SQLite مقسّمة base64 في خلايا.
- **ملاحظات:** الناتج ملف `.xlsx` عادي يفتح في Excel مع ورقة معلومات وصفية.

### `infrastructure/backup/xlsxBackup_part03.ts`
- **الغرض:** استخراج قاعدة البيانات من ملف XLSX.
- **الأعضاء الرئيسية:** `extractDatabaseFromXlsxBackup(workbookBytes)` — يقرأ الورقة الحمولة، يجمع الأجزاء base64، يتحقق من `PAYLOAD_MARKER` ويعيد بايتات SQLite.
- **ملاحظات:** يقابل `createXlsxBackupWorkbook`؛ يرمي خطأ عند ملف غير صالح.

### `infrastructure/data/SpreadsheetImportService.ts`
- **الغرض:** وحدة تجميع (barrel) لاستيراد ملفات Excel/CSV.
- **الأعضاء الرئيسية:** يعيد تصدير حدود الحجم (`MAX_SPREADSHEET_FILE_SIZE` حتى `MAX_SPREADSHEET_SHEETS`) والأنواع `ParsedSpreadsheetSheet`/`ParsedSpreadsheet` ودوال التحقق و`parseSpreadsheetBuffer` من الأجزاء.
- **ملاحظات:** الواجهة الموحدة التي يستورد منها `DynamicDataService` و`DataFileImportService`.

### `infrastructure/data/SpreadsheetImportService_part01.ts`
- **الغرض:** ثوابت التحقق والأنواع الأساسية لاستيراد الجداول.
- **الأعضاء الرئيسية:**
  - ثوابت الحدود: `MAX_SPREADSHEET_FILE_SIZE=10MB`، `MAX_SPREADSHEET_ROWS=20_000`، `MAX_SPREADSHEET_COLUMNS=100`، `MAX_SPREADSHEET_CELLS=250_000`، `MAX_SPREADSHEET_DATA_BYTES=8MB`، `MAX_SPREADSHEET_SHEETS=20`.
  - `interface ParsedSpreadsheetSheet` — `{ name, headers, rows }` لورقة واحدة.
  - `interface ParsedSpreadsheet` — `{ buffer, sheets }` للملف كاملًا.
  - `interface WorkbookBounds` — مجاميع حدود المصنف للتحقق.
  - `validateSpreadsheetFileMetadata(fileName, size)` — يتحقق من الامتداد والحجم ويعيد الامتداد.
  - `validateSpreadsheetFileHeader(extension, header)` — يفحص بايتات التوقيع (xlsx/zip أو csv).
- **ملاحظات:** الحدود الصارمة تحمي من ملفات ضخمة قبل التحليل.

### `infrastructure/data/SpreadsheetImportService_part02.ts`
- **الغرض:** التحقق من أبعاد وأحجام أوراق وملفات Excel.
- **الأعضاء الرئيسية:**
  - `getSheetRange(name, sheet)` — يستخرج نطاق `XLSX.Range` للورقة.
  - `validateSheetDimensions(name, range)` — يفحص عدد الصفوف/الأعمدة ويرجعها.
  - `validateWorkbookTotals(totals)` — يفحص إجماليات المصنف مقابل الحدود.
  - `countSheetDataBytes(sheet, totalDataBytes)` — يجمع حجم بيانات الورقة التقريبي.
  - `validateSheetBounds(name, sheet, totals)` — تحقق لكل ورقة ويحدّث المجاميع.
  - `validateWorkbookBounds(workbook)` — نقطة الدخول للتحقق الشامل قبل التحليل.
- **ملاحظات:** تعمل قبل `sheet_to_json` لمنع استهلاك الذاكرة بملفات ضخمة.

### `infrastructure/data/SpreadsheetImportService_part03.ts`
- **الغرض:** التحليل الفعلي لملفات Excel/CSV إلى بنية موحّدة.
- **الأعضاء الرئيسية:** `parseSpreadsheetBuffer(buffer, fileName)` — يتحقق من الامتداد والتوقيع، ولقيم CSV يفك الترميز ويحلّل كـdelimited text، ولـxlsx يقرأ بـ`XLSX.read` مع `sheetRows` محدود، يتحقق من الحدود، ويعيد `{ buffer, sheets }`.
- **ملاحظات:** يرمي أخطاء عربية عند ملف تالف أو بلا صفوف بيانات.

### `infrastructure/data/DelimitedTextImport.ts`
- **الغرض:** كشف وفك وترميز وتحليل ملفات النص المفصول (CSV/TSV).
- **الأعضاء الرئيسية:**
  - `looksLikeDelimitedText(text)` — يخمّن إن كان النص جدولًا مفصولًا.
  - `decodeDelimitedText(bytes)` — يفك UTF-8/UTF-16LE/BE مع فحص BOM ورفض البيانات الثنائية.
  - `parseDelimitedText(text, name)` — يكتشف الفاصل (فاصلة/فاصلة منقوطة/تاب/مسافات) بأفضل اتساق ويعيد `ParsedSpreadsheetSheet`.
- **ملاحظات:** يستخدمه `SpreadsheetImportService_part03` لـCSV و`DataFileImportService` لـTXT.

### `infrastructure/data/DataFileImportService.ts`
- **الغرض:** استيراد ملفات نصية عامة (DOCX، JSON، XML، TXT) إلى أوراق بيانات موحّدة.
- **الأعضاء الرئيسية:**
  - `MAX_DATA_FILE_IMPORT_BYTES = 10MB`.
  - `parseDataFileBuffer(buffer, fileName)` — نقطة الدخول: يتحقق من النوع والحجم ويوجّه لكل محلل.
  - داخليات: `decodeText` (UTF-8 صارم)، `validateDataFile`، `parseXml` (يرفض DOCTYPE/ENTITY)، `parseJson`، `parseDocx` (يفك zip بـ`fflate` ويستخرج فقرات المستند)، `parseXmlData`، `createSheet`، `docxParagraphText`، `valueText`.
  - حدود داخلية: `MAX_TEXT_CHARACTERS=8MB`، `MAX_IMPORT_ROWS=20_000`، `MAX_IMPORT_COLUMNS=100`، `MAX_DOCX_XML_BYTES=20MB`، `MAX_ZIP_ENTRIES=2_000`.
- **ملاحظات:** TXT يُحلّل كـdelimited أو يُمرّر لـ`parsePdfExtractedText` إن بدا جدولًا؛ النتيجة `ParsedSpreadsheetSheet[]` جاهزة لأنابيب الاستيراد.

### `infrastructure/data/DynamicDataService.ts`
- **الغرض:** خدمة "أنواع البيانات الديناميكية": تعريف كيانات مخصصة بالحقول والعلاقات واستيراد جداولها كسجلات.
- **الأعضاء الرئيسية:**
  - أنواع: `DynamicFieldType`، `DynamicField`، `DynamicEntity`، `DynamicRecord`، `DynamicImportResult`.
  - `listEntities(search)` / `getEntityByKey(nameKey)` — استعراض أنواع البيانات.
  - `importWorkbook(buffer, fileName, requestedType?)` / `importSheets(buffer, fileName, sheets, requestedType?)` — استيراد مصنف إلى نوع ديناميكي مع كشف الحقول تلقائيًا (`fieldType`) ومنع التكرار عبر `source_hash` في `dynamic_import_batches`.
  - `listRecords(entityId, search, page, pageSize)` / `listAllRecords(entityId)` — استعلام السجلات مع بحث وترقيم.
  - `createRecord(entityId, values)` / `updateRecord(recordId, values)` / `deleteRecord(recordId)` — إدارة السجلات مع `validateRecordValues`.
  - `addField(entityId, field)` / `updateEntityRelations(entityId, relations)` — توسيع المخطط.
  - `getBatches(entityId)` / `rollbackBatch(batchId)` / `deleteEntity(entityId)` — إدارة الدفعات والتراجع والحذف.
  - خصوصيات: `requireView/requireManage/requireExport` (صلاحيات)، `validateRecordValues`، `audit` (يسجل في `audit_logs` بوحدة `DYNAMIC_DATA`).
- **ملاحظات:** يعتمد على `DatabaseManager`، `AuthService`، `PermissionService`، `BranchAccessService`، و`parseSpreadsheetBuffer`. الجداول: `dynamic_entity_types`، `dynamic_records`، `dynamic_import_batches`.

### `infrastructure/data/PdfImportService.ts`
- **الغرض:** وحدة تجميع (barrel) لاستيراد PDF.
- **الأعضاء الرئيسية:** يعيد تصدير `MAX_PDF_IMPORT_BYTES` (part01) و`extractPdfText` (part03).
- **ملاحظات:** يخفي تقسيم الملف إلى ثلاثة أجزاء.

### `infrastructure/data/PdfImportService_part01.ts`
- **الغرض:** ثوابت PDF وأدوات استخراج النص من صفحة.
- **الأعضاء الرئيسية:**
  - ثوابت: `MAX_PDF_IMPORT_BYTES=25MB`، `MAX_PDF_IMPORT_PAGES=100`، `MAX_PDF_TEXT_CHARACTERS=1_000_000`، `MIN_PAGE_TEXT_CHARACTERS=80`، وإعادة تصدير `MAX_OCR_IMAGE_BYTES`.
  - `type PdfTextItem` — عنصر نصي من `getTextContent` في pdfjs.
  - `pageText(page)` — يستخرج النص مرتّبًا حسب الإحداثيات y ويدمج الفجوات كمسافات/تبويبات (يحافظ على شكل الجداول).
  - يضبط `GlobalWorkerOptions.workerSrc` من `pdfWorkerUrl`.
- **ملاحظات:** `pdfjs-dist/legacy` مع polyfill `iterator-helpers`.

### `infrastructure/data/PdfImportService_part02.ts`
- **الغرض:** تصيير صفحة PDF إلى صورة لتمريرها لـOCR.
- **الأعضاء الرئيسية:** `renderPageForOcr(page)` — يرسم الصفحة على canvas بمقياس محدود (أقصى بُعد 3200px، أقصى مساحة 12M بكسل) ويعيد PNG bytes بحد `MAX_OCR_IMAGE_BYTES`.
- **ملاحظات:** يُستدعى فقط للصفحات الممسوحة ضوئيًا من `extractPdfText`.

### `infrastructure/data/PdfImportService_part03.ts`
- **الغرض:** استخراج النص الكامل من ملف PDF مع بديل OCR للصفحات الممسوحة.
- **الأعضاء الرئيسية:** `extractPdfText(buffer, onProgress?)` — يتحقق من التوقيع `%PDF-` والحدود، يقرأ الصفحات عبر pdfjs، وللصفحات ذات النص القليل يستدعي `window.ceramisys.documents.recognizePage`/`finishOcr` (OCR محلي في التطبيق المكتبي) ثم `page.cleanup()`، ويعيد النص المجمّع.
- **ملاحظات:** يتطلب جسر Electron `ceramisys.documents` للـOCR؛ يرمي خطأً واضحًا عند غيابه.

### `infrastructure/data/ImageImportService.ts`
- **الغرض:** التحقق من ملفات الصور واستخراج نصها عبر OCR.
- **الأعضاء الرئيسية:**
  - `MAX_IMAGE_IMPORT_BYTES = MAX_OCR_IMAGE_BYTES` (12MB).
  - `validateImageImportFile(fileName, size, header)` — يفحص الامتداد (PNG/JPG/WEBP/GIF)، الحجم، وتوقيعات المحتوى الثنائية.
  - `extractImageText(buffer, fileName, onProgress?)` — يتحقق ثم يستدعي `window.ceramisys.documents.recognizePage` محليًا ويعيد النص.
- **ملاحظات:** يعتمد على `OcrImportLimits` وجسر `ceramisys.documents`؛ حدود داخلية `MAX_IMAGE_PIXELS=12M` و`MAX_IMAGE_DIMENSION=3200`.

### `infrastructure/data/OcrImportLimits.ts`
- **الغرض:** ملف ثوابت وحيد لحد حجم صور OCR.
- **الأعضاء الرئيسية:** `MAX_OCR_IMAGE_BYTES = 12 * 1024 * 1024`.
- **ملاحظات:** مشترك بين `ImageImportService` و`PdfImportService_part01`/`part02` لتوحيد الحد.

### `infrastructure/data/PdfImportData.ts`
- **الغرض:** تحويل النص المستخرج من PDF إلى بنية `ParsedSpreadsheetSheet` (جدول).
- **الأعضاء الرئيسية:**
  - `parsePdfExtractedText(text, sheetName)` — يكتشف جدولًا من النص (فواصل `|` أو تبويبات أو مسافات مزدوجة)، يبني رؤوسًا فريدة وصفوفًا، ويرمي خطأ عند غياب نص قابل للاستيراد.
  - داخليات: `uniqueHeaders` (إزالة تكرار الرؤوس)، `splitTableLine`.
  - حدود داخلية: `MAX_PDF_IMPORT_ROWS=10_000`، `MAX_PDF_IMPORT_COLUMNS=100`.
- **ملاحظات:** يغذّي `DataFileImportService` لملفات TXT التي تبدو جداول، وواجهة استيراد PDF بعد `extractPdfText`.

---

## الخدمات المشتركة (`src/services/shared/`)

### `shared/PrintService.ts`
- **الغرض:** الخدمة الرئيسية للطباعة: فواتير بأنواع/أحجام متعددة، مستندات، وإيصال حراري.
- **الأعضاء الرئيسية:**
  - `class PrintService` — الكلاس الرئيسي (يستخدم `DatabaseManager` و`SettingsService`).
  - `getSettings()` — يجلب `SystemSettings` الحالية.
  - `getSampleInvoice(settingsOverride?)` — يولّد فاتورة تجريبية للمعاينة.
  - `getInvoiceHtml(invoice, optionsOrAutoPrint)` — يبني HTML للفاتورة باختيار القالب/الحجم.
  - `getTemplatePreviewHtml(template, size)` — معاينة قالب دون طباعة.
  - `printInvoice(invoice, options?)` — يفتح نافذة طباعة عبر `writeAndPrintWindow`.
  - `printTestPage(size, template)` — صفحة اختبار للطباعة.
  - `printThermalReceipt(invoice)` — يطبع إيصالًا حراريًا (يفوّض لـ`thermalReceipt.ts`).
  - `printQuotation` / `printOrder` / `printSalesReturn` / `printPurchaseReturn` / `printAreaTakeoff` — يطبع مستندات عبر `documents.ts`.
  - يعيد تصدير الأنواع `InvoiceHtmlOptions`، `InvoiceSizeId`، `InvoiceTemplateId`.
- **ملاحظات:** يختار القالب من `businessProfiles`/`getProfilePrintTemplate`؛ القوالب في `PrintService/templates/`.

### `shared/PrintService/types.ts`
- **الغرض:** أنواع خيارات طباعة الفاتورة.
- **الأعضاء الرئيسية:**
  - `InvoiceTemplateId = 'table' | 'classic' | 'modern' | 'compact' | 'detailed'`.
  - `InvoiceSizeId = 'a4' | 'a5' | 'thermal'`.
  - `interface InvoiceHtmlOptions { autoPrint?, size?, template?, settingsOverride? }`.
- **ملاحظات:** تُعاد تصديرها من `PrintService.ts` و`PrintService/documents.ts` يستخدمها ضمنيًا.

### `shared/PrintService/invoiceHtmlHelpers.ts`
- **الغرض:** دوال مساعدة لبناء HTML الفاتورة (تهريب، تفقيط، أقسام).
- **الأعضاء الرئيسية:**
  - `esc(value)` — تهريب HTML.
  - `printOverride(key, fallback)` — نص قابل للتجاوز من الترجمات/الإعدادات.
  - `tafqeet(amount)` — تحويل المبلغ إلى تفقيط عربي.
  - `paymentBadge(invoice, isA5)` / `paymentTypeLabel(paymentType)` — شارات الدفع.
  - `logoHtml(settings, size)` / `invoiceBrandStyles(settings)` — شعار وألوان الهوية.
  - `taxBreakdownHtml` / `promotionsHtml` / `deliveryDetailsHtml` / `paymentSplitsHtml` — أقسام HTML للفاتورة.
  - `operationalFieldsHtml(...)` — حقول تشغيلية إضافية.
  - `orderedInvoiceDetails(...)` — ترتيب تفاصيل الفاتورة.
  - `tableFirstColumns(settings)` — أعمدة قالب "table first" حسب الإعدادات.
- **ملاحظات:** مشتركة بين جميع قوالب `templates/`.

### `shared/PrintService/sampleInvoice.ts`
- **الغرض:** توليد فاتورة تجريبية للمعاينة/اختبار الطباعة.
- **الأعضاء الرئيسية:** `getSampleInvoice(settingsOverride?)` — يعيد `SalesInvoice & { items: any[] }` ببيانات واقعية.
- **ملاحظات:** يستخدمها `PrintService.getSampleInvoice` و`getTemplatePreviewHtml`.

### `shared/PrintService/thermalReceipt.ts`
- **الغرض:** طباعة إيصال حراري: مسار ESC/POS مباشر أولًا ثم بديل HTML.
- **الأعضاء الرئيسية:**
  - `printThermalReceiptDirect(invoice, settings)` — داخلية: تبني بايتات ESC/POS وترسلها عبر `window.ceramisys.printing.raw`/`print:raw` بدون حوار طباعة إن وُجد `thermalPrinterName`.
  - `printThermalReceipt(invoice)` — نقطة الدخول: يجرب المباشر ثم يسقط إلى HTML (`getThermalInvoiceHtml`) عبر نافذة طباعة.
- **ملاحظات:** يستخدم `EscPosService.buildReceiptBytes` و`SettingsService`؛ يستورد `EscPosService` من `../EscPosService`.

### `shared/PrintService/documents.ts`
- **الغرض:** مولّدات HTML/طباعة للمستندات غير الفاتورة (عرض سعر، أمر، مرتجعات،Takeoff).
- **الأعضاء الرئيسية:**
  - `printQuotationDocument(quotation)` — طباعة عرض سعر.
  - `printOrderDocument(order)` — طباعة أمر بيع/شراء.
  - `printSalesReturnDocument(salesReturn)` — طباعة مرتجع مبيعات.
  - `printPurchaseReturnDocument(purchaseReturn)` — طباعة مرتجع مشتريات.
  - `printAreaTakeoffDocument(lines)` — طباعة كشف مساحات/كميات.
- **ملاحظات:** كلها تفتح نافذة طباعة عبر `writeAndPrintWindow` وتستخدم `esc`/`printOverride` من `invoiceHtmlHelpers`.

### `shared/PrintService/templates/tableFirst.ts`
- **الغرض:** قالب فاتورة "جدول أولًا" (table-first).
- **الأعضاء الرئيسية:** `getTableFirstInvoiceHtml(invoice, settings, size: 'a4'|'a5')` — يعيد HTML كاملًا للفاتورة.
- **ملاحظات:** يستخدم `tableFirstColumns` من `invoiceHtmlHelpers` لاختيار الأعمدة حسب الإعدادات.

### `shared/PrintService/templates/classic.ts`
- **الغرض:** قالب الفاتورة الكلاسيكي.
- **الأعضاء الرئيسية:** `getClassicInvoiceHtml(invoice, settings, size: 'a4'|'a5')` — يعيد HTML.
- **ملاحظات:** نمط كلاسيكي بشعار وبيانات شركة؛ يعتمد على `invoiceHtmlHelpers`.

### `shared/PrintService/templates/modern.ts`
- **الغرض:** قالب الفاتورة الحديث.
- **الأعضاء الرئيسية:** `getModernInvoiceHtml(invoice, settings, size: 'a4'|'a5')` — يعيد HTML.
- **ملاحظات:** تصميم عصري بألوان الهوية (`brandPrimaryColor`)؛ يعتمد على `invoiceHtmlHelpers`.

### `shared/PrintService/templates/compact.ts`
- **الغرض:** قالب الفاتورة المضغوط.
- **الأعضاء الرئيسية:** `getCompactInvoiceHtml(invoice, settings, size: 'a4'|'a5')` — يعيد HTML.
- **ملاحظات:** تخطيط مكثف لتوفير الورق؛ يعتمد على `invoiceHtmlHelpers`.

### `shared/PrintService/templates/detailed.ts`
- **الغرض:** قالب الفاتورة التفصيلي.
- **الأعضاء الرئيسية:** `getDetailedInvoiceHtml(invoice, settings, size: 'a4'|'a5')` — يعيد HTML.
- **ملاحظات:** يعرض أقسامًا إضافية (تفقيط، ضرائب، توصيل، حقول تشغيلية)؛ يعتمد على `invoiceHtmlHelpers`.

### `shared/PrintService/templates/thermal.ts`
- **الغرض:** قالب HTML للإيصال الحراري (بديل لبايتات ESC/POS).
- **الأعضاء الرئيسية:** `getThermalInvoiceHtml(invoice, settings)` — يعيد HTML بعرض إيصال 80mm.
- **ملاحظات:** fallback في `thermalReceipt.ts` عند تعذر المسار المباشر؛ يستخدم `EscPosService.lineWidthFor` لعرض الأسطر.

### `shared/EscPosService.ts`
- **الغرض:** بناء تدفقات بايتات ESC/POS خام لطابعات الإيصالات الحرارية 80mm.
- **الأعضاء الرئيسية:**
  - `class EscPosService` — جميع الأعضاء static.
  - `encodeCp1256(text)` — ترميز Windows-1256 للعربية (ASCII-safe، والبديل `?`).
  - `pad(line, width)` / `row(left, right, width)` — محاذاة نص الإيصال.
  - `lineWidthFor(settings)` — عدد الأحرف لكل سطر حسب عرض الإيصال.
  - `writeInvoiceItems(...)` — خاصة تكتب بنود الفاتورة (اسم، كمية، إجمالي، خصم).
  - `buildReceiptBytes(invoice, settings)` — يبني التدفق الكامل: تهيئة `ESC @`، codepage (`ESC t n` من `settings.thermalCodepage`)، اسم المعرض، بنود، إجماليات، مدفوع/متبقي، نوع الدفع، تذييل، تغذية وقص جزئي `GS V` — ويعيد `Uint8Array`.
- **ملاحظات:** البايتات تُرسل عبر `print:raw` IPC إلى `winspool`/CUPS أو TCP 9100؛ لا يُصدَّر singleton — يُستخدم كـstatic فقط.

### `shared/ExportService.ts`
- **الغرض:** تفويض التصدير/الطباعة الجماعية كقدرة مستقلة عن العرض.
- **الأعضاء الرئيسية:**
  - `class ExportService` — static فقط.
  - `assertAllowed(permission, user?)` — يرمي عبر `PermissionService.require` إن لم يُسمح.
  - `canExport(permission, user?)` — يعيد `boolean` عبر `PermissionService.can`.
- **ملاحظات:** المستخدم الافتراضي `AuthService.getCurrentUser()`؛ التعليق يوضح أن الحارس يُفرض وقت التصدير لا بإخفاء الأزرار فقط.

### `shared/SystemDiagnosticsService.ts`
- **الغرض:** تشخيص صحة النظام وقاعدة البيانات: فحوصات SQLite، موارد الجهاز، النسخ الاحتياطي، وسجل نتائج.
- **الأعضاء الرئيسية:**
  - أنواع: `DiagnosticStatus` (`PASS|WARN|FAIL|NOT_RUN`)، `DiagnosticCheck`، `DiagnosticHistoryEntry`، `SystemDiagnosticsReport`، `SystemRuntimeDiagnostics` (مع `system`، `databaseFile`، `databasePersistence`، `backups`، `checks`، `history`).
  - `class SystemDiagnosticsService` — يستخدم `DatabaseManager` و`AuthService`/`PermissionService` (صلاحيات `requireHealthView`/`requireHealthManagement`).
  - `runDiagnostics()` — يشغّل الفحوصات: `sqlite_integrity`، `foreign_keys`، `core_tables`، `record_counts`، `financial_consistency`، `query_performance`، `database_size`، `system_resources`، `available_memory`، `disk_space`، `database_file`، `database_persistence`، `backup_health`؛ يحفظ السجل في `localStorage` (`HISTORY_KEY`، آخر 20).
  - `getRuntimeDiagnostics(timestamp)` — يعيد `SystemRuntimeDiagnostics` الشامل (موارد OS عبر `window.ceramisys.app.info`، ملف القاعدة، حالة الحفظ، النسخ، الفحوصات).
  - `vacuum()` / `reindex()` — صيانة قاعدة البيانات (تتطلب صلاحية إدارة).
  - خصوصيات: `measure<T>` (قياس الزمن)، `history()`/`saveHistory()`.
- **ملاحظات:** الفحص المالي يقارن `journal_entries` مع الحركات؛ سجل النتائج محفوظ في `localStorage` لا في القاعدة.

### `shared/localCacheService.ts`
- **الغرض:** ذاكرة تخزين مؤقت (cache) محلية محدودة بـLRU وانتهاء صلاحية وعلامات.
- **الأعضاء الرئيسية:**
  - `interface CacheOptions { maxEntries?, maxLifetimeMs?, maxSizeBytes?, epsilon? }`.
  - `class LocalCacheService` — singleton؛ `cache = Map<string, CacheItem>` مع `maxEntries`/`maxSizeBytes` حسب `__CERAMISYS_LEGACY_BUILD__`، `maxLifetimeMs=5min`، `epsilon=0.01`.
  - `set(key, data, lifetimeMs?)` — تخزين مع حساب الحجم التقريبي وانتهاء فردي.
  - `get(key)` — استرجاع مع إحصاء hits/misses وإنعاش LRU.
  - `getMultiple(keys, loadCallback)` — get-many مع تحميل كسول للغائب.
  - `delete(key)` / `clear()` / `expire(_force)` — حذف ومسح وإخلاء منتهي/تجاوز الحدود (LRU).
  - `getStats()` — `{ count, sizeBytes, maxEntries, maxSizeBytes, hitRate }`.
  - `resetEpsilon(epsilon?)` — ضبط هامش المقارنة.
  - `taggedSet(tag, key, data, lifetimeMs?)` / `getTagged(tag)` / `purgeByTag(tag)` — تخزين بعلاماتInvalidate جماعي.
  - `export const localCache = LocalCacheService.getInstance()` — النسخة الجاهزة.
- **ملاحظات:** يُستخدم في `index.ts` ويُقرأ `cacheSizeMB` منه في `performanceMonitor`.

### `shared/performanceMonitor.ts`
- **الغرض:** مراقبة أداء قاعدة البيانات والذاكرة مع عتبات وتنبيهات.
- **الأعضاء الرئيسية:**
  - `interface PerformanceMetrics` — `timestamp`، `dbAccessTime`، `dbSizeMB`، `cacheSizeMB`، `memoryUsageMB`، `cpuUsage`، `activeConnections`، `queriesPerSecond`، `errorRate`، `slowQueryCount`.
  - `interface Alert { severity: 'info'|'warning'|'critical', metric, value, threshold, message }`.
  - `interface PerformanceThresholds` (داخلية) — `maxDbAccessTimeMs=500`، `maxDbSizeMB=500`، `maxMemoryMB` (256 legacy / 2048)، `maxErrorRate=5`.
  - `class PerformanceMonitorService` — singleton.
  - `startMonitoring()` / `stopMonitoring()` — تشغيل/إيقاف جمع دوري عبر `setInterval`.
  - `collectMetrics()` — خاصة: تقيس زمن وصول DB (SELECT 1)، حجم القاعدة (page_count*page_size)، حجم cache الاستعلامات، الذاكرة/CPU من `process`، ومعدلات الاستعلامات من `queryStats`.
  - `checkThresholds(metrics)` — يولّد تنبيهات عند تجاوز العتبات (critical عند ≥1.2×).
  - `getMetrics(limit?)` / `getAlerts(limit?)` / `updateThresholds(...)` / `clearMetrics()` / `clearAlerts()` / `getStats()`.
  - `recordMetric` / `recordAlert` — خاصة؛ `recordAlert` يرسل `CustomEvent('performance-alert')` على window.
  - `export const performanceMonitor = PerformanceMonitorService.getInstance()`.
- **ملاحظات:** يعتمد على `DatabaseManager.getQueryCacheStats()` وإحصاءات الاستعلامات؛ يقترن بـ`systemHealthService` الذي يقرأ آخر metric.

### `shared/rendererPerformanceMonitor.ts`
- **الغرض:** مراقبة أداء مُصيّر React: مهام طويلة طويلة وتنبيهات slow render في DEV.
- **الأعضاء الرئيسية:**
  - `startRendererPerformanceMonitoring()` — ينشئ `PerformanceObserver` لـ`longtask` (عتبة 300ms) ويعيد دالة إيقاف؛ يعيد no-op إن لم يُدعَم.
  - `reportSlowReactRender: ProfilerOnRenderCallback` — ثابت جاهز لـ`<Profiler onRender>`؛ يحذّر في `import.meta.env.DEV` عند `actualDuration ≥ 250ms`.
  - حدود داخلية: `LONG_TASK_THRESHOLD_MS=300`، `SLOW_RENDER_THRESHOLD_MS=250`.
- **ملاحظات:** التسجيل عبر `console.warn` بصيغة JSON؛ مكمّل لقياس Node في `performanceMonitor`.

### `shared/systemHealthService.ts`
- **الغرض:** تجميع تقييم صحة النظام الشامل (أمان + أداء + بيانات + نسخ) بتنبيهات وتوصيات.
- **الأعضاء الرئيسية:**
  - `interface HealthScore { overall, security, performance, dataIntegrity, backupHealth }` (كلها `number|null`).
  - `interface HealthAlert { timestamp, severity, category, title, message, score, actionable }`.
  - `interface HealthMetrics` — `activeUsers`، `failedLogins`، `encryptionEvents`، `backupEvents`، `auditEvents`، `performanceAlerts`، `securityRanking`، `diskSpaceMB`، `memoryUsageMB`، `cpuUsage`، `networkAvailability`، `databaseHealth`.
  - `interface SystemHealthReport { healthScore, alerts, metrics, recommendations, timestamp }`.
  - `class SystemHealthService` — singleton؛ يعتمد على `auditLogger`، `performanceMonitor`، `securityService`، `APP_VERSION`.
  - `startHealthCheck()` / `stopHealthCheck()` — فحص دوري كل 5 دقائق + فحص أولي.
  - `runHealthCheck()` / `calculateHealthScore()` — يجمع الدرجات الفرعية ويسجلها.
  - `calculateSecurityScore` / `calculatePerformanceScore` / `calculateBackupHealthScore` — خاصة لكل بُعد.
  - `recordScore` / `generateQuestions(score)` / `recordAlert` / `getHealthScore()` / `getHealthHistory()` / `getAlerts(limit?)` — حالة وتنبيهات.
  - `generateReport()` — يعيد `SystemHealthReport` مع `metrics` المستخرجة من آخر metric ومن `auditLogger`.
  - `generateRecommendations(score)` — خاصة توصيات نصية حسب انخفاض الدرجات.
  - `getDetailedStatus()` — يعيد تفصيلًا (درجات، uptime، version، environment، memory/disk) من `window.ceramisys.app.info`.
  - `export const systemHealth = SystemHealthService.getInstance()`.
- **ملاحظات:** يحتفظ بـ`lastSafeScore` لتفادي إرجاع درجات فارغة؛ سجل `healthHistory` في الذاكرة فقط.

---

## المزامنة (`src/services/sync/`)

### `sync/outbox.ts`
- **الغرض:** قائمة انتظار (outbox) في `localStorage` لطلبات HTTP تُخزَّن عند انقطاع الاتصال بالمركز وتُصرَّف لاحقًا.
- **الأعضاء الرئيسية:**
  - `type OutboxEntry { id, method, path, body, createdAt, attempts, idempotencyKey }`.
  - `loadOutbox()` — يقرأ `ceramisys.admin.outbox.v1` من localStorage (يعيد `[]` عند الخطأ).
  - `saveOutbox(entries)` — يكتب القائمة (يتجاهل أخطاء الحصة).
  - `enqueue(entry)` — يضيف مدخلًا جديدًا بـ`id`/`createdAt`/`attempts=0` مولّدة.
  - `clearOutbox()` — يحذف المفتاح بالكامل.
- **ملاحظات:** تعليق الملف يقول "Phase 2 outbox"؛ التصريف يتم عبر sync worker في "Phase 5" عند عودة الاتصال.

---

## نقطة الدخول (`src/services/index.ts`)

### `index.ts`
- **الغرض:** مركز تجميع جزئي للخدمات الأمنية والأداء المرئية من نقطة واحدة.
- **الأعضاء الرئيسية (كلها re-exports):**
  - `auditLogger` + نوعا `AuditLog`, `SecurityEvent` من `domains/security/auditLogger`.
  - `localCache` + `CacheOptions` من `shared/localCacheService`.
  - `twoFactorAuth` + `TwoFactorSetup`, `TwoFactorConfig` من `domains/auth/twoFactorAuth`.
  - `SecurityService`, `securityService` من `domains/security/SecurityService`.
  - `performanceMonitor` + `PerformanceMetrics`, `Alert` من `shared/performanceMonitor`.
  - `systemHealth` + `HealthScore`, `HealthAlert`, `HealthMetrics`, `SystemHealthReport` من `shared/systemHealthService`.
  - `CentralLicenseService` من `domains/licensing/CentralLicenseService`.
  - `CentralTelemetryService` + `ReleaseInfo` + `getLatestNewerRelease`, `isNewerVersion` من `domains/licensing/CentralTelemetryService`.
- **ملاحظات:** barrel انتقائي — لا يعيد تصدير بقية الخدمات (domains، infrastructure، shared الأخرى، sync)؛ المستوردون يستوردون مباشرة من ملفاتهم.
