import { defineConfig } from 'vite';

export default defineConfig({
  root: 'demo',
  base: './',
  server: { port: 5178, strictPort: true, fs: { allow: ['..'] } },
  build: { outDir: '../demo-dist', emptyOutDir: true },
});
