import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import path from 'path';

const packageJson = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'));

// Content Security Policy is injected into index.html at serve/build time so the
// packaged app can run without 'unsafe-inline' for scripts while the dev server
// still allows the react-refresh preamble that @vitejs/plugin-react injects.
const CSP_COMMON = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'", // React inline style attributes
  "img-src 'self' data: blob:",
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

export default defineConfig(({ command }) => {
  const buildFlavor = process.env.CERAMISYS_BUILD_FLAVOR
    ?? (command === 'serve' ? 'local' : 'commercial');
  if (buildFlavor !== 'local' && buildFlavor !== 'commercial') {
    throw new Error(`Invalid CERAMISYS_BUILD_FLAVOR: ${buildFlavor}`);
  }
  const activationBypass = buildFlavor === 'local';
  const plugins: Plugin[] = [react(), appCspPlugin()];

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
    },
    clearScreen: false,
    logLevel: 'info',
    // Electron loads the packaged renderer from file://, so root-absolute URLs
    // like /assets/... resolve outside the app bundle and leave a blank window.
    // Relative URLs also work when Vite serves the app from the LAN host root.
    base: './',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        crypto: path.resolve(__dirname, './src/shims/crypto.ts'),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
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
      target: process.env.CERAMISYS_LEGACY_BUILD === '1' ? 'chrome108' : 'modules',
      chunkSizeWarningLimit: 2000,
      // Keep stable third-party code cacheable and out of the application entry chunk.
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) return 'vendor-react';
            if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts';
            if (id.includes('xlsx')) return 'vendor-xlsx';
            if (id.includes('jspdf')) return 'vendor-pdf';
            if (id.includes('sql.js')) return 'vendor-sqlite';
            return undefined;
          },
        },
      },
    },
  };
});
