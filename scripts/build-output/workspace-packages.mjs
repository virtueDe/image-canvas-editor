function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)

    for (const nestedValue of Object.values(value)) {
      deepFreeze(nestedValue)
    }
  }

  return value
}

export const workspacePackages = deepFreeze([
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
])

export const workspacePackageNames = deepFreeze(workspacePackages.map((entry) => entry.packageName))

export const workspacePackagesByName = deepFreeze(
  Object.fromEntries(workspacePackages.map((entry) => [entry.packageName, entry])),
)

export const workspacePackagesByPath = deepFreeze(
  Object.fromEntries(workspacePackages.map((entry) => [entry.packagePath, entry])),
)

export function getWorkspacePackage(packageName) {
  return workspacePackagesByName[packageName] ?? null
}

export function getWorkspacePackageByPath(packagePath) {
  return workspacePackagesByPath[packagePath] ?? null
}
