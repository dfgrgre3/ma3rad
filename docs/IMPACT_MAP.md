# IMPACT_MAP — خريطة تأثير العمليات (Phase 2 seed)

أساس مولّد من تدقيق الكود (راجع `docs/GAP_ANALYSIS.md` §5). سيُعتمد لاحقًا كملف بيانات `src/config/impactRegistry.ts` في Phase 2.

## المبادئ

1. كل عملية أساسية تُصنَّف تأثيراتها الموجودة حاليًا (inline داخل `executeTransaction`) والمفقودة.
2. **المستندات التاريخية لا تُعاد كتابتها أبدًا** — أي تغيير إعداد (ضريبة، تكلفة، وحدات) يؤثر على العمليات الجديدة فقط + التقارير ذات الصلة.
3. الحالة: ✅ موجود ومختبَر · ⚠️ موجود لكن هشّ · ❌ مفقود.

## العمليات

### 1. إضافة منتج
| الجزء المتأثر | الوضع الحالي | الدليل |
|---|---|---|
| المخزون (رصيد افتتاحي/صنف) | ⚠️ تُنشأ عند أول شراء فقط | لا يوجد سطر مخزون عند الإنشاء |
| POS | ✅ متاح فور الحفظ (يقرأ المنتجات النشطة + PricingService) | `usePosCart` |
| المشتريات | ✅ متاح في فواتير الشراء | `PurchaseService.createPurchase` |
| التقارير | ✅ يدخل تلقائيًا | تقارير المخزون/المنتجات |
| التسعير | ✅ قوائم الأسعار/الدرجات | `PricingService`, `sellingPriceTiersCount` |
| الباركود | ⚠️ توليد/ربط يدوي؛ لا يتولّد تلقائيًا | ProductsView |

### 2. تعديل سعر منتج
| الجزء | الوضع | الدليل |
|---|---|---|
| POS (السعر الحالي) | ✅ يُقرأ لحظة البيع | `getEffectivePrice` |
| قوائم الأسعار/العروض | ⚠️ تحديث يدوي منفصل | `PricingService` بلا backfill |
| عروض الأسعار القائمة | ❌ تبقى بالأسعار القديمة (سلوك مقبول — مستند تاريخي) | — |
| التقارير | ✅ التقارير تعتمد سعر البيع وقت الفاتورة | `sales_invoice_items` |

### 3. بيع منتج (فاتورة مبيعات)
| الجزء | الوضع | الدليل |
|---|---|---|
| المخزون (خصم + FIFO + دفعات + حركة) | ✅ داخل المعاملة | `invoiceCreation.ts` |
| العميل (balance + total_purchases) | ✅ | `updateCustomerAndCash` |
| الكاشير/الوردية (cash_registers + cash_shifts) | ✅ (أُصلح عكسها عند void) | `invoiceCreation.ts` / `invoiceVoid.ts` |
| الحسابات (قيد مزدوج) | ✅ عبر `postLedgerEntry` (بـunique قيد DB جديد 104) | `invoiceCreation.ts` |
| الضرائب | ✅ داخل القيد ككيان داخل المعاملة (لا أثر على فواتير قديمة) | `tax_amount` |
| العمولات | ⚠️ تُحسب عند الطلب شهريًا لا عند البيع (بالإعداد) | `CommissionService` |
| المزامنة (Outbox) | ✅ capture داخل المعاملة | `BusinessRecordSyncService` |
| التدقيق | ⚠️ مساران (INSERT داخل المعاملة + `AuditService.log` صامت بعد COMMIT) | موحّد في Phase 5 |

### 4. مرتجع مبيعات / استبدال (exchangeSale)
| الجزء | الوضع | الدليل |
|---|---|---|
| استرجاع مخزون + FIFO + دفعات | ✅ داخل المعاملة | `returns.ts` |
| عكس العميل/الكاشير/الوردية | ✅ (الكاشير عبر `registerId || 'cr_main'` — قابل للتحسين ليحل كاشير البيع الأصلي) | `returns.ts:439` |
| القيد | ✅ `SALES_RETURN` | `returns.ts` |
| الاستبدال (exchangeSale) | ❌ **معاملتان مستقلتان** — فشل الثانية يترك مرتجعًا مُرحّلًا | `SalesService.exchangeSale` |
| Idempotency من الواجهة | ✅ **أُصلح في Phase 0** (returnSale/PurchaseReturn الآن يمرران مفتاح) | `ReturnsPage.tsx` |

