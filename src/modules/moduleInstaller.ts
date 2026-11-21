/**
 * Renderer side of downloadable feature modules.
 *
 * `ensureModuleInstalled` asks the desktop shell to download, verify and
 * install a module's signed package before its code is imported. The shell does
 * all verification; this only coordinates and caches the result.
 */

import { readCachedCentralConfig } from '../services/domains/licensing/centralConfigStore';
import { CentralFeaturePermissionService } from '../services/domains/licensing/CentralFeaturePermissionService';

export interface AvailableModuleInfo {
  moduleId: string;
  version: string;
  sizeBytes: number;
  installed: boolean;
  /** Registry module ids this package may be delivered under (page packages). */
  modules?: string[];
  /** App routes this package serves — used to skip fully-hidden pages. */
  pages?: string[];
}

export interface ModuleInstallerApi {
  status: () => Promise<{ configured?: boolean; buildId?: string; installed: Array<{ moduleId: string }> }>;
  install: (moduleId: string) => Promise<unknown>;
  available?: () => Promise<AvailableModuleInfo[]>;
}

export type ModuleInstallResult =
  | { ok: true }
  | { ok: false; reason: string };

const inFlight = new Map<string, Promise<ModuleInstallResult>>();
const ready = new Set<string>();

export function getModuleInstallerApi(): ModuleInstallerApi | undefined {
  if (typeof window === 'undefined') return undefined;
  const bridge = window as unknown as {
    ceramisys?: { modules?: ModuleInstallerApi };
    electronAPI?: { modules?: ModuleInstallerApi };
  };
  return bridge.ceramisys?.modules ?? bridge.electronAPI?.modules;
}

export function ensureModuleInstalled(
  moduleId: string,
  api: ModuleInstallerApi | undefined = getModuleInstallerApi(),
): Promise<ModuleInstallResult> {
  // No desktop shell (browser/dev): chunks are served by the dev server or bundle.
  if (!api) return Promise.resolve({ ok: true });
  if (ready.has(moduleId)) return Promise.resolve({ ok: true });
  let job = inFlight.get(moduleId);
  if (!job) {
    job = (async (): Promise<ModuleInstallResult> => {
      try {
        const { installed } = await api.status();
        if (!installed.some((item) => item.moduleId === moduleId)) await api.install(moduleId);
        ready.add(moduleId);
        return { ok: true };
      } catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : String(error) };
      }
    })().finally(() => inFlight.delete(moduleId));
    inFlight.set(moduleId, job);
  }
  return job;
}

/** Test hook: forget cached state. */
export function resetModuleInstallerState(): void {
  inFlight.clear();
  ready.clear();
}

export interface ModuleProvisionProgress {
  completed: number;
  total: number;
  /** Module whose download is in flight right now, if any. */
  currentModuleId?: string;
  /** Module that just finished (successfully or not). */
  finishedModuleId?: string;
  finishedOk?: boolean;
  finishedReason?: string;
}

export interface ModuleProvisionResult {
  /** False when this build/shell cannot deliver module packages at all. */
  attempted: boolean;
  /** Entitled modules the server offered for this build. */
  catalog: AvailableModuleInfo[];
  installed: string[];
  failed: Array<{ moduleId: string; reason: string }>;
}

/**
 * Download every feature module the central platform entitles this device to.
 *
 * Used by first-run activation so a client receives exactly the page chunks
 * its license covers — modules outside the entitlement are never requested,
 * so their files never reach the device. Lazy per-page installs
 * (`ensureModuleInstalled`) keep working afterwards for anything added later.
 *
 * Never throws: an unreachable catalog simply means nothing is provisioned
 * up front, and the on-demand path remains the fallback.
 */
/**
 * Client-side mirror of the server's package visibility rule: a package is
 * provisioned only when one of its modules is allowed by the signed tenant
 * configuration AND not every route it serves is hidden. The server already
 * filters its catalog; this guards against a stale/mismatched catalog and
 * keeps hidden pages' files off the device even if they were offered.
 */
function packageVisibleToTenant(entry: AvailableModuleInfo): boolean {
  const cfg = readCachedCentralConfig();
  const allowed = cfg?.config?.allowedModules;
  const mods = entry.modules?.length ? entry.modules : [entry.moduleId];
  if (Array.isArray(allowed) && !mods.some((id) => allowed.includes(id))) return false;
  const pages = entry.pages ?? [];
  if (pages.length > 0 && !pages.some((path) => CentralFeaturePermissionService.isPageVisible(path))) {
    return false;
  }
  return true;
}

export async function provisionEntitledModules(
  api: ModuleInstallerApi | undefined = getModuleInstallerApi(),
  onProgress?: (progress: ModuleProvisionProgress) => void,
  onCatalog?: (modules: AvailableModuleInfo[]) => void,
): Promise<ModuleProvisionResult> {
  const result: ModuleProvisionResult = { attempted: false, catalog: [], installed: [], failed: [] };
  if (!api?.available) return result;
  try {
    const status = await api.status();
    // No buildId ⇒ not a downloadable-modules build: every page chunk is
    // already inside the installer, so there is nothing to provision.
    if (!status.buildId) return result;
    result.attempted = true;
    const offered = await api.available();
    const catalog = offered.filter(packageVisibleToTenant);
    result.catalog = catalog;
    onCatalog?.(catalog);

    // Group page packages under their business module: install(moduleId)
    // delivers every visible package of that module in a single catalog
    // fetch, which keeps activation fast even with hundreds of page packages.
    const packagesByModule = new Map<string, AvailableModuleInfo[]>();
    for (const entry of catalog) {
      const mods = entry.modules?.length ? entry.modules : [entry.moduleId];
      for (const mod of mods) {
        const list = packagesByModule.get(mod) ?? [];
        list.push(entry);
        packagesByModule.set(mod, list);
      }
    }
    const todo = [...packagesByModule.entries()].filter(([, entries]) =>
      entries.some((entry) => !entry.installed && !ready.has(entry.moduleId)),
    );
    let completed = 0;
    for (const [moduleId, entries] of todo) {
      onProgress?.({ completed, total: todo.length, currentModuleId: moduleId });
      try {
        await api.install(moduleId);
        for (const entry of entries) ready.add(entry.moduleId);
        ready.add(moduleId);
        result.installed.push(moduleId);
        onProgress?.({ completed: ++completed, total: todo.length, finishedModuleId: moduleId, finishedOk: true });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        result.failed.push({ moduleId, reason });
        onProgress?.({ completed: ++completed, total: todo.length, finishedModuleId: moduleId, finishedOk: false, finishedReason: reason });
      }
    }
    if (todo.length === 0) onProgress?.({ completed: 0, total: 0 });
  } catch {
    // Catalog unreachable or device not activated yet: lazy install on first
    // page visit remains the fallback, so provisioning is best-effort here.
  }
  return result;
}
