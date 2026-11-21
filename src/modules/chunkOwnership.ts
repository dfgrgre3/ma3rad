/**
 * Build-time analysis for downloadable feature modules.
 *
 * Given the chunk graph of a full production build and the pages that each
 * module owns (the `moduleLazy` roots), decide which emitted files belong
 * exclusively to one module. Those files can be shipped as a signed module
 * package instead of inside the installer; everything else stays in the core.
 *
 * The rule is deliberately conservative: a chunk is only moved out when the
 * core can never reach it except through a dynamic import of a module root
 * (which `moduleLazy` guards by installing the module first).
 *
 * Pure logic, no bundler imports, so it is unit-testable.
 */

export interface ChunkInfo {
  fileName: string;
  isEntry: boolean;
  /** Absolute id of the module that created this chunk, when it has one. */
  facadeModuleId: string | null;
  /** Static imports (always loaded together with the chunk). */
  imports: readonly string[];
  /** Dynamic imports (loaded on demand). */
  dynamicImports: readonly string[];
  /** CSS files this chunk loads. */
  css: readonly string[];
}

export interface ModuleChunkPlan {
  /** moduleId → files (chunks and CSS) that belong only to that module. */
  modules: Record<string, string[]>;
  /** Number of chunks that stay in the installer. */
  coreChunkCount: number;
  /** Module chunks that had to stay in the core because the core needs them statically. */
  keptInCore: string[];
  /** Module roots whose page was merged into another chunk and cannot be split out. */
  unsplittableModules: string[];
}

export function planModuleChunks(
  chunks: readonly ChunkInfo[],
  /** facade module id (absolute path of the page) → owning module id. */
  roots: Readonly<Record<string, string>>,
): ModuleChunkPlan {
  const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const rootModule = new Map<string, string>();
  for (const chunk of chunks) {
    const moduleId = chunk.facadeModuleId ? roots[chunk.facadeModuleId] : undefined;
    if (moduleId) rootModule.set(chunk.fileName, moduleId);
  }

  // Core: everything reachable from the entries, never crossing a dynamic edge
  // into a module root (that edge is the one `moduleLazy` guards).
  const core = new Set<string>();
  const queue: string[] = chunks.filter((chunk) => chunk.isEntry).map((chunk) => chunk.fileName);
  const enqueueCore = (name: string) => { if (!core.has(name) && byName.has(name)) { core.add(name); queue.push(name); } };
  queue.forEach((name) => core.add(name));
  while (queue.length) {
    const chunk = byName.get(queue.pop() as string);
    if (!chunk) continue;
    chunk.imports.forEach(enqueueCore);
    for (const target of chunk.dynamicImports) if (!rootModule.has(target)) enqueueCore(target);
  }

  const owners = new Map<string, Set<string>>();
  const visitFrom = (moduleId: string) => {
    const stack = [...rootModule].filter(([, id]) => id === moduleId).map(([name]) => name);
    const seen = new Set<string>(stack);
    while (stack.length) {
      const name = stack.pop() as string;
      if (!core.has(name)) {
        if (!owners.has(name)) owners.set(name, new Set());
        owners.get(name)?.add(moduleId);
      }
      const chunk = byName.get(name);
      if (!chunk) continue;
      const edges = [
        ...chunk.imports,
        ...chunk.dynamicImports.filter((target) => !rootModule.has(target) || rootModule.get(target) === moduleId),
      ];
      for (const target of edges) {
        if (seen.has(target) || core.has(target) || !byName.has(target)) continue;
        seen.add(target);
        stack.push(target);
      }
    }
  };
  for (const moduleId of new Set(rootModule.values())) visitFrom(moduleId);

  // Shared between modules → core.
  for (const [name, set] of owners) if (set.size > 1) core.add(name);

  // Fixpoint: a module chunk the core imports statically must stay in the core,
  // and so must everything that chunk loads.
  const keptInCore = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const name of [...core]) {
      const chunk = byName.get(name);
      if (!chunk) continue;
      for (const target of chunk.imports) {
        if (!core.has(target) && byName.has(target)) {
          core.add(target);
          keptInCore.add(target);
          changed = true;
        }
      }
    }
  }

  const modules: Record<string, string[]> = {};
  const cssOwner = new Map<string, Set<string>>();
  for (const chunk of chunks) {
    const moduleId = core.has(chunk.fileName) ? 'core' : [...(owners.get(chunk.fileName) ?? [])][0] ?? 'core';
    for (const css of chunk.css) {
      if (!cssOwner.has(css)) cssOwner.set(css, new Set());
      cssOwner.get(css)?.add(moduleId);
    }
    if (moduleId === 'core') continue;
    (modules[moduleId] ??= []).push(chunk.fileName);
  }
  for (const [css, set] of cssOwner) {
    if (set.size !== 1) continue;
    const [moduleId] = [...set];
    if (moduleId !== 'core') (modules[moduleId] ??= []).push(css);
  }
  for (const files of Object.values(modules)) files.sort();

  const declaredModules = new Set(Object.values(roots));
  const unsplittableModules = [...declaredModules].filter((id) => !modules[id]);

  return {
    modules,
    coreChunkCount: chunks.filter((chunk) => core.has(chunk.fileName)).length,
    keptInCore: [...keptInCore].sort(),
    unsplittableModules: unsplittableModules.sort(),
  };
}

