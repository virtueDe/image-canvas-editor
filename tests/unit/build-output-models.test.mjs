import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getWorkspacePackage,
  workspacePackageNames,
  workspacePackages,
} from '../../scripts/build-output/workspace-packages.mjs'
import {
  artifactSetRules,
  getArtifactSetRule,
  isKnownArtifactOwner,
} from '../../scripts/build-output/artifact-set-rules.mjs'
import {
  getOutputLayoutRule,
  outputLayoutRules,
} from '../../scripts/build-output/output-layout-rules.mjs'

test('workspace-packages：应声明 3 个包、正确类型、输出目录与依赖顺序', () => {
  assert.equal(workspacePackages.length, 3)
  assert.deepEqual(workspacePackageNames, [
    '@image-canvas-editor/editor-core',
    '@image-canvas-editor/editor-vue',
    '@image-canvas-editor/web-vue',
  ])

  assert.deepEqual(
    workspacePackages.map((entry) => ({
      packageName: entry.packageName,
      packagePath: entry.packagePath,
      packageType: entry.packageType,
      canonicalOutDir: entry.canonicalOutDir,
      compatibilityOutDir: entry.compatibilityOutDir,
      workspaceDeps: entry.workspaceDeps,
      buildOrder: entry.buildOrder,
    })),
    [
      {
        packageName: '@image-canvas-editor/editor-core',
        packagePath: 'editor/core',
        packageType: 'library',
        canonicalOutDir: 'editor/core/dist',
        compatibilityOutDir: null,
        workspaceDeps: [],
        buildOrder: 1,
      },
      {
        packageName: '@image-canvas-editor/editor-vue',
        packagePath: 'editor/vue3',
        packageType: 'library',
        canonicalOutDir: 'editor/vue3/dist',
        compatibilityOutDir: null,
        workspaceDeps: ['@image-canvas-editor/editor-core'],
        buildOrder: 2,
      },
      {
        packageName: '@image-canvas-editor/web-vue',
        packagePath: 'apps/web-vue',
        packageType: 'app',
        canonicalOutDir: 'apps/web-vue/dist',
        compatibilityOutDir: 'dist',
        workspaceDeps: ['@image-canvas-editor/editor-vue'],
        buildOrder: 3,
      },
    ],
  )

  assert.equal(getWorkspacePackage('@image-canvas-editor/editor-core')?.packagePath, 'editor/core')
  assert.equal(getWorkspacePackage('@image-canvas-editor/web-vue')?.compatibilityOutDir, 'dist')
})

test('artifact-set-rules：应与 3 个包的最小完整性规则一致', () => {
  assert.equal(artifactSetRules.length, 3)
  assert.equal(isKnownArtifactOwner('@image-canvas-editor/editor-core'), true)
  assert.equal(isKnownArtifactOwner('@image-canvas-editor/unknown'), false)

  assert.deepEqual(getArtifactSetRule('@image-canvas-editor/editor-core'), {
    ownerPackage: '@image-canvas-editor/editor-core',
    requiredScriptFiles: ['index.js', 'index.cjs', 'index.umd.js'],
    requiredTypeFiles: ['index.d.ts'],
    requiredAssetPatterns: [],
    htmlEntry: null,
    allowedStatusTransitions: ['planned', 'building', 'ready', 'failed'],
  })

  assert.deepEqual(getArtifactSetRule('@image-canvas-editor/web-vue'), {
    ownerPackage: '@image-canvas-editor/web-vue',
    requiredScriptFiles: [],
    requiredTypeFiles: [],
    requiredAssetPatterns: ['assets/*'],
    htmlEntry: 'index.html',
    allowedStatusTransitions: ['planned', 'building', 'ready', 'failed'],
  })
})

test('output-layout-rules：应只清理自己的规范目录，并保持 web 的根 dist 镜像', () => {
  assert.equal(outputLayoutRules.length, 3)

  assert.deepEqual(getOutputLayoutRule('@image-canvas-editor/editor-vue'), {
    packageName: '@image-canvas-editor/editor-vue',
    sourcePackagePath: 'editor/vue3',
    canonicalOutDir: 'editor/vue3/dist',
    cleanScope: ['editor/vue3/dist'],
    compatibilityMirrorTo: null,
    requiredFiles: ['index.js', 'index.cjs', 'index.umd.js', 'index.d.ts'],
  })

  assert.deepEqual(getOutputLayoutRule('@image-canvas-editor/web-vue'), {
    packageName: '@image-canvas-editor/web-vue',
    sourcePackagePath: 'apps/web-vue',
    canonicalOutDir: 'apps/web-vue/dist',
    cleanScope: ['apps/web-vue/dist'],
    compatibilityMirrorTo: 'dist',
    requiredFiles: ['index.html', 'assets/*'],
  })
})
