# ARCHITECTURE.md — المعمارية الفنية لنظام إدارة معرض سيراميك ومواد تشطيب

## 1. نظرة عامة على النظام (System Overview)
نظام متكامل لإدارة معارض ومحلات السيراميك والبورسلين والرخام ومواد البناء والتشطيبات والأدوات الصحية، مصمم ليعمل كـ Desktop Application محلي Offline-First عالي الأداء مع موثوقية كاملة للبيانات والعمليات الحسابية والمالية.

---

## 2. طبقات النظام (System Layers)

```
┌─────────────────────────────────────────────────────────────┐
│                    Presentation Layer                       │
│  - React 18/19 SPA with RTL-first Design System             │
│  - POS Interface with Barcode Scanner & Rapid Key Bindings  │
│  - Real-time Visual Dashboards, Reports & Print Layouts     │
└──────────────────────────────┬──────────────────────────────┘
                               │ IPC / Context API / State
┌──────────────────────────────▼──────────────────────────────┐
│                    Application / Service Layer              │
│  - SalesService & Pricing Engine (Tiling Math & Conversion) │
│  - PurchaseService & Inventory Valuation (Average Cost/FIFO)│
│  - InventoryService & Stock Transfers & Batch Management    │
│  - CashierService, Shifts & Treasury Management             │
│  - AccountingService & Financial Ledger Balancing           │
│  - ReportingEngine (P&L, COGS, Stock Valuation, Analytics)  │
│  - Security, Role-Based Access Control (RBAC) & AuditLogs   │
│  - BackupService (Automated/Manual SQLite Snapshots)        │
└──────────────────────────────┬──────────────────────────────┘
                               │ High-Performance Database Driver
┌──────────────────────────────▼──────────────────────────────┐
│                    Database / Storage Layer                 │
│  - SQLite 3 (WAL Mode, PRAGMA foreign_keys = ON)            │
│  - Strict Schema Constraints & Triggers for Audit Trail     │
│  - Indexed Multi-Column Queries for Fast Search             │
│  - Atomic ACID Multi-Table Database Transactions            │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. محرك رياضيات وتحويلات السيراميك (Ceramic Mathematical Engine)

### أ. معاملات التحويل:
* **وحدة البيع بالمتر المربع ($m^2$):** مساحة البلاطة $\times$ عدد القطع بالكرتونة = إجمالي مساحة الكرتونة.
* **البيع بالمتر المربع:** $\text{الكراتين المطلوبة} = \lceil \frac{\text{المتر المطلوب}}{\text{مساحة الكرتونة}} \rceil$ أو كسر كرتونة حسب سياسة المعرض.
* **إجمالي السعر:** $\text{الكمية بالمتر} \times \text{سعر المتر}$ أو $\text{الكمية بالكرتونة} \times \text{سعر الكرتونة}$.
* **تتبع الفرز:** تخزين كل صنف بفرزه المستقل (فرز أول، فرز ثاني، فرز ثالث، تجاري) مع باركود وتسعير منفصل لضمان عدم خلط الفروز في المخزون.

---

## 4. نموذج البيانات (Data Schema & Entities)

1. **الأصناف والمخزون:**
   * `products`: اسم المنتج، كود المنتج، الباركود، التصنيف، الماركة/المصنع، المقاس، السمك، الفرز، الموديل، اللون، التشطيب، عدد القطع بالكرتونة، عدد الأمتار بالكرتونة، الوزن، سعر الشراء، سعر البيع للمتر، سعر البيع للكرتونة، سعر الجملة، الحد الأدنى للمخزون.
   * `warehouses`: المخازن والمعارض، الموقع، الحالة.
   * `warehouse_stock`: رصيد كل منتج في كل مخزن (كمية بالمتر + عدد كراتين وقطع).
   * `inventory_transactions`: سجل حركات المخزون غير القابل للتعديل (شراء، بيع، مرتجع شراء، مرتجع بيع، تحويل بين مخازن، تسوية جرد، تالف، هالك، رصيد افتتاحي).
   * `stock_transfers` & `stock_transfer_items`: عمليات التحويل بين المخازن.
   * `inventory_counts` & `inventory_count_items`: سجلات الجرد والتسويات.

2. **المبيعات وعروض الأسعار والعملاء:**
   * `customers`: العملاء، الهاتف، العنوان، الرقم القومي، الحد الائتماني، الرصيد الحالي.
   * `sales_invoices`: فواتير المبيعات (رقم الفاتورة، التاريخ، العميل، نوع البيع: نقدي/آجل/مختلط، المخزن، إجمالي الفاتورة، الخصم، الضريبة، المدفوع، المتبقي، حالة الدفع، المستخدم).
   * `sales_invoice_items`: بنود الفاتورة (المنتج، الفرز، الوحدة: متر/كرتونة/قطعة، الكمية بالمتر، عدد الكراتين، سعر الوحدة، التكلفة التاريخية، الخصم، الإجمالي، صافي الربح).
   * `sales_returns` & `sales_return_items`: مرتجعات المبيعات مع عكس المخزون وحساب العميل والأرباح.
   * `quotations` & `quotation_items`: عروض الأسعار القابلة للتحويل المباشر إلى فواتير مبيعات.

3. **المشتريات والموردون:**
   * `suppliers`: الموردون، الشركات المصنعة، الهاتف، العنوان، الرصيد، شروط الدفع.
   * `purchase_invoices` & `purchase_invoice_items`: فواتير الشراء، تكلفة التوريد، التحديث الآلي لمتوسط التكلفة والمخزون.
   * `purchase_returns` & `purchase_return_items`: مرتجعات الموردين وتخفيض المخزون والمديونية.

4. **الخزينة والحسابات والورديات:**
   * `cash_registers`: الخزائن النقدية ونقاط الدفع.
   * `cash_shifts`: ورديات الكاشير (المستخدم، وقت الفتح، وقت الإغلاق، الرصيد الافتتاحي، المبيعات النقدية، المصروفات، المقبوضات، رصيد الإغلاق المتوقع، الفعلي، العجز/الزيادة).
   * `cash_transactions`: حركات الخزينة وسندات القبض والصرف.
   * `expenses` & `expense_categories`: المصروفات الإدارية والتشغيلية (إيجار، كهرباء، نقل، مشال، رواتب، صيانة).

5. **الأمان والتدقيق والإعدادات:**
   * `users`, `roles`, `permissions`, `user_permissions`: التحكم الدقيق في الصلاحيات.
   * `audit_logs`: سجل الأحداث والعمليات الحساسة (تعديل أسعار، خصومات كبيرة، تسويات مخزون، إلغاء عمليات).
   * `system_settings`: اسم المعرض، الشعار، العنوان، الهاتف، الرقم الضريبي، العملة، شروط الفاتورة، إعدادات الطباعة.
   * `backup_history`: سجل النسخ الاحتياطية ومساراتها وحجمها وحالتها.

---

## 5. قواعد الأمان وسلامة البيانات (Data Integrity & Safety)

1. **العمليات الذرية (Atomic Transactions):** كل عملية بيع أو شراء أو تحويل أو ترجيع تنفذ كـ Unit of Work واحدة داخل SQLite Transaction.
2. **منع الأرقام العائمة للأموال (Fixed Currency Math):** تخزين وحساب الأموال بدقة سنت/قرش لتفادي خطأ الـ IEEE 754 float precision.
3. **منع الحذف المباشر (No Hard Delete for Financial Entities):** الفواتير والمدفوعات لا تحذف بل تلغى بحركة عكسية مع توثيق في سجل التدقيق.
4. **حظر المخزون السالب (Negative Stock Prevention):** رفض أي حركة بيع أو صرف تتجاوز الرصيد الفعلي المتاح بالمخزن المحدد إلا إذا تم تفعيل إذن استثنائي بصلاحية مدير.
