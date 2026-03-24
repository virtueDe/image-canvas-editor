import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { verifyBuildOutput, verifyPackageOutput } from '../../scripts/build-output/verify-build-output.mjs'
import { cleanupOutputs, repoRoot, runPnpm } from '../helpers/build-output-test-env.mjs'

async function ensureWorkspaceBuildReady() {
  await cleanupOutputs()
  const buildResult = await runPnpm(['build'])

  assert.equal(buildResult.code, 0, `基线构建应成功。\nstdout:\n${buildResult.stdout}\nstderr:\n${buildResult.stderr}`)
}

async function withRenamedPath(relativePath, run) {
  const absolutePath = path.join(repoRoot, relativePath)
  const backupPath = `${absolutePath}.bak-test`

  await rename(absolutePath, backupPath)

  try {
    await run()
  } finally {
    await rename(backupPath, absolutePath)
  }
}

beforeEach(async () => {
  await ensureWorkspaceBuildReady()
})

test('verify-build-output：完整产物下应返回 ready', async () => {
  const report = await verifyBuildOutput()

  assert.equal(report.results.length, 3)
  assert.deepEqual(
    report.results.map((entry) => entry.status),
    ['ready', 'ready', 'ready'],
  )
})

test('verify-build-output：缺少脚本文件时应失败', async () => {
  await withRenamedPath('editor/core/dist/index.js', async () => {
    const report = await verifyPackageOutput('@image-canvas-editor/editor-core')

    assert.equal(report.status, 'failed')
    assert.equal(report.errors.some((entry) => entry.includes('index.js')), true)
  })
})

test('verify-build-output：缺少类型声明时应失败', async () => {
  await withRenamedPath('editor/vue3/dist/index.d.ts', async () => {
    const report = await verifyPackageOutput('@image-canvas-editor/editor-vue')

    assert.equal(report.status, 'failed')
    assert.equal(report.errors.some((entry) => entry.includes('index.d.ts')), true)
  })
})

test('verify-build-output：根 dist 镜像错误时应失败', async () => {
  const nestedLibraryArtifact = path.join(repoRoot, 'dist/editor/core/dist/should-not-exist.txt')

  await mkdir(path.dirname(nestedLibraryArtifact), { recursive: true })
  await writeFile(nestedLibraryArtifact, 'bad artifact', 'utf8')

  try {
    const report = await verifyPackageOutput('@image-canvas-editor/web-vue')

    assert.equal(report.status, 'failed')
    assert.equal(
      report.errors.some((entry) => entry.includes('兼容产物目录与规范产物目录不一致') || entry.includes('不应包含库包规范产物')),
      true,
    )
  } finally {
    await rm(path.join(repoRoot, 'dist/editor'), { recursive: true, force: true })
  }
})
