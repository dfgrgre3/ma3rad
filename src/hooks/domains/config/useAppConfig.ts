import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  normalizePagePath,
  type AppConfigEntry,
  type AppConfigRule,
} from '../../../config/appConfiguration';
import { AppConfigService, type AppConfigFieldState, type AppConfigState } from '../../../services/domains/config/AppConfigService';
import './useAppConfig_part01';
import './useAppConfig_part02';
export { useAppConfig } from './useAppConfig_part01';
export { useConfigText } from './useAppConfig_part01';
export { usePageConfig } from './useAppConfig_part01';
export { useSectionConfig } from './useAppConfig_part01';
export { useFieldConfig } from './useAppConfig_part01';
export { useConfigEntries } from './useAppConfig_part01';
export { useConfigRules } from './useAppConfig_part02';
export { usePolicyNumber } from './useAppConfig_part02';
export { usePolicyBoolean } from './useAppConfig_part02';