// ─── Page-level planning ──────────────────────────────────────────────────────

/**
 * One `moduleLazy` page file and the package it feeds.
 *
 * `modules` lists every registry module id declared for the page — a page file
 * shared by several routes/modules (e.g. DailyPage) may be delivered under any
 * of them.
 */
export interface PageUnit {
  /** Package id receiving chunks owned exclusively by this page (`pg-…`). */
  packageId: string;
  /** Registry module ids through which this page may be delivered. */
  modules: readonly string[];
}

export interface PageChunkPlan {
  /** packageId → emitted files belonging to it. Values may overlap across
   *  page packages only through the module-shared package, never duplicated. */
  modules: Record<string, string[]>;
  /** packageId → page-unit keys (facade module ids) contributing files to it. */
  members: Record<string, string[]>;
  coreChunkCount: number;
  keptInCore: string[];
  /** Page-unit package ids whose chunks all stayed in the core bundle. */
  unsplittablePackages: string[];
}

/**
 * Page-granular variant of {@link planModuleChunks}.
 *
 * Ownership unit is the page (each `moduleLazy` root file) instead of the
 * business module, so chunks exclusive to a hidden page can be packaged — and
 * therefore withheld — separately:
 *
 * - chunk owned by exactly one page unit → that unit's `packageId`;
 * - chunk owned by several units that all live in ONE module → the module's
 *   shared package (packageId = module id, e.g. `sales`);
 * - chunk reachable from units spanning several modules → core, exactly like
 *   the module-level rule.
 *
 * Dynamic edges into page roots are never followed: each root is guarded by
 * its own `moduleLazy` ensure, which installs every visible package of the
 * owning module before the import runs.
 */
