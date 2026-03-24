import test from 'node:test'
import assert from 'node:assert/strict'
import { stat } from 'node:fs/promises'
import path from 'node:path'

import {
  assertDirectorySnapshotEqual,
  assertRequiredFiles,
  createDirectorySnapshot,
} from '../helpers/build-output-assertions.mjs'
import { cleanupOutputs, repoRoot, runPnpm } from '../helpers/build-output-test-env.mjs'

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

test('package-rebuild-isolation：重建 editor-core 时不得清空其他包产物与根 dist', async () => {
  await cleanupOutputs()

  const baselineBuildResult = await runPnpm(['build'])
  assert.equal(
    baselineBuildResult.code,
    0,
    `基线构建应成功退出。\nstdout:\n${baselineBuildResult.stdout}\nstderr:\n${baselineBuildResult.stderr}`,
  )

  await assertRequiredFiles(path.join(repoRoot, 'editor/core/dist'), ['index.js', 'index.cjs', 'index.umd.js', 'index.d.ts'], 'editor-core 基线产物目录')
  await assertRequiredFiles(path.join(repoRoot, 'editor/vue3/dist'), ['index.js', 'index.cjs', 'index.umd.js', 'index.d.ts'], 'editor-vue 基线产物目录')
  await assertRequiredFiles(path.join(repoRoot, 'apps/web-vue/dist'), ['index.html', 'assets/*'], 'web-vue 基线产物目录')
  await assertRequiredFiles(path.join(repoRoot, 'dist'), ['index.html', 'assets/*'], '根 dist 基线产物目录')

  const otherSnapshotsBefore = {
    editorVue: await createDirectorySnapshot(path.join(repoRoot, 'editor/vue3/dist')),
    webVue: await createDirectorySnapshot(path.join(repoRoot, 'apps/web-vue/dist')),
    compatibility: await createDirectorySnapshot(path.join(repoRoot, 'dist')),
  }

  const targetFilePath = path.join(repoRoot, 'editor/core/dist/index.js')
  const beforeTargetStat = await stat(targetFilePath)

  await sleep(1200)

  const rebuildResult = await runPnpm(['--filter', '@image-canvas-editor/editor-core', 'build'])
  assert.equal(rebuildResult.code, 0, `editor-core 单包构建应成功退出。\nstdout:\n${rebuildResult.stdout}\nstderr:\n${rebuildResult.stderr}`)
  await assertRequiredFiles(path.join(repoRoot, 'editor/core/dist'), ['index.js', 'index.cjs', 'index.umd.js', 'index.d.ts'], 'editor-core 重建产物目录')

  const afterTargetStat = await stat(targetFilePath)
  assert.ok(
    afterTargetStat.mtimeMs > beforeTargetStat.mtimeMs,
    'editor-core 重建后应刷新自己的规范产物时间戳',
  )

  const otherSnapshotsAfter = {
    editorVue: await createDirectorySnapshot(path.join(repoRoot, 'editor/vue3/dist')),
    webVue: await createDirectorySnapshot(path.join(repoRoot, 'apps/web-vue/dist')),
    compatibility: await createDirectorySnapshot(path.join(repoRoot, 'dist')),
  }

  assertDirectorySnapshotEqual(otherSnapshotsAfter.editorVue, otherSnapshotsBefore.editorVue, 'editor-vue 产物快照')
  assertDirectorySnapshotEqual(otherSnapshotsAfter.webVue, otherSnapshotsBefore.webVue, 'web-vue 产物快照')
  assertDirectorySnapshotEqual(otherSnapshotsAfter.compatibility, otherSnapshotsBefore.compatibility, '根 dist 兼容产物快照')
})
