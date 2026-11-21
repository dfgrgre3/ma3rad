import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODULE_REGISTRY } from '../src/config/moduleRegistry.ts';
import {
  createFeatureModuleLoader,
  parseDeploymentModules,
} from '../src/modules/featureModuleLoader.ts';

const knownIds = MODULE_REGISTRY.map((module) => module.id);

test('empty or "all" selects every registered module', () => {
  assert.deepEqual(parseDeploymentModules(undefined).enabled, knownIds);
  assert.deepEqual(parseDeploymentModules('').enabled, knownIds);
  assert.deepEqual(parseDeploymentModules('all').enabled, knownIds);
});

test('a selection pulls in dependencies and reports unknown ids', () => {
  const dependent = MODULE_REGISTRY.find((module) => module.dependencies.length > 0);
  assert.ok(dependent, 'registry should contain a module with dependencies');
  const selection = parseDeploymentModules(`${dependent.id},does-not-exist`);
  for (const dep of dependent.dependencies) {
    assert.ok(selection.enabled.includes(dep), `dependency ${dep} should be enabled`);
  }
  assert.ok(selection.enabled.includes(dependent.id));
  assert.deepEqual(selection.unknown, ['does-not-exist']);
});

test('only enabled modules are imported, and each import runs once', async () => {
  const calls: string[] = [];
  const loaders = Object.fromEntries(
    knownIds.map((id) => [id, async () => {
      calls.push(id);
      return { id };
    }]),
  );
  const [first, ...rest] = knownIds;
  const selection = { enabled: [first], unknown: [] };
  const loader = createFeatureModuleLoader(loaders, selection);

  assert.equal(loader.isEnabled(first), true);
  assert.equal(await loader.load(rest[0]), undefined);
  assert.deepEqual(calls, []);

  const [a, b] = await Promise.all([loader.load(first), loader.load(first)]);
  assert.deepEqual(a, { id: first });
  assert.equal(a, b);
  assert.deepEqual(calls, [first]);
  assert.deepEqual(loader.loadedIds(), [first]);
});

test('a failed import is retried on the next request', async () => {
  let attempts = 0;
  const id = knownIds[0];
  const loader = createFeatureModuleLoader(
    {
      [id]: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('chunk load failed');
        return 'ok';
      },
    },
    { enabled: [id], unknown: [] },
  );
  await assert.rejects(loader.load(id), /chunk load failed/);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(await loader.load(id), 'ok');
  assert.equal(attempts, 2);
});

test('stripExcludedModuleImports removes only excluded modules\' imports', async () => {
  const { stripExcludedModuleImports } = await import('../src/modules/featureModuleLoader.ts');
  const code = [
    "import { moduleLazy } from '../modules/moduleLazy';",
    "export const A = moduleLazy('sales', () => import('./a').then(m => ({ default: m.A })));",
    "export const B = moduleLazy('hr', () => import('./b').then(m => ({ default: m.B })));\r",
    "export const C = lazy(() => import('./c'));",
  ].join('\n');
  const result = stripExcludedModuleImports(code, ['sales']);
  assert.deepEqual(result.removed, ['hr']);
  const lines = result.code.split('\n');
  assert.equal(lines[1], "export const A = moduleLazy('sales', () => import('./a').then(m => ({ default: m.A })));");
  assert.equal(lines[2], "export const B = moduleLazy('hr', null);\r");
  assert.equal(lines[3], "export const C = lazy(() => import('./c'));");
});

test('stripExcludedModuleImports rejects multi-line declarations', async () => {
  const { stripExcludedModuleImports } = await import('../src/modules/featureModuleLoader.ts');
  const code = "export const A = moduleLazy('sales', () =>\n  import('./a'));";
  assert.throws(() => stripExcludedModuleImports(code, []), /single line/);
});

test('every moduleLazy file strips cleanly to zero module imports when nothing is enabled', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const { stripExcludedModuleImports } = await import('../src/modules/featureModuleLoader.ts');
  // Same scope as the ceramisys-feature-modules Vite plugin.
  const files = (readdirSync('src', { recursive: true }) as string[])
    .map((name) => `src/${name.replaceAll('\\', '/')}`)
    .filter((name) => /\.tsx?$/.test(name) && !name.startsWith('src/modules/'))
    .filter((name) => readFileSync(name, 'utf8').includes('moduleLazy('));
  assert.ok(files.includes('src/pages/dashboard/dashboard/DashboardPage.tsx'));
  let total = 0;
  for (const name of files) {
    const source = readFileSync(name, 'utf8');
    const { code, removed } = stripExcludedModuleImports(source, []);
    for (const id of removed) assert.ok(knownIds.includes(id), `${name}: unknown module id ${id}`);
    assert.doesNotMatch(code, /moduleLazy\('[\w-]+', \(\) => import/, `${name} still imports an excluded module`);
    total += removed.length;
  }
  assert.ok(total > 100, `expected the module pages to be gated, got ${total}`);
});

