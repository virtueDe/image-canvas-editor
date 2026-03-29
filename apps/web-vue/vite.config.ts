import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import UnoCSS from 'unocss/vite';
// `node --test` 直接导入 `.mjs` 更稳，这里显式忽略 TS 对该模块声明的抱怨。
// @ts-expect-error 本地 ESM 辅助模块供 Vite 配置与 Node 校验脚本共用。
import { resolveGithubPagesBase } from './github-pages-base.mjs';

export default defineConfig({
  base: resolveGithubPagesBase(),
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