export function planPageChunks(
  chunks: readonly ChunkInfo[],
  /** facade module id (absolute path of the page) → page unit. */
  units: Readonly<Record<string, PageUnit>>,
): PageChunkPlan {
  const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const rootUnit = new Map<string, string>();
  for (const chunk of chunks) {
    if (chunk.facadeModuleId && units[chunk.facadeModuleId]) {
      rootUnit.set(chunk.fileName, chunk.facadeModuleId);
    }
  }

  // Core: everything reachable from the entries without crossing a dynamic
  // edge into a page root.
  const core = new Set<string>();
  const queue: string[] = chunks.filter((chunk) => chunk.isEntry).map((chunk) => chunk.fileName);
  queue.forEach((name) => core.add(name));
  const enqueueCore = (name: string) => { if (!core.has(name) && byName.has(name)) { core.add(name); queue.push(name); } };
  while (queue.length) {
    const chunk = byName.get(queue.pop() as string);
    if (!chunk) continue;
    chunk.imports.forEach(enqueueCore);
    for (const target of chunk.dynamicImports) if (!rootUnit.has(target)) enqueueCore(target);
  }

  // Page-unit ownership: BFS from each unit's root chunks over static imports
  // and dynamic imports that do not land on another page root.
  const owners = new Map<string, Set<string>>();
  const visitFrom = (unitKey: string) => {
    const stack = [...rootUnit].filter(([, key]) => key === unitKey).map(([name]) => name);
    const seen = new Set<string>(stack);
    while (stack.length) {
      const name = stack.pop() as string;
      if (!core.has(name)) {
        if (!owners.has(name)) owners.set(name, new Set());
        owners.get(name)?.add(unitKey);
      }
      const chunk = byName.get(name);
      if (!chunk) continue;
      const edges = [...chunk.imports, ...chunk.dynamicImports.filter((target) => !rootUnit.has(target))];
      for (const target of edges) {
        if (seen.has(target) || core.has(target) || !byName.has(target)) continue;
        seen.add(target);
        stack.push(target);
      }
    }
  };
  for (const unitKey of new Set(rootUnit.values())) visitFrom(unitKey);

  const moduleSetOf = (ownerKeys: Iterable<string>): Set<string> => {
    const set = new Set<string>();
    for (const key of ownerKeys) for (const id of units[key]?.modules ?? []) set.add(id);
    return set;
  };

  // Shared across modules → core (mirrors the module-level rule).
  for (const [name, ownerKeys] of owners) {
    if (ownerKeys.size > 1 && moduleSetOf(ownerKeys).size > 1) core.add(name);
  }

  // Fixpoint: a chunk the core imports statically must stay in the core.
  const keptInCore = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const name of [...core]) {
      const chunk = byName.get(name);
      if (!chunk) continue;
      for (const target of chunk.imports) {
        if (!core.has(target) && byName.has(target)) {
          core.add(target);
          keptInCore.add(target);
          changed = true;
        }
      }
    }
  }

  // Assign every remaining owned chunk to its package.
  const modules: Record<string, string[]> = {};
  const members: Record<string, Set<string>> = {};
  const packageOf = new Map<string, string>();
  for (const [name, ownerKeys] of owners) {
    if (core.has(name)) continue;
    let packageId: string;
    if (ownerKeys.size === 1) {
      packageId = units[[...ownerKeys][0]].packageId;
    } else {
      const modSet = moduleSetOf(ownerKeys);
      if (modSet.size !== 1) continue; // cross-module share already went core
      packageId = [...modSet][0];
    }
    (modules[packageId] ??= []).push(name);
    packageOf.set(name, packageId);
    const memberSet = (members[packageId] ??= new Set<string>());
    for (const key of ownerKeys) memberSet.add(key);
  }

  // CSS follows its chunk: single-package css moves out, shared css stays core.
  const cssOwner = new Map<string, Set<string>>();
  for (const chunk of chunks) {
    const packageId = core.has(chunk.fileName) ? 'core' : packageOf.get(chunk.fileName) ?? 'core';
    for (const css of chunk.css) {
      if (!cssOwner.has(css)) cssOwner.set(css, new Set());
      cssOwner.get(css)?.add(packageId);
    }
  }
  for (const [css, set] of cssOwner) {
    if (set.size !== 1) continue;
    const [packageId] = [...set];
    if (packageId !== 'core') (modules[packageId] ??= []).push(css);
  }
  for (const files of Object.values(modules)) files.sort();

  const declaredPackages = new Set(Object.values(units).map((unit) => unit.packageId));
  const unsplittablePackages = [...declaredPackages].filter((id) => !modules[id]);

  return {
    modules,
    members: Object.fromEntries(Object.entries(members).map(([id, set]) => [id, [...set].sort()])),
    coreChunkCount: chunks.filter((chunk) => core.has(chunk.fileName)).length,
    keptInCore: [...keptInCore].sort(),
    unsplittablePackages: unsplittablePackages.sort(),
  };
}
