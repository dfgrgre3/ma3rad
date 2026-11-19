import { accessibleForeground as getAccessibleForeground } from '../../../../utils/shared/themeContrast';
import type { ThemePalette } from './appearanceTypes';

export const isValidHex = (value: string) => /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test((value || '').trim());

export const normalizeHex = (value: string, fallback: string) => {
  const candidate = (value || '').trim();
  if (/^#[0-9a-fA-F]{3}$/.test(candidate)) {
    const expanded = candidate.slice(1).split('').map((char) => char + char).join('');
    return `#${expanded.toUpperCase()}`;
  }
  return /^#[0-9a-fA-F]{6}$/.test(candidate) ? candidate.toUpperCase() : fallback;
};

const relativeLuminance = (hex: string) => {
  const color = normalizeHex(hex, '#000000').slice(1);
  const channels = [0, 2, 4].map((offset) => {
    const channel = parseInt(color.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};

export const contrastRatio = (foreground: string, background: string) => {
  const luminances = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
  return (luminances[0] + 0.05) / (luminances[1] + 0.05);
};

export const paletteContrastIssues = (palette: ThemePalette) => [
  contrastRatio(getAccessibleForeground(palette.background, palette.text), palette.background),
  contrastRatio(getAccessibleForeground(palette.card, palette.text), palette.card),
  contrastRatio(getAccessibleForeground(palette.primary), palette.primary),
].filter((ratio) => ratio < 4.5).length;
