$path = "d:\ma3rad\src\services\PermissionService.ts"
$lines = Get-Content $path

$adminDataIdx = $null
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -like "*admin.data*ADMIN*") { $adminDataIdx = $i }
}

$newPerms = @()
$newPerms += "  // Electronic Invoicing"
$newPerms += "  { code: 'electronic_invoices.view', name: 'عرض الفواتير الإلكترونية', module: 'E_INVOICING' },"
$newPerms += "  { code: 'electronic_invoices.create', name: 'إنشاء فاتورة إلكترونية', module: 'E_INVOICING' },"
$newPerms += "  { code: 'electronic_invoices.submit', name: 'إرسال الفاتورة الإلكترونية للهيئة الضريبية', module: 'E_INVOICING' },"
$newPerms += "  { code: 'electronic_invoices.accept', name: 'قبول الفاتورة الإلكترونية', module: 'E_INVOICING' },"
$newPerms += "  { code: 'electronic_invoices.reject', name: 'رفض الفاتورة الإلكترونية', module: 'E_INVOICING' },"
$newPerms += "  { code: 'electronic_invoices.cancel', name: 'إلغاء الفاتورة الإلكترونية', module: 'E_INVOICING' },"
$newPerms += ""
$newPerms += "  // Loyalty Program"
$newPerms += "  { code: 'loyalty.view', name: 'عرض برنامج الولاء', module: 'LOYALTY' },"
$newPerms += "  { code: 'loyalty.earn', name: 'إضافة نقاط ولاء', module: 'LOYALTY' },"
$newPerms += "  { code: 'loyalty.redeem', name: 'استبدال نقاط ولاء', module: 'LOYALTY' },"
$newPerms += "  { code: 'loyalty.manage', name: 'إدارة مستويات الولاء', module: 'LOYALTY' },"
$newPerms += ""
$newPerms += "  // Multi-Branch"
$newPerms += "  { code: 'branches.view', name: 'عرض الفروع', module: 'BRANCHES' },"
$newPerms += "  { code: 'branches.create', name: 'إضافة فرع', module: 'BRANCHES' },"
$newPerms += "  { code: 'branches.update', name: 'تعديل فرع', module: 'BRANCHES' },"
$newPerms += "  { code: 'branches.delete', name: 'حذف فرع', module: 'BRANCHES' },"
$newPerms += "  { code: 'branches.manage_users', name: 'إدارة مستخدمي الفرع', module: 'BRANCHES' },"
$newPerms += ""
$newPerms += "  // Analytics"
$newPerms += "  { code: 'analytics.view', name: 'عرض التحليلات المتقدمة', module: 'ANALYTICS' },"
$newPerms += "  { code: 'analytics.write', name: 'تسجيل مقاييس التحليلات', module: 'ANALYTICS' }"

$out = @()
for ($i = 0; $i -le $adminDataIdx; $i++) { $out += $lines[$i] }
$out += $newPerms
$out += "];"

$out | Set-Content $path -Encoding utf8
Write-Host "Done. Admin data idx: $adminDataIdx, New lines: $($out.Count)"
