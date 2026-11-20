import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import path from 'path';
import { parseDeploymentModules, stripExcludedModuleImports } from './src/modules/featureModuleLoader';
import { MODULE_IDS } from './src/config/moduleRegistry';
import { planModuleChunks, type ChunkInfo } from './src/modules/chunkOwnership';

const packageJson = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'));

// Content Security Policy is injected into index.html at serve/build time so the
// packaged app can run without 'unsafe-inline' for scripts while the dev server
// still allows the react-refresh preamble that @vitejs/plugin-react injects.
const CSP_COMMON = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'", // React inline style attributes
  "img-src 'self' data: blob:",
  "frame-src 'self' blob:",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'none'",
];

const CSP_BY_COMMAND = {
  // HMR needs a websocket connection and the inline refresh preamble.
  serve: [...CSP_COMMON, "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'", "connect-src 'self' blob: ws: http://localhost:* http://127.0.0.1:*"].join('; '),
  // sql.js needs 'wasm-unsafe-eval'; central network calls use validated Electron IPC.
  build: [...CSP_COMMON, "script-src 'self' 'wasm-unsafe-eval'", "connect-src 'self' blob:"].join('; '),
} as const;

function appCspPlugin(): Plugin {
  return {
    name: 'ceramisys-app-csp',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        const csp = ctx.server ? CSP_BY_COMMAND.serve : CSP_BY_COMMAND.build;
        return html.replace('__APP_CSP__', csp);
      },
    },
  };
}

// Feature-based deployment: pages of modules left out of CERAMISYS_FEATURE_MODULES
// lose their dynamic import, so their chunks are never emitted.
function featureModulesPlugin(enabledModules: string[]): Plugin {
  return {
    name: 'ceramisys-feature-modules',
    enforce: 'pre',
    transform(code, id) {
      // Vite normalizes module ids to forward slashes on every platform.
      if (!/\/src\/.*\.tsx?$/.test(id) || id.includes('/src/modules/') || !code.includes('moduleLazy(')) return undefined;
      return { code: stripExcludedModuleImports(code, enabledModules).code, map: null };
    },
  };
}

// Downloadable modules: records which page file each `moduleLazy` declaration
// imports, then (after bundling) emits `module-chunks.json` describing which
// emitted files belong exclusively to one module. scripts/package-modules.cjs
// turns that into signed packages. Only active with CERAMISYS_MODULE_PACKAGES=1.
function moduleChunkManifestPlugin(): Plugin {
  const DECLARATION = /moduleLazy\('([\w-]+)', \(\) => import\('([^']+)'\)/g;
  // resolved page id → owning module and the files that import it through moduleLazy
  const pages = new Map<string, { moduleId: string; importers: Set<string>; conflict: boolean }>();
  return {
    name: 'ceramisys-module-chunk-manifest',
    enforce: 'pre',
    async transform(code, id) {
      if (!/\/src\/.*\.tsx?$/.test(id) || id.includes('/src/modules/') || !code.includes('moduleLazy(')) return undefined;
      for (const match of code.matchAll(DECLARATION)) {
        const resolved = await this.resolve(match[2], id);
        if (!resolved) continue;
        const entry = pages.get(resolved.id) ?? { moduleId: match[1], importers: new Set<string>(), conflict: false };
        // One file serving pages of two modules (e.g. DailyPage) cannot belong to either.
        if (entry.moduleId !== match[1]) entry.conflict = true;
        entry.importers.add(id);
        pages.set(resolved.id, entry);
      }
      return undefined;
    },
    generateBundle(_options, bundle) {
      const roots: Record<string, string> = {};
      for (const [pageId, entry] of pages) {
        const info = this.getModuleInfo(pageId);
        // Only pages whose every importer is a moduleLazy declaration can be split out.
        const pure = info
          && !entry.conflict
          && info.importers.length === 0
          && info.dynamicImporters.every((importer) => entry.importers.has(importer));
        if (pure) roots[pageId.replace(/\\/g, '/')] = entry.moduleId;
        else this.warn(`Module page ${pageId} is also imported outside moduleLazy; it stays in the core bundle.`);
      }
      const chunks: ChunkInfo[] = [];
      for (const item of Object.values(bundle)) {
        if (item.type !== 'chunk') continue;
        chunks.push({
          fileName: item.fileName,
          isEntry: item.isEntry,
          facadeModuleId: item.facadeModuleId ? item.facadeModuleId.replace(/\\/g, '/') : null,
          imports: item.imports,
          dynamicImports: item.dynamicImports,
          css: [...(item.viteMetadata?.importedCss ?? [])],
        });
      }
      const plan = planModuleChunks(chunks, roots);
      this.emitFile({ type: 'asset', fileName: 'module-chunks.json', source: JSON.stringify(plan, null, 2) });
    },
  };
}

