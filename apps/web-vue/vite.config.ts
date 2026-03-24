import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import UnoCSS from 'unocss/vite';

export default defineConfig({
  plugins: [vue(), UnoCSS()],
  resolve: {
    alias: {
      '@image-canvas-editor/editor-core': new URL('../../editor/core/src/index.ts', import.meta.url).pathname,
      '@image-canvas-editor/editor-vue': new URL('../../editor/vue3/src/index.ts', import.meta.url).pathname,
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
