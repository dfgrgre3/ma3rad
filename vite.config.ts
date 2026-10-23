import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: '/',
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
