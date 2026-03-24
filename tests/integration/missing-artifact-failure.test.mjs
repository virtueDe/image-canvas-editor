import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

import {
  assertNonZeroExitCode,
  createDirectorySnapshot,
} from '../helpers/build-output-assertions.mjs'
import {
  cleanupOutputs,
  repoRoot,
  runPnpm,
  withPatchedJson,
} from '../helpers/build-output-test-env.mjs'

test('missing-artifact-failure：库包缺少必需产物时，构建必须失败且不能误报成功', async () => {
  await cleanupOutputs()

  const restorePackageJson = await withPatchedJson('editor/vue3/package.json', (packageJson) => ({
    ...packageJson,
    scripts: {
      ...(packageJson.scripts ?? {}),
      'build:artifact': 'node -e "process.exit(0)"',
    },
  }))

  try {
    const result = await runPnpm(['--filter', '@image-canvas-editor/editor-vue', 'build'])

    assertNonZeroExitCode(result, '@image-canvas-editor/editor-vue build')

    const combinedOutput = `${result.stdout}\n${result.stderr}`.toLowerCase()
    assert.equal(
      combinedOutput.includes('success') || combinedOutput.includes('成功'),
      false,
      '缺少必需产物时不应输出误导性的成功信息',
    )

    const distPath = path.join(repoRoot, 'editor/vue3/dist')
    let distSnapshot = null

    try {
      distSnapshot = await createDirectorySnapshot(distPath)
    } catch {
      distSnapshot = null
    }

    assert.ok(
      distSnapshot === null || distSnapshot.every((entry) => entry.path !== 'index.d.ts'),
      '缺少类型声明的失败场景下，不应把库包标记成完整可用产物',
    )
  } finally {
    await restorePackageJson()
  }
})
