import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'

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
    const fileStats = await stat(absolutePath)

    snapshots.push({
      path: relativePath,
      type: 'file',
      size: fileStats.size,
      sha1: createHash('sha1').update(fileBuffer).digest('hex'),
    })
  }

  return snapshots
}

export async function assertDirectoryExists(directoryPath, label = directoryPath) {
  let directoryStats

  try {
    directoryStats = await stat(directoryPath)
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      assert.fail(`目录不存在：${label} (${directoryPath})`)
    }

    throw error
  }

  assert.ok(directoryStats.isDirectory(), `目标不是目录：${label} (${directoryPath})`)
}

export async function createDirectorySnapshot(directoryPath) {
  await assertDirectoryExists(directoryPath)
  return walkDirectory(directoryPath)
}

export async function assertRequiredFiles(baseDir, requiredFiles, label = baseDir) {
  await assertDirectoryExists(baseDir, label)

  const snapshot = await createDirectorySnapshot(baseDir)
  const snapshotPaths = new Set(snapshot.map((entry) => entry.path))
  const filePaths = snapshot.filter((entry) => entry.type === 'file').map((entry) => entry.path)

  for (const requiredFile of requiredFiles) {
    const normalizedRequiredFile = normalizeRelativePath(requiredFile)

    if (normalizedRequiredFile.includes('*')) {
      const matcher = globToRegExp(normalizedRequiredFile)
      const hasMatch = filePaths.some((filePath) => matcher.test(filePath))

      assert.ok(hasMatch, `目录 ${label} 缺少匹配项：${normalizedRequiredFile}`)
      continue
    }

    const absolutePath = path.join(baseDir, normalizedRequiredFile)
    let requiredStats

    try {
      requiredStats = await stat(absolutePath)
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        assert.fail(`目录 ${label} 缺少必需文件或目录：${normalizedRequiredFile}`)
      }

      throw error
    }

    if (requiredStats.isDirectory()) {
      assert.ok(snapshotPaths.has(normalizedRequiredFile), `目录 ${label} 缺少必需目录：${normalizedRequiredFile}`)
      continue
    }

    assert.ok(requiredStats.isFile(), `目录 ${label} 的必需路径不是文件：${normalizedRequiredFile}`)
  }
}

export function assertDirectorySnapshotEqual(actualSnapshot, expectedSnapshot, label = '目录快照') {
  assert.deepStrictEqual(actualSnapshot, expectedSnapshot, `${label} 不一致`)
}

export function assertNonZeroExitCode(result, label = '命令') {
  const exitCode = result?.code ?? result?.status
  assert.notStrictEqual(exitCode, 0, `${label} 应返回非 0 退出码`)
}

export default {
  assertDirectoryExists,
  assertRequiredFiles,
  createDirectorySnapshot,
  assertDirectorySnapshotEqual,
  assertNonZeroExitCode,
}
