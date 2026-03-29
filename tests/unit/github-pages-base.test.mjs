import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeBasePath, resolveGithubPagesBase } from '../../apps/web-vue/github-pages-base.mjs'

test('normalizeBasePath：应补齐前后斜杠', () => {
  assert.equal(normalizeBasePath('image-canvas-editor'), '/image-canvas-editor/')
  assert.equal(normalizeBasePath('/image-canvas-editor'), '/image-canvas-editor/')
  assert.equal(normalizeBasePath('/image-canvas-editor/'), '/image-canvas-editor/')
})

test('resolveGithubPagesBase：本地开发默认使用根路径', () => {
  assert.equal(resolveGithubPagesBase({}), '/')
})

test('resolveGithubPagesBase：显式 base 配置优先级最高', () => {
  assert.equal(
    resolveGithubPagesBase({
      VITE_BASE_PATH: 'preview',
      GITHUB_ACTIONS: 'true',
      GITHUB_REPOSITORY: 'virtueDe/image-canvas-editor',
    }),
    '/preview/',
  )
})

test('resolveGithubPagesBase：仓库 Pages 应使用仓库名作为子路径', () => {
  assert.equal(
    resolveGithubPagesBase({
      GITHUB_ACTIONS: 'true',
      GITHUB_REPOSITORY: 'virtueDe/image-canvas-editor',
    }),
    '/image-canvas-editor/',
  )
})

test('resolveGithubPagesBase：用户或组织主页仓库应保持根路径', () => {
  assert.equal(
    resolveGithubPagesBase({
      GITHUB_ACTIONS: 'true',
      GITHUB_REPOSITORY: 'virtueDe/virtuede.github.io',
    }),
    '/',
  )
})
