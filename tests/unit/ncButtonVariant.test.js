/**
 * `type` on an NcButton is the button's native type, not its appearance.
 *
 * It used to be both. In @nextcloud/vue 9 the appearance moved to `variant` and `type` went
 * back to meaning what it means on a `<button>` — "button", "submit", "reset" — so
 * `type="primary"` now writes an invalid native type into the DOM and leaves the variant at
 * its default, which is `secondary`.
 *
 * Nothing reports it. Vue passes an unknown value straight through, the browser treats an
 * unrecognised `type` as `submit`, and the button renders perfectly well — as the wrong one.
 * "Open in 3D Viewer" was declared primary and drawn as a pale filled pill for however long
 * that has been true, which is not a state anybody would think to check for, because the
 * markup says what it was meant to be.
 */

const { readFileSync, readdirSync, statSync } = require('fs')
const { join, relative } = require('path')

const SRC = join(__dirname, '..', '..', 'src')

/** The values that mean an appearance rather than a form role. */
const APPEARANCES = /^(primary|secondary|tertiary|tertiary-no-background|tertiary-on-primary|success|warning|error)$/

/**
 * Every component under a directory.
 *
 * @param {string} dir - directory to walk
 * @return {string[]} absolute file paths
 */
function componentsUnder(dir) {
	return readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry)
		if (statSync(full).isDirectory()) return componentsUnder(full)
		return full.endsWith('.vue') ? [full] : []
	})
}

const components = componentsUnder(SRC).map((f) => ({
	name: relative(SRC, f).split('\\').join('/'),
	text: readFileSync(f, 'utf8'),
}))

/**
 * Every `<NcButton>` given an appearance through `type`.
 *
 * @param {string} text - the component's source
 * @return {string[]} one entry per tag, quoting the value
 */
function appearanceAsType(text) {
	return [...text.matchAll(/<NcButton\b[^>]*?>/gs)]
		.flatMap((tag) => [...tag[0].matchAll(/\btype="([^"]*)"/g)])
		.filter((attr) => APPEARANCES.test(attr[1]))
		.map((attr) => `type="${attr[1]}"`)
}

describe('an NcButton\'s appearance', () => {
	it('is looked for in every component, so this guard cannot pass vacuously', () => {
		expect(components.filter((c) => c.text.includes('<NcButton')).length).toBeGreaterThan(2)
	})

	it.each(components.map((c) => c.name))('is passed as `variant` in %s', (name) => {
		expect(appearanceAsType(components.find((c) => c.name === name).text)).toEqual([])
	})
})
