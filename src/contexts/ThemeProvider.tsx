import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { SettingsService } from '../services/SettingsService';
import { AuthService } from '../services/AuthService';
import { PermissionService } from '../services/PermissionService';
import type { SystemSettings } from '../types';
import { ThemeContext, type ThemeMode, type ThemeContextValue } from './ThemeContext';
import { accessibleForeground, mixHexColors, normalizeHexColor, readableColorOnSurface } from '../utils/themeContrast';

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

function resolve(mode: ThemeMode, prefersDark: boolean): 'light' | 'dark' {
  if (mode === 'system') return prefersDark ? 'dark' : 'light';
  return mode === 'dark' ? 'dark' : 'light';
}

function setPrimaryTokens(root: HTMLElement, primary: string, surface: string): void {
  const hover = mixHexColors(primary, '#000000', 0.14);
  const pressed = mixHexColors(primary, '#000000', 0.26);
  const soft = mixHexColors(primary, surface, 0.9);
  const accentBorder = mixHexColors(primary, surface, 0.72);
  root.style.setProperty('--brand-primary', primary);
  root.style.setProperty('--cerami-primary', primary);
  root.style.setProperty('--cerami-primary-hover', hover);
  root.style.setProperty('--cerami-primary-pressed', pressed);
  root.style.setProperty('--cerami-primary-text', accessibleForeground(primary));
  root.style.setProperty('--cerami-primary-hover-text', accessibleForeground(hover));
  root.style.setProperty('--cerami-primary-pressed-text', accessibleForeground(pressed));
  root.style.setProperty('--cerami-primary-readable', readableColorOnSurface(primary, surface));
  root.style.setProperty('--cerami-accent-soft', soft);
  root.style.setProperty('--cerami-accent-soft-text', accessibleForeground(soft));
  root.style.setProperty('--cerami-accent-border', accentBorder);
  root.style.setProperty('--cerami-accent-border-text', accessibleForeground(accentBorder));
}

export const ThemeProvider: React.FC<{ children: React.ReactNode; ready?: boolean }> = ({ children, ready = true }) => {
  const [settings, setSettings] = useState<SystemSettings>(() => SettingsService.getSettings());
  const [localOverride, setLocalOverride] = useState<ThemeMode | null>(() => readLocalOverride());
  const [prefersDark, setPrefersDark] = useState(systemPrefersDark);

  const mode: ThemeMode = localOverride ?? settings.themeMode ?? 'light';
  const resolvedMode = resolve(mode, prefersDark);

  const applySettings = useCallback((next: SystemSettings) => {
    setSettings(next);
    const root = document.documentElement;
    const canvas = resolvedMode === 'dark' ? '#161b22' : normalizeHexColor(next.uiCanvasColor, '#f5f6f8');
    const surface = resolvedMode === 'dark' ? '#1e252e' : normalizeHexColor(next.uiSurfaceColor, '#ffffff');
    const preferredText = resolvedMode === 'dark' ? '#e7ebf0' : normalizeHexColor(next.uiTextColor, '#252b36');
    const canvasText = accessibleForeground(canvas, preferredText);
    const surfaceText = accessibleForeground(surface, preferredText);
    const primary = normalizeHexColor(next.brandPrimaryColor, '#34445a');
    root.style.setProperty('--brand-accent', normalizeHexColor(next.brandAccentColor, '#64748b'));
    root.style.setProperty('--cerami-canvas', canvas);
    root.style.setProperty('--cerami-canvas-text', canvasText);
    root.style.setProperty('--cerami-surface', surface);
    root.style.setProperty('--cerami-surface-text', surfaceText);
    root.style.setProperty('--cerami-text', surfaceText);
    root.style.setProperty('--cerami-text-secondary', surfaceText);
    root.style.setProperty('--cerami-muted', surfaceText);
    root.style.setProperty('--cerami-border', resolvedMode === 'dark' ? '#343e4a' : normalizeHexColor(next.uiBorderColor, '#e1e5ea'));
    setPrimaryTokens(root, primary, surface);
    root.style.setProperty('--cerami-surface-muted', 'color-mix(in srgb, var(--cerami-canvas) 72%, var(--cerami-surface))');
    root.style.setProperty('--cerami-surface-sunken', 'color-mix(in srgb, var(--cerami-surface) 90%, var(--cerami-text))');
    root.style.setProperty('--cerami-border-strong', 'color-mix(in srgb, var(--cerami-border) 68%, var(--cerami-text))');
    const statusColor = (color: string | undefined, fallback: string) => {
      const selected = normalizeHexColor(color, fallback);
      return resolvedMode === 'dark' ? mixHexColors(selected, '#ffffff', 0.45) : selected;
    };
    const statuses = [
      ['success', statusColor(next.uiSuccessColor, '#39765b')],
      ['danger', statusColor(next.uiDangerColor, '#a95050')],
      ['warning', statusColor(next.uiWarningColor, '#8a6a35')],
    ] as const;
    for (const [name, color] of statuses) {
      root.style.setProperty(`--cerami-${name}`, color);
      root.style.setProperty(`--cerami-${name}-text`, readableColorOnSurface(color, surface));
      root.style.setProperty(`--cerami-${name}-on-color`, accessibleForeground(color));
    }
    root.dataset.uiButtonStyle = next.uiButtonStyle || 'solid';
    root.dataset.uiCornerRadius = next.uiCornerRadius || 'standard';
    root.dataset.uiDensity = next.uiDensity || 'comfortable';
    root.dataset.uiFontScale = next.uiFontScale || 'standard';
    root.dataset.interfaceDirection = next.interfaceDirection || 'rtl';
    root.dir = next.interfaceDirection === 'ltr' ? 'ltr' : 'rtl';
    root.style.setProperty('--brand-font', next.fontFamily || 'Cairo');
    document.body.style.fontFamily = `${next.fontFamily || 'Cairo'}, Tajawal, system-ui, sans-serif`;
  }, [resolvedMode]);

  const refresh = useCallback(() => {
    applySettings(SettingsService.getSettings());
  }, [applySettings]);

  useEffect(() => {
    applySettings(settings);
    const unsubscribe = SettingsService.subscribe(applySettings);
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applySettings]);

  // The provider mounts before SQLite finishes loading, so the first read can
  // fall back to defaults. Re-read once the database is ready.
  useEffect(() => {
    if (ready) refresh();
  }, [ready, refresh]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolvedMode === 'dark');
    root.style.colorScheme = resolvedMode;
  }, [resolvedMode]);

  useEffect(() => {
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      setPrefersDark(mq.matches);
    };
    setPrefersDark(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    const user = AuthService.getCurrentUser();
    if (user && PermissionService.can(user, 'ui.settings.hub.update')) {
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

  const applyBrand = useCallback((primaryColor: string, accent: string) => {
    const root = document.documentElement;
    const primary = normalizeHexColor(primaryColor, '#34445a');
    root.style.setProperty('--brand-accent', normalizeHexColor(accent, '#64748b'));
    setPrimaryTokens(root, primary, getComputedStyle(root).getPropertyValue('--cerami-surface').trim() || '#ffffff');
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ settings, mode, resolvedMode, setMode, toggleMode, refresh, applyBrand }),
    [settings, mode, resolvedMode, setMode, toggleMode, refresh, applyBrand]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
