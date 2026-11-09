import { getCachedFeaturePermissions, getCachedHiddenMenus } from './centralConfigStore';
import type { CentralFeaturePermission } from './CentralFeaturePermissionService';

let currentPath = '';

export function setCurrentPath(pathname: string): void {
  currentPath = String(pathname || '').split('?')[0];
}

export function getCurrentPath(): string {
  return currentPath;
}

function normalize(pathname: string): string {
  return String(pathname || '').split('?')[0].toLowerCase().replace(/\/$/, '');
}

export function list(): CentralFeaturePermission[] {
  return getCachedFeaturePermissions() as CentralFeaturePermission[];
}

export function forPath(pathname: string): CentralFeaturePermission | undefined {
  const norm = normalize(pathname);
  if (!norm) return undefined;
  let best: CentralFeaturePermission | undefined;
  let bestLen = -1;
  for (const f of list()) {
    const url = normalize(String(f.pageUrl || ''));
    if (!url) continue;
    if (norm === url || norm.startsWith(url + '/')) {
      if (url.length > bestLen) {
        best = f;
        bestLen = url.length;
      }
    }
  }
  return best;
}

export function isPageVisible(pathname: string): boolean {
  const norm = normalize(pathname);
  if (!norm) return true;

  const hidden = getCachedHiddenMenus();
  const hiddenMatch = hidden.some((entry) => {
    const h = normalize(String(entry));
    return !!h && (norm === h || norm.startsWith(h + '/'));
  });
  if (hiddenMatch) return false;

  const fp = forPath(pathname);
  if (!fp) return true;
  return fp.pageVisible !== false && fp.featureEnabled !== false;
}

export function canView(pathname: string): boolean {
  return isPageVisible(pathname);
}
