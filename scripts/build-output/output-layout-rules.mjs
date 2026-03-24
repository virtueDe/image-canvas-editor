function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)

    for (const nestedValue of Object.values(value)) {
      deepFreeze(nestedValue)
    }
  }

  return value
}

export const outputLayoutRules = deepFreeze([
  {
    packageName: '@image-canvas-editor/editor-core',
    sourcePackagePath: 'editor/core',
    canonicalOutDir: 'editor/core/dist',
    cleanScope: ['editor/core/dist'],
    compatibilityMirrorTo: null,
    requiredFiles: ['index.js', 'index.cjs', 'index.umd.js', 'index.d.ts'],
  },
  {
    packageName: '@image-canvas-editor/editor-vue',
    sourcePackagePath: 'editor/vue3',
    canonicalOutDir: 'editor/vue3/dist',
    cleanScope: ['editor/vue3/dist'],
    compatibilityMirrorTo: null,
    requiredFiles: ['index.js', 'index.cjs', 'index.umd.js', 'index.d.ts'],
  },
  {
    packageName: '@image-canvas-editor/web-vue',
    sourcePackagePath: 'apps/web-vue',
    canonicalOutDir: 'apps/web-vue/dist',
    cleanScope: ['apps/web-vue/dist'],
    compatibilityMirrorTo: 'dist',
    requiredFiles: ['index.html', 'assets/*'],
  },
])

export const outputLayoutRulesByPackage = deepFreeze(
  Object.fromEntries(outputLayoutRules.map((entry) => [entry.packageName, entry])),
)

export function getOutputLayoutRule(packageName) {
  return outputLayoutRulesByPackage[packageName] ?? null
}
