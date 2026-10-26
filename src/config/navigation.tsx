import { NAV_GROUPS_01 } from './navigationGroups01';
import { NAV_GROUPS_02 } from './navigationGroups02';
export * from './navigationTypes';
import type { NavGroupDef } from './navigationTypes';

export const NAV_GROUPS: NavGroupDef[] = [...NAV_GROUPS_01, ...NAV_GROUPS_02];

export const NAV_STORAGE_KEYS = {
  hidden: 'nav.hidden',
  labels: 'nav.labels',
  groupsOrder: 'nav.groupsOrder',
  itemsOrder: 'nav.itemsOrder',
} as const;
