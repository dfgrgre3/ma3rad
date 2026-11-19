import { SettingsService } from '../../../../services/domains/config/SettingsService';
import { getEffectiveBusinessType } from '../../../../services/domains/config/BusinessTypeService';
import {
  BUSINESS_TYPES,
  parseBusinessConfiguration,
  parseEnabledModules,
  type BusinessConfiguration,
} from '../../../../config/businessProfiles';
import type { BusinessProfileForm } from './types';

export function moveListItem<T>(items: T[], item: T, direction: -1 | 1): T[] {
  const index = items.indexOf(item);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return items;
  const reordered = [...items];
  [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
  return reordered;
}

export function readBusinessProfile(): BusinessProfileForm {
  const storedType = getEffectiveBusinessType();
  const type = BUSINESS_TYPES.some((item) => item.id === storedType) ? storedType : 'custom';
  const config = parseBusinessConfiguration(SettingsService.getValue('businessProfileConfig'), type);
  return {
    type,
    customName: SettingsService.getValue('businessTypeLabel') || (type === 'custom' ? storedType : ''),
    enabledModules: parseEnabledModules(SettingsService.getValue('enabledModules'), type),
    additionalActivityIds: config.additionalActivityIds,
  };
}

export function readBusinessConfiguration(): BusinessConfiguration {
  const type = getEffectiveBusinessType();
  return parseBusinessConfiguration(SettingsService.getValue('businessProfileConfig'), type);
}
