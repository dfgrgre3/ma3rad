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
  { id: 'beauty_sports', label: 'الجمال والرياضة', labelEn: 'Beauty and sports', defaultProfileId: 'services' },
  { id: 'tourism_events', label: 'السياحة والترفيه والفعاليات', labelEn: 'Tourism and events', defaultProfileId: 'hospitality' },
  { id: 'finance', label: 'الأنشطة المالية', labelEn: 'Financial activities', defaultProfileId: 'professional_services' },
  { id: 'nonprofit', label: 'الجمعيات والمؤسسات غير الربحية', labelEn: 'Nonprofit organizations', defaultProfileId: 'general' },
  { id: 'agriculture', label: 'الزراعة والأنشطة المرتبطة بها', labelEn: 'Agriculture', defaultProfileId: 'manufacturing' },
];

type ActivityRow = readonly [id: string, label: string, profileId?: string];

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
    ['household_goods', 'محلات الأدوات المنزلية'],
    ['building_materials', 'محلات مواد البناء', 'building_materials'],
    ['jewelry', 'محلات الذهب والمجوهرات'],
    ['optical_shop', 'محلات النظارات'],
    ['books_stationery', 'محلات الكتب والأدوات المكتبية'],
    ['gifts_toys', 'محلات الهدايا والألعاب'],
    ['department_store', 'متاجر متعددة الأقسام'],
    ['general', 'تجارة التجزئة العامة'],
    ['general_wholesale', 'تجارة الجملة العامة'],
    ['lighting', 'محلات الإضاءة والكهرباء', 'lighting'],
    ['ecommerce', 'متاجر التجارة الإلكترونية', 'ecommerce'],
  ],
  distribution: [
    ['food_distribution', 'توزيع المواد الغذائية', 'food'],
    ['medical_distribution', 'توزيع الأدوية والمستلزمات الطبية', 'healthcare_admin'],
    ['building_materials_distribution', 'توزيع مواد البناء', 'building_materials'],
    ['ceramics_distribution', 'توزيع السيراميك والبورسلين', 'ceramics'],
    ['appliance_distribution', 'توزيع الأجهزة الكهربائية', 'home_appliances'],
    ['textile_distribution', 'توزيع الملابس والمنسوجات', 'clothing'],
    ['auto_parts_distribution', 'توزيع قطع الغيار', 'automotive'],
    ['import_export', 'تجارة واستيراد وتصدير'],
    ['commercial_agency', 'وكالات تجارية'],
    ['logistics', 'مراكز توزيع ومستودعات', 'logistics'],
    ['supplies_company', 'شركات توريدات'],
  ],
  manufacturing: [
    ['ceramics_factory', 'مصانع السيراميك والبورسلين', 'ceramics'],
    ['furniture_factory', 'مصانع الأثاث', 'furniture'],
    ['textile_factory', 'مصانع الملابس والمنسوجات', 'clothing'],
    ['food_factory', 'مصانع الأغذية والمشروبات', 'food'],
    ['plastics_factory', 'مصانع البلاستيك'],
    ['metal_factory', 'مصانع المعادن'],
    ['building_materials_factory', 'مصانع مواد البناء', 'building_materials'],
    ['chemicals_factory', 'مصانع الكيماويات'],
    ['paper_packaging_factory', 'مصانع الورق والتعبئة والتغليف'],
    ['appliance_factory', 'مصانع الأجهزة الكهربائية', 'home_appliances'],
    ['made_to_order_factory', 'تصنيع حسب الطلب'],
    ['animal_feed_factory', 'مصانع الأعلاف'],
    ['agriculture_production_factory', 'شركات الإنتاج والتعبئة الزراعية'],
  ],
  construction: [
    ['construction', 'شركات المقاولات'],
    ['finishing_decor', 'مكاتب التشطيبات والديكور'],
    ['real_estate_developer', 'شركات التطوير العقاري'],
    ['real_estate_marketing', 'مكاتب التسويق العقاري'],
    ['property_management', 'إدارة الأملاك والعقارات'],
    ['property_rental', 'تأجير الوحدات والمحلات'],
    ['maintenance_operations', 'شركات الصيانة والتشغيل'],
    ['engineering_consultancy', 'مكاتب الهندسة والاستشارات'],
    ['construction_project_management', 'إدارة المشروعات الإنشائية'],
    ['land_real_estate', 'تجارة الأراضي والعقارات'],
  ],
  transport: [
    ['auto_showroom', 'معارض السيارات', 'automotive'],
    ['used_cars', 'تجارة السيارات المستعملة', 'automotive'],
    ['workshop', 'مراكز صيانة السيارات', 'workshop'],
    ['oil_tire_center', 'مراكز تغيير الزيوت والإطارات', 'automotive'],
    ['auto_parts_shop', 'تجارة قطع غيار السيارات', 'automotive'],
    ['car_wash', 'مغاسل السيارات', 'services'],
    ['transport_shipping', 'شركات النقل والشحن'],
    ['delivery_company', 'شركات التوصيل'],
    ['fleet_management', 'إدارة أساطيل المركبات', 'automotive'],
    ['car_rental', 'تأجير السيارات', 'automotive'],
    ['customs_clearance', 'مكاتب التخليص الجمركي', 'import_export'],
  ],
  hospitality: [
    ['restaurant', 'مطاعم', 'restaurant'],
    ['cafe', 'كافيهات ومقاهٍ', 'restaurant'],
    ['fast_food', 'مطاعم الوجبات السريعة', 'restaurant'],
    ['bakery', 'محلات الحلويات والمخبوزات', 'food'],
    ['cloud_kitchen', 'مطابخ سحابية', 'restaurant'],
    ['catering_events', 'شركات تجهيز الحفلات والولائم', 'hospitality'],
    ['hospitality', 'فنادق ومنتجعات'],
    ['serviced_apartments', 'شقق فندقية'],
    ['food_catering', 'خدمات التموين الغذائي', 'restaurant'],
    ['food_delivery', 'إدارة طلبات الطعام والتوصيل', 'restaurant'],
  ],
  healthcare: [
    ['medical_centers', 'مراكز طبية'],
    ['private_clinics', 'عيادات خاصة'],
    ['hospitals', 'مستشفيات'],
    ['medical_labs', 'معامل تحاليل'],
    ['imaging_centers', 'مراكز أشعة'],
    ['pharmacies', 'صيدليات', 'food'],
    ['physiotherapy', 'مراكز العلاج الطبيعي', 'services'],
    ['dental_centers', 'مراكز الأسنان'],
    ['medical_aesthetics', 'مراكز التجميل الطبية'],
    ['medical_supplies', 'محلات المستلزمات الطبية', 'healthcare_admin'],
    ['home_care', 'مراكز الرعاية المنزلية', 'services'],
  ],
  education: [
    ['schools', 'مدارس'],
    ['universities', 'جامعات ومعاهد'],
    ['tutoring_centers', 'مراكز الدروس الخصوصية'],
    ['training_academies', 'أكاديميات تدريب'],
    ['language_centers', 'مراكز لغات'],
    ['vocational_training', 'مراكز تدريب مهني'],
    ['nurseries', 'حضانات'],
    ['children_education', 'مراكز تعليم الأطفال'],
  ],
  professional_services: [
    ['professional_services', 'مكاتب المحاسبة والمراجعة'],
    ['law_firms', 'مكاتب المحاماة'],
    ['management_consulting', 'شركات الاستشارات الإدارية'],
    ['marketing_agencies', 'شركات التسويق والإعلان'],
    ['software_agencies', 'وكالات البرمجة وتطوير البرمجيات'],
    ['graphic_design', 'شركات تصميم الجرافيك'],
    ['translation_offices', 'مكاتب الترجمة'],
    ['recruitment_offices', 'مكاتب الموارد البشرية والتوظيف'],
    ['government_services', 'مكاتب الخدمات الحكومية'],
    ['security_companies', 'شركات الأمن والحراسة'],
    ['cleaning_companies', 'شركات النظافة'],
    ['device_maintenance', 'مراكز صيانة الأجهزة', 'workshop'],
    ['general_trade_company', 'شركة تجارية عامة', 'general'],
    ['services', 'شركة خدمات عامة', 'services'],
    ['multi_activity', 'مؤسسة متعددة الأنشطة', 'general'],
    ['personal_assets', 'إدارة شخصية وممتلكات', 'general'],
    ['custom', 'نشاط آخر مخصص', 'custom'],
  ],
  beauty_sports: [
    ['barber_shops', 'صالونات الحلاقة', 'services'],
    ['beauty_salons', 'صالونات التجميل', 'services'],
    ['skincare_centers', 'مراكز العناية بالبشرة', 'services'],
    ['fitness_centers', 'مراكز اللياقة البدنية', 'services'],
    ['sports_clubs', 'الأندية الرياضية', 'services'],
    ['football_academies', 'أكاديميات كرة القدم', 'services'],
    ['sports_rehabilitation', 'مراكز العلاج والتأهيل الرياضي', 'services'],
    ['sports_goods', 'محلات الأدوات الرياضية', 'general'],
    ['spas', 'مراكز السبا والمساج', 'services'],
  ],
  tourism_events: [
    ['travel_agencies', 'شركات السياحة والسفر', 'hospitality'],
    ['flight_booking', 'مكاتب حجز الطيران', 'hospitality'],
    ['tour_operators', 'شركات تنظيم الرحلات', 'hospitality'],
    ['conference_organizers', 'شركات تنظيم المؤتمرات', 'services'],
    ['wedding_venues', 'قاعات الأفراح والمناسبات', 'hospitality'],
    ['entertainment_centers', 'مراكز الألعاب والترفيه', 'services'],
    ['recreation_centers', 'مراكز الأنشطة الترفيهية', 'services'],
    ['event_management', 'شركات تنظيم الفعاليات', 'services'],
  ],
  finance: [
    ['financial_services', 'شركات الخدمات المالية'],
    ['financing_companies', 'شركات التمويل'],
    ['insurance_companies', 'شركات التأمين'],
    ['currency_exchange', 'مكاتب الصرافة'],
    ['investment_companies', 'شركات الاستثمار'],
    ['asset_management', 'إدارة المحافظ والأصول'],
    ['debt_collection', 'مكاتب تحصيل الديون'],
    ['tax_services', 'مكاتب خدمات ضريبية'],
  ],
  nonprofit: [
    ['charities', 'جمعيات خيرية'],
    ['civil_organizations', 'مؤسسات أهلية'],
    ['nonprofit_organizations', 'منظمات غير ربحية'],
    ['unions', 'اتحادات ونقابات'],
    ['religious_organizations', 'مؤسسات دينية'],
    ['aid_management', 'إدارة التبرعات والمساعدات'],
    ['community_organizations', 'مؤسسات مجتمعية'],
  ],
  agriculture: [
    ['fertilizers_pesticides', 'تجارة الأسمدة والمبيدات', 'building_materials'],
    ['seeds_trade', 'تجارة البذور والتقاوي', 'food'],
    ['plant_nurseries', 'مشاتل ومحلات نباتات', 'food'],
    ['agriculture_animal_feed', 'مصانع الأعلاف', 'manufacturing'],
    ['agricultural_equipment', 'شركات المعدات الزراعية', 'automotive'],
    ['agricultural_production', 'شركات الإنتاج والتعبئة الزراعية', 'manufacturing'],
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
