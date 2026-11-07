import { createContext } from 'react';
import type { SystemSettings } from '../types';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeContextValue {
  settings: SystemSettings;
  mode: ThemeMode;
  resolvedMode: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
  refresh: () => void;
  applyBrand: (primary: string, accent: string) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);
