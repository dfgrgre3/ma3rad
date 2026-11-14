# خطة: إدارة العملاء (Tenants) — central-admin

## الهدف
تطوير صفحة إدارة العملاء في `central-admin` لتصبح مركزية، مع بحث/فلاتر/تقسيم صفحات، ملف تفصيلي، وإجراءات جماعية، وتبويب تحكم عن بعد.

## 1. تحليل الوضع (Discover)
- [ ] تحديد routes/components/services الحالية (grep `tenant` in central-admin/src).
- [ ] فحص `platform_tenant_accounts`, `platform_tenant_users`.
- [ ] فحص AuthService وربط الحسابات.
- [ ] فحص data-demo fixtures.

## 2. المراحل (Phases)
### Phase 1 — Foundation (قائمة + بحث + فلاتر + pagination)
- Component: `TenantsListPage`
- API: `GET /tenants?q=&status=&plan=&page=&limit=`
- Export CSV (موجود — توحيد).

### Phase 2 — ملف تفصيلي (Detail tabs)
- Tabs: Company/Contract/Contacts, Owners/Admins/Users/Permissions, Branches/Devices/Versions, Plan/Subscription/Limits/Usage, Invoices/Payments/Licenses, Audit/Communications/Support, Last connection/Sync status.
- Route: `/tenants/:id`

### Phase 3 — إجراءات (Actions)
- suspend/reactivate/extend/terminate
- change plan, renew/cancel subscription
- limits/overrides, users, reset devices, activation data
- bulk actions: change plan, send alert, suspend group

### Phase 4 — التكامل (Integration)
- platform_tenant_accounts ↔ AuthService
- platform_tenant_users → ERP login accounts
- activation channels EMAIL/SMS real send
- central publish documented (status/plan changes to tenant instance)
- customer portal link

### Phase 5 — Remote Control tab
- عرض التكوين المطبق
- إرسال إعدادات جديدة
- نتيجة تطبيقها

### Phase 6 — Import/Export + audit log
- Import tenants with audit log

## 3. Deliverables
- Migration notes for accounts/users integration.
- API contract doc.
- UI components.

## 4. Risks
- Breaking auth integration; needs AuthService contract.
- Data migration for existing tenants.

## 5. Next Steps (طلب تأكيد)
- أبدأ Phase 1 (قائمة) أم Phase 4 (تكامل)؟
