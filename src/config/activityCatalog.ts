export interface ActivityFamilyDefinition {
  id: string;
  label: string;
  labelEn: string;
  defaultProfileId: string;
}

export interface ActivityDefinition {
  id: string;
  label: string;
  familyId: string;
  profileId: string;
}

export const BUSINESS_ACTIVITY_FAMILIES: ActivityFamilyDefinition[] = [
  { id: 'retail', label: 'التجارة والمعارض', labelEn: 'Retail and trade', defaultProfileId: 'general' },
  { id: 'distribution', label: 'التوزيع والاستيراد والتوريدات', labelEn: 'Distribution and supply', defaultProfileId: 'import_export' },
  { id: 'manufacturing', label: 'التصنيع والإنتاج', labelEn: 'Manufacturing and production', defaultProfileId: 'manufacturing' },
  { id: 'construction', label: 'المقاولات والعقارات والمشروعات', labelEn: 'Construction and real estate', defaultProfileId: 'construction' },
  { id: 'transport', label: 'السيارات والنقل واللوجستيات', labelEn: 'Automotive and logistics', defaultProfileId: 'logistics' },
  { id: 'hospitality', label: 'المطاعم والضيافة', labelEn: 'Food and hospitality', defaultProfileId: 'hospitality' },
  { id: 'healthcare', label: 'الصحة والطب', labelEn: 'Healthcare', defaultProfileId: 'healthcare_admin' },
  { id: 'education', label: 'التعليم والتدريب', labelEn: 'Education and training', defaultProfileId: 'education' },
  { id: 'professional_services', label: 'الخدمات المهنية والإدارية', labelEn: 'Professional services', defaultProfileId: 'professional_services' },
];

type ActivityRow = readonly [id: string, label: string, profileId?: string];

// One selectable activity per business profile. Activities that shared the same
// profile produced identical configuration, so only the canonical entry remains.
const ACTIVITY_ROWS: Record<string, ActivityRow[]> = {
  retail: [
    ['ceramics', 'معرض سيراميك وبورسلين', 'ceramics'],
    ['sanitary', 'معرض أدوات صحية', 'sanitary'],
    ['furniture', 'معرض أثاث ومفروشات', 'furniture'],
    ['home_appliances', 'معرض أجهزة كهربائية', 'home_appliances'],
    ['electronics', 'معرض موبايلات وإلكترونيات', 'electronics'],
    ['clothing', 'محلات الملابس والأحذية', 'clothing'],
    ['food', 'محلات السوبر ماركت والبقالة', 'food'],
    ['cosmetics', 'محلات العطور ومستحضرات التجميل', 'cosmetics'],
    ['automotive', 'محلات قطع غيار السيارات', 'automotive'],
    ['building_materials', 'محلات مواد البناء', 'building_materials'],
    ['lighting', 'محلات الإضاءة والكهرباء', 'lighting'],
    ['ecommerce', 'متاجر التجارة الإلكترونية', 'ecommerce'],
    ['general', 'تجارة التجزئة العامة', 'general'],
  ],
  distribution: [
    ['import_export', 'تجارة واستيراد وتصدير', 'import_export'],
    ['logistics', 'مراكز توزيع ومستودعات', 'logistics'],
  ],
  manufacturing: [
    ['manufacturing', 'التصنيع والإنتاج', 'manufacturing'],
  ],
  construction: [
    ['construction', 'شركات المقاولات', 'construction'],
  ],
  transport: [
    ['workshop', 'مراكز صيانة السيارات', 'workshop'],
  ],
  hospitality: [
    ['hospitality', 'فنادق ومنتجعات', 'hospitality'],
    ['restaurant', 'مطاعم وكافيهات', 'restaurant'],
  ],
  healthcare: [
    ['healthcare_admin', 'الإدارة الصحية', 'healthcare_admin'],
  ],
  education: [
    ['education', 'التعليم والتدريب', 'education'],
  ],
  professional_services: [
    ['professional_services', 'مكاتب المحاسبة والمراجعة', 'professional_services'],
    ['services', 'شركة خدمات أو صيانة', 'services'],
    ['custom', 'نشاط آخر مخصص', 'custom'],
  ],
};

const FAMILY_BY_ID = new Map(BUSINESS_ACTIVITY_FAMILIES.map((family) => [family.id, family]));

export function getActivityFamily(id: string): ActivityFamilyDefinition | undefined {
  return FAMILY_BY_ID.get(id);
}

export function getActivityRows(): ActivityDefinition[] {
  return BUSINESS_ACTIVITY_FAMILIES.flatMap((family) =>
    (ACTIVITY_ROWS[family.id] || []).map(([id, label, profileId]) => ({
      id,
      label,
      familyId: family.id,
      profileId: profileId || family.defaultProfileId,
    }))
  );
}
