import { access, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

import { getArtifactSetRule, isKnownArtifactOwner } from './artifact-set-rules.mjs'
import { getOutputLayoutRule } from './output-layout-rules.mjs'
import { getWorkspacePackage, workspacePackages } from './workspace-packages.mjs'

const currentFilePath = fileURLToPath(import.meta.url)
const scriptDirectory = path.dirname(currentFilePath)
const repoRoot = path.resolve(scriptDirectory, '../..')

function normalizeRelativePath(filePath) {
  return filePath.split(path.sep).join('/')
}

function escapeRegExp(source) {
  return source.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
}

function globToRegExp(pattern) {
  const normalizedPattern = normalizeRelativePath(pattern)
  let regexSource = '^'

  for (let index = 0; index < normalizedPattern.length; index += 1) {
    const currentChar = normalizedPattern[index]
    const nextChar = normalizedPattern[index + 1]

    if (currentChar === '*' && nextChar === '*') {
      regexSource += '.*'
      index += 1
      continue
    }

    if (currentChar === '*') {
      regexSource += '[^/]+'
      continue
    }

    regexSource += escapeRegExp(currentChar)
  }

  regexSource += '$'
  return new RegExp(regexSource)
}

async function pathExists(targetPath) {
  try {
    await access(targetPath)
    return true
  } catch {
    return false
  }
}

async function walkDirectory(rootDir, currentDir = rootDir) {
  const entries = await readdir(currentDir, { withFileTypes: true })
  const snapshots = []

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolutePath = path.join(currentDir, entry.name)
    const relativePath = normalizeRelativePath(path.relative(rootDir, absolutePath))

    if (entry.isDirectory()) {
      snapshots.push({
        path: relativePath,
        type: 'directory',
      })
      snapshots.push(...await walkDirectory(rootDir, absolutePath))
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    const fileBuffer = await readFile(absolutePath)
    snapshots.push({
      path: relativePath,
      type: 'file',
      size: fileBuffer.byteLength,
      sha1: createHash('sha1').update(fileBuffer).digest('hex'),
    })
  }

  return snapshots
}

function parseArgs(argv) {
  const parsedArgs = {
    packageName: null,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const currentArg = argv[index]

    if (currentArg === '--package') {
      parsedArgs.packageName = argv[index + 1] ?? null
      index += 1
    }
  }

  return parsedArgs
}

function getRequiredPatterns(packageName) {
  const artifactRule = getArtifactSetRule(packageName)
  const layoutRule = getOutputLayoutRule(packageName)

  if (!artifactRule || !layoutRule) {
    return []
  }

  return [
    ...artifactRule.requiredScriptFiles,
    ...artifactRule.requiredTypeFiles,
    ...(artifactRule.htmlEntry ? [artifactRule.htmlEntry] : []),
    ...artifactRule.requiredAssetPatterns,
    ...layoutRule.requiredFiles,
  ].filter((value, index, values) => values.indexOf(value) === index)
}

function missingPatternMessages(snapshotFiles, requiredPatterns, packageName) {
  return requiredPatterns
    .filter((requiredPattern) => {
      if (requiredPattern.includes('*')) {
        const matcher = globToRegExp(requiredPattern)
        return !snapshotFiles.some((entry) => matcher.test(entry.path))
      }

      return !snapshotFiles.some((entry) => entry.path === normalizeRelativePath(requiredPattern))
    })
    .map((requiredPattern) => `${packageName} 缺少必需产物：${requiredPattern}`)
}

async function verifyCompatibilityMirror(packageDefinition, layoutRule) {
  if (!layoutRule.compatibilityMirrorTo) {
    return []
  }

  const canonicalOutDir = path.join(repoRoot, layoutRule.canonicalOutDir)
  const compatibilityOutDir = path.join(repoRoot, layoutRule.compatibilityMirrorTo)
  const errors = []

  if (!await pathExists(compatibilityOutDir)) {
    errors.push(`${packageDefinition.packageName} 缺少兼容产物目录：${layoutRule.compatibilityMirrorTo}`)
    return errors
  }

  const canonicalSnapshot = await walkDirectory(canonicalOutDir)
  const compatibilitySnapshot = await walkDirectory(compatibilityOutDir)

  const canonicalSerialized = JSON.stringify(canonicalSnapshot)
  const compatibilitySerialized = JSON.stringify(compatibilitySnapshot)

  if (canonicalSerialized !== compatibilitySerialized) {
    errors.push(`${packageDefinition.packageName} 的兼容产物目录与规范产物目录不一致`)
  }

  const compatibilityFilePaths = compatibilitySnapshot
    .filter((entry) => entry.type === 'file')
    .map((entry) => entry.path)

  const forbiddenPatterns = ['editor/core/dist/**', 'editor/vue3/dist/**']
  for (const forbiddenPattern of forbiddenPatterns) {
    const matcher = globToRegExp(forbiddenPattern)
    if (compatibilityFilePaths.some((entry) => matcher.test(entry))) {
      errors.push(`${layoutRule.compatibilityMirrorTo} 不应包含库包规范产物：${forbiddenPattern}`)
    }
  }

  return errors
}

export async function verifyPackageOutput(packageName) {
  const packageDefinition = getWorkspacePackage(packageName)
  const layoutRule = getOutputLayoutRule(packageName)

  if (!packageDefinition || !layoutRule || !getArtifactSetRule(packageName)) {
    return {
      packageName,
      status: 'failed',
      errors: [`未知包：${packageName}`],
    }
  }

  const canonicalOutDir = path.join(repoRoot, layoutRule.canonicalOutDir)
  const errors = []

  if (!await pathExists(canonicalOutDir)) {
    errors.push(`${packageName} 缺少规范产物目录：${layoutRule.canonicalOutDir}`)
    return {
      packageName,
      status: 'failed',
      errors,
    }
  }

  const snapshot = await walkDirectory(canonicalOutDir)
  const snapshotFiles = snapshot.filter((entry) => entry.type === 'file')
  errors.push(...missingPatternMessages(snapshotFiles, getRequiredPatterns(packageName), packageName))

  if (layoutRule.compatibilityMirrorTo) {
    errors.push(...await verifyCompatibilityMirror(packageDefinition, layoutRule))
  }

  return {
    packageName,
    status: errors.length === 0 ? 'ready' : 'failed',
    errors,
  }
}

export async function verifyBuildOutput(options = {}) {
  const packageName = options.packageName ?? null

  if (packageName) {
    return {
      packageName,
      results: [await verifyPackageOutput(packageName)],
    }
  }

  const results = []
  for (const packageDefinition of workspacePackages) {
    results.push(await verifyPackageOutput(packageDefinition.packageName))
  }

  return {
    packageName: null,
    results,
  }
}

export async function main(argv = process.argv.slice(2)) {
  const { packageName } = parseArgs(argv)

  if (packageName && !isKnownArtifactOwner(packageName)) {
    console.error(`未知包：${packageName}`)
    process.exitCode = 1
    return
  }

  const verificationReport = await verifyBuildOutput({ packageName })
  const failedResults = verificationReport.results.filter((entry) => entry.status !== 'ready')

  if (failedResults.length > 0) {
    for (const failedResult of failedResults) {
      for (const error of failedResult.errors) {
        console.error(error)
      }
    }

    process.exitCode = 1
    return
  }

  console.log(packageName ? `${packageName} 构建产物校验通过` : 'workspace 构建产物校验通过')
}

if (process.argv[1] && path.resolve(process.argv[1]) === currentFilePath) {
  await main()
}
