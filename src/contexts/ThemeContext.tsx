import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { SettingsService } from '../services/SettingsService';
import { AuthService } from '../services/AuthService';
import { PermissionService } from '../services/PermissionService';
import type { SystemSettings } from '../types';

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  settings: SystemSettings;
  mode: ThemeMode;
  resolvedMode: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
  refresh: () => void;
  applyBrand: (primary: string, accent: string) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const LOCAL_OVERRIDE_KEY = 'ceramisys_theme_override';

function readLocalOverride(): ThemeMode | null {
  try {
    const value = localStorage.getItem(LOCAL_OVERRIDE_KEY);
    return value === 'light' || value === 'dark' || value === 'system' ? value : null;
  } catch {
    return null;
  }
}

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

function resolve(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return mode === 'dark' ? 'dark' : 'light';
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<SystemSettings>(() => SettingsService.getSettings());
  const [localOverride, setLocalOverride] = useState<ThemeMode | null>(() => readLocalOverride());

  const mode: ThemeMode = localOverride ?? settings.themeMode ?? 'light';
  const resolvedMode = resolve(mode);

  const applySettings = useCallback((next: SystemSettings) => {
    setSettings(next);
    const root = document.documentElement;
    root.style.setProperty('--brand-primary', next.brandPrimaryColor || '#0284c7');
    root.style.setProperty('--brand-accent', next.brandAccentColor || '#4f46e5');
    root.style.setProperty('--cerami-primary', next.brandPrimaryColor || '#0284c7');
    root.style.setProperty('--brand-font', next.fontFamily || 'Cairo');
    document.body.style.fontFamily = `${next.fontFamily || 'Cairo'}, Tajawal, system-ui, sans-serif`;
  }, []);

  const refresh = useCallback(() => {
    applySettings(SettingsService.getSettings());
  }, [applySettings]);

  useEffect(() => {
    applySettings(settings);
    const unsubscribe = SettingsService.subscribe(applySettings);
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applySettings]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolvedMode === 'dark');
    root.style.colorScheme = resolvedMode;
  }, [resolvedMode]);

  useEffect(() => {
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      document.documentElement.classList.toggle('dark', mq.matches);
      document.documentElement.style.colorScheme = mq.matches ? 'dark' : 'light';
    };
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    const user = AuthService.getCurrentUser();
    if (user && PermissionService.can(user, 'settings.update')) {
      SettingsService.update({ themeMode: next });
      try {
        localStorage.removeItem(LOCAL_OVERRIDE_KEY);
      } catch {
        // ignore
      }
      setLocalOverride(null);
      return;
    }
    try {
      localStorage.setItem(LOCAL_OVERRIDE_KEY, next);
    } catch {
      // ignore
    }
    setLocalOverride(next);
  }, []);

  const toggleMode = useCallback(() => {
    setMode(resolvedMode === 'dark' ? 'light' : 'dark');
  }, [resolvedMode, setMode]);

  const applyBrand = useCallback((primary: string, accent: string) => {
    document.documentElement.style.setProperty('--brand-primary', primary);
    document.documentElement.style.setProperty('--brand-accent', accent);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ settings, mode, resolvedMode, setMode, toggleMode, refresh, applyBrand }),
    [settings, mode, resolvedMode, setMode, toggleMode, refresh, applyBrand]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
