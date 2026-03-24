import { workspacePackageNames } from './workspace-packages.mjs'

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)

    for (const nestedValue of Object.values(value)) {
      deepFreeze(nestedValue)
    }
  }

  return value
}

export const artifactSetRules = deepFreeze([
  {
    ownerPackage: '@image-canvas-editor/editor-core',
    requiredScriptFiles: ['index.js', 'index.cjs', 'index.umd.js'],
    requiredTypeFiles: ['index.d.ts'],
    requiredAssetPatterns: [],
    htmlEntry: null,
    allowedStatusTransitions: ['planned', 'building', 'ready', 'failed'],
  },
  {
    ownerPackage: '@image-canvas-editor/editor-vue',
    requiredScriptFiles: ['index.js', 'index.cjs', 'index.umd.js'],
    requiredTypeFiles: ['index.d.ts'],
    requiredAssetPatterns: [],
    htmlEntry: null,
    allowedStatusTransitions: ['planned', 'building', 'ready', 'failed'],
  },
  {
    ownerPackage: '@image-canvas-editor/web-vue',
    requiredScriptFiles: [],
    requiredTypeFiles: [],
    requiredAssetPatterns: ['assets/*'],
    htmlEntry: 'index.html',
    allowedStatusTransitions: ['planned', 'building', 'ready', 'failed'],
  },
])

export const artifactSetRulesByPackage = deepFreeze(
  Object.fromEntries(artifactSetRules.map((entry) => [entry.ownerPackage, entry])),
)

export function getArtifactSetRule(packageName) {
  return artifactSetRulesByPackage[packageName] ?? null
}

export function isKnownArtifactOwner(packageName) {
  return workspacePackageNames.includes(packageName)
}
