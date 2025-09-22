#!/usr/bin/env node
import { promises as fs } from 'fs'
import path from 'path'

const root = process.cwd()

async function ensureDirExists(dir) {
  try {
    await fs.access(dir)
    return true
  } catch {
    return false
  }
}

async function cleanDir(dir, predicate) {
  const abs = path.resolve(root, dir)
  const exists = await ensureDirExists(abs)
  if (!exists) return { dir, removed: 0 }
  const entries = await fs.readdir(abs)
  let removed = 0
  for (const name of entries) {
    const rel = path.join(dir, name)
    const absFile = path.join(abs, name)
    const stat = await fs.lstat(absFile)
    if (!stat.isFile()) continue
    if (predicate(name)) {
      try {
        await fs.unlink(absFile)
        removed++
      } catch {
        // ignore deletion errors
      }
    }
  }
  return { dir, removed }
}

async function main() {
  const results = []
  // Remove previous hashed chunk CSS files, keep stable entry CSS
  results.push(await cleanDir('css', (name) => /\.chunk\.css$/i.test(name)))

  // Remove previous hashed JS chunk files, keep stable threedviewer-*.mjs entries
  results.push(
    await cleanDir('js', (name) => {
      if (name.startsWith('threedviewer-') && name.endsWith('.mjs')) return false
      return /\.chunk\.mjs$/i.test(name)
    }),
  )

  // Optional: remove leftover source maps from prior builds
  results.push(await cleanDir('js', (name) => /\.map$/i.test(name)))
  results.push(await cleanDir('css', (name) => /\.map$/i.test(name)))

  // eslint-disable-next-line no-console
  console.log('[clean-build] Removed files:', results)
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[clean-build] failed:', e)
  process.exit(1)
})


