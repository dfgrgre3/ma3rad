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
  { id: 'retail', label: 'التجارة والمعارض', labelEn: 'Retail and trade', defaultProfileId: 'ceramics' },
  { id: 'manufacturing', label: 'التصنيع والإنتاج', labelEn: 'Manufacturing and production', defaultProfileId: 'manufacturing' },
  { id: 'professional_services', label: 'الخدمات المهنية والإدارية', labelEn: 'Professional services', defaultProfileId: 'custom' },
];

type ActivityRow = readonly [id: string, label: string, profileId?: string];

// One selectable activity per business profile. Activities that shared the same
// profile produced identical configuration, so only the canonical entry remains.
const ACTIVITY_ROWS: Record<string, ActivityRow[]> = {
  retail: [
    ['ceramics', 'معرض سيراميك وبورسلين', 'ceramics'],
  ],
  manufacturing: [
    ['manufacturing', 'التصنيع والإنتاج', 'manufacturing'],
  ],
  professional_services: [
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
