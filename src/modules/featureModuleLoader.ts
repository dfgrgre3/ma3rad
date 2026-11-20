/**
 * Dynamic module loading + feature-based deployment.
 *
 * Each business module (see `config/moduleRegistry.ts`) is a unit that is
 * shipped and loaded independently:
 *
 * - Deployment: a build selects which modules are part of it
 *   (`CERAMISYS_FEATURE_MODULES=sales,inventory,...`). Dependencies are pulled
 *   in automatically, so a deployment can never contain a module without the
 *   modules it needs.
 * - Loading: a module's code is imported only when it is first requested and
 *   only when the deployment includes it. Loads are cached per module.
 *
 * This file is pure logic (no React, no database) so it is usable from the
 * renderer and from tests.
 */
import { MODULE_IDS, withModuleDependencies } from '../config/moduleRegistry';

export type ModuleLoader = () => Promise<unknown>;

export interface DeploymentModuleSelection {
  /** Modules included in this deployment, dependencies included. */
  enabled: string[];
  /** Ids from the raw selection that do not match any registered module. */
  unknown: string[];
}

/**
 * Parse a deployment's module selection.
 *
 * - `undefined`, empty, or `all` selects every registered module.
 * - Otherwise a comma-separated list of module ids; dependencies are added.
 */
export function parseDeploymentModules(
  raw: string | null | undefined,
  knownIds: readonly string[] = MODULE_IDS,
): DeploymentModuleSelection {
  const normalized = (raw ?? '').trim();
  if (normalized === '' || normalized.toLowerCase() === 'all') {
    return { enabled: [...knownIds], unknown: [] };
  }
  const requested = [...new Set(normalized.split(',').map((id) => id.trim()).filter(Boolean))];
  const known = new Set(knownIds);
  const unknown = requested.filter((id) => !known.has(id));
  const valid = requested.filter((id) => known.has(id));
  const enabled = withModuleDependencies(valid).filter((id) => known.has(id));
  return { enabled, unknown };
}

export interface FeatureModuleLoader {
  isEnabled(id: string): boolean;
  /** Import a module's code. Resolves `undefined` when the module is not in this deployment. */
  load(id: string): Promise<unknown | undefined>;
  /** Ids that have been loaded so far. */
  loadedIds(): string[];
}

/**
 * Create a loader over a map of module id → dynamic import.
 *
 * Only enabled modules with a registered loader are ever imported. Concurrent
 * and repeated requests for the same module share one promise.
 */
export function createFeatureModuleLoader(
  loaders: Readonly<Record<string, ModuleLoader>>,
  selection: DeploymentModuleSelection,
): FeatureModuleLoader {
  const enabled = new Set(selection.enabled);
  const cache = new Map<string, Promise<unknown>>();

  return {
    isEnabled: (id) => enabled.has(id),
    load(id) {
      if (!enabled.has(id)) return Promise.resolve(undefined);
      const loader = loaders[id];
      if (!loader) return Promise.resolve(undefined);
      let pending = cache.get(id);
      if (!pending) {
        pending = loader();
        cache.set(id, pending);
        // A failed import must be retryable, so drop the cached rejection.
        pending.catch(() => cache.delete(id));
      }
      return pending;
    },
    loadedIds: () => [...cache.keys()],
  };
}

const MODULE_LAZY_CALL = /moduleLazy\(/;
const MODULE_LAZY_DECLARATION = /^((?:export )?const \w+ = moduleLazy\('([\w-]+)', )(.*)\);(\r?)$/;
// Imports and comments may mention moduleLazy( without being a declaration.
const NON_CODE_LINE = /^\s*(?:import\s|\/\/|\/\*|\*)/;

/**
 * Build-time code removal for feature-based deployment.
 *
 * Rewrites every one-line `[export] const X = moduleLazy('<id>', () => import(...));` declaration
 * whose module is not enabled to `moduleLazy('<id>', null);`, so the bundler
 * never sees the dynamic import and does not emit the page's chunk.
 *
 * Throws when a `moduleLazy(` call is not in that exact one-line form, so a
 * reformatted declaration cannot silently ship an excluded module.
 */
export function stripExcludedModuleImports(
  code: string,
  enabledIds: readonly string[],
): { code: string; removed: string[] } {
  const enabled = new Set(enabledIds);
  const removed: string[] = [];
  const lines = code.split('\n').map((line, index) => {
    if (!MODULE_LAZY_CALL.test(line) || NON_CODE_LINE.test(line)) return line;
    const match = MODULE_LAZY_DECLARATION.exec(line);
    if (!match) {
      throw new Error(`moduleLazy declaration on line ${index + 1} must be a single line: "${line.trim()}"`);
    }
    const [, head, moduleId, , cr] = match;
    if (enabled.has(moduleId)) return line;
    removed.push(moduleId);
    return `${head}null);${cr}`;
  });
  return { code: lines.join('\n'), removed };
}

/** Module selection baked into this build by Vite (`__CERAMISYS_FEATURE_MODULES__`). */
export const DEPLOYMENT_MODULES: DeploymentModuleSelection = parseDeploymentModules(
  typeof __CERAMISYS_FEATURE_MODULES__ === 'string' ? __CERAMISYS_FEATURE_MODULES__ : undefined,
);
