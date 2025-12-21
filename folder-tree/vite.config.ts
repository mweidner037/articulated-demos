import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  root: './src/site',
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
