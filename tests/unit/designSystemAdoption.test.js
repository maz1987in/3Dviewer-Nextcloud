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
 * The second rule is about where colour comes from at all. Reaching for a Nextcloud
 * variable directly means every use site also decides the fallback, and the copies drift:
 * this codebase carried #0082c9, #64b5f6 and #0d47a1 as the default for one variable, and
 * both #000 and #fff as the default for another, so what an unthemed instance rendered
 * depended on which rule an element landed on. Nothing reconciles copies of a value that
 * are never compared. Colour now enters through the token layer, once, where the mapping
 * from Nextcloud's palette to this app's is a decision that can be read.
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

/** Any Nextcloud colour variable reached for outside the token layer. */
const DIRECT_REFERENCE = /var\(\s*--color-[a-z-]+[^)]*\)/g

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
		'%s takes its colours from the token layer',
		(name) => {
			const { text } = files.find((f) => f.name === name)
			expect([...text.matchAll(DIRECT_REFERENCE)].map((m) => m[0])).toEqual([])
		},
	)
})
