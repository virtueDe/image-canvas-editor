import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

import {
  assertDirectoryExists,
  assertNonZeroExitCode,
  assertRequiredFiles,
} from '../helpers/build-output-assertions.mjs'
import {
  cleanupOutputs,
  repoRoot,
  runPnpm,
  withPatchedJson,
} from '../helpers/build-output-test-env.mjs'

test('root-build：pnpm build 必须产出 3 个包的规范目录与根 dist 兼容出口', async () => {
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
})

test('package-build：每个包的单包构建都必须成功并产出自己的规范目录', async (t) => {
  const cases = [
    {
      name: '@image-canvas-editor/editor-core',
      args: ['--filter', '@image-canvas-editor/editor-core', 'build'],
      outDir: 'editor/core/dist',
      requiredFiles: ['index.js', 'index.cjs', 'index.umd.js', 'index.d.ts'],
    },
    {
      name: '@image-canvas-editor/editor-vue',
      args: ['--filter', '@image-canvas-editor/editor-vue', 'build'],
      outDir: 'editor/vue3/dist',
      requiredFiles: ['index.js', 'index.cjs', 'index.umd.js', 'index.d.ts'],
    },
    {
      name: '@image-canvas-editor/web-vue',
      args: ['--filter', '@image-canvas-editor/web-vue', 'build'],
      outDir: 'apps/web-vue/dist',
      requiredFiles: ['index.html', 'assets/*'],
      compatibilityOutDir: 'dist',
    },
  ]

  for (const testCase of cases) {
    await t.test(testCase.name, async () => {
      await cleanupOutputs()

      const result = await runPnpm(testCase.args)

      assert.equal(result.code, 0, `${testCase.name} 单包构建应成功退出。\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`)
      await assertDirectoryExists(path.join(repoRoot, testCase.outDir), `${testCase.name} 规范产物目录`)
      await assertRequiredFiles(path.join(repoRoot, testCase.outDir), testCase.requiredFiles, `${testCase.name} 规范产物目录`)

      if (testCase.compatibilityOutDir) {
        await assertDirectoryExists(path.join(repoRoot, testCase.compatibilityOutDir), `${testCase.name} 兼容产物目录`)
        await assertRequiredFiles(path.join(repoRoot, testCase.compatibilityOutDir), testCase.requiredFiles, `${testCase.name} 兼容产物目录`)
      }
    })
  }
})

test('build-failure-signals：缺少必需产物时必须返回非 0，且不能误报成功', async () => {
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
  } finally {
    await restorePackageJson()
  }
})