test('planModuleChunks splits module-exclusive chunks and keeps shared ones in core', async () => {
  const { planModuleChunks } = await import('../src/modules/chunkOwnership.ts');
  const chunk = (fileName: string, o: Record<string, unknown> = {}) => ({
    fileName, isEntry: false, facadeModuleId: null, imports: [], dynamicImports: [], css: [], ...o,
  });
  const chunks = [
    chunk('assets/index.js', { isEntry: true, dynamicImports: ['assets/HrPage.js', 'assets/SalesPage.js', 'assets/CorePage.js'], imports: ['assets/vendor.js'] }),
    chunk('assets/vendor.js'),
    chunk('assets/CorePage.js'),
    chunk('assets/HrPage.js', { facadeModuleId: '/p/Hr.tsx', imports: ['assets/hr-util.js', 'assets/shared.js'], css: ['assets/Hr.css'] }),
    chunk('assets/hr-util.js'),
    chunk('assets/SalesPage.js', { facadeModuleId: '/p/Sales.tsx', imports: ['assets/shared.js'], dynamicImports: ['assets/SalesLazy.js'] }),
    chunk('assets/SalesLazy.js'),
    chunk('assets/shared.js'),
  ];
  const plan = planModuleChunks(chunks, { '/p/Hr.tsx': 'hr', '/p/Sales.tsx': 'sales' });
  assert.deepEqual(plan.modules.hr, ['assets/Hr.css', 'assets/HrPage.js', 'assets/hr-util.js']);
  assert.deepEqual(plan.modules.sales, ['assets/SalesLazy.js', 'assets/SalesPage.js']);
  assert.ok(!Object.values(plan.modules).flat().includes('assets/shared.js'), 'shared chunk stays in core');
  assert.ok(!Object.values(plan.modules).flat().includes('assets/CorePage.js'));
  assert.deepEqual(plan.unsplittableModules, []);
});

test('planModuleChunks keeps a chunk in core when the core imports it statically', async () => {
  const { planModuleChunks } = await import('../src/modules/chunkOwnership.ts');
  const chunk = (fileName: string, o: Record<string, unknown> = {}) => ({
    fileName, isEntry: false, facadeModuleId: null, imports: [], dynamicImports: [], css: [], ...o,
  });
  const chunks = [
    chunk('assets/index.js', { isEntry: true, imports: ['assets/HrPage.js'], dynamicImports: ['assets/HrPage.js'] }),
    chunk('assets/HrPage.js', { facadeModuleId: '/p/Hr.tsx', imports: ['assets/hr-util.js'] }),
    chunk('assets/hr-util.js'),
  ];
  const plan = planModuleChunks(chunks, { '/p/Hr.tsx': 'hr' });
  assert.deepEqual(plan.modules, {});
  assert.deepEqual(plan.unsplittableModules, ['hr']);
});

test('ensureModuleInstalled installs once, shares concurrent calls and reports failures', async () => {
  const { ensureModuleInstalled, resetModuleInstallerState } = await import('../src/modules/moduleInstaller.ts');
  resetModuleInstallerState();
  let installs = 0;
  const installed: Array<{ moduleId: string }> = [];
  const api = {
    status: async () => ({ installed: [...installed] }),
    install: async (id: string) => { installs += 1; await new Promise((r) => setTimeout(r, 5)); installed.push({ moduleId: id }); },
  };
  const [a, b] = await Promise.all([ensureModuleInstalled('hr', api), ensureModuleInstalled('hr', api)]);
  assert.deepEqual([a, b], [{ ok: true }, { ok: true }]);
  assert.equal(installs, 1);
  assert.deepEqual(await ensureModuleInstalled('hr', api), { ok: true });
  assert.equal(installs, 1);

  const failing = { status: async () => ({ installed: [] }), install: async () => { throw new Error('signature is invalid'); } };
  assert.deepEqual(await ensureModuleInstalled('crm-x', failing), { ok: false, reason: 'signature is invalid' });
  // A failed install is retried, not cached.
  assert.deepEqual(await ensureModuleInstalled('crm-x', { status: async () => ({ installed: [] }), install: async () => undefined }), { ok: true });

  assert.deepEqual(await ensureModuleInstalled('any', undefined), { ok: true }, 'no desktop shell → no-op');
  resetModuleInstallerState();
});

