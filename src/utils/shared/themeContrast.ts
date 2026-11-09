const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function normalizeHexColor(color: string | undefined, fallback: string): string {
  if (!color || !HEX_COLOR_PATTERN.test(color)) return fallback;
  if (color.length === 4) {
    return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`.toLowerCase();
  }
  return color.toLowerCase();
}

function rgbChannels(color: string): [number, number, number] {
  const hex = normalizeHexColor(color, '#000000').slice(1);
  return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)) as [number, number, number];
}

function relativeLuminance(color: string): number {
  const [red, green, blue] = rgbChannels(color).map((channel) => {
    const linear = channel / 255;
    return linear <= 0.04045 ? linear / 12.92 : ((linear + 0.055) / 1.055) ** 2.4;
  });
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

export function contrastRatio(foreground: string, background: string): number {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

export function accessibleForeground(background: string, preferred?: string, minimumRatio = 4.5): string {
  const normalizedBackground = normalizeHexColor(background, '#ffffff');
  if (preferred && contrastRatio(preferred, normalizedBackground) >= minimumRatio) {
    return normalizeHexColor(preferred, '#000000');
  }
  return contrastRatio('#ffffff', normalizedBackground) >= contrastRatio('#000000', normalizedBackground)
    ? '#ffffff'
    : '#000000';
}

export function mixHexColors(color: string, mixWith: string, amount: number): string {
  const source = rgbChannels(color);
  const target = rgbChannels(mixWith);
  const weight = Math.max(0, Math.min(1, amount));
  const result = source.map((channel, index) => Math.round(channel * (1 - weight) + target[index] * weight));
  return `#${result.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

export function readableColorOnSurface(color: string, surface: string, minimumRatio = 4.5): string {
  const normalizedColor = normalizeHexColor(color, '#252b36');
  const normalizedSurface = normalizeHexColor(surface, '#ffffff');
  if (contrastRatio(normalizedColor, normalizedSurface) >= minimumRatio) return normalizedColor;

  const target = relativeLuminance(normalizedSurface) > 0.179 ? '#000000' : '#ffffff';
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const amount = (low + high) / 2;
    const candidate = mixHexColors(normalizedColor, target, amount);
    if (contrastRatio(candidate, normalizedSurface) >= minimumRatio) high = amount;
    else low = amount;
  }
  return mixHexColors(normalizedColor, target, high);
}
