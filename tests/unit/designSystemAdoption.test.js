/**
 * The primary colour is decided in one place.
 *
 * Nextcloud publishes two different primary colours. `--color-primary` is the raw colour
 * the admin picked; `--color-primary-element` is that colour corrected until it passes
 * contrast against the page background. They are the same on a default install, which is
 * why reaching for the wrong one is invisible here and only shows up on an instance
 * themed pale — where a border drawn in `--color-primary` disappears into the surface it
 * is supposed to divide. The official component library uses the `-element` family for
 * every interactive element and never the raw one; so should this app.
 *
 * The second rule is about fallbacks. Repeating `var(--color-primary, #fff)` at each use
 * site means the default appearance is decided separately in every rule, and the copies
 * drift: this codebase carried #0082c9, #64b5f6 and #0d47a1 as the fallback for the same
 * variable, so what an unthemed instance rendered depended on which rule it landed on.
 * The fallback belongs in the token layer, once, where it can be read and changed as a
 * decision rather than found by grep.
 */

const { readFileSync, readdirSync, statSync } = require('fs')
const { join, relative } = require('path')

const SRC = join(__dirname, '..', '..', 'src')

/** The token layer is where the fallbacks are allowed to live. */
const TOKEN_LAYER = join(SRC, 'css', 'design-system.css')

/**
 * Every file under src that can carry a style, minus the token layer itself.
 *
 * @param {string} dir - directory to walk
 * @return {string[]} absolute file paths
 */
function styleFilesUnder(dir) {
	return readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry)
		if (statSync(full).isDirectory()) {
			return styleFilesUnder(full)
		}
		return /\.(vue|css|js)$/.test(full) && full !== TOKEN_LAYER ? [full] : []
	})
}

const files = styleFilesUnder(SRC)
	.filter((f) => !f.includes('__tests__'))
	.map((f) => ({ name: relative(SRC, f), text: readFileSync(f, 'utf8') }))

/** `--color-primary`, `-light`, `-text`, `-hover` — everything but the `-element` family. */
const RAW_PRIMARY = /--color-primary(?!-element)[a-z-]*/g

/** Any primary variable handed its own fallback value. */
const INLINE_FALLBACK = /var\(\s*--color-primary[a-z-]*\s*,[^)]*\)/g

describe('design system adoption', () => {
	it('scans the components, so this guard cannot pass vacuously', () => {
		expect(files.length).toBeGreaterThan(10)
	})

	it.each(files.map((f) => f.name))(
		'%s asks for the contrast-corrected primary, not the raw one',
		(name) => {
			const { text } = files.find((f) => f.name === name)
			expect([...text.matchAll(RAW_PRIMARY)].map((m) => m[0])).toEqual([])
		},
	)

	it.each(files.map((f) => f.name))(
		'%s leaves the primary fallback to the token layer',
		(name) => {
			const { text } = files.find((f) => f.name === name)
			expect([...text.matchAll(INLINE_FALLBACK)].map((m) => m[0])).toEqual([])
		},
	)
})
