import React from 'react';
import { CUSTOM_THEME_STORAGE_KEY } from './appearanceConstants';
import type {
  AppearanceOnChange,
  CustomThemeRecord,
  StorageNotice,
} from './appearanceTypes';
import {
  applyThemePalette,
  createThemeId,
  isThemePalette,
  readSavedCustomThemes,
} from './themeStorage';
import type { ThemeBuilderApi } from './useThemeBuilder';
import { paletteContrastIssues } from './themeUtils';

interface UseCustomThemesArgs {
  readOnly: boolean;
  onChange: AppearanceOnChange;
  builderApi: ThemeBuilderApi;
}

export interface CustomThemesApi {
  customThemes: CustomThemeRecord[];
  customThemeName: string;
  setCustomThemeName: React.Dispatch<React.SetStateAction<string>>;
  customThemeId: string | null;
  setCustomThemeId: React.Dispatch<React.SetStateAction<string | null>>;
  storageNotice: StorageNotice | null;
  setStorageNotice: React.Dispatch<React.SetStateAction<StorageNotice | null>>;
  saveCustomTheme: (isUpdate?: boolean) => void;
  applyCustomTheme: (record: CustomThemeRecord) => void;
  deleteCustomTheme: (id: string) => void;
  duplicateCurrentTheme: () => void;
  loadCustomThemeIntoBuilder: (theme: CustomThemeRecord) => void;
}

export function useCustomThemes({ readOnly, onChange, builderApi }: UseCustomThemesArgs): CustomThemesApi {
  const [savedThemeLoad] = React.useState(readSavedCustomThemes);
  const [customThemes, setCustomThemes] = React.useState<CustomThemeRecord[]>(savedThemeLoad.themes);
  const [customThemesDirty, setCustomThemesDirty] = React.useState(false);
  const [customThemeName, setCustomThemeName] = React.useState('الثيم الخاص بي');
  const [customThemeId, setCustomThemeId] = React.useState<string | null>(null);
  const [storageNotice, setStorageNotice] = React.useState<StorageNotice | null>(
    savedThemeLoad.invalidCount
      ? { type: 'error', text: `تم تجاهل ${savedThemeLoad.invalidCount} من الثيمات المحفوظة لاحتوائها على بيانات غير صالحة.` }
      : null,
  );

  React.useEffect(() => {
    if (typeof window === 'undefined' || !customThemesDirty) return;
    try {
      window.localStorage.setItem(CUSTOM_THEME_STORAGE_KEY, JSON.stringify(customThemes));
      setCustomThemesDirty(false);
      setStorageNotice((current) => current?.type === 'error' && current.text.includes('الحافظة') ? null : current);
    } catch (error) {
      const message = '\u062a\u0639\u0630\u0651\u0631\u062a \u062d\u0641\u0638 \u0627\u0644\u062b\u064a\u0645\u0627\u062a \u0627\u0644\u0645\u062e\u0635\u0635\u0629 \u0641\u064a \u0647\u0630\u0627 \u0627\u0644\u0645\u062a\u0635\u0641\u062d. \u0633\u062a\u0628\u0642\u0649 \u0627\u0644\u062a\u063a\u064a\u064a\u0631\u0627\u062a \u0627\u0644\u062d\u0627\u0644\u064a\u0629 \u0641\u064a \u0647\u0630\u0627 \u0627\u0644\u062c\u0644\u0633\u0629 \u0641\u0642\u0637\u0627.';
      setStorageNotice({ type: 'error', text: message });
      console.warn('Appearance customization theme storage could not be saved:', error);
    }
  }, [customThemes, customThemesDirty]);

  const { builder, canApplyBuilder, builderContrastIssues } = builderApi;

  const saveCustomTheme = (isUpdate = false) => {
    if (readOnly || !canApplyBuilder || builderContrastIssues > 0) return;
    const name = customThemeName.trim() || 'الثيم الخاص بي';
    const record: CustomThemeRecord = {
      id: isUpdate && customThemeId ? customThemeId : createThemeId(),
      name,
      colors: { ...builder },
    };

    setCustomThemes((current) => {
      if (isUpdate && customThemeId) {
        return current.map((item) => item.id === customThemeId ? record : item);
      }
      return [record, ...current];
    });
    setCustomThemesDirty(true);
    setCustomThemeId(record.id);
  };

  const applyCustomTheme = (record: CustomThemeRecord) => {
    if (readOnly || !isThemePalette(record.colors)) return;
    if (paletteContrastIssues(record.colors) > 0) {
      setStorageNotice({ type: 'error', text: 'تعذر تطبيق الثيم لضعف التباين. عدّل ألوان النص والخلفية واللون الأساسي حتى تحقق نسبة 4.5:1 على الأقل.' });
      return;
    }
    applyThemePalette(record.colors, onChange);
    setCustomThemeId(record.id);
    setCustomThemeName(record.name);
    builderApi.setBuilder({ ...record.colors });
    builderApi.setBuilderHexDrafts({ ...record.colors });
    builderApi.setBuilderHexErrors({});
  };

  const deleteCustomTheme = (id: string) => {
    setCustomThemes((current) => current.filter((item) => item.id !== id));
    setCustomThemesDirty(true);
    if (customThemeId === id) {
      setCustomThemeId(null);
    }
  };

  const duplicateCurrentTheme = () => {
    if (readOnly || !canApplyBuilder || builderContrastIssues > 0) return;
    const name = `${customThemeName.trim() || 'الثيم الخاص بي'} نسخة`;
    const record: CustomThemeRecord = { id: createThemeId(), name, colors: { ...builder } };
    setCustomThemes((current) => [record, ...current]);
    setCustomThemesDirty(true);
    setCustomThemeId(record.id);
    setCustomThemeName(name);
  };

  const loadCustomThemeIntoBuilder = (theme: CustomThemeRecord) => {
    setCustomThemeId(theme.id);
    setCustomThemeName(theme.name);
    builderApi.setBuilder({ ...theme.colors });
    builderApi.setBuilderHexDrafts({ ...theme.colors });
    builderApi.setBuilderHexErrors({});
  };

  return {
    customThemes,
    customThemeName,
    setCustomThemeName,
    customThemeId,
    setCustomThemeId,
    storageNotice,
    setStorageNotice,
    saveCustomTheme,
    applyCustomTheme,
    deleteCustomTheme,
    duplicateCurrentTheme,
    loadCustomThemeIntoBuilder,
  };
}
