import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: 'src/index.ts',
      name: 'ImageCanvasEditorCore',
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
      external: [],
    },
  },
});
