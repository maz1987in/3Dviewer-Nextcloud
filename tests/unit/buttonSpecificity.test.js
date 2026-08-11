/**
 * A rule that styles a button has to outrank Nextcloud's rules for buttons.
 *
 * Nextcloud's server stylesheet paints every `<button>` on the page — background, colour,
 * padding, margin, border, radius, weight — through `button:not(.button-vue,[class^=vs__])`,
 * which scores (0,1,1). Its hover and focus are (0,2,1), and its pressed state, with three
 * `:not()`s in it, is (0,4,1). A single class does not beat any of them.
 *
 * This has been reported three times from three different controls, each time as a colour
 * problem: the HUD's mode chip rendering as a pale blue pill, the slicer's format selector
 * splitting into three floating chips, the tools panel's section header turning pale blue
 * under the pointer with grey text on it at 1.9:1. Every one of them looked correct in this
 * app's stylesheet, because what overrode them is not in this app's stylesheet — and none of
 * it shows up in a fixture that leaves Nextcloud's CSS out.
 *
 * So the requirement is stated once, here, for every class the templates put on a button:
 * whatever specificity the state needs, or `!important` where no reasonable stacking of one
 * class reaches it.
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
		if (statSync(full).isDirectory()) return entry === '__tests__' ? [] : sourcesUnder(full)
		return /\.(vue|css)$/.test(full) ? [full] : []
	})
}

const files = sourcesUnder(SRC).map((f) => [relative(SRC, f), readFileSync(f, 'utf8')])

/** Class names the templates put on a `<button>`. */
const buttonClasses = new Set(
	files.flatMap(([, text]) => [...text.matchAll(/<button\b[^>]*?class="([^"]+)"/gs)])
		.flatMap((m) => m[1].split(/\s+/))
		.filter((name) => /^[\w-]+$/.test(name)),
)

/** Declarations Nextcloud sets on buttons, and so competes for. */
const CONTESTED = /(?:^|\n)\s*(?:background|background-color|color|padding|border|border-radius|margin|font-weight)\s*:/

/** What each state has to beat, counted in classes plus pseudo-classes. */
const NEEDED = { rest: 2, hover: 3, active: 5 }

/**
 * Every rule that paints a button, with what it would need to win.
 *
 * @return {object[]} one entry per losing rule
 */
function losingRules() {
	return files.flatMap(([name, text]) =>
		[...text.matchAll(/([^\n{}]+)\{([^{}]*)\}/g)].flatMap((rule) => {
			const [, selectors, body] = rule
			if (!CONTESTED.test(body) || body.includes('!important')) return []
			return selectors.split(',').flatMap((selector) => {
				const sel = selector.trim()
				const first = /^\.([\w-]+)/.exec(sel)
				if (!first || !buttonClasses.has(first[1])) return []

				const score = (sel.match(/\.[\w-]+/g) || []).length
					+ (sel.match(/:(?!not|:)[a-z-]+/g) || []).length
				const state = sel.includes(':active') ? 'active'
					: (/:hover|:focus/.test(sel) ? 'hover' : 'rest')
				return score < NEEDED[state] ? [`${name} — ${sel} (${score}, needs ${NEEDED[state]})`] : []
			})
		}),
	)
}

describe('rules that style a button', () => {
	it('finds the buttons, so this guard cannot pass vacuously', () => {
		expect(buttonClasses.size).toBeGreaterThan(20)
	})

	it('outrank the rules Nextcloud applies to every button on the page', () => {
		expect(losingRules()).toEqual([])
	})
})
