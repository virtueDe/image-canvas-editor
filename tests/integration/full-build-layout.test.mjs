import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

import {
  assertDirectoryExists,
  assertDirectorySnapshotEqual,
  assertRequiredFiles,
  createDirectorySnapshot,
} from '../helpers/build-output-assertions.mjs'
import { cleanupOutputs, repoRoot, runPnpm } from '../helpers/build-output-test-env.mjs'

test('full-build-layout：pnpm build 后应形成 3 个包的规范产物与根 dist 镜像', async () => {
  await cleanupOutputs()

  const result = await runPnpm(['build'])

  assert.equal(result.code, 0, `pnpm build 应成功退出。\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`)

  await assertDirectoryExists(path.join(repoRoot, 'editor/core/dist'), 'editor-core 规范产物目录')
  await assertRequiredFiles(path.join(repoRoot, 'editor/core/dist'), ['index.js', 'index.cjs', 'index.umd.js', 'index.d.ts'], 'editor-core 规范产物目录')

  await assertDirectoryExists(path.join(repoRoot, 'editor/vue3/dist'), 'editor-vue 规范产物目录')
  await assertRequiredFiles(path.join(repoRoot, 'editor/vue3/dist'), ['index.js', 'index.cjs', 'index.umd.js', 'index.d.ts'], 'editor-vue 规范产物目录')

  await assertDirectoryExists(path.join(repoRoot, 'apps/web-vue/dist'), 'web-vue 规范产物目录')
  await assertRequiredFiles(path.join(repoRoot, 'apps/web-vue/dist'), ['index.html', 'assets/*'], 'web-vue 规范产物目录')

  await assertDirectoryExists(path.join(repoRoot, 'dist'), '根 dist 兼容出口')
  await assertRequiredFiles(path.join(repoRoot, 'dist'), ['index.html', 'assets/*'], '根 dist 兼容出口')

  const canonicalWebSnapshot = await createDirectorySnapshot(path.join(repoRoot, 'apps/web-vue/dist'))
  const compatibilitySnapshot = await createDirectorySnapshot(path.join(repoRoot, 'dist'))

  assertDirectorySnapshotEqual(compatibilitySnapshot, canonicalWebSnapshot, '根 dist 与 apps/web-vue/dist 镜像快照')
})
