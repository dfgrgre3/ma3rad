import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
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
