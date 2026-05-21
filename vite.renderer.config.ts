import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',
  root: path.resolve(__dirname, 'src/renderer'),
  build: {
    outDir: path.resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@dai-desktop/ui':   path.resolve(__dirname, 'packages/dai-ui/src/index.ts'),
      '@dai-desktop/core': path.resolve(__dirname, 'packages/dai-core/src/index.ts'),
    },
  },
  define: {
    // Expose build-time env vars to the renderer process
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'process.env.PLANNER_DEV_URL': JSON.stringify(process.env.PLANNER_DEV_URL ?? ''),
    'process.platform': JSON.stringify(process.platform),
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  optimizeDeps: {
    // Exclude Node-only packages — they are only used in the main process
    exclude: [
      'electron',
      'node-llama-cpp',
      '@lancedb/lancedb',
      'tree-sitter',
      'chokidar',
    ],
  },
});