### 5. شراء منتج (فاتورة توريد)
| الجزء | الوضع | الدليل |
|---|---|---|
| المخزون (إضافة + تكلفة متوسطة + FIFO) | ✅ داخل المعاملة | `PurchaseService.createPurchase` |
| المورد (balance + total_purchases) | ✅ | نفس المعاملة |
| الكاشير (إن نقدي) | ✅ على `branchRegisterId` | `PurchaseService` |
| الحسابات (قيد `PURCHASE_INVOICE`) | ✅ | `PurchaseService` |
| طلبية العميل (تخصيص وارد) | ✅ داخل نفس المعاملة | `CustomerSupplyService.allocateReceivedQuantity` |
| رقم الإيصال `receipt_number` | ✅ **أُصلح في Phase 0** (`nextNumber('PAY')`) | `PurchaseService`, `SupplierService` |

### 6. تحصيل من عميل / سداد مورد
| الجزء | الوضع | الدليل |
|---|---|---|
| رصيد العميل/المورد + الفاتورة + الحالة | ✅ | `sales/payments.ts`, `SupplierService` |
| الكاشير/الوردية | ✅ + عكس عند الحذف/التعطيل | نفس الملفات |
| القيد (`CUSTOMER_PAYMENT`/`SUPPLIER_PAYMENT`) | ✅ idempotent برمجيًا + **DB قيد جديد (104/110)** | `ledger.ts`, `migrations.ts`, `part14.ts` |
| Idempotency من الواجهة | ✅ **أُصلح في Phase 0** (الـ6 مسارات + PaymentModals) | راجع PHASE0_REPORT |

### 7. تسجيل مصروف
| الجزء | الوضع | الدليل |
|---|---|---|
| الكاشير + الوردية (`total_expenses`) | ✅ | `CashierService.addExpense` |
| الحسابات (`EXPENSE`) | ✅ | نفس المعاملة |
| الأرباح/قائمة الدخل | ✅ عبر القيد | `ledger.ts` |
| المزامنة (Outbox) | ❌ المصروف غير ضمن كيانات sync | `CashierService` |

### 8. تحويل مخزني (TRANSFER)
| الجزء | الوضع | الدليل |
|---|---|---|
| المستودع المصدر/الوجهة + حركة | ✅ لكل خطوة (REQUESTED→…→RECEIVED) معاملات مستقلة (سير عمل مقصود) | `InventoryServicePart08–13` |
| الفقد أثناء النقل (`TRANSFER_LOSS`) | ⚠️ قيد مالي (5201/1104) **بلا حركة `inventory_transactions` للكمية المفقودة** | `InventoryServicePart10.ts:199` |
| لا يلمس كاشير/عملاء | ✅ بطبيعته | — |

### 9. إلغاء فاتورة (void)
| الجزء | الوضع | الدليل |
|---|---|---|
| استرجاع مخزون + FIFO + دفعات | ✅ | `invoiceVoid.ts` |
| عكس العميل | ✅ | نفس الملف |
| عكس الكاشير | ✅ **أُصلح في Phase 0** (الكاشير الأصلي بدل `is_default`) | `invoiceVoid.ts` |
| عكس الوردية | ✅ **أُصلح في Phase 0** (`total_sales_*` تُطرح مع MAX(0)) | `invoiceVoid.ts` |
| القيد (`SALES_VOID`) | ✅ | `invoiceVoid.ts` |
| قيد DB لمنع تكرار القيد | ✅ جديد (104) | `migrations.ts` |

### 10. تغيير صلاحية مستخدم
| الجزء | الوضع | الدليل |
|---|---|---|
| القوائم الصادرة | ✅ `NavigationService` يقرأ الصلاحيات عند كل render | `NavigationService.ts:146-244` |
| الصفحات (RouteGuard) | ✅ بنيويًا (لكن `OPEN_ALL_PAGES=true` يلغيه محليًا) | `RouteGuard.tsx:44-46` |
| العمليات (الخدمات) | ✅ `PermissionService.require` دائمًا | ~كل الخدمات |
| الفرض على مستوى IPC | ✅ `validateIpcSender` | `electron/security/*` |

### 11. تغيير إعداد ضريبي / تكلفة / إعداد محاسبي
| الجزء | الوضع | الدليل |
|---|---|---|
| الفواتير الجديدة فقط | ✅ التصميم يعتمد على الإعداد لحظة المعاملة | `SettingsService` + services |
| المستندات التاريخية | ✅ لا تُعاد كتابتها (صحيح) | — |
| التقارير الضريبية/المالية ذات الصلة | ⚠️ تُحسب من المستندات مباشرة (لا إعادة حساب) — مقبول | `TaxReportPage` |
| الفترات المقيدة | ✅ `postLedgerEntry` يرفض الترحيل داخل فترة مغلقة | `ledger.ts` |

## التالي (Phase 2)

- اعتماد `impactRegistry.ts` (هذا الملف بصيغة بيانات) + اختبار يفرض: كل عملية في السجل لها اختبار مرحلة (lifecycle test) أو وسوم `UNVERIFIED` صريحة.
- نقل المنطق المكرر (كتل خصم المخزون/الكاشير/القيد) إلى `src/services/effects/*` (Phase 5) مع `domain_events`.
