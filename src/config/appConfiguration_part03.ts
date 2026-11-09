export const APP_CONFIG_POLICY_CATALOG: Array<{
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean';
  fallback: string;
  description: string;
}> = [
  {
    key: 'sales.discountApprovalThreshold',
    label: 'حد الموافقة على الخصم (%)',
    type: 'number',
    fallback: '',
    description: 'الخصومات التي تتجاوز هذه النسبة تتطلب موافقة. اتركه فارغًا لاستخدام إعدادات النظام.',
  },
  {
    key: 'pricing.requirePriceChangeApproval',
    label: 'اعتماد تغيير الأسعار',
    type: 'boolean',
    fallback: '',
    description: 'يتجاوز إعداد «طلب موافقة على تغيير الأسعار» العام.',
  },
  {
    key: 'inventory.requireStockAdjustmentApproval',
    label: 'اعتماد تسويات المخزون',
    type: 'boolean',
    fallback: '',
    description: 'يتجاوز إعداد «طلب موافقة على تسويات المخزون» العام.',
  },
  {
    key: 'security.sessionTimeoutMinutes',
    label: 'مهلة الخمول بالدقائق',
    type: 'number',
    fallback: '',
    description: 'تسجيل خروج تلقائي بعد هذه المدة بلا نشاط. اتركه فارغًا لاستخدام إعدادات النظام.',
  },
  {
    key: 'inventory.lowStockThreshold',
    label: 'حد التنبيه للمخزون المنخفض',
    type: 'number',
    fallback: '',
    description: 'يتجاوز حد التنبيه العام للمخزون.',
  },
  {
    key: 'sales.defaultDeliveryFee',
    label: 'رسوم التوصيل الافتراضية',
    type: 'number',
    fallback: '',
    description: 'رسوم التوصيل المقترحة في الفواتير الجديدة.',
  },
];

export const APP_CONFIG_NUMBERING_CATALOG: Array<{ key: string; label: string }> = [
  { key: 'INV', label: 'فواتير البيع' },
  { key: 'PUR', label: 'فواتير الشراء' },
  { key: 'QUO', label: 'عروض الأسعار' },
  { key: 'SO', label: 'أوامر البيع' },
  { key: 'PO', label: 'أوامر الشراء' },
  { key: 'RET', label: 'مرتجعات البيع' },
  { key: 'PRET', label: 'مرتجعات الشراء' },
  { key: 'REC', label: 'سندات الاستلام' },
  { key: 'PAY', label: 'سندات الصرف' },
  { key: 'TX', label: 'الحركات المخزنية' },
  { key: 'JRN', label: 'القيود اليومية' },
  { key: 'CNT', label: 'الجرد' },
];
