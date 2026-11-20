/**
 * Renderer side of downloadable feature modules.
 *
 * `ensureModuleInstalled` asks the desktop shell to download, verify and
 * install a module's signed package before its code is imported. The shell does
 * all verification; this only coordinates and caches the result.
 */

export interface ModuleInstallerApi {
  status: () => Promise<{ installed: Array<{ moduleId: string }> }>;
  install: (moduleId: string) => Promise<unknown>;
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
