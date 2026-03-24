import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: 'src/index.ts',
      name: 'ImageCanvasEditorVue',
      formats: ['es', 'cjs', 'umd'],
      fileName: (format) => {
        if (format === 'cjs') {
          return 'index.cjs'
        }

        if (format === 'umd') {
          return 'index.umd.js'
        }

        return 'index.js'
      },
    },
    rollupOptions: {
      external: ['vue', '@image-canvas-editor/editor-core'],
      output: {
        globals: {
          vue: 'Vue',
          '@image-canvas-editor/editor-core': 'ImageCanvasEditorCore',
        },
      },
    },
  },
});