export default defineConfig(({ command }) => {
  const buildFlavor = process.env.CERAMISYS_BUILD_FLAVOR
    ?? (command === 'serve' ? 'local' : 'commercial');
  if (buildFlavor !== 'local' && buildFlavor !== 'commercial') {
    throw new Error(`Invalid CERAMISYS_BUILD_FLAVOR: ${buildFlavor}`);
  }
  const activationBypass = buildFlavor === 'local';
  const featureModules = process.env.CERAMISYS_FEATURE_MODULES ?? 'all';
  const deployment = parseDeploymentModules(featureModules);
  if (deployment.unknown.length > 0) {
    throw new Error(`Unknown CERAMISYS_FEATURE_MODULES ids: ${deployment.unknown.join(', ')}`);
  }
  const modulePackages = process.env.CERAMISYS_MODULE_PACKAGES === '1';
  if (modulePackages && deployment.enabled.length !== MODULE_IDS.length) {
    throw new Error('CERAMISYS_MODULE_PACKAGES=1 needs a full build; do not combine it with CERAMISYS_FEATURE_MODULES.');
  }
  const plugins: Plugin[] = [react(), appCspPlugin(), featureModulesPlugin(deployment.enabled)];
  if (modulePackages && command === 'build') plugins.push(moduleChunkManifestPlugin());

  if (command === 'build') {
    plugins.push({
      name: 'ceramisys-build-flavor',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'build-info.json',
          source: JSON.stringify({
            flavor: buildFlavor,
            activationBypass,
            featureModules: deployment.enabled,
            modulePackages,
          }),
        });
      },
    });
  }

  return {
    plugins,
    define: {
      __APP_VERSION__: JSON.stringify(packageJson.version),
      __BYPASS_FIRST_RUN_ACTIVATION__: JSON.stringify(activationBypass),
      __CERAMISYS_LEGACY_BUILD__: JSON.stringify(process.env.CERAMISYS_LEGACY_BUILD === '1'),
      // Feature-based deployment: comma-separated module ids, or "all" (default).
      __CERAMISYS_FEATURE_MODULES__: JSON.stringify(featureModules),
      // Downloadable modules: module pages ask the desktop shell to install their module first.
      __CERAMISYS_MODULE_PACKAGES__: JSON.stringify(modulePackages),
    },
    clearScreen: false,
    logLevel: 'info',
    // Electron loads the packaged renderer from file://, so root-absolute URLs
    // like /assets/... resolve outside the app bundle and leave a blank window.
    // Relative URLs also work when Vite serves the app from the LAN host root.
    base: './',
    worker: {
      format: 'es',
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        crypto: path.resolve(__dirname, './src/shims/crypto.ts'),
        // Client code imports 'node:crypto' (createHash, default import); the
        // bare 'crypto' alias above does not match the 'node:' prefix.
        'node:crypto': path.resolve(__dirname, './src/shims/crypto.ts'),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      headers: {
        'Cache-Control': 'no-store',
      },
      watch: {
        ignored: [
          '**/.electron-data/**',
          '**/release/**',
          'release/**',
        ],
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: false,
      minify: 'esbuild',
      cssMinify: true,
      reportCompressedSize: false,
      target: process.env.CERAMISYS_LEGACY_BUILD === '1' ? 'chrome108' : 'modules',
      chunkSizeWarningLimit: 2000,
      // Web Workers bundled as ES modules so Vite can tree-shake them
      // correctly. IIFE/UMD are incompatible with code-splitting.
      worker: {
        format: 'es',
      },
      // Keep stable third-party code cacheable and out of the application entry chunk.
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) return 'vendor-react';
            if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts';
            if (id.includes('xlsx')) return 'vendor-xlsx';
            if (id.includes('jspdf') || id.includes('pdfjs')) return 'vendor-pdf';
            if (id.includes('tesseract')) return 'vendor-ocr';
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (id.includes('sql.js')) return 'vendor-sqlite';
            return undefined;
          },
        },
      },
    },
  };
});
