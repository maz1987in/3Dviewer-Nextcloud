#!/usr/bin/env node
/**
 * i18n parity check.
 *
 * Walks all .vue / .js / .ts files under src/ plus .php files under lib/ and
 * extracts every translation call:
 *   JS / Vue: t('threedviewer', 'String', ...)
 *   PHP:      $this->l10n->t('String') / $l->t('String')
 *
 * Compares the extracted string set against l10n/en.json and each other locale
 * file. Reports:
 *   • Strings used in source but absent from en.json                 (ERROR)
 *   • Keys present in en.json that no source uses                    (WARN)
 *   • Per-locale: keys missing or still equal to the English source  (INFO)
 *
 * Run:
 *   node scripts/check-i18n.mjs           # summary only (read-only)
 *   node scripts/check-i18n.mjs --strict  # non-zero exit on WARN as well
 *   node scripts/check-i18n.mjs --sync-en # add missing keys to en.json (value = key)
 *   node scripts/check-i18n.mjs --prune   # also remove orphan keys from en.json
 *
 * Limitations: regex-based extractor. Dynamic strings (`t('app', someVar)`)
 * are silently ignored — refactor to literal arguments for coverage.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { resolve, dirname, relative, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const SRC_ROOTS = ['src']
const PHP_ROOTS = ['lib']
const L10N_DIR = join(ROOT, 'l10n')
const STRICT = process.argv.includes('--strict')
const SYNC_EN = process.argv.includes('--sync-en')
const PRUNE = process.argv.includes('--prune')

let errors = 0
let warnings = 0

function walk(dir, exts) {
	const out = []
	for (const entry of readdirSync(dir)) {
		if (entry === 'node_modules' || entry.startsWith('.')) continue
		const p = join(dir, entry)
		const st = statSync(p)
		if (st.isDirectory()) out.push(...walk(p, exts))
		else if (exts.includes(extname(entry))) out.push(p)
	}
	return out
}

// String literal inside a t() call. We accept single or double quotes as the
// string delimiter. Backticks (template literals) are not supported — those
// often contain ${…} interpolation that we can't flatten anyway. Two JS
// forms: the standalone `t(...)` and the Options-API `this.t(...)` that Vue
// components use (it's registered as a global property by main.js).
const JS_T_RE = /(?:^|[^a-zA-Z0-9_$.]|this\.)t\s*\(\s*(['"])threedviewer\1\s*,\s*(['"])((?:\\.|(?!\2).)*)\2/g
const PHP_T_RE = /->t\s*\(\s*(['"])((?:\\.|(?!\1).)*)\1/g

function unescape(s) {
	return s.replace(/\\(['"\\nt])/g, (_, ch) => {
		switch (ch) {
		case 'n': return '\n'
		case 't': return '\t'
		default: return ch
		}
	})
}

function extractJsStrings(filePath) {
	const src = readFileSync(filePath, 'utf-8')
	const matches = [...src.matchAll(JS_T_RE)]
	return matches.map(m => unescape(m[3]))
}

function extractPhpStrings(filePath) {
	const src = readFileSync(filePath, 'utf-8')
	const matches = [...src.matchAll(PHP_T_RE)]
	return matches.map(m => unescape(m[2]))
}

// 1. Collect all translation strings from source.
const sourceStrings = new Set()
const perFileCounts = new Map()

for (const root of SRC_ROOTS) {
	for (const f of walk(join(ROOT, root), ['.vue', '.js', '.ts', '.mjs'])) {
		const strings = extractJsStrings(f)
		if (strings.length > 0) perFileCounts.set(relative(ROOT, f), strings.length)
		for (const s of strings) sourceStrings.add(s)
	}
}
for (const root of PHP_ROOTS) {
	for (const f of walk(join(ROOT, root), ['.php'])) {
		const strings = extractPhpStrings(f)
		if (strings.length > 0) perFileCounts.set(relative(ROOT, f), strings.length)
		for (const s of strings) sourceStrings.add(s)
	}
}

console.log(`[i18n] Found ${sourceStrings.size} unique strings in ${perFileCounts.size} files`)

// 2. Compare against en.json.
const enPath = join(L10N_DIR, 'en.json')
const en = JSON.parse(readFileSync(enPath, 'utf-8'))
const enKeys = new Set(Object.keys(en.translations || {}))

const missingInEn = [...sourceStrings].filter(s => !enKeys.has(s))
const orphanInEn = [...enKeys].filter(k => !sourceStrings.has(k))

if (missingInEn.length > 0) {
	errors++
	console.error(`\n[i18n] ERROR: ${missingInEn.length} strings used in source but missing from l10n/en.json:`)
	for (const s of missingInEn.slice(0, 25)) console.error(`  - ${JSON.stringify(s)}`)
	if (missingInEn.length > 25) console.error(`  ... and ${missingInEn.length - 25} more`)
} else {
	console.log('[i18n] OK: every source string has an en.json entry')
}

if (orphanInEn.length > 0) {
	warnings++
	console.warn(`\n[i18n] WARN: ${orphanInEn.length} en.json entries no source uses (safe to remove):`)
	for (const s of orphanInEn.slice(0, 10)) console.warn(`  - ${JSON.stringify(s)}`)
	if (orphanInEn.length > 10) console.warn(`  ... and ${orphanInEn.length - 10} more`)
}

// 2a. Optional: sync en.json (--sync-en adds, --prune removes orphans).
if (SYNC_EN || PRUNE) {
	const nextTranslations = { ...(en.translations || {}) }
	let added = 0
	let removed = 0
	if (SYNC_EN) {
		// Add missing keys with value = key. Sorted for a stable diff.
		for (const s of [...missingInEn].sort()) {
			nextTranslations[s] = s
			added++
		}
	}
	if (PRUNE) {
		for (const k of orphanInEn) {
			delete nextTranslations[k]
			removed++
		}
	}
	if (added > 0 || removed > 0) {
		const out = { translations: Object.fromEntries(Object.keys(nextTranslations).sort().map(k => [k, nextTranslations[k]])) }
		writeFileSync(enPath, JSON.stringify(out, null, 2) + '\n', 'utf-8')
		console.log(`\n[i18n] l10n/en.json updated: +${added} added, -${removed} removed. Re-run without flags to confirm clean.`)
	} else {
		console.log('\n[i18n] l10n/en.json already in sync — nothing to do.')
	}
}

// 3. Per-locale coverage.
const locales = readdirSync(L10N_DIR)
	.filter(f => f.endsWith('.json') && f !== 'en.json')
	.map(f => ({ code: f.replace(/\.json$/, ''), path: join(L10N_DIR, f) }))

console.log('')
for (const { code, path } of locales) {
	const loc = JSON.parse(readFileSync(path, 'utf-8'))
	const locTranslations = loc.translations || {}
	const locKeys = new Set(Object.keys(locTranslations))

	const missing = [...enKeys].filter(k => !locKeys.has(k))
	// A key is "not translated" when the value exactly matches the English key
	// (Nextcloud's translate() does passthrough when no translation is set).
	const untranslated = [...locKeys].filter(k => locTranslations[k] === k && enKeys.has(k))
	// Keys present in this locale but no longer in en.json — typically left
	// behind after a source string was renamed or removed.
	const orphan = [...locKeys].filter(k => !enKeys.has(k))
	const coverage = enKeys.size === 0
		? 100
		: Math.round(100 * (enKeys.size - missing.length - untranslated.length) / enKeys.size)

	console.log(`[i18n] ${code}: ${coverage}% translated  (missing ${missing.length}, passthrough ${untranslated.length}, orphan ${orphan.length} / ${enKeys.size} keys)`)
}

// 4. Exit code.
if (errors > 0 || (STRICT && warnings > 0)) {
	process.exit(1)
}
process.exit(0)
