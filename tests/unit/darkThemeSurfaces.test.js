/**
 * A dark rule cannot take its surface colour from a variable that follows the other theme.
 *
 * The app's theme is its own: `useTheme` resolves light/dark from the user's setting or
 * the system preference, independently of what Nextcloud is doing. So a Nextcloud in
 * light mode with the viewer in dark mode is an ordinary state, and in that state
 * `--color-main-background` is white. A rule inside `.theme--dark` that reaches for it is
 * asking the light theme what colour its dark background should be, and gets an answer.
 *
 * The fallback beside it looks like protection and is not. `var(--color-main-background,
 * #1e1e1e)` only reaches `#1e1e1e` where the variable is undefined, which on Nextcloud it
 * never is — so the dark value written there is documentation of an intent the rule
 * cannot carry out. That is what made this survive: the code says #1e1e1e, the screen
 * says white, and only one of them is in the file.
 *
 * Accent colours are exempt. Primary and the status colours are picked to work against
 * either surface, and are meant to stay the instance's own.
 */

const { readFileSync, readdirSync, statSync } = require('fs')
const { join, relative } = require('path')

const SRC = join(__dirname, '..', '..', 'src')

/** Variables whose value is the current theme's surface, and so flips with it. */
const SURFACE = /--(?:tdv-)?color-(?:main-background|main-text|border|background-[a-z-]+|text-[a-z-]+|surface[a-z-]*)/g

/**
 * Every stylesheet-bearing file under src.
 *
 * @param {string} dir - directory to walk
 * @return {string[]} absolute file paths
 */
function sourcesUnder(dir) {
	return readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry)
		if (statSync(full).isDirectory()) {
			return sourcesUnder(full)
		}
		return /\.(vue|css)$/.test(full) ? [full] : []
	})
}

/** Every rule whose selector carries the dark theme class, as [file, selector, body]. */
const darkRules = sourcesUnder(SRC).flatMap((full) => {
	const text = readFileSync(full, 'utf8')
	return [...text.matchAll(/([^\n}]*theme--dark[^\n{]*)\{([^}]*)\}/g)]
		.map((m) => [`${relative(SRC, full)} — ${m[1].trim()}`, m[2]])
})

describe('dark theme surfaces', () => {
	it('finds the dark rules, so this guard cannot pass vacuously', () => {
		expect(darkRules.length).toBeGreaterThan(10)
	})

	it.each(darkRules.map(([name]) => name))('%s sets its own surface colours', (name) => {
		const body = darkRules.find(([n]) => n === name)[1]
		expect([...body.matchAll(SURFACE)].map((m) => m[0])).toEqual([])
	})
})