test('planPageChunks assigns page-exclusive chunks to page packages and intra-module shared chunks to the module package', async () => {
  const { planPageChunks } = await import('../src/modules/chunkOwnership.ts');
  const chunk = (fileName: string, o: Record<string, unknown> = {}) => ({
    fileName, isEntry: false, facadeModuleId: null, imports: [], dynamicImports: [], css: [], ...o,
  });
  const chunks = [
    chunk('assets/index.js', { isEntry: true, dynamicImports: ['assets/Orders.js', 'assets/Returns.js', 'assets/Core.js'], imports: ['assets/vendor.js'] }),
    chunk('assets/vendor.js'),
    chunk('assets/Core.js'),
    chunk('assets/Orders.js', { facadeModuleId: '/p/Orders.tsx', imports: ['assets/sales-shared.js', 'assets/orders-only.js'], css: ['assets/Orders.css'] }),
    chunk('assets/orders-only.js'),
    chunk('assets/Returns.js', { facadeModuleId: '/p/Returns.js', imports: ['assets/sales-shared.js'] }),
    chunk('assets/sales-shared.js'),
  ];
  const units = {
    '/p/Orders.tsx': { packageId: 'pg-sales-a', modules: ['sales'] },
    '/p/Returns.js': { packageId: 'pg-sales-b', modules: ['sales'] },
  };
  const plan = planPageChunks(chunks, units);
  assert.deepEqual(plan.modules['pg-sales-a'], ['assets/Orders.css', 'assets/Orders.js', 'assets/orders-only.js']);
  assert.deepEqual(plan.modules['pg-sales-b'], ['assets/Returns.js']);
  assert.deepEqual(plan.modules.sales, ['assets/sales-shared.js']);
  assert.deepEqual(plan.members.sales, ['/p/Orders.tsx', '/p/Returns.js']);
  assert.deepEqual(plan.members['pg-sales-a'], ['/p/Orders.tsx']);
  assert.deepEqual(plan.unsplittablePackages, []);
});

test('planPageChunks keeps chunks shared across modules in core and multi-module pages get their own package', async () => {
  const { planPageChunks } = await import('../src/modules/chunkOwnership.ts');
  const chunk = (fileName: string, o: Record<string, unknown> = {}) => ({
    fileName, isEntry: false, facadeModuleId: null, imports: [], dynamicImports: [], css: [], ...o,
  });
  const chunks = [
    chunk('assets/index.js', { isEntry: true, dynamicImports: ['assets/Daily.js', 'assets/Orders.js', 'assets/Hr.js'] }),
    chunk('assets/Daily.js', { facadeModuleId: '/p/Daily.tsx', imports: ['assets/cross.js', 'assets/daily-only.js'] }),
    chunk('assets/daily-only.js'),
    chunk('assets/Orders.js', { facadeModuleId: '/p/Orders.tsx', imports: ['assets/cross.js'] }),
    chunk('assets/Hr.js', { facadeModuleId: '/p/Hr.tsx', imports: ['assets/cross.js'] }),
    chunk('assets/cross.js'),
  ];
  const units = {
    '/p/Daily.tsx': { packageId: 'pg-sales-daily', modules: ['sales', 'purchasing', 'finance'] },
    '/p/Orders.tsx': { packageId: 'pg-sales-orders', modules: ['sales'] },
    '/p/Hr.tsx': { packageId: 'pg-hr-main', modules: ['hr'] },
  };
  const plan = planPageChunks(chunks, units);
  // DailyPage serves three modules: its exclusive chunk still gets a package.
  assert.deepEqual(plan.modules['pg-sales-daily'], ['assets/Daily.js', 'assets/daily-only.js']);
  // 'cross.js' is reachable from units spanning sales+purchasing / hr → core.
  const packaged = Object.values(plan.modules).flat();
  assert.ok(!packaged.includes('assets/cross.js'), 'cross-module shared chunk stays in core');
});

test('provisionEntitledModules skips packages hidden by the signed tenant config', async () => {
  const { provisionEntitledModules, resetModuleInstallerState } = await import('../src/modules/moduleInstaller.ts');
  resetModuleInstallerState();
  const CONFIG_KEY = 'central_cached_config';
  globalThis.localStorage.setItem(CONFIG_KEY, JSON.stringify({
    schemaVersion: 1,
    configurationVersion: 1,
    config: { allowedModules: ['sales'], hiddenMenus: ['/secret-page'] },
  }));
  try {
    const installed: string[] = [];
    const api = {
      status: async () => ({ buildId: 'b'.repeat(64), installed: [] }),
      available: async () => [
        { moduleId: 'pg-sales-a', version: '1.0.0', sizeBytes: 1, installed: false, modules: ['sales'], pages: ['/orders'] },
        { moduleId: 'pg-sales-b', version: '1.0.0', sizeBytes: 1, installed: false, modules: ['sales'], pages: ['/secret-page'] },
        { moduleId: 'pg-hr-c', version: '1.0.0', sizeBytes: 1, installed: false, modules: ['hr'], pages: ['/employees'] },
      ],
      install: async (id: string) => { installed.push(id); },
    };
    const result = await provisionEntitledModules(api);
    // Only the visible sales package remains → its module installs once.
    // The hidden page package and the non-entitled hr module are never requested.
    assert.deepEqual(installed, ['sales']);
    assert.deepEqual(result.catalog.map((m) => m.moduleId), ['pg-sales-a']);
    assert.deepEqual(result.installed, ['sales']);
    assert.deepEqual(result.failed, []);
  } finally {
    globalThis.localStorage.removeItem(CONFIG_KEY);
    resetModuleInstallerState();
  }
});

