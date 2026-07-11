import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so assets work on GitHub Pages project sites (/vartan/).
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
  },
});
