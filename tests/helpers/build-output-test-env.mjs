import { spawn } from 'node:child_process'
import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const repoRoot = path.resolve(__dirname, '../..')

export const outputDirs = [
  'apps/web-vue/dist',
  'editor/core/dist',
  'editor/vue3/dist',
  'dist',
]

export async function cleanupOutputs() {
  await Promise.all(
    outputDirs.map((directoryPath) =>
      rm(path.join(repoRoot, directoryPath), { recursive: true, force: true }),
    ),
  )
}

export function runPnpm(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', args, {
      cwd: repoRoot,
      shell: true,
      ...options,
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })

    child.on('error', reject)
    child.on('close', (code, signal) => {
      resolve({ code, signal, stdout, stderr })
    })
  })
}

export async function withPatchedJson(relativePath, mutate) {
  const absolutePath = path.join(repoRoot, relativePath)
  const originalContent = await readFile(absolutePath, 'utf8')
  const parsedJson = JSON.parse(originalContent)
  const nextJson = mutate(parsedJson)

  await writeFile(absolutePath, `${JSON.stringify(nextJson, null, 2)}\n`, 'utf8')

  return async () => {
    await writeFile(absolutePath, originalContent, 'utf8')
  }
}