test('provisionEntitledModules keeps a package when only some of its routes are hidden', async () => {
  const { provisionEntitledModules, resetModuleInstallerState } = await import('../src/modules/moduleInstaller.ts');
  resetModuleInstallerState();
  const CONFIG_KEY = 'central_cached_config';
  globalThis.localStorage.setItem(CONFIG_KEY, JSON.stringify({
    schemaVersion: 1,
    configurationVersion: 1,
    config: { allowedModules: ['sales'], hiddenMenus: ['/daily/sales'] },
  }));
  try {
    const installed: string[] = [];
    const api = {
      status: async () => ({ buildId: 'b'.repeat(64), installed: [] }),
      available: async () => [
        // DailyPage serves three routes; hiding one must not remove the file.
        { moduleId: 'pg-sales-daily', version: '1.0.0', sizeBytes: 1, installed: false, modules: ['sales', 'purchasing'], pages: ['/daily/sales', '/daily/purchases'] },
      ],
      install: async (id: string) => { installed.push(id); },
    };
    const result = await provisionEntitledModules(api);
    assert.deepEqual(result.catalog.map((m) => m.moduleId), ['pg-sales-daily']);
    assert.deepEqual(installed.sort(), ['purchasing', 'sales']);
  } finally {
    globalThis.localStorage.removeItem(CONFIG_KEY);
    resetModuleInstallerState();
  }
});

test('provisionEntitledModules installs only entitled catalog modules and reports progress', async () => {
  const { provisionEntitledModules, resetModuleInstallerState } = await import('../src/modules/moduleInstaller.ts');
  resetModuleInstallerState();

  // Non module-packages build (no buildId): nothing to provision.
  const plain = await provisionEntitledModules({
    status: async () => ({ installed: [] }),
    install: async () => undefined,
    available: async () => [],
  });
  assert.equal(plain.attempted, false);

  const installedOrder: string[] = [];
  const progress: Array<{ completed: number; total: number; currentModuleId?: string; finishedModuleId?: string; finishedOk?: boolean }> = [];
  let catalogSeen: string[] = [];
  const api = {
    status: async () => ({ buildId: 'b'.repeat(64), installed: [] }),
    available: async () => [
      { moduleId: 'sales', version: '1.0.0', sizeBytes: 10, installed: false },
      { moduleId: 'hr', version: '1.0.0', sizeBytes: 10, installed: false },
      { moduleId: 'finance', version: '1.0.0', sizeBytes: 10, installed: true },
    ],
    install: async (id: string) => {
      if (id === 'hr') throw new Error('offline');
      installedOrder.push(id);
    },
  };
  const result = await provisionEntitledModules(api, (p) => progress.push(p), (modules) => { catalogSeen = modules.map((m) => m.moduleId); });

  assert.equal(result.attempted, true);
  assert.deepEqual(catalogSeen, ['sales', 'hr', 'finance']);
  assert.deepEqual(installedOrder, ['sales'], 'installed entries and failed modules are not retried blindly');
  assert.deepEqual(result.installed, ['sales']);
  assert.deepEqual(result.failed, [{ moduleId: 'hr', reason: 'offline' }]);
  assert.equal(progress.at(-1)?.completed, 2);
  assert.equal(progress.at(-1)?.total, 2);

  // Already-ready modules are skipped on a second run.
  const again = await provisionEntitledModules({
    status: async () => ({ buildId: 'b'.repeat(64), installed: [{ moduleId: 'sales' }] }),
    available: async () => [{ moduleId: 'sales', version: '1.0.0', sizeBytes: 10, installed: true }],
    install: async () => { throw new Error('must not be called'); },
  });
  assert.deepEqual(again.installed, []);
  assert.deepEqual(again.failed, []);

  // No installer API at all → no-op.
  const noApi = await provisionEntitledModules(undefined);
  assert.equal(noApi.attempted, false);
  resetModuleInstallerState();
});
