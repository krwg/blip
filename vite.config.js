import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'renderer',
  base: './',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'renderer/index.html'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
