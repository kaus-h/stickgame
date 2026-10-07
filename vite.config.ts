import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: true,
    // Phaser alone is ~1.4 MB minified; the real download budget is set and tracked in GMR-36/GMR-53.
    chunkSizeWarningLimit: 1600,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
