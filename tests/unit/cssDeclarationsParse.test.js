/**
 * Every declaration's parentheses balance.
 *
 * A CSS declaration whose value does not parse is dropped by the browser, silently and
 * individually: the rule around it keeps working, the property just never applies. There
 * is no error, no warning, and nothing in the page that says a border is missing rather
 * than deliberately absent.
 *
 * This exists because a sweep in this branch produced exactly that, ten times. It
 * rewrote `var(--color-border, …)` to a token, matching the fallback with `[^)]*` — which
 * stops at the first `)`, and the fallbacks were `rgb(255 255 255 / 13%)`. Each rewrite
 * left the closing paren of the `rgb()` behind:
 *
 *     border: 1px solid var(--tdv-color-border));
 *
 * stylelint accepted all ten. So did the build, the unit tests and the browser specs; the
 * guard written for that very sweep passed too, because it checked which variable was
 * named and the variable was right. The nine borders and backgrounds simply stopped
 * being drawn.
 *
 * Counting brackets is a crude parse, and crude is the point: it costs nothing and it
 * catches the whole family of edit that leaves a value syntactically wrong.
 */

const { readFileSync, readdirSync, statSync } = require('fs')
const { join, relative } = require('path')

const SRC = join(__dirname, '..', '..', 'src')

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

const files = sourcesUnder(SRC).map((f) => ({
	name: relative(SRC, f).split('\\').join('/'),
	text: readFileSync(f, 'utf8'),
}))

/**
 * Lines holding a `var()` whose brackets do not balance.
 *
 * Scoped to lines containing `var(`, and to single lines: a declaration spanning lines is
 * legal CSS but is not what this is looking for, and counting across a whole file would
 * balance a stray paren against an unrelated one somewhere else.
 *
 * @param {string} text - file contents
 * @return {string[]} the offending lines
 */
function unbalanced(text) {
	return text.split('\n')
		.filter((line) => line.includes('var('))
		.filter((line) => (line.match(/\(/g) || []).length !== (line.match(/\)/g) || []).length)
		.map((line) => line.trim())
}

describe('css declarations parse', () => {
	it('scans the stylesheets, so this guard cannot pass vacuously', () => {
		expect(files.length).toBeGreaterThan(10)
		expect(files.filter((f) => f.text.includes('var(')).length).toBeGreaterThan(5)
	})

	it.each(files.map((f) => f.name))('%s has no unbalanced var() declaration', (name) => {
		expect(unbalanced(files.find((f) => f.name === name).text)).toEqual([])
	})
})
