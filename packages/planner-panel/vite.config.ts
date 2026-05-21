import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'index.html'),
    },
  },
  resolve: {
    alias: {
      '@dai-desktop/ui':   path.resolve(__dirname, '../dai-ui/src/index.ts'),
      '@dai-desktop/core': path.resolve(__dirname, '../dai-core/src/index.ts'),
    },
  },
});
