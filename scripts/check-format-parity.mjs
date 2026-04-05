/**
 * Format Parity Check
 *
 * Validates that supported format definitions stay synchronized across:
 *  1. Backend PHP   — lib/Constants/SupportedFormats.php (EXT_MIME_MAP)
 *  2. Frontend JS   — src/config/viewer-config.js (SUPPORTED_FORMATS)
 *  3. Loader registry — src/loaders/registry.js
 *  4. Viewer MIME list — src/main.js (SUPPORTED_MIMES)
 *  5. NC file mapping — appinfo/mimetypemapping.json
 *
 * Run: node scripts/check-format-parity.mjs
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

let errors = 0
let warnings = 0

function error(msg) {
	console.error(`  ERROR: ${msg}`)
	errors++
}
function warn(msg) {
	console.warn(`  WARN:  ${msg}`)
	warnings++
}
function ok(msg) {
	console.log(`  OK    ${msg}`)
}

// ── 1. Parse PHP EXT_MIME_MAP ───────────────────────────────────────────────
function parsePhpMimeMap(filePath) {
	const src = readFileSync(filePath, 'utf-8')
	const mapMatch = src.match(/EXT_MIME_MAP\s*=\s*\[([\s\S]*?)\];/)
	if (!mapMatch) return {}
	const block = mapMatch[1]
	const map = {}
	const lineRegex = /^\s*'(\w+)'\s*=>\s*\[([^\]]*)\]/gm
	let m
	while ((m = lineRegex.exec(block)) !== null) {
		const ext = m[1]
		const mimes = [...m[2].matchAll(/'([^']+)'/g)].map(x => x[1])
		map[ext] = mimes
	}
	return map
}

// ── 2. Parse JS SUPPORTED_FORMATS ──────────────────────────────────────────
function parseJsFormats(filePath) {
	const src = readFileSync(filePath, 'utf-8')
	const blockMatch = src.match(/export const SUPPORTED_FORMATS\s*=\s*\{([\s\S]*?)\n\}/)
	if (!blockMatch) return { exts: [], mimeMap: {} }
	const block = blockMatch[1]
	const entryRegex = /(?:^|\n)\t('?\w+'?):\s*\{[^}]*mimeType:\s*'([^']+)'/g
	const exts = []
	const mimeMap = {}
	let m
	while ((m = entryRegex.exec(block)) !== null) {
		const ext = m[1].replace(/'/g, '')
		exts.push(ext)
		mimeMap[ext] = m[2]
	}
	return { exts, mimeMap }
}

// ── 3. Parse loader registry ───────────────────────────────────────────────
function parseLoaderRegistry(filePath) {
	const src = readFileSync(filePath, 'utf-8')
	const blockMatch = src.match(/const loaders\s*=\s*\{([\s\S]*?)\n\}/)
	if (!blockMatch) return []
	const block = blockMatch[1]
	const extRegex = /(?:^|\n)\t'?(\w+)'?\s*:/g
	const exts = []
	let m
	while ((m = extRegex.exec(block)) !== null) {
		exts.push(m[1].replace(/'/g, ''))
	}
	return exts
}

// ── 4. Parse main.js SUPPORTED_MIMES ───────────────────────────────────────
function parseMainMimes(filePath) {
	const src = readFileSync(filePath, 'utf-8')
	const blockMatch = src.match(/SUPPORTED_MIMES\s*=\s*\[([\s\S]*?)\]/)
	if (!blockMatch) return []
	const block = blockMatch[1]
	const mimes = [...block.matchAll(/'([^']+)'/g)].map(m => m[1])
	return mimes
}

// ── 5. Parse mimetypemapping.json ──────────────────────────────────────────
function parseMimeMapping(filePath) {
	const data = JSON.parse(readFileSync(filePath, 'utf-8'))
	return data.mappings || {}
}

// ── Run checks ─────────────────────────────────────────────────────────────
console.log('[format-parity] Checking format definitions across backend and frontend...\n')

const phpPath = resolve(root, 'lib/Constants/SupportedFormats.php')
const jsConfigPath = resolve(root, 'src/config/viewer-config.js')
const registryPath = resolve(root, 'src/loaders/registry.js')
const mainPath = resolve(root, 'src/main.js')
const mimeMappingPath = resolve(root, 'appinfo/mimetypemapping.json')

// Parse all sources
const phpMimeMap = parsePhpMimeMap(phpPath)
const phpExts = Object.keys(phpMimeMap).filter(e => e !== 'mtl') // mtl is a dependency, not a model format
const { exts: jsExts, mimeMap: jsMimeMap } = parseJsFormats(jsConfigPath)
const loaderExts = parseLoaderRegistry(registryPath)
const mainMimes = parseMainMimes(mainPath)
const mimeMapping = parseMimeMapping(mimeMappingPath)
const mimeMappingExts = Object.keys(mimeMapping).filter(e => e !== 'mtl')

// ── Check 1: PHP <-> JS extension parity ────────────────────────────────────
console.log('1. PHP EXT_MIME_MAP <-> JS SUPPORTED_FORMATS (extensions)')

const phpOnly = phpExts.filter(e => !jsExts.includes(e))
const jsOnly = jsExts.filter(e => !phpExts.includes(e))

if (phpOnly.length) error(`In PHP but missing from JS: ${phpOnly.join(', ')}`)
if (jsOnly.length) error(`In JS but missing from PHP: ${jsOnly.join(', ')}`)
if (!phpOnly.length && !jsOnly.length) ok(`${phpExts.length} extensions match`)

// ── Check 2: PHP <-> JS MIME type consistency ───────────────────────────────
console.log('\n2. PHP EXT_MIME_MAP <-> JS SUPPORTED_FORMATS (MIME types)')

let mimeMatch = 0
for (const ext of phpExts) {
	if (!jsMimeMap[ext]) continue
	const phpPrimary = phpMimeMap[ext][0]
	const jsMime = jsMimeMap[ext]
	if (phpPrimary !== jsMime && !phpMimeMap[ext].includes(jsMime)) {
		warn(`${ext}: PHP primary="${phpPrimary}" vs JS="${jsMime}"`)
	} else {
		mimeMatch++
	}
}
if (mimeMatch === phpExts.filter(e => jsMimeMap[e]).length) {
	ok('All MIME types consistent')
}

// ── Check 3: JS SUPPORTED_FORMATS <-> Loader registry ──────────────────────
console.log('\n3. JS SUPPORTED_FORMATS <-> Loader registry')

const noLoader = jsExts.filter(e => !loaderExts.includes(e))
const extraLoader = loaderExts.filter(e => !jsExts.includes(e))

if (noLoader.length) error(`In SUPPORTED_FORMATS but no loader: ${noLoader.join(', ')}`)
if (extraLoader.length) warn(`Loader exists but not in SUPPORTED_FORMATS: ${extraLoader.join(', ')}`)
if (!noLoader.length && !extraLoader.length) ok(`${jsExts.length} formats have loaders`)

// ── Check 4: main.js SUPPORTED_MIMES covers all primary MIMEs ──────────────
console.log('\n4. main.js SUPPORTED_MIMES <-> Primary MIME types')

const primaryMimes = new Set()
for (const ext of phpExts) {
	for (const mime of phpMimeMap[ext]) {
		primaryMimes.add(mime)
	}
}

// application/octet-stream is a generic fallback used by FBX/3DS — not registered
// to avoid matching unrelated files in the Nextcloud Viewer.
const GENERIC_MIMES = new Set(['application/octet-stream'])
// Extra MIMEs added for broader compatibility (alternative MIME types for the same format).
const COMPAT_MIMES = new Set(['application/sla', 'model/x.ply'])

const missingFromMain = [...primaryMimes].filter(m => !mainMimes.includes(m) && !GENERIC_MIMES.has(m))
const extraInMain = mainMimes.filter(m => !primaryMimes.has(m) && !COMPAT_MIMES.has(m))

if (missingFromMain.length) warn(`MIME in PHP but not registered in main.js: ${missingFromMain.join(', ')}`)
if (extraInMain.length) warn(`MIME in main.js not in PHP EXT_MIME_MAP: ${extraInMain.join(', ')}`)
if (!missingFromMain.length && !extraInMain.length) ok(`All ${mainMimes.length} MIMES registered`)
else if (!missingFromMain.length) ok(`All primary MIMEs registered (${extraInMain.length} extra for compat)`)

// ── Check 5: mimetypemapping.json <-> PHP EXT_MIME_MAP ──────────────────────
console.log('\n5. mimetypemapping.json <-> PHP EXT_MIME_MAP')

const jsonOnly = mimeMappingExts.filter(e => !phpExts.includes(e))
const phpNoJson = phpExts.filter(e => !mimeMappingExts.includes(e))

if (jsonOnly.length) warn(`In mimetypemapping.json but not in PHP: ${jsonOnly.join(', ')}`)
if (phpNoJson.length) error(`In PHP but missing from mimetypemapping.json: ${phpNoJson.join(', ')}`)
if (!jsonOnly.length && !phpNoJson.length) ok(`${mimeMappingExts.length} extensions match`)

// ── Summary ────────────────────────────────────────────────────────────────
console.log('\n' + '-'.repeat(60))
if (errors) {
	console.error(`\n[format-parity] FAIL: ${errors} error(s), ${warnings} warning(s)\n`)
	process.exit(1)
} else if (warnings) {
	console.log(`\n[format-parity] WARN: ${warnings} warning(s), 0 errors\n`)
} else {
	console.log(`\n[format-parity] PASS: All format definitions are in sync\n`)
}
