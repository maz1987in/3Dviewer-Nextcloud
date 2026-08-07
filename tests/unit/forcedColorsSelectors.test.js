/**
 * Every selector in the forced-colors sheet must still match something.
 *
 * `src/css/forced-colors.css` exists because an accessibility audit found badges and
 * focus states that collapse into the surrounding surface under Windows High Contrast:
 * backgrounds become Canvas, text becomes CanvasText, and box-shadow is ignored
 * outright. The sheet re-adds a system-colour border or outline so those elements stay
 * visible.
 *
 * It does that by naming specific classes. Rename one in a component and the rule stops
 * matching — silently. Nothing errors, no test fails, the page looks identical to anyone
 * not in forced-colors mode, and the accessibility fix is simply gone. That is the whole
 * reason this guard exists: a stylesheet that matches nothing is indistinguishable from
 * one that is working, unless something checks.
 */

const { readFileSync, readdirSync, statSync } = require('fs')
const { join } = require('path')

const SRC = join(__dirname, '..', '..', 'src')
const SHEET = join(SRC, 'css', 'forced-colors.css')

/**
 * Every file under src, minus the sheet itself.
 *
 * @param {string} dir - directory to walk
 * @return {string[]} absolute file paths
 */
function filesUnder(dir) {
	return readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry)
		return statSync(full).isDirectory() ? filesUnder(full) : [full]
	})
}

describe('forced-colors accessibility sheet', () => {
	const css = readFileSync(SHEET, 'utf8')

	// Class names the sheet targets. Attribute and pseudo selectors are left out: those
	// match on structure rather than on a name a refactor can quietly change.
	const targeted = [...new Set(
		[...css.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g)].map((m) => m[1]),
	)]

	const haystack = filesUnder(SRC)
		.filter((f) => f !== SHEET)
		.map((f) => readFileSync(f, 'utf8'))
		.join('\n')

	it('targets a meaningful number of selectors, so this guard cannot pass vacuously', () => {
		expect(targeted.length).toBeGreaterThan(10)
	})

	it.each(targeted)('.%s is still used by a component', (className) => {
		expect(haystack).toContain(className)
	})
})
