import { defineConfig } from 'vite';

export default defineConfig({
  base: '/vartan/',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
  },
});
