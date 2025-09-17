#!/usr/bin/env node
/**
 * Copy DRACO & Basis (KTX2) decoder/transcoder runtime assets into top-level
 * directories that the app serves statically (`/apps/threedviewer/draco/` & `/apps/threedviewer/basis/`).
 *
 * We intentionally run this as a pre-build (or manual) step instead of a Vite
 * plugin because earlier attempts at a custom plugin produced empty dirs in
 * the Nextcloud app context (likely path resolution or timing issues). This
 * script is explicit, debuggable, and can be re-run idempotently.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import url from 'node:url'

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..')

const sources = {
  draco: path.join(root, 'node_modules/three/examples/jsm/libs/draco'),
  basis: path.join(root, 'node_modules/three/examples/jsm/libs/basis'),
}

// Files we care about (kept small to avoid shipping unneeded encoders)
const fileGlobs = {
  draco: [
    'draco_decoder.js',
    'draco_decoder.wasm',
    // Optionally include the WASM wrapper if Three.js expects it in some versions
    'draco_wasm_wrapper.js',
  ],
  basis: [
    'basis_transcoder.js',
    'basis_transcoder.wasm',
    // Some releases include an additional wasm variant
    'basis_transcoder.wasm.wasm',
  ],
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

async function copyIfExists(src, dest) {
  try {
    await fs.access(src)
  } catch {
    return false // skip silently
  }
  await fs.copyFile(src, dest)
  return true
}

async function run() {
  const report = []
  for (const key of Object.keys(sources)) {
    const srcDir = sources[key]
    const outDir = path.join(root, key) // top-level /draco or /basis
    const jsOutDir = path.join(root, 'js', key) // also copy to js/ for serving
    await ensureDir(outDir)
    await ensureDir(jsOutDir)

    for (const file of fileGlobs[key]) {
      const from = path.join(srcDir, file)
      const to = path.join(outDir, file)
      const jsTo = path.join(jsOutDir, file)
      const copied = await copyIfExists(from, to)
      const jsCopied = await copyIfExists(from, jsTo)
      report.push({ key, file, copied, jsCopied })
    }
  }

  // Minimal console output (CI friendly)
  const lines = report.map(r => `${r.key}/${r.file}: ${r.copied ? 'copied' : 'missing'}${r.jsCopied ? ' (js)' : ''}`)
  console.log('[copy-decoders] Summary:\n' + lines.join('\n'))

  // Fail hard only if ALL primary decoder files are missing; otherwise we allow build to proceed
  const critical = [
    'draco/draco_decoder.js',
    'draco/draco_decoder.wasm',
    'basis/basis_transcoder.js',
    'basis/basis_transcoder.wasm',
  ]
  const missingCritical = critical.filter(f => !report.find(r => `${r.key}/${r.file}` === f && r.copied))
  if (missingCritical.length) {
    console.warn('[copy-decoders] Warning: missing critical decoder files:', missingCritical.join(', '))
  }
}

run().catch(err => {
  console.error('[copy-decoders] Failed:', err)
  process.exit(1)
})
