import React from 'react';
import type { AppearanceCustomizationTabProps, ThemeFilter } from './AppearanceCustomizationTab/appearanceTypes';
import { applyDefaultSettings } from './AppearanceCustomizationTab/themeStorage';
import { useThemeBuilder } from './AppearanceCustomizationTab/useThemeBuilder';
import { useCustomThemes } from './AppearanceCustomizationTab/useCustomThemes';
import { useColorEditor } from './AppearanceCustomizationTab/useColorEditor';
import { StudioHeaderSection } from './AppearanceCustomizationTab/sections/StudioHeaderSection';
import { SystemColorsSection } from './AppearanceCustomizationTab/sections/SystemColorsSection';
import { InterfaceSettingsSection } from './AppearanceCustomizationTab/sections/InterfaceSettingsSection';
import { PresetThemesSection } from './AppearanceCustomizationTab/sections/PresetThemesSection';
import { CustomThemeSection } from './AppearanceCustomizationTab/sections/CustomThemeSection';
import { LivePreviewSection } from './AppearanceCustomizationTab/sections/LivePreviewSection';
import { ColorEditorDialog } from './AppearanceCustomizationTab/sections/ColorEditorDialog';

export const AppearanceCustomizationTab: React.FC<AppearanceCustomizationTabProps> = ({
  settings,
  readOnly,
  onChange,
}) => {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [themeFilter, setThemeFilter] = React.useState<ThemeFilter>('all');
  const builderApi = useThemeBuilder(settings);
  const themes = useCustomThemes({ readOnly, onChange, builderApi });
  const colorEditor = useColorEditor({ settings, onChange, setStorageNotice: themes.setStorageNotice });

  const restoreDefaults = () => {
    if (readOnly || !window.confirm('هل تريد استعادة إعدادات الواجهة الافتراضية؟')) return;
    applyDefaultSettings(onChange);
  };

  return (
    <div className="space-y-4">
      <StudioHeaderSection
        storageNotice={themes.storageNotice}
        readOnly={readOnly}
        onRestoreDefaults={restoreDefaults}
      />

      <SystemColorsSection
        settings={settings}
        readOnly={readOnly}
        onChange={onChange}
        onOpenColorEditor={colorEditor.openColorEditor}
      />

      <InterfaceSettingsSection
        settings={settings}
        readOnly={readOnly}
        onChange={onChange}
      />

      <PresetThemesSection
        settings={settings}
        readOnly={readOnly}
        onChange={onChange}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        themeFilter={themeFilter}
        setThemeFilter={setThemeFilter}
      />

      <CustomThemeSection
        readOnly={readOnly}
        onChange={onChange}
        builderApi={builderApi}
        themes={themes}
      />

      <LivePreviewSection settings={settings} />

      <ColorEditorDialog editor={colorEditor} readOnly={readOnly} />
    </div>
  );
};
