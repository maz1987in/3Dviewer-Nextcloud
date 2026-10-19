#!/usr/bin/env node
/**
 * Copy DRACO & Basis (KTX2) decoder/transcoder runtime assets into top-level
 * directories that the app serves statically (`draco/` & `basis/` under the app's web root).
 *
 * We intentionally run this as a pre-build (or manual) step instead of a Vite
 * plugin because earlier attempts at a custom plugin produced empty dirs in
 * the Nextcloud app context (likely path resolution or timing issues). This
 * script is explicit, debuggable, and can be re-run idempotently.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import url from 'node:url'
import { stripDynamicExecution as rhino3dmNoEval } from './rhino3dm-no-eval.mjs'

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..')

const sources = {
  draco: path.join(root, 'node_modules/three/examples/jsm/libs/draco'),
  basis: path.join(root, 'node_modules/three/examples/jsm/libs/basis'),
  // rhino3dm WASM + JS glue for the 3DM format, from McNeel's `rhino3dm`
  // package (pinned to the version three's Rhino3dmLoader names).
  // Rhino3dmLoader downloads both from the path we hand it via
  // setLibraryPath(). three.js no longer ships a copy under examples/.
  rhino3dm: path.join(root, 'node_modules/rhino3dm'),
  // web-ifc WASM for the IFC format. ThatOpen's `web-ifc` package ships
  // both single-threaded and multi-threaded WASM builds; IfcAPI picks the
  // variant that matches the runtime. SetWasmPath(...) points at the copy
  // served by our app so air-gapped deploys still work.
  'web-ifc': path.join(root, 'node_modules/web-ifc'),
  // OpenCascade WASM used by the STEP/IGES/BREP/FCSTD loaders. One WASM
  // file, one JS glue — shared across all four loaders via occt-runtime.js.
  occt: path.join(root, 'node_modules/occt-import-js/dist'),
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
  rhino3dm: [
    'rhino3dm.js',
    'rhino3dm.wasm',
  ],
  'web-ifc': [
    'web-ifc.wasm',
    // Multi-threaded variant; IfcAPI auto-selects based on runtime features.
    'web-ifc-mt.wasm',
  ],
  occt: [
    'occt-import-js.wasm',
  ],
}

// Text rewrites applied while copying. The rhino3dm glue is fetched as text and run
// in a worker, so it never passes through Vite; this is where it loses its eval sites.
const transforms = {
  'rhino3dm/rhino3dm.js': rhino3dmNoEval,
}

// Files the build must not finish without. A missing decoder elsewhere degrades one
// feature and is only warned about; a 3DM loader with no runtime behind it hangs.
const required = [
  'rhino3dm/rhino3dm.js',
  'rhino3dm/rhino3dm.wasm',
]

/** An error that must fail the build rather than be warned about. */
class FatalError extends Error {}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

async function copyIfExists(src, dest, transform) {
  try {
    await fs.access(src)
  } catch {
    return false // skip silently
  }
  if (transform) {
    let code
    try {
      code = transform(await fs.readFile(src, 'utf8'))
    } catch (err) {
      throw new FatalError(`${path.relative(root, src)}: ${err.message}`)
    }
    await fs.writeFile(dest, code)
    return true
  }
  try {
    await fs.copyFile(src, dest)
    return true
  } catch (err) {
    console.warn(`[copy-decoders] Warn: failed to copy ${src} -> ${dest}: ${err?.code || err}`)
    return false
  }
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
      const transform = transforms[`${key}/${file}`]
      const copied = await copyIfExists(from, to, transform)
      const jsCopied = await copyIfExists(from, jsTo, transform)
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

  const missingRequired = required.filter(f => !report.find(r => `${r.key}/${r.file}` === f && r.copied))
  if (missingRequired.length) {
    throw new FatalError(`missing required runtime files: ${missingRequired.join(', ')}. Run npm ci.`)
  }
}

run().catch(err => {
  console.error('[copy-decoders] Failed:', err)
  // Do not fail the whole build for an optional decoder; those can be pre-shipped
  // in the app and missing copies are already warned about above. Required files
  // and failed rewrites do fail it.
  process.exit(err instanceof FatalError ? 1 : 0)
})
