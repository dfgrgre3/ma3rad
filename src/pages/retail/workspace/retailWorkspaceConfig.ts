/**
 * Per-activity content for the retail workspace page (`/retail`).
 *
 * Every retail activity without a dedicated vertical page shares this single
 * route, but each activity gets its own title, description, focus panel and
 * quick links — resolved from the effective business type at runtime.
 */

export type RetailWorkspacePanel = 'expiry' | 'warranty' | 'orders' | 'stock';

export interface RetailWorkspaceLink {
  label: string;
  to: string;
}

export interface RetailWorkspaceConfig {
  title: string;
  description: string;
  panel: RetailWorkspacePanel;
  links: RetailWorkspaceLink[];
}

const baseLinks = (extra: RetailWorkspaceLink[] = []): RetailWorkspaceLink[] => [
  { label: 'نقطة البيع', to: '/pos' },
  { label: 'المنتجات', to: '/products' },
  { label: 'مركز المخزون', to: '/inventory/hub' },
  { label: 'عروض الأسعار', to: '/quotations' },
  { label: 'الطلبات', to: '/orders' },
  ...extra,
];

export const RETAIL_WORKSPACE_CONFIG: Record<string, RetailWorkspaceConfig> = {
  sanitary: {
    title: 'مساحة الأدوات الصحية',
    description: 'أرصدة المعرض، الأصناف والمقاسات، وعروض الأسعار لأدوات السباكة والصحية.',
    panel: 'stock',
    links: baseLinks([{ label: 'خدمة ما بعد البيع', to: '/sales/after-sales' }]),
  },
  furniture: {
    title: 'مساحة الأثاث والمفروشات',
    description: 'التشكيلات والمقاسات، أرصدة المعرض والمخزن، ومواعيد توريد المشاريع.',
    panel: 'stock',
    links: baseLinks([{ label: 'المشاريع', to: '/projects' }]),
  },
  home_appliances: {
    title: 'مساحة الأجهزة الكهربائية',
    description: 'الأجهزة والإكسسوارات، الضمانات، وأوامر التوريد للمشاريع.',
    panel: 'warranty',
    links: baseLinks([{ label: 'خدمة ما بعد البيع والضمان', to: '/sales/after-sales' }]),
  },
  electronics: {
    title: 'مساحة الإلكترونيات والموبايلات',
    description: 'الأجهزة والملحقات، الأرقام التسلسلية والضمان، وعروض الأسعار.',
    panel: 'warranty',
    links: baseLinks([{ label: 'خدمة ما بعد البيع والضمان', to: '/sales/after-sales' }]),
  },
  clothing: {
    title: 'مساحة الملابس والأحذية',
    description: 'المقاسات والمواسم، أرصدة الفروع، والمرتجعات والاستبدال.',
    panel: 'stock',
    links: baseLinks([{ label: 'المرتجعات', to: '/returns' }]),
  },
  food: {
    title: 'مساحة السوبر ماركت والبقالة',
    description: 'الأصناف والباركود، الصلاحية والتشغيلات، وأوزان الميزان.',
    panel: 'expiry',
    links: baseLinks([{ label: 'الصلاحية والدفعات', to: '/inventory/expiry' }]),
  },
  cosmetics: {
    title: 'مساحة العطور ومستحضرات التجميل',
    description: 'الأصناف والتشغيلات، تواريخ الصلاحية، وعروض الأسعار.',
    panel: 'expiry',
    links: baseLinks([{ label: 'الصلاحية والدفعات', to: '/inventory/expiry' }]),
  },
  automotive: {
    title: 'مساحة قطع غيار السيارات',
    description: 'القطع والماركات، توافق العربيات، وأوامر التوريد للمحلات.',
    panel: 'stock',
    links: baseLinks([{ label: 'العملاء والسيارات', to: '/customers' }]),
  },
  building_materials: {
    title: 'مساحة مواد البناء',
    description: 'الخامات والألواح، أوضاع التسعير للمشاريع، وأوامر التوريد.',
    panel: 'stock',
    links: baseLinks([{ label: 'المشاريع', to: '/projects' }]),
  },
  lighting: {
    title: 'مساحة الإضاءة والكهرباء',
    description: 'منتجات الإضاءة والكهرباء، عروض المشاريع، وأوامر التوريد.',
    panel: 'stock',
    links: baseLinks([{ label: 'المشاريع', to: '/projects' }]),
  },
  ecommerce: {
    title: 'مساحة المتجر الإلكتروني',
    description: 'طلبات المتجر، الشحن والتتبع، وأرصدة المستودع.',
    panel: 'orders',
    links: baseLinks([{ label: 'التوصيل والأسطول', to: '/fleet/dashboard' }]),
  },
  general: {
    title: 'مساحة نشاط التجزئة',
    description: 'نظرة عامة على المبيعات والمخزون والطلبات لنشاط التجزئة.',
    panel: 'stock',
    links: baseLinks(),
  },
};

export function getRetailWorkspaceConfig(businessType: string): RetailWorkspaceConfig {
  return RETAIL_WORKSPACE_CONFIG[businessType] || RETAIL_WORKSPACE_CONFIG.general;
}
