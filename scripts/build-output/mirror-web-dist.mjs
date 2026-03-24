import { cp, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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

async function collectRelativeFilePaths(rootDir, currentDir = rootDir) {
  const entries = await readdir(currentDir, { withFileTypes: true })
  const filePaths = []

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolutePath = path.join(currentDir, entry.name)

    if (entry.isDirectory()) {
      filePaths.push(...await collectRelativeFilePaths(rootDir, absolutePath))
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    filePaths.push(normalizeRelativePath(path.relative(rootDir, absolutePath)))
  }

  return filePaths
}

export async function mirrorWebDist() {
  const canonicalOutDir = path.join(repoRoot, 'apps/web-vue/dist')
  const compatibilityOutDir = path.join(repoRoot, 'dist')

  await rm(compatibilityOutDir, { recursive: true, force: true })
  await cp(canonicalOutDir, compatibilityOutDir, { recursive: true, force: true })

  const mirroredFiles = await collectRelativeFilePaths(compatibilityOutDir)
  const forbiddenPatterns = ['editor/core/dist/**', 'editor/vue3/dist/**']

  for (const forbiddenPattern of forbiddenPatterns) {
    const matcher = globToRegExp(forbiddenPattern)

    if (mirroredFiles.some((entry) => matcher.test(entry))) {
      throw new Error(`根 dist 不应混入库包规范产物：${forbiddenPattern}`)
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === currentFilePath) {
  await mirrorWebDist()
}
