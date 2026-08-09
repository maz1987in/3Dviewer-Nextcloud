/**
 * The viewer's chrome takes its greys from the theme, never from a literal.
 *
 * The header, the HUD and the floating panels used to be dark and only dark, so a rule
 * could say `color: #fff` and be right. Now the viewer's own theme control makes them light
 * as well, and every one of those literals is a piece of the old assumption left behind:
 * white text on the light header, which rendered as a title you could barely see, next to
 * chips and readouts that had been converted to tokens and flipped correctly.
 *
 * That is the same failure as the statistics panel — a surface changes theme, most of its
 * colours follow, and the few that were written as literals stay where they were. It is
 * invisible in the theme the literal was written for, which is the theme it is developed
 * and reviewed in.
 *
 * Scoped to the files that draw canvas chrome, by the tokens they use. Literals elsewhere
 * are a different question: a swatch, an icon, a colour picker's own well.
 */

const { readFileSync, readdirSync, statSync } = require('fs')
const { join, relative } = require('path')

const SRC = join(__dirname, '..', '..', 'src')

/**
 * Every stylesheet-bearing file under a directory.
 *
 * @param {string} dir - directory to walk
 * @return {string[]} absolute file paths
 */
function sourcesUnder(dir) {
	return readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry)
		if (statSync(full).isDirectory()) return sourcesUnder(full)
		return /\.(vue|css)$/.test(full) ? [full] : []
	})
}

/** A greyscale value written out, in any of the notations a stylesheet uses for one. */
const GREY_LITERAL = /#(?:fff|eee|ddd|ccc|000|111|222)\b|#(?:ffffff|eeeeee|f5f5f5|000000|171717|1e1e1e)\b|\bwhite\b|\bblack\b|rgba?\(\s*255\s*,\s*255\s*,\s*255|rgba?\(\s*0\s*,\s*0\s*,\s*0/i

/** A declaration that paints text or a surface. */
const PAINTS = /^\s*(?:color|background|background-color)\s*:/

/**
 * The files that draw canvas chrome, told by the tokens only canvas chrome uses.
 *
 * `ViewerModal` is excluded because nothing renders it — it is not reachable from `App.vue`,
 * and holding dead markup to a live rule teaches people to edit files that do nothing.
 */
const chromeFiles = sourcesUnder(SRC)
	.filter((file) => !/ViewerModal\.vue$/.test(file))
	.map((file) => [relative(SRC, file), readFileSync(file, 'utf8')])
	.filter(([, text]) => /--tdv-canvas-dark|--tdv-hud-bg/.test(text))

describe('the viewer chrome', () => {
	it('is found by this guard, so it cannot pass vacuously', () => {
		expect(chromeFiles.length).toBeGreaterThan(1)
		expect(chromeFiles.map(([name]) => name)).toContain('components/MinimalTopBar.vue')
	})

	it.each(chromeFiles.map(([name]) => name))('%s paints in tokens, not in literal greys', (name) => {
		const text = chromeFiles.find(([n]) => n === name)[1]
		const offenders = text.split('\n')
			.map((line, index) => [index + 1, line])
			.filter(([, line]) => PAINTS.test(line) && GREY_LITERAL.test(line))
			.map(([number, line]) => `${number}: ${line.trim()}`)
		expect(offenders).toEqual([])
	})
})
