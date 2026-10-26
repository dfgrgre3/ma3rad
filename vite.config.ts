import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

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
  serve: [...CSP_COMMON, "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'", "connect-src 'self' blob: ws: http://localhost:*"].join('; '),
  // sql.js needs 'wasm-unsafe-eval'; no inline scripts are emitted by the build.
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

export default defineConfig({
  plugins: [react(), appCspPlugin()],
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
    strictPort: false,
    watch: {
      ignored: ['**/.electron-data/**'],
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
    // Keep stable third-party code cacheable and out of the application entry chunk.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) return 'vendor-react';
          if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts';
          if (id.includes('sql.js')) return 'vendor-sqlite';
          return undefined;
        },
      },
    },
  }
});
