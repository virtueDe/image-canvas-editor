import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { workspacePackages } from './workspace-packages.mjs'

const currentFilePath = fileURLToPath(import.meta.url)
const scriptDirectory = path.dirname(currentFilePath)
const repoRoot = path.resolve(scriptDirectory, '../..')

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      shell: true,
      stdio: 'inherit',
    })

    child.on('error', reject)
    child.on('close', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`${command} ${args.join(' ')} 执行失败（code=${code}, signal=${signal ?? 'none'}）`))
    })
  })
}

export async function runWorkspaceBuild() {
  const packageBuildSteps = [...workspacePackages]
    .sort((left, right) => left.buildOrder - right.buildOrder)
    .map((packageDefinition) => ['pnpm', ['--filter', packageDefinition.packageName, 'run', 'build:artifact']])

  const steps = [
    ...packageBuildSteps,
    [process.execPath, ['scripts/build-output/mirror-web-dist.mjs']],
    [process.execPath, ['scripts/build-output/verify-build-output.mjs']],
  ]

  for (const [command, args] of steps) {
    await runCommand(command, args)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === currentFilePath) {
  await runWorkspaceBuild()
}
